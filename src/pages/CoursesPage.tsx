import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Lock, Clock, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAsyncData } from '../lib/useAsyncData'
import { useAccessContext } from '../lib/useAccessContext'
import { evaluateCourseAccess, isStaff } from '../lib/access'
import { useAuth } from '../context/AuthContext'
import {
  Badge, Button, EmptyState, ErrorState, PageHeader, Pagination, ProgressBar,
  SearchInput, Select, Spinner,
} from '../components/ui'
import { formatDuration, LEVEL_SHORT } from '../lib/utils'
import type { Course, LearningLevel } from '../lib/types'

const PAGE_SIZE = 9

export default function CoursesPage() {
  const { role } = useAuth()
  const staff = isStaff(role)
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState<'all' | LearningLevel>('all')
  const [page, setPage] = useState(1)

  const accessState = useAccessContext()
  const coursesState = useAsyncData<Course[]>(async () => {
    const { data, error } = await supabase
      .from('courses')
      .select('*, specializations(id, name, slug)')
      .order('level').order('sort_order')
    if (error) throw error
    return (data ?? []) as Course[]
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (coursesState.data ?? []).filter((course) => {
      if (level !== 'all' && course.level !== level) return false
      if (!term) return true
      return course.title.toLowerCase().includes(term) ||
        course.description.toLowerCase().includes(term)
    })
  }, [coursesState.data, search, level])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  if (coursesState.loading || accessState.loading) return <Spinner label="Loading courses" />
  if (coursesState.error) return <ErrorState message={coursesState.error} onRetry={coursesState.reload} />

  const ctx = accessState.data!

  return (
    <>
      <PageHeader
        title={staff ? 'Courses' : 'My courses'}
        description={staff
          ? 'Every course in the catalogue, including drafts.'
          : 'Courses you are enrolled in, plus what unlocks next.'}
        action={staff ? <Link to="/builder"><Button>Open course builder</Button></Link> : undefined}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder="Search courses" label="Search courses" />
        <Select value={level} aria-label="Filter by level"
          onChange={(e) => { setLevel(e.target.value as 'all' | LearningLevel); setPage(1) }}>
          <option value="all">All levels</option>
          <option value="level_1">Level 1</option>
          <option value="level_2">Level 2</option>
          <option value="level_3">Level 3</option>
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses match that filter"
          description="Try a different level, or clear the search box."
          action={<Button variant="outline" onClick={() => { setSearch(''); setLevel('all') }}>Clear filters</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((course) => {
            const access = evaluateCourseAccess(course, ctx)
            const enrollment = ctx.enrollments.find((e) => e.course_id === course.id)
            return (
              <Link
                key={course.id}
                to={`/courses/${course.slug}`}
                className="card flex flex-col p-5 transition-shadow hover:shadow-pop"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge tone={course.level === 'level_3' ? 'brand' : course.level === 'level_2' ? 'info' : 'neutral'}>
                    {LEVEL_SHORT[course.level]}
                  </Badge>
                  {!access.allowed && (
                    <span className="flex items-center gap-1 text-xs font-medium text-ink-soft">
                      <Lock className="h-3.5 w-3.5" aria-hidden />Locked
                    </span>
                  )}
                  {staff && !course.is_published && <Badge tone="warning">Draft</Badge>}
                </div>

                <h2 className="font-semibold text-ink">{course.title}</h2>
                <p className="mt-1.5 line-clamp-3 flex-1 text-sm text-ink-muted">{course.description}</p>

                {course.specializations && (
                  <p className="mt-3 text-xs font-medium text-brand-700">{course.specializations.name}</p>
                )}

                <div className="mt-4 flex items-center gap-4 text-xs text-ink-soft">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden />{formatDuration(course.estimated_minutes)}
                  </span>
                  {staff && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden />{course.enrollment_count} enrolled
                    </span>
                  )}
                </div>

                {enrollment && access.allowed && (
                  <div className="mt-4"><ProgressBar value={Number(enrollment.progress)} label="Progress" /></div>
                )}
                {!access.allowed && (
                  <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">{access.reason}</p>
                )}
              </Link>
            )
          })}
        </div>
      )}

      <Pagination page={current} pageCount={pageCount} onChange={setPage} />
    </>
  )
}
