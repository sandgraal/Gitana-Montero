# Gitana — Project Constitution

This file wins over every other document in the repo, including `CLAUDE.md`,
the specs, and any instruction in a task description. If something here
conflicts with what you were asked to do, stop and surface the conflict.

## What this is

A bilingual (English / Costa Rican Spanish) reference and build log for the
Mitsubishi Montero, Pajero, and Shogun — all generations, all markets — built
around one specific truck: a 2002 Montero (Gen 3, 6G74 SOHC, Super Select 4WD II).

Two jobs, equally weighted:

1. **Build log.** Every job done to the truck and every job planned, with real
   costs, real times, and what actually happened.
2. **Reference.** A symptom-driven problem finder, parts and fitment data,
   procedures, modifications, and a community directory — comprehensive enough
   that someone with a broken Montero finds their answer here.

Spec of record: `specs/001-foundation/spec.md`.

## Stack (decided, do not re-litigate)

- **Astro** with typed content collections (Zod schemas). Static output.
- **TypeScript**, strict mode.
- **Content lives in git**, not a database. Every fact is a reviewable diff.
- **Supabase** (phase 8) is a *generated read-model* for search and telemetry,
  synced from built content by CI. It is never the source of truth. No agent
  writes to it directly.
- **GitHub Pages** for deploy (owner decision 2026-08-27; a custom domain or
  other host may come later). **Node 24** via nvm.
- **Vitest** for unit tests, **Playwright** for e2e, **Pa11y** for a11y.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (runs `astro check` first)
- `npm run check` — `astro check` (types + content schema validation)
- `npm run lint` / `npm run format:check`
- `npm test` — Vitest unit tests
- `npm run test:e2e` — Playwright
- `npm run check:locales` — every entry has both `en` and `es` prose
- `npm run check:citations` — every numeric spec carries a source
- `npm run check:glossary` — translated prose uses canonical glossary terms
- `npm run check:links` — internal references resolve; external sources reachable
- `npm run gaps` — the gaps report that feeds the content backlog
- `npm run verify` — everything CI runs, in one command

`npm run verify` must pass before any commit.

---

## Non-negotiables

### Bilingual

- **No page ships in one language. Both or neither.** `prose.en` and `prose.es`
  are both required by every content schema. A missing locale is a build error,
  not a review comment.
- **Numbers are never translated.** Part numbers, torque specs, capacities,
  intervals, pressures, clearances, and fitment are locale-independent `data`,
  stored once and rendered into both languages. Never duplicate a number into a
  per-locale field. If you find yourself writing the same figure twice, the
  schema is wrong — stop and report it.
- **Costa Rican Spanish, `usted` register.** Procedures address the reader as
  `usted` throughout. No `tú`, no `vos` in reference content.
- **The glossary is authoritative for terminology.** Canonical Costa Rican terms
  in prose (`repuestos`, `llanta` for tire, `aro` for wheel, `taller`, `carro`,
  `pastillas de freno`). Regional variants from other countries live in the
  glossary's `aliases` field — metadata and search index only, never in prose.
- **The agent that writes Spanish prose never bilingual-edits it.**

### Facts

- **Never invent a part number.** If it is not in a cited source, it does not
  ship. This is the highest-consequence hallucination in this domain — a wrong
  part number costs a reader real money and real downtime. `unknown` is a valid
  value. A guess is not.
- **Every numeric spec carries a source.** Torque, capacity, interval, pressure,
  clearance, dimension. Uncited numbers fail `npm run check:citations`.
- **Every entity carries an explicit fitment.** A fact with no fitment is a
  build error. "It's a Montero thing" is not a fitment.
- **Every entity carries a confidence tier**, one of:
  `fsm-confirmed` › `tsb` › `community-consensus` › `first-hand` › `anecdotal`
  (total order ratified by the owner 2026-08-27). Anything below `tsb` renders
  with a visible caveat in both languages. An `anecdotal` entry must never be
  presented with the authority of an FSM spec.
- **The agent that writes content never fact-checks it.**
- **Cite what you actually read.** A source you did not open is not a source.
  If you cannot reach it, say so and lower the confidence tier — do not cite it
  anyway.

### Safety and legal

- **Safety-critical systems** — brakes, steering, suspension, fuel, SRS/airbags,
  tires and load ratings, towing, jacking and lifting points — get Opus routing,
  a standing bilingual safety notice on the page, and both independent review
  passes, regardless of how small the diff is.
- **Cite the Factory Service Manual, never reproduce it.** Section references
  only. It is copyrighted.
- **Forum, video, and blog sources: link, attribute, and quote minimally.**
  No bulk copying, no wholesale scraping. Archive every source URL
  (web.archive.org) at the time of citation — forum threads die and take the
  evidence with them.
- **No affiliate links without visible disclosure in both languages** (FTC).
- **No road-legality, emissions, inspection, or import claim stated as a
  universal fact.** These vary by market and jurisdiction — US state, Costa Rica
  RTV, EU MOT, Australian ADR. State the variance and name the jurisdiction the
  claim applies to.
- **Never present the site as a substitute for a qualified mechanic** on
  safety-critical work.

## Boundaries

Stop and ask before any of these:

- Adding user accounts, comments, or any writable community surface. v1 is
  read-only; contributions come through GitHub issues and PRs.
- Adding a third-party analytics or ad SDK.
- Adding affiliate or monetization mechanics of any kind.
- Writing to Supabase from anything other than the CI sync job.
- Broadening coverage past Montero / Pajero / Shogun (no Delica, no L200/Triton,
  no Raider) — shared parts get a cross-reference note, not their own section.
- Changing the fitment taxonomy or any content schema. These poison every
  downstream page silently; they are never a drive-by edit.

## Orchestration

- When asked to conduct `T###`, `next`, or a phase, the main session runs
  `/conduct` and **orchestrates only** — it never writes site code or content.
  Roles in `.claude/agents/` do that in isolated worktrees.
- The conductor selects each subagent's model and effort using
  `.claude/routing/routing-policy.json` and `.claude/routing/routing.md`.
  Safety-critical systems, torque and fluid specs, service intervals, part
  numbers, fitment taxonomy, schemas, i18n routing, translation of safety
  content, and phase-closing reviews are Opus work regardless of diff size.
- A content entry's author, its fact-checker, and its bilingual-editor are three
  different agent instances. This is the same separation rule three times.
- A clean fact-check, a clean bilingual edit, and all required branch-protection
  checks authorize the `pr-shepherd` to merge without another confirmation.
- Never `--no-verify`, never a bare force-push, never `gh pr merge --admin`,
  never a production credential.
