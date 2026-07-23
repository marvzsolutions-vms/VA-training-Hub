# Demo accounts

`supabase/migrations/0006_seed_demo.sql` creates 14 accounts covering every role,
level and access status, so you can see the platform behave differently for
different people without setting up data by hand.

> **Do not run this file on a production project.** All 14 accounts share one
> password. It exists to make the system demonstrable, not to be lived in.

## Before you run it

Open the file and change line 12:

```sql
demo_password constant text := 'ChangeMe!2026';
```

The password is hashed with `crypt()` on insert, so it is never stored in plain
text — but a shared, published password is still a shared password. Change it, and
if this is anything other than a throwaway project, delete these accounts once you
have finished exploring.

## The accounts

Password: whatever you set on line 12.

### Staff

| Email | Role | What to look at |
|---|---|---|
| `owner@vasuccess.academy` | Owner | Users, roles matrix, branding, system settings, audit log |
| `manager@vasuccess.academy` | Manager | Access control, batches, enrolments — and **no** audit log |
| `coach.jomar@vasuccess.academy` | Coach | Sees 7 students (batches A and C only) |
| `coach.kristine@vasuccess.academy` | Coach | Sees 3 students (batch B only) |

Signing in as each Coach is the clearest way to see batch scoping: neither sees
all 10 students, and neither can reach another coach's roster.

### Students

| Email | Level | Status | Illustrates |
|---|---|---|---|
| `paulo@student.vasuccess.academy` | 1 | Active | The ordinary beginner path |
| `angelica@student.vasuccess.academy` | 1 | Active | Early progress, few lessons done |
| `jasmine@student.vasuccess.academy` | 1 | Active | Mid-course progress |
| `rico@student.vasuccess.academy` | 1 | Active | Questions waiting on a coach reply |
| `marygrace@student.vasuccess.academy` | 1 | **Eligible** | Finished Level 1, awaiting a Level 2 decision |
| `miguel@student.vasuccess.academy` | 1 | **Suspended** | Locked out of everything, including free previews |
| `cherry@student.vasuccess.academy` | 2 | Active | Specialization gating — sees 9 of 109 Level 2 lessons |
| `dennis@student.vasuccess.academy` | 2 | Active | A different specialization, a different 9 lessons |
| `erwin@student.vasuccess.academy` | 2 | **Temporarily active** | Access with an expiry date attached |
| `rosalie@student.vasuccess.academy` | 3 | Active | Two specializations, 12 Level 3 lessons unlocked |

## A five-minute tour

1. Sign in as **paulo** (Level 1). Open Courses. Level 2 and 3 appear, clearly
   locked, with an explanation of what is required — not hidden, so there is
   something to aspire to.
2. Open a Level 3 course directly by URL. You get the locked page, and the lesson
   content is never sent to the browser.
3. Sign in as **miguel** (suspended). Everything is closed, including the free
   preview lessons an active Level 1 student can read.
4. Sign in as **rosalie** (Level 3) and open the same Level 3 course. It works,
   because she is enrolled, holds the grant, and has the matching specialization.
5. Sign in as **coach.jomar**, open a lesson, and note the **Coach notes** panel
   marked *Not visible to students*. Students never receive that text — it is
   filtered in the database, not hidden with CSS.
6. Open Questions as a Coach and post an **internal note**. Sign back in as the
   student who asked: the reply is not there.
7. Sign in as **manager**, then **owner**. Both run the academy, but only the
   Owner sees Users, Roles and Audit logs.

## Cleaning up

To remove the demo data and keep the curriculum:

```sql
delete from auth.users
 where email like '%@student.vasuccess.academy'
    or email in ('owner@vasuccess.academy','manager@vasuccess.academy',
                 'coach.jomar@vasuccess.academy','coach.kristine@vasuccess.academy');
```

Profiles, enrolments, progress and questions cascade from `auth.users`, so this
one statement is enough. Courses, lessons, tools and resources are untouched.

Create your real Owner account afterwards by signing up, then promoting the row:

```sql
update public.profiles set role = 'owner' where email = 'you@example.com';
```
