import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Lock, MessageCircleQuestion, Plus, Send, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { isStaff } from '../lib/access'
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, SectionHeading,
  Select, Spinner, Textarea,
} from '../components/ui'
import { formatDateTime, QUESTION_STATUS_LABEL, readableError, relativeDays } from '../lib/utils'
import type { Course, Lesson, Profile, Question, QuestionReply, QuestionStatus } from '../lib/types'

const STATUS_TONE: Record<QuestionStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  new: 'warning', in_review: 'info', answered: 'success', needs_information: 'warning', closed: 'neutral',
}

type Audience = 'private_coach' | 'coach_team' | 'general'

export default function QuestionsPage() {
  const { profile, role } = useAuth()
  const { notify } = useToast()
  const staff = isStaff(role)
  const [params] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<'all' | QuestionStatus>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [draft, setDraft] = useState({
    course_id: params.get('course') ?? '', lesson_id: params.get('lesson') ?? '',
    subject: '', details: '', audience: 'coach_team' as Audience, assigned_to: '',
  })

  const state = useAsyncData<{ questions: Question[]; courses: Course[]; lessons: Lesson[]; coaches: Pick<Profile,'id'|'full_name'|'email'|'avatar_url'>[] }>(async () => {
    const [questions, courses, lessons, coaches] = await Promise.all([
      supabase.from('questions')
        .select(staff
          ? `*,courses(id,title),lessons(id,title),student:profiles!questions_student_id_fkey(id,full_name,email),assigned_coach:profiles!questions_assigned_to_fkey(id,full_name,email,avatar_url)`
          : `*,courses(id,title),lessons(id,title),assigned_coach:profiles!questions_assigned_to_fkey(id,full_name,email,avatar_url)`)
        .order('created_at', { ascending: false }),
      supabase.from('courses').select('id, title, slug, level').order('level').order('sort_order'),
      supabase.from('lessons').select('id, title, course_id').order('sort_order'),
      supabase.rpc('get_active_coach_directory'),
    ])
    if (questions.error) throw questions.error
    if (coaches.error) throw coaches.error
    return { questions: (questions.data ?? []) as unknown as Question[], courses: (courses.data ?? []) as Course[], lessons: (lessons.data ?? []) as Lesson[], coaches: (coaches.data ?? []) as Pick<Profile,'id'|'full_name'|'email'|'avatar_url'>[] }
  }, [profile?.id])

  const repliesState = useAsyncData<QuestionReply[]>(async () => {
    if (!selected) return []
    const { data, error } = await supabase.from('question_replies')
      .select('*, author:profiles!question_replies_author_id_fkey(id, full_name, role)')
      .eq('question_id', selected).order('created_at')
    if (error) throw error
    if (profile?.role === 'student') await supabase.rpc('mark_question_read', { target_question_id: selected })
    return (data ?? []) as QuestionReply[]
  }, [selected])

  const filtered = useMemo(() => {
    const rows = state.data?.questions ?? []
    return statusFilter === 'all' ? rows : rows.filter((q) => q.status === statusFilter)
  }, [state.data, statusFilter])
  const current = filtered.find((q) => q.id === selected) ?? (state.data?.questions ?? []).find((q) => q.id === selected) ?? null

  const submitQuestion = async () => {
    if (!profile) return
    if (draft.audience === 'private_coach' && !draft.assigned_to) { notify('Select the coach who should receive this private question.','error'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('questions').insert({
        student_id: profile.id, course_id: draft.course_id || null, lesson_id: draft.lesson_id || null,
        subject: draft.subject.trim(), details: draft.details.trim(), audience: draft.audience,
        assigned_to: draft.audience === 'private_coach' ? draft.assigned_to : null,
      })
      if (error) throw error
      notify(draft.audience === 'general' ? 'General question posted anonymously.' : 'Private question sent.')
      setAsking(false)
      setDraft({ course_id:'', lesson_id:'', subject:'', details:'', audience:'coach_team', assigned_to:'' })
      state.reload()
    } catch (error) { notify(readableError(error), 'error') } finally { setSaving(false) }
  }

  const sendReply = async () => {
    if (!profile || !current || !replyBody.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('question_replies').insert({ question_id: current.id, author_id: profile.id, body: replyBody.trim(), is_internal: staff ? internal : false })
      if (error) throw error
      if (staff && !internal && current.status !== 'answered') await supabase.from('questions').update({ status: 'answered' }).eq('id', current.id)
      setReplyBody(''); setInternal(false); notify('Reply posted.'); repliesState.reload(); state.reload()
    } catch (error) { notify(readableError(error), 'error') } finally { setSaving(false) }
  }

  const changeStatus = async (status: QuestionStatus) => {
    if (!current) return
    const { error } = await supabase.from('questions').update({ status }).eq('id', current.id)
    if (error) notify(readableError(error),'error'); else { notify(`Marked as ${QUESTION_STATUS_LABEL[status].toLowerCase()}.`); state.reload() }
  }

  if (state.loading) return <Spinner label="Loading questions" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const lessonsForCourse = state.data!.lessons.filter((l) => !draft.course_id || l.course_id === draft.course_id)
  const audienceLabel = (q: Question) => q.audience === 'general' ? 'General Q&A' : q.audience === 'private_coach' ? 'Private to coach' : 'Private to coaches'

  return <>
    <PageHeader title={staff ? 'Student questions' : 'Questions'}
      description={staff ? 'Answer general and private questions. Private student details stay protected.' : 'Ask anonymously in General Q&A, privately to the coaching team, or privately to one coach.'}
      action={!staff && <Button onClick={()=>setAsking(true)}><Plus className="h-4 w-4"/>Ask a question</Button>} />
    <div className="mb-5 max-w-xs"><Select value={statusFilter} aria-label="Filter by status" onChange={e=>setStatusFilter(e.target.value as 'all'|QuestionStatus)}><option value="all">All statuses</option>{(Object.keys(QUESTION_STATUS_LABEL) as QuestionStatus[]).map(s=><option key={s} value={s}>{QUESTION_STATUS_LABEL[s]}</option>)}</Select></div>
    {filtered.length===0 ? <EmptyState icon={MessageCircleQuestion} title={staff?'No questions in this view':'You have not asked anything yet'} description={staff?'Nothing matches that filter.':'Ask publicly without your name, or choose a private option.'} action={!staff?<Button onClick={()=>setAsking(true)}>Ask your first question</Button>:undefined}/> :
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-2">{filtered.map(q=><button key={q.id} type="button" onClick={()=>setSelected(q.id)} className={`card w-full p-4 text-left transition-colors hover:border-brand-200 ${selected===q.id?'border-brand-300 bg-brand-50/50':''}`}>
        <div className="flex items-start justify-between gap-2"><p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{q.subject}</p><Badge tone={STATUS_TONE[q.status]}>{QUESTION_STATUS_LABEL[q.status]}</Badge></div>
        <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{q.details}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft"><span>{q.audience==='general'?<Users className="inline h-3 w-3"/>:<Lock className="inline h-3 w-3"/>} {audienceLabel(q)}</span><span>·</span>{staff && q.student && q.audience!=='general' && <><span>{q.student.full_name}</span><span>·</span></>}<span>{q.courses?.title??'General'}</span><span>·</span><span>{relativeDays(q.created_at)}</span></div>
      </button>)}</div>
      <div>{!current?<EmptyState icon={MessageCircleQuestion} title="Select a question" description="Choose a question on the left to read the thread."/>:<Card>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2"><Badge tone={current.audience==='general'?'info':'neutral'}>{audienceLabel(current)}</Badge></div><h2 className="text-lg font-semibold text-ink">{current.subject}</h2><p className="mt-1 text-xs text-ink-soft">{current.courses?.title??'General'}{current.lessons?` · ${current.lessons.title}`:''} · {formatDateTime(current.created_at)}</p>{staff && current.audience==='private_coach' && <p className="mt-1 text-xs text-ink-muted">Assigned to {current.assigned_coach?.full_name??'selected coach'}</p>}</div>{staff&&<Select value={current.status} aria-label="Question status" onChange={e=>changeStatus(e.target.value as QuestionStatus)} className="w-44">{(Object.keys(QUESTION_STATUS_LABEL) as QuestionStatus[]).map(s=><option key={s} value={s}>{QUESTION_STATUS_LABEL[s]}</option>)}</Select>}</div>
        <p className="prose-lesson mt-4 rounded-xl bg-canvas px-4 py-3">{current.details}</p>
        <div className="mt-6"><SectionHeading title="Replies"/>{repliesState.loading?<Spinner label="Loading replies"/>:(repliesState.data??[]).length===0?<p className="text-sm text-ink-muted">No replies yet.</p>:<ul className="space-y-3">{(repliesState.data??[]).map(r=><li key={r.id} className={`rounded-xl border px-4 py-3 ${r.is_internal?'border-amber-200 bg-amber-50':'border-canvas-line bg-white'}`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-ink">{r.author?.full_name??'Coach'}</p>{r.is_internal&&<Badge tone="warning">Internal note</Badge>}</div><p className="prose-lesson mt-1.5">{r.body}</p><p className="mt-1.5 text-[11px] text-ink-soft">{formatDateTime(r.created_at)}</p></li>)}</ul>}</div>
        {current.status!=='closed'&&<div className="mt-5 border-t border-canvas-line pt-4"><Textarea label={staff?'Write a reply':'Add to this thread'} value={replyBody} onChange={e=>setReplyBody(e.target.value)}/><div className="mt-3 flex flex-wrap items-center justify-between gap-3">{staff&&<label className="flex items-center gap-2 text-sm text-ink-muted"><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)}/>Internal note — students never see this</label>}<Button onClick={sendReply} loading={saving} disabled={!replyBody.trim()}><Send className="h-4 w-4"/>Post reply</Button></div></div>}
      </Card>}</div>
    </div>}
    <Modal open={asking} onClose={()=>setAsking(false)} wide title="Ask a question" description="Choose who may see it. General questions are displayed anonymously to other students." footer={<><Button variant="outline" onClick={()=>setAsking(false)}>Cancel</Button><Button onClick={submitQuestion} loading={saving} disabled={!draft.subject.trim()||!draft.details.trim()}>Send question</Button></>}>
      <div className="space-y-4"><Select label="Who can see this question?" value={draft.audience} onChange={e=>setDraft({...draft,audience:e.target.value as Audience,assigned_to:''})}><option value="general">General Q&A — all students can learn from it, your name is hidden</option><option value="coach_team">Private — coaching team only</option><option value="private_coach">Private — one coach only</option></Select>{draft.audience==='private_coach'&&<div><p className="mb-2 text-sm font-medium text-ink">Choose coach</p><div className="grid gap-2 sm:grid-cols-2">{state.data!.coaches.length===0?<p className="rounded-xl border border-canvas-line p-3 text-sm text-ink-muted">No active coaches are available. Ask an owner or manager to activate a coach account.</p>:state.data!.coaches.map(c=>{const coachName=c.full_name?.trim()||c.email?.split('@')[0]||'Coach';const chosen=draft.assigned_to===c.id;return <button key={c.id} type="button" onClick={()=>setDraft({...draft,assigned_to:c.id})} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${chosen?'border-brand-500 bg-brand-50 ring-2 ring-brand-200':'border-canvas-line hover:border-brand-300'}`}><img src={c.avatar_url||'/avatars/coach-neutral.svg'} alt="" className="h-10 w-10 rounded-xl object-cover"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{coachName}</span><span className="block truncate text-xs text-ink-muted">{c.email}</span></span><span className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${chosen?'border-brand-600 bg-brand-600 text-white':'border-canvas-line'}`}>{chosen?'✓':''}</span></button>})}</div></div>}<Select label="Course" value={draft.course_id} onChange={e=>setDraft({...draft,course_id:e.target.value,lesson_id:''})}><option value="">General question</option>{state.data!.courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</Select><Select label="Lesson" value={draft.lesson_id} onChange={e=>setDraft({...draft,lesson_id:e.target.value})}><option value="">Not lesson-specific</option>{lessonsForCourse.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</Select><Input label="Subject" required value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/><Textarea label="Details" required value={draft.details} onChange={e=>setDraft({...draft,details:e.target.value})}/></div>
    </Modal>
  </>
}
