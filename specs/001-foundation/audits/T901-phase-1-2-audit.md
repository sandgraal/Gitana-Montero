# T901 — Phase 1–2 closing audit, `specs/001-foundation`

**Auditor:** `code-reviewer`, fresh instance, no history with any branch audited.
**Audited tree:** `origin/main` @ `516d281` ("T208: VIN and option-code decoder
seed") — Phase 1 and Phase 2 fully checked in `tasks.md`.
**Date:** 2026-09-01.
**Mandate:** SCF-02, SCF-03, SCF-04, I18N-06.
**Method:** read-only against `origin/main`; every probe run in a throwaway
worktree at `origin/main`, never the main checkout; every scratch fixture
deleted and the tree confirmed clean (`git status --porcelain` empty) before
this report was written.

---

## Verdicts

| # | Mandate item | Verdict |
|---|---|---|
| 1 | Separation — graders unedited by implementers | **HELD-WITH-EXCEPTIONS** (1 finding) |
| 2 | Locale gate provably red on one-locale input | **HELD** |
| 3 | Routing policy intact | **HELD** for the artifact; **VIOLATION** for the provenance record (1 finding) |
| 4 | Gate health — every merge-blocking check fires today | **HELD** (8 of 8 red-run probes produced) |

Two findings total, both **medium**. No high-severity finding. No evidence of a
grader weakened to accommodate an implementation; every grader edit found on
`main` either strengthens the assertion or is mechanically neutral.

---

## Finding 1 — MEDIUM. An implementer edited a `[TEST]`-authored grader's assertion with no recorded exception

**Where:** `tests/schemas/entry-primitives.test.ts`, the `SOURCE_KINDS` grader
(lines ~213–228 on `main`).
**Commit:** `c8d25a9` `fix(schema): add manufacturer + reference source kinds`,
`X-Agent-Role: implementer`.
**Rule violated:** AGENTS.md *Orchestration* / plan.md §"TDD and separation
rules" — "the implementer activates by deleting the marker line only". This is
the one class of edit the phase audit exists to catch.

**Expected:** `tests/schemas/entry-primitives.test.ts` is `[TEST]`-authored
(T103, `424c077`, PR #5; last test-writer touch `af869c0`). Against that base,
`main` should differ only by `it.fails` → `it` and Prettier reflow.

**Found:** it also differs by an assertion rewrite —

```
-  it("SOURCE_KINDS holds exactly the six kinds plan.md names", () => {
-    expect([...SOURCE_KINDS].sort()).toEqual(
-      ["first-hand", "forum", "fsm", "tsb", "vendor", "video"].sort(),
+  it("SOURCE_KINDS holds exactly the eight kinds plan.md names", () => {
+    expect([...SOURCE_KINDS].sort()).toEqual(
+      ["first-hand", "forum", "fsm", "manufacturer", "reference", "tsb",
+       "vendor", "video"].sort(),
```

plus the file's header docstring. The commit message discloses the *schema*
change and carries `X-Agent-Role: implementer`; it discloses no grader edit, and
no grader-edit exception for it appears on any task line in `tasks.md`, in
`plan.md`, or in the commit trail. Every other T103 grader file is clean.

**Command and output:**

```
$ bash normdiff.sh af869c0 <file>     # marker-strip (it.fails→it) + prettier, then diff
tests/fixtures/schema-fixtures.ts                CLEAN
tests/helpers/schema-outcome.ts                  CLEAN
tests/schemas/collections.test.ts                CLEAN
tests/schemas/data-prose-split.test.ts           CLEAN
tests/schemas/entry-primitives.test.ts           *** DIFFERS beyond marker deletion
tests/schemas/prose-locale-completeness.test.ts  CLEAN
tests/schemas/slug-registry.test.ts              CLEAN

$ git show --name-only --format="" c8d25a9
src/schemas/entry.test.ts
src/schemas/entry.ts
tests/schemas/entry-primitives.test.ts
```

**Mitigating, and why this is medium rather than high.** The grader pinned
itself to `plan.md` ("exactly the six kinds *plan.md names*"), and `plan.md` was
amended to eight kinds by a ratified conductor commit — `4c4ee07`
`docs(plan): SOURCE_KINDS manufacturer + reference amendment` (PR #36,
`X-Agent-Role: conductor,pr-shepherd`) — which lands **before** `c8d25a9` in
history. So the edit tracks an authorized spec change rather than accommodating
an implementation, and it *widens* an exhaustive-membership assertion, which
cannot mask a defect in the other direction (the negative-kind grader
`rejects the source kind %j` is untouched and still red-tests `blog`, `guess`,
`chatgpt`, `FSM`, `""`).

**What should have happened:** the same disclosure pattern T203, T204 and T208
all used voluntarily — a grader-edit exception recorded on the task line, and
ideally the edit made by a test-writer instance rather than the implementer.
The pattern was invented *after* this commit, which is the likeliest
explanation.

**Disposition asked for:** ratify retroactively by recording the exception on
the T207 task line (which already narrates the `manufacturer`/`reference`
pull-forward), so the register is complete rather than silently one short.

---

## Finding 2 — MEDIUM. Authoring-role model/effort is not recorded anywhere, so hard-Opus routing is unauditable

**Rule:** `CLAUDE.md` — "Model routing per `.claude/routing/routing-policy.json`;
record `T### -> role -> model/effort (reason)` before each dispatch." AGENTS.md
*Orchestration* — schemas, fitment taxonomy, i18n routing and safety content
"are Opus work regardless of diff size."

**Expected:** for a hard-Opus-trigger task, the merged record should let a fresh
auditor confirm the authoring agent actually ran on Opus.

**Found:** no dispatch log is persisted in the repository (`.claude/` contains
`agents/`, `commands/`, `hooks/`, `routing/`, `settings.json` — no session or
dispatch record). Commit trailers carry `X-Agent-Role` but no model. PR bodies
consistently record the **reviewer's** model and nothing about the author's.
Sampling five merged PRs whose tasks fire a `hardOpusTriggers` value:

| PR | Task | Trigger | Author model recorded? | Reviewer model recorded? |
|---|---|---|---|---|
| #5 | T103 | `content-schema` | no | no |
| #11 | T104 | `content-schema` | no | no |
| #23 | T200 | `fitment-taxonomy`, `content-schema` | no | no ("Code-reviewed: Approved") |
| #24 | T205 | `content-schema` | no | no |
| #46 | T202 | `fitment-taxonomy` | no | yes — "code-reviewer agent (opus)" |

A wider sweep of all 70 merged PRs finds a model named in 10 PR bodies, and in
every case it is the reviewer's (`opus`), never the author's.

**Consequence:** the routing *policy* is verifiably intact and its
`code-reviewer: opus` default is corroborated by the review trail — but the
hard-Opus **escalation** for schema and fitment authoring, which is the clause
plan.md calls load-bearing ("taxonomy and fitment-engine tasks are hard-Opus
regardless of size"), rests entirely on assertion. It cannot be audited now and
will be less auditable at T902.

**Remedy:** add an `X-Agent-Model: <model>/<effort>` trailer beside the existing
`X-Agent-Role`, and extend `scripts/validate-routing.mjs` (or a new check) to
assert its presence on task commits. Cheap, durable, and makes the next
phase-closing review mechanical.

---

## 1. Separation — the exception register

Role ledger built from `X-Agent-Role` trailers across all 68 commits on
`origin/main`. Grader provenance established per file by
`git log --follow`; every `[TEST]`-authored file then compared against its
authoring commit under a normalization that strips **only** the expected-failure
markers (`it.fails(` → `it(`, `it.fails.each` → `it.each`) and re-runs Prettier,
so marker deletion and the reflow it forces are invisible and everything else is
not.

`[TEST]`-authored grader sets on `main`:

| Set | Authoring commit | Role | Activating commit | Role |
|---|---|---|---|---|
| T103 entry-schema contract (7 files) | `424c077` (PR #5), last test-writer touch `af869c0` | pre-trailer era / `test-writer` | `4a24602` (T104) | implementer |
| T202 fitment engine (7 files) | `2ea9d0b` (PR #46) | `test-writer` | `4f922fb` (T203) | implementer |
| T2-201 user-data contract (10 files) | `66b5da9`, amended `b2c0fca` | `test-writer` | `d166a36` (T2-202) | implementer |
| T2-301a vehicle photos (5 files) | `4272e2c` | `test-writer` | `8d404a9` (T2-301) | implementer |

### Register — every recorded exception, audited against git

| # | Recorded exception | Where recorded | Verification |
|---|---|---|---|
| E1 | T104 activates T103 graders by marker deletion only | PR #11 body | **MATCHES.** 6 of 7 files identical after marker-strip + Prettier. The 7th is Finding 1 (a later commit, not T104). |
| E2 | T104 deletes `tests/schemas/seam-contract.test.ts` | the file's own header: "**T104 deletes this whole file** … self-enforcing: leaving it behind turns `npm test` red" | **MATCHES.** Deleted in `4a24602`. Self-authorizing, and the authorization predates the deletion. |
| E3 | T203 deletes `tests/lib/fitment/seam-contract.test.ts` | `tasks.md` T203 ruling (c); PR #46 §Rulings | **MATCHES.** Deleted in `4f922fb`. |
| E4 | T203 replaces T202's two `it.skip` placeholders | `tasks.md` T203, "Extended at the T203 review (2026-08-30)" | **MATCHES, including the byte-level claim.** The record asserts "No assertion in any surviving T202 grader was edited: activation was marker-line deletion only (plus Prettier reflow) … demonstrated by normalized comparison against `main`". Reproduced independently: `boundary-years`, `combination-semantics`, `generation-expansion`, `validation`, `fitment-fixtures` all **CLEAN**; `resolution.test.ts` differs **only** in the two recorded blocks, each replaced by a comment naming the ruling and the file that now carries the graders (`drive.test.ts`, `absent-selection-facets.test.ts`). Both new files exist on `main`. |
| E5 | T204 adds a `taxonomy` third argument to every `tests/lib/community-filter.test.ts` call site; "No assertion, fixture value or expectation was edited"; two cases *added* | `tasks.md` T204 sub-bullet "Grader-edit exception (T204 review, F2)" | **MATCHES — and the disclosure was conservative.** The diff `11b1084..main` shows exactly the added argument at every call site, every `.toBe(n)` expectation unchanged, plus the two new `parentGeneration` cases (expands down, never up). Note the file is **not** `[TEST]`-authored — `11b1084` (T703a) carries `X-Agent-Role: implementer` — so the separation rule never applied. Disclosing anyway is the right instinct. |
| E6 | T2-202 tightens `isCorrelated` in `tests/garage/rules.ts` | `specs/002-montero-garage/tasks.md` (≈l.202); the T2-201 grader's own docstring: "**The fix is small and belongs to T2-202**" | **MATCHES.** `d166a36` subtracts the subquery's own tables' declared columns before the bare-name test, exactly as the docstring specified, and adds N13/N14 to `reviewer-probes.test.ts` pinning both previously-passing holes. The edit **closes** a security-grader hole; authorized in advance by the grader itself. |
| E7 | T2-202 deletes `tests/garage/seam-canary.test.ts` | the file's own header ("**T2-202 deletes this whole file** … self-enforcing"); 002 `tasks.md` ≈l.175 citing the T203 precedent | **MATCHES.** |
| E8 | "declaration graders activated by deleting `.fails` and nothing else … byte-identical to `main` modulo `.fails`" | 002 `tasks.md` ≈ll.169–170 | **MATCHES.** `deletion-cascade`, `rls-deny-by-default`, `schema-shape`, `sharing-default`, `storage-privacy` all **CLEAN** vs `66b5da9`. `auth-surface.test.ts` differs vs `66b5da9` but is **CLEAN** vs `b2c0fca` — the intervening ACC-01 ruling commit, which is `X-Agent-Role: test-writer`, i.e. a test-writer amending test-writer work. Correct. |
| E9 | T2-301 activates T2-301a's photo graders | 002 task line | **MATCHES.** `tests/garage/vehicle-photos.test.ts`, `reviewer-probes.test.ts`, `rules.ts`, `contract.ts`, `harness.ts` all **CLEAN** vs `4272e2c`. |
| E10 | `tests/check-citations.test.ts` decoupled from live content state via a `vi.hoisted` mock — "conductor-authorized T901 exception, FC mutation-verified" | commit body of `f3e30a4` | **MATCHES.** The edit replaces `KIND_TIER_LEGACY_EXCEPTIONS[0]` with a mocked fixture path, because the re-kind sweep emptied the register — a grader that would otherwise pass or fail on unrelated content edits. Strengthens. File is implementer-authored (T105 `e3215b4`), so outside the separation rule. *(Note: the mandate refers to this as "the T206-era `vi.hoisted` register fix"; the register in question is `KIND_TIER_LEGACY_EXCEPTIONS`, and the commit is `f3e30a4`, 2026-08-31, not T206-era.)* |
| E11 | T208 review rewrote two graders in `src/schemas/reference.test.ts` — the `it.each` VIN-field case that placed every field at position 1, and the mis-commented `CODE_MAX_LENGTH` case | `tasks.md` T208 "GRADER-EDIT DISCLOSURE" | **MATCHES.** Traced to `d12c4f8` on `feat/001-t208-decoder-schema`: `positions: { from: 1 }` → `A_REAL_POSITION[encodes]` (F1 — it was green *because* `encodes` and `positions` were unrelated), and the cap grader moved onto an `option-code` where the cap is reachable (F2). Both **strengthen**. File is implementer-authored (`aadc38e`), no test-writer pass to override. |
| E12 | T207 and T208 `[PLATFORM]` halves shipped with **no paired `[TEST]` task**; an Opus review with a mutant battery substituted for the test-writer pass | `tasks.md` T207 "F4 — conductor-authorized deviation, flagged for T901's audit"; repeated on T208 | **CONFIRMED as described.** `src/schemas/reference.test.ts` has no `test-writer` commit in its history (`aadc38e` → `09fc036`, both implementer). This is a real, deliberate, disclosed weakening of the TDD separation for two tasks. See *Standing risks* §4. |

**Unrecorded grader edits found:** exactly one — Finding 1.

**Also checked, clean:**

- No implementation commit touched a `[TEST]` file outside the register above.
- Zero live `it.fails` / `it.skip` / `.todo` markers remain in `tests/` or
  `src/` (only in explanatory docstrings) — no grader is inert.
- Fitment interpretation lives only in `src/lib/fitment/`. The one historical
  offender, `src/lib/community-filter.ts`, now delegates:
  `!expandGenerations(card.gens, taxonomy).includes(state.gen)`. No component
  does its own generation math.
- No service key or secret outside CI config; `service_role` appears in
  `src/lib/supabase/config.ts` only inside `isSecretKey`, a guard that
  *rejects* such a key. No `.env` tracked except `.env.example`.
- No schema or taxonomy change smuggled into an unrelated task in the range
  audited.

---

## 2. Locale gate — red on one locale, today, at both layers

Probe: one `reference` entry carrying `prose.en` and no `prose.es`, added to
the scratch worktree, both gate layers run, then deleted.

**Layer 1 — schema (SCF-04, I18N-06).** `npx astro check` and `npx astro build`:

```
[InvalidContentEntryDataError] reference → t901probe-onelocale data does not match collection schema.
  prose.es**: **prose.es: Required
  Location:
    …/src/content/reference/t901probe-onelocale.json:0:0
ASTRO_BUILD_EXIT=1
```

Names the file **and** the field. SCF-04 satisfied literally.

**Layer 2 — `npm run check:locales`:**

```
CHECK_LOCALES_EXIT=1
  • src/content/reference/t901probe-onelocale.json: missing `prose.es` (I18N-06 — both or neither)
```

The failure **names the missing locale**, not merely "throws".

**Positive control, same run.** The identical entry with `prose.es` added:

```
CHECK_LOCALES_EXIT=0
check:locales — OK: 336 entries checked, every one carries both locales and a file-consistent id.
ASTRO_BUILD_EXIT=0
```

This is the control that matters: the gate discriminates rather than rejecting
everything, and it is walking **336 real entries**, not an empty fixtures
directory. A locale-completeness check that passes vacuously is the failure mode
this mandate names, and it is excluded here.

**Bonus gate proven incidentally.** The first iteration of the probe left
`data.id` = `_t901probe-onelocale` while the file path derived
`t901probe-onelocale`; T105's id-consistency check (added at T104 review)
fired unprompted and named both ids.

**Schema-level absoluteness.** `git grep` confirms no `.partial()`,
`.optional()` or default on the `prose` object in `src/schemas/entry.ts`; the
T103 grader "has no exceptions field that lets one locale ship alone (I18N-06)"
is live and passing.

---

## 3. Routing policy

**Artifact — intact.** `.claude/routing/routing-policy.json` has been touched by
exactly one commit in the repository's history: `5ad7c82`, the phase-0
foundation commit authored by the owner (Christopher Ennis). It has never been
modified by an agent.

```
$ git log origin/main --oneline -- .claude/routing/routing-policy.json
5ad7c82 chore(harness): bilingual platform foundation — constitution, specs, conductor harness

$ node scripts/validate-routing.mjs
routing validation passed: 7 roles, 3 models, graders on opus, safety triggers intact
VALIDATE_ROUTING_EXIT=0
```

All eleven `hardOpusTriggers` present (`safety-critical-system`,
`torque-or-fluid-spec`, `service-interval`, `part-number`, `fitment-taxonomy`,
`content-schema`, `i18n-routing-or-locale-schema`,
`translation-of-safety-content`, `legal-or-regulatory`, `phase-closing-review`,
`secrets-or-deploy`); all seven `haikuForbidden` entries present;
`code-reviewer`, `fact-checker`, `bilingual-editor` all default to `opus`. CI
runs `validate-routing.mjs` (`.github/workflows/ci.yml:67`), so drift is
merge-blocking.

**Provenance — see Finding 2.** The policy is intact and the reviewer half of it
is corroborated by the review trail. The authoring half is unverifiable.

---

## 4. Gate health sweep — every merge-blocking check, one red run each

`npm run verify` on `origin/main` in a clean `npm ci` worktree: **green**
(`astro check` → `eslint` → `prettier --check` → `vitest` 1893 passed
→ `check:locales` → `check:citations` → `check:glossary` → `check:es-register`
→ `astro build` → `check:hreflang` OK). That is the baseline every probe below
deviates from.

| # | Gate | Red fixture | Exit | Evidence the gate fired *for the right reason* |
|---|---|---|---|---|
| A | schema layer (SCF-04) | entry missing `prose.es` | 1 | `prose.es: Required`, names the file |
| B | `check:locales` (I18N-06) | same | 1 | ``missing `prose.es` (I18N-06 — both or neither)`` |
| C | `check:citations` — REF-02 uncited numeric | `capacity.value: 90`, `sources: []` | 1 | ``field `capacity.value` is a numeric spec (90) but this entry cites no sources (REF-02 …)`` |
| D | `check:citations` — tier-implies-sources | `community-consensus`, `sources: []` | 1 | ``claims confidence `community-consensus`, which is stronger than `first-hand`, but cites no sources (AGENTS.md "Facts" …)`` |
| E | `check:citations` — kind→tier coherence | `fsm-confirmed` cited only to `kind: "forum"` | 1 | ``claims confidence `fsm-confirmed`, which means factory-documented …, but its sources are `forum` — none of `fsm`, `tsb`, `manufacturer``` |
| F | `check:glossary` (GLO-02) | ES prose using `parachoques`, `balatas` | 1 | both named, each with its canonical CR term and the glossary entry id |
| G | `check:es-register` (I18N-07) | ES prose using `tenés`, `revisá` | 1 | both named — ``(tú/vos-conjugated verb) — ES prose is `usted` register only`` |
| H | fitment build validation (FIT-02) | `fitment.engines: ["t901-not-an-engine"]` | 1 | ``[unknown-id] t901probe-onelocale at fitment.engines.0`` — thrown from `assertFitmentsResolve` in the `astro:build:start` hook |
| I | `check:hreflang` (I18N-04) | an EN-only page template | 1 | ``dist/en/t901probe/index.html: no hreflang links (I18N-04 requires one per locale plus x-default)`` |
| J | data/prose split guard (AGENTS.md "numbers are never translated") | `defineEntrySchema({}, { title: z.string(), torqueNm: z.number() })` | throws at **define** time | ``numbers are never translated: the prose field `torqueNm` declares a numeric type …`` — and the nested form (`specs: z.object({ torqueNm })`) throws too, so the depth evasion is closed |
| K | hard-coded UI string lint (I18N-08) | `<p>Check the brake fluid level before driving.</p>` in a component | 1 | ``Hard-coded user-facing text … Move it to src/i18n/ui.ts and render it through t(locale) so it exists in both locales (I18N-08)`` |

Eleven red runs, every one produced today against `main`. **No merge-blocking
check failed to produce its red run.** Every fixture deleted; worktree
`git status --porcelain` empty after each probe.

Not probed, with reason: `check:links` (owner ruling 2026-08-30 moved it off the
merge path to a weekly schedule — it is not a merge-blocking gate and probing it
means network round-trips to a throttled archive.org); `test:a11y` and
`test:lighthouse` (CI-only per SCF-03, outside `verify`'s list, and Lighthouse
needs a headless Chrome budget run this audit did not take —
**unverified**).

---

## 5. Standing risks — honesty assessment

The mandate asks whether each recorded risk is **honestly** recorded, not
whether it is fixed.

### 5.1 Synonym-drift invisibility — **honestly recorded, mitigation verified applied**

Recorded on the T206 line ("list singular AND plural for every alias — the
conformance scan does no stemming") and in `check:glossary`'s own docstring
("no morphological expansion — `balata` does not imply `balatas`").

Verified live. `check:glossary` is purely alias-driven with no stemming, exactly
as advertised. But the mitigation *held*: probing singular forms of aliases
across four entries picked for likely drift, all were caught —

```
• uses "cofre"   → canonical "capó"    (glossary/all-body-capo)
• uses "semieje" → canonical "palier"  (glossary/all-drivetrain-palier)
• uses "mofle"   → canonical "mufla"   (glossary/all-exhaust-mufla)
```

154 glossary files, 173 scannable ES aliases; the sampled entries all carry both
numbers (`cofre`/`cofres`, `semieje`/`semiejes`, `mofle`/`mofles`,
`winche`/`winches`). `goma` correctly does **not** fire — it is
`falseFriend: true` (CR: hangover), which is the documented behaviour.

**Residual, correctly characterised by the record:** a regional variant nobody
thought to declare is invisible to the gate. That is inherent to an alias-driven
scan and is stated as such. Honest.

### 5.2 Offline-tier gaps — **honestly recorded, and verifiably conservative**

The T207 and T208 lines enumerate what was deliberately not shipped. Spot-checked
against the corpus and the enumeration is accurate, in the direction that
matters (the record does not claim coverage it lacks):

- "no `serviceInterval` anywhere" — confirmed, zero occurrences corpus-wide.
- "no brake caliper / oil-pan drain-plug / hub-nut torques" — confirmed; the
  four `torque` entries are power-steering pressure hose, front-diff mount
  insulator bolt, wheel nut, spare-wheel carrier. Note that **`wheel nut` is a
  safety-critical fastener** and is present and cited; the *absent* ones are
  absent because the FSM prints them as illustration callouts the OCR cannot
  attribute — a refusal to guess, which is AGENTS.md's rule working.
- reference corpus by kind: `fsm-section` 22, `dimension` 17, `vin-code` 31,
  `vin-position` 17, `option-code` 16, `fluid` 13, `torque` 4, `capacity` 3.
  Consistent with the record's "59 reference entries + 64 decoder rows".

Honest, and unusually well-specified — the gaps are written as instructions to
the next agent rather than as apologies.

### 5.3 Single-capture exposure — **honestly recorded, and the claim is exact**

The T207 line records: the `…20180128021206/…18my_pajero_gexp_specifications.pdf`
capture has exactly one CDX entry and its `id_` fetch now 404s; it is left in
rewritten form deliberately; and "four `fsm-confirmed` entries depended solely on
these two flagged captures — `combos-gen4-global` on the 18MY PDF alone, and
`gl`/`global`/`me` on both".

Verified against the corpus, and it is precisely right:

```
combos-gen4-global  fsm-confirmed  1 source  → 18MY PDF only            ← sole-source
gl                  fsm-confirmed  2 sources → 18MY PDF + 20160412120158id_
global              fsm-confirmed  2 sources → 18MY PDF + 20160412120158id_
me                  fsm-confirmed  2 sources → 18MY PDF + 20160412120158id_
```

Exactly four entries; exactly the two captures named; the 5door_gls repin to the
verified `…20160412120158id_` alternate did land, as claimed. The 18MY PDF is
still in the rewritten (non-`id_`) form, as the record says it deliberately is.
Sixteen files cite the PDF in total, but the record's claim was about *sole*
dependence, and that claim is exact — not rounded in its own favour.

**One thing the record does not say, offered as context rather than as a
correction:** corpus-wide, **100** entries at a documentary tier
(`fsm-confirmed` / `tsb`) carry exactly one source. That is not a defect — a
factory manual is one document, and the kind→tier rule (probe E) makes sure it
is the right *kind* of document. But it means the archive-substitution incident
T207 discovered has a wide blast radius, and follow-up (a) on the T207 line
(record a content hash alongside each citation) is the control that would bound
it. Worth prioritising ahead of T902's sample-verification pass, since a hash
would make that pass mechanical.

### 5.4 New standing risk — the two `[TEST]`-less halves (T207, T208)

Recorded as F4 and flagged for this audit; confirmed at §1/E12. Both
`src/schemas/reference.ts` (the `reference` collection, five kinds) and its T208
extension (three decoder kinds) shipped with **no independent grader author** —
`src/schemas/reference.test.ts` has only implementer commits. A mutant battery
run by the reviewer is a real control, but it is the *same lineage* checking its
own work, which is the thing the separation rule exists to prevent.

This is now the largest schema surface in the repo without an independent test
pass, and Phase 5 (`T501` parts, `T502` procedures) depends on it. Recommend an
explicit `[TEST]` back-fill task before T501 rather than after.

### 5.5 New standing risk — 66 security graders are skipped by default and are not run in CI

`npm test` reports `1893 passed | 66 skipped`. Every skip is the 002 live tier,
gated on `GARAGE_LIVE`:

```
↓ tests/garage/rls-deny-by-default.test.ts … [skipped: GARAGE_LIVE is unset — Tier B needs a local Supabase stack]
```

`grep -rn "GARAGE_LIVE\|test:garage" .github/` returns **nothing** — the live
RLS tier runs on no CI path. AGENTS.md *Boundaries*: "every user table ships
with row-level security proven by graders before content flows." The graders
exist and are good; they are simply not executed by the merge gate, so the
proof is a manual step someone has to remember. This is 002 scope, outside this
audit's mandate, and is recorded here only because the sweep surfaced it and
T902 should not have to rediscover it.

---

## What was run to earn this report

```
git worktree add <scratch> origin/main --detach ; npm ci
npm run verify                                   # baseline green @ 516d281
node scripts/validate-routing.mjs                # passed
npx vitest run                                   # 63 files, 1893 passed, 66 skipped
normdiff.sh <TEST-commit> <file>                 # 29 grader files, marker-strip + prettier
npx astro check / npx astro build                # probes A, H
npm run check:locales                            # probe B + positive control
npm run check:citations                          # probes C, D, E
npm run check:glossary                           # probes F, 5.1
npm run check:es-register                        # probe G
npm run check:hreflang                            # probe I
npx eslint src/components/T901Probe.astro        # probe K
npx vitest run tests/t901*.test.ts               # probe J (define-time guard)
gh pr view {5,11,23,24,46} ; gh pr list --state merged --limit 70
```

Every scratch fixture (`src/content/reference/t901probe-onelocale.json`,
`t901risk.json`, `t901risk2.json`, `src/pages/en/t901probe.astro`,
`src/components/T901Probe.astro`, `tests/t901*.test.ts`) was deleted;
`git status --porcelain` empty before this file was written. Nothing was run
against, and nothing was written to, the main checkout.

**Unverified claims in this report:** the 18MY PDF capture's current
unreachability is taken from the T207 record and was not re-probed over the
network (§5.3); `test:a11y` and `test:lighthouse` red runs were not produced
(§4).
