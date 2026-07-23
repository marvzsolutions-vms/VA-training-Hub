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
