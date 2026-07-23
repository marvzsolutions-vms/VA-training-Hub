-- ===========================================================================
-- 0012  Role-aware Upgrade Requests sidebar badge
-- ===========================================================================

create or replace function public.get_upgrade_request_badge_count()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  viewer_role public.app_role;
  total integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select p.role
    into viewer_role
    from public.profiles p
   where p.id = auth.uid()
     and p.is_active = true;

  if viewer_role is null or viewer_role = 'student' then
    return 0;
  end if;

  if viewer_role = 'owner' then
    select count(*)::integer
      into total
      from public.student_upgrade_requests r
     where r.status in (
       'submitted',
       'under_review',
       'more_information_required',
       'recommended'
     );

  elsif viewer_role = 'manager' then
    -- Manager-stage work: active review, requests returned for information,
    -- and coach recommendations awaiting a final decision.
    select count(*)::integer
      into total
      from public.student_upgrade_requests r
     where r.status in (
       'under_review',
       'more_information_required',
       'recommended'
     );

  elsif viewer_role = 'coach' then
    -- Only requests visible to this coach and still awaiting coach review or
    -- recommendation. public.coaches_student() mirrors the existing RLS scope.
    select count(*)::integer
      into total
      from public.student_upgrade_requests r
     where r.status in (
       'submitted',
       'under_review',
       'more_information_required'
     )
       and public.coaches_student(r.student_id);
  else
    return 0;
  end if;

  return coalesce(total, 0);
end;
$$;

revoke all on function public.get_upgrade_request_badge_count() from public;
revoke all on function public.get_upgrade_request_badge_count() from anon;
grant execute on function public.get_upgrade_request_badge_count() to authenticated;

notify pgrst, 'reload schema';
