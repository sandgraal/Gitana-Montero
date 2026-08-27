# Plan 001 — Build strategy

Companion to `spec.md` (requirements) and `tasks.md` (task list). `AGENTS.md`
wins on conflict.

## Build order and why

1. **Phase 1 — scaffold + i18n first.** The bilingual requirement is
   structural: locale routing, the `data`/`prose` split, and the
   locale-completeness gate must exist before any content does, because
   retrofitting i18n onto a monolingual corpus is the single most expensive
   migration this project could face. Nothing in Phase 2+ starts until the
   deliberate one-locale test entry (T106) is proven to fail CI.
2. **Phase 2 — taxonomy and fitment are the spine.** Every later entry
   references vehicle IDs and declares a fitment. Getting this wrong silently
   poisons every downstream page, which is why taxonomy and fitment-engine
   tasks are hard-Opus regardless of size, and why the fitment engine gets
   graders written by a separate test-writer before implementation.
3. **Phase 3 — garage next, not the reference.** Earliest personal value for
   the owner, produces the first real bilingual content through the full
   researcher → fact-checker ∥ bilingual-editor pipeline, and generates
   `first-hand` evidence plus gaps-report entries that seed Phases 4–6.
4. **Phases 4–6 — problems, then parts/procedures, then mods.** Problem
   entries drive readers to parts and procedures; mods depend on both.
5. **Phase 7 — search + gaps automation** once there is a corpus to search.
6. **Phase 8 — Supabase read-model** last: it is derived infrastructure and
   worthless until the corpus justifies server-side search.

## The data/prose split (I18N-06, AGENTS.md "Numbers are never translated")

Every entry schema has the shape:

```ts
{ id, fitment, ...sharedData, confidence, sources, prose: { en: {...}, es: {...} } }
```

Shared data holds every locale-independent fact: part numbers, torque,
capacities, intervals, severity, difficulty, cost bands, references to other
entries. Prose holds only human-language text. Both prose locales are required
at the schema level — `z.object({ en: proseSchema, es: proseSchema })`, no
`.partial()`, no escape hatch. Components render shared data through
locale-aware formatters (units, number formatting) so a figure exists exactly
once in the repo.

## TDD and separation rules

- `[TEST]` tasks author graders **before** their paired `[PLATFORM]` task, in a
  separate branch/PR by a separate agent instance, using expected-failure
  markers (Vitest `it.fails`) that the implementer activates by deleting the
  marker line only. Direct port of the Bryndle convention.
- Content has the same separation, twice: author ≠ fact-checker ≠
  bilingual-editor, three agent instances. The fact-checker verifies claims
  against cited sources; the bilingual-editor verifies register, glossary
  conformance, and that no figure appears in prose that belongs in shared data.
  They run concurrently — neither blocks the other.
- The `[TEST]`/`[PLATFORM]` pair rule orders a *pair*, not the whole board:
  unrelated tasks run in parallel with either half.

## Task tags → routing

| Tag | Role | Reviewed by |
|---|---|---|
| `[PLATFORM]` | implementer | code-reviewer |
| `[TEST]` | test-writer | code-reviewer |
| `[CONTENT]` | content-researcher | fact-checker ∥ bilingual-editor |

Model/effort per `.claude/routing/routing-policy.json`. Hard-Opus triggers and
Haiku prohibitions are enforced by `scripts/validate-routing.mjs` in CI.

## Content conventions

- Entry IDs: `g{gen}-{system}-{slug}` (`g3-tcase-chain-stretch`) or
  `all-{system}-{slug}` for cross-generation entries.
- Branches: `feat/001-t###-short-slug`. Commits:
  `type(scope): …, refs specs/001-foundation`.
- Sources: every source gets `{ title, url, archiveUrl, accessed, kind }`;
  `kind` ∈ fsm | tsb | forum | video | vendor | first-hand. Archive at citation
  time (AGENTS.md).
- Confidence tiers ratchet upward only with new evidence; `anecdotal` entries
  older than 90 days surface in the gaps report (GAP-01) as promotion tasks.

## Handoffs

Task-specific notes live next to the spec as
`specs/001-foundation/HANDOFF-T###.md`, addressed to the agent that will run
the task. The conductor references them in the dispatch prompt; agents read
them before editing anything.
