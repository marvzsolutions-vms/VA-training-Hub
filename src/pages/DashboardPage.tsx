import { Link } from 'react-router-dom'
import {
  BookOpen, GraduationCap, Users, Video, Megaphone, Lock, ArrowRight, MessageCircleQuestion,
  FolderOpen, Layers, TrendingUp, ShieldCheck, Plus, Presentation, UserPlus, AlertTriangle,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import {
  Badge, Button, Card, EmptyState, ErrorState, PageHeader, ProgressBar, SectionHeading,
  Spinner, StatCard,
} from '../components/ui'
import {
  formatDate, formatTime, LEVEL_SHORT, relativeDays, STATUS_LABEL,
} from '../lib/utils'
import type {
  Announcement, Course, Enrollment, LessonProgress, LiveSession, Profile, Question,
} from '../lib/types'

export default function DashboardPage() {
  const { profile } = useAuth()
  if (!profile) return <Spinner />
  if (profile.role === 'student') return <StudentDashboard />
  if (profile.role === 'coach') return <CoachDashboard />
  if (profile.role === 'manager') return <ManagerDashboard />
  return <OwnerDashboard />
}

/* ============================== STUDENT ================================= */

interface StudentData {
  enrollments: Enrollment[]
  progress: (LessonProgress & { lessons: { id: string; title: string; course_id: string } | null })[]
  sessions: LiveSession[]
  announcements: Announcement[]
  lockedCourses: Course[]
  replies: { id: string; body: string; created_at: string; question_id: string }[]
}

function StudentDashboard() {
  const { profile, student, specializationIds } = useAuth()
  const state = useAsyncData<StudentData>(async () => {
    if (!profile) throw new Error('No profile loaded')
    const [enrollments, progress, sessions, announcements, lockedCourses, questions] = await Promise.all([
      supabase.from('course_enrollments')
        .select('*, courses(*)').eq('student_id', profile.id).order('enrolled_at'),
      supabase.from('lesson_progress')
        .select('*, lessons(id, title, course_id)')
        .eq('student_id', profile.id).order('last_activity_at', { ascending: false }).limit(30),
      supabase.from('live_sessions')
        .select('*, courses(id, title), batches(id, code, name)')
        .gte('session_date', new Date().toISOString().slice(0, 10))
        .order('session_date').limit(4),
      supabase.from('announcements')
        .select('*').eq('is_active', true).order('publish_at', { ascending: false }).limit(4),
      supabase.from('courses')
        .select('*').eq('level', 'level_3').eq('is_published', true).order('sort_order').limit(4),
      supabase.from('questions').select('id').eq('student_id', profile.id),
    ])
    const questionIds = (questions.data ?? []).map((q: { id: string }) => q.id)
    const replies = questionIds.length
      ? await supabase.from('question_replies')
          .select('id, body, created_at, question_id')
          .in('question_id', questionIds).eq('is_internal', false)
          .order('created_at', { ascending: false }).limit(3)
      : { data: [] }

    return {
      enrollments: (enrollments.data ?? []) as StudentData['enrollments'],
      progress: (progress.data ?? []) as StudentData['progress'],
      sessions: (sessions.data ?? []) as LiveSession[],
      announcements: (announcements.data ?? []) as Announcement[],
      lockedCourses: (lockedCourses.data ?? []) as Course[],
      replies: (replies.data ?? []) as StudentData['replies'],
    }
  }, [profile?.id])

  if (state.loading) return <Spinner label="Loading your dashboard" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const data = state.data!

  const overall = data.enrollments.length
    ? data.enrollments.reduce((sum, e) => sum + Number(e.progress), 0) / data.enrollments.length
    : 0
  const completedLessons = data.progress.filter((p) => p.is_completed).length
  const inProgress = data.enrollments.filter((e) => Number(e.progress) > 0 && Number(e.progress) < 100)
  const continueCourse = inProgress[0] ?? data.enrollments[0]
  const recentLessons = data.progress.slice(0, 5)

  return (
    <>
      <PageHeader
        eyebrow={student ? LEVEL_SHORT[student.current_level] : undefined}
        title={`Kumusta, ${profile?.full_name.split(' ')[0] ?? 'there'}`}
        description={student?.recommended_next_step}
        action={continueCourse?.courses && (
          <Link to={`/courses/${continueCourse.courses.slug}`}>
            <Button>Continue learning<ArrowRight className="h-4 w-4" aria-hidden /></Button>
          </Link>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Overall progress" value={`${Math.round(overall)}%`}
          hint={`${data.enrollments.length} courses enrolled`} icon={TrendingUp} />
        <StatCard label="Level progress" value={`${Math.round(student?.level_progress ?? 0)}%`}
          hint={student ? LEVEL_SHORT[student.current_level] : ''} icon={GraduationCap} tone="info" />
        <StatCard label="Lessons completed" value={completedLessons}
          hint={`Last active ${relativeDays(student?.last_activity_at)}`} icon={BookOpen} tone="success" />
        <StatCard label="Account status" value={STATUS_LABEL[student?.access_status ?? 'active']}
          hint={specializationIds.length ? `${specializationIds.length} specialization(s)` : 'No specialization yet'}
          icon={ShieldCheck} tone={student?.access_status === 'active' ? 'success' : 'warning'} />
      </div>

      {student && (student.level2_eligible || student.level3_eligible) && (
        <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-brand-900">
                You are eligible for {student.level3_eligible ? 'Level 3' : 'Level 2'}
              </h2>
              <p className="mt-0.5 text-sm text-brand-800">
                Ask your Manager to unlock the next level and choose your specialization.
              </p>
            </div>
            <Link to="/questions">
              <Button variant="secondary">Request an upgrade</Button>
            </Link>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeading title="Your courses" description="Everything you are currently enrolled in."
            action={<Link to="/courses"><Button variant="ghost" size="sm">View all</Button></Link>} />
          {data.enrollments.length === 0 ? (
            <EmptyState icon={BookOpen} title="No courses yet"
              description="Your Manager has not enrolled you in a course. Send them a message and they will set you up." />
          ) : (
            <div className="space-y-3">
              {data.enrollments.slice(0, 5).map((enrollment) => (
                <Link key={enrollment.id} to={`/courses/${enrollment.courses?.slug}`}
                  className="card block p-4 transition-shadow hover:shadow-pop">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-ink">{enrollment.courses?.title}</h3>
                      <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{enrollment.courses?.description}</p>
                    </div>
                    <Badge tone={enrollment.status === 'completed' ? 'success' : 'brand'}>
                      {STATUS_LABEL[enrollment.status]}
                    </Badge>
                  </div>
                  <div className="mt-3"><ProgressBar value={Number(enrollment.progress)} label="Course progress" /></div>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-8">
            <SectionHeading title="Recently opened lessons" />
            {recentLessons.length === 0 ? (
              <EmptyState icon={BookOpen} title="No lesson activity yet"
                description="Open your first lesson and it will show up here." />
            ) : (
              <Card className="divide-y divide-canvas-line p-0">
                {recentLessons.map((row) => (
                  <Link key={row.id} to={`/lessons/${row.lesson_id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-50/40">
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {row.lessons?.title ?? 'Lesson'}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {row.is_completed && <Badge tone="success">Completed</Badge>}
                      <span className="text-xs text-ink-soft">{relativeDays(row.last_activity_at)}</span>
                    </span>
                  </Link>
                ))}
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <SectionHeading title="Upcoming sessions" />
            {data.sessions.length === 0 ? (
              <EmptyState icon={Video} title="Nothing scheduled"
                description="Live sessions for your batch will appear here." />
            ) : (
              <div className="space-y-3">
                {data.sessions.map((session) => (
                  <Card key={session.id} className="p-4">
                    <p className="text-sm font-semibold text-ink">{session.title}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {formatDate(session.session_date)} · {formatTime(session.start_time)} {session.time_zone}
                    </p>
                    <Link to="/sessions" className="mt-3 inline-block">
                      <Button size="sm" variant="secondary">Session details</Button>
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionHeading title="Announcements" />
            {data.announcements.length === 0 ? (
              <EmptyState icon={Megaphone} title="No announcements" />
            ) : (
              <Card className="divide-y divide-canvas-line p-0">
                {data.announcements.map((a) => (
                  <div key={a.id} className="px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{a.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{a.message}</p>
                    <p className="mt-1.5 text-[11px] text-ink-soft">{formatDate(a.publish_at)}</p>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {data.replies.length > 0 && (
            <div>
              <SectionHeading title="Coach replies" />
              <Card className="divide-y divide-canvas-line p-0">
                {data.replies.map((reply) => (
                  <Link key={reply.id} to="/questions" className="block px-4 py-3 hover:bg-brand-50/40">
                    <p className="line-clamp-2 text-sm text-ink-muted">{reply.body}</p>
                    <p className="mt-1 text-[11px] text-ink-soft">{relativeDays(reply.created_at)}</p>
                  </Link>
                ))}
              </Card>
            </div>
          )}

          <div>
            <SectionHeading title="Advanced training" description="Locked until a Manager grants access." />
            <div className="space-y-2">
              {data.lockedCourses.map((course) => (
                <Link key={course.id} to={`/courses/${course.slug}`}
                  className="card flex items-center gap-3 p-3.5 hover:shadow-pop">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-soft">
                    <Lock className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{course.title}</span>
                    <span className="block text-xs text-ink-soft">{LEVEL_SHORT[course.level]}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* =============================== COACH ================================== */

function QuickActions({ actions }: { actions: Array<{ label: string; to: string; icon: React.ElementType }> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((action) => (
        <Link key={action.label} to={action.to}
          className="card flex items-center gap-3 p-3.5 text-sm font-medium text-ink hover:shadow-pop">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <action.icon className="h-4 w-4" aria-hidden />
          </span>
          {action.label}
        </Link>
      ))}
    </div>
  )
}

interface StaffData {
  students: Array<{ user_id: string; access_status: string; current_level: string; last_activity_at: string | null; profiles: Pick<Profile, 'id' | 'full_name' | 'email'> | null }>
  questions: Question[]
  sessions: LiveSession[]
  resourcesNeedingReview: Array<{ id: string; title: string; last_reviewed_at: string | null }>
  recentResources: Array<{ id: string; title: string; created_at: string }>
  enrollments: Array<{ progress: number; status: string }>
}

async function loadStaffData(): Promise<StaffData> {
  const [students, questions, sessions, review, recent, enrollments] = await Promise.all([
    supabase.from('student_profiles')
      .select('user_id, access_status, current_level, last_activity_at, profiles!student_profiles_user_id_fkey!inner(id, full_name, email)'),
    supabase.from('questions')
      .select('*, student:profiles!questions_student_id_fkey(id, full_name, email), courses(id, title)')
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('live_sessions')
      .select('*, courses(id, title), batches(id, code, name)')
      .gte('session_date', new Date().toISOString().slice(0, 10)).order('session_date').limit(5),
    supabase.from('resources').select('id, title, last_reviewed_at')
      .in('review_status', ['needs_review', 'outdated']).limit(10),
    supabase.from('resources').select('id, title, created_at')
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('course_enrollments').select('progress, status'),
  ])
  return {
    students: (students.data ?? []) as unknown as StaffData['students'],
    questions: (questions.data ?? []) as Question[],
    sessions: (sessions.data ?? []) as LiveSession[],
    resourcesNeedingReview: (review.data ?? []) as StaffData['resourcesNeedingReview'],
    recentResources: (recent.data ?? []) as StaffData['recentResources'],
    enrollments: (enrollments.data ?? []) as StaffData['enrollments'],
  }
}

function isStale(value: string | null): boolean {
  if (!value) return true
  return Date.now() - new Date(value).getTime() > 14 * 86_400_000
}

function CoachDashboard() {
  const { profile } = useAuth()
  const state = useAsyncData(loadStaffData, [profile?.id])
  if (state.loading) return <Spinner label="Loading your dashboard" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const data = state.data!

  const active = data.students.filter((s) => s.access_status === 'active').length
  const quiet = data.students.filter((s) => isStale(s.last_activity_at))
  const unanswered = data.questions.filter((q) => ['new', 'in_review', 'needs_information'].includes(q.status))
  const avgCompletion = data.enrollments.length
    ? data.enrollments.reduce((sum, e) => sum + Number(e.progress), 0) / data.enrollments.length
    : 0

  return (
    <>
      <PageHeader eyebrow="Coach" title="Teaching overview"
        description="Where your students are, and what needs your attention today." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assigned students" value={data.students.length} icon={GraduationCap} />
        <StatCard label="Active students" value={active} icon={Users} tone="success" />
        <StatCard label="No recent activity" value={quiet.length} hint="14+ days quiet"
          icon={AlertTriangle} tone="warning" />
        <StatCard label="Average completion" value={`${Math.round(avgCompletion)}%`} icon={TrendingUp} tone="info" />
      </div>

      <div className="mt-8">
        <SectionHeading title="Quick actions" />
        <QuickActions actions={[
          { label: 'Create a course', to: '/builder', icon: Plus },
          { label: 'Create a lesson', to: '/builder', icon: BookOpen },
          { label: 'Add a resource', to: '/resources', icon: FolderOpen },
          { label: 'Add a tool', to: '/tools', icon: Layers },
          { label: 'Post an announcement', to: '/announcements', icon: Megaphone },
          { label: 'Open presentation mode', to: '/builder', icon: Presentation },
        ]} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading title="Unanswered questions"
            action={<Link to="/questions"><Button variant="ghost" size="sm">Open queue</Button></Link>} />
          {unanswered.length === 0 ? (
            <EmptyState icon={MessageCircleQuestion} title="Queue is clear"
              description="Every student question has a reply." />
          ) : (
            <Card className="divide-y divide-canvas-line p-0">
              {unanswered.slice(0, 6).map((q) => (
                <Link key={q.id} to="/questions" className="block px-4 py-3 hover:bg-brand-50/40">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-ink">{q.subject}</p>
                    <Badge tone={q.status === 'new' ? 'warning' : 'info'}>{q.status.replace('_', ' ')}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {q.student?.full_name} · {relativeDays(q.created_at)}
                  </p>
                </Link>
              ))}
            </Card>
          )}
        </div>

        <div>
          <SectionHeading title="Students who went quiet" />
          {quiet.length === 0 ? (
            <EmptyState icon={Users} title="Everyone is active" description="No student has been idle for 14 days." />
          ) : (
            <Card className="divide-y divide-canvas-line p-0">
              {quiet.slice(0, 6).map((s) => (
                <Link key={s.user_id} to={`/students/${s.user_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-50/40">
                  <span className="min-w-0 truncate text-sm font-medium text-ink">{s.profiles?.full_name}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{relativeDays(s.last_activity_at)}</span>
                </Link>
              ))}
            </Card>
          )}
        </div>

        <div>
          <SectionHeading title="Upcoming Zoom sessions" />
          {data.sessions.length === 0 ? (
            <EmptyState icon={Video} title="No sessions scheduled" />
          ) : (
            <Card className="divide-y divide-canvas-line p-0">
              {data.sessions.map((s) => (
                <div key={s.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-ink">{s.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {formatDate(s.session_date)} · {formatTime(s.start_time)} · {s.batches?.code ?? 'All batches'}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div>
          <SectionHeading title="Resources needing review" />
          {data.resourcesNeedingReview.length === 0 ? (
            <EmptyState icon={FolderOpen} title="Library is current"
              description="Nothing is flagged for review." />
          ) : (
            <Card className="divide-y divide-canvas-line p-0">
              {data.resourcesNeedingReview.map((r) => (
                <Link key={r.id} to="/resources" className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-50/40">
                  <span className="min-w-0 truncate text-sm font-medium text-ink">{r.title}</span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    Reviewed {r.last_reviewed_at ? formatDate(r.last_reviewed_at) : 'never'}
                  </span>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

/* ============================== MANAGER ================================= */

function ManagerDashboard() {
  const state = useAsyncData(async () => {
    const [staff, batches, activity] = await Promise.all([
      loadStaffData(),
      supabase.from('batches')
        .select('*, coach:profiles!batches_coach_id_fkey(id, full_name, email)')
        .eq('is_active', true).order('start_date'),
      supabase.from('activity_logs')
        .select('*, user:profiles!activity_logs_user_id_fkey(full_name, role)')
        .order('created_at', { ascending: false }).limit(8),
    ])
    return {
      ...staff,
      batches: (batches.data ?? []) as Array<{ id: string; code: string; name: string; start_date: string | null }>,
      activity: (activity.data ?? []) as Array<{ id: string; action: string; detail: string; created_at: string }>,
    }
  }, [])

  if (state.loading) return <Spinner label="Loading academy overview" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const data = state.data!

  const byLevel = {
    level_1: data.students.filter((s) => s.current_level === 'level_1').length,
    level_2: data.students.filter((s) => s.current_level === 'level_2').length,
    level_3: data.students.filter((s) => s.current_level === 'level_3').length,
  }
  const active = data.students.filter((s) => s.access_status === 'active').length
  const inactive = data.students.length - active
  const avgCompletion = data.enrollments.length
    ? data.enrollments.reduce((sum, e) => sum + Number(e.progress), 0) / data.enrollments.length
    : 0

  return (
    <>
      <PageHeader eyebrow="Manager" title="Academy operations"
        description="Enrolment, access and progress across every batch." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total students" value={data.students.length} icon={GraduationCap} />
        <StatCard label="Active" value={active} icon={Users} tone="success" />
        <StatCard label="Inactive" value={inactive} icon={AlertTriangle} tone="warning" />
        <StatCard label="Average completion" value={`${Math.round(avgCompletion)}%`} icon={TrendingUp} tone="info" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Level 1" value={byLevel.level_1} icon={BookOpen} />
        <StatCard label="Level 2" value={byLevel.level_2} icon={BookOpen} tone="info" />
        <StatCard label="Level 3" value={byLevel.level_3} icon={BookOpen} tone="brand" />
      </div>

      <div className="mt-8">
        <SectionHeading title="Quick actions" />
        <QuickActions actions={[
          { label: 'Add a student', to: '/users', icon: UserPlus },
          { label: 'Enrol a student', to: '/enrollments', icon: BookOpen },
          { label: 'Create a batch', to: '/batches', icon: Layers },
          { label: 'Upgrade a student', to: '/access', icon: ShieldCheck },
          { label: 'Add a resource', to: '/resources', icon: FolderOpen },
          { label: 'Post an announcement', to: '/announcements', icon: Megaphone },
        ]} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading title="Current batches"
            action={<Link to="/batches"><Button variant="ghost" size="sm">Manage</Button></Link>} />
          {data.batches.length === 0 ? (
            <EmptyState icon={Layers} title="No active batches"
              description="Create a batch to group students under a coach."
              action={<Link to="/batches"><Button size="sm">Create a batch</Button></Link>} />
          ) : (
            <Card className="divide-y divide-canvas-line p-0">
              {data.batches.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{b.name}</p>
                    <p className="text-xs text-ink-soft">{b.code}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-soft">{formatDate(b.start_date)}</span>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div>
          <SectionHeading title="Recent account activity" />
          <Card className="divide-y divide-canvas-line p-0">
            {data.activity.map((entry) => (
              <div key={entry.id} className="px-4 py-3">
                <p className="text-sm text-ink">{entry.detail || entry.action}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{relativeDays(entry.created_at)}</p>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  )
}

/* =============================== OWNER ================================== */

function OwnerDashboard() {
  const state = useAsyncData(async () => {
    const [profiles, students, courses, batches, activity, review, enrollments] = await Promise.all([
      supabase.from('profiles').select('id, role, created_at, is_active'),
      supabase.from('student_profiles').select('current_level, access_status'),
      supabase.from('courses').select('id, level, is_published'),
      supabase.from('batches').select('id').eq('is_active', true),
      supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(8),
      supabase.from('resources').select('id').in('review_status', ['needs_review', 'outdated']),
      supabase.from('course_enrollments').select('progress'),
    ])
    return {
      profiles: (profiles.data ?? []) as Array<{ id: string; role: string; created_at: string; is_active: boolean }>,
      students: (students.data ?? []) as Array<{ current_level: string; access_status: string }>,
      courses: (courses.data ?? []) as Array<{ id: string; level: string; is_published: boolean }>,
      batches: (batches.data ?? []).length,
      activity: (activity.data ?? []) as Array<{ id: string; action: string; detail: string; created_at: string }>,
      review: (review.data ?? []).length,
      enrollments: (enrollments.data ?? []) as Array<{ progress: number }>,
    }
  }, [])

  if (state.loading) return <Spinner label="Loading system overview" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const data = state.data!

  const count = (role: string) => data.profiles.filter((p) => p.role === role).length
  const avgCompletion = data.enrollments.length
    ? data.enrollments.reduce((s, e) => s + Number(e.progress), 0) / data.enrollments.length
    : 0

  const growth = Array.from({ length: 6 }, (_, i) => {
    const date = new Date()
    date.setMonth(date.getMonth() - (5 - i))
    const key = date.toLocaleDateString('en-PH', { month: 'short' })
    const users = data.profiles.filter((p) => {
      const created = new Date(p.created_at)
      return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth()
    }).length
    return { month: key, users }
  })

  const byLevel = [
    { level: 'Level 1', students: data.students.filter((s) => s.current_level === 'level_1').length },
    { level: 'Level 2', students: data.students.filter((s) => s.current_level === 'level_2').length },
    { level: 'Level 3', students: data.students.filter((s) => s.current_level === 'level_3').length },
  ]

  return (
    <>
      <PageHeader eyebrow="Owner" title="System overview"
        description="Everything happening across VA Success Academy." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={count('student')} icon={GraduationCap} />
        <StatCard label="Coaches" value={count('coach')} icon={Users} tone="info" />
        <StatCard label="Managers" value={count('manager')} icon={ShieldCheck} tone="brand" />
        <StatCard label="Active batches" value={data.batches} icon={Layers} tone="success" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Published courses" value={data.courses.filter((c) => c.is_published).length}
          hint={`${data.courses.length} total`} icon={BookOpen} />
        <StatCard label="Average completion" value={`${Math.round(avgCompletion)}%`} icon={TrendingUp} tone="info" />
        <StatCard label="Resources to review" value={data.review} icon={FolderOpen}
          tone={data.review > 0 ? 'warning' : 'success'} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading title="New accounts by month" description="Last six months." />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growth} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e6f0" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false}
                  tick={{ fontSize: 12, fill: '#8b8898' }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false}
                  tick={{ fontSize: 12, fill: '#8b8898' }} />
                <Tooltip cursor={{ fill: '#f6f4ff' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e8e6f0', fontSize: 12 }} />
                <Bar dataKey="users" fill="#845ef7" radius={[6, 6, 0, 0]} name="New accounts" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionHeading title="Students by level" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byLevel} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e6f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false}
                  tick={{ fontSize: 12, fill: '#8b8898' }} />
                <YAxis type="category" dataKey="level" width={64} tickLine={false} axisLine={false}
                  tick={{ fontSize: 12, fill: '#8b8898' }} />
                <Tooltip cursor={{ fill: '#f6f4ff' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e8e6f0', fontSize: 12 }} />
                <Bar dataKey="students" fill="#6f3fe8" radius={[0, 6, 6, 0]} name="Students" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-8">
        <SectionHeading title="Administration" />
        <QuickActions actions={[
          { label: 'Manage users', to: '/users', icon: Users },
          { label: 'Roles and permissions', to: '/roles', icon: ShieldCheck },
          { label: 'Student access', to: '/access', icon: GraduationCap },
          { label: 'Branding', to: '/branding', icon: Layers },
          { label: 'System settings', to: '/system', icon: Plus },
          { label: 'Audit logs', to: '/audit', icon: TrendingUp },
        ]} />
      </div>

      <div className="mt-8">
        <SectionHeading title="Recent system activity"
          action={<Link to="/audit"><Button variant="ghost" size="sm">Full audit log</Button></Link>} />
        <Card className="divide-y divide-canvas-line p-0">
          {data.activity.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">
              No activity recorded yet. Sign-ins and content changes will appear here.
            </p>
          ) : data.activity.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="min-w-0 truncate text-sm text-ink">{entry.detail || entry.action}</p>
              <span className="shrink-0 text-xs text-ink-soft">{relativeDays(entry.created_at)}</span>
            </div>
          ))}
        </Card>
      </div>

    </>
  )
}
