import { useAuth } from '../context/AuthContext'
import { supabase } from './supabase'
import { useAsyncData } from './useAsyncData'
import type { AccessContext } from './access'
import type { Enrollment, StudentAccessGrant } from './types'

/**
 * Loads everything the browser needs to explain why a course is locked.
 * The database enforces the same rules independently — this is for messaging.
 */
export function useAccessContext() {
  const { profile, student, specializationIds, role } = useAuth()

  return useAsyncData<AccessContext>(async () => {
    if (!profile) {
      return {
        role: null, student: null, enrollments: [], specializationIds: [],
        grants: [], completedCourseIds: [], prerequisites: {},
      }
    }

    const [enrollments, grants, prereqs] = await Promise.all([
      supabase.from('course_enrollments').select('*, courses(*)').eq('student_id', profile.id),
      supabase.from('student_access').select('*').eq('student_id', profile.id),
      supabase.from('course_prerequisites').select('course_id, prerequisite_id, is_required'),
    ])

    const enrollmentRows = (enrollments.data ?? []) as Enrollment[]
    const prerequisites: Record<string, string[]> = {}
    for (const row of (prereqs.data ?? []) as Array<{ course_id: string; prerequisite_id: string; is_required: boolean }>) {
      if (!row.is_required) continue
      prerequisites[row.course_id] = [...(prerequisites[row.course_id] ?? []), row.prerequisite_id]
    }

    return {
      role,
      student,
      enrollments: enrollmentRows,
      specializationIds,
      grants: (grants.data ?? []) as StudentAccessGrant[],
      completedCourseIds: enrollmentRows.filter((e) => e.completed_at).map((e) => e.course_id),
      prerequisites,
    }
  }, [profile?.id, role, student?.current_level, student?.access_status, specializationIds.join(',')])
}
