import { FormEvent, useEffect, useState } from 'react'
import { CheckCircle2, GraduationCap, Loader2 } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type PublicForm = { id: string; title: string; description: string; success_message: string }
type PublicQuestion = { id: string; label: string; help_text: string; question_type: string; options: string[]; is_required: boolean; sort_order: number }

const control = 'mt-2 w-full rounded-xl border border-purple-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-100'

export default function PublicApplicationFormPage() {
  const { slug = 'enrollment-application' } = useParams()
  const [form, setForm] = useState<PublicForm | null>(null)
  const [questions, setQuestions] = useState<PublicQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error: formError } = await supabase.from('application_forms')
        .select('id,title,description,success_message').eq('slug', slug).eq('is_published', true).maybeSingle()
      if (formError || !data) { setError(formError?.message || 'This form is not available.'); setLoading(false); return }
      const { data: qs, error: qError } = await supabase.from('application_form_questions')
        .select('id,label,help_text,question_type,options,is_required,sort_order').eq('form_id', data.id).eq('is_active', true).order('sort_order')
      if (qError) setError(qError.message)
      else { setForm(data); setQuestions((qs || []) as PublicQuestion[]) }
      setLoading(false)
    }
    load()
  }, [slug])

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!form) return
    setSaving(true); setError('')
    const { error: submitError } = await supabase.rpc('submit_public_application', {
      form_slug: slug,
      submitted_answers: answers,
    })
    if (submitError) { setError(submitError.message); setSaving(false); return }
    setDone(true); setSaving(false); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-purple-50"><Loader2 className="h-7 w-7 animate-spin text-purple-600" /></div>
  if (error && !form) return <div className="flex min-h-screen items-center justify-center bg-purple-50 p-6"><div className="max-w-lg rounded-2xl bg-white p-8 text-center shadow-xl"><h1 className="text-xl font-bold">Form unavailable</h1><p className="mt-2 text-sm text-slate-600">{error}</p></div></div>
  if (done) return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-white p-6"><div className="max-w-xl rounded-3xl border border-purple-100 bg-white p-10 text-center shadow-xl"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500"/><h1 className="mt-5 text-3xl font-bold text-slate-900">Application received</h1><p className="mt-3 text-slate-600">{form?.success_message}</p></div></div>

  return <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-100 px-4 py-10 sm:py-16">
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 rounded-3xl bg-gradient-to-r from-purple-700 to-violet-600 p-7 text-white shadow-xl sm:p-10">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><GraduationCap className="h-7 w-7"/></div>
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-purple-100">VA Success Academy</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{form?.title}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-purple-100">{form?.description}</p>
      </header>
      <form onSubmit={submit} className="space-y-5">
        {questions.map((q, index) => <section key={q.id} className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-6">
          <label className="text-sm font-semibold text-slate-900"><span className="mr-2 text-purple-600">{index + 1}.</span>{q.label}{q.is_required && <span className="ml-1 text-rose-500">*</span>}</label>
          {q.help_text && <p className="mt-1 text-xs text-slate-500">{q.help_text}</p>}
          {q.question_type === 'textarea' ? <textarea required={q.is_required} rows={5} className={control} value={String(answers[q.id] || '')} onChange={e => setAnswers(a => ({...a,[q.id]:e.target.value}))}/>
          : q.question_type === 'select' ? <select required={q.is_required} className={control} value={String(answers[q.id] || '')} onChange={e => setAnswers(a => ({...a,[q.id]:e.target.value}))}><option value="">Select an option</option>{q.options.map(o => <option key={o}>{o}</option>)}</select>
          : q.question_type === 'radio' ? <div className="mt-3 grid gap-2">{q.options.map(o => <label key={o} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-purple-300"><input type="radio" name={q.id} value={o} required={q.is_required} checked={answers[q.id] === o} onChange={() => setAnswers(a => ({...a,[q.id]:o}))}/><span className="text-sm">{o}</span></label>)}</div>
          : q.question_type === 'checkbox' ? <div className="mt-3 grid gap-2">{q.options.map(o => { const selected = Array.isArray(answers[q.id]) ? answers[q.id] as string[] : []; return <label key={o} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-purple-300"><input type="checkbox" value={o} checked={selected.includes(o)} onChange={e => setAnswers(a => ({...a,[q.id]:e.target.checked ? [...selected,o] : selected.filter(x=>x!==o)}))}/><span className="text-sm">{o}</span></label>})}</div>
          : <input required={q.is_required} type={q.question_type === 'email' ? 'email' : q.question_type === 'phone' ? 'tel' : q.question_type === 'number' ? 'number' : 'text'} className={control} value={String(answers[q.id] || '')} onChange={e => setAnswers(a => ({...a,[q.id]:e.target.value}))}/>}</section>)}
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        <button disabled={saving} className="flex w-full items-center justify-center rounded-2xl bg-purple-700 px-6 py-4 font-semibold text-white shadow-lg transition hover:bg-purple-800 disabled:opacity-60">{saving && <Loader2 className="mr-2 h-5 w-5 animate-spin"/>}Submit application</button>
        <p className="pb-6 text-center text-xs text-slate-500">Your information will only be used to review your VA Success Academy application.</p>
      </form>
    </div>
  </div>
}
