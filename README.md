# Apex — CTS Trader's Apprenticeship

The learning platform for CTS Global Equity Group's college internship. Interns work through weekly workshop modules, take auto-scored quizzes, submit drills that mentors score, and move up a promotion ladder. Program leads add all content from the Admin pages; no code needed.

**Loop:** Learn → Quiz → Drill → Mentor review → Apex Score → Promotion

## What's in v1

| Area | What it does |
| --- | --- |
| Sign-up | Invite code required. The code sets the person's role (intern / mentor / admin) and batch. |
| Dashboard | Apex Score, batch rank, modules done, drills passed, promotion checklist, next module, recent activity. |
| Learn | Modules grouped by week. Each has an objective, notes, a video (YouTube plays inline) or slides link, a quiz and a drill. |
| Quiz | Scored on the server. Answers are never sent to the browser. Best score counts; attempts are capped. |
| Drill | Written answer, editable until a mentor reviews it. Mentor scores it out of 100 with feedback. |
| Leaderboard | By batch or all interns. |
| Mentors | Review queue (with the "what good looks like" guide), intern roster, promotion confirmations. |
| Admin | Module editor, invite codes, people & roles, scoring weights, promotion ladder. |

Next round: sim book & trade journal, certificates, live PSE prices.

## One-time setup

### 1. Database (Supabase)

In the Supabase dashboard open **SQL Editor → New query**. Paste and run each file below, one at a time, in this order:

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_functions.sql`
3. `supabase/migrations/003_security.sql`
4. `supabase/seed.sql` — the result panel shows **your admin invite code**. Copy it.

### 2. Auth settings (Supabase)

**Authentication → URL Configuration**

- Site URL: your live address (e.g. `https://project-apex.vercel.app`)
- Redirect URLs: add `https://project-apex.vercel.app/**` and `http://localhost:5173/**`

**Authentication → Sign In / Providers → Email:** Supabase's built-in email sender only sends a few emails an hour. For a pilot, turn **Confirm email** off. Before a full batch, either keep it off (invite codes already gate sign-up) or set up a free SMTP sender (Resend, Brevo) under **Authentication → Emails → SMTP**.

### 3. Hosting (Vercel)

1. Sign in to vercel.com with GitHub → **Add New → Project** → import `CTS-Global-Internship/project-apex`.
2. Leave the defaults (Vite is detected). Click **Deploy**.
3. Put the address Vercel gives you into the Supabase URL settings above.

The Supabase URL and publishable key are already in the code. To point at a different project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel → Settings → Environment Variables. **Never** add the secret / service_role key anywhere.

### 4. First admin

Open the site → **I have an invite code** → sign up with the admin code from step 1. Then in **Admin → Invite codes**, create one code per intern batch and one for mentors.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
```

Database tests (needs a local Postgres; the test database is created and dropped):

```bash
PGHOST=localhost PGUSER=postgres npm run test:db
```

They run the real migrations and seed, then check sign-up codes, tamper attempts (editing your own role or score, reading answer keys, forging attempts), quiz and drill scoring, mentor review, promotion checks and admin tools.

## How scoring works

Each part is scored 0–100 across all **published** modules (anything not yet done counts as 0):

- **Quiz** — best score per module
- **Drill** — mentor score per module
- **Completion** — share of modules completed (quiz passed + drill submitted)

`Apex Score = 10 × weighted average` → 0 to 1000. Default weights 40 / 40 / 20, pass marks 70, 3 quiz attempts — all editable in **Admin → Scoring & levels**. Changes apply to every score immediately.

An intern is flagged **ready** when they meet the next level's minimum score, modules completed and drills passed. A mentor confirms the promotion from **Interns**.

## Security model

- The browser only holds the publishable key and the signed-in user's session.
- Row Level Security is on for every table. Interns can read published content and their own work only.
- Quiz answer keys sit in an admin-only table; quizzes are graded by a server function.
- Interns can't write attempts, drill scores, roles or levels directly; only server functions can, and each checks the caller's role.
- Free Supabase projects pause after about a week with no activity. Upgrade to Pro once the platform runs year-round.

## Project layout

```
supabase/migrations/   database schema, functions, security (run in order)
supabase/seed.sql      starter ladder, sample module, first admin code
supabase/tests/        end-to-end database test
src/lib/               Supabase client, auth, types, helpers
src/pages/             intern pages; mentor/ and admin/ subfolders
src/styles.css         design tokens and all styles
```
