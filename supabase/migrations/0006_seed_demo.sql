-- =====================================================================
-- VA Success Academy — 0006 Demo data  (STAGING / DEMO ONLY)
--
-- Creates 14 demo accounts that share one password. Change
-- demo_password below before running, and never run this file against
-- a production project. See docs/DEMO_ACCOUNTS.md for the safer
-- service-role alternative (scripts/seed-demo-users.mjs).
-- =====================================================================

do $$
declare
  demo_password constant text := 'ChangeMe!2026';
  u record; uid uuid;
begin
  for u in select * from (values
    ('owner@vasuccess.academy','Marvin Dela Cruz','owner'),
    ('manager@vasuccess.academy','Liezl Ramos','manager'),
    ('coach.jomar@vasuccess.academy','Jomar Bautista','coach'),
    ('coach.kristine@vasuccess.academy','Kristine Villanueva','coach'),
    ('angelica@student.vasuccess.academy','Angelica Santos','student'),
    ('rico@student.vasuccess.academy','Rico Mendoza','student'),
    ('jasmine@student.vasuccess.academy','Jasmine Robles','student'),
    ('paulo@student.vasuccess.academy','Paulo Alcantara','student'),
    ('marygrace@student.vasuccess.academy','Mary Grace Lim','student'),
    ('dennis@student.vasuccess.academy','Dennis Tolentino','student'),
    ('cherry@student.vasuccess.academy','Cherry Ann Padilla','student'),
    ('erwin@student.vasuccess.academy','Erwin Gascon','student'),
    ('rosalie@student.vasuccess.academy','Rosalie Fernandez','student'),
    ('miguel@student.vasuccess.academy','Miguel Bacani','student')
  ) as t(email, full_name, role)
  loop
    select id into uid from auth.users where email = u.email;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        u.email, crypt(demo_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', u.full_name, 'role', u.role),
        now(), now(), '', '', '', '');

      insert into auth.identities (id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid,
        jsonb_build_object('sub', uid::text, 'email', u.email), 'email', u.email,
        now(), now(), now())
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- profile detail
update public.profiles p set
  city = v.city, province = v.province, mobile_number = v.mobile,
  full_name = v.full_name, role = v.role::app_role
from (values
  ('owner@vasuccess.academy','Marvin Dela Cruz','owner','Cebu City','Cebu','+63 917 000 0001'),
  ('manager@vasuccess.academy','Liezl Ramos','manager','Dipolog','Zamboanga del Norte','+63 917 000 0002'),
  ('coach.jomar@vasuccess.academy','Jomar Bautista','coach','Davao City','Davao del Sur','+63 917 000 0003'),
  ('coach.kristine@vasuccess.academy','Kristine Villanueva','coach','Quezon City','Metro Manila','+63 917 000 0004'),
  ('angelica@student.vasuccess.academy','Angelica Santos','student','Dipolog','Zamboanga del Norte','+63 917 100 0001'),
  ('rico@student.vasuccess.academy','Rico Mendoza','student','Iloilo City','Iloilo','+63 917 100 0002'),
  ('jasmine@student.vasuccess.academy','Jasmine Robles','student','Bacolod','Negros Occidental','+63 917 100 0003'),
  ('paulo@student.vasuccess.academy','Paulo Alcantara','student','Cagayan de Oro','Misamis Oriental','+63 917 100 0004'),
  ('marygrace@student.vasuccess.academy','Mary Grace Lim','student','Cebu City','Cebu','+63 917 100 0005'),
  ('dennis@student.vasuccess.academy','Dennis Tolentino','student','Baguio','Benguet','+63 917 100 0006'),
  ('cherry@student.vasuccess.academy','Cherry Ann Padilla','student','Tagum','Davao del Norte','+63 917 100 0007'),
  ('erwin@student.vasuccess.academy','Erwin Gascon','student','Zamboanga City','Zamboanga del Sur','+63 917 100 0008'),
  ('rosalie@student.vasuccess.academy','Rosalie Fernandez','student','Dumaguete','Negros Oriental','+63 917 100 0009'),
  ('miguel@student.vasuccess.academy','Miguel Bacani','student','Naga City','Camarines Sur','+63 917 100 0010')
) as v(email, full_name, role, city, province, mobile)
where p.email = v.email;

-- make sure every student has a student profile row
insert into public.student_profiles (user_id)
select id from public.profiles where role = 'student'
on conflict (user_id) do nothing;

-- batches
insert into public.batches (code, name, description, coach_id, start_date, end_date)
select v.code, v.name, v.descr, p.id, v.starts::date, v.ends::date
from (values
  ('VA-2026-A','Batch A — January 2026','Level 1 cohort, weekday evenings.','coach.jomar@vasuccess.academy','2026-01-12','2026-03-20'),
  ('VA-2026-B','Batch B — March 2026','Level 1 cohort, weekend schedule.','coach.kristine@vasuccess.academy','2026-03-02','2026-05-08'),
  ('VA-2026-C','Batch C — Specialization','Level 2 specialization cohort.','coach.jomar@vasuccess.academy','2026-05-04','2026-07-31')
) as v(code,name,descr,coach_email,starts,ends)
join public.profiles p on p.email = v.coach_email
on conflict (code) do nothing;

-- student level, batch and access profile
update public.student_profiles sp set
  current_level = v.level::learning_level,
  access_status = v.status::access_status,
  batch_id = b.id,
  experience_level = v.experience,
  employment_status = v.employment,
  availability = v.availability,
  introduction = v.intro,
  skills = v.skills,
  familiar_tools = v.tools,
  level2_eligible = v.l2,
  level3_eligible = v.l3,
  last_activity_at = now() - (v.days_ago || ' days')::interval,
  recommended_next_step = v.next_step
from (values
  ('angelica@student.vasuccess.academy','level_1','active','VA-2026-A','none','looking','full_time',
   'Former retail supervisor moving into virtual assistance. Comfortable with customers and schedules.',
   array['Customer service','Scheduling'], array['Gmail','Google Sheets'], false,false,0,
   'Finish Professional Client Communication this week.'),
  ('rico@student.vasuccess.academy','level_1','active','VA-2026-A','some','employed','part_time',
   'Warehouse coordinator studying at night. Strong with spreadsheets.',
   array['Data entry','Inventory'], array['Google Sheets','Trello'], false,false,1,
   'Start Essential VA Tools.'),
  ('jasmine@student.vasuccess.academy','level_1','active','VA-2026-B','none','looking','full_time',
   'Fresh graduate focused on social media support work.',
   array['Canva','Writing'], array['Canva','Instagram'], true,false,0,
   'You are eligible for Level 2 — pick a specialization.'),
  ('paulo@student.vasuccess.academy','level_1','active','VA-2026-B','none','looking','flexible',
   'Career shifter from BPO. Wants admin and customer service work.',
   array['Phone support','CRM notes'], array['Zendesk','Gmail'], false,false,5,
   'Complete General Administrative VA.'),
  ('marygrace@student.vasuccess.academy','level_1','eligible','VA-2026-A','some','looking','full_time',
   'Bookkeeper looking to add VA services for small businesses.',
   array['Bookkeeping','Reporting'], array['Google Sheets','Xero'], true,false,2,
   'Level 2 access is pending Manager approval.'),
  ('dennis@student.vasuccess.academy','level_2','active','VA-2026-C','some','freelancing','full_time',
   'Working with two small clients on lead research.',
   array['Research','List building'], array['Apollo','Hunter'], true,false,0,
   'Continue Lead Generation Assistant.'),
  ('cherry@student.vasuccess.academy','level_2','active','VA-2026-C','experienced','freelancing','part_time',
   'Social media assistant for a Cebu restaurant group.',
   array['Content planning','Canva'], array['Meta Business Suite','Canva'], true,true,0,
   'Finish Social Media Assistant, then request Level 3.'),
  ('erwin@student.vasuccess.academy','level_2','temporarily_active','VA-2026-C','some','employed','evenings',
   'Support agent adding email marketing skills.',
   array['Support','Email'], array['Mailchimp','Freshdesk'], true,false,3,
   'Temporary access ends in 30 days — finish the core modules.'),
  ('rosalie@student.vasuccess.academy','level_3','active','VA-2026-C','experienced','freelancing','full_time',
   'Automation assistant supporting an agency in Australia.',
   array['Automation','CRM'], array['HubSpot','Zapier'], true,true,0,
   'Advanced CRM Systems is unlocked for you.'),
  ('miguel@student.vasuccess.academy','level_1','suspended','VA-2026-B','none','looking','flexible',
   'Enrolment on hold pending payment confirmation.',
   array[]::text[], array[]::text[], false,false,32,
   'Contact your Manager to reactivate your account.')
) as v(email,level,status,batch,experience,employment,availability,intro,skills,tools,l2,l3,days_ago,next_step)
join public.profiles p on p.email = v.email
join public.batches b on b.code = v.batch
where sp.user_id = p.id;

insert into public.batch_students (batch_id, student_id)
select sp.batch_id, sp.user_id from public.student_profiles sp where sp.batch_id is not null
on conflict do nothing;

-- specializations for Level 2 and 3 students
insert into public.student_specializations (student_id, specialization_id, is_primary, granted_by)
select p.id, s.id, true, (select id from public.profiles where role = 'manager' limit 1)
from (values
  ('dennis@student.vasuccess.academy','lead-generation'),
  ('cherry@student.vasuccess.academy','social-media'),
  ('erwin@student.vasuccess.academy','email-marketing'),
  ('rosalie@student.vasuccess.academy','crm'),
  ('rosalie@student.vasuccess.academy','marketing-automation')
) as v(email, spec)
join public.profiles p on p.email = v.email
join public.specializations s on s.slug = v.spec
on conflict do nothing;

-- explicit access grants
insert into public.student_access (student_id, level, status, granted_by, expires_at, notes)
select p.id, v.level::learning_level, v.status::access_status, m.id,
       case when v.days is null then null else now() + (v.days || ' days')::interval end, v.notes
from (values
  ('dennis@student.vasuccess.academy','level_2','approved',null,'Completed Level 1 on schedule.'),
  ('cherry@student.vasuccess.academy','level_2','approved',null,'Strong portfolio, approved early.'),
  ('erwin@student.vasuccess.academy','level_2','temporarily_active','30','Trial access for one month.'),
  ('rosalie@student.vasuccess.academy','level_2','approved',null,'Completed specialization.'),
  ('rosalie@student.vasuccess.academy','level_3','approved',null,'Advanced track approved by Owner.')
) as v(email, level, status, days, notes)
join public.profiles p on p.email = v.email
cross join lateral (select id from public.profiles where role = 'manager' limit 1) m
on conflict do nothing;

insert into public.student_level_history (student_id, from_level, to_level, reason, approved_by)
select p.id, 'level_1'::learning_level, sp.current_level, 'Level 1 requirements met.',
       (select id from public.profiles where role = 'manager' limit 1)
from public.profiles p join public.student_profiles sp on sp.user_id = p.id
where sp.current_level <> 'level_1';

-- enrol every active student in the Level 1 core, and Level 2 students in
-- the courses that match their specialization
insert into public.course_enrollments (course_id, student_id, status, enrolled_by)
select c.id, sp.user_id, 'active',
       (select id from public.profiles where role = 'manager' limit 1)
from public.student_profiles sp
join public.courses c on c.level = 'level_1' and c.sort_order <= 6
where sp.access_status <> 'suspended'
on conflict do nothing;

insert into public.course_enrollments (course_id, student_id, status, enrolled_by, expires_at)
select c.id, ss.student_id, 'active',
       (select id from public.profiles where role = 'manager' limit 1),
       case when sp.access_status = 'temporarily_active' then now() + interval '30 days' end
from public.student_specializations ss
join public.student_profiles sp on sp.user_id = ss.student_id
join public.courses c on c.specialization_id = ss.specialization_id and c.level = 'level_2'
on conflict do nothing;

insert into public.course_enrollments (course_id, student_id, status, enrolled_by)
select c.id, ss.student_id, 'active',
       (select id from public.profiles where role = 'owner' limit 1)
from public.student_specializations ss
join public.student_profiles sp on sp.user_id = ss.student_id and sp.current_level = 'level_3'
join public.courses c on c.specialization_id = ss.specialization_id and c.level = 'level_3'
on conflict do nothing;

-- Students who have already been promoted need the WHOLE Level 1 track, not
-- just the first six courses: their Level 2 specialization lists a later
-- Level 1 course as a required prerequisite (social media, admin, research and
-- so on), and an unenrolled prerequisite can never be completed.
insert into public.course_enrollments (course_id, student_id, status, enrolled_by)
select c.id, sp.user_id, 'active',
       (select id from public.profiles where role = 'manager' limit 1)
from public.student_profiles sp
join public.courses c on c.level = 'level_1'
where sp.current_level <> 'level_1'
  and sp.access_status <> 'suspended'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Make the demo narrative internally consistent.
--
-- can_access_course() requires every REQUIRED prerequisite to be completed, and
-- the Level 2 and Level 3 courses list lower-level courses as prerequisites. A
-- student who has been promoted to Level 2 or Level 3 must therefore show the
-- lower-level work as finished, otherwise the seeded promotion is contradicted
-- by the seeded history and their new courses stay locked.
--
-- Rule: any enrolment in a course BELOW the student's current level counts as
-- completed. Same-level prerequisites are deliberately left unfinished, so the
-- demo still shows a realistic in-progress path.
-- ---------------------------------------------------------------------------
update public.course_enrollments e
   set status       = 'completed',
       progress     = 100,
       completed_at = now() - interval '21 days'
  from public.student_profiles sp,
       public.courses c
 where sp.user_id = e.student_id
   and c.id       = e.course_id
   and public.level_rank(c.level) < public.level_rank(sp.current_level);

-- progress: complete the first two courses for the more active students
insert into public.lesson_progress (lesson_id, course_id, student_id, is_completed, completed_at)
select l.id, l.course_id, e.student_id, true, now() - (random() * 20 || ' days')::interval
from public.course_enrollments e
join public.courses c on c.id = e.course_id and c.sort_order <= 2 and c.level = 'level_1'
join public.lessons l on l.course_id = c.id
join public.student_profiles sp on sp.user_id = e.student_id
where sp.access_status in ('active','temporarily_active') and sp.current_level <> 'level_1'
on conflict do nothing;

insert into public.lesson_progress (lesson_id, course_id, student_id, is_completed, completed_at)
select l.id, l.course_id, e.student_id, l.sort_order <= 2,
       case when l.sort_order <= 2 then now() - (random() * 10 || ' days')::interval end
from public.course_enrollments e
join public.courses c on c.id = e.course_id and c.slug = 'virtual-assistant-foundations'
join public.lessons l on l.course_id = c.id
join public.student_profiles sp on sp.user_id = e.student_id
where sp.current_level = 'level_1' and sp.access_status = 'active'
on conflict do nothing;

-- resources
insert into public.resources (title, description, type_id, url, course_id, level, is_required,
                              visibility, added_by, last_reviewed_at, review_status)
select v.title, v.descr, rt.id, v.url, c.id, v.level::learning_level, v.required,
       'enrolled', (select id from public.profiles where role = 'coach' limit 1),
       current_date - 20, v.status::review_status
from (values
  ('VA daily task tracker template','A ready-to-copy Google Sheet for tracking client tasks and time.','gsheet','https://docs.google.com/spreadsheets/','virtual-assistant-foundations','level_1',true,'current'),
  ('Client email phrase bank','Sixty phrases for updates, delays, questions and handovers.','gdoc','https://docs.google.com/document/','professional-client-communication','level_1',true,'current'),
  ('Inbox triage walkthrough','Screen recording of a full inbox cleared using labels and filters.','loom','https://www.loom.com/share/','essential-va-tools','level_1',false,'current'),
  ('Beginner portfolio template','Canva template for presenting three practice samples.','canva','https://www.canva.com/templates/','resume-profile-portfolio','level_1',true,'current'),
  ('Interview answer worksheet','Worksheet for drafting answers to the ten common questions.','pdf','https://example.com/interview-worksheet.pdf','interview-preparation','level_1',false,'needs_review'),
  ('Ads pre-launch checklist','Every check to run before submitting a draft campaign.','checklist','https://docs.google.com/document/','l2-digital-ads','level_2',true,'current'),
  ('Lead list format standard','The exact columns a sales team expects in a delivered list.','gsheet','https://docs.google.com/spreadsheets/','l2-lead-generation','level_2',true,'current'),
  ('Pre-send email checklist','Authentication, links, segments and test send.','checklist','https://docs.google.com/document/','l2-email-marketing','level_2',true,'current'),
  ('Monthly social report template','One-page report with reach, engagement and next steps.','gslides','https://docs.google.com/presentation/','l2-social-media','level_2',false,'current'),
  ('SOP writing guide','How to write an SOP another VA can follow without asking questions.','sop','https://docs.google.com/document/','l2-general-admin','level_2',false,'needs_review')
) as v(title,descr,rtype,url,course,level,required,status)
join public.resource_types rt on rt.slug = v.rtype
join public.courses c on c.slug = v.course
on conflict do nothing;

-- link tools to courses
insert into public.course_tools (course_id, tool_id)
select c.id, t.id from (values
  ('essential-va-tools','gmail'),('essential-va-tools','google-drive'),
  ('essential-va-tools','google-sheets'),('essential-va-tools','trello'),
  ('essential-va-tools','loom'),('essential-va-tools','zoom'),
  ('canva-content-editing-basics','canva'),('canva-content-editing-basics','capcut'),
  ('social-media-assistance-basics','meta-business-suite'),
  ('l2-digital-ads','meta-ads-manager'),('l2-digital-ads','google-ads'),
  ('l2-lead-generation','apollo'),('l2-lead-generation','hunter'),('l2-lead-generation','neverbounce'),
  ('l2-email-marketing','mailchimp'),('l2-email-marketing','activecampaign'),
  ('l2-crm','hubspot'),('l2-wordpress','wordpress'),('l2-wordpress','elementor'),
  ('l2-customer-service','zendesk'),('l2-customer-service','freshdesk')
) as v(course, tool)
join public.courses c on c.slug = v.course
join public.tools t on t.slug = v.tool
on conflict do nothing;

-- screenshot walkthrough example
insert into public.lesson_screenshots (lesson_id, step_number, title, instruction,
       highlight_description, tip, warning, tool_version, captured_on, device_type, sort_order, created_by)
select l.id, v.step, v.title, v.instruction, v.highlight, v.tip, v.warn, v.version,
       current_date - 15, 'desktop', v.step,
       (select id from public.profiles where role = 'coach' limit 1)
from public.lessons l
join public.courses c on c.id = l.course_id and c.slug = 'essential-va-tools'
join (values
 (1,'Open the label settings','Click the gear icon at the top right, then choose "See all settings".','Settings gear, top right of the inbox.','Bookmark the settings page — you will use it often.','','Gmail 2026.01'),
 (2,'Create the client label','Open the Labels tab and click "Create new label". Name it after the client, not the task.','"Create new label" button under the label list.','Use a consistent naming pattern across all clients.','Do not nest more than two levels deep.','Gmail 2026.01'),
 (3,'Add a filter that applies the label','Open Filters and Blocked Addresses, then "Create a new filter" using the client domain.','The From field in the filter form.','Filter by domain, not by a single address.','Test the filter before applying it to existing mail.','Gmail 2026.01'),
 (4,'Apply the filter to existing mail','Tick "Also apply filter to matching conversations" before saving.','Checkbox at the bottom of the filter dialog.','This is what clears the backlog in one step.','This cannot be undone in bulk — check the filter first.','Gmail 2026.01')
) as v(step,title,instruction,highlight,tip,warn,version) on true
where l.title = 'Gmail for client inboxes'
on conflict do nothing;

-- questions and replies
insert into public.questions (student_id, course_id, lesson_id, subject, details, status, assigned_to)
select p.id, c.id, l.id, v.subject, v.details, v.status::question_status, co.id
from (values
  ('angelica@student.vasuccess.academy','virtual-assistant-foundations','What a Virtual Assistant really does',
   'How do I answer when a client asks about my experience?',
   'I have no VA experience yet. I do not want to lie but I also do not want to sound unqualified. What should I say?','answered'),
  ('rico@student.vasuccess.academy','essential-va-tools','Drive folder structures that scale',
   'Should I use one folder per client or one per project?',
   'My practice client has three projects running. I am not sure which structure is easier to hand over later.','new'),
  ('jasmine@student.vasuccess.academy','marketing-assistance-foundations','What Meta Ads and Google Ads are',
   'Can I already practise setting up a real ad account?',
   'I want to try building a campaign for practice. Is that allowed at Level 1?','in_review'),
  ('dennis@student.vasuccess.academy','l2-lead-generation','Verifying with NeverBounce or ZeroBounce',
   'What bounce rate is acceptable to deliver?',
   'My verified list still shows 4% risky. Do I remove those or flag them for the client?','needs_information')
) as v(email, course, lesson, subject, details, status)
join public.profiles p on p.email = v.email
join public.courses c on c.slug = v.course
join public.lessons l on l.course_id = c.id and l.title = v.lesson
cross join lateral (select id from public.profiles where role = 'coach' order by email limit 1) co
on conflict do nothing;

insert into public.question_replies (question_id, author_id, body, is_internal)
select q.id, co.id,
 'Answer honestly and redirect to what you can show. Say you are training on real tasks, then point to two portfolio samples you produced in class. Clients care far more about whether you follow instructions than about years of experience.',
 false
from public.questions q
cross join lateral (select id from public.profiles where role = 'coach' order by email limit 1) co
where q.subject like 'How do I answer%';

insert into public.question_replies (question_id, author_id, body, is_internal)
select q.id, co.id, 'Angelica has been quiet in the last two sessions — worth checking in during batch call.', true
from public.questions q
cross join lateral (select id from public.profiles where role = 'coach' order by email limit 1) co
where q.subject like 'How do I answer%';

-- announcements
insert into public.announcements (title, message, audience, course_id, batch_id, author_id, publish_at, expires_at)
select v.title, v.message, v.audience::announcement_audience,
       c.id, b.id, (select id from public.profiles where role = 'manager' limit 1),
       now() - (v.days_ago || ' days')::interval,
       case when v.expires_days is null then null else now() + (v.expires_days || ' days')::interval end
from (values
  ('Welcome to VA Success Academy','Start with Virtual Assistant Foundations. Finish Module 1 before your first live session.','global',null,null,2,'60'),
  ('Live session schedule updated','Batch A evening sessions now start at 7:00 PM PHT instead of 6:30 PM.','batch',null,'VA-2026-A',1,'30'),
  ('New pre-launch checklist added','The Digital Advertising Assistant course now includes an updated pre-launch checklist resource.','course','l2-digital-ads',null,3,null),
  ('Level 2 applications open','If you have finished the Level 1 core courses, request Level 2 access from your Manager this week.','global',null,null,0,'21')
) as v(title,message,audience,course_slug,batch_code,days_ago,expires_days)
left join public.courses c on c.slug = v.course_slug
left join public.batches b on b.code = v.batch_code
on conflict do nothing;

-- live sessions
insert into public.live_sessions (title, description, course_id, batch_id, coach_id, session_date,
       start_time, end_time, zoom_url, meeting_id, passcode, status, recording_url)
select v.title, v.descr, c.id, b.id, p.id,
       (current_date + v.day_offset)::date, v.starts::time, v.ends::time,
       'https://zoom.us/j/' || v.meeting, v.meeting, v.passcode, v.status::session_status,
       case when v.day_offset < 0 then 'https://zoom.us/rec/share/demo-recording' end
from (values
  ('Foundations live workshop','Walk through the VA role and the first client task together.',
   'virtual-assistant-foundations','VA-2026-A','coach.jomar@vasuccess.academy',3,'19:00','20:30','88012345001','VA2026','scheduled'),
  ('Client communication practice','Live rewriting of real client emails.',
   'professional-client-communication','VA-2026-A','coach.jomar@vasuccess.academy',7,'19:00','20:30','88012345002','VA2026','scheduled'),
  ('Weekend tools lab','Hands-on Google Workspace and Trello setup.',
   'essential-va-tools','VA-2026-B','coach.kristine@vasuccess.academy',5,'09:00','11:00','88012345003','VA2026','scheduled'),
  ('Specialization kickoff','Choosing and starting your Level 2 track.',
   'l2-general-admin','VA-2026-C','coach.jomar@vasuccess.academy',-4,'19:00','20:30','88012345004','VA2026','completed')
) as v(title,descr,course,batch,coach,day_offset,starts,ends,meeting,passcode,status)
join public.courses c on c.slug = v.course
join public.batches b on b.code = v.batch
join public.profiles p on p.email = v.coach
on conflict do nothing;

-- notifications and activity
insert into public.notifications (user_id, title, body, link)
select p.id, 'Welcome to the academy',
       'Your account is ready. Open your dashboard to see your first course.', '/dashboard'
from public.profiles p where p.role = 'student';

insert into public.activity_logs (user_id, action, entity, detail)
select p.id, 'account.created', 'profiles', p.full_name || ' joined as ' || p.role
from public.profiles p;
