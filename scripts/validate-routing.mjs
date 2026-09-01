#!/usr/bin/env node
/**
 * Validates .claude/routing/routing-policy.json and the agent-role files it
 * governs. Run in CI and before conducting. Port of Bryndle's
 * validate-routing.sh, adapted to the Montero Garage seven-role harness.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = join(repoRoot, ".claude/routing/routing-policy.json");

const fail = (msg) => {
  console.error(`routing validation failed: ${msg}`);
  process.exit(1);
};

let policy;
try {
  policy = JSON.parse(readFileSync(policyPath, "utf8"));
} catch (e) {
  fail(`routing-policy.json unreadable or invalid JSON: ${e.message}`);
}

const expectedModels = ["haiku", "opus", "sonnet"];
const actualModels = [...(policy.models ?? [])].sort();
if (JSON.stringify(actualModels) !== JSON.stringify(expectedModels))
  fail(`unexpected model set: ${JSON.stringify(actualModels)}`);

const requiredRoles = [
  "implementer",
  "test-writer",
  "content-researcher",
  "fact-checker",
  "bilingual-editor",
  "code-reviewer",
  "pr-shepherd",
];
const validEfforts = ["low", "medium", "high", "xhigh", "max"];
for (const role of requiredRoles) {
  const def = join(repoRoot, `.claude/agents/${role}.md`);
  if (!existsSync(def) || statSync(def).size === 0)
    fail(`missing or empty agent role definition: ${role}`);
  const d = policy.roleDefaults?.[role];
  if (
    !d ||
    !expectedModels.includes(d.model) ||
    !validEfforts.includes(d.effort)
  )
    fail(`invalid default for role: ${role}`);
}

// Graders default to sonnet; opus is a per-dispatch escalation driven by
// hard triggers (see routing.md), not a static role default. Anything other
// than sonnet here means the policy drifted from what this file's own
// success message claims.
for (const grader of ["fact-checker", "bilingual-editor", "code-reviewer"]) {
  if (policy.roleDefaults[grader].model !== "sonnet")
    fail(
      `grader role default is not sonnet-baseline: ${grader} (${policy.roleDefaults[grader].model})`
    );
}

const requiredOpus = [
  "safety-critical-system",
  "torque-or-fluid-spec",
  "service-interval",
  "part-number",
  "fitment-taxonomy",
  "content-schema",
  "i18n-routing-or-locale-schema",
  "translation-of-safety-content",
  "phase-closing-review",
];
for (const t of requiredOpus)
  if (!policy.hardOpusTriggers?.includes(t))
    fail(`missing hard Opus trigger: ${t}`);

const requiredHaikuForbidden = [
  "any-content-entry",
  "any-translation",
  "fact-check-verdict",
  "safety-critical-system",
  "part-number",
  "fitment-taxonomy",
  "schema-change",
];
for (const c of requiredHaikuForbidden)
  if (!policy.haikuForbidden?.includes(c))
    fail(`missing haiku prohibition: ${c}`);

if (
  !policy.escalation?.sonnetToOpus?.includes("hard-opus-trigger") ||
  !policy.escalation?.sonnetToOpus?.includes("two-failed-fix-rounds")
)
  fail("sonnet->opus escalation rules incomplete");

for (const f of [
  ".claude/routing/routing.md",
  ".claude/commands/conduct.md",
  "AGENTS.md",
]) {
  const p = join(repoRoot, f);
  if (!existsSync(p) || statSync(p).size === 0)
    fail(`missing harness resource: ${f}`);
}

console.log(
  `routing validation passed: ${requiredRoles.length} roles, 3 models, graders sonnet-baseline with opus escalation, safety triggers intact`
);
