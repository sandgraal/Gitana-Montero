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
  holds 157 `it.fails` graders plus 81 unmarked positive controls.
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
- [ ] **T2-202 [PLATFORM]** Supabase auth (magic link + Google, no passwords) +
  user/vehicle/record/receipt tables with RLS + private storage bucket.
  Activates T2-201 graders. Bilingual auth surface. Depends: T2-201 merged.
  *(ACC-01..04, SHR-01)*

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
