# Grading principles

Reference for `test-writer` and `code-reviewer` dispatches. These are hard-won,
not theoretical — each one names the incident that taught it, so a future
reader can judge whether the lesson still applies rather than following it by
rote. Read this once; it should not need re-explaining in every dispatch
prompt.

## Grade the end state, not the text

A migration directory, a set of GRANT/REVOKE statements, a sequence of
`create or replace` calls — these are not a snapshot, they're a sequence.
"Does this file contain `revoke ... from anon`" tells you nothing about
whether `anon` can reach the table *after every statement in every file has
run*. Parse the whole sequence, replay it in order, and assert on the
resulting state.

*Incident:* `tests/garage/rls-deny-by-default.test.ts` originally counted
`revoke ... from anon` occurrences and scored a match as a pass. A migration
that revoked all, then granted select, back to `anon` — the exact shape of a
real vulnerability — scored 1 and passed. Fixed by a proper end-state replay
parser (T2-401a).

## Mutation-test the probe corpus itself

Writing a grader is not the same as writing a grader that can fail. After
writing a rule, break the thing it's supposed to catch on purpose (comment it
out, invert a comparison, loosen a regex) and confirm the suite goes red for
the right reason. If it stays green, the grader was decorative. Do this for
every new rule, not just the obviously risky ones — several "obviously
fine" rules this project shipped turned out to have exactly one untested
branch that never fired.

*Incident:* T2-401a's `expiryCheckIssues`/`revocationCheckIssues` were
correct for "column absent" but had never been tested against "column
present but never compared" — the realistic shape of the actual defect
class they exist to catch. Found only because the reviewer mutated the rule
and watched the suite stay green.

## A test that cannot fail is worse than none

A locale-completeness test that passes on an empty fixtures directory also
"passes" when the loader is broken. Every negative assertion needs a
positive control in the same run — the valid case accepted, the invalid case
rejected, and rejected *for the stated reason* (assert the error names the
missing locale, not just "it threw").

## Grade behavior, not name lists

A rule that recognizes a violation by matching a literal token (`select *`)
rather than the property that token represents (whole-row projection) is a
rule with a bypass built in — `to_jsonb(r)`, `row_to_json(r)`, and five other
spellings do the exact same thing and none contain the literal. When a rule
exists to prevent a category of mistake, enumerate the category, not one
spelling of it — and expect to find you missed a spelling; mutation-test each
clause of the rule separately, not just the rule as a whole.

*Incident:* T2-401a's original `projectionIssues` caught literal `*` and
missed `to_jsonb`, `row_to_json`, `jsonb_agg`, and bare-alias selects — all
serialize every column, none contain a `*`.

## Every finding needs a positive control

If a rule can report a violation, it must also be shown reporting "clean" on
a genuinely correct case in the same test file. A rule with no positive
control can drift over-strict for months before anyone notices it's been
flagging correct code — which is how a real security rule gets deleted out
of frustration instead of fixed.

## Unknown is not zero, and a failure is not an empty result

When a fetch, a query, or any operation that can fail returns nothing
*because it failed*, that must be a structurally different value from a
genuine empty or zero result — never coalesce a failure to `0`, `[]`, `{}`,
or an empty `Map`. A reader shown a confident zero cannot tell "we checked
and there is nothing" from "we could not check," and on a site whose entire
premise is that a user's own records are trustworthy testimony, that
distinction is not cosmetic.

The concrete pattern that has worked: type the result as `T | null`
(`ReadonlyMap<K, V> | null`, never `ReadonlyMap<K, V>` defaulting to empty),
and give "still loading" a third state distinct from both — `"loading" |
"loaded" | "failed"`, not a boolean.

*Incident, same mistake, three separate times in 002:* PR #68 (a failed
receipts request rendered every record as "no receipts attached"); T2-303's
derived current-state sheet (a failed vehicle switch could render a
different vehicle's real odometer reading as this vehicle's computed
current state — not a missing figure, a *wrong* one); T2-303's F8 (a slow,
stale failure response for vehicle A could overwrite vehicle B's
already-successfully-loaded data). All three are the identical bug wearing
a different shape. Assume it will recur a fourth time in any new
async-loaded surface unless this pattern is followed from the start.

## Identity comparisons in security-relevant SQL must include namespace

Comparing a function or table by `name` alone, when the underlying system
resolves identity by `schema.name`, is a bypass: `public.reader` and
`private.reader` are different objects with the same match. Any allow-list,
deny-list, or "is this the function I think it is" check written against SQL
text must carry the schema, not just the bare identifier — and the safe
failure direction is *over-matching* (a spurious finding costs a reviewer
five minutes; a missed one is a live hole).

*Incident:* T2-401a's `anonFunctionAllowListIssues` and `requireShareReaders`
both compared `routine.name` only; an anon-executable `private.<reader-name>`
(right name, wrong schema) would have silently passed. Found by a bot
reviewer on the PR, not by the mutation battery — worth remembering that an
adversarial second pass can catch what a thorough first pass didn't.

## Reproduce before fixing

When a review finds a defect, reproduce it — actually observe the broken
behavior — before applying the fix, and reproduce the *fixed* behavior
after, rather than reasoning from the diff that it must now be correct. This
sounds obvious and is skipped constantly under time pressure; every review
this project ran that did it caught something a diff-only read would have
missed (an off-by-one in which direction was actually broken, a fix that
narrowed the bug instead of closing it, a fix that introduced the mirror-image
defect).

## A "known-pages" sweep is only as complete as its list

An invariant enforced by enumerating the pages/components it applies to (not
by scanning everything that exists) will silently stop covering a new page
that introduces the same defect shape. This is not a reason to avoid
list-based sweeps — sometimes there's no cheaper way to write one — but it
is a reason to say so explicitly in the grader's own header comment, so the
next person adding a page knows to add it to the list rather than assuming
the sweep already covers them.

*Example:* `tests/e2e/hidden-guard.spec.ts` (the `[hidden]`-vs-`display:flex`
class, closed by F10 after shipping unnoticed four separate times) enumerates
known pages. It is airtight for everything on that list and silent for
anything not on it.
