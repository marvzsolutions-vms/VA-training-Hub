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
