-- VA Success Academy V2.16: cumulative level access and reliable role loading.
-- A Level 3 grant covers Levels 1-3; a Level 2 grant covers Levels 1-2.

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
         (want_scope = 'level' and t.level is not null and want_level is not null
          and public.level_rank(t.level) >= public.level_rank(want_level))
       )
  )
$$;

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

notify pgrst, 'reload schema';
