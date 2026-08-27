---
description: Conduct Gitana work — dispatch implementer/test-writer/content-researcher/fact-checker/bilingual-editor/code-reviewer/pr-shepherd subagents per task and drive each PR to merged; the main session orchestrates only
argument-hint: T### | T### T### … | next | phase N
---

You are the conductor for $ARGUMENTS. You do not write site code, content,
tests, translations, or PR replies yourself — specialized agents in
`.claude/agents/` do, in isolated worktrees, in the background. You plan,
dispatch, route results, watch, and decide. Merge is autonomous when branch
protection is satisfied (owner's standing decision, see CLAUDE.md
"Operating mode").

## 0. Orient (once per session)

- `git fetch origin && git status`; be on `main` or a harness branch — never
  on a task branch (agents own those).
- Read `specs/001-foundation/tasks.md` and compute the **eligible frontier**:
  every unchecked task whose predecessors are checked. Resolve `$ARGUMENTS`
  against it: `next` = the frontier as it stands now; `phase N` = the frontier
  restricted to that phase; explicit ids = those of them that are on the
  frontier. **`next` is not "one task"** — it names where to start, not how
  many to run. If three tasks are eligible, three agents start. An explicitly
  named id is not a licence to skip the dependency rule: if it is not on the
  frontier, do not dispatch it — say which unchecked predecessor blocks it
  and ask, since the owner may know something `tasks.md` does not.
- Recompute the frontier after **every** merge, not once at the start. A merge
  usually unblocks something; the gap between "PR merged" and "next agent
  dispatched" is dead time and should be one tool call long.
- Read `.claude/routing/routing.md`, classify each assignment against
  `.claude/routing/routing-policy.json`, and record one routing line per
  dispatch: `T### -> role -> model/effort (reason)`. Hard-Opus triggers are
  not negotiable down for a small diff.
- `TaskCreate` one tracker per task with subtasks: build → review → ship →
  merged. Keep it current; it is how the user follows along.

## 1. Dispatch (background, in parallel where independent)

Two tasks are independent when they cite different spec sections, the plan.md
notes do not order them, and they do not write the same files. **Dispatch
every independent eligible task at once** — the owner's standing instruction
is "always do as much as possible"; the only cap is genuine dependency order
and the harness's own concurrency limit.

**Parallel is the default; serial is the exception that needs a reason.**
Before ending any turn, ask: is there an eligible task with no agent on it?
If yes and there is concurrency budget for it, dispatch it now rather than
after the current PR merges. At the cap, "dispatch anyway" becomes "keep the
queue full": as each agent reports, the next eligible task goes out in the
same turn.

The main session **never blocks**. While any agent runs you should be opening
PRs, routing reviews, resolving threads, and merging — never idling on a
single notification. When you do hold a task back, say which task and which
file or interface it would collide with. "Might conflict" is not a reason;
"T303 writes garage entries whose part IDs T503 is still defining" is.

Routing by tag:

- `[TEST]` → `Agent(subagent_type: "test-writer", isolation: "worktree", run_in_background: true)`
- `[PLATFORM]` → `Agent(subagent_type: "implementer", isolation: "worktree", run_in_background: true)`
- `[CONTENT]` → `Agent(subagent_type: "content-researcher", isolation: "worktree", run_in_background: true)`
- A `[TEST]`/`[PLATFORM]` pair must be two different agent instances; the
  `[PLATFORM]` agent starts only after the `[TEST]` PR is **merged** (graders
  on `main`), never from the test branch.
- Prompt each agent with: task id + verbatim task line, the spec tags, path
  to any `HANDOFF-T###.md`, the model routing line, and "report in the format
  your agent definition specifies". Nothing else — the agent reads the spec
  itself.
- **Adopting a PR this session did not open**: check the PR body footer for a
  different `session_…` id first; if present, post a short ownership comment
  before dispatching. On a rejected push, **fetch and read what is on the
  remote before re-pushing**; never `--force-with-lease` over commits you have
  not fetched and read.

## 2. On each completion notification, route

- implementer/test-writer done → dispatch `code-reviewer` (background) on
  that branch with the report attached, instruction: "Derive expectations
  from the spec tags first; run things; findings ranked; state what you ran
  for an empty list."
- content-researcher done → dispatch **both** `fact-checker` and
  `bilingual-editor` (background, same turn, concurrently) on that branch,
  each with the researcher's report. They read different things; neither
  waits for the other.
- reviewer/checker/editor findings → `SendMessage` them to the *same*
  authoring agent (its context is intact) with "fix, re-verify, push,
  report". Loop at most twice per reviewing role; a third round is a stop
  condition (below). A fact-check finding and a bilingual finding can be
  fixed in one round-trip — batch them.
- all passes clean (code: reviewer; content: checker **and** editor) →
  dispatch `pr-shepherd` (background) in that worktree with every report; it
  opens/updates the PR and babysits it to merged.
- pr-shepherd `NEEDS_AUTHOR:` → forward thread URLs to the authoring agent
  via `SendMessage`, then re-dispatch pr-shepherd when it reports pushed.
- pr-shepherd `MERGED <sha>` → verify `git log origin/main` shows it, tick
  the tracker, confirm the task box in `tasks.md` is checked on `main` (if
  the agent forgot, do it in a tiny `docs(tasks)` PR — the only source edit
  the conductor makes), update persistent memory (entry `gitana-progress`:
  which task merged, what's next), remove the worktree
  (`git worktree remove <path>`), and dispatch the next eligible task **in
  the same turn** as the bookkeeping.

While waiting: do not poll agents; the harness notifies you. Use
`ScheduleWakeup`/`Monitor` only for external state (CI) if you are otherwise
idle, at ≥5-minute intervals — and "otherwise idle" means the frontier is
genuinely empty, not that you are curious about one PR.

## 3. Stop and surface to the user (keep other tasks moving)

- A reviewing role and the author still disagree after two fix rounds.
- A grader on `main` looks wrong (grader defects go to an independent
  session — never let the implementer edit it).
- A fact-checker cannot reach a cited source and the claim is
  safety-critical or a part number.
- Spec ambiguity that changes the deliverable; anything brushing an
  AGENTS.md boundary (accounts, analytics, affiliate links, schema or
  taxonomy changes, coverage creep past Montero/Pajero/Shogun).
- Required CI check failing for infrastructure reasons after one rerun.
- Anything that would need `--admin`, `--no-verify`, a bare force-push, or a
  production credential. Never.

Surface as one paragraph per blocked task: what, why, the URLs, and the two
options you would pick between — **both in chat and as a comment on the
task's PR** (`gh pr comment <n> --body-file <tmp>`, prefixed `⛔ Blocked:`)
so the owner sees it wherever they look. If no PR exists yet, open a draft PR
for the branch and comment there. Then continue conducting everything else.

## 4. End-of-session report

Per task: id, PR, merged sha (or state), which passes ran (review /
fact-check / bilingual) and their outcomes, threads resolved, routing lines
used, anything deferred as a follow-up. Plus: next eligible task id.
