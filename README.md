# VA Success Academy

A working learning platform for training Filipino Virtual Assistants, built around
three learning levels and four staff roles. React + Vite + TypeScript on the front,
Supabase (Postgres, Auth, Storage, Row Level Security) behind it, deployed to
Cloudflare Pages.

The name, tagline, logo and colours are stored in the database and editable from
the Owner dashboard, so rebranding does not require a code change.

---

## Quick start

```bash
npm install
cp .env.example .env      # fill in your Supabase URL and anon key
npm run dev               # http://localhost:5173
```

Without the two environment variables the app renders a setup screen explaining
what is missing rather than crashing.

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Same page → Project API keys → `anon` `public` |

Only the **anon** key belongs in this file. The service-role key must never reach
the browser; nothing in this project needs it.

## Database setup

Run the migrations **in order** in the Supabase SQL editor:

| File | What it does |
|---|---|
| `0001_schema.sql` | 43 tables, 9 enums, indexes, triggers |
| `0002_functions.sql` | Access-control functions, progress recalculation, audit triggers |
| `0003_rls.sql` | Row Level Security policies, storage buckets, privilege grants |
| `0004_seed_reference.sql` | Roles, permissions, levels, specializations, 42 tools, resource types |
| `0005_seed_curriculum.sql` | 38 courses, 90 modules, 272 lessons |
| `0006_seed_demo.sql` | **Optional.** 14 demo accounts with realistic data |

Skip `0006` for a production project. See `docs/DEMO_ACCOUNTS.md` before running it.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check then production build into `dist/` |
| `npm run preview` | Serve the built output locally |
| `npm run typecheck` | Types only, no build |

## Deployment

Cloudflare Pages, described fully in `docs/DEPLOYMENT.md`. In short: build command
`npm run build`, output directory `dist`, and set the two environment variables in
the Pages project. `public/_redirects` handles the single-page-app fallback so deep
links like `/courses/canva-basics` resolve correctly.

---

## How access control works

This is the part worth understanding before changing anything.

### Roles are separate from levels

**Roles** describe what someone does in the organisation. **Levels** describe how
far a student has progressed. They are independent: a Coach has no learning level,
a Level 3 student has no staff powers.

| Role | Scope |
|---|---|
| Student | Their own progress and their own permitted content |
| Coach | Teaches and answers questions for students in **their own batches only** |
| Manager | Access, batches, enrolments, content, students |
| Owner | Everything, plus roles, branding, system settings and audit logs |

| Level | Content |
|---|---|
| Level 1 — Beginner Foundations | 14 courses, open to every active student |
| Level 2 — Job-Ready Specialization | 12 courses, gated by level **and** specialization |
| Level 3 — Advanced Skills | 12 courses, locked until explicitly granted |

### Every rule is enforced twice

The browser checks (`src/lib/access.ts`) exist to give a student a useful
explanation — *why* something is locked and *what to do next*. They are a
convenience, not a security boundary.

The real enforcement is in Postgres. `can_access_course()` and
`can_access_lesson()` are `SECURITY DEFINER` functions called from the RLS
policies, and they check, in order: a signed-in user, an active account, an
account status that is not suspended/expired/locked, an active enrolment that has
not expired, sufficient level rank **or** an explicit grant, the required
specialization, and every required prerequisite completed.

A student who edits the JavaScript, calls the REST API directly, or crafts their
own query gets nothing back. The data never reaches the browser to begin with.

Three rules worth calling out because they are easy to get wrong:

- **Free previews still require a live account.** `preview_available` waives the
  enrolment and level gates, not the requirement to hold an active, unsuspended
  account.
- **Managers cannot touch Owners.** A `protect_owner()` trigger raises an
  exception on any attempt to modify or delete an Owner from a lower role. This
  holds even against direct API calls.
- **Coaches are scoped to their batches.** `coaches_student()` resolves batch
  membership; a Coach querying all students receives only their own.

### Verifying it yourself

The security model was tested by impersonating each demo account against live RLS
and counting what each could actually read:

| Account | Level 1 | Level 2 | Level 3 | Coach notes | Internal replies | Students | Audit |
|---|---|---|---|---|---|---|---|
| Owner | 127 | 109 | 36 | 1 | 1 | 10 | 434 |
| Manager | 127 | 109 | 36 | 1 | 1 | 10 | **0** |
| Coach (Jomar) | 127 | 109 | 36 | 1 | 1 | **7** | 0 |
| Coach (Kristine) | 127 | 109 | 36 | 1 | 1 | **3** | 0 |
| Level 1 student | 54 | **0** | **0** | **0** | **0** | 1 | 0 |
| Level 2 student | 127 | **9** | **0** | **0** | **0** | 1 | 0 |
| Level 3 student | 127 | 18 | **12** | **0** | **0** | 1 | 0 |
| Suspended student | **0** | **0** | **0** | **0** | **0** | 1 | 0 |

Level 2 students see 9 of 109 Level 2 lessons because the specialization gate
narrows them to their own track. Escalation attempts (`update student_profiles set
current_level='level_3'`, self-granting access, `update profiles set role='owner'`)
were all rejected by RLS and the owner-protection trigger.

`docs/TESTING.md` walks through reproducing this.

---

## Project layout

```
src/
  components/
    layout/AppShell.tsx      Sidebar, mobile drawer, topbar
    ui/index.tsx             Buttons, inputs, modal, table, states
  context/
    AuthContext.tsx          Session, profile, permissions, branding
    ToastContext.tsx         Notifications
  lib/
    access.ts                Browser mirror of the database rules
    supabase.ts              Client, plus an isolated client for staff sign-ups
    types.ts                 TypeScript mirror of the schema
    navigation.ts            Role-aware navigation
    useAsyncData.ts          Fetch hook with loading, error and reload
  pages/
    auth/                    Login, password reset, setup screen
    shared/                  Access denied, 404, privacy, terms
    staff/                   12 Coach/Manager/Owner pages
    *.tsx                    Dashboard, courses, lessons, tools, resources…
supabase/migrations/         The six SQL files, run in order
docs/                        Deployment, demo accounts, testing
```

## What is deliberately not built yet

Quizzes, grading, certificates, reporting exports and job placement are out of
scope for this stage. Lessons of type `quiz_placeholder` and
`assignment_placeholder` exist in the schema and render as clearly-labelled
placeholders rather than broken controls, so the engines can be added later
without a migration.

## Content boundaries

Level 1 is written for someone who has never worked in an office. It teaches what
SPF, DKIM and DMARC *are* and why deliverability matters, but not how to configure
DNS records — that is Level 3. Level 2 advertising students are trained as
assistants executing approved instructions, not as strategists setting budgets.
These boundaries are reflected in the seeded lesson content and are worth
preserving when adding material.

## V2.3 public application form

This release adds an owner-editable 25-question public VA enrollment form at:

`/apply/enrollment-application`

Before testing, run the complete `RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql` file in the Supabase SQL Editor.

```bash
npm install
npm run dev
```

Before deployment:

```bash
npm run build
```

## V2.6 update

V2.6 adds role-based notification audiences, coaches-only announcements, flexible branding links and description, multiple separately editable public forms, open-question badges, updated professional/chibi avatars, and paid upgrade request details with Owner-configurable approval requirements.

Run `RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql` before testing this version.

## V2.7 — Private upgrade-request notes

Upgrade requests now include a staff-only internal conversation. Coaches, managers, and owners can post private notes for payment checks, follow-ups, and approval coordination. Students cannot read or create these notes because access is protected by Supabase Row Level Security, not only hidden in the interface.

Run the complete `RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql` file before testing V2.7.


## V2.10 update
Standard role-specific chibi avatars and an improved private-question coach picker with visible names, email addresses, and profile images. No new SQL migration is required for this update.
