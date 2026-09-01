# Model and reasoning selection

Select the model before every subagent dispatch. The subagent does not choose
or downgrade its own model. Task risk overrides role defaults. The maintained,
machine-checkable defaults and hard triggers live in
[`routing-policy.json`](routing-policy.json); this document explains how to
apply them when a task requires judgment.

## Defaults

| Role                 | Default model | Default effort |
| -------------------- | ------------- | -------------- |
| `implementer`        | `sonnet`      | `high`         |
| `test-writer`        | `sonnet`      | `high`         |
| `content-researcher` | `sonnet`      | `high`         |
| `fact-checker`       | `sonnet`      | `high`         |
| `bilingual-editor`   | `sonnet`      | `high`         |
| `code-reviewer`      | `sonnet`      | `high`         |
| `pr-shepherd`        | `haiku`       | `medium`       |

Use `opus` with `high` effort for the **authoring** role too when any hard
trigger applies:

- safety-critical systems: brakes, steering, suspension, fuel, SRS/airbags,
  tires and load ratings, towing, jacking and lifting points;
- torque or fluid specs, service intervals, part numbers — a wrong number
  destroys an engine or costs a reader real money;
- the fitment taxonomy or any content schema — errors silently poison every
  downstream page;
- i18n routing or locale schemas — a locale bug breaks every page at once;
- translation of safety content — "loosen" rendered as "apriete" is a safety
  defect, not a style issue;
- legal/regulatory claims (emissions, RTV, MOT, import rules);
- phase-closing reviews; anything touching secrets or deploy.

Do not downgrade a hard trigger because the diff looks small. A one-line
torque-spec edit is Opus work.

The graders (`fact-checker`, `bilingual-editor`, `code-reviewer`) classify
the branch under review against the same trigger list — they do not inherit
the author's tier. A grader reviewing a hard-trigger branch (safety-critical
content, torque/fluid specs, schemas, i18n routing, translation of safety
content, legal/regulatory claims, or any phase-closing review) is itself
`opus`/`high` work. A grader reviewing a routine, no-hard-trigger branch (a
glossary-only content pass, a UI-only platform diff) stays `sonnet`/`high`.

Increase to `xhigh` only for broad or ambiguous audits (T902-style content
integrity sweeps), difficult incident diagnosis, or a failed high-effort
attempt.

Use `haiku` only when all of these are true:

- the assignment is narrow and mechanically specified;
- it touches no non-negotiable, no fact, no translation;
- correctness is directly checkable with deterministic commands or a diff.

Good haiku work: link checking, CI-state collection, checkbox corrections,
formatting-only passes, routine PR administration. Haiku never authors or
edits a content entry, never renders a fact-check or bilingual verdict, and
never touches a part number, schema, or safety-critical page. Promote haiku
to sonnet on ambiguity or any non-mechanical failure. Promote sonnet to opus
on a hard trigger or after two failed reasoning/fix rounds.

## Dispatch contract

Record one concise routing decision before launch, for example:

```text
T104 -> implementer        -> opus/high   (content-schema: base entry schemas)
T206 -> content-researcher -> sonnet/high (glossary seed, no safety content)
T206 -> fact-checker       -> sonnet/high (glossary seed, no safety content)
T207 -> content-researcher -> opus/high   (torque master table: hard trigger)
T207 -> fact-checker       -> opus/high   (torque master table: hard trigger)
T403 -> content-researcher -> opus/high   (part numbers + safety-critical systems)
T128 -> pr-shepherd        -> haiku/medium (PR administration only)
```

Treat these as operational defaults, then tune from observed escalation
rate, review findings, latency, and cost.
