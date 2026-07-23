import type { AccessStatus, AppRole, LearningLevel, LessonType, QuestionStatus } from './types'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export const LEVEL_RANK: Record<LearningLevel, number> = {
  level_1: 1,
  level_2: 2,
  level_3: 3,
}

export const LEVEL_LABEL: Record<LearningLevel, string> = {
  level_1: 'Level 1 — Beginner Foundations',
  level_2: 'Level 2 — Job-Ready Specialization',
  level_3: 'Level 3 — Advanced Skills',
}

export const LEVEL_SHORT: Record<LearningLevel, string> = {
  level_1: 'Level 1',
  level_2: 'Level 2',
  level_3: 'Level 3',
}

export const ROLE_LABEL: Record<AppRole, string> = {
  student: 'Student',
  coach: 'Coach',
  manager: 'Manager',
  owner: 'Owner',
}

export const STATUS_LABEL: Record<AccessStatus, string> = {
  locked: 'Locked',
  eligible: 'Eligible',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  active: 'Active',
  temporarily_active: 'Temporarily active',
  expired: 'Expired',
  suspended: 'Suspended',
  completed: 'Completed',
}

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  new: 'New',
  in_review: 'In review',
  answered: 'Answered',
  needs_information: 'Needs information',
  closed: 'Closed',
}

export const LESSON_TYPE_LABEL: Record<LessonType, string> = {
  text: 'Reading',
  video: 'Video',
  live_zoom: 'Live Zoom',
  recorded_zoom: 'Recorded Zoom',
  tutorial: 'Tutorial',
  screenshot_walkthrough: 'Screenshot walkthrough',
  checklist: 'Checklist',
  downloadable_resource: 'Downloadable resource',
  practical_activity: 'Practical activity',
  external_link: 'External link',
  quiz_placeholder: 'Quiz (coming soon)',
  assignment_placeholder: 'Assignment (coming soon)',
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function formatTime(value?: string | null): string {
  if (!value) return '—'
  const [h, m] = value.split(':')
  const hour = Number(h)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:${m} ${suffix}`
}

export function relativeDays(value?: string | null): string {
  if (!value) return 'no activity yet'
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(value)
}

export function formatDuration(minutes: number): string {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

/** Turns a Supabase/Postgres error into something a person can act on. */
export function readableError(error: unknown): string {
  const message = (error as { message?: string })?.message ?? String(error)
  if (/row-level security/i.test(message)) {
    return 'Your account does not have permission for that action.'
  }
  if (/duplicate key/i.test(message)) return 'That record already exists.'
  if (/Invalid login credentials/i.test(message)) {
    return 'That email and password combination did not match an account.'
  }
  if (/Email not confirmed/i.test(message)) {
    return 'Confirm your email address first, then sign in.'
  }
  return message || 'Something went wrong. Try again.'
}

export const UPGRADE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  more_information_required: 'More information needed',
  recommended: 'Recommended',
  approved: 'Approved',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

export const ACCESS_SCOPE_LABEL: Record<string, string> = {
  course: 'One course',
  module: 'One module',
  specialization: 'One specialization',
  level: 'Whole level',
}

/** Days until a date, negative when already past. */
export function daysUntil(value: string | null): number | null {
  if (!value) return null
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000)
}
