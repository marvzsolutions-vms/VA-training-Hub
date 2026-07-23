# Testing checklist

Two parts: a manual pass through the interface, and SQL you can run to verify the
security model directly rather than trusting the UI.

---

## Part 1 — Manual checks

### Authentication

- [ ] Signing in with a wrong password shows a readable message, not a raw error
- [ ] Forgot-password sends an email and the link opens the reset page
- [ ] Setting a new password signs you in
- [ ] Signing out returns you to the login page and protected URLs redirect there
- [ ] Removing the environment variables shows the setup screen, not a blank page

### Student

- [ ] Dashboard shows real progress, not placeholder numbers
- [ ] Course catalogue filters by level and search, and pagination works
- [ ] Locked courses explain *why* and *what to do next*
- [ ] Opening a lesson records progress; **Mark as complete** advances to the next
- [ ] Completing lessons moves the course progress bar
- [ ] Screenshot walkthroughs render in step order with tips and warnings
- [ ] Asking a question saves and appears in the thread
- [ ] Tools and resources open in a new tab
- [ ] **Add to calendar** on a session downloads a working `.ics`
- [ ] Profile edits persist after a reload
- [ ] Changing password in Settings works and the new one is required next sign-in

### Coach

- [ ] The student list contains only students from the coach's own batches
- [ ] Coach notes appear on lessons, badged as not visible to students
- [ ] Presentation mode opens full-screen, outside the normal layout
- [ ] Arrow keys move between slides; `N` toggles coach notes; `Esc` exits
- [ ] Coach-only slides are hidden until toggled on
- [ ] Replying to a question sets it to Answered
- [ ] An internal note is visibly marked and does not reach the student

### Manager

- [ ] Granting Level 2 access changes the student's level immediately
- [ ] The student receives a notification about the change
- [ ] Suspending a student blocks their content on their next request
- [ ] Batches can be created and students added and removed
- [ ] Enrolling a student makes the course appear on their dashboard
- [ ] Course builder creates courses, modules and lessons
- [ ] Lesson editor saves content, sections and screenshot steps
- [ ] Publishing and unpublishing a course changes student visibility
- [ ] **Users, Roles, Branding, System settings and Audit are not in the sidebar**

### Owner

- [ ] Every Manager capability, plus Users, Roles, Branding, System, Audit
- [ ] Changing a role in Users takes effect on that person's next page load
- [ ] Branding changes the sidebar name and login page immediately
- [ ] The permission matrix saves, and Owner checkboxes stay locked
- [ ] Audit log lists inserts, updates and deletes with the actor's name
- [ ] Deactivating an account prevents that person reaching content

### Interface

- [ ] Usable at 360 px wide; the sidebar collapses to a drawer
- [ ] Every page has a loading state, an error state with retry, and an empty state
- [ ] No button is inert — everything either acts or explains why it cannot
- [ ] Keyboard tabbing reaches all controls with a visible focus ring
- [ ] Modals close on `Esc` and on backdrop click

---

## Part 2 — Verifying security in SQL

The interface can be edited by anyone with developer tools, so the checks that
matter run against the database. Paste these into the Supabase SQL editor.

### Set up impersonation

Supabase reads the current user from the JWT. To imitate a signed-in person:

```sql
-- Pick a student
select id, email from public.profiles where role = 'student';

-- Become them (substitute the id)
set role authenticated;
select set_config('request.jwt.claim.sub', '<student-uuid>', false);
```

Run `reset role;` afterwards to return to full access.

### The critical check: Level 3 is unreachable

As an active **Level 1** student:

```sql
select count(*) from public.lessons where level = 'level_3';   -- expect 0
select count(*) from public.lessons where level = 'level_2';   -- expect 0
select count(*) from public.lesson_sections where coach_only;   -- expect 0
select count(*) from public.question_replies where is_internal; -- expect 0
select count(*) from public.audit_logs;                         -- expect 0
```

Zero rows means the content never leaves the database. This is the difference
between hiding a button and actually restricting access.

### Students cannot see each other

```sql
select count(*) from public.profiles where role = 'student';    -- expect 1 (self)
select count(*) from public.student_profiles;                   -- expect 1
select count(*) from public.lesson_progress
 where student_id <> auth.uid();                                -- expect 0
```

### Privilege escalation is rejected

Each of these should fail rather than silently do nothing:

```sql
update public.student_profiles set current_level = 'level_3' where user_id = auth.uid();
-- ERROR: new row violates row-level security policy

insert into public.student_access (student_id, level, status)
values (auth.uid(), 'level_3', 'approved');
-- ERROR: new row violates row-level security policy

update public.profiles set role = 'owner' where id = auth.uid();
-- ERROR: Only an Owner can grant Owner access.
```

### Suspended accounts lose everything

Impersonate the suspended demo student:

```sql
select count(*) from public.lessons;                            -- expect 0
select public.can_access_lesson(
  (select id from public.lessons where level='level_1' limit 1) -- expect false
);
```

Free-preview lessons are included in this. A preview waives the enrolment and
level requirements, not the requirement to hold a live account.

### Coaches are scoped to their batches

Impersonate each coach in turn:

```sql
select count(*) from public.student_profiles;
```

Neither coach should return the full roster. In the demo data one sees 7 and the
other 3, out of 10.

### Managers cannot reach the audit log

As a Manager:

```sql
select count(*) from public.audit_logs;   -- expect 0
```

As the Owner the same query returns every recorded change.

### Expected results

For reference, this is what the demo data produces:

| Account | L1 | L2 | L3 | Coach notes | Internal | Students | Audit |
|---|---|---|---|---|---|---|---|
| Owner | 127 | 109 | 36 | 1 | 1 | 10 | 434 |
| Manager | 127 | 109 | 36 | 1 | 1 | 10 | 0 |
| Coach (Jomar) | 127 | 109 | 36 | 1 | 1 | 7 | 0 |
| Coach (Kristine) | 127 | 109 | 36 | 1 | 1 | 3 | 0 |
| Level 1 student | 54 | 0 | 0 | 0 | 0 | 1 | 0 |
| Level 2 student | 127 | 9 | 0 | 0 | 0 | 1 | 0 |
| Level 3 student | 127 | 18 | 12 | 0 | 0 | 1 | 0 |
| Suspended | 0 | 0 | 0 | 0 | 0 | 1 | 0 |

Level 2 and 3 counts are narrower than the totals because the specialization gate
limits students to their own track.

---

## Before going live

- [ ] `0006_seed_demo.sql` was not run, or the demo accounts have been deleted
- [ ] A real Owner account exists with a strong, unique password
- [ ] Supabase **Site URL** matches the production domain
- [ ] Only the `anon` key is in the Cloudflare environment; the service-role key
      appears nowhere in the repository or the build
- [ ] `npm run build` completes with no TypeScript errors
- [ ] Deep links resolve after a hard refresh on the deployed site
