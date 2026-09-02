# Spec 002 — Montero Garage: the multi-user pivot

**Status:** DRAFT — awaiting owner approval (this PR). Nothing in it is
buildable until the owner merges it and the constitution amendments in §8 land.
**Written:** 2026-08-28 · **Supersedes parts of:** `specs/001-foundation`
(§5 Garage; SCF-05 hosting; the single-truck framing)
**Owner decisions already made (2026-08-28):** site name **monterogarage.com**;
sign-in = email magic link + Google OAuth; default visibility = private,
share-by-choice; hosting moves to **Vercel** with the rename.

## 1. What changes and what does not

The site stops being the record of one truck and becomes **the place any
Montero owner keeps their truck's whole life**: a named vehicle profile, every
receipt, every job, every part — private by default, shareable by choice. The
reference side of 001 (problem finder, parts, procedures, glossary, taxonomy,
community directory) is unchanged in mission and continues as specced; it is
what makes the garage useful.

The owner's 2002 Montero — **Gitana Blanca** — becomes user page #1: the
template every other owner's garage is shaped by, populated with real data
(001's T303 owner-interview backfill lands there instead of in a site-global
garage collection).

Two truths carried over from 001, unchanged: bilingual EN / Costa Rican ES on
every user-facing surface, and the Facts non-negotiables (no invented part
numbers, cited specs) for everything *reference*; user-entered garage data is
the user's own record and is not fact-checked by the site.

## 2. Definitions (additions to 001 §2)

| Term | Definition |
|---|---|
| **User** | An authenticated account (Supabase Auth: email magic link or Google). |
| **Vehicle profile** | A user-owned Montero/Pajero/Shogun: display name (e.g. "Gitana Blanca"), taxonomy identity (gen/market/year/engine…, resolved against 001's vehicles collection), photos, current odometer. A user may own several. |
| **Record** | A dated entry on a vehicle: work done, receipt, part installed, fluid change, odometer reading, note. Carries optional cost, attachments, and references into the reference collections (problem/part/procedure ids). |
| **Receipt** | An attachment (image/PDF) on a record, stored in the user's private storage, with parsed-or-typed vendor/date/amount fields. |
| **Showcase page** | A user-curated public page for one vehicle: photos, story, build highlights. Off by default. |
| **Work-log page** | An optionally public, chronological view of a vehicle's records with per-record and per-field (cost) visibility control. Off by default. |

## 3. Accounts & identity (ACC)

- **ACC-01** THE site SHALL authenticate users via Supabase Auth with email
  magic link and Google OAuth, and no password flow.
- **ACC-02** THE account surface SHALL be fully bilingual (I18N-01/08 apply to
  every authenticated view).
- **ACC-03** A user SHALL be able to delete their account; after a 30-day recovery
  window, all vehicles, records, and stored files SHALL be hard-deleted.
- **ACC-04** THE site SHALL NOT add third-party analytics or ad SDKs with the
  auth surface (001 boundary survives).

## 4. Vehicles & records (GAR′ — replaces 001 §5 GAR)

- **GAR-01′** A user SHALL create vehicle profiles with a display name,
  taxonomy identity resolved by the 001 fitment engine, photos, and odometer.
  A user SHALL be able to designate one uploaded photo as the vehicle's
  **cover photo** (owner-approved addition, 2026-09-02), rendered wherever
  the vehicle is shown as a single item — the garage vehicle list, and any
  future showcase-page card (SHR-02). Removing the designated cover photo
  SHALL leave the vehicle with no cover rather than silently promoting
  another one; a vehicle with photos but no cover renders its existing
  no-photo placeholder.
- **GAR-02′** A user SHALL add records to their vehicle: dated, typed (work /
  receipt / note / plan), with optional cost, time, odometer, attachments, and
  typed references to reference entries (problems, parts, procedures).
- **GAR-03′** THE derived views of 001 GAR-02/03 (current-state sheet, planned
  queue) SHALL be computed per vehicle from its records, never hand-maintained.
- **GAR-04′** WHEN a record references a problem entry and its vehicle's
  work-log is public, THE problem page MAY surface it as community first-hand
  evidence (opt-in per record; the 001 GAR-04 idea, now multi-user).
- **GAR-05′** Receipts SHALL be first-class: uploadable (image/PDF) into
  user-private storage, with vendor/date/amount fields, never publicly
  accessible unless the specific record's cost visibility is opened.

## 5. Sharing (SHR)

- **SHR-01** Everything a user stores SHALL default to private (owner decision
  2026-08-28). The database enforces it; no client-trusted checks. Enforcement
  has exactly **three** modes and no fourth (amended 2026-08-31, see §10):
  row-level security scoped to `auth.uid()`; the public visibility columns of
  SHR-02; and the typed grants of SHR-05, whose checks live in
  `security definer` functions inside the database. A check that lives in
  client code, in page code, or in a server route is none of these and is
  forbidden.
- **SHR-02** A user SHALL be able to publish, per vehicle: a showcase page
  and/or a work-log page, each at a stable public URL under their handle,
  bilingual chrome, user content in whatever language the user wrote.
- **SHR-03** Costs and receipts SHALL stay private even on a public work-log
  unless opened per record.
- **SHR-04** Public pages SHALL carry the reference site's chrome and design
  (HANDOFF-DESIGN.md) and hreflang per 001 I18N-04.

### Typed share grants (added 2026-08-31 — owner ruling, see §10)

The four columns behind SHR-02/03 express one audience: the world. They cannot
express the thing an owner needs most — *hand my mechanic this truck's whole
history, costs included, for the next month.* SHR-05..08 add a second principal.

- **SHR-05** A user SHALL be able to issue, per vehicle, a **typed share
  grant**: a revocable, expiring, capability-scoped bearer token that admits
  its holder to a defined subset of that vehicle's data. A grant SHALL carry a
  `kind` naming its preset (`mechanic`, `buyer`), and the preset SHALL be a
  label over explicit capability fields, never a branch in consuming code.
- **SHR-06** Capabilities SHALL be scoped per grant and SHALL open
  independently: costs and receipts are two decisions, not one. WHERE a grant
  does not open costs, THE data returned SHALL omit the cost fields entirely
  rather than blanking them at render time.
- **SHR-07** THE holder of a grant SHALL NOT be required to have an account,
  and the accountless path SHALL be read-only. WHILE a request carries no
  authenticated session, no grant SHALL admit any write.
- **SHR-08** Every grant SHALL be revocable by its issuer at any time and
  SHALL carry an expiry. IF a grant is expired, revoked, or unknown, THEN the
  refusal SHALL be indistinguishable across all three cases — same status, same
  body, same shape — so that the surface is not an existence oracle. Revocation
  SHALL take effect on the next request and SHALL never be gated by payment,
  by plan, or by any other condition.
- **SHR-09** A grant SHALL NOT make a record eligible for the community
  evidence surfacing of GAR-04′. That path keys on a *public* work-log; a
  record visible to one grantee is not public, and treating it as such would
  put a private work-log on a public problem page.

## 6. Platform & migration (MIG)

- **MIG-01** THE repo/site SHALL be renamed **monterogarage** in one
  coordinated change: repo name, `base` (drops to `/` on Vercel), `site`
  (`https://monterogarage.com`), `src/site.ts`, UI strings, README, and the CI
  base-assertion — with redirects from the old Pages URL for as long as GitHub
  keeps them.
- **MIG-02** Hosting SHALL move to Vercel (owner decision 2026-08-28,
  superseding SCF-05's GitHub Pages era): production on merge to `main`,
  preview deployments on PRs (restoring the original SCF-05 preview behavior),
  same merge-blocking CI gates.
- **MIG-03** Supabase graduates from "phase-8 read-model" to the platform's
  auth + user-data + storage layer. The 001 rule "site content truth lives in
  git" is UNCHANGED for reference content; user data's source of truth is the
  database. The one-directional git→DB sync for reference content (001 RM-01)
  stays as designed.
- **MIG-04** Gitana Blanca SHALL be seeded as user page #1, populated via the
  001 T303 owner interview, and used to drive the design of every garage view
  before generalization.
- **MIG-05** THE site SHALL carry a bilingual "independent enthusiast site,
  not affiliated with Mitsubishi Motors" notice in the footer from the rename
  onward.

## 7. What this does to 001's remaining tasks

- **Unchanged:** T201–T208 (taxonomy, fitment, glossary, reference), T4xx
  problem finder, T5xx parts/procedures, T6xx mods, T701/T702/T703/T703a.
- **Superseded:** T301/T302/T303/T304 → re-cut as 002 tasks on the user model
  (T303's interview content lands in Gitana Blanca's records).
- **Amended:** T106's deploy config (MIG-02), SCF-05 (Vercel, previews back).
- **Phase 8 (RM):** absorbed into MIG-03; T801–T803 re-scoped when reached.

## 8. Constitution amendments required (AGENTS.md — owner sign-off = merging this PR authorizes a follow-up PR making exactly these edits)

1. "What this is": one-truck framing → platform framing; the truck is named
   **Gitana Blanca** and is user page #1.
2. Boundaries: "no user accounts / v1 read-only" → accounts per ACC-01..04;
   the boundary becomes "no analytics/ads SDKs; no monetization; user data
   never leaves Supabase; RLS on every user table; contributions to
   *reference* content still arrive only via PRs."
3. Stack: "GitHub Pages for deploy" → Vercel (MIG-02); Supabase line → MIG-03
   wording; name → Montero Garage.
4. Facts: add one line — user-entered records are the user's own testimony,
   rendered as such, never presented as site-verified reference facts.

## 9. Task list

Draft task breakdown in [`tasks.md`](tasks.md) (same conventions as 001).
Routing: everything touching auth, RLS, storage policies, user-data schemas, or
**share grants and anon-executable functions** is hard-Opus (extends 001's
routing policy `secrets-or-deploy` / `content-schema` triggers).

## 10. Amendment 2026-08-31 — typed share grants

§8's amendments landed as `e7fd9b2`. This is a **second round**, and it is
recorded separately rather than folded into §8 so the audit trail stays
readable.

**Owner rulings, 2026-08-31:**

1. **Propose-and-accept.** A mechanic holding an account and a live grant may
   draft a quote or a completed job. It lands in the owner's garage as a
   *pending proposal* and becomes a record only when the owner accepts. The
   owner's acceptance is the write.
2. **Monetization is authorized, shop-side only.** Owners are free forever.
3. Grants amend this spec (SHR-05..09). The shop surface — accounts, roster,
   proposals, entitlements — is [`specs/003-shop-tools`](../003-shop-tools/spec.md).
4. The accountless mechanic view is history + costs + receipts **plus** the 001
   reference filtered to that exact vehicle by the fitment engine.

**Why SHR-01 needed widening rather than an exception.** SHR-01 said RLS
enforces privacy "with no client-trusted checks". A grant read by someone with
no `auth.uid()` is not RLS, and it is not a client-trusted check either — it is
a third thing. Left unnamed, every grader citing SHR-01 for a grant would be
citing a requirement that does not cover it. §5 now names all three modes and
closes the set.

### Constitution amendments required

Owner sign-off = merging this PR authorizes a follow-up PR making exactly these
edits to `AGENTS.md`, and no others (the §8 pattern).

1. **Boundaries, "any user-to-user writable surface" (currently ~:149-152).**
   Carve out propose-and-accept per 003: a holder of a live grant may submit a
   proposal, which is inert until the owner accepts it. Direct writes into
   another user's records, comments, and messaging stay stop-and-ask.
2. **Boundaries, "Adding affiliate or monetization mechanics of any kind"
   (currently :154).** Replace the blanket ban with a bounded one:
   shop-side subscription per 003 is permitted; **owners are free forever and
   payment never gates an owner's access to their own data, nor revocation of a
   grant**; no sale or brokerage of user data; no paid placement or paid
   ranking in the community directory; the :137 affiliate-disclosure rule and
   ACC-04's ads/analytics ban both survive untouched.
3. **Facts, "user-entered garage records are the user's own testimony"
   (currently :118-120).** Extend to accepted proposals: a record created by
   accepting a mechanic's proposal carries its provenance, remains the owner's
   own record, and is never presented as a site-verified reference fact.
4. **"What this is".** A second actor class now exists — shops — and the
   platform has two kinds of account, not one.
