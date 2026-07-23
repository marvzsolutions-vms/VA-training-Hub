-- =====================================================================
-- VA Success Academy — 0003 Row Level Security
-- Nothing is readable without a policy. Locked content is filtered here,
-- not in the browser.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','roles','permissions','role_permissions','user_roles',
    'student_learning_levels','specializations','batches','student_profiles',
    'student_level_history','student_specializations','batch_students',
    'courses','course_prerequisites','course_enrollments','student_access',
    'modules','lessons','lesson_sections','lesson_prerequisites','lesson_progress',
    'lesson_screenshots','tool_categories','tools','tool_links','course_tools',
    'lesson_tools','resource_types','resources','resource_course_relations',
    'resource_module_relations','resource_lesson_relations','resource_tool_relations',
    'resource_reviews','questions','question_replies','announcements','live_sessions',
    'notifications','activity_logs','audit_logs','branding_settings','system_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------- reference data: readable by any signed-in user ------------
do $$
declare t text;
begin
  foreach t in array array['roles','permissions','role_permissions',
                           'student_learning_levels','specializations',
                           'tool_categories','resource_types'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated
                    using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- ---------------------------- profiles --------------------------------
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated
using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());

drop policy if exists profiles_manager_update on public.profiles;
create policy profiles_manager_update on public.profiles for update to authenticated
using (public.is_manager_up()) with check (public.is_manager_up());

drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles for insert to authenticated
with check (public.is_manager_up());

drop policy if exists profiles_owner_delete on public.profiles;
create policy profiles_owner_delete on public.profiles for delete to authenticated
using (public.is_owner());

drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.is_staff());

drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_write on public.user_roles for all to authenticated
using (public.is_owner()) with check (public.is_owner());

-- ------------------------ student records ------------------------------
drop policy if exists sp_read on public.student_profiles;
create policy sp_read on public.student_profiles for select to authenticated
using (user_id = auth.uid() or public.coaches_student(user_id));

drop policy if exists sp_self_update on public.student_profiles;
create policy sp_self_update on public.student_profiles for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  -- a student may edit their own bio, never their own level or access
  and current_level = (select current_level from public.student_profiles where user_id = auth.uid())
  and access_status = (select access_status from public.student_profiles where user_id = auth.uid())
);

drop policy if exists sp_manager_write on public.student_profiles;
create policy sp_manager_write on public.student_profiles for all to authenticated
using (public.is_manager_up()) with check (public.is_manager_up());

drop policy if exists slh_read on public.student_level_history;
create policy slh_read on public.student_level_history for select to authenticated
using (student_id = auth.uid() or public.coaches_student(student_id));
drop policy if exists slh_write on public.student_level_history;
create policy slh_write on public.student_level_history for all to authenticated
using (public.is_manager_up()) with check (public.is_manager_up());

drop policy if exists ss_read on public.student_specializations;
create policy ss_read on public.student_specializations for select to authenticated
using (student_id = auth.uid() or public.coaches_student(student_id));
drop policy if exists ss_write on public.student_specializations;
create policy ss_write on public.student_specializations for all to authenticated
using (public.is_manager_up()) with check (public.is_manager_up());

drop policy if exists sa_read on public.student_access;
create policy sa_read on public.student_access for select to authenticated
using (student_id = auth.uid() or public.coaches_student(student_id));
drop policy if exists sa_write on public.student_access;
create policy sa_write on public.student_access for all to authenticated
using (public.is_manager_up()) with check (public.is_manager_up());

drop policy if exists batches_read on public.batches;
create policy batches_read on public.batches for select to authenticated
using (public.is_staff() or exists (
  select 1 from public.batch_students bs
   where bs.batch_id = id and bs.student_id = auth.uid()));
drop policy if exists batches_write on public.batches;
create policy batches_write on public.batches for all to authenticated
using (public.is_manager_up()) with check (public.is_manager_up());

drop policy if exists bs_read on public.batch_students;
create policy bs_read on public.batch_students for select to authenticated
using (student_id = auth.uid() or public.is_staff());
drop policy if exists bs_write on public.batch_students;
create policy bs_write on public.batch_students for all to authenticated
using (public.is_manager_up()) with check (public.is_manager_up());

-- --------------------------- curriculum --------------------------------
-- A course row is visible to everyone signed in (title, level, prerequisites,
-- upgrade message). Its *content* is gated below.
drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses for select to authenticated
using (deleted_at is null and (is_published or public.is_staff()));

drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses for all to authenticated
using (public.is_staff()) with check (public.is_staff());

drop policy if exists cp_read on public.course_prerequisites;
create policy cp_read on public.course_prerequisites for select to authenticated using (true);
drop policy if exists cp_write on public.course_prerequisites;
create policy cp_write on public.course_prerequisites for all to authenticated
using (public.is_staff()) with check (public.is_staff());

drop policy if exists enroll_read on public.course_enrollments;
create policy enroll_read on public.course_enrollments for select to authenticated
using (student_id = auth.uid() or public.coaches_student(student_id));
drop policy if exists enroll_write on public.course_enrollments;
create policy enroll_write on public.course_enrollments for all to authenticated
using (public.is_manager_up()) with check (public.is_manager_up());

drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules for select to authenticated
using (deleted_at is null and (public.is_staff() or (is_published and public.can_access_course(course_id))));
drop policy if exists modules_write on public.modules;
create policy modules_write on public.modules for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- Lessons: catalogue rows stay visible so students can see what is locked,
-- but the text columns are only served through the gated view below.
drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons for select to authenticated
using (deleted_at is null and (public.is_staff() or public.can_access_lesson(id)));
drop policy if exists lessons_write on public.lessons;
create policy lessons_write on public.lessons for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- Coach-only sections never leave the database for a student.
drop policy if exists sections_read on public.lesson_sections;
create policy sections_read on public.lesson_sections for select to authenticated
using (public.can_access_lesson(lesson_id) and (not coach_only or public.is_staff()));
drop policy if exists sections_write on public.lesson_sections;
create policy sections_write on public.lesson_sections for all to authenticated
using (public.is_staff()) with check (public.is_staff());

drop policy if exists lp_read on public.lesson_prerequisites;
create policy lp_read on public.lesson_prerequisites for select to authenticated using (true);
drop policy if exists lp_write on public.lesson_prerequisites;
create policy lp_write on public.lesson_prerequisites for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- Progress belongs to the student who earned it.
drop policy if exists progress_read on public.lesson_progress;
create policy progress_read on public.lesson_progress for select to authenticated
using (student_id = auth.uid() or public.coaches_student(student_id));

drop policy if exists progress_insert on public.lesson_progress;
create policy progress_insert on public.lesson_progress for insert to authenticated
with check (student_id = auth.uid() and public.can_access_lesson(lesson_id));

drop policy if exists progress_update on public.lesson_progress;
create policy progress_update on public.lesson_progress for update to authenticated
using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists progress_staff on public.lesson_progress;
create policy progress_staff on public.lesson_progress for all to authenticated
using (public.is_manager_up()) with check (public.is_manager_up());

drop policy if exists shots_read on public.lesson_screenshots;
create policy shots_read on public.lesson_screenshots for select to authenticated
using (not is_archived and public.can_access_lesson(lesson_id));
drop policy if exists shots_write on public.lesson_screenshots;
create policy shots_write on public.lesson_screenshots for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- ------------------------------ tools ----------------------------------
drop policy if exists tools_read on public.tools;
create policy tools_read on public.tools for select to authenticated
using (deleted_at is null and (public.is_staff() or (is_active and public.level_rank(level) <= greatest(public.my_level_rank(),1))));
drop policy if exists tools_write on public.tools;
create policy tools_write on public.tools for all to authenticated
using (public.is_staff()) with check (public.is_staff());

do $$
declare t text;
begin
  foreach t in array array['tool_links','course_tools','lesson_tools',
                           'resource_course_relations','resource_module_relations',
                           'resource_lesson_relations','resource_tool_relations'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated
                    using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- ---------------------------- resources ---------------------------------
drop policy if exists resources_read on public.resources;
create policy resources_read on public.resources for select to authenticated
using (
  deleted_at is null and (
    public.is_staff()
    or (
      not is_archived
      and (course_id is null or public.can_access_course(course_id))
      and (lesson_id is null or public.can_access_lesson(lesson_id))
      and public.level_rank(level) <= greatest(public.my_level_rank(), 1)
      and (specialization_id is null or exists (
            select 1 from public.student_specializations ss
             where ss.student_id = auth.uid() and ss.specialization_id = resources.specialization_id))
      and visibility <> 'staff'
    )
  )
);
drop policy if exists resources_write on public.resources;
create policy resources_write on public.resources for all to authenticated
using (public.is_staff()) with check (public.is_staff());

drop policy if exists rr_read on public.resource_reviews;
create policy rr_read on public.resource_reviews for select to authenticated using (public.is_staff());
drop policy if exists rr_write on public.resource_reviews;
create policy rr_write on public.resource_reviews for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- ---------------------------- questions ---------------------------------
drop policy if exists q_read on public.questions;
create policy q_read on public.questions for select to authenticated
using (student_id = auth.uid() or public.is_staff());

drop policy if exists q_insert on public.questions;
create policy q_insert on public.questions for insert to authenticated
with check (student_id = auth.uid() and public.is_active_user());

drop policy if exists q_student_update on public.questions;
create policy q_student_update on public.questions for update to authenticated
using (student_id = auth.uid() and status <> 'closed')
with check (student_id = auth.uid() and internal_notes = '');

drop policy if exists q_staff_update on public.questions;
create policy q_staff_update on public.questions for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- Internal replies stay internal.
drop policy if exists qr_read on public.question_replies;
create policy qr_read on public.question_replies for select to authenticated
using (
  (not is_internal and exists (select 1 from public.questions q
      where q.id = question_id and q.student_id = auth.uid()))
  or public.is_staff()
);
drop policy if exists qr_insert on public.question_replies;
create policy qr_insert on public.question_replies for insert to authenticated
with check (
  author_id = auth.uid() and (
    public.is_staff()
    or (not is_internal and exists (select 1 from public.questions q
          where q.id = question_id and q.student_id = auth.uid()))
  )
);
drop policy if exists qr_staff on public.question_replies;
create policy qr_staff on public.question_replies for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- -------------------------- announcements --------------------------------
drop policy if exists ann_read on public.announcements;
create policy ann_read on public.announcements for select to authenticated
using (
  deleted_at is null and (
    public.is_staff()
    or (is_active and publish_at <= now() and (expires_at is null or expires_at > now())
        and (
          audience = 'global'
          or (audience = 'student' and student_id = auth.uid())
          or (audience = 'course' and exists (select 1 from public.course_enrollments e
                where e.course_id = announcements.course_id and e.student_id = auth.uid()))
          or (audience = 'batch' and exists (select 1 from public.batch_students bs
                where bs.batch_id = announcements.batch_id and bs.student_id = auth.uid()))
        ))
  )
);
drop policy if exists ann_write on public.announcements;
create policy ann_write on public.announcements for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- --------------------------- live sessions --------------------------------
drop policy if exists sessions_read on public.live_sessions;
create policy sessions_read on public.live_sessions for select to authenticated
using (
  deleted_at is null and (
    public.is_staff()
    or (course_id is not null and exists (select 1 from public.course_enrollments e
          where e.course_id = live_sessions.course_id and e.student_id = auth.uid()))
    or (batch_id is not null and exists (select 1 from public.batch_students bs
          where bs.batch_id = live_sessions.batch_id and bs.student_id = auth.uid()))
  )
);
drop policy if exists sessions_write on public.live_sessions;
create policy sessions_write on public.live_sessions for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- --------------------------- notifications ---------------------------------
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated
using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_staff on public.notifications;
create policy notif_staff on public.notifications for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- ------------------------------ system --------------------------------------
drop policy if exists activity_read on public.activity_logs;
create policy activity_read on public.activity_logs for select to authenticated
using (public.is_manager_up() or user_id = auth.uid());
drop policy if exists activity_insert on public.activity_logs;
create policy activity_insert on public.activity_logs for insert to authenticated
with check (user_id = auth.uid());

-- Audit data is Owner-only and append-only.
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using (public.is_owner());

drop policy if exists branding_read on public.branding_settings;
create policy branding_read on public.branding_settings for select to authenticated using (true);
drop policy if exists branding_write on public.branding_settings;
create policy branding_write on public.branding_settings for all to authenticated
using (public.is_owner()) with check (public.is_owner());

-- Private settings are hidden from everyone but the Owner.
drop policy if exists settings_read on public.system_settings;
create policy settings_read on public.system_settings for select to authenticated
using (public.is_owner() or (not is_private and public.is_staff()));
drop policy if exists settings_write on public.system_settings;
create policy settings_write on public.system_settings for all to authenticated
using (public.is_owner()) with check (public.is_owner());

-- --------------------------- storage buckets ---------------------------------
insert into storage.buckets (id, name, public)
values ('resources','resources', false), ('avatars','avatars', true),
       ('screenshots','screenshots', true)
on conflict (id) do nothing;

drop policy if exists storage_read_signed_in on storage.objects;
create policy storage_read_signed_in on storage.objects for select to authenticated
using (bucket_id in ('resources','avatars','screenshots'));

drop policy if exists storage_staff_write on storage.objects;
create policy storage_staff_write on storage.objects for insert to authenticated
with check (bucket_id in ('resources','screenshots') and public.is_staff());

drop policy if exists storage_avatar_write on storage.objects;
create policy storage_avatar_write on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_staff_manage on storage.objects;
create policy storage_staff_manage on storage.objects for update to authenticated
using (public.is_staff()) with check (public.is_staff());

drop policy if exists storage_staff_delete on storage.objects;
create policy storage_staff_delete on storage.objects for delete to authenticated
using (public.is_staff() or (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text));

-- ===========================================================================
-- Explicit privilege grants
-- ---------------------------------------------------------------------------
-- Row Level Security decides WHICH ROWS a signed-in person may touch, but it
-- only comes into play once the role holds the table privilege at all. Supabase
-- normally configures default privileges for you; granting explicitly here means
-- these migrations behave identically on a fresh project, a self-hosted cluster
-- or a local Postgres, instead of depending on bootstrap defaults.
--
-- `anon` is deliberately given nothing: every page in this app requires a
-- signed-in account, so an unauthenticated key should not read any table.
-- ===========================================================================
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Anything created later inherits the same treatment.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- Reference data that every signed-in person may read but must never write.
revoke insert, update, delete on
  public.roles, public.permissions, public.role_permissions,
  public.audit_logs, public.activity_logs
  from authenticated;

-- Audit and activity trails are append-only from the application's point of view;
-- the trigger functions are SECURITY DEFINER and write them on the user's behalf.
grant insert on public.activity_logs to authenticated;
