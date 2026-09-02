# Spec 003 — Shop tools: the mechanic's side of the garage

**Status:** APPROVED — the spec merged (PR #56) and its §7 constitution
amendments landed the same day (PR #59), both 2026-08-31. The remaining
gate is not governance: it's code. `specs/002-montero-garage` Phase P3
(T2-401, then T2-402 and T2-404, which this spec's roster and proposal
surfaces build directly on) must merge first — see that spec's `tasks.md`
for current status.
**Written:** 2026-08-31 · **Depends on:** `specs/002-montero-garage` SHR-05..09
(typed share grants), which this spec assumes exist.
**Owner rulings already made (2026-08-31, recorded in 002 §10):**
propose-and-accept; monetization authorized shop-side only; owners free forever.

## 1. What this is

002 gives a vehicle owner a way to hand someone a scoped, expiring link. This
spec is about the person on the other end of that link — the mechanic — and
about the shop they work in.

Two things have to be true at once, and they pull against each other:

1. **The link must work with no account.** A mechanic with a phone in a bay and
   a customer waiting will not sign up for anything. SHR-07 makes the
   accountless path a requirement, not a courtesy.
2. **An account must be worth creating anyway.** Otherwise there is no shop
   side, and the only relationship the platform has with the trade is a URL.

The resolution is that the two paths differ in *kind*, not in degree, and the
difference falls out of the security architecture rather than being imposed on
it: **the accountless path is read-only because it has no `auth.uid()`.** An
account is what makes a mechanic addressable — by the roster, by a proposal, by
a shop. Nothing has to be withheld to make the account attractive; the account
is simply the only place the write path can exist.

## 2. Definitions (additions to 001 §2 and 002 §2)

| Term | Definition |
|---|---|
| **Mechanic** | An authenticated user who holds, or has held, a share grant on someone else's vehicle. The same account type as a vehicle owner (002 ACC-01) — the role is a relationship, not a separate login. |
| **Shop** | A named business with one or more member accounts. Optionally claims an existing `shop` entry in the 001 community directory. |
| **Roster** | The set of vehicles a mechanic or shop currently holds a live grant on, plus those an owner has pinned to them past expiry. |
| **Proposal** | A draft record — a quote, or a completed job — authored by a mechanic against a vehicle they hold a `can_propose` grant on. Inert until the owner accepts it. |
| **Entitlement** | A capability a shop has because of its plan. Never a capability an *owner* has or lacks. |

## 3. The mechanic surface (MEC)

- **MEC-01** WHEN a grant holder opens a share link without an authenticated
  session, THE site SHALL render the vehicle's identity, its permitted records,
  and the capabilities the grant opens — and nothing else. No account prompt
  blocks the content.
- **MEC-02** THE accountless view SHALL include the 001 reference filtered to
  that vehicle's resolved taxonomy identity by the fitment engine: torque
  specs, fluid capacities, known problems, and part fitment for that generation,
  market, year, and engine. This is what makes the link a tool in a bay rather
  than a list of past invoices.
- **MEC-03** THE accountless view SHALL state, in the reader's locale, when the
  grant expires and who issued it.
- **MEC-04** THE accountless view SHALL NOT be indexable: `noindex`, excluded
  from the sitemap, and excluded from the hreflang graph of 001 I18N-04. A
  bearer-token page has no place in a search index.
- **MEC-05** WHILE a mechanic is authenticated, THE site SHALL show every
  vehicle on their roster in one place, without requiring them to find the
  original link again.
- **MEC-06** An owner SHALL be able to extend a grant to "until revoked" for a
  named account, and SHALL be able to revoke it from the same place. SHR-08's
  refusal semantics apply unchanged.

## 4. Shops (SHP)

- **SHP-01** A user SHALL be able to create a shop, and to invite other
  accounts into it as members. Membership is by invitation from an existing
  member; there is no open join.
- **SHP-02** A shop SHALL be able to claim a `shop`-typed entry in the 001
  community directory. THE claim SHALL be verified before the directory renders
  any claimed badge, and an unverified claim SHALL change nothing a reader sees.
- **SHP-03** WHERE a grant is held by a shop member, THE shop's other members
  SHALL see it on the shop roster — subject to SHP-04.
- **SHP-04** An owner SHALL be told, at the moment of issuing, that a grant sent
  to a shop member is visible to that shop, and SHALL be able to issue it to the
  individual instead. Consent to share with a business is not implied by consent
  to share with a person who works there.
- **SHP-05** THE community directory's ordering, inclusion, and editorial
  content SHALL be unaffected by whether a shop has an account, a claim, or a
  plan. The directory is curated content under 001 COM-01 and stays that way.

## 5. Propose-and-accept (PRO)

The AGENTS.md carve-out this spec authorizes is narrow on purpose. Read §7.1
before implementing anything here.

- **PRO-01** WHERE a grant opens `can_propose` AND its holder is authenticated,
  THE holder SHALL be able to submit a proposal against that vehicle: a draft
  record with the same shape as 002 GAR-02′ (dated, typed, optional cost, time,
  odometer, typed references) plus optional line items.
- **PRO-02** A proposal SHALL have no effect on the vehicle until the owner
  accepts it. IF the owner accepts, THEN a record SHALL be created carrying the
  proposal's provenance — who authored it, under which grant, and when it was
  accepted. IF the owner rejects it, THEN nothing is created.
- **PRO-03** A proposal SHALL never be written into the `records` table in a
  pending state. Records have exactly one author path — their owner — and 002's
  RLS proves it. A proposal lives in its own table until acceptance copies it.
- **PRO-04** THE proposing mechanic SHALL be able to read and withdraw their own
  proposals, and SHALL NOT be able to read any other proposal on that vehicle,
  or any record the grant does not already open to them.
- **PRO-05** An accepted record SHALL render as the owner's own testimony per
  AGENTS.md, with its provenance visible — never as a site-verified fact, and
  never fact-checked by the site.
- **PRO-06** WHEN a grant is revoked or expires, THE holder SHALL immediately
  lose the ability to submit or withdraw proposals on that vehicle. Proposals
  already accepted are records and are unaffected; proposals still pending
  SHALL remain visible to the owner and SHALL remain rejectable.

## 6. Monetization (MON)

AGENTS.md banned monetization outright. §7.2 replaces that ban with a bounded
one, and these requirements are the bound. They are written as constraints
first because the constraints are the reason the ban is safe to lift.

- **MON-01** Vehicle owners SHALL be free, permanently. No feature that stores,
  reads, exports, or shares an owner's own data SHALL be gated by payment.
- **MON-02** Revocation SHALL never be gated. Neither shall expiry, deletion
  (002 ACC-03), or an owner's export of their own data.
- **MON-03** WHERE a shop's plan lapses, THE shop SHALL lose shop *tools* and
  SHALL NOT lose read access to any live grant a customer issued it. The
  customer's decision is not the platform's to bill against.
- **MON-04** THE site SHALL NOT sell, broker, license, or share user data with
  any third party. No exception for aggregate or anonymized data — the
  re-identification argument is not one this project will be having.
- **MON-05** THE community directory SHALL NOT carry paid placement, paid
  ranking, or paid inclusion (restates SHP-05 as a money rule because it will be
  tempting later). 001's affiliate-disclosure rule survives unchanged.
- **MON-06** THE site SHALL NOT add third-party analytics or ad SDKs with the
  billing surface. 002 ACC-04 survives the amendment intact.
- **MON-07** Chargeable shop capabilities SHALL be limited to: roster size
  beyond a free allowance, the quote builder, multi-member seats, and branded
  export of a vehicle history the shop already has a live grant on.
- **MON-08** THE billing provider SHALL NOT appear in the data model of any
  feature table. Entitlements are computed from a subscriptions table a webhook
  writes; no feature table carries a `plan` column.

## 7. Constitution amendments required

Owner sign-off = merging this PR authorizes a follow-up PR making exactly these
edits to `AGENTS.md`, and no others. These are the same edits enumerated in
002 §10; they are restated here because 003 is where they take effect.

### 7.1 The writable-surface carve-out

AGENTS.md Boundaries currently makes "any user-to-user writable surface"
stop-and-ask. The carve-out is **propose-and-accept only**, and it is bounded by
PRO-01..06:

- a proposal is inert until the owner accepts;
- it cannot be written into `records`;
- it requires an authenticated author holding a live `can_propose` grant;
- comments, messaging, and any direct write into another user's records remain
  stop-and-ask.

### 7.2 The monetization carve-out

AGENTS.md Boundaries currently reads "Adding affiliate or monetization
mechanics of any kind." It becomes shop-side subscription per MON-01..08, with
owners free forever, no data sale, no paid directory placement, and ACC-04 and
the affiliate-disclosure rule both surviving.

### 7.3 Testimony

AGENTS.md Facts gains: a record created by accepting a mechanic's proposal
carries its provenance, remains the owner's own record, and is never presented
as a site-verified reference fact.

### 7.4 Actor classes

AGENTS.md "What this is" gains a second actor class: shops.

## 8. Out of scope

Named so their absence is a decision rather than an oversight:

- Parts ordering, inventory, or supplier integration.
- Scheduling, dispatch, or any calendar surface.
- Invoicing or payment **between** an owner and a shop. The site is not a
  payment rail and MON does not make it one; a quote is a document, not a
  transaction.
- Mechanic-to-mechanic messaging, and any writable surface not named in PRO.
- Ratings or reviews of shops. The community directory is editorially curated
  (SHP-05) and a review surface is a different product with different problems.
- Multi-shop franchises, or a shop that is a member of another shop.

## 9. Task list

[`tasks.md`](tasks.md). Everything touching grants, RLS, anon-executable
functions, entitlements, or the proposal write path routes hard-Opus.
