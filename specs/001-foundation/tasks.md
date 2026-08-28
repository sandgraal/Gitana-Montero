# Tasks 001 — Gitana Foundation

Task breakdown for `spec.md`, ordered per `plan.md`. Every task cites the
acceptance criteria it satisfies. `[TEST]` tasks author failing graders
**before** their paired `[PLATFORM]` task, by a separate agent instance
(AGENTS.md separation rule). `[CONTENT]` tasks ship both locales in one PR and
get concurrent fact-check + bilingual-edit passes. `[DESIGN]` tasks are run by
the conductor with the owner in the main session (Claude Design Artifact — not
a worktree subagent); deliverables merge via a normal PR. Commit messages
reference this spec: `type(scope): …, refs specs/001-foundation`.

The eligible frontier = every unchecked task whose predecessors (same section,
or explicitly named) are checked. `/conduct next` dispatches the whole frontier.

## Phase 1 — Platform scaffold & i18n

### Scaffold
- [x] **T101 [PLATFORM]** Init Astro project: TS strict, static output, content collections config, `npm run dev/build/check/lint/format:check/test` scripts, Vitest, Prettier, ESLint, `.nvmrc` 24. *(SCF-01)*
- [ ] **T102 [PLATFORM]** i18n routing: `/en/` + `/es/` prefixes, root redirect on `Accept-Language` with `/en/` fallback, sticky locale switcher, hreflang pairs + `x-default` on every page, typed UI-strings module with lint gate on hard-coded strings. Depends: T101. *(I18N-01, I18N-02, I18N-03, I18N-04, I18N-08)*
- [x] **T103 [TEST]** Graders for the entry-schema contract: `prose.en`+`prose.es` both required (a one-locale fixture must fail), shared-data/prose split (no numeric spec fields inside prose schemas), slug-registry uniqueness per locale. Expected-failure markers. Depends: T101. *(I18N-05, I18N-06, SCF-04)*
- [ ] **T104 [PLATFORM]** Base entry schemas in `src/content.config.ts`: shared `data` + locale-keyed `prose` (both required), `fitment` placeholder type, `confidence` enum, `sources` array with archiveUrl. Per-locale slug registry. Activates T103 graders. Depends: T103 merged. *(I18N-05, I18N-06, SCF-01, SCF-04)*
- [ ] **T105 [PLATFORM]** Check scripts: `check:locales`, `check:citations`, `check:glossary` (stub until glossary exists), `check:links`, ES `usted`-register lint, `npm run verify` aggregator. Depends: T104. *(SCF-02, I18N-07, REF-02)*
- [ ] **T106 [PLATFORM]** CI workflow: verify + link check + a11y + Lighthouse budgets, merge-blocking; GitHub Pages deploy config (Pages deploy on merge to `main`, built-site artifact upload on PRs); **prove the gate**: a deliberate one-locale entry on a scratch branch must fail CI (attach the red run to the PR); bilingual issue templates + PR template. Depends: T105. *(SCF-03, SCF-05, SCF-06, SCF-07)*

## Phase 2 — Taxonomy, fitment, glossary, reference

### Taxonomy & fitment
- [ ] **T201 [CONTENT]** Vehicle taxonomy data: all generations w/ chassis codes + years, markets, engines, transmissions, transfer cases, trims, valid combinations per gen/market/year. Sourced (FSM indexes, factory literature). Depends: T106. *(VEH-01, VEH-02, VEH-03)*
- [ ] **T202 [TEST]** Fitment engine graders: resolution against taxonomy, nonexistent-ID and impossible-combination failures, deterministic entry↔vehicle matching, boundary-year tables (1999 Gen 2.5/Gen 3 overlap). Depends: T201. *(FIT-01, FIT-02, FIT-04)*
- [ ] **T203 [PLATFORM]** Fitment engine in `src/lib/fitment/`: query type, resolver, build-time validation of every entry's fitment. Activates T202 graders. Depends: T202 merged. *(FIT-01, FIT-02, FIT-04)*
- [ ] **T204 [PLATFORM]** Vehicle selector UI: gen/market/year/engine picker, persists across pages and locales, filters collection listings. Depends: T203. *(FIT-03)*

### Glossary & reference
- [ ] **T205 [PLATFORM]** Glossary schema + `check:glossary` real implementation (canonical-term conformance scan of ES prose) + public glossary page w/ system filter. Depends: T106. *(GLO-01, GLO-02, GLO-04)*
- [ ] **T206 [CONTENT]** Glossary seed: ~150 core terms (systems, major components, tools, fluids) with CR-canonical ES, regional aliases, bilingual definitions. Depends: T205. *(GLO-01, GLO-03)*
- [ ] **T207 [CONTENT]** Reference data: FSM section index (citations only), fluid chart, torque master table, capacities/dimensions — fitment-scoped, every value cited. Depends: T203. *(REF-01, REF-02)*
- [ ] **T208 [CONTENT]** VIN/option-code decoder data. Depends: T203. *(REF-01)*

### Design
- [ ] **T209 [DESIGN]** Claude Design canvas for core page templates: problem page
  (safety-notice + confidence-caveat rendering, EN and ES artboards), vehicle
  selector states, garage timeline, glossary page, site chrome w/ locale switcher
  (mobile + desktop). Owner refines in the Artifact; exports land in
  `specs/001-foundation/design/` with a `HANDOFF-DESIGN.md` (palette, type scale,
  spacing, component notes). Input package assembled at dispatch: T104 schema field
  lists incl. confidence enum + sources block; T102 UI-strings module (both locales,
  real ES strings for length testing); spec excerpts PRB-03, PRB-04, FIT-03, GAR-01,
  GAR-02; two bilingual content fixtures written for this task (one problem entry
  with safety notice + low-confidence caveat, one garage entry); constraints
  (mobile-first viewports, T106 Lighthouse budget, owner brand preferences or a
  note that the canvas proposes them). Depends: T102, T104. Runs parallel to
  T201–T203; must complete before T204, T205 (page), T301, T401, T402 dispatch —
  their dispatch prompts must reference HANDOFF-DESIGN.md. *(PRB-03, PRB-04,
  FIT-03, GAR-01, I18N-03, I18N-08)*

## Phase 3 — Garage / build log
- [ ] **T301 [PLATFORM]** Garage schema + entry page + timeline view. Depends: T203. *(GAR-01)*
- [ ] **T302 [PLATFORM]** Derived current-state sheet + planned-work queue (computed, never hand-maintained). Depends: T301. *(GAR-02, GAR-03)*
- [ ] **T303 [CONTENT]** Backfill the truck's history: owner interview → dated entries w/ parts, costs, times, odometer, photos, bilingual prose. Missing parts/procedures land in gaps report. Depends: T301. *(GAR-01, GAR-05)*
- [ ] **T304 [PLATFORM]** Garage↔problem cross-linking: first-hand evidence surfaced on problem pages. Depends: T301, T401. *(GAR-04)*

## Phase 4 — Problem finder
- [ ] **T401 [PLATFORM]** Problems schema (symptoms, diagnostic steps, causes, fix paths, severity, drivability triage, confidence) + page template w/ safety-notice and confidence-caveat rendering. Depends: T203. *(PRB-01, PRB-03, PRB-04, PRB-05)*
- [ ] **T402 [PLATFORM]** Symptom-first navigation: bilingual symptom index + search, vehicle-filtered. Depends: T401, T204. *(PRB-02)*
- [ ] **T403 [CONTENT]** Gen 3 problem set, wave 1 (~20 highest-traffic: tcase chain stretch, GDI woes where fitted, rear diff, sway-bar links, HVAC mode door, tick-of-death oil feed, …) — sourced, tiered, bilingual. Depends: T401. *(PRB-01…PRB-06)*
- [ ] **T404 [CONTENT]** Gen 2 problem set, wave 1 (~20). Depends: T401. *(PRB-01…PRB-06)*
- [ ] **T405 [CONTENT]** Gen 1 + Gen 4 problem sets, wave 1 (~10 each; Gen 4 high-level per §9). Depends: T401. *(PRB-01…PRB-06)*

## Phase 5 — Parts & procedures
- [ ] **T501 [PLATFORM]** Parts schema (supersession chains, conflict-on-duplicate-OEM-number build failure) + page template. Depends: T203. *(PRT-01, PRT-02, PRT-03)*
- [ ] **T502 [PLATFORM]** Procedures schema (torque/fluid by reference ID only — inlined numbers fail check:citations) + page template w/ safety-critical flag. Depends: T203, T207. *(PRC-01, PRC-02, PRC-03)*
- [ ] **T503 [CONTENT]** Parts wave 1: every part referenced by T303/T403/T404 garage+problem entries. Depends: T501, gaps report. *(PRT-01, PRT-02)*
- [ ] **T504 [CONTENT]** Procedures wave 1: maintenance set (oil, filters, timing belt 6G74, diffs/tcase fluid, brakes, plugs) — bilingual, cited, safety-flagged where due. Depends: T502. *(PRC-01, PRC-02, PRC-03)*

## Phase 6 — Modifications
- [ ] **T601 [PLATFORM]** Mods schema (typed requires/breaks references) + page template. Depends: T203. *(MOD-01, MOD-02)*
- [ ] **T602 [CONTENT]** Mods wave 1: lifts, 33s and regear math, armor, storage, dual battery, lockers — honest tradeoffs, bilingual. Depends: T601. *(MOD-01, MOD-02)*

## Phase 7 — Community, search, gaps
- [ ] **T701 [CONTENT]** Community directory: EN + ES communities first-class (forums, subreddits, FB groups, Discords, YouTube, vendors, shops) tagged by region/language/gen/activity. Depends: T106. *(COM-01, COM-02)*
- [ ] **T702 [PLATFORM]** Client-side search per locale incl. glossary aliases + part numbers. Depends: T206, T403. *(SRCH-01, SRCH-02)*
- [ ] **T703 [PLATFORM]** `npm run gaps` full implementation per GAP-01, wired into CI as a non-blocking report artifact. Depends: T401, T501, T502. *(GAP-01, PRB-06)*

## Phase 8 — Supabase read-model
- [ ] **T801 [TEST]** Sync graders: idempotency, one-directionality, per-language tsvector search behavior. Depends: T703. *(RM-01, RM-02)*
- [ ] **T802 [PLATFORM]** CI sync job git→Supabase (typed tables, en/es dictionaries), service key only in CI secrets. Activates T801 graders. Depends: T801 merged. *(RM-01, RM-02)*
- [ ] **T803 [PLATFORM]** Server-side search endpoint + site integration behind client-side fallback. Depends: T802. *(SRCH-01)*

## Phase-closing reviews
- [ ] **T901 [TEST]** Phase 1–2 closing review: separation held (graders unedited by implementers), locale gate provably red on one-locale input, routing policy intact. Opus, fresh instance. *(SCF-02…04, I18N-06)*
- [ ] **T902 [TEST]** Content-integrity audit after Phase 5: sample-verify citations against sources, glossary conformance sweep, confidence-tier honesty check. Opus, fresh instance. *(REF-02, GLO-02, PRB-04)*
