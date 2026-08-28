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
- [x] **T102 [PLATFORM]** i18n routing: `/en/` + `/es/` prefixes, root redirect on `Accept-Language` with `/en/` fallback, sticky locale switcher, hreflang pairs + `x-default` on every page, typed UI-strings module with lint gate on hard-coded strings. Depends: T101. *(I18N-01, I18N-02, I18N-03, I18N-04, I18N-08)*
- [x] **T103 [TEST]** Graders for the entry-schema contract: `prose.en`+`prose.es` both required (a one-locale fixture must fail), shared-data/prose split (no numeric spec fields inside prose schemas), slug-registry uniqueness per locale. Expected-failure markers. Depends: T101. *(I18N-05, I18N-06, SCF-04)*
- [x] **T104 [PLATFORM]** Base entry schemas: implement the T103 seam — pure-Zod building blocks in `src/schemas/entry.ts` + `src/schemas/slugs.ts` (stub signatures and grader-enforced contract are binding), registered via `defineCollection` in `src/content.config.ts` — shared `data` + locale-keyed `prose` (both required), `fitment` placeholder type, `confidence` enum (order per spec §2, ratified 2026-08-27), `sources` array with archiveUrl. Per-locale slug registry. Activates T103 graders; update/delete `src/scaffold.smoke.test.ts` (asserts empty collections). Depends: T103 merged. *(I18N-05, I18N-06, SCF-01, SCF-04)*
- [x] **T105 [PLATFORM]** Check scripts: `check:locales`, `check:citations`, `check:glossary` (stub until glossary exists), `check:links`, ES `usted`-register lint, `npm run verify` aggregator (extend the existing verify script, never replace it). Must also enforce `data.id` === file-derived Astro entry id for every entry (T104 review: the two ids can silently diverge). Depends: T104. *(SCF-02, I18N-07, REF-02)*
- [x] **T106 [PLATFORM]** CI workflow: verify + link check + a11y + Lighthouse budgets, merge-blocking; GitHub Pages deploy config (Pages deploy on merge to `main`, built-site artifact upload on PRs); **prove the gate**: a scratch branch with a one-locale entry, an uncited numeric spec, AND a tú/vos register slip must each fail CI (attach the red runs to the PR — T105 review: the committed tree has zero entries, so this is the checks' first end-to-end proof); bilingual issue templates + PR template. `check:links` merge-blocks only on both-`url`-and-`archiveUrl` unreachable (ruling 2026-08-27, per GAP-01). Depends: T105. *(SCF-03, SCF-05, SCF-06, SCF-07)*

## Phase 2 — Taxonomy, fitment, glossary, reference

### Taxonomy & fitment
- [x] **T200 [PLATFORM]** Vehicles taxonomy schema (owner-approved addition, 2026-08-28): extend the `vehicles` collection beyond the T104 base shape per VEH-01/VEH-02/VEH-03 — generations (chassis codes, production years), markets, engines, transmissions, transfer cases, trims, each with stable IDs; per-gen/market/year valid-combination data; one vehicle with market-specific naming, never duplicate entries. Schema + unit tests only — no taxonomy content (T201), no fitment resolution (T203). Numeric fields ship with proof check:citations fires on them uncited (T106 review rule). Depends: T106. *(VEH-01, VEH-02, VEH-03)*
- [ ] **T201 [CONTENT]** Vehicle taxonomy data: all generations w/ chassis codes + years, markets, engines, transmissions, transfer cases, trims, valid combinations per gen/market/year. Sourced (FSM indexes, factory literature). Schema notes (T200): every combination entry declares `coverage: "complete" | "partial"` honestly (complete = unlisted tuples are impossible; partial = unknown — never claim complete without sources that enumerate) and exact fitment `{gens: [generation], markets: [market]}`. Depends: T200. *(VEH-01, VEH-02, VEH-03)*
- [ ] **T202 [TEST]** Fitment engine graders: resolution against taxonomy, nonexistent-ID and impossible-combination failures, deterministic entry↔vehicle matching, boundary-year tables (1999 Gen 2.5/Gen 3 overlap). Depends: T201. *(FIT-01, FIT-02, FIT-04)*
- [ ] **T203 [PLATFORM]** Fitment engine in `src/lib/fitment/`: query type, resolver, build-time validation of every entry's fitment. Activates T202 graders. Open items this task must resolve (T200 review): `fitment.drive` appears in spec §2's fitment shape but VEH-01 defines no drive taxonomy — needs a ruling, not an invented vocabulary; absent `offerings[].trims` means "not recorded" (unknown), never "impossible" (T200's documented semantic); `gen2-5` declares `parentGeneration: "gen2"` — child-generation expansion happens here. Depends: T202 merged. *(FIT-01, FIT-02, FIT-04)*
- [ ] **T204 [PLATFORM]** Vehicle selector UI: gen/market/year/engine picker, persists across pages and locales, filters collection listings. Owns introducing Playwright + `npm run test:e2e` (T106 review: the constitution's e2e slot is unfilled; first browser-level UI task takes it, incl. a browser-level locale-switcher/selector persistence smoke). Also owns loading the HANDOFF-DESIGN webfonts (Archivo + IBM Plex Mono) site-wide — T205 review: they are named but unloaded, and Lighthouse perf 100 is partly because of that; the budget must be re-proved when they land. Depends: T203. *(FIT-03)*

### Glossary & reference
- [ ] **T205 [PLATFORM]** Glossary schema + `check:glossary` real implementation (canonical-term conformance scan of ES prose) + public glossary page w/ system filter. Note: the T104 base schema requires `fitment`+`confidence` on every collection, glossary included; if glossary terms need that relaxed, it is a negotiated schema change (AGENTS.md stop-and-ask), not a drive-by fix. Same applies to T701 community entries. Depends: T106. *(GLO-01, GLO-02, GLO-04)*
- [ ] **T206 [CONTENT]** Glossary seed: ~150 core terms (systems, major components, tools, fluids) with CR-canonical ES, regional aliases, bilingual definitions. Binding notes (T205 reviews): list singular AND plural for every alias (the conformance scan does no stemming); `rin`, `goma`, `balatas` must exist as aliases (the search placeholder names them), `goma` with `falseFriend: true` (CR: hangover, not tire); coolant/fluid entries must agree with the chrome terms `Refrigeración` and `Líquidos`; no caveat renders on term cards (owner ruling 2026-08-28). Depends: T205. *(GLO-01, GLO-03)*
- [ ] **T207 [CONTENT]** Reference data: FSM section index (citations only), fluid chart, torque master table, capacities/dimensions — fitment-scoped, every value cited. Note (T106 review): the schema change adding this collection's numeric fields is the FIRST live exercise of check:citations on real content (until then only scratch fixtures have reached it) — the paired schema work must demonstrate the check firing on its fields. Depends: T203. *(REF-01, REF-02)*
- [ ] **T208 [CONTENT]** VIN/option-code decoder data. Depends: T203. *(REF-01)*

### Design
- [x] **T209 [DESIGN]** Claude Design canvas for core page templates: problem page
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
- [ ] **T501 [PLATFORM]** Parts schema (supersession chains, conflict-on-duplicate-OEM-number build failure) + page template. Note (T106 review): numeric fields added here must come with proof that check:citations fires on them uncited (same rule as T207). Depends: T203. *(PRT-01, PRT-02, PRT-03)*
- [ ] **T502 [PLATFORM]** Procedures schema (torque/fluid by reference ID only — inlined numbers fail check:citations) + page template w/ safety-critical flag. Note (T105 review): check:citations is entry-level today (entry cites ≥1 source); PRC-03 needs per-value attribution — this task designs it. Depends: T203, T207. *(PRC-01, PRC-02, PRC-03)*
- [ ] **T503 [CONTENT]** Parts wave 1: every part referenced by T303/T403/T404 garage+problem entries. Depends: T501, gaps report. *(PRT-01, PRT-02)*
- [ ] **T504 [CONTENT]** Procedures wave 1: maintenance set (oil, filters, timing belt 6G74, diffs/tcase fluid, brakes, plugs) — bilingual, cited, safety-flagged where due. Depends: T502. *(PRC-01, PRC-02, PRC-03)*

## Phase 6 — Modifications
- [ ] **T601 [PLATFORM]** Mods schema (typed requires/breaks references) + page template. Depends: T203. *(MOD-01, MOD-02)*
- [ ] **T602 [CONTENT]** Mods wave 1: lifts, 33s and regear math, armor, storage, dual battery, lockers — honest tradeoffs, bilingual. Depends: T601. *(MOD-01, MOD-02)*

## Phase 7 — Community, search, gaps
- [x] **T700 [PLATFORM]** Community schema (owner-approved addition, 2026-08-28): extend the `community` collection per COM-01/COM-02 — community type (forum, subreddit, FB group, Discord, YouTube, vendor, shop), region/language/gen/activity tags, links. Attempt within the T104 base contract first; if community entries genuinely need the fitment/confidence requirement relaxed, that is the negotiated stop-and-ask recorded on T205 — report BLOCKED for the owner decision, never a drive-by change. Depends: T106. *(COM-01, COM-02)*
- [ ] **T701 [CONTENT]** Community directory: EN + ES communities first-class (forums, subreddits, FB/WhatsApp/Telegram groups, Discords, YouTube, vendors, shops — WhatsApp/Telegram first-class per owner ruling 2026-08-28) tagged by region/language/gen/activity. Depends: T700. *(COM-01, COM-02)*
- [ ] **T703a [PLATFORM]** Community directory page (owner-approved addition, 2026-08-28): public bilingual directory page per HANDOFF-DESIGN.md rendering T701's entries with region/language/gen/activity filtering; per-locale segments via the T205 routes pattern. Depends: T701. *(COM-01, COM-02)*
- [ ] **T702 [PLATFORM]** Client-side search per locale incl. glossary aliases + part numbers. Depends: T206, T403. *(SRCH-01, SRCH-02)*
- [ ] **T703 [PLATFORM]** `npm run gaps` full implementation per GAP-01, wired into CI as a non-blocking report artifact. Includes dead-original-with-live-archive source links (check:links warns, gaps reports — 2026-08-27 ruling) and the internal-reference resolution half of check:links, deferred from T105 (no cross-entry references existed pre-fitment; T203's resolver is the dependency). Depends: T401, T501, T502. *(GAP-01, PRB-06)*

## Phase 8 — Supabase read-model
- [ ] **T801 [TEST]** Sync graders: idempotency, one-directionality, per-language tsvector search behavior. Depends: T703. *(RM-01, RM-02)*
- [ ] **T802 [PLATFORM]** CI sync job git→Supabase (typed tables, en/es dictionaries), service key only in CI secrets. Activates T801 graders. Depends: T801 merged. *(RM-01, RM-02)*
- [ ] **T803 [PLATFORM]** Server-side search endpoint + site integration behind client-side fallback. Depends: T802. *(SRCH-01)*

## Phase-closing reviews
- [ ] **T901 [TEST]** Phase 1–2 closing review: separation held (graders unedited by implementers), locale gate provably red on one-locale input, routing policy intact. Opus, fresh instance. *(SCF-02…04, I18N-06)*
- [ ] **T902 [TEST]** Content-integrity audit after Phase 5: sample-verify citations against sources, glossary conformance sweep, confidence-tier honesty check. Opus, fresh instance. *(REF-02, GLO-02, PRB-04)*
