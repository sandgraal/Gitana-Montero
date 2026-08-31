# Tasks 002 — Montero Garage pivot

DRAFT — buildable only after the owner merges spec 002 and the AGENTS.md
amendment PR lands. Conventions identical to 001 (frontier rule, [TEST] before
[PLATFORM] pairs, [CONTENT] dual passes, checkbox in final commit, commit refs
`specs/002-montero-garage`). Everything touching auth, RLS, storage policies,
or user-data schemas routes hard-Opus.

Domain: monterogarage.com is purchased (Namecheap, 2026-08-28). DNS cutover to
Vercel is an owner action inside T2-102 (the task prepares the exact records).

## Phase P0 — Rename & replatform

- [x] **T2-101 [PLATFORM]** Coordinated rename gitana-montero → monterogarage:
  repo rename (redirects verified), `site` → https://monterogarage.com,
  `base` → "/", src/site.ts (SITE_NAME → "Montero Garage", REPO_URL,
  keep TRUCK_YEAR with Gitana Blanca naming), ui.ts mission strings both
  locales, README, CI base-assertion updated for the no-base world,
  check:hreflang against the new absolute URLs, bilingual not-affiliated
  footer notice (MIG-05). *(MIG-01, MIG-05)*
  <br>**Landed in two halves on purpose.** GitHub Pages is the live deploy
  until T2-102, and a Pages *project site* is only reachable when `base` ===
  `/<RepoName>`. So T2-101 renamed the repository and set `base` to
  `/monterogarage`, leaving `site` at `https://sandgraal.github.io`; setting
  `site` to the custom domain before the DNS cutover (an owner action inside
  T2-102) would have published canonical/hreflang URLs at a host that does
  not answer. **T2-102 owns the remaining two lines of MIG-01:** `site` →
  `https://monterogarage.com`, `base` → `/`, and deleting the CI
  base-assertion step in the same commit.
- [x] **T2-102 [PLATFORM]** Vercel migration: project setup, production on
  main + preview deployments on PRs, CI gates unchanged and still
  merge-blocking, Pages deploy retired with a tombstone redirect, DNS records
  handed to the owner for Namecheap (owner action), Lighthouse/Pa11y budgets
  re-proved on the Vercel URL. **Also finishes MIG-01:** `site` →
  `https://monterogarage.com`, `base` → `/`, CI base-assertion step deleted
  (see T2-101). Depends: T2-101. *(MIG-02; amends 001 SCF-05)*
  <br>**Two parts are owner actions and are written out, not done:**
  `specs/002-montero-garage/HANDOFF-T2-102-DEPLOY.md` has the Vercel project
  import (do it *before* merging, so production is one automatic build away
  when `main` moves — but note the pre-merge deployment renders broken by
  construction, because `main` still sets `base: "/monterogarage"` while the
  output tree has no such directory; the merge is what fixes it, so nothing
  about the merge is gated on that deployment rendering) and the exact
  Namecheap records, read off Vercel's live docs on 2026-08-28. The Pages
  tombstone is **staged, not fired**: `.github/workflows/pages-tombstone.yml`
  is `workflow_dispatch`-only and refuses to publish until
  monterogarage.com answers, because removing the deploy job freezes the
  Pages site rather than breaking it — stale-but-working beats a redirect to
  a host that does not resolve. Budgets were re-proved against the
  `base: "/"` build served locally (both audits serve `dist/` themselves;
  they never needed the Vercel URL). Also closed a T2-101 review follow-up:
  `src/pages/404.astro` had no footer, so MIG-05's notice missed it.

## Phase P1 — Auth & user model

- [x] **T2-201 [TEST]** Graders for the user-data contract: RLS deny-by-default
  proofs (anon reads nothing private; user A cannot read user B), vehicle/record
  schema shape, receipts storage policy (no public URL for private objects),
  account-deletion cascade. Expected-failure markers. Depends: T2-102.
  *(ACC-01, ACC-03, SHR-01, GAR-05′)*
  <br>**Two tiers, because one of them cannot run in CI yet.** `tests/garage/`
  holds **77 `it.fails` marker lines → 216 marked tests** (161 failing today,
  55 skipped with the live stack absent) plus **143 unmarked positive
  controls**.
  *Tier A (declaration)* reads T2-202's DDL out of `supabase/migrations/` and
  `supabase/config.toml` and runs everywhere, forever — RLS enabled **and
  forced**, no policy granted to `anon`/`public`, every policy scoped to
  `auth.uid()`, share flags `not null default false`, every ownership FK
  `on delete cascade`, the receipts bucket created non-public, Google on and
  every other provider off. *Tier B (behavioural)* proves the same guarantees
  against a real Postgres through the real PostgREST / GoTrue / Storage
  surfaces as three actors (anon, owner A, owner B), and needs
  `supabase start` — i.e. Docker, which CI does not have. Tier B suites
  `describe.skipIf` with the reason printed in the report, and
  `GARAGE_LIVE_REQUIRED=1` turns a missing stack into a hard failure, so the
  day CI grows a Postgres service one environment variable makes every
  behavioural proof merge-blocking with no test-file edits. Run it locally
  with `npm run test:garage`.
  <br>**No dependency, no key, no cloud.** JWTs are minted with `node:crypto`
  against the Supabase CLI's published local development secret and everything
  else is `fetch`; `assertLocalTarget` refuses any non-loopback host and is
  itself graded against a table that includes `*.supabase.co` and
  monterogarage.com. No Supabase project was created and no service key exists.
  <br>**T2-202 owns the seam:** `supabase/config.toml` + `supabase/migrations/`,
  and deleting `tests/garage/seam-canary.test.ts` (self-enforcing — leaving it
  turns `npm test` red). Table and column names are T2-201's design decision on
  the spec's behalf and live only in `tests/garage/contract.ts`, so a rename is
  a one-file change. Two things are **declaration-tier only** and named as
  gaps rather than faked: "no policy ⇒ no access" proved behaviourally needs a
  throwaway table, i.e. a direct SQL connection rather than PostgREST; and
  whether GoTrue can disable the password grant outright is a T2-202 finding —
  if it cannot, that is a stop-and-ask, not a quietly weakened grader.
  <br>**Rebuilt after review round 1, which proved the declaration tier was
  grading spelling rather than semantics.** Three wide-open schemas passed the
  entire merge-blocking proof and five correct DDL spellings were rejected. The
  cause was one design mistake with wide blast radius: predicates were matched
  as substrings against the *whole* policy statement, so `using` and
  `with check` were graded as their concatenation and a correct write rule
  covered for a read rule that handed every logged-in user everybody's rows.
  The rules now live in `tests/garage/rules.ts` as pure functions over DDL, and
  a predicate counts as owner-scoped only when **every top-level `or` branch**
  compares `auth.uid()` *by equality* against a row term — mention is not
  enough, and `or` is how a scoped predicate gets widened. Storage adds one
  clause: the read predicate must derive the owner from the object path, since
  that is the only thing about a storage row that says whose it is.
  <br>**`tests/garage/reviewer-probes.test.ts` pins the finding class forever:**
  the review's own leaking schemas plus the correct spellings it rejected,
  twelve variants with a known verdict, unmarked and green. Wide-open must
  fail, correct must pass; the next person to loosen a rule has to make a leak
  pass here first. Both directions were re-proved end-to-end against a scratch
  reference schema: correct → 168/168 declaration graders pass (so the contract
  is *satisfiable*, which round 1's ACC-03 pairing was not); three leaks
  injected → exactly 3 graders fail, each naming the offending clause.
  <br>ACC-03 is now two functions rather than one incoherent one:
  `request_account_deletion()` takes **no argument** and marks the caller's own
  row via `auth.uid()` — a victim is unrepresentable, not merely forbidden —
  and `purge_expired_accounts(p_now)` is the scheduled job, service-role only,
  taking the clock so a grader can reach "thirty days later" without waiting.
  <br>**Round 2 closed two more holes in the same guarantee class, both found
  by writing DDL rather than by reading code.** *Uncorrelated `exists`*: a
  subquery can carry a real `owner_id = auth.uid()` and still say nothing about
  the current row — `exists (select 1 from vehicles where owner_id =
  auth.uid())` means "own any truck, read everyone's records". Correlation back
  to the outer row *is* the ownership claim, so a predicate whose only equality
  lives in a subquery must now join back (qualified `records.vehicle_id` or the
  unqualified form Postgres resolves outward; both accepted). *`alter policy`
  was invisible*: `policies()` filtered on `create policy`, so a follow-up
  migration saying `alter policy … using (true)` reopened the original hole with
  every grader green. It now replays create/alter/drop in order and asks what
  the database looks like at the **end** of the directory. Also accepted:
  Supabase's own recommended `(select auth.uid()) = owner_id` and
  `owner_id in (select auth.uid())`, which were failing closed — a grader that
  rejects the officially recommended spelling pushes the implementation toward
  the slower one to get a green build.
  <br>**The probe corpus was itself mutation-tested, and had a hole.**
  Reintroducing the original F1 bug left every end-to-end probe green: P1 and
  P4 are caught by the tautology list and the path rule *before* the equality
  rule is reached, so the load-bearing rule was pinned only by unit tests of
  its own helper. N11/N12 close that — neither is tautological, neither is
  storage, so nothing but the equality rule can reject them. The same treatment
  was applied to the new rules (N4 for correlation, N3 for `alter policy`):
  each was verified by breaking its rule on purpose and confirming the corpus
  goes red. Four mutations, four caught by end-to-end probes.
  <br>**Also not graded here, and deliberately: SHR-02's public handle.**
  Uniqueness under concurrent signup, case folding, reserved words like
  `admin`/`api`, and what a handle change does to a published URL are each a
  grader of their own and none is in T2-201's scope. **They belong to T2-401**
  with the public pages. This file's silence is not permission.
- [ ] **T2-202 [PLATFORM]** Supabase auth (magic link + Google, no passwords) +
  user/vehicle/record/receipt tables with RLS + private storage bucket.
  Activates T2-201 graders. Bilingual auth surface. Depends: T2-201 merged.
  *(ACC-01..04, SHR-01)*
  <br>**OWNER RULING on ACC-01, 2026-08-30 — "no passwords" means no password
  can ever _authenticate_.** Sessions come only from a magic link or from
  Google. The stricter reading — that no account may *carry* a password — was
  put to the owner and **rejected as unachievable on Supabase Auth**: T2-202
  proved live that GoTrue bcrypts a random secret even for accounts created
  without one, so "carries no password" is not a state the platform can be put
  in, and every path that blocks creation also breaks the magic-link flow
  ACC-01 requires. Creating an account that has a password is therefore **not**
  a finding; getting a session out of one is. The enforcement point is the
  `password_verification_attempt` hook, which answers a correct password on a
  real account with `400 "Password sign-in is disabled."` The T2-201 graders in
  `tests/garage/auth-surface.test.ts` were amended to the ratified reading
  (branch `fix/002-acc01-grader-ruling`, merged ahead of T2-202); the grader
  that demanded a refusal at signup is gone, as is the escape hatch that
  treated "creation refused" as a pass.
  <br>**Inherited from T2-201 — close the shared-name correlation gap when the
  first real policy lands.** `isCorrelated` in `tests/garage/rules.ts` accepts
  the unqualified back-reference spelling (`where v.id = vehicle_id`) by
  matching the outer table's column *names*; it does not resolve them against
  the subquery's own `from` list. So when the inner table declares a column of
  the same name, a bare mention is read as correlation when it is not, and the
  uncorrelated subquery D1 exists to catch is waved through. **This fails open,
  not closed** — it admits a wide-open policy rather than rejecting a correct
  one. Reachable with this contract's own columns: `records` and `vehicles`
  share exactly `{id, odometer_km}`, and both `where id = id and owner_id =
  auth.uid()` and a bare `odometer_km` predicate return `true` today.
  <br>The fix is a few lines and `rules.ts` already imports `USER_TABLES`:
  subtract the *inner* table's declared columns from `outerColumns` before the
  bare-name test, which closes both shapes. It was deferred out of T2-201 on
  purpose — a rule tightened against no real DDL is a rule tuned to its own
  fixtures, and the right time is when there is an actual policy to test it
  against. **Add both shapes to the probe corpus in
  `tests/garage/reviewer-probes.test.ts` at the same time**, in the N-series
  alongside N4, so the tightened rule is pinned the way every other rule there
  is: break it on purpose and confirm the corpus goes red. Full note in the
  `isCorrelated` docstring.

## Phase P2 — The garage

- [ ] **T2-301 [PLATFORM]** Vehicle profile: create/edit, display name,
  taxonomy identity via the 001 fitment engine, photos, odometer. Garage
  dashboard per HANDOFF-DESIGN.md's timeline direction. Depends: T2-202, 001-T203. *(GAR-01′)*
- [ ] **T2-302 [PLATFORM]** Records + receipts: dated typed records, cost/time/
  odometer, attachment upload to private storage, vendor/date/amount fields,
  typed references into reference collections. Depends: T2-301. *(GAR-02′, GAR-05′)*
- [ ] **T2-303 [PLATFORM]** Derived views per vehicle: current-state sheet +
  planned queue, computed. Depends: T2-302. *(GAR-03′)*
- [ ] **T2-304 [CONTENT+DESIGN]** Gitana Blanca seed — user page #1: owner
  interview (001 T303's content) entered as real records with receipts;
  conductor+owner refine the garage views against it before generalization.
  Depends: T2-302. *(MIG-04)*

## Phase P3 — Sharing

- [ ] **T2-401 [TEST]** Sharing graders: private-by-default proofs at the URL
  level, per-record cost masking on public work-logs, showcase toggle
  round-trip. Depends: T2-302. *(SHR-01..03)*
- [ ] **T2-402 [PLATFORM]** Showcase + work-log public pages: stable handle
  URLs, per-vehicle toggles, per-record/per-field visibility, HANDOFF-DESIGN.md
  chrome, hreflang. Activates T2-401. Depends: T2-401 merged, T2-303. *(SHR-02..04)*
- [ ] **T2-403 [PLATFORM]** Community evidence surfacing: opt-in per-record
  first-hand evidence on problem pages (001 GAR-04 re-cut). Depends: T2-402,
  001-T401. *(GAR-04′)*

## Superseded from 001

T301–T304 are closed by this file (T303's substance lives in T2-304).
001 Phase 8 (T801–T803) is absorbed into the T2-2xx Supabase work and will be
re-scoped when reached.
