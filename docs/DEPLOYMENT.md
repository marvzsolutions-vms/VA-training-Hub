# Deploying to Cloudflare Pages

The app is a static single-page build. Cloudflare serves `dist/`, and the browser
talks to Supabase directly. There is no server to run and no secret to protect
beyond the Supabase keys.

---

## 1. Set up Supabase first

1. Create a project at supabase.com. Choose a region near your students —
   Singapore is the closest to the Philippines.
2. Open **SQL Editor** and run the six migration files from
   `supabase/migrations/` **in filename order**. Wait for each to finish before
   starting the next; later files depend on earlier ones.
3. Skip `0006_seed_demo.sql` on a production project. It creates 14 accounts with
   a shared password. Read `DEMO_ACCOUNTS.md` first.
4. Under **Project Settings → API**, copy the **Project URL** and the **anon
   public** key. You will need both in step 3 below.

### Auth settings

Under **Authentication → URL Configuration**:

- **Site URL** — your production domain, e.g. `https://academy.example.com`
- **Redirect URLs** — add both your production domain and
  `http://localhost:5173` for local work

Password reset links are built from the Site URL. If it is wrong, reset emails
will point at the wrong place.

Under **Authentication → Providers → Email**, decide whether to require email
confirmation. If you leave it on, accounts created from the Owner's **Users** page
must confirm their address before their first sign-in. Turning it off is more
convenient for a small academy where staff create accounts by hand.

## 2. Push the code to a Git repository

Cloudflare Pages builds from GitHub or GitLab. Confirm `.env` is listed in
`.gitignore` — it is by default — so your keys stay out of the repository.

## 3. Create the Pages project

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**,
then select your repository.

| Setting | Value |
|---|---|
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 20 or newer |

Add the environment variables under **Settings → Environment variables**, for both
**Production** and **Preview**:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your project URL |
| `VITE_SUPABASE_ANON_KEY` | Your anon public key |

Vite inlines `VITE_`-prefixed variables at build time, so a change to either
requires a fresh deployment, not just a restart.

If Cloudflare picks an old Node version, add `NODE_VERSION` = `20`.

## 4. Deploy and verify

Trigger the first build. When it completes, open the deployment and check:

- The sign-in page loads with your branding, not the setup screen. The setup
  screen means the environment variables did not reach the build.
- Sign in, then reload a deep link such as `/courses` directly in the address bar.
  A 404 here means `public/_redirects` was not published — see below.
- Sign in as a Level 1 student and confirm Level 3 courses appear locked.

## 5. Custom domain

**Custom domains → Set up a domain.** Cloudflare issues the certificate
automatically. Afterwards, update the Supabase **Site URL** to the new domain or
password resets will keep pointing at the `.pages.dev` address.

---

## How routing works

`public/_redirects` contains:

```
/*    /index.html   200
```

Vite copies everything in `public/` into `dist/` verbatim. This tells Cloudflare
to serve `index.html` for any path it does not recognise as a file, letting React
Router handle the URL. Without it, every route except `/` returns 404 on refresh.

## Build output

A production build produces roughly:

```
dist/index.html                     1.20 kB │ gzip:   0.56 kB
dist/assets/index.css              26.87 kB │ gzip:   5.66 kB
dist/assets/forms.js               82.90 kB │ gzip:  22.85 kB
dist/assets/react.js              164.78 kB │ gzip:  53.78 kB
dist/assets/supabase.js           215.73 kB │ gzip:  55.91 kB
dist/assets/index.js              234.22 kB │ gzip:  53.81 kB
dist/assets/charts.js             371.93 kB │ gzip: 103.04 kB
```

Vendor code is split into separate chunks so that changing application code does
not invalidate the cached React, Supabase and charting bundles.

## Storage buckets

Migration `0003` creates three buckets: `resources` (private), `avatars` (public)
and `screenshots` (public). Lesson screenshots and logos are referenced by URL, so
upload a file in the Supabase Storage UI and paste its public URL into the lesson
editor or branding page.

---

## Troubleshooting

**The setup screen appears instead of sign-in.** The environment variables are
missing from the build. Confirm both names are spelled exactly, both are set for
the Production environment, and redeploy — editing a variable does not rebuild.

**Deep links 404 on refresh.** `_redirects` is missing from `dist`. Confirm the
file is committed and that the build output directory is `dist`.

**"Invalid login credentials" for a demo account.** Either `0006_seed_demo.sql`
was not run, or email confirmation is on and the address is unconfirmed. Confirm
the user under **Authentication → Users**.

**A student sees an empty course list.** They are not enrolled in anything. Enrol
them from **Enrolments**, or check their access status on their student page.

**Build fails on Cloudflare but works locally.** Almost always the Node version.
Set `NODE_VERSION` to `20`.
