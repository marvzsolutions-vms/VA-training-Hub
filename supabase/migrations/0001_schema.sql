-- =====================================================================
-- VA Success Academy — 0001 Schema
-- Run order: 0001_schema.sql -> 0002_functions.sql -> 0003_rls.sql
--            -> 0004_seed_reference.sql -> 0005_seed_curriculum.sql
--            -> 0006_seed_demo.sql
-- =====================================================================

create extension if not exists "pgcrypto";

-- ------------------------- enums -------------------------------------
do $$ begin
  create type app_role as enum ('student','coach','manager','owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type learning_level as enum ('level_1','level_2','level_3');
exception when duplicate_object then null; end $$;

do $$ begin
  create type access_status as enum
    ('locked','eligible','pending_approval','approved','active',
     'temporarily_active','expired','suspended','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lesson_type as enum
    ('text','video','live_zoom','recorded_zoom','tutorial','screenshot_walkthrough',
     'checklist','downloadable_resource','practical_activity','external_link',
     'quiz_placeholder','assignment_placeholder');
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_status as enum ('new','in_review','answered','needs_information','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum ('scheduled','live','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('current','needs_review','outdated','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type visibility_scope as enum ('public','enrolled','level','staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type announcement_audience as enum ('global','course','batch','student');
exception when duplicate_object then null; end $$;

-- ------------------------- identity ----------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text not null default '',
  avatar_url      text,
  role            app_role not null default 'student',
  is_active       boolean not null default true,
  mobile_number   text,
  city            text,
  province        text,
  time_zone       text not null default 'Asia/Manila',
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_profiles_role on public.profiles(role) where deleted_at is null;

create table if not exists public.roles (
  id          serial primary key,
  code        app_role unique not null,
  name        text not null,
  description text not null default '',
  rank        int not null default 0
);

create table if not exists public.permissions (
  id          serial primary key,
  code        text unique not null,
  name        text not null,
  category    text not null default 'general',
  description text not null default ''
);

create table if not exists public.role_permissions (
  role_id       int not null references public.roles(id) on delete cascade,
  permission_id int not null references public.permissions(id) on delete cascade,
  granted       boolean not null default true,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role_id     int not null references public.roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- ------------------------- learning levels ---------------------------
create table if not exists public.student_learning_levels (
  id          serial primary key,
  code        learning_level unique not null,
  name        text not null,
  description text not null default '',
  rank        int not null,
  requires_approval boolean not null default false
);

create table if not exists public.specializations (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text not null default '',
  icon        text default 'Briefcase',
  level       learning_level not null default 'level_2',
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.batches (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  description text not null default '',
  coach_id    uuid references public.profiles(id) on delete set null,
  start_date  date,
  end_date    date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.student_profiles (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  current_level        learning_level not null default 'level_1',
  access_status        access_status not null default 'active',
  batch_id             uuid references public.batches(id) on delete set null,
  experience_level     text not null default 'none',
  employment_status    text not null default 'looking',
  availability         text not null default 'full_time',
  skills               text[] not null default '{}',
  familiar_tools       text[] not null default '{}',
  introduction         text not null default '',
  resume_url           text,
  portfolio_url        text,
  linkedin_url         text,
  level2_eligible      boolean not null default false,
  level3_eligible      boolean not null default false,
  level_progress       numeric(5,2) not null default 0,
  recommended_next_step text not null default 'Start with Virtual Assistant Foundations.',
  upgraded_at          timestamptz,
  upgrade_approved_by  uuid references public.profiles(id),
  upgrade_notes        text not null default '',
  last_activity_at     timestamptz,
  joined_at            timestamptz not null default now()
);

create table if not exists public.student_level_history (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  from_level    learning_level,
  to_level      learning_level not null,
  reason        text not null default '',
  approved_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_level_history_student on public.student_level_history(student_id);

create table if not exists public.student_specializations (
  student_id       uuid not null references public.profiles(id) on delete cascade,
  specialization_id uuid not null references public.specializations(id) on delete cascade,
  is_primary       boolean not null default false,
  granted_by       uuid references public.profiles(id),
  granted_at       timestamptz not null default now(),
  primary key (student_id, specialization_id)
);

create table if not exists public.batch_students (
  batch_id   uuid not null references public.batches(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (batch_id, student_id)
);

-- ------------------------- curriculum --------------------------------
create table if not exists public.courses (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  title               text not null,
  description         text not null default '',
  cover_image_url     text,
  level               learning_level not null default 'level_1',
  specialization_id   uuid references public.specializations(id) on delete set null,
  instructor_id       uuid references public.profiles(id) on delete set null,
  learning_outcomes   text[] not null default '{}',
  requirements        text[] not null default '{}',
  estimated_minutes   int not null default 0,
  is_published        boolean not null default false,
  sort_order          int not null default 0,
  upgrade_required    boolean not null default false,
  preview_available   boolean not null default false,
  enrollment_count    int not null default 0,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_courses_level on public.courses(level) where deleted_at is null;
create index if not exists idx_courses_spec on public.courses(specialization_id);

create table if not exists public.course_prerequisites (
  course_id       uuid not null references public.courses(id) on delete cascade,
  prerequisite_id uuid not null references public.courses(id) on delete cascade,
  is_required     boolean not null default true,
  primary key (course_id, prerequisite_id),
  check (course_id <> prerequisite_id)
);

create table if not exists public.course_enrollments (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  status        access_status not null default 'active',
  enrolled_by   uuid references public.profiles(id),
  enrolled_at   timestamptz not null default now(),
  expires_at    timestamptz,
  completed_at  timestamptz,
  progress      numeric(5,2) not null default 0,
  unique (course_id, student_id)
);
create index if not exists idx_enroll_student on public.course_enrollments(student_id);

create table if not exists public.student_access (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  level         learning_level,
  course_id     uuid references public.courses(id) on delete cascade,
  status        access_status not null default 'approved',
  granted_by    uuid references public.profiles(id),
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz,
  notes         text not null default '',
  check (level is not null or course_id is not null)
);
create index if not exists idx_access_student on public.student_access(student_id);

create table if not exists public.modules (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  sort_order    int not null default 0,
  level         learning_level not null default 'level_1',
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_modules_course on public.modules(course_id);

create table if not exists public.lessons (
  id                       uuid primary key default gen_random_uuid(),
  module_id                uuid not null references public.modules(id) on delete cascade,
  course_id                uuid not null references public.courses(id) on delete cascade,
  title                    text not null,
  description              text not null default '',
  objective                text not null default '',
  student_content          text not null default '',
  coach_notes              text not null default '',
  presentation_content     text not null default '',
  examples                 text not null default '',
  live_activity            text not null default '',
  estimated_minutes        int not null default 15,
  type                     lesson_type not null default 'text',
  is_required              boolean not null default true,
  sort_order               int not null default 0,
  level                    learning_level not null default 'level_1',
  required_student_level   learning_level not null default 'level_1',
  required_specialization_id uuid references public.specializations(id) on delete set null,
  preview_available        boolean not null default false,
  is_published             boolean not null default true,
  recording_url            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);
create index if not exists idx_lessons_module on public.lessons(module_id);
create index if not exists idx_lessons_course on public.lessons(course_id);

create table if not exists public.lesson_sections (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  section_type text not null default 'content', -- content | example | activity | coach_note
  coach_only  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sections_lesson on public.lesson_sections(lesson_id);

create table if not exists public.lesson_prerequisites (
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  prerequisite_id uuid not null references public.lessons(id) on delete cascade,
  primary key (lesson_id, prerequisite_id),
  check (lesson_id <> prerequisite_id)
);

create table if not exists public.lesson_progress (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  opened_at     timestamptz not null default now(),
  completed_at  timestamptz,
  is_completed  boolean not null default false,
  last_activity_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);
create index if not exists idx_progress_student on public.lesson_progress(student_id);

create table if not exists public.lesson_screenshots (
  id                    uuid primary key default gen_random_uuid(),
  lesson_id             uuid not null references public.lessons(id) on delete cascade,
  image_url             text not null default '',
  step_number           int not null default 1,
  title                 text not null,
  instruction           text not null default '',
  highlight_description text not null default '',
  tip                   text not null default '',
  warning               text not null default '',
  tool_version          text not null default '',
  captured_on           date,
  device_type           text not null default 'desktop',
  sort_order            int not null default 0,
  is_archived           boolean not null default false,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_shots_lesson on public.lesson_screenshots(lesson_id);

-- ------------------------- tools -------------------------------------
create table if not exists public.tool_categories (
  id         serial primary key,
  slug       text unique not null,
  name       text not null,
  sort_order int not null default 0
);

create table if not exists public.tools (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name             text not null,
  logo_url         text,
  category_id      int references public.tool_categories(id) on delete set null,
  description      text not null default '',
  website_url      text,
  login_url        text,
  signup_url       text,
  pricing_label    text not null default 'Free',
  pricing_notes    text not null default '',
  recommended_use  text not null default '',
  level            learning_level not null default 'level_1',
  internal_guide   text not null default '',
  last_reviewed_at date,
  review_status    review_status not null default 'current',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_tools_category on public.tools(category_id);

create table if not exists public.tool_links (
  id         uuid primary key default gen_random_uuid(),
  tool_id    uuid not null references public.tools(id) on delete cascade,
  label      text not null,
  url        text not null,
  link_type  text not null default 'documentation',
  sort_order int not null default 0
);

create table if not exists public.course_tools (
  course_id uuid not null references public.courses(id) on delete cascade,
  tool_id   uuid not null references public.tools(id) on delete cascade,
  primary key (course_id, tool_id)
);

create table if not exists public.lesson_tools (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  tool_id   uuid not null references public.tools(id) on delete cascade,
  note      text not null default '',
  primary key (lesson_id, tool_id)
);

-- ------------------------- resources ---------------------------------
create table if not exists public.resource_types (
  id         serial primary key,
  slug       text unique not null,
  name       text not null,
  icon       text not null default 'File',
  sort_order int not null default 0
);

create table if not exists public.resources (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text not null default '',
  type_id           int references public.resource_types(id) on delete set null,
  url               text,
  file_path         text,
  thumbnail_url     text,
  course_id         uuid references public.courses(id) on delete set null,
  module_id         uuid references public.modules(id) on delete set null,
  lesson_id         uuid references public.lessons(id) on delete set null,
  tool_id           uuid references public.tools(id) on delete set null,
  level             learning_level not null default 'level_1',
  specialization_id uuid references public.specializations(id) on delete set null,
  is_required       boolean not null default false,
  is_premium        boolean not null default false,
  visibility        visibility_scope not null default 'enrolled',
  sort_order        int not null default 0,
  allow_download    boolean not null default true,
  added_by          uuid references public.profiles(id),
  last_reviewed_at  date,
  review_status     review_status not null default 'current',
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists idx_resources_course on public.resources(course_id);
create index if not exists idx_resources_lesson on public.resources(lesson_id);

create table if not exists public.resource_course_relations (
  resource_id uuid not null references public.resources(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  primary key (resource_id, course_id)
);
create table if not exists public.resource_module_relations (
  resource_id uuid not null references public.resources(id) on delete cascade,
  module_id   uuid not null references public.modules(id) on delete cascade,
  primary key (resource_id, module_id)
);
create table if not exists public.resource_lesson_relations (
  resource_id uuid not null references public.resources(id) on delete cascade,
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  primary key (resource_id, lesson_id)
);
create table if not exists public.resource_tool_relations (
  resource_id uuid not null references public.resources(id) on delete cascade,
  tool_id     uuid not null references public.tools(id) on delete cascade,
  primary key (resource_id, tool_id)
);

create table if not exists public.resource_reviews (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  status      review_status not null default 'current',
  notes       text not null default '',
  reviewed_at timestamptz not null default now()
);

-- ------------------------- engagement --------------------------------
create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  course_id      uuid references public.courses(id) on delete set null,
  lesson_id      uuid references public.lessons(id) on delete set null,
  assigned_to    uuid references public.profiles(id) on delete set null,
  subject        text not null,
  details        text not null default '',
  status         question_status not null default 'new',
  internal_notes text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_questions_student on public.questions(student_id);

create table if not exists public.question_replies (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  is_internal boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_replies_question on public.question_replies(question_id);

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  message     text not null,
  audience    announcement_audience not null default 'global',
  course_id   uuid references public.courses(id) on delete cascade,
  batch_id    uuid references public.batches(id) on delete cascade,
  student_id  uuid references public.profiles(id) on delete cascade,
  publish_at  timestamptz not null default now(),
  expires_at  timestamptz,
  author_id   uuid references public.profiles(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.live_sessions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null default '',
  course_id     uuid references public.courses(id) on delete set null,
  module_id     uuid references public.modules(id) on delete set null,
  batch_id      uuid references public.batches(id) on delete set null,
  coach_id      uuid references public.profiles(id) on delete set null,
  session_date  date not null,
  start_time    time not null,
  end_time      time not null,
  time_zone     text not null default 'Asia/Manila',
  zoom_url      text,
  meeting_id    text,
  passcode      text,
  recording_url text,
  status        session_status not null default 'scheduled',
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_sessions_date on public.live_sessions(session_date);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text not null default '',
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, is_read);

-- ------------------------- system ------------------------------------
create table if not exists public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  action     text not null,
  entity     text not null default '',
  entity_id  uuid,
  detail     text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_created on public.activity_logs(created_at desc);

create table if not exists public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  table_name text not null,
  record_id  uuid,
  before_data jsonb,
  after_data  jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

create table if not exists public.branding_settings (
  id             int primary key default 1,
  app_name       text not null default 'VA Success Academy',
  tagline        text not null default 'Practical Virtual Assistant training for Filipino beginners.',
  logo_url       text,
  primary_color  text not null default '#6f3fe8',
  accent_color   text not null default '#845ef7',
  support_email  text not null default 'support@vasuccessacademy.ph',
  updated_by     uuid references public.profiles(id),
  updated_at     timestamptz not null default now(),
  constraint branding_singleton check (id = 1)
);

create table if not exists public.system_settings (
  key         text primary key,
  value       text not null default '',
  description text not null default '',
  is_private  boolean not null default false,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);

-- ------------------------- triggers ----------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','courses','modules','lessons','tools','resources',
                           'questions','lesson_screenshots'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- keep user_roles in sync with profiles.role
create or replace function public.sync_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.user_roles where user_id = new.id;
  insert into public.user_roles (user_id, role_id)
  select new.id, r.id from public.roles r where r.code = new.role
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_sync_user_role on public.profiles;
create trigger trg_sync_user_role after insert or update of role on public.profiles
for each row execute function public.sync_user_role();

-- create a profile row whenever an auth user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare assigned app_role;
begin
  assigned := coalesce((new.raw_user_meta_data->>'role')::app_role, 'student');
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          assigned)
  on conflict (id) do nothing;

  if assigned = 'student' then
    insert into public.student_profiles (user_id) values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- keep denormalised counters honest
create or replace function public.refresh_enrollment_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  cid := coalesce(new.course_id, old.course_id);
  update public.courses c
     set enrollment_count = (select count(*) from public.course_enrollments e where e.course_id = cid)
   where c.id = cid;
  return null;
end $$;

drop trigger if exists trg_enrollment_count on public.course_enrollments;
create trigger trg_enrollment_count after insert or delete on public.course_enrollments
for each row execute function public.refresh_enrollment_count();
