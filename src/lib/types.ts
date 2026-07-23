export type AppRole = 'student' | 'coach' | 'manager' | 'owner'
export type ThemeMode = 'light' | 'dark'
export type LearningLevel = 'level_1' | 'level_2' | 'level_3'
export type AccessStatus =
  | 'locked' | 'eligible' | 'pending_approval' | 'approved' | 'active'
  | 'temporarily_active' | 'expired' | 'suspended' | 'completed'
export type LessonType =
  | 'text' | 'video' | 'live_zoom' | 'recorded_zoom' | 'tutorial'
  | 'screenshot_walkthrough' | 'checklist' | 'downloadable_resource'
  | 'practical_activity' | 'external_link' | 'quiz_placeholder' | 'assignment_placeholder'
export type QuestionStatus = 'new' | 'in_review' | 'answered' | 'needs_information' | 'closed'
export type SessionStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'
export type ReviewStatus = 'current' | 'needs_review' | 'outdated' | 'archived'
export type AnnouncementAudience = 'global' | 'course' | 'batch' | 'student' | 'coaches'

export interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: AppRole
  is_active: boolean
  mobile_number: string | null
  city: string | null
  province: string | null
  time_zone: string
  last_seen_at: string | null
  created_at: string
  payment_status?: 'unpaid' | 'half_paid' | 'paid'
  amount_paid?: number
  total_amount?: number
  avatar_choice?: 'coach_female' | 'coach_male' | 'coach_neutral' | 'student_female' | 'student_male' | 'student_neutral' | 'custom' | null
  theme_preference?: ThemeMode | null
}

export interface StudentProfile {
  user_id: string
  current_level: LearningLevel
  access_status: AccessStatus
  batch_id: string | null
  experience_level: string
  employment_status: string
  availability: string
  skills: string[]
  familiar_tools: string[]
  introduction: string
  resume_url: string | null
  portfolio_url: string | null
  linkedin_url: string | null
  level2_eligible: boolean
  level3_eligible: boolean
  level_progress: number
  recommended_next_step: string
  upgraded_at: string | null
  upgrade_approved_by: string | null
  upgrade_notes: string
  last_activity_at: string | null
  joined_at: string
  referred_by_coach?: string | null
}

export interface Specialization {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  level: LearningLevel
  is_active: boolean
  sort_order: number
}

export interface Course {
  id: string
  slug: string
  title: string
  description: string
  cover_image_url: string | null
  level: LearningLevel
  specialization_id: string | null
  learning_outcomes: string[]
  requirements: string[]
  estimated_minutes: number
  is_published: boolean
  sort_order: number
  upgrade_required: boolean
  preview_available: boolean
  enrollment_count: number
  specializations?: Pick<Specialization, 'id' | 'name' | 'slug'> | null
}

export interface Module {
  id: string
  course_id: string
  title: string
  description: string
  sort_order: number
  level: LearningLevel
  is_published: boolean
}

export interface Lesson {
  id: string
  module_id: string
  course_id: string
  title: string
  description: string
  objective: string
  student_content: string
  coach_notes: string
  presentation_content: string
  examples: string
  live_activity: string
  estimated_minutes: number
  type: LessonType
  is_required: boolean
  sort_order: number
  level: LearningLevel
  required_student_level: LearningLevel
  required_specialization_id: string | null
  preview_available: boolean
  is_published: boolean
  recording_url: string | null
}

export interface LessonSection {
  id: string
  lesson_id: string
  title: string
  body: string
  section_type: 'content' | 'example' | 'activity' | 'coach_note'
  coach_only: boolean
  sort_order: number
}

export interface LessonScreenshot {
  id: string
  lesson_id: string
  image_url: string
  step_number: number
  title: string
  instruction: string
  highlight_description: string
  tip: string
  warning: string
  tool_version: string
  captured_on: string | null
  device_type: string
  sort_order: number
  is_archived: boolean
}

export interface Enrollment {
  id: string
  course_id: string
  student_id: string
  status: AccessStatus
  enrolled_at: string
  expires_at: string | null
  completed_at: string | null
  progress: number
  courses?: Course
  student?: Pick<Profile, 'id' | 'full_name' | 'email'>
}

export interface LessonProgress {
  id: string
  lesson_id: string
  course_id: string
  student_id: string
  is_completed: boolean
  completed_at: string | null
  last_activity_at: string
}

export interface Tool {
  id: string
  slug: string
  name: string
  logo_url: string | null
  category_id: number | null
  description: string
  website_url: string | null
  login_url: string | null
  signup_url: string | null
  pricing_label: string
  pricing_notes: string
  recommended_use: string
  level: LearningLevel
  internal_guide: string
  last_reviewed_at: string | null
  review_status: ReviewStatus
  is_active: boolean
  tool_categories?: { id: number; name: string; slug: string } | null
}

export interface ResourceItem {
  id: string
  title: string
  description: string
  type_id: number | null
  url: string | null
  file_path: string | null
  course_id: string | null
  module_id: string | null
  lesson_id: string | null
  tool_id: string | null
  level: LearningLevel
  specialization_id: string | null
  is_required: boolean
  is_premium: boolean
  visibility: 'public' | 'enrolled' | 'level' | 'staff'
  allow_download: boolean
  last_reviewed_at: string | null
  review_status: ReviewStatus
  is_archived: boolean
  created_at: string
  resource_types?: { id: number; name: string; slug: string; icon: string } | null
  courses?: Pick<Course, 'id' | 'title' | 'slug'> | null
}

export interface Question {
  id: string
  student_id: string
  course_id: string | null
  lesson_id: string | null
  assigned_to: string | null
  audience?: 'private_coach' | 'coach_team' | 'general'
  student_last_viewed_at?: string | null
  subject: string
  details: string
  status: QuestionStatus
  internal_notes: string
  created_at: string
  updated_at: string
  courses?: Pick<Course, 'id' | 'title'> | null
  lessons?: Pick<Lesson, 'id' | 'title'> | null
  student?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  assigned_coach?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

export interface QuestionReply {
  id: string
  question_id: string
  author_id: string
  body: string
  is_internal: boolean
  created_at: string
  author?: Pick<Profile, 'id' | 'full_name' | 'role'> | null
}

export interface Announcement {
  id: string
  title: string
  message: string
  audience: AnnouncementAudience
  course_id: string | null
  batch_id: string | null
  student_id: string | null
  publish_at: string
  expires_at: string | null
  author_id: string | null
  is_active: boolean
  created_at: string
  summary?: string
  banner_url?: string | null
}

export interface LiveSession {
  id: string
  title: string
  description: string
  course_id: string | null
  module_id: string | null
  batch_id: string | null
  coach_id: string | null
  session_date: string
  start_time: string
  end_time: string
  time_zone: string
  zoom_url: string | null
  meeting_id: string | null
  passcode: string | null
  recording_url: string | null
  status: SessionStatus
  courses?: Pick<Course, 'id' | 'title'> | null
  batches?: { id: string; code: string; name: string } | null
}

export interface Batch {
  id: string
  code: string
  name: string
  description: string
  coach_id: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  coach?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  link: string | null
  is_read: boolean
  created_at: string
  notification_type?: 'general' | 'zoom_invitation' | 'access_request' | 'email'
  sender_name?: string | null
  sender_email?: string | null
  action_label?: string | null
  external_url?: string | null
  details?: string | null
  created_by?: string | null
  audience?: 'individual' | 'all' | 'students' | 'coaches'
}

export interface ActivityLog {
  id: string
  user_id: string | null
  action: string
  entity: string
  entity_id: string | null
  detail: string
  created_at: string
  user?: Pick<Profile, 'full_name' | 'role'> | null
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  table_name: string
  record_id: string | null
  created_at: string
  actor?: Pick<Profile, 'full_name' | 'role'> | null
}

export interface Branding {
  id: number
  app_name: string
  tagline: string
  logo_url: string | null
  primary_color: string
  accent_color: string
  support_email: string
  description?: string
  website_url?: string
  facebook_url?: string
  instagram_url?: string
  linkedin_url?: string
  youtube_url?: string
  default_theme?: ThemeMode
}

export interface StudentAccessGrant {
  id: string
  student_id: string
  level: LearningLevel | null
  course_id: string | null
  status: AccessStatus
  granted_by: string | null
  granted_at: string
  expires_at: string | null
  notes: string
}

/* ------------------------- Upgrades & access (0008) ------------------------ */
export type UpgradeStatus =
  | 'draft' | 'submitted' | 'under_review' | 'more_information_required'
  | 'recommended' | 'approved' | 'declined' | 'cancelled'

export type AccessScope = 'course' | 'module' | 'specialization' | 'level'
export type SpecAccessStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'completed'

export interface UpgradeRequest {
  id: string
  student_id: string
  requested_level: LearningLevel | null
  requested_spec_id: string | null
  reason: string
  status: UpgradeStatus
  eligibility_snapshot: Record<string, unknown>
  coach_id: string | null
  coach_recommended: boolean | null
  coach_notes: string
  coach_reviewed_at: string | null
  manager_id: string | null
  manager_notes: string
  manager_reviewed_at: string | null
  decision_notes: string
  decided_by: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
  student?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  specializations?: Pick<Specialization, 'id' | 'name'> | null
}

export interface UpgradeInternalNote {
  id: string
  request_id: string
  author_id: string
  body: string
  created_at: string
  updated_at: string
  author?: Pick<Profile, 'id' | 'full_name' | 'role'> | null
}

export interface UpgradeApproval {
  id: string
  request_id: string
  actor_id: string | null
  actor_role: AppRole | null
  action: string
  from_status: UpgradeStatus | null
  to_status: UpgradeStatus | null
  notes: string
  created_at: string
  actor?: Pick<Profile, 'full_name' | 'role'> | null
}

export interface TemporaryAccess {
  id: string
  student_id: string
  scope: AccessScope
  course_id: string | null
  module_id: string | null
  spec_id: string | null
  level: LearningLevel | null
  starts_at: string
  expires_at: string
  reason: string
  granted_by: string | null
  revoked_at: string | null
  created_at: string
  student?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  courses?: Pick<Course, 'id' | 'title'> | null
  specializations?: Pick<Specialization, 'id' | 'name'> | null
}

export interface SpecializationAccess {
  id: string
  student_id: string
  spec_id: string
  status: SpecAccessStatus
  starts_at: string
  expires_at: string | null
  approved_by: string | null
  approval_notes: string
  progress: number
  completed_at: string | null
  specializations?: Pick<Specialization, 'id' | 'name'> | null
}

export interface AccessHistoryEntry {
  id: string
  student_id: string
  action: string
  scope: AccessScope | null
  level: LearningLevel | null
  from_value: string
  to_value: string
  reason: string
  effective_at: string | null
  expires_at: string | null
  created_at: string
  actor?: Pick<Profile, 'full_name' | 'role'> | null
}

export interface UpgradeEligibility {
  current_level: LearningLevel
  access_status: AccessStatus
  level1_courses_total: number
  level1_courses_done: number
  level1_complete: boolean
  level2_complete: boolean
  eligible_level2: boolean
  eligible_level3: boolean
  auto_level2_access: boolean
  manual_level3: boolean
  can_request: boolean
}
