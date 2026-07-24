-- V2.19 Owner-only deletion controls.
-- All authorization is resolved server-side from auth.uid().

create or replace function public.owner_delete_record(target_type text, target_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role public.app_role;
begin
  select role into actor_role from public.profiles where id = auth.uid() and is_active = true and deleted_at is null;
  if actor_role is distinct from 'owner'::public.app_role then
    raise exception 'Only an Owner can delete academy records' using errcode = '42501';
  end if;

  case target_type
    when 'question' then delete from public.questions where id = target_id::uuid;
    when 'question_reply' then delete from public.question_replies where id = target_id::uuid;
    when 'announcement' then delete from public.announcements where id = target_id::uuid;
    when 'resource' then delete from public.resource_slots where id = target_id::bigint;
    when 'upgrade_request' then delete from public.student_upgrade_requests where id = target_id::uuid;
    when 'lesson' then delete from public.lessons where id = target_id::uuid;
    when 'module' then delete from public.modules where id = target_id::uuid;
    when 'course' then delete from public.courses where id = target_id::uuid;
    else raise exception 'Unsupported delete target: %', target_type using errcode = '22023';
  end case;

  if not found then raise exception 'Record not found'; end if;
end;
$$;

revoke all on function public.owner_delete_record(text, text) from public;
grant execute on function public.owner_delete_record(text, text) to authenticated;

create or replace function public.owner_archive_profile(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role public.app_role;
  target_role public.app_role;
begin
  select role into actor_role from public.profiles where id = auth.uid() and is_active = true and deleted_at is null;
  if actor_role is distinct from 'owner'::public.app_role then
    raise exception 'Only an Owner can archive accounts' using errcode = '42501';
  end if;
  if target_user_id = auth.uid() then raise exception 'You cannot archive your own Owner account'; end if;
  select role into target_role from public.profiles where id = target_user_id;
  if target_role = 'owner'::public.app_role then raise exception 'Another Owner account cannot be archived here'; end if;
  update public.profiles set is_active = false, deleted_at = now(), updated_at = now() where id = target_user_id;
  if not found then raise exception 'User not found'; end if;
end;
$$;

revoke all on function public.owner_archive_profile(uuid) from public;
grant execute on function public.owner_archive_profile(uuid) to authenticated;
