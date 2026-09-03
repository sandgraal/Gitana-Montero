/**
 * The mods graph (MOD-01, MOD-02) — everything about the `mods` collection
 * that one entry cannot see on its own.
 *
 * `src/schemas/mods.ts` owns the shape of a single entry and the
 * contradictions visible from inside it. This module owns the questions that
 * are only answerable with the whole corpus in hand:
 *
 * 1. **Does every typed reference resolve?** (MOD-02: "a typed reference that
 *    the build resolves".) A `requires` or `affects[].ref` naming no entry is
 *    a build failure — and so, separately, is one naming an entry that exists
 *    in the *other* collection, because that is the mistake the discriminator
 *    was added to catch and reporting it as "not found" would hide the fix.
 * 2. **Does the requirement graph terminate?** A cycle is a build failure: it
 *    is a set of mods none of which can be fitted first, and a page walking
 *    the prerequisites to draw them would walk it forever.
 * 3. **Is each entry id unique?** Two entries claiming one id make every
 *    pointer to it ambiguous, exactly as in `src/lib/parts/index.ts`.
 *
 * ## Why a lib and an integration, and not a `check:*` script
 *
 * The division `src/lib/fitment/` + `src/integrations/validate-fitments.ts`
 * settled for FIT-02 and `src/lib/parts/` repeated for PRT-03: the rules are
 * pure functions that deserve unit tests without a browser or a build, and the
 * *build* is where a broken corpus actually stops. The lib returns issues
 * rather than throwing, so one build reports every problem instead of the
 * first.
 *
 * ## What this module deliberately does *not* import
 *
 * `src/integrations/validate-mods.ts` reaches this module from inside an
 * `astro:build:start` hook, which Astro resolves through Node's own ESM
 * resolver rather than through Vite. So every specifier on this chain carries
 * its `.ts` extension, and the chain has to stay short: the vocabularies come
 * from the dependency-free `./references.ts` rather than from
 * `src/schemas/mods.ts`, and the safety widening lives in `./safety.ts`
 * because `src/lib/safety.ts` is not on that chain. Same constraint,
 * same shape, as `src/lib/parts/part-numbers.ts`.
 *
 * Nothing here interprets a fitment (FIT-01).
 *
 * refs specs/001-foundation (MOD-01, MOD-02, SCF-04)
 */
import {
  MOD_REFERENCE_COLLECTIONS,
  modReferenceKey,
  type ModReferenceCollection,
} from "./references.ts";

/* -------------------------------------------------------------------------
 * What this module reads
 * ---------------------------------------------------------------------- */

/** One typed reference, as the graph sees it. */
export interface ModReferenceIdentity {
  readonly collection: string;
  readonly id: string;
  /**
   * Where it sits in the entry, as a dotted field path (`requires[0]`,
   * `affects[2].ref`) — SCF-04 asks the build to name the field, and a
   * reference that has forgotten where it came from cannot.
   */
  readonly field: string;
}

/**
 * The slice of a mods entry the graph needs, read tolerantly from `unknown` by
 * {@link readMods}: shape is the schema's business, and a module that threw on
 * a malformed entry would replace the schema's precise, field-named error with
 * a stack trace.
 */
export interface ModIdentity {
  readonly id: string;
  /** Every typed reference the entry makes, `requires` then `affects[].ref`. */
  readonly references: readonly ModReferenceIdentity[];
  /** The `requires` subset that points at another **mod** — the cycle edges. */
  readonly requiredModIds: readonly string[];
}

/** The slice of any referenced entry the resolver needs: does this id exist? */
export interface ReferencableEntry {
  readonly collection: string;
  readonly id: string;
}

export const MOD_ISSUE_CODES = [
  "duplicate-entry-id",
  "dangling-reference",
  "reference-wrong-collection",
  "requirement-cycle",
] as const;

export type ModIssueCode = (typeof MOD_ISSUE_CODES)[number];

export interface ModIssue {
  readonly code: ModIssueCode;
  /** The entry the issue is reported against. */
  readonly entryId: string;
  /** Dotted field path within that entry (SCF-04). */
  readonly field: string;
  /**
   * Every *other* entry the issue is about — the rest of a cycle, the
   * collection that actually holds a misfiled id. The build caller turns these
   * into file paths, which is why the ids are structured rather than only
   * spelled into the message.
   */
  readonly relatedEntryIds: readonly string[];
  readonly message: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** One `{ collection, id }` pair, or `null` when either half is unreadable. */
function readReference(
  value: unknown,
  field: string
): ModReferenceIdentity | null {
  const record = asRecord(value);
  if (record === null) return null;

  const collection = asNonEmptyString(record["collection"]);
  const id = asNonEmptyString(record["id"]);
  if (collection === null || id === null) return null;

  return { collection, id, field };
}

/**
 * Every readable mods entry, in input order.
 *
 * An entry with no `id` is skipped rather than reported: the schema already
 * rejects it, by field, and a second complaint here would send an author
 * chasing two problems for one mistake.
 */
export function readMods(entries: readonly unknown[]): ModIdentity[] {
  const mods: ModIdentity[] = [];

  for (const entry of entries) {
    const record = asRecord(entry);
    if (record === null) continue;

    const id = asNonEmptyString(record["id"]);
    if (id === null) continue;

    const references: ModReferenceIdentity[] = [];
    const requiredModIds: string[] = [];

    const requires = record["requires"];
    if (Array.isArray(requires)) {
      requires.forEach((value, index) => {
        const reference = readReference(value, `requires[${index}]`);
        if (reference === null) return;
        references.push(reference);
        if (reference.collection === "mods") requiredModIds.push(reference.id);
      });
    }

    const affects = record["affects"];
    if (Array.isArray(affects)) {
      affects.forEach((value, index) => {
        const row = asRecord(value);
        if (row === null) return;
        if (row["ref"] === undefined) return;
        const reference = readReference(row["ref"], `affects[${index}].ref`);
        if (reference === null) return;
        references.push(reference);
      });
    }

    mods.push({ id, references, requiredModIds });
  }

  return mods;
}

/**
 * Every id that exists in each referencable collection.
 *
 * Callers pass the collections a reference may target
 * ({@link MOD_REFERENCE_COLLECTIONS}); an absent collection is an **empty
 * set**, which is why {@link findModIssues} reports "no entry has that id"
 * rather than assuming — a caller with no parts in hand and a caller whose
 * parts corpus is genuinely empty are the same state, and neither one is
 * permission to wave a pointer through.
 */
export function readReferencable(
  entries: readonly ReferencableEntry[]
): ReadonlyMap<string, ReadonlySet<string>> {
  const byCollection = new Map<string, Set<string>>();
  for (const collection of MOD_REFERENCE_COLLECTIONS) {
    byCollection.set(collection, new Set<string>());
  }

  for (const { collection, id } of entries) {
    const ids = byCollection.get(collection) ?? new Set<string>();
    ids.add(id);
    byCollection.set(collection, ids);
  }

  return byCollection;
}

/* -------------------------------------------------------------------------
 * The build rules
 * ---------------------------------------------------------------------- */

function duplicateEntryIdIssues(mods: readonly ModIdentity[]): ModIssue[] {
  const byId = new Map<string, ModIdentity[]>();
  for (const mod of mods) {
    byId.set(mod.id, [...(byId.get(mod.id) ?? []), mod]);
  }

  return [...byId.entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, group]) => ({
      code: "duplicate-entry-id" as const,
      entryId: id,
      field: "id",
      /**
       * Empty, and that is the honest answer — the reasoning
       * `src/lib/parts/index.ts` records verbatim: every entry in the group
       * declares *this* id, so there is no other id to name. What
       * distinguishes them is their **file**, which this module cannot see;
       * `src/integrations/validate-mods.ts` resolves the id to every file
       * that declares it.
       */
      relatedEntryIds: [],
      message:
        `${group.length} mods entries declare \`id: "${id}"\`. Entry ids are ` +
        `how every typed reference names a mod (MOD-02), so a duplicated id ` +
        `makes every pointer to it ambiguous. The files are listed below. ` +
        `refs specs/001-foundation (MOD-02)`,
    }));
}

/**
 * MOD-02's "a typed reference that the build resolves", as two distinct
 * failures.
 *
 * `dangling-reference` — nothing anywhere has that id.
 * `reference-wrong-collection` — something does, in the *other* collection.
 *
 * Splitting them is the point of the discriminator. Folding the second into
 * the first would tell an author "no such entry" about an entry they are
 * looking straight at, and send them to write a duplicate of it.
 */
function referenceIssues(
  mods: readonly ModIdentity[],
  known: ReadonlyMap<string, ReadonlySet<string>>
): ModIssue[] {
  const issues: ModIssue[] = [];

  for (const mod of mods) {
    for (const { collection, id, field } of mod.references) {
      if (known.get(collection)?.has(id) === true) continue;

      const elsewhere = [...MOD_REFERENCE_COLLECTIONS].filter(
        (candidate) =>
          candidate !== collection && known.get(candidate)?.has(id) === true
      );

      if (elsewhere.length > 0) {
        issues.push({
          code: "reference-wrong-collection",
          entryId: mod.id,
          field,
          relatedEntryIds: [id],
          message:
            `\`${mod.id}\` names \`${modReferenceKey({ collection, id })}\`, ` +
            `and no entry in the \`${collection}\` collection has that id — ` +
            `but ${elsewhere.map((name) => `\`${name}\``).join(" / ")} does. ` +
            `A typed reference says which collection to look in (MOD-02), so ` +
            `this is a one-word fix and not a missing entry: set ` +
            `\`collection\` to ${elsewhere.map((name) => `\`${name}\``).join(" / ")}. ` +
            `refs specs/001-foundation (MOD-02)`,
        });
        continue;
      }

      issues.push({
        code: "dangling-reference",
        entryId: mod.id,
        field,
        relatedEntryIds: [],
        message:
          `\`${mod.id}\` names \`${modReferenceKey({ collection, id })}\`, ` +
          `and no entry in that collection has that id. A requirement is a ` +
          `typed reference the build resolves (MOD-02): the thing it names ` +
          `gets its own entry — with its own fitment, its own sources and ` +
          `both prose locales — or the reference comes out. A prerequisite a ` +
          `reader cannot open is a prerequisite they cannot price. ` +
          `refs specs/001-foundation (MOD-02)`,
      });
    }
  }

  return issues;
}

/**
 * The strongly connected components of the requirement graph, by Tarjan's
 * algorithm — every node reachable from every other node in its own group.
 *
 * ## Why an SCC pass and not a walk
 *
 * `src/lib/parts/index.ts` detects its supersession loops by walking pointers,
 * and that is complete *there* because `supersededBy` is a single edge: a
 * walk that follows "the" pointer has followed all of them. `requires` is a
 * **list**, so the same walk is not complete and quietly misses cycles — with
 * `a → [b]`, `b → [c, a]`, following only `b`'s first edge walks off down `c`
 * and never sees `a → b → a`. That is precisely the shape a real corpus
 * produces (a mod with two prerequisites, one of which loops back), and a
 * cycle detector that misses cycles is worse than none, because it reads as
 * proof.
 *
 * SCCs remove the question rather than patching the walk: **every** cycle
 * lives entirely inside one component, so a graph whose components are all
 * singletons (with no self-edge) is acyclic, no exceptions and no ordering
 * luck. Reporting one issue per non-trivial component also means a knot of
 * four mods that require each other is one error naming four ids, rather than
 * an enumeration of its elementary cycles — of which there can be
 * exponentially many.
 *
 * Recursive rather than iterative: the depth is bounded by the number of mods
 * entries in the repo, which is a hand-written corpus.
 */
function stronglyConnectedComponents(mods: readonly ModIdentity[]): string[][] {
  const byId = new Map(mods.map((mod) => [mod.id, mod]));
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const strongConnect = (id: string): void => {
    index.set(id, counter);
    low.set(id, counter);
    counter += 1;
    stack.push(id);
    onStack.add(id);

    for (const next of byId.get(id)?.requiredModIds ?? []) {
      if (!byId.has(next)) continue; // dangling — reported by `referenceIssues`
      if (!index.has(next)) {
        strongConnect(next);
        low.set(id, Math.min(low.get(id) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id) ?? 0, index.get(next) ?? 0));
      }
    }

    if (low.get(id) !== index.get(id)) return;

    const component: string[] = [];
    for (;;) {
      const popped = stack.pop();
      if (popped === undefined) break;
      onStack.delete(popped);
      component.push(popped);
      if (popped === id) break;
    }
    components.push(component);
  };

  // Sorted, so the components — and therefore the issues — come out in a
  // deterministic order whatever order the loader handed the files over in.
  for (const id of [...byId.keys()].sort()) {
    if (!index.has(id)) strongConnect(id);
  }

  return components;
}

/**
 * One concrete `a → b → c → a` path through a component, for the error
 * message.
 *
 * The component itself is the *finding*; this is only how it is spelled. A
 * reader fixing a four-mod knot needs to see one loop through it, not a set.
 * Starts at the component's lowest id and prefers the lowest next hop at each
 * step, so the path is deterministic.
 */
function cyclePath(
  members: readonly string[],
  byId: ReadonlyMap<string, ModIdentity>
): string[] {
  const inComponent = new Set(members);
  const start = [...members].sort()[0];
  if (start === undefined) return [];

  const path: string[] = [start];
  const visited = new Set<string>([start]);
  let cursor = start;

  for (;;) {
    const next = [...(byId.get(cursor)?.requiredModIds ?? [])]
      .filter((id) => inComponent.has(id))
      .sort()
      .find((id) => id === start || !visited.has(id));
    if (next === undefined) return path;
    if (next === start) return path;
    path.push(next);
    visited.add(next);
    cursor = next;
  }
}

/**
 * A requirement cycle, reported **once per cycle** at its lowest id — so a
 * three-mod loop is one error and not three.
 *
 * Only `requires` edges that point at another **mod** can form one: a `parts`
 * entry has no `requires` field to point back with, and `affects` is a
 * consequence rather than a precondition — a mod that degrades another mod
 * which degrades it back is a perfectly honest pair of sentences, not a
 * contradiction. Failing a build over that would be failing over the truth.
 */
function requirementCycleIssues(mods: readonly ModIdentity[]): ModIssue[] {
  const byId = new Map(mods.map((mod) => [mod.id, mod]));

  return stronglyConnectedComponents(mods)
    .filter((component) => {
      if (component.length > 1) return true;
      // A one-node component is a cycle only if it requires itself. The schema
      // catches that from inside the entry; the build catches it too, because
      // a rule that only one of the two layers enforces is a rule that stops
      // being enforced the day the other layer is refactored.
      const only = component[0];
      return (
        only !== undefined &&
        (byId.get(only)?.requiredModIds ?? []).includes(only)
      );
    })
    .map((component) => {
      const members = [...component].sort();
      const entryId = members[0] as string;
      const loop = cyclePath(members, byId);

      return {
        code: "requirement-cycle" as const,
        entryId,
        field: "requires",
        relatedEntryIds: members.filter((id) => id !== entryId),
        message:
          `the requirement pointers form a loop: ` +
          `${[...loop, loop[0]].map((id) => `\`${id}\``).join(" → ")}` +
          (members.length > loop.length
            ? ` (all of ${members.map((id) => `\`${id}\``).join(", ")} require ` +
              `one another, directly or through each other)`
            : "") +
          `. A prerequisite has to be fittable first, and in a loop none of ` +
          `them is — there is no order in which a reader could do this work, ` +
          `and a page walking the prerequisites would walk it forever. ` +
          `refs specs/001-foundation (MOD-02)`,
      };
    })
    .sort((a, b) => (a.entryId < b.entryId ? -1 : 1));
}

/**
 * Every reason the mods corpus does not hold together; empty when it does.
 *
 * `known` is the id set per referencable collection, from
 * {@link readReferencable}. A caller with nothing in hand passes an empty
 * list, and every reference is then reported as dangling — which is the
 * honest outcome, not a reason to skip the check.
 */
export function findModIssues(
  mods: readonly ModIdentity[],
  known: ReadonlyMap<string, ReadonlySet<string>>
): readonly ModIssue[] {
  const identity = duplicateEntryIdIssues(mods);

  // Staged the way `findPartIssues` stages its checks: while two entries share
  // an id, "does this pointer resolve" is a question with two answers, and
  // reporting a derived failure next to the real one sends the author chasing
  // a symptom.
  if (identity.length > 0) return identity;

  return [...referenceIssues(mods, known), ...requirementCycleIssues(mods)];
}

/** Thrown by {@link assertModsResolve}; carries the structured issues. */
export class ModsResolutionError extends Error {
  readonly issues: readonly ModIssue[];

  constructor(issues: readonly ModIssue[]) {
    super(
      `${issues.length} mods problem(s):\n` +
        issues.map((issue) => `  • ${issue.message}`).join("\n")
    );
    this.name = "ModsResolutionError";
    this.issues = issues;
  }
}

/** {@link findModIssues}, as the build's throw. */
export function assertModsResolve(
  mods: readonly ModIdentity[],
  known: ReadonlyMap<string, ReadonlySet<string>>
): void {
  const issues = findModIssues(mods, known);
  if (issues.length === 0) return;
  throw new ModsResolutionError(issues);
}

/* -------------------------------------------------------------------------
 * What a mod page renders
 * ---------------------------------------------------------------------- */

/**
 * One prerequisite, resolved far enough for a template to render it: which
 * collection it lives in (so the page knows which route registry to ask) and
 * whether the corpus actually has it.
 *
 * `resolved: false` is kept as its own value rather than dropped from the
 * list. The build refuses that corpus, so it is unreachable in a real build —
 * but a page that silently omitted an unresolvable prerequisite would render
 * a *shorter* list of requirements than the entry declares, which is the
 * confident-zero failure AGENTS.md names ("a failure is not a zero"): a reader
 * would be told this mod needs less than it does.
 */
export interface ResolvedRequirement {
  readonly collection: ModReferenceCollection;
  readonly id: string;
  readonly resolved: boolean;
}

/**
 * An entry's `requires` list, each row marked resolved or not against `known`.
 *
 * Order is the entry's own: an author lists prerequisites in the order they
 * are done, and re-sorting them would be the page inventing a sequence.
 */
export function resolveRequirements(
  requires: readonly unknown[],
  known: ReadonlyMap<string, ReadonlySet<string>>
): readonly ResolvedRequirement[] {
  const rows: ResolvedRequirement[] = [];

  for (const value of requires) {
    const reference = readReference(value, "requires");
    if (reference === null) continue;
    if (
      !(MOD_REFERENCE_COLLECTIONS as readonly string[]).includes(
        reference.collection
      )
    ) {
      continue;
    }

    rows.push({
      collection: reference.collection as ModReferenceCollection,
      id: reference.id,
      resolved: known.get(reference.collection)?.has(reference.id) === true,
    });
  }

  return rows;
}
