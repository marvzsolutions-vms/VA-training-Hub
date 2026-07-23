import { LEVEL_RANK, LEVEL_SHORT } from './utils'
import type {
  AppRole, Course, Enrollment, LearningLevel, Lesson, StudentAccessGrant, StudentProfile,
} from './types'

export const STAFF_ROLES: AppRole[] = ['coach', 'manager', 'owner']

export function isStaff(role?: AppRole | null): boolean {
  return !!role && STAFF_ROLES.includes(role)
}
export function isManagerUp(role?: AppRole | null): boolean {
  return role === 'manager' || role === 'owner'
}

const BLOCKING_STATUSES = new Set(['locked', 'suspended', 'expired', 'pending_approval'])

export interface AccessContext {
  role: AppRole | null
  student: StudentProfile | null
  enrollments: Enrollment[]
  specializationIds: string[]
  grants: StudentAccessGrant[]
  /** Course ids the student has finished. */
  completedCourseIds: string[]
  /** course id -> required prerequisite course ids */
  prerequisites: Record<string, string[]>
}

export interface AccessResult {
  allowed: boolean
  /** Short sentence explaining the block, written for the student. */
  reason: string
  /** What the student should do next. */
  action: string
}

const ALLOW: AccessResult = { allowed: true, reason: '', action: '' }

function activeGrant(grants: StudentAccessGrant[], test: (g: StudentAccessGrant) => boolean) {
  return grants.some((g) =>
    test(g) &&
    ['approved', 'active', 'temporarily_active', 'completed'].includes(g.status) &&
    (!g.expires_at || new Date(g.expires_at) > new Date()))
}

/**
 * The browser-side copy of `public.can_access_course`. It exists to explain
 * a lock to the student — the database enforces the same rules independently.
 */
export function evaluateCourseAccess(course: Course, ctx: AccessContext): AccessResult {
  if (isStaff(ctx.role)) return ALLOW
  const student = ctx.student
  if (!student) {
    return { allowed: false, reason: 'This account has no student record.', action: 'Contact your Manager.' }
  }
  if (BLOCKING_STATUSES.has(student.access_status)) {
    return {
      allowed: false,
      reason: `Your account status is ${student.access_status.replace('_', ' ')}.`,
      action: 'Contact your Manager to restore access.',
    }
  }

  const enrollment = ctx.enrollments.find((e) => e.course_id === course.id)
  if (!enrollment) {
    return {
      allowed: false,
      reason: 'You are not enrolled in this course yet.',
      action: 'Ask your Manager to enrol you.',
    }
  }
  if (!['active', 'approved', 'temporarily_active', 'completed'].includes(enrollment.status)) {
    return {
      allowed: false,
      reason: `Your enrolment is ${enrollment.status.replace('_', ' ')}.`,
      action: 'Contact your Manager.',
    }
  }
  if (enrollment.expires_at && new Date(enrollment.expires_at) <= new Date()) {
    return {
      allowed: false,
      reason: 'Your temporary access to this course has expired.',
      action: 'Request an extension from your Manager.',
    }
  }

  const levelGranted = activeGrant(ctx.grants, (g) => g.level === course.level)
  if (LEVEL_RANK[course.level] > LEVEL_RANK[student.current_level] && !levelGranted) {
    return {
      allowed: false,
      reason: `This course is ${LEVEL_SHORT[course.level]}. You are on ${LEVEL_SHORT[student.current_level]}.`,
      action: course.level === 'level_3'
        ? 'Level 3 is unlocked by a Manager or Owner.'
        : 'Finish your current level, then request an upgrade.',
    }
  }

  const courseGranted = activeGrant(ctx.grants, (g) => g.course_id === course.id)
  if (course.upgrade_required && !courseGranted && !levelGranted) {
    return {
      allowed: false,
      reason: 'This course needs an approved upgrade.',
      action: 'Request access from your Manager.',
    }
  }

  if (course.specialization_id && !ctx.specializationIds.includes(course.specialization_id)) {
    return {
      allowed: false,
      reason: 'This course belongs to a specialization you have not selected.',
      action: 'Ask your Manager to add this specialization.',
    }
  }

  const missing = (ctx.prerequisites[course.id] ?? [])
    .filter((id) => !ctx.completedCourseIds.includes(id))
  if (missing.length > 0) {
    return {
      allowed: false,
      reason: `You still have ${missing.length} prerequisite course${missing.length > 1 ? 's' : ''} to finish.`,
      action: 'Complete the prerequisites listed below.',
    }
  }

  return ALLOW
}

export function evaluateLessonAccess(
  lesson: Lesson, courseAccess: AccessResult, ctx: AccessContext,
): AccessResult {
  if (isStaff(ctx.role)) return ALLOW
  if (!lesson.is_published) {
    return { allowed: false, reason: 'This lesson is not published yet.', action: 'Check back soon.' }
  }
  // Mirrors can_access_lesson() in the database: a suspended or expired account
  // loses free previews too. Preview skips the enrolment and level gates, not
  // the requirement to hold a live account.
  const status = ctx.student?.access_status
  if (status && ['locked', 'suspended', 'expired', 'pending_approval'].includes(status)) {
    return {
      allowed: false,
      reason: 'Your account is not active right now.',
      action: 'Message your Manager to have your access restored.',
    }
  }
  if (lesson.preview_available) return ALLOW
  if (!courseAccess.allowed) return courseAccess
  const student = ctx.student
  const rank = student ? LEVEL_RANK[student.current_level] : 0
  if (LEVEL_RANK[lesson.required_student_level] > rank &&
      !activeGrant(ctx.grants, (g) => g.level === lesson.required_student_level)) {
    return {
      allowed: false,
      reason: `This lesson requires ${LEVEL_SHORT[lesson.required_student_level]}.`,
      action: 'Request an upgrade from your Manager.',
    }
  }
  if (lesson.required_specialization_id &&
      !ctx.specializationIds.includes(lesson.required_specialization_id)) {
    return {
      allowed: false,
      reason: 'This lesson belongs to another specialization.',
      action: 'Ask your Manager to add this specialization.',
    }
  }
  return ALLOW
}

export function levelAtLeast(level: LearningLevel, required: LearningLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[required]
}
