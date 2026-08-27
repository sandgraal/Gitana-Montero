# CLAUDE.md

Read `AGENTS.md` first — it is the constitution and wins over everything,
including this file. Then, for the current work: `specs/001-foundation/spec.md`
(requirements), `specs/001-foundation/plan.md` (build order and separation
rules), and `specs/001-foundation/tasks.md` (task list — the source of truth
for progress).

## What this repo is

Bilingual (EN / Costa Rican ES) Mitsubishi Montero/Pajero/Shogun reference +
build log for one 2002 Montero named Gitana. Astro static site, content as
Zod-typed collections in git, Supabase as a derived read-model (phase 8 only).
Agents write all site code and content; the main session conducts.

## Commands

- `npm run verify` — everything CI runs; must pass before any commit
- `npm run dev` / `npm run build` / `npm run check`
- `npm test` / `npm run test:e2e` / `npm run lint`
- `npm run check:locales` / `check:citations` / `check:glossary` / `check:links`
- `npm run gaps` — generates the content backlog report

Until Phase 1 lands (T101), `package.json` does not exist yet — the harness
validation is `node scripts/validate-routing.mjs` and `bash -n .claude/hooks/*.sh`.

## Environment — this machine is unusual

- **No system Node.** Source nvm in every shell before npm/node:
  `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24 >/dev/null &&`
  Never put `nvm use` behind a pipe — the subshell discards the PATH change.
- **This volume (`/Volumes/Samsung T9`) has silently dropped writes before.**
  After every push: `git ls-remote origin <branch>` to confirm it landed, and
  `git show --stat HEAD` to confirm the commit is what you think it is.
- Worktrees do not inherit gitignored files. Copy `.env.local` (once it exists)
  from the main checkout — `git worktree list` shows its path.

## Bilingual rules (the short version — AGENTS.md has the full text)

- Every entry has `prose.en` AND `prose.es`. Missing either = build error.
- Numbers (specs, part numbers, capacities, fitment) are shared `data`,
  stored once, never per-locale.
- Costa Rican Spanish, `usted` register. Glossary terms are canonical;
  regional variants go in glossary `aliases` only.
- URLs: `/en/…` and `/es/…`, equal footing, per-locale slugs, hreflang pairs
  + `x-default` on every page.

## Workflow

- Branch from `main` as `feat/001-t###-short-slug` (lowercase id, 2–4 word slug).
- Commit messages: `type(scope): …, refs specs/001-foundation`.
- Open every PR as a **draft the moment the branch is pushed** so CI runs
  during review; mark ready when review clears.
- Branch protection requires the CI checks and conversation resolution. A PR
  at `BLOCKED` until threads resolve is expected, not a failure. Reply on each
  thread and resolve it after pushing a fix — never resolve silently.
- Check the task's box in `specs/001-foundation/tasks.md` in the final commit
  of the branch that completes it.

## Operating mode: conductor (owner's standing instruction, 2026-08-27)

- The main session **orchestrates, it does not implement**. Start work with
  `/conduct T###` (or `next` / `phase N`). Site code is written by
  `implementer`, graders by `test-writer`, content by `content-researcher` —
  each in its own worktree (`isolation: "worktree"`, background).
- Every content branch gets **two independent passes run concurrently**:
  `fact-checker` (claims vs. cited sources) and `bilingual-editor` (ES register,
  glossary conformance, no number diverging between locales). Every code branch
  gets `code-reviewer`. `pr-shepherd` opens the PR, resolves every thread,
  rebases on conflicts, and **merges autonomously** once required checks are
  green and threads are resolved. No "shall I merge?".
- The main session's only source edits are harness/docs/memory (`.claude/`,
  `specs/*/tasks.md` checkbox fixes, handoffs). Everything else goes to an
  agent — including review-comment fixes (`SendMessage` to the agent with the
  context).
- Model routing per `.claude/routing/routing-policy.json`; record
  `T### -> role -> model/effort (reason)` before each dispatch.
- Parallelism: dispatch every independent eligible task at once. **Parallel is
  the default and serial needs a stated reason** — name the task and the file
  or interface it would collide with. `next` names where to start, not how
  many to run. Recompute the eligible frontier after every merge and refill in
  the same turn. The main session never blocks on one agent.
- Stop-and-ask only for: reviewer/author deadlock after two rounds, a suspected
  grader defect, spec ambiguity, an AGENTS.md boundary, infra failure after one
  rerun. Keep other tasks moving while asking.
- Blockers are surfaced in chat **and** as a `⛔ Blocked:` PR comment.

## Harness

- `/conduct` is the default entry point.
- Agents: `.claude/agents/{implementer,test-writer,content-researcher,fact-checker,bilingual-editor,code-reviewer,pr-shepherd}.md`
- Routing: `.claude/routing/routing-policy.json` (machine-checkable; validated
  in CI by `scripts/validate-routing.mjs`) + `routing.md` (judgment guidance).
- Hooks: `guard-dangerous-git.sh` blocks `--no-verify`, bare force-push, pushes
  to main, `gh pr merge --admin`; `pre-commit-verify.sh` gates commits on
  `npm run verify` in whichever worktree is committing (skips gracefully before
  Phase 1 lands).
- Per-user setting overrides go in `.claude/settings.local.json` (gitignored).
