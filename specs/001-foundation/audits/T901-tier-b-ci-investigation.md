# Can GitHub Actions run the Tier-B RLS graders? — investigation

**Date:** 2026-09-01
**Branch:** `fix/001-ci-docker-investigation`
**Workflow under test:** `.github/workflows/ci-tier-b-investigation.yml`
**Answers:** `specs/001-foundation/audits/T901-phase-1-2-audit.md` §5.5
**Refs:** specs/001-foundation; specs/002-montero-garage (ACC-01, ACC-03, SHR-01, MIG-03)

> **STATUS — Stage 1 shipped, 2026-09-01** (branch `fix/001-ci-tier-b-promote`).
> This document was written on an investigation branch that is deliberately not
> merged; it is carried onto `main` with this note because `ci.yml`'s `tier-b`
> job cites it as its justification, and a header that points at a file `main`
> does not have is exactly the documentation debt §"Documentation debt this
> creates" below complains about.
>
> What shipped, against the recommendation below:
>
> - **Stage 1 — done.** `ci.yml` gained a fourth job, `tier-b` /
>   "Tier-B RLS graders (live stack)", on the workflow's existing
>   `pull_request` + `push: main` triggers. Advisory: it is **not** in `main`'s
>   required contexts and nothing in `ci.yml` can put it there.
> - The investigation workflow needed no deletion commit — its push trigger
>   named only `fix/001-ci-docker-investigation`, so the file never reached
>   `main`. Deleting the remote investigation branch is an owner housekeeping
>   step, not a code change.
> - The promotion added one thing this document did not specify: a
>   **"Soak telemetry"** step that counts `public.ecr.aws` throttle/retry lines
>   and prints them to the job summary, so Stage 2's "count the red runs that
>   were registry flakes" is a number on the run page rather than a log dig.
> - The two false sentences named under *Documentation debt* were corrected in
>   the same commit (`CLAUDE.md`, `tests/garage/harness.ts`), along with the
>   T901 ledger item in `specs/001-foundation/tasks.md` and §5.5 of the
>   phase-1/2 audit.
> - **Stage 2 remains open and is the owner's call**: after ~15–20 PRs, add
>   "Tier-B RLS graders (live stack)" to `main`'s required contexts in repo
>   settings → branches. No agent should make that change.

---

## The question, and why it was worth asking

Two places in this repo state, as fact, that CI cannot run the live tier of the
user-data graders:

- `CLAUDE.md`: "Tier B (hits a real local stack) needs `supabase start` and
  Docker. **CI has no Docker**, so Tier A carries the merge gate."
- `tests/garage/harness.ts`: "Requires: Docker + the Supabase CLI. **CI has
  neither today.**"

The T901 phase-1/2 audit (§5.5) recorded the consequence as a standing risk:
`grep -rn "GARAGE_LIVE\|test:garage" .github/` returned nothing, so 66 security
graders — the deny-by-default matrix, the private-object matrix, the ACC-03
deletion cascade, the SHR-01 default — ran on no CI path at all. AGENTS.md's
*Boundaries* promises "every user table ships with row-level security **proven
by graders**"; the graders exist and are good, but the proof was a manual step
someone had to remember.

Neither statement had ever been tested. Both are wrong.

---

## Verdict

**It works, first try, in about two minutes.** A GitHub-hosted `ubuntu-latest`
runner brings up the full local Supabase stack and runs all 66 live graders
green, with room to spare on every resource that could plausibly have been the
constraint.

Three runs — the original push, a re-run of the same commit, and the push of
this very document — all green:

| phase | run 1 | run 2 | run 3 |
| --- | ---: | ---: | ---: |
| Supabase CLI install (pinned v2.116.0, checksum-verified) | 5 s | 3 s | 3 s |
| `supabase start` — image pulls + boot + first migration run | **73 s** | **66 s** | **71 s** |
| `supabase db reset` — the five migrations, re-applied | 24 s | 24 s | 24 s |
| `npm run test:garage` — 66 live graders, fail-closed | **11 s** | **11 s** | **11 s** |
| **whole job, checkout to verdict** | **2 m 12 s** | **2 m 05 s** | **2 m 05 s** |

- runs 1 and 2: <https://github.com/sandgraal/monterogarage/actions/runs/33592026337>
  (attempts 1 and 2, both `success`)
- run 3: <https://github.com/sandgraal/monterogarage/actions/runs/33592579450>
  (`success`)

The commit that added this table itself triggered a fourth run. Its result
lives in `gh run list --branch fix/001-ci-docker-investigation` and is
deliberately not folded back in — a document that must be amended by every run
it causes is an infinite regress, and three green runs is already more than the
one this investigation was commissioned to produce.

### The graders actually ran — this is not a green skip

The number that settles it:

```
locally, no stack:   Tests  489 passed | 9 expected fail | 66 skipped (564)
on ubuntu-latest:    Tests  555 passed | 9 expected fail            (564)
```

489 + 66 = 555, and the skip count is **zero**. Every grader that has been dark
since T2-201 landed ran against a real Postgres, a real GoTrue, and real
Storage, and passed — including the ones whose whole point is that they cannot
be faked: `POSITIVE CONTROL: the owner reads their own receipt back`,
`owner B cannot sign for owner A's object`, `anon selects zero rows from
records even when rows exist`.

`npm run test:garage` already carries `GARAGE_LIVE=1 GARAGE_LIVE_REQUIRED=1`
(package.json), so a stack that failed to come up would have been a hard error,
not a quiet skip. `harness.ts` predicted this exactly: "The day CI grows a
Postgres service, one environment variable turns every Tier B proof into a
merge gate — no test file changes." No test file was changed.

---

## What the runner actually has

Observed, not quoted from a manifest:

```
image:    ubuntu24 / 20260823.283.1
kernel:   Linux 6.17.0-1022-azure x86_64
cpus:     4
docker:   Server 28.0.4          (docker info exit: 0)
compose:  v2.38.2
memory:   15989 MB total, 15070 MB available
disk:     145G total, 87G available on /
```

Docker Engine and Compose are both present and usable on the stock image, with
no `services:` block, no privileged container, and no setup step beyond
installing the Supabase CLI. Memory and disk are not close to a constraint:
the stack's eight containers boot inside 16 GB with ~13 GB free at probe time,
and the images cost a few GB against 87 GB available.

All five migrations applied in **under 100 ms combined**:

```
Applying migration 20260830120000_garage_schema.sql...
Applying migration 20260830120100_receipts_storage.sql...
Applying migration 20260830120200_account_lifecycle.sql...
Applying migration 20260830120300_no_password_auth.sql...
Applying migration 20260831120000_vehicle_photos_storage.sql...
WARN: no files matched pattern: supabase/seed.sql
```

The seed warning is benign and pre-existing: `config.toml` declares
`[db.seed] sql_paths = ["./seed.sql"]` and no such file is committed. It is a
`WARN`, the CLI continues, and the graders create their own fixtures. Worth
tidying eventually; not a blocker and explicitly not changed here.

`supabase start` needed exactly one piece of environment setup, which
`config.toml` already documents: `[auth.external.google]` is enabled with
`env(...)` substitutions, and the CLI refuses to start when an enabled
provider's id/secret is empty. The workflow supplies literal placeholder
strings. That is not a secret and does not need to be one — Google is never
contacted by the graders, and `assertLocalTarget()` structurally forbids the
harness from addressing anything but loopback. **No hosted project, no service
key, and no production credential is involved in this job.**

---

## The one real risk found: public registry rate limiting

The Supabase CLI pulls its images from **`public.ecr.aws`**, not Docker Hub —
and AWS ECR Public rate-limits anonymous pulls per source IP. GitHub's
Azure-hosted runners share IP space, so this fires:

```
Error response from daemon: toomanyrequests: Rate exceeded
Retrying after 4s: public.ecr.aws/supabase/kong:2.8.1
...
Retrying after 8s: public.ecr.aws/supabase/studio:2026.08.17-sha-0c1da8f
```

It happened **9 times in run 1, 3 times in run 2, and 11 times in run 3**, and
the CLI's own exponential backoff recovered from every single one. All three
runs went green, and the throttling cost nothing measurable: the spread across
`supabase start` was 66–73 s regardless of whether it was throttled 3 times or
11.

This is the honest caveat on any promotion decision: the job's slowest phase
depends on an unauthenticated third-party registry that is visibly throttling
us, and the CLI's retry budget is finite. It did not fail in this
investigation, but n=3 is not a flake rate. Nothing in the repo can remove the
dependency — there is no credential-free authenticated mirror — so the
mitigation is measurement, not engineering.

Considered and rejected: caching the images with `docker save` + `actions/cache`.
The image set is ~1.5 GB; restoring that from the Actions cache is not
obviously faster than the 66–73 s pull it would replace, and it adds a cache
key that has to be bumped in lockstep with the CLI version — a new way to go
subtly stale in exchange for no measured win. Revisit only if the pull becomes
the flake source it currently is not.

---

## Cost, in the only unit that matters: does it slow the merge gate?

Current `ci.yml` on a recent green `main` run (33584202786), three jobs in
parallel:

| job | duration |
| --- | ---: |
| Harness validation | 10 s |
| Verify (check · lint · test · locales · citations · glossary · build) | 1 m 06 s |
| **Links + a11y** | **5 m 28 s** ← critical path |

A Tier-B job at **2 m 05 s** running as a fourth parallel job adds **zero
seconds** to the merge gate's wall clock. It finishes three and a half minutes
before the job that already sets the pace.

Even the pessimistic shape — folding Tier B *inside* the existing "Verify" job
to avoid a branch-protection change — takes Verify from 1 m 06 s to roughly
3 m 00 s, still comfortably under the `Links + a11y` critical path, and still
zero net cost. So "it is too slow for the merge gate" is not available as an
argument in either shape.

---

## Recommendation: promote — as its own job, in two stages

**Stage 1 (do this next, it is nearly free).** Add a fourth job to `ci.yml`,
`runs-on: ubuntu-latest`, named something like
**"Tier-B RLS graders (live stack)"**, triggered by the workflow's existing
`pull_request` + `push: main` triggers, containing the CLI install /
`supabase start` / `npm run test:garage` steps proven here. **Do not add it to
branch protection yet.** It reports on every PR, it is visible and red when
broken, and it blocks nothing. Delete this investigation workflow in the same
commit — its whole purpose is discharged by this document.

**Stage 2 (after a soak).** Once it has reported on ~15–20 PRs, count the
red runs that were registry flakes rather than real grader failures. If that
count is zero or near it, the owner adds "Tier-B RLS graders (live stack)" to
`main`'s required contexts in repo settings → branches, and AGENTS.md's "proven
by graders" becomes literally true on the merge path. If the ECR throttle turns
out to flake it, leave it non-required and *also* schedule it weekly on
`link-check.yml`'s pattern (cron + `workflow_dispatch`, opening one tracking
issue on failure) so the proof still runs on a clock rather than on memory.

### Why a separate job rather than folding it into "Verify"

`ci.yml`'s header makes the real argument for folding — a new job is not in
`main`'s required contexts, so it is advisory until someone changes settings,
and a required context that never reports *hangs* PRs forever. That reasoning
is why the Lighthouse budgets live inside "Links + a11y". It does not carry
here, for three reasons:

1. **The staging is the point.** Stage 1 *wants* to be advisory. Folding Tier B
   into "Verify" makes it merge-blocking on day one, with an unmeasured
   external-registry dependency and a flake rate of exactly unknown. That is
   the trade this investigation was set up to avoid taking blind.
2. **Failure attribution.** A red "Verify" currently means the code is wrong. A
   red "Verify" that might instead mean ECR throttled a container pull is a
   worse signal for every contributor, on every PR, forever.
3. **Isolation.** Tier B is the only thing in this repo that wants Docker, a
   third-party CLI, and eight containers. Keeping that blast radius in its own
   job means a Supabase CLI bump can never take the type-check and the build
   down with it.

The sequencing hazard the header warns about is handled by ordering: the job
lands on `main` and reports for weeks *before* anyone marks it required, so it
can never be a required context that has never reported.

### What must NOT change in the promotion

- **`GARAGE_LIVE_REQUIRED=1` stays.** It is what makes "the stack did not come
  up" red instead of green-with-66-skips. Run `npm run test:garage`, not a
  hand-rolled vitest invocation that could drop it.
- **The CLI version stays pinned** (`2.116.0` here) with its checksum verified.
  An investigation whose result is a number is worthless if nobody can tell
  which version produced it, and a merge gate that silently follows `latest` is
  a merge gate that breaks on someone else's release schedule.
- **The Google placeholder values stay literal and in the open.** They are not
  secrets, and putting them in repository secrets would imply they were.
- **Nothing in the job may address a non-loopback host.** `assertLocalTarget()`
  already enforces this and is itself graded (`harness-contract.test.ts`); the
  workflow must never introduce a `SUPABASE_URL` that would test that guard for
  real.

### Documentation debt this creates

Both of the sentences quoted at the top of this file are now false and should
be corrected by whoever does the promotion — `CLAUDE.md`'s "CI has no Docker,
so Tier A carries the merge gate", and the `harness.ts` architecture comment's
"Requires: Docker + the Supabase CLI. **CI has neither today.**" (its adjacent
"The day CI grows a Postgres service…" sentence becomes a description of what
happened rather than a hope). They are not touched here because this branch is
an investigation and deliberately changes no behaviour.

---

## Reproducing this

```bash
git checkout fix/001-ci-docker-investigation
git push                      # the workflow's push trigger names this branch only
gh run list --branch fix/001-ci-docker-investigation
gh run view <id> --log        # timings are also in the job summary
```

The workflow has no `pull_request` trigger and no `push: main` trigger, so it
cannot report a status check on a pull request and therefore cannot be selected
as a required context by accident. `ci.yml` was not modified and does not
depend on it. Branch protection was not touched.
