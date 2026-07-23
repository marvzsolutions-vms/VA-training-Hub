-- VA Success Academy V2.17: level access engine refactor.
-- student_profiles.current_level is the permanent level source of truth.
-- Standard courses (no specialization_id) unlock cumulatively by level and do
-- not require a manual course_enrollments row. Required prerequisites remain
-- enforced. Specialized courses keep their explicit assignment rules.

-- Remove duplicate legacy level grants before protecting the table.
with ranked as (
  select id,
         row_number() over (
           partition by student_id, level
           order by
             case when status in ('approved','active','temporarily_active','completed') then 0 else 1 end,
             granted_at desc,
             id desc
         ) as rn
    from public.student_access
   where level is not null
     and course_id is null
)
delete from public.student_access sa
 using ranked r
 where sa.id = r.id
   and r.rn > 1;

create unique index if not exists uq_student_access_level_grant
  on public.student_access (student_id, level)
  where level is not null and course_id is null;

-- Legacy level grants remain readable for temporary/backward-compatible flows,
-- but permanent standard-course access is determined by current_level.
create or replace function public.has_level_grant(uid uuid, lvl learning_level)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_access sa
     where sa.student_id = uid
       and sa.level is not null
       and public.level_rank(sa.level) >= public.level_rank(lvl)
       and sa.status in ('approved','active','temporarily_active','completed')
       and (sa.expires_at is null or sa.expires_at > now())
  ) or public.has_temp_access(uid, 'level', null, lvl)
$$;

create or replace function public.can_access_course(cid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  c              public.courses%rowtype;
  sp             public.student_profiles%rowtype;
  enr            public.course_enrollments%rowtype;
  uid            uuid := auth.uid();
  missing_prereq int;
  course_granted boolean;
begin
  if uid is null then return false; end if;
  if public.is_staff() then return true; end if;
  if not public.is_active_user() then return false; end if;

  select * into c from public.courses where id = cid and deleted_at is null;
  if not found or not c.is_published then return false; end if;

  select * into sp from public.student_profiles where user_id = uid;
  if not found then return false; end if;
  if sp.access_status in ('locked','suspended','expired','pending_approval') then return false; end if;

  -- Temporary course/level grants remain deliberate exceptions.
  if public.has_temp_access(uid, 'course', cid)
     or public.has_temp_access(uid, 'level', null, c.level) then
    return true;
  end if;

  -- Standard level-based courses: cumulative access from current_level only.
  if c.specialization_id is null then
    if public.level_rank(c.level) > public.level_rank(sp.current_level) then
      return false;
    end if;

    if public.setting_bool('perm.enforce_prerequisites', true) then
      select count(*) into missing_prereq
        from public.course_prerequisites cp
       where cp.course_id = cid and cp.is_required
         and not exists (
           select 1 from public.course_enrollments e2
            where e2.student_id = uid
              and e2.course_id = cp.prerequisite_id
              and e2.completed_at is not null);
      if missing_prereq > 0 then return false; end if;
    end if;

    return true;
  end if;

  -- Specialized courses retain explicit specialization plus assignment access.
  if not public.has_specialization(uid, c.specialization_id) then return false; end if;

  course_granted := exists (
    select 1 from public.student_access sa
     where sa.student_id = uid
       and sa.course_id = cid
       and sa.status in ('approved','active','temporarily_active','completed')
       and (sa.expires_at is null or sa.expires_at > now())
  );

  select * into enr from public.course_enrollments
   where course_id = cid and student_id = uid;

  if not course_granted then
    if not found then return false; end if;
    if enr.status not in ('active','approved','temporarily_active','completed') then return false; end if;
    if enr.expires_at is not null and enr.expires_at <= now() then return false; end if;
  end if;

  if public.setting_bool('perm.enforce_prerequisites', true) then
    select count(*) into missing_prereq
      from public.course_prerequisites cp
     where cp.course_id = cid and cp.is_required
       and not exists (
         select 1 from public.course_enrollments e2
          where e2.student_id = uid
            and e2.course_id = cp.prerequisite_id
            and e2.completed_at is not null);
    if missing_prereq > 0 then return false; end if;
  end if;

  return true;
end $$;

notify pgrst, 'reload schema';
