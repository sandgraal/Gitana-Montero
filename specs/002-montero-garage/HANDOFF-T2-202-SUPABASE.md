# HANDOFF T2-202 — Supabase project, Google OAuth, env vars (owner actions)

**To:** the owner. **From:** T2-202 (implementer).
**Status:** everything in the repository is done — schema, RLS, storage
policies, the two ACC-03 routines, the auth surface in both locales, and the
graders that prove all of it. Four things are not, because they need a Supabase
account and a Google Cloud console, and neither an agent nor CI has one.

Nothing in this repository contains a key. The site reads two `PUBLIC_`
variables at build time and behaves correctly with neither set: `/en/sign-in/`
and `/es/ingresar/` render a bilingual "accounts are not switched on yet"
notice, the Supabase JavaScript chunk is never fetched, and every merge-blocking
check stays green. **You can merge T2-202 before doing any of the steps below.**

Everything here was executed against a real local stack (Supabase CLI 2.114.0,
GoTrue 2.195.0, Postgres 17.6, Docker via colima) on 2026-08-30, not written
from memory. Where a number or a behaviour is stated, it was observed.

---

## Step 0 — What you are about to create, and what it will hold

One Supabase project, holding four tables (`profiles`, `vehicles`, `records`,
`receipts`) and one private storage bucket (`receipts`). Every table has
row-level security **enabled and forced**, and every policy is scoped to
`auth.uid()` on both the read and the write half. `anon` has no grant on any of
them. Reference content stays in git; this database holds user data only
(MIG-03).

---

## Step 1 — Create the project

1. Sign in to <https://supabase.com/dashboard> with the account that should own
   this data long-term. **This account holds every user's garage** — use the
   one you would still have access to in five years, not a throwaway.
2. **New project.**
   - **Name:** `monterogarage`
   - **Region:** the closest one to Costa Rica. At the time of writing that is
     **East US (North Virginia)** — Supabase has no Central American region.
     Check the list; if a nearer one exists, take it.
   - **Database password:** generate one and put it in your password manager.
     You will need it once, in Step 2. It is not a site credential and it never
     goes in the repository.
3. Wait for the project to finish provisioning (a minute or two).

---

## Step 2 — Push the schema

This is the only step that runs from your machine, in a checkout of this
repository with the Supabase CLI installed (`brew install supabase/tap/supabase`).

```sh
supabase login                       # opens a browser, one time
supabase link --project-ref <ref>    # <ref> is in Settings → General
supabase db push                     # applies supabase/migrations/ in order
```

`<ref>` is the twenty-character project reference, also visible in the project
URL. `db push` will ask for the database password from Step 1.

It should print five migrations applied, in this order:

| Migration | What it creates |
| --- | --- |
| `20260830120000_garage_schema.sql` | the four tables, the `record_kind` enum, RLS enabled + forced, the owner-scoped policies, and the grants (`anon` revoked everywhere) |
| `20260830120100_receipts_storage.sql` | the private `receipts` bucket and four path-scoped policies on `storage.objects` |
| `20260830120200_account_lifecycle.sql` | the profile trigger, `request_account_deletion()`, `purge_expired_accounts(p_now)` |
| `20260830120300_no_password_auth.sql` | `deny_password_login()`, the hook that refuses every password sign-in |
| `20260831120000_vehicle_photos_storage.sql` | the private `vehicle-photos` bucket, its four path-scoped policies, and `handle_vehicle_deleted()` + its trigger |

**T2-301 replaces `purge_expired_accounts`, and nothing else about T2-202.**
That routine deleted storage rows for `bucket_id = 'receipts'`, which was the
whole truth while receipts were the only bucket. ACC-03 says "all vehicles,
records, and **stored files**", and a photo is a stored file, so the fifth
migration replaces the routine with one that names both buckets.

It is a `create or replace` in the **new** migration rather than an edit to
`20260830120200`, deliberately: once you have run `supabase db push` that
migration is marked applied and is never read again, so editing it would change
what a *fresh* database gets and nothing at all about the one you have. This
way the fix reaches both, and it does not matter whether you have pushed yet.

Step 5's "assert it once, by hand" check gains a line: after the purge runs,
the deleted account's objects must be gone from **both** `receipts` and
`vehicle-photos`. To confirm which body is live before trusting it:

```sql
select prosrc like '%vehicle-photos%' as reaches_photos
  from pg_proc where proname = 'purge_expired_accounts';
```

**Verify in the dashboard:** `Storage` now lists two buckets, `receipts` and
`vehicle-photos`, and **neither** is marked public.

**Do not run `supabase config push`.** It pushes `supabase/config.toml`
*verbatim*, and that file is the **local** stack's configuration: its
`site_url` is `http://127.0.0.1:4321` and its redirect list is loopback plus
this site's origins. Pushing it would overwrite the production auth settings
you are about to set in Step 3b with development values, silently, and the
first symptom would be magic links pointing at a machine that is not the
reader's. The auth settings are dashboard steps instead — Step 3b lists every
one of them, including the password hook.

(If you would rather keep production auth config as code later, the CLI's
`[remotes.<ref>]` block in `config.toml` overrides per project ref. It cannot
be committed today because the ref does not exist until Step 1 finishes, and a
half-written remotes block is worse than none.)

**Verify, in the dashboard:**

- **Table Editor → each of the four tables** shows a green "RLS enabled" badge.
- **Storage → receipts** exists and is **not** marked public.
- **Database → Functions** lists `request_account_deletion`,
  `purge_expired_accounts`, `deny_password_login`, `handle_new_user`.

---

## Step 3 — Google OAuth (ACC-01's second way in)

Two consoles, in this order.

### 3a. Google Cloud

1. <https://console.cloud.google.com> → create a project (`monterogarage`) or
   reuse one.
2. **APIs & Services → OAuth consent screen.** External. App name
   `Montero Garage`, your support email, your contact email. Scopes: the three
   defaults (`email`, `profile`, `openid`) and nothing else — this site has no
   business reading anything of yours at Google beyond who you are.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.**
   - **Authorized JavaScript origins:** `https://monterogarage.com`
   - **Authorized redirect URI:** the callback URL shown on the Supabase side
     in step 3b — it looks like `https://<ref>.supabase.co/auth/v1/callback`.
     Copy it from Supabase rather than typing it; Google matches it exactly.
4. Copy the **client ID** and **client secret**.

### 3b. Supabase

1. **Authentication → Sign In / Providers → Google.** Enable, paste the client
   ID and secret, save. The callback URL you needed in 3a is displayed on this
   same page.
2. **Authentication → URL Configuration:**
   - **Site URL:** `https://monterogarage.com`
   - **Redirect URLs:** add `https://www.monterogarage.com/**` only if you serve
     that host. **Do not add a `*.vercel.app` wildcard** — anyone can deploy to
     `vercel.app`, and a wildcard there turns a Google sign-in into a token
     handoff to a host nobody reviewed. Preview deployments therefore cannot
     complete an OAuth round trip; that is the intended trade. If you need one
     preview to work, add its exact origin and remove it afterwards.
3. **Authentication → Sign In / Providers → Email:** confirm it is enabled, and
   set these two, which are what `config.toml` sets locally and what Step 2
   deliberately does not push:
   - **Enable email provider:** on. Magic link is ACC-01's other half and the
     site is unusable without it.
   - **Confirm email:** **on.** This one is security, not hygiene. With it off,
     a sign-up request carrying a password comes back with an access token and
     a refresh token — the one request in the system that contains a password
     hands back a session, and anyone can pre-claim an address they do not own
     and be sitting inside it when the real owner later signs in by magic link.
     With it on, that request returns a bare unconfirmed user and no token.
     Magic-link sign-up is unaffected; that flow *is* an email confirmation.
4. **Authentication → Hooks → Password verification attempt:** enable it and
   point it at the Postgres function `public.deny_password_login`, which
   Step 2's migrations already created. **This is what closes ACC-01's deny
   half** — without it, an account that somehow carries a password can sign in
   with it. Verify by the message: any password attempt must answer
   `400 invalid_credentials — Password sign-in is disabled.`
5. While you are on the Email provider page: if this version of the dashboard
   offers a toggle that disables **password** sign-in specifically, turn it off
   too. At the time of writing no such toggle exists — see "The password
   finding" below.

---

## Step 4 — The two environment variables

1. **Supabase → Settings → API keys.** Copy:
   - the **project URL** (`https://<ref>.supabase.co`);
   - the **publishable / anon key**. It is the one labelled publishable or anon.
     **Never the `service_role` or `sb_secret_` key** — that one bypasses
     row-level security completely and would hand every visitor every user's
     garage. The build refuses to start if it finds one in this variable
     (`src/lib/supabase/config.ts`), but do not rely on that; copy the right
     one.
2. **Vercel → the `monterogarage` project → Settings → Environment Variables.**
   Add both, for **Production, Preview and Development**:

   | Name | Value |
   | --- | --- |
   | `PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `PUBLIC_SUPABASE_ANON_KEY` | the publishable / anon key |

3. **Redeploy** (Deployments → ⋯ → Redeploy). These are read at *build* time, so
   an existing deployment will not pick them up.
4. For local development, put the same two lines in `.env.local` at the repo
   root. `.env*` is gitignored; `.env.example` shows the shape.

**Verify:** `https://monterogarage.com/en/sign-in/` now shows the email field
and the Google button instead of the "not switched on yet" notice, and
`/es/ingresar/` shows the same page in Spanish. Sign in with your own address:
the link arrives, and the page then says "Signed in as …".

---

## Step 5 — Schedule the purge (ACC-03's second event)

`request_account_deletion()` marks an account; nothing deletes it until
`purge_expired_accounts()` runs. Until you schedule it, ACC-03's 30-day window
never closes.

**Supabase → Integrations → Cron**, one job, daily:

```sql
select public.purge_expired_accounts();
```

Called with no argument it uses `now()`; the `p_now` parameter exists so a
grader can reach "thirty days later" without waiting.

**Assert it once, by hand, on the hosted project — a silent zero is the failure
mode.** `purge_expired_accounts` is `security definer` and reads
`public.profiles`, which has RLS *forced*; it works because the `postgres` role
that owns it holds `BYPASSRLS`. If that ever stops being true on hosted
Supabase, the function does not error — it selects no rows and returns `0`,
which is byte-identical to a healthy run on a day when nothing expired. So the
first time the cron has run, prove the difference:

1. Make a throwaway account, sign in once so it has a profile row, then
   backdate it past the window in the SQL editor:
   `update public.profiles set deleted_at = now() - interval '31 days' where id = '<that uuid>';`
2. Run `select public.purge_expired_accounts();` in the SQL editor.
3. **It must return a non-zero count**, and the account must be gone from
   Authentication → Users. A `0` here means the purge cannot see the rows it is
   meant to delete, and ACC-03 is silently not happening.

**One thing the SQL purge does not do.** It deletes the `storage.objects` rows,
which removes every route to a receipt — download, list and signed URL all stop
working, and all three are graded. It does not delete the *bytes* in the storage
backend, because only the Storage API can, and reaching that API from inside
Postgres would mean keeping a service key in the database. AGENTS.md forbids a
service key anywhere in this project.

So if you want the bytes gone as well as unreachable, the daily job should be an
Edge Function that, in this order: reads the expired owners' ids, calls
`storage.from('receipts').remove([...])` for their prefixes, then calls
`purge_expired_accounts()`. That function runs inside Supabase with the service
key Supabase gives it, which is not a key that ever exists in this repository.
Written up here rather than built, because an Edge Function is its own task with
its own graders.

---

## The password finding (ACC-01, read this before you change anything)

> **ACC-01** … email magic link and Google OAuth, **and no password flow.**

**Your ruling, 2026-08-30: "no passwords" means no password can ever
_authenticate_.** Sessions come only from a magic link or from Google. The
stricter reading — that no account may *carry* a password — was rejected as
unachievable on Supabase Auth, for the reasons below. Creating an account that
has a password is therefore not a defect; getting a session out of one is. The
graders were amended to that reading before this branch landed, and the suite is
green against it.

**GoTrue exposes no setting that disables password authentication.** This was
established against a running stack, not assumed. Every password-related knob in
CLI 2.114 / GoTrue 2.195 makes passwords *stronger* and none makes them
*absent*, and the two that look like off switches are not:

- `[auth.email] enable_signup = false` disables email sign-up entirely — magic
  link included. It would close ACC-01's deny half by breaking its allow half.
- An absurdly high `minimum_password_length` does make
  `POST /auth/v1/signup` refuse a password (`422 weak_password`). It also makes
  `POST /auth/v1/otp` with `create_user` refuse, with the identical error,
  because GoTrue generates an internal password for passwordless accounts and
  validates it through the same rule. Magic-link sign-up dies with it. Observed.

**What is in force instead:** a password-verification hook
(`public.deny_password_login`, wired in `supabase/config.toml`) that GoTrue
calls on every password attempt and that rejects unconditionally. With it on, an
account whose password is *correct* gets:

```
POST /auth/v1/token?grant_type=password
400 {"error_code":"invalid_credentials",
     "msg":"Password sign-in is disabled. Use the email link or Google."}
```

There is no password anywhere in this project that opens a session.

**Why the stricter reading was not achievable.** A trigger on `auth.users`
rejecting a stored password was built and **removed**: GoTrue writes a bcrypt
hash for passwordless accounts too — of a random secret, not of the empty string
(`crypt('', encrypted_password) = encrypted_password` is false for an account
created with no password at all) — so the stored row cannot tell a chosen
password from a generated one, and the trigger rejected every account including
magic-link ones. The `before_user_created` hook cannot tell them apart either:
its payload for a password sign-up and for an OTP sign-up are byte-identical
apart from ids and timestamps. Both were checked against a running stack, not
reasoned about.

**What that leaves, and why it is safe.** `POST /auth/v1/signup` with a password
returns 200 and creates an account. Two things make that harmless, and the
second one is why `enable_confirmations` is not optional:

1. The credential is inert — the hook refuses it forever, then and later.
2. **No session comes back.** With `Confirm email` on (Step 3b), the response is
   a bare unconfirmed user: no access token, no refresh token. With it *off* —
   which is the Supabase CLI's default and what this branch originally shipped —
   that same request returned both, so the one request in the system carrying a
   password handed back a working session, and anyone could pre-claim an address
   they did not own and still be inside it when the real owner later signed in
   by magic link. Found by review, against a running stack. **If you ever turn
   `Confirm email` off, you reopen exactly that.**

`tests/garage/auth-surface.test.ts` pins both halves along the path a stranger
would actually take: sign up with a password, assert no token comes back, then
assert the same correct password still yields no session.

---

## What did NOT change, deliberately

- **No Supabase project was created by an agent, and no key exists in this
  repository.** Every credential above is yours to create and to paste into a
  dashboard.
- **No service key anywhere**, including in CI, including in the graders. The
  behavioural tier mints its own tokens against the Supabase CLI's *published*
  local development secret and refuses any target that is not loopback.
- **Reference content still lives in git.** MIG-03 moves user data to Supabase
  and nothing else; the git → database sync for reference content is unchanged
  and still one-directional.
- **No analytics or ad SDK** was added with the auth surface (ACC-04). The
  sign-in page loads one thing beyond the site's own CSS, and only after you
  click: the Supabase client.

---

## Running the behavioural graders yourself

You do not need any of the above to run them — they use a throwaway local stack
and refuse to talk to anything that is not loopback.

```sh
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=TEST-placeholder
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=TEST-placeholder
supabase start          # needs Docker; colima start first if you use colima
npm run test:garage     # GARAGE_LIVE=1 GARAGE_LIVE_REQUIRED=1
supabase stop
```

The two `TEST-placeholder` values exist only because the CLI refuses to start an
enabled OAuth provider with an empty client id. Google is never contacted; the
graders assert that it is *advertised*, which is all that can be checked without
a browser.

**One stack per repo, no matter how many worktrees.** `supabase start` keys its
containers and volumes on the **committed `project_id`**, not on the directory
or the ports — so every agent worktree of this repo shares one database, and two
concurrent live runs quietly overwrite each other's fixtures. That corrupts
*green*-ward: a grader that should have failed can pass because another run had
already created the row or deleted the object it was checking for. Before
running the live tier alongside anyone else, either `supabase stop` first, or
copy `supabase/` to a scratch directory outside the repo, give it a unique
`project_id`, shift its ports, and `supabase start --workdir` there.
