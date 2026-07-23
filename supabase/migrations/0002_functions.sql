-- =====================================================================
-- VA Success Academy — 0002 Access functions
-- Every function is SECURITY DEFINER so RLS policies can call them
-- without recursing into the policies of the tables they read.
-- =====================================================================

create or replace function public.my_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active and deleted_at is null
                   from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'owner'
$$;

create or replace function public.is_manager_up()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() in ('manager','owner')
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() in ('coach','manager','owner')
$$;

create or replace function public.has_permission(perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
      join public.permissions p on p.id = rp.permission_id
     where r.code = public.my_role() and p.code = perm and rp.granted
  )
$$;

create or replace function public.level_rank(l learning_level)
returns int language sql immutable as $$
  select case l when 'level_1' then 1 when 'level_2' then 2 else 3 end
$$;

create or replace function public.my_level_rank()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select public.level_rank(current_level)
                   from public.student_profiles where user_id = auth.uid()), 0)
$$;

-- Does the student hold an explicit, unexpired grant for a level?
create or replace function public.has_level_grant(uid uuid, lvl learning_level)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_access sa
     where sa.student_id = uid
       and sa.level = lvl
       and sa.status in ('approved','active','temporarily_active','completed')
       and (sa.expires_at is null or sa.expires_at > now())
  )
$$;

-- Core rule: may the current user open this course?
-- Staff always may. A student needs an active account, an active enrolment,
-- a sufficient learning level (or an explicit grant), the required
-- specialization, and every required prerequisite completed.
create or replace function public.can_access_course(cid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  c            public.courses%rowtype;
  sp           public.student_profiles%rowtype;
  enr          public.course_enrollments%rowtype;
  uid          uuid := auth.uid();
  missing_prereq int;
begin
  if uid is null then return false; end if;
  if public.is_staff() then return true; end if;
  if not public.is_active_user() then return false; end if;

  select * into c from public.courses where id = cid and deleted_at is null;
  if not found or not c.is_published then return false; end if;

  select * into sp from public.student_profiles where user_id = uid;
  if not found then return false; end if;
  if sp.access_status in ('locked','suspended','expired','pending_approval') then return false; end if;

  select * into enr from public.course_enrollments
   where course_id = cid and student_id = uid;
  if not found then return false; end if;
  if enr.status not in ('active','approved','temporarily_active','completed') then return false; end if;
  if enr.expires_at is not null and enr.expires_at <= now() then return false; end if;

  -- level gate: rank must be sufficient, or an explicit grant must exist
  if public.level_rank(c.level) > public.level_rank(sp.current_level)
     and not public.has_level_grant(uid, c.level) then
    return false;
  end if;

  -- an explicit per-course grant may also unlock an upgrade-required course
  if c.upgrade_required and not exists (
       select 1 from public.student_access sa
        where sa.student_id = uid and sa.course_id = cid
          and sa.status in ('approved','active','temporarily_active','completed')
          and (sa.expires_at is null or sa.expires_at > now()))
     and not public.has_level_grant(uid, c.level) then
    return false;
  end if;

  -- specialization gate
  if c.specialization_id is not null and not exists (
       select 1 from public.student_specializations ss
        where ss.student_id = uid and ss.specialization_id = c.specialization_id) then
    return false;
  end if;

  -- prerequisite gate
  select count(*) into missing_prereq
    from public.course_prerequisites cp
   where cp.course_id = cid and cp.is_required
     and not exists (
       select 1 from public.course_enrollments e2
        where e2.student_id = uid and e2.course_id = cp.prerequisite_id
          and e2.completed_at is not null);
  if missing_prereq > 0 then return false; end if;

  return true;
end $$;

create or replace function public.can_access_lesson(lid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare l public.lessons%rowtype;
begin
  select * into l from public.lessons where id = lid and deleted_at is null;
  if not found then return false; end if;
  if public.is_staff() then return true; end if;
  if not l.is_published then return false; end if;

  -- Every student route below requires a live account. This check has to come
  -- BEFORE the free-preview shortcut: "preview" means the lesson skips the
  -- enrolment and level gates, not that a suspended or deactivated account
  -- still gets to read it.
  if not public.is_active_user() then return false; end if;
  if exists (select 1 from public.student_profiles sp
              where sp.user_id = auth.uid()
                and sp.access_status in ('locked','suspended','expired','pending_approval'))
  then
    return false;
  end if;

  if l.preview_available then return true; end if;
  if not public.can_access_course(l.course_id) then return false; end if;
  if public.level_rank(l.required_student_level) > public.my_level_rank()
     and not public.has_level_grant(auth.uid(), l.required_student_level) then
    return false;
  end if;
  if l.required_specialization_id is not null and not exists (
       select 1 from public.student_specializations ss
        where ss.student_id = auth.uid()
          and ss.specialization_id = l.required_specialization_id) then
    return false;
  end if;
  return true;
end $$;

-- Coaches only see the students in the batches they run.
create or replace function public.coaches_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager_up() or exists (
    select 1
      from public.batch_students bs
      join public.batches b on b.id = bs.batch_id
     where bs.student_id = sid and b.coach_id = auth.uid()
  )
$$;

-- Recompute course + level progress after a lesson is completed.
create or replace function public.recompute_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sid uuid := coalesce(new.student_id, old.student_id);
  cid uuid := coalesce(new.course_id, old.course_id);
  total int; done int; pct numeric(5,2);
  lvl_total int; lvl_done int;
begin
  select count(*) into total
    from public.lessons where course_id = cid and is_required and is_published and deleted_at is null;
  select count(*) into done
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id and l.is_required and l.is_published
   where lp.student_id = sid and lp.course_id = cid and lp.is_completed;

  pct := case when total = 0 then 0 else round((done::numeric / total) * 100, 2) end;

  update public.course_enrollments
     set progress = pct,
         completed_at = case when total > 0 and done >= total then now() else null end,
         status = case when total > 0 and done >= total then 'completed'::access_status else status end
   where student_id = sid and course_id = cid;

  select count(*) into lvl_total
    from public.lessons l join public.courses c on c.id = l.course_id
    join public.course_enrollments e on e.course_id = c.id and e.student_id = sid
   where l.is_required and l.is_published and l.deleted_at is null
     and c.level = (select current_level from public.student_profiles where user_id = sid);
  select count(*) into lvl_done
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    join public.courses c on c.id = l.course_id
   where lp.student_id = sid and lp.is_completed and l.is_required
     and c.level = (select current_level from public.student_profiles where user_id = sid);

  update public.student_profiles
     set level_progress = case when lvl_total = 0 then 0
                          else round((lvl_done::numeric / lvl_total) * 100, 2) end,
         last_activity_at = now(),
         level2_eligible = case when current_level = 'level_1' and lvl_total > 0
                                     and lvl_done >= lvl_total then true else level2_eligible end
   where user_id = sid;

  return null;
end $$;

drop trigger if exists trg_recompute_progress on public.lesson_progress;
create trigger trg_recompute_progress after insert or update or delete on public.lesson_progress
for each row execute function public.recompute_progress();

-- Managers may not touch the Owner. Enforced in the database, not the UI.
create or replace function public.protect_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' and not public.is_owner() then
      raise exception 'Only an Owner can remove an Owner account.';
    end if;
    return old;
  end if;

  if old.role = 'owner' and new.role <> 'owner' and not public.is_owner() then
    raise exception 'Only an Owner can change Owner access.';
  end if;
  if new.role = 'owner' and old.role <> 'owner' and not public.is_owner() then
    raise exception 'Only an Owner can grant Owner access.';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_owner on public.profiles;
create trigger trg_protect_owner before update or delete on public.profiles
for each row execute function public.protect_owner();

-- Lightweight audit trail on the tables that matter.
create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, table_name, record_id, before_data, after_data)
  values (auth.uid(), tg_op, tg_table_name,
          -- Audited tables do not all use uuid primary keys (branding_settings
          -- uses an int, system_settings uses a text key), so only cast when the
          -- value actually looks like a uuid.
          (select case when v ~ '^[0-9a-fA-F-]{36}$' then v::uuid end
             from (select case when tg_op = 'DELETE' then to_jsonb(old)->>'id'
                               else to_jsonb(new)->>'id' end as v) q),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','courses','student_access','course_enrollments',
                           'branding_settings','system_settings'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.write_audit()', t);
  end loop;
end $$;
