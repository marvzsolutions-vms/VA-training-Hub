-- ===========================================================================
-- 0007  Settings grouping + Owner permission toggles
-- ---------------------------------------------------------------------------
-- Fixes a confirmed runtime error and lays the groundwork for the Owner
-- permission switches used by the upgrade workflow.
--
--   Bug: the System settings page orders and groups by
--        `system_settings.category`, but that column was never created.
--        Symptom: "column system_settings.category does not exist".
--
-- Everything here is additive and idempotent. No table is dropped, no existing
-- row is deleted, and the file can be re-run safely.
-- ===========================================================================

-- ------------------------- system_settings.category ------------------------
alter table public.system_settings
  add column if not exists category text not null default 'General';

alter table public.system_settings
  add column if not exists label text not null default '';

alter table public.system_settings
  add column if not exists value_type text not null default 'text';

do $$ begin
  alter table public.system_settings
    add constraint system_settings_value_type_check
    check (value_type in ('text','boolean','number','email','url'));
exception when duplicate_object then null; end $$;

-- Group the six settings seeded in 0004 so the page renders sensible sections.
update public.system_settings set category = 'Enrolment',   value_type = 'boolean',
       label = 'Enrolment open'
 where key = 'enrollment_open' and category = 'General';

update public.system_settings set category = 'Regional',    value_type = 'text',
       label = 'Default time zone'
 where key = 'default_time_zone' and category = 'General';

update public.system_settings set category = 'Support',     value_type = 'text',
       label = 'Support hours'
 where key = 'support_hours' and category = 'General';

update public.system_settings set category = 'Progression', value_type = 'boolean',
       label = 'Automatic Level 2 eligibility'
 where key = 'level2_auto_eligibility' and category = 'General';

update public.system_settings set category = 'Progression', value_type = 'boolean',
       label = 'Level 3 requires Owner approval'
 where key = 'level3_requires_owner' and category = 'General';

update public.system_settings set category = 'Sessions',    value_type = 'number',
       label = 'Recording retention (days)'
 where key = 'session_retention_days' and category = 'General';

create index if not exists system_settings_category_idx
  on public.system_settings (category, key);

-- ---------------------- Owner-controlled permission toggles ----------------
-- These drive the upgrade and access workflow. Reading them is cheap and they
-- are checked by both the UI and the database helper below.
insert into public.system_settings (key, value, description, is_private, category, label, value_type) values
  ('perm.manager_approve_level2','true',
   'Managers may approve upgrades to Level 2.', false, 'Permissions',
   'Manager can approve Level 2','boolean'),
  ('perm.manager_approve_level3','false',
   'Managers may approve upgrades to Level 3. Off means Owner-only.', false, 'Permissions',
   'Manager can approve Level 3','boolean'),
  ('perm.coach_recommend_upgrade','true',
   'Coaches may recommend a student for an upgrade.', false, 'Permissions',
   'Coach can recommend upgrades','boolean'),
  ('perm.coach_approve_upgrade','false',
   'Coaches may approve upgrades outright, not only recommend them.', false, 'Permissions',
   'Coach can approve upgrades','boolean'),
  ('perm.manager_edit_resources','true',
   'Managers may add, edit and archive library resources.', false, 'Permissions',
   'Manager can edit resources','boolean'),
  ('perm.coach_edit_resources','true',
   'Coaches may add, edit and archive library resources.', false, 'Permissions',
   'Coach can edit resources','boolean'),
  ('perm.manager_issue_certificates','true',
   'Managers may issue course certificates.', false, 'Permissions',
   'Manager can issue certificates','boolean'),
  ('perm.coach_issue_certificates','false',
   'Coaches may issue course certificates.', false, 'Permissions',
   'Coach can issue certificates','boolean'),
  ('perm.students_request_upgrade','true',
   'Students may submit their own upgrade requests.', false, 'Permissions',
   'Students can request upgrades','boolean'),
  ('perm.auto_level2_eligibility','true',
   'Mark students eligible for Level 2 automatically once Level 1 is complete.', false, 'Permissions',
   'Automatic Level 2 eligibility','boolean'),
  ('perm.auto_level2_access','false',
   'Grant Level 2 access automatically on eligibility. Off means a human decides.', false, 'Permissions',
   'Automatic Level 2 access','boolean'),
  ('perm.manual_level3_approval','true',
   'Level 3 always requires an explicit approval, never automatic.', false, 'Permissions',
   'Manual Level 3 approval','boolean'),
  ('perm.show_locked_courses','true',
   'Show locked courses in the catalogue so students can see what is ahead.', false, 'Permissions',
   'Show locked courses','boolean'),
  ('perm.show_course_previews','true',
   'Allow preview lessons on otherwise locked courses.', false, 'Permissions',
   'Show course previews','boolean'),
  ('perm.allow_temporary_access','true',
   'Allow time-limited grants that expire automatically.', false, 'Permissions',
   'Allow temporary access','boolean'),
  ('perm.enforce_prerequisites','true',
   'Require prerequisites to be completed before a course opens.', false, 'Permissions',
   'Enforce prerequisites','boolean')
on conflict (key) do nothing;

-- Convenience reader used by policies and functions. Defaults to the supplied
-- fallback when the key is absent, so a missing row never silently opens access.
create or replace function public.setting_bool(setting_key text, fallback boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select lower(s.value) in ('true','t','1','yes')
       from public.system_settings s where s.key = setting_key),
    fallback)
$$;

grant execute on function public.setting_bool(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Roles / permissions convenience view
-- ---------------------------------------------------------------------------
-- `role_permissions` stores role_id (FK to roles), and `permissions` stores
-- `code`. The admin screen thinks in role codes, so this view saves every
-- caller from repeating the join, and gives PostgREST a flat shape to read.
create or replace view public.role_permission_matrix as
select r.id       as role_id,
       r.code     as role_code,
       r.name     as role_name,
       r.rank     as role_rank,
       p.id       as permission_id,
       p.code     as permission_code,
       p.name     as permission_name,
       p.description,
       p.category,
       coalesce(rp.granted, false) as granted
from public.roles r
cross join public.permissions p
left join public.role_permissions rp
       on rp.role_id = r.id and rp.permission_id = p.id;

grant select on public.role_permission_matrix to authenticated;
-- ===========================================================================
-- 0008  Student upgrade management, specialization access, temporary access
-- ---------------------------------------------------------------------------
-- Additive only. Nothing existing is dropped or rewritten destructively.
--
-- The existing `student_access` table keeps working exactly as before; the new
-- tables sit alongside it and the access functions are extended to consult all
-- of them. Any student who already has access keeps it.
-- ===========================================================================

-- ------------------------------- enums -------------------------------------
do $$ begin
  create type upgrade_request_status as enum
    ('draft','submitted','under_review','more_information_required',
     'recommended','approved','declined','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type access_scope as enum ('course','module','specialization','level');
exception when duplicate_object then null; end $$;

do $$ begin
  create type spec_access_status as enum
    ('pending','active','expired','revoked','completed');
exception when duplicate_object then null; end $$;

-- --------------------------- upgrade requests ------------------------------
create table if not exists public.student_upgrade_requests (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.profiles(id) on delete cascade,
  requested_level       learning_level,
  requested_spec_id     uuid references public.specializations(id) on delete set null,
  reason                text not null default '',
  status                upgrade_request_status not null default 'draft',
  eligibility_snapshot  jsonb not null default '{}'::jsonb,
  coach_id              uuid references public.profiles(id) on delete set null,
  coach_recommended     boolean,
  coach_notes           text not null default '',
  coach_reviewed_at     timestamptz,
  manager_id            uuid references public.profiles(id) on delete set null,
  manager_notes         text not null default '',
  manager_reviewed_at   timestamptz,
  decision_notes        text not null default '',
  decided_by            uuid references public.profiles(id) on delete set null,
  decided_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint upgrade_request_target
    check (requested_level is not null or requested_spec_id is not null)
);

create index if not exists sur_student_idx on public.student_upgrade_requests (student_id, status);
create index if not exists sur_status_idx  on public.student_upgrade_requests (status, created_at desc);

-- Full decision trail. One row per action so nothing is overwritten.
create table if not exists public.student_upgrade_approvals (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.student_upgrade_requests(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_role  app_role,
  action      text not null,
  from_status upgrade_request_status,
  to_status   upgrade_request_status,
  notes       text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists sua_request_idx on public.student_upgrade_approvals (request_id, created_at);

-- ---------------------------- access history -------------------------------
create table if not exists public.student_access_history (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  action       text not null,
  scope        access_scope,
  level        learning_level,
  course_id    uuid references public.courses(id) on delete set null,
  spec_id      uuid references public.specializations(id) on delete set null,
  from_value   text not null default '',
  to_value     text not null default '',
  reason       text not null default '',
  effective_at timestamptz,
  expires_at   timestamptz,
  actor_id     uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists sah_student_idx on public.student_access_history (student_id, created_at desc);

-- ------------------------- specialization access ---------------------------
-- A student may hold several specializations, each with its own window.
-- This does not replace `student_specializations`; access checks accept either,
-- so existing rows continue to work untouched.
create table if not exists public.specialization_access (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  spec_id        uuid not null references public.specializations(id) on delete cascade,
  status         spec_access_status not null default 'active',
  starts_at      timestamptz not null default now(),
  expires_at     timestamptz,
  approved_by    uuid references public.profiles(id) on delete set null,
  approval_notes text not null default '',
  progress       numeric(5,2) not null default 0,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (student_id, spec_id)
);
create index if not exists sa_spec_student_idx on public.specialization_access (student_id, status);

-- ---------------------------- temporary access -----------------------------
-- Scope is one of course / module / specialization / level. Exactly one target
-- column is populated, enforced by the check below.
create table if not exists public.temporary_access (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  scope       access_scope not null,
  course_id   uuid references public.courses(id) on delete cascade,
  module_id   uuid references public.modules(id) on delete cascade,
  spec_id     uuid references public.specializations(id) on delete cascade,
  level       learning_level,
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  reason      text not null default '',
  granted_by  uuid references public.profiles(id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint temp_access_target check (
    (scope = 'course'         and course_id is not null and module_id is null and spec_id is null and level is null) or
    (scope = 'module'         and module_id is not null and course_id is null and spec_id is null and level is null) or
    (scope = 'specialization' and spec_id   is not null and course_id is null and module_id is null and level is null) or
    (scope = 'level'          and level     is not null and course_id is null and module_id is null and spec_id is null)
  ),
  -- NOTE: the window is validated on INSERT by a trigger rather than a CHECK.
  -- A CHECK would also forbid shortening a grant to expire it early, which is a
  -- normal revocation action.
  constraint temp_access_scope_target_present check (true)
);

create or replace function public.validate_temp_access_window()
returns trigger language plpgsql as $$
begin
  if new.expires_at <= new.starts_at then
    raise exception 'Temporary access must expire after it starts.';
  end if;
  return new;
end $$;

drop trigger if exists trg_temp_access_window on public.temporary_access;
create trigger trg_temp_access_window before insert on public.temporary_access
  for each row execute function public.validate_temp_access_window();
create index if not exists ta_student_idx on public.temporary_access (student_id, expires_at);
create index if not exists ta_live_idx     on public.temporary_access (student_id, scope) where revoked_at is null;

-- keep updated_at fresh on requests
drop trigger if exists trg_touch_sur on public.student_upgrade_requests;
create trigger trg_touch_sur before update on public.student_upgrade_requests
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- Access helpers
-- ===========================================================================

-- A temporary grant counts only while it is inside its window and not revoked.
create or replace function public.has_temp_access(
  uid uuid, want_scope access_scope, target uuid default null, want_level learning_level default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.temporary_access t
     where t.student_id = uid
       and t.scope = want_scope
       and t.revoked_at is null
       and t.starts_at <= now()
       and t.expires_at > now()
       and (
         (want_scope = 'course'         and t.course_id = target) or
         (want_scope = 'module'         and t.module_id = target) or
         (want_scope = 'specialization' and t.spec_id   = target) or
         (want_scope = 'level'          and t.level     = want_level)
       )
  )
$$;

-- Accepts the legacy table or the new one, so nothing regresses.
create or replace function public.has_specialization(uid uuid, sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_specializations ss
     where ss.student_id = uid and ss.specialization_id = sid
  ) or exists (
    select 1 from public.specialization_access sa
     where sa.student_id = uid and sa.spec_id = sid
       and sa.status in ('active','completed')
       and sa.starts_at <= now()
       and (sa.expires_at is null or sa.expires_at > now())
  ) or public.has_temp_access(uid, 'specialization', sid)
$$;

-- Level grant, now also satisfied by a live temporary level grant.
create or replace function public.has_level_grant(uid uuid, lvl learning_level)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_access sa
     where sa.student_id = uid
       and sa.level = lvl
       and sa.status in ('approved','active','temporarily_active','completed')
       and (sa.expires_at is null or sa.expires_at > now())
  ) or public.has_temp_access(uid, 'level', null, lvl)
$$;

-- ---------------------------------------------------------------------------
-- can_access_course: same rules as before, plus temporary grants and the new
-- specialization table. Order of checks is unchanged so behaviour is stable.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_course(cid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  c              public.courses%rowtype;
  sp             public.student_profiles%rowtype;
  enr            public.course_enrollments%rowtype;
  uid            uuid := auth.uid();
  missing_prereq int;
  temp_course    boolean;
begin
  if uid is null then return false; end if;
  if public.is_staff() then return true; end if;
  if not public.is_active_user() then return false; end if;

  select * into c from public.courses where id = cid and deleted_at is null;
  if not found or not c.is_published then return false; end if;

  select * into sp from public.student_profiles where user_id = uid;
  if not found then return false; end if;
  if sp.access_status in ('locked','suspended','expired','pending_approval') then return false; end if;

  -- A live temporary grant bypasses enrolment and the level gate, but never the
  -- account-status checks above. Both a course-scoped grant on this course and a
  -- level-scoped grant covering the course's level count: "temporary access to a
  -- whole level" is meaningless if the student must already be enrolled.
  temp_course := public.has_temp_access(uid, 'course', cid)
              or public.has_temp_access(uid, 'level', null, c.level);

  if not temp_course then
    select * into enr from public.course_enrollments
     where course_id = cid and student_id = uid;
    if not found then return false; end if;
    if enr.status not in ('active','approved','temporarily_active','completed') then return false; end if;
    if enr.expires_at is not null and enr.expires_at <= now() then return false; end if;

    if public.level_rank(c.level) > public.level_rank(sp.current_level)
       and not public.has_level_grant(uid, c.level) then
      return false;
    end if;

    if c.upgrade_required and not exists (
         select 1 from public.student_access sa
          where sa.student_id = uid and sa.course_id = cid
            and sa.status in ('approved','active','temporarily_active','completed')
            and (sa.expires_at is null or sa.expires_at > now()))
       and not public.has_level_grant(uid, c.level) then
      return false;
    end if;

    if c.specialization_id is not null
       and not public.has_specialization(uid, c.specialization_id) then
      return false;
    end if;

    if public.setting_bool('perm.enforce_prerequisites', true) then
      select count(*) into missing_prereq
        from public.course_prerequisites cp
       where cp.course_id = cid and cp.is_required
         and not exists (
           select 1 from public.course_enrollments e2
            where e2.student_id = uid and e2.course_id = cp.prerequisite_id
              and e2.completed_at is not null);
      if missing_prereq > 0 then return false; end if;
    end if;
  end if;

  return true;
end $$;

-- Lesson access additionally honours a module-scoped temporary grant.
create or replace function public.can_access_lesson(lid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare l public.lessons%rowtype;
        uid uuid := auth.uid();
begin
  select * into l from public.lessons where id = lid and deleted_at is null;
  if not found then return false; end if;
  if public.is_staff() then return true; end if;
  if not l.is_published then return false; end if;

  -- A live account is required before any shortcut below.
  if not public.is_active_user() then return false; end if;
  if exists (select 1 from public.student_profiles sp
              where sp.user_id = uid
                and sp.access_status in ('locked','suspended','expired','pending_approval'))
  then
    return false;
  end if;

  -- A temporary grant covering this lesson's module or course is itself the
  -- authorisation: it deliberately bypasses the level and specialization gates,
  -- which is the whole point of lending a student a course for a week.
  if public.has_temp_access(uid, 'module', l.module_id) then return true; end if;
  if public.has_temp_access(uid, 'course', l.course_id) then return true; end if;
  if public.has_temp_access(uid, 'level',  null, l.level) then return true; end if;

  if l.preview_available
     and public.setting_bool('perm.show_course_previews', true) then
    return true;
  end if;

  if not public.can_access_course(l.course_id) then return false; end if;

  if public.level_rank(l.required_student_level) > public.my_level_rank()
     and not public.has_level_grant(uid, l.required_student_level) then
    return false;
  end if;

  if l.required_specialization_id is not null
     and not public.has_specialization(uid, l.required_specialization_id) then
    return false;
  end if;

  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Expiry sweep. The access functions already treat an elapsed window as closed,
-- so this is about keeping stored statuses honest for reporting and the UI.
-- Safe to run repeatedly; call from pg_cron if the extension is available.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_access()
returns table (expired_temporary int, expired_specialization int,
               expired_grants int, expired_students int)
language plpgsql security definer set search_path = public as $$
declare t int; s int; g int; st int;
begin
  with x as (
    update public.temporary_access
       set revoked_at = now()
     where revoked_at is null and expires_at <= now()
     returning 1)
  select count(*) into t from x;

  with x as (
    update public.specialization_access
       set status = 'expired'
     where status = 'active' and expires_at is not null and expires_at <= now()
     returning 1)
  select count(*) into s from x;

  with x as (
    update public.student_access
       set status = 'expired'
     where status in ('approved','active','temporarily_active')
       and expires_at is not null and expires_at <= now()
     returning 1)
  select count(*) into g from x;

  with x as (
    update public.student_profiles
       set access_status = 'expired'
     where access_status = 'temporarily_active'
       and not exists (
         select 1 from public.student_access sa
          where sa.student_id = student_profiles.user_id
            and sa.status in ('approved','active','temporarily_active')
            and (sa.expires_at is null or sa.expires_at > now()))
       and not exists (
         select 1 from public.temporary_access ta
          where ta.student_id = student_profiles.user_id
            and ta.revoked_at is null and ta.expires_at > now())
     returning 1)
  select count(*) into st from x;

  return query select t, s, g, st;
end $$;

-- ---------------------------------------------------------------------------
-- Eligibility. Returns the facts; it never grants anything by itself.
-- ---------------------------------------------------------------------------
create or replace function public.upgrade_eligibility(uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  sp        public.student_profiles%rowtype;
  req_total int; req_done int; l1_done boolean; l2_done boolean;
begin
  select * into sp from public.student_profiles where user_id = uid;
  if not found then return '{}'::jsonb; end if;

  select count(*) filter (where c.level = 'level_1'),
         count(*) filter (where c.level = 'level_1' and e.completed_at is not null)
    into req_total, req_done
    from public.course_enrollments e
    join public.courses c on c.id = e.course_id
   where e.student_id = uid;

  l1_done := req_total > 0 and req_done = req_total;

  select count(*) > 0 and count(*) filter (where e.completed_at is null) = 0
    into l2_done
    from public.course_enrollments e
    join public.courses c on c.id = e.course_id
   where e.student_id = uid and c.level = 'level_2';

  return jsonb_build_object(
    'current_level',        sp.current_level,
    'access_status',        sp.access_status,
    'level1_courses_total', req_total,
    'level1_courses_done',  req_done,
    'level1_complete',      coalesce(l1_done,false),
    'level2_complete',      coalesce(l2_done,false),
    'eligible_level2',      coalesce(l1_done,false) and sp.current_level = 'level_1',
    'eligible_level3',      coalesce(l2_done,false) and sp.current_level = 'level_2',
    'auto_level2_access',   public.setting_bool('perm.auto_level2_access', false),
    'manual_level3',        public.setting_bool('perm.manual_level3_approval', true),
    'can_request',          public.setting_bool('perm.students_request_upgrade', true)
  );
end $$;

grant execute on function public.has_temp_access(uuid, access_scope, uuid, learning_level) to authenticated;
grant execute on function public.has_specialization(uuid, uuid) to authenticated;
grant execute on function public.expire_stale_access() to authenticated;
grant execute on function public.upgrade_eligibility(uuid) to authenticated;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.student_upgrade_requests  enable row level security;
alter table public.student_upgrade_approvals enable row level security;
alter table public.student_access_history    enable row level security;
alter table public.specialization_access     enable row level security;
alter table public.temporary_access          enable row level security;

alter table public.student_upgrade_requests  force row level security;
alter table public.student_upgrade_approvals force row level security;
alter table public.student_access_history    force row level security;
alter table public.specialization_access     force row level security;
alter table public.temporary_access          force row level security;

-- upgrade requests: a student sees and drafts their own; staff see their scope
drop policy if exists sur_select on public.student_upgrade_requests;
create policy sur_select on public.student_upgrade_requests for select using (
  student_id = auth.uid() or public.is_manager_up() or public.coaches_student(student_id)
);

drop policy if exists sur_insert on public.student_upgrade_requests;
create policy sur_insert on public.student_upgrade_requests for insert with check (
  (student_id = auth.uid()
     and public.setting_bool('perm.students_request_upgrade', true)
     and status in ('draft','submitted'))
  or public.is_staff()
);

-- A student may only edit their own request while it is still theirs to edit,
-- and may never move it to an approved state.
drop policy if exists sur_update on public.student_upgrade_requests;
create policy sur_update on public.student_upgrade_requests for update using (
  (student_id = auth.uid() and status in ('draft','submitted','more_information_required'))
  or public.is_manager_up()
  or public.coaches_student(student_id)
) with check (
  case
    when public.is_manager_up() then true
    when public.coaches_student(student_id) then
      status in ('under_review','more_information_required','recommended','submitted')
      or public.setting_bool('perm.coach_approve_upgrade', false)
    else student_id = auth.uid()
         and status in ('draft','submitted','cancelled')
  end
);

drop policy if exists sur_delete on public.student_upgrade_requests;
create policy sur_delete on public.student_upgrade_requests for delete using (public.is_manager_up());

-- approvals: readable with the parent request, written by staff only
drop policy if exists sua_select on public.student_upgrade_approvals;
create policy sua_select on public.student_upgrade_approvals for select using (
  exists (select 1 from public.student_upgrade_requests r
           where r.id = request_id
             and (r.student_id = auth.uid() or public.is_manager_up()
                  or public.coaches_student(r.student_id)))
);
drop policy if exists sua_insert on public.student_upgrade_approvals;
create policy sua_insert on public.student_upgrade_approvals for insert
  with check (public.is_staff());

-- access history: own history is visible, staff see their scope, nobody edits
drop policy if exists sah_select on public.student_access_history;
create policy sah_select on public.student_access_history for select using (
  student_id = auth.uid() or public.is_manager_up() or public.coaches_student(student_id)
);
drop policy if exists sah_insert on public.student_access_history;
create policy sah_insert on public.student_access_history for insert
  with check (public.is_staff());

-- specialization access: student reads own, managers write
drop policy if exists spa_select on public.specialization_access;
create policy spa_select on public.specialization_access for select using (
  student_id = auth.uid() or public.is_manager_up() or public.coaches_student(student_id)
);
drop policy if exists spa_write on public.specialization_access;
create policy spa_write on public.specialization_access for all
  using (public.is_manager_up()) with check (public.is_manager_up());

-- temporary access: student reads own, managers write
drop policy if exists ta_select on public.temporary_access;
create policy ta_select on public.temporary_access for select using (
  student_id = auth.uid() or public.is_manager_up() or public.coaches_student(student_id)
);
drop policy if exists ta_write on public.temporary_access;
create policy ta_write on public.temporary_access for all
  using (public.is_manager_up()) with check (public.is_manager_up());

grant select, insert, update, delete on
  public.student_upgrade_requests, public.specialization_access, public.temporary_access
  to authenticated;
grant select, insert on public.student_upgrade_approvals, public.student_access_history to authenticated;

-- ---------------------------------------------------------------------------
-- History is written by trigger so it cannot be skipped by a caller.
-- ---------------------------------------------------------------------------
create or replace function public.log_access_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'student_profiles' then
    if tg_op = 'UPDATE' and (old.current_level is distinct from new.current_level
                             or old.access_status is distinct from new.access_status) then
      insert into public.student_access_history
        (student_id, action, level, from_value, to_value, reason, actor_id)
      values (new.user_id,
              case when old.current_level is distinct from new.current_level
                   then 'level_changed' else 'status_changed' end,
              new.current_level,
              coalesce(old.current_level::text,'') || '/' || coalesce(old.access_status::text,''),
              coalesce(new.current_level::text,'') || '/' || coalesce(new.access_status::text,''),
              coalesce(new.upgrade_notes,''), auth.uid());
    end if;
    return new;
  end if;

  if tg_table_name = 'temporary_access' then
    insert into public.student_access_history
      (student_id, action, scope, level, course_id, spec_id, to_value,
       reason, effective_at, expires_at, actor_id)
    values (new.student_id, 'temporary_access_granted', new.scope, new.level,
            new.course_id, new.spec_id, new.scope::text,
            new.reason, new.starts_at, new.expires_at, auth.uid());
    return new;
  end if;

  if tg_table_name = 'specialization_access' then
    insert into public.student_access_history
      (student_id, action, scope, spec_id, to_value, reason, effective_at, expires_at, actor_id)
    values (new.student_id, 'specialization_access', 'specialization', new.spec_id,
            new.status::text, new.approval_notes, new.starts_at, new.expires_at, auth.uid());
    return new;
  end if;

  return new;
end $$;

drop trigger if exists trg_hist_student_profiles on public.student_profiles;
create trigger trg_hist_student_profiles after update on public.student_profiles
  for each row execute function public.log_access_change();

drop trigger if exists trg_hist_temp_access on public.temporary_access;
create trigger trg_hist_temp_access after insert on public.temporary_access
  for each row execute function public.log_access_change();

drop trigger if exists trg_hist_spec_access on public.specialization_access;
create trigger trg_hist_spec_access after insert or update on public.specialization_access
  for each row execute function public.log_access_change();
-- VA Success Academy V2.1: six resource cards and student payments
-- Additive and safe to run more than once.

create table if not exists public.resource_slots (
  id            bigserial primary key,
  slot_number   integer not null unique check (slot_number between 1 and 6),
  title         text not null default '',
  description   text not null default '',
  button_label  text not null default 'Open resource',
  google_url    text not null default '',
  is_active     boolean not null default true,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

insert into public.resource_slots (slot_number)
select generate_series(1, 6)
on conflict (slot_number) do nothing;

alter table public.resource_slots enable row level security;
drop policy if exists resource_slots_read on public.resource_slots;
create policy resource_slots_read on public.resource_slots
  for select to authenticated using (true);
drop policy if exists resource_slots_write on public.resource_slots;
create policy resource_slots_write on public.resource_slots
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.resource_slots to authenticated;
grant usage, select on sequence public.resource_slots_id_seq to authenticated;

alter table public.student_profiles
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists amount_paid numeric(12,2) not null default 0,
  add column if not exists total_amount numeric(12,2) not null default 0;

do $$ begin
  alter table public.student_profiles
    add constraint student_profiles_payment_status_check
    check (payment_status in ('unpaid','half_paid','paid'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.student_profiles
    add constraint student_profiles_payment_amounts_check
    check (amount_paid >= 0 and total_amount >= 0);
exception when duplicate_object then null; end $$;

create or replace function public.touch_resource_slot_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

drop trigger if exists trg_touch_resource_slots on public.resource_slots;
create trigger trg_touch_resource_slots before update on public.resource_slots
for each row execute function public.touch_resource_slot_updated_at();

-- ===========================================================================
-- V2.3 Public VA enrollment/application form
-- Safe to run more than once.
-- ===========================================================================
create table if not exists public.application_forms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  success_message text not null default 'Thank you. Your application has been received and our team will review it shortly.',
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.application_forms(id) on delete cascade,
  label text not null,
  help_text text not null default '',
  question_type text not null default 'text' check (question_type in ('text','textarea','email','phone','number','select','radio','checkbox')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.application_forms(id) on delete cascade,
  applicant_name text not null default '',
  applicant_email text not null default '',
  status text not null default 'new' check (status in ('new','reviewing','qualified','contacted','enrolled','declined','archived')),
  internal_notes text not null default '',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.application_form_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.application_form_submissions(id) on delete cascade,
  question_id uuid not null references public.application_form_questions(id) on delete cascade,
  answer jsonb not null default '""'::jsonb,
  created_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

create index if not exists application_questions_form_sort_idx on public.application_form_questions(form_id, sort_order);
create index if not exists application_submissions_form_date_idx on public.application_form_submissions(form_id, created_at desc);
create index if not exists application_answers_submission_idx on public.application_form_answers(submission_id);

insert into public.application_forms (slug, title, description, success_message)
values ('enrollment-application', 'Start Your VA Journey', 'Tell us about your background, goals, availability, and the support you need. This application helps VA Success Academy understand whether the program is the right fit for you.', 'Thank you for applying to VA Success Academy. Our team will review your answers and contact you using the details you provided.')
on conflict (slug) do nothing;

with f as (select id from public.application_forms where slug='enrollment-application')
insert into public.application_form_questions (form_id,label,help_text,question_type,options,is_required,sort_order)
select f.id, q.label, q.help_text, q.question_type, q.options::jsonb, q.is_required, q.sort_order
from f cross join (values
 ('What is your full name?','','text','[]',true,1),
 ('What is your email address?','','email','[]',true,2),
 ('What is your mobile or WhatsApp number?','Include your country code.','phone','[]',true,3),
 ('Where are you currently located?','City, province/state, and country.','text','[]',true,4),
 ('What is your age range?','','select','["18–24","25–34","35–44","45–54","55+"]',true,5),
 ('What best describes your current employment status?','','radio','["Employed full-time","Employed part-time","Freelancing","Business owner","Student","Currently not employed"]',true,6),
 ('Have you worked as a Virtual Assistant before?','','radio','["Yes, currently","Yes, previously","No, but I have related experience","No, I am completely new"]',true,7),
 ('How many years of professional work experience do you have?','','select','["Less than 1 year","1–2 years","3–5 years","6–10 years","More than 10 years"]',true,8),
 ('Briefly describe your work experience.','','textarea','[]',true,9),
 ('Which VA services are you most interested in learning?','Select all that apply.','checkbox','["General Virtual Assistance","Email Marketing","Social Media Management","Web Design","Customer Support","Lead Generation","CRM and Automation","Bookkeeping/Admin","Executive Assistance","Not sure yet"]',true,10),
 ('Which tools have you used before?','Examples: Canva, Google Workspace, WordPress, HubSpot, ActiveCampaign, GoHighLevel, ClickUp.','textarea','[]',false,11),
 ('How would you rate your computer skills?','','radio','["Beginner","Basic","Intermediate","Advanced"]',true,12),
 ('Do you have a reliable computer or laptop?','','radio','["Yes","Not yet, but I plan to get one","No"]',true,13),
 ('How reliable is your internet connection?','','radio','["Very reliable","Usually reliable with backup","Sometimes unstable","I still need to arrange reliable internet"]',true,14),
 ('Do you have a backup internet or power option?','','radio','["Both backup internet and power","Backup internet only","Backup power only","Neither yet"]',true,15),
 ('How many hours per week can you dedicate to training?','','select','["Less than 5 hours","5–10 hours","11–20 hours","More than 20 hours"]',true,16),
 ('What days and times are you usually available for training?','Please include your time zone.','textarea','[]',true,17),
 ('Are you comfortable attending live Zoom sessions?','','radio','["Yes","Sometimes, depending on schedule","I prefer recorded lessons only"]',true,18),
 ('What is your main reason for becoming a Virtual Assistant?','','textarea','[]',true,19),
 ('What is your biggest challenge in starting or growing your VA career?','','textarea','[]',true,20),
 ('What result would make this program successful for you?','','textarea','[]',true,21),
 ('How soon do you want to start?','','select','["Immediately","Within 2 weeks","Within 1 month","Within 2–3 months","Still exploring"]',true,22),
 ('How did you hear about VA Success Academy?','','select','["Facebook","Instagram","TikTok","LinkedIn","Google","Friend or family referral","Existing student","Other"]',true,23),
 ('Are you prepared to invest in training if accepted?','','radio','["Yes","Yes, but I may need a payment option","I need more information first","Not at this time"]',true,24),
 ('Is there anything else you would like us to know about you?','','textarea','[]',false,25)
) as q(label,help_text,question_type,options,is_required,sort_order)
where not exists (select 1 from public.application_form_questions aq where aq.form_id=f.id);

alter table public.application_forms enable row level security;
alter table public.application_form_questions enable row level security;
alter table public.application_form_submissions enable row level security;
alter table public.application_form_answers enable row level security;

drop policy if exists public_read_published_application_forms on public.application_forms;
create policy public_read_published_application_forms on public.application_forms for select to anon, authenticated using (is_published or public.is_owner());
drop policy if exists owner_manage_application_forms on public.application_forms;
create policy owner_manage_application_forms on public.application_forms for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists public_read_active_application_questions on public.application_form_questions;
create policy public_read_active_application_questions on public.application_form_questions for select to anon, authenticated using (is_active or public.is_owner());
drop policy if exists owner_manage_application_questions on public.application_form_questions;
create policy owner_manage_application_questions on public.application_form_questions for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists public_create_application_submissions on public.application_form_submissions;
create policy public_create_application_submissions on public.application_form_submissions for insert to anon, authenticated with check (true);
drop policy if exists owner_manage_application_submissions on public.application_form_submissions;
create policy owner_manage_application_submissions on public.application_form_submissions for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists public_create_application_answers on public.application_form_answers;
create policy public_create_application_answers on public.application_form_answers for insert to anon, authenticated with check (true);
drop policy if exists owner_read_application_answers on public.application_form_answers;
create policy owner_read_application_answers on public.application_form_answers for select to authenticated using (public.is_owner());

grant select on public.application_forms, public.application_form_questions to anon, authenticated;
grant insert on public.application_form_submissions, public.application_form_answers to anon, authenticated;
grant select, insert, update, delete on public.application_forms, public.application_form_questions, public.application_form_submissions, public.application_form_answers to authenticated;

-- Submit a public form atomically without exposing applicants to anonymous SELECT.
create or replace function public.submit_public_application(form_slug text, submitted_answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_form public.application_forms%rowtype;
  new_submission_id uuid;
  applicant_name_value text := '';
  applicant_email_value text := '';
begin
  select * into target_form
  from public.application_forms
  where slug = form_slug and is_published = true;

  if target_form.id is null then
    raise exception 'This application form is not available.';
  end if;

  select coalesce(submitted_answers ->> q.id::text, '') into applicant_name_value
  from public.application_form_questions q
  where q.form_id = target_form.id and lower(q.label) like '%full name%'
  order by q.sort_order limit 1;

  select coalesce(submitted_answers ->> q.id::text, '') into applicant_email_value
  from public.application_form_questions q
  where q.form_id = target_form.id and q.question_type = 'email'
  order by q.sort_order limit 1;

  insert into public.application_form_submissions(form_id, applicant_name, applicant_email, status)
  values(target_form.id, coalesce(applicant_name_value,''), coalesce(applicant_email_value,''), 'new')
  returning id into new_submission_id;

  insert into public.application_form_answers(submission_id, question_id, answer)
  select new_submission_id, q.id, coalesce(submitted_answers -> q.id::text, '""'::jsonb)
  from public.application_form_questions q
  where q.form_id = target_form.id and q.is_active = true;

  return new_submission_id;
end;
$$;

grant execute on function public.submit_public_application(text, jsonb) to anon, authenticated;

-- VA Success Academy V2.4: allow staff to add unlimited resource cards.
-- Safe to run more than once.
alter table public.resource_slots
  drop constraint if exists resource_slots_slot_number_check;

alter table public.resource_slots
  add constraint resource_slots_slot_number_check check (slot_number >= 1);

-- ============================================================================
-- V2.5: targeted notifications, rich announcements, media, avatars and referrals
-- Safe to run more than once.
-- ============================================================================

alter table public.notifications add column if not exists notification_type text not null default 'general';
alter table public.notifications add column if not exists sender_name text;
alter table public.notifications add column if not exists sender_email text;
alter table public.notifications add column if not exists action_label text;
alter table public.notifications add column if not exists external_url text;
alter table public.notifications add column if not exists details text;
alter table public.notifications add column if not exists created_by uuid references public.profiles(id) on delete set null;

do $$ begin
  alter table public.notifications add constraint notifications_type_check
    check (notification_type in ('general','zoom_invitation','access_request','email'));
exception when duplicate_object then null; end $$;

alter table public.announcements add column if not exists summary text not null default '';
alter table public.announcements add column if not exists banner_url text;
alter table public.profiles add column if not exists avatar_choice text;
alter table public.student_profiles add column if not exists referred_by_coach uuid references public.profiles(id) on delete set null;

do $$ begin
  alter table public.profiles add constraint profiles_avatar_choice_check
    check (avatar_choice is null or avatar_choice in ('male','female','custom'));
exception when duplicate_object then null; end $$;

create index if not exists idx_student_profiles_referred_by_coach on public.student_profiles(referred_by_coach);
create index if not exists idx_notifications_created_by on public.notifications(created_by);

-- Staff may create personal notifications. Each recipient still reads only their own.
drop policy if exists "staff create notifications" on public.notifications;
create policy "staff create notifications" on public.notifications for insert to authenticated
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('coach','manager','owner'))
);

-- Users can update their own profile photo/avatar selection.
drop policy if exists "users update own profile image" on public.profiles;
create policy "users update own profile image" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- Managers and owners assign referral ownership.
drop policy if exists "management update student referrals" on public.student_profiles;
create policy "management update student referrals" on public.student_profiles for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','owner')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','owner')));

-- Public media bucket for logos, profile photos and announcement banners.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academy-media','academy-media',true,5242880,array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'];

drop policy if exists "academy media public read" on storage.objects;
create policy "academy media public read" on storage.objects for select to public
using (bucket_id = 'academy-media');

drop policy if exists "authenticated upload academy media" on storage.objects;
create policy "authenticated upload academy media" on storage.objects for insert to authenticated
with check (bucket_id = 'academy-media');

drop policy if exists "owners update academy media" on storage.objects;
create policy "owners update academy media" on storage.objects for update to authenticated
using (bucket_id = 'academy-media' and owner_id = auth.uid()::text)
with check (bucket_id = 'academy-media');

drop policy if exists "owners delete academy media" on storage.objects;
create policy "owners delete academy media" on storage.objects for delete to authenticated
using (bucket_id = 'academy-media' and owner_id = auth.uid()::text);

notify pgrst, 'reload schema';

-- ============================================================================
-- V2.6: audiences, flexible branding, multiple forms, question badge,
-- coach-submitted paid upgrade requests and configurable approval requirements.
-- Safe to run more than once.
-- ============================================================================

alter table public.notifications add column if not exists audience text not null default 'individual';
do $$ begin
  alter table public.notifications add constraint notifications_audience_check
    check (audience in ('individual','all','students','coaches'));
exception when duplicate_object then null; end $$;

alter table public.branding_settings add column if not exists description text not null default '';
alter table public.branding_settings add column if not exists website_url text not null default '';
alter table public.branding_settings add column if not exists facebook_url text not null default '';
alter table public.branding_settings add column if not exists instagram_url text not null default '';
alter table public.branding_settings add column if not exists linkedin_url text not null default '';
alter table public.branding_settings add column if not exists youtube_url text not null default '';

-- Add coaches-only audience without replacing existing announcement data.
-- The enum value is added here, while the check uses ::text so this complete file can
-- run in one SQL Editor execution without PostgreSQL's new-enum-value transaction error.
do $$ begin
  alter type public.announcement_audience add value if not exists 'coaches';
exception when duplicate_object then null; end $$;
alter table public.announcements drop constraint if exists announcements_audience_check;
alter table public.announcements add constraint announcements_audience_check
  check (audience::text in ('global','course','batch','student','coaches'));

-- Upgrade payment/reviewer fields.
alter table public.student_upgrade_requests add column if not exists requested_by uuid references public.profiles(id) on delete set null;
alter table public.student_upgrade_requests add column if not exists is_paid boolean not null default false;
alter table public.student_upgrade_requests add column if not exists payment_amount numeric(12,2) not null default 0;
alter table public.student_upgrade_requests add column if not exists payment_proof_url text;
alter table public.student_upgrade_requests add column if not exists manager_approved boolean not null default false;
alter table public.student_upgrade_requests add column if not exists owner_approved boolean not null default false;
alter table public.student_upgrade_requests add column if not exists coach_approved boolean not null default false;

-- Owner-only configurable approval requirements. Values can be edited in System Settings.
insert into public.system_settings(key, value, description)
values
 ('approval.money.require_manager','true','Require Manager approval for money-related actions.'),
 ('approval.money.require_owner','true','Require Owner approval for money-related actions.'),
 ('approval.money.require_coach','false','Also require Coach approval for money-related actions.')
on conflict (key) do nothing;

-- Coaches may submit upgrade requests for students; students may submit their own.
drop policy if exists "submit upgrade request" on public.student_upgrade_requests;
create policy "submit upgrade request" on public.student_upgrade_requests for insert to authenticated
with check (
  (student_id = auth.uid() and requested_by = auth.uid())
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('coach','manager','owner'))
);

-- Notification sending rules by role and target role.
drop policy if exists "staff create notifications" on public.notifications;
drop policy if exists "role based notification sending" on public.notifications;
create policy "role based notification sending" on public.notifications for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles sender
    join public.profiles recipient on recipient.id = user_id
    where sender.id = auth.uid()
      and (
        sender.role in ('owner','manager')
        or (sender.role='coach' and recipient.role in ('coach','student'))
        or (sender.role='student' and recipient.role='coach')
      )
  )
);

-- All coaches can view all students; referral ownership remains private in the UI.
drop policy if exists "staff read student profiles" on public.student_profiles;
create policy "staff read student profiles" on public.student_profiles for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('coach','manager','owner'))
);

notify pgrst, 'reload schema';

-- ============================================================================
-- V2.7: private internal notes for upgrade requests
-- Visible only to coaches, managers, and owners. Students cannot read or write.
-- Safe to run more than once.
-- ============================================================================

create table if not exists public.student_upgrade_internal_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.student_upgrade_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suin_request_created_idx
  on public.student_upgrade_internal_notes(request_id, created_at);

alter table public.student_upgrade_internal_notes enable row level security;
alter table public.student_upgrade_internal_notes force row level security;

drop policy if exists "staff read upgrade internal notes" on public.student_upgrade_internal_notes;
create policy "staff read upgrade internal notes"
on public.student_upgrade_internal_notes for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('coach','manager','owner')
  )
);

drop policy if exists "staff add upgrade internal notes" on public.student_upgrade_internal_notes;
create policy "staff add upgrade internal notes"
on public.student_upgrade_internal_notes for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('coach','manager','owner')
  )
  and exists (
    select 1 from public.student_upgrade_requests r where r.id = request_id
  )
);

drop policy if exists "authors update own upgrade internal notes" on public.student_upgrade_internal_notes;
create policy "authors update own upgrade internal notes"
on public.student_upgrade_internal_notes for update to authenticated
using (
  author_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('coach','manager','owner')
  )
)
with check (author_id = auth.uid());

grant select, insert, update on public.student_upgrade_internal_notes to authenticated;

notify pgrst, 'reload schema';


-- ============================================================================
-- V2.8: Light and dark appearance preferences
-- Owner controls the academy default; each signed-in user can save light/dark.
-- ============================================================================

alter table public.branding_settings
  add column if not exists default_theme text not null default 'light';

alter table public.profiles
  add column if not exists theme_preference text;

do $$ begin
  alter table public.branding_settings add constraint branding_settings_default_theme_check check (default_theme in ('light','dark'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_theme_preference_check check (theme_preference is null or theme_preference in ('light','dark'));
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

-- =====================================================================
-- V2.9 — General/private questions and audience-aware badges
-- =====================================================================
alter table public.questions add column if not exists audience text not null default 'coach_team';
alter table public.questions add column if not exists student_last_viewed_at timestamptz;

do $$ begin
  alter table public.questions add constraint questions_audience_check
    check (audience in ('private_coach','coach_team','general'));
exception when duplicate_object then null; end $$;

update public.questions set audience = case when assigned_to is not null then 'private_coach' else 'coach_team' end
where audience is null or audience not in ('private_coach','coach_team','general');

-- Students can read their own questions and anonymous General Q&A questions.
-- Staff can read questions relevant to their role. Owners/managers see all.
drop policy if exists q_read on public.questions;
create policy q_read on public.questions for select to authenticated using (
  student_id = auth.uid()
  or audience = 'general'
  or exists (
    select 1 from public.profiles viewer
    where viewer.id = auth.uid() and viewer.role in ('owner','manager')
  )
  or exists (
    select 1 from public.profiles viewer
    where viewer.id = auth.uid() and viewer.role = 'coach'
      and (audience in ('general','coach_team') or assigned_to = auth.uid())
  )
);

-- A student may create only their own question. One-coach questions require a target coach.
drop policy if exists q_insert on public.questions;
create policy q_insert on public.questions for insert to authenticated with check (
  student_id = auth.uid()
  and public.is_active_user()
  and (
    (audience in ('general','coach_team') and assigned_to is null)
    or (audience = 'private_coach' and assigned_to is not null and exists (
      select 1 from public.profiles c where c.id = assigned_to and c.role = 'coach' and c.is_active
    ))
  )
);

-- General replies are readable by all authenticated users, but internal notes remain staff-only.
drop policy if exists qr_read on public.question_replies;
create policy qr_read on public.question_replies for select to authenticated using (
  public.is_staff()
  or (
    not is_internal and exists (
      select 1 from public.questions q where q.id = question_id
      and (q.student_id = auth.uid() or q.audience = 'general')
    )
  )
);

create or replace function public.mark_question_read(target_question_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.questions set student_last_viewed_at = now()
  where id = target_question_id and student_id = auth.uid();
end $$;
grant execute on function public.mark_question_read(uuid) to authenticated;

create or replace function public.get_question_badge_count()
returns integer language plpgsql stable security definer set search_path=public as $$
declare viewer public.profiles%rowtype; total integer := 0;
begin
  select * into viewer from public.profiles where id = auth.uid();
  if viewer.id is null then return 0; end if;

  if viewer.role = 'student' then
    select count(distinct q.id)::integer into total
    from public.questions q
    join public.question_replies r on r.question_id = q.id
    join public.profiles a on a.id = r.author_id
    where q.student_id = auth.uid()
      and not r.is_internal
      and a.role in ('coach','manager','owner')
      and r.created_at > coalesce(q.student_last_viewed_at, q.created_at);
  elsif viewer.role = 'coach' then
    select count(*)::integer into total from public.questions q
    where q.status in ('new','in_review','needs_information')
      and (q.audience in ('general','coach_team') or q.assigned_to = auth.uid());
  else
    select count(*)::integer into total from public.questions q
    where q.status in ('new','in_review','needs_information');
  end if;
  return coalesce(total,0);
end $$;
grant execute on function public.get_question_badge_count() to authenticated;

notify pgrst, 'reload schema';

-- V2.9 privacy hardening: private-to-one-coach questions are inaccessible to unrelated coaches.
drop policy if exists q_staff_update on public.questions;
drop policy if exists q_staff_manage on public.questions;
create policy q_staff_manage on public.questions for all to authenticated using (
  exists (select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.role in ('owner','manager'))
  or exists (
    select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.role='coach'
    and (questions.audience in ('general','coach_team') or questions.assigned_to=auth.uid())
  )
) with check (
  exists (select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.role in ('owner','manager'))
  or exists (
    select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.role='coach'
    and (questions.audience in ('general','coach_team') or questions.assigned_to=auth.uid())
  )
);

drop policy if exists qr_read on public.question_replies;
create policy qr_read on public.question_replies for select to authenticated using (
  exists (
    select 1 from public.questions q
    where q.id = question_id
      and (
        (not question_replies.is_internal and (q.student_id=auth.uid() or q.audience='general'))
        or exists (select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.role in ('owner','manager'))
        or exists (
          select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.role='coach'
          and (q.audience in ('general','coach_team') or q.assigned_to=auth.uid())
        )
      )
  )
);

notify pgrst, 'reload schema';


-- V2.12: Safe coach directory for student private-question selection
create or replace function public.get_active_coach_directory()
returns table (
  id uuid,
  full_name text,
  email text,
  avatar_url text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, p.email, p.avatar_url
  from public.profiles p
  where p.role = 'coach'
    and coalesce(p.is_active, true) = true
    and p.deleted_at is null
  order by coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1));
$$;

revoke all on function public.get_active_coach_directory() from public;
grant execute on function public.get_active_coach_directory() to authenticated;

notify pgrst, 'reload schema';
