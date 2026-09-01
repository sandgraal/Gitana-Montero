/**
 * The parts graph (PRT-02, PRT-03) — everything about the `parts` collection
 * that one entry cannot see on its own.
 *
 * `src/schemas/parts.ts` owns the shape of a single entry and the
 * contradictions visible from inside it. This module owns the three questions
 * that are only answerable with the whole corpus in hand:
 *
 * 1. **Is this OEM number unique?** (PRT-03.) One number is one part is one
 *    page; two entries claiming it is a build failure naming both.
 * 2. **Does the `supersededBy` pointer resolve, and does the chain terminate?**
 *    (PRT-02.) A dangling pointer, a self-pointer or a cycle is a build
 *    failure — a cycle in particular would be an infinite loop in the very
 *    renderer PRT-02 asks for.
 * 3. **Does each `vendors` id name a real seller?** (PRT-01.) The vendors are
 *    typed references into the `community` collection, so the reference is
 *    resolvable exactly as a fitment id is.
 *
 * ## Why a lib and an integration, and not a `check:*` script
 *
 * Same division `src/lib/fitment/` and `src/integrations/validate-fitments.ts`
 * settled for FIT-02, and for the same reason: the rules are pure functions
 * that deserve unit tests without a browser or a build, and the *build* is
 * where "THE build SHALL fail" (PRT-03) becomes true. The lib returns issues
 * rather than throwing, so one build reports every problem instead of the
 * first — the choice `validateEntryFitments` and `validateSlugRegistry` both
 * make.
 *
 * Nothing here interprets a fitment. Whether two parts *fit the same trucks*
 * is a fitment question and belongs to `src/lib/fitment/` (FIT-01); this
 * module never needs to ask it, because the identity rule it enforces is the
 * strictly stronger one — see `src/schemas/parts.ts` for why the widening from
 * PRT-03's literal "with conflicting fitment" is the safe direction.
 *
 * refs specs/001-foundation (PRT-01, PRT-02, PRT-03, SCF-04)
 */
import { normalizePartNumber } from "./part-numbers.ts";

/* -------------------------------------------------------------------------
 * What this module reads
 * ---------------------------------------------------------------------- */

/**
 * The slice of a parts entry the graph needs. Read tolerantly from `unknown`
 * by {@link readParts}: shape is the schema's business, and a module that
 * threw on a malformed entry would replace the schema's precise, field-named
 * error with a stack trace.
 */
export interface PartIdentity {
  readonly id: string;
  readonly oemNumber: string;
  readonly supersededBy: string | null;
  readonly vendors: readonly string[];
}

/** The slice of a community entry the vendor rule needs. */
export interface SellerIdentity {
  readonly id: string;
  readonly communityType: string;
}

/**
 * The `communityType` values that mean "you can buy a part here" — COM-01's
 * own two seller types.
 *
 * Named here rather than imported from `src/schemas/community.ts` as a
 * narrowed constant because this is a *parts* judgement about that
 * vocabulary: PRT-01 asks for vendors, and a Facebook group is a real and
 * useful community entry that is not a place to order a water pump. If the
 * community vocabulary ever grows a third seller type, the type error is in
 * this file, where the judgement lives.
 */
export const VENDOR_COMMUNITY_TYPES: readonly string[] = ["vendor", "shop"];

export const PART_ISSUE_CODES = [
  "duplicate-entry-id",
  "duplicate-oem-number",
  "dangling-supersession",
  "supersession-cycle",
  "unknown-vendor",
  "vendor-is-not-a-seller",
] as const;

export type PartIssueCode = (typeof PART_ISSUE_CODES)[number];

export interface PartIssue {
  readonly code: PartIssueCode;
  /** The entry the issue is reported against. */
  readonly entryId: string;
  /** Dotted field path within that entry (SCF-04). */
  readonly field: string;
  /**
   * Every *other* entry the issue is about — the other claimants of a
   * duplicated number, the rest of a cycle. The build caller turns these into
   * file paths, which is why the ids are structured rather than only spelled
   * into the message.
   */
  readonly relatedEntryIds: readonly string[];
  readonly message: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Every readable parts entry, in input order.
 *
 * An entry with no `id` or no `oemNumber` is skipped rather than reported: the
 * schema already rejects it, by field, and a second complaint here would send
 * an author chasing two problems for one mistake.
 */
export function readParts(entries: readonly unknown[]): PartIdentity[] {
  const parts: PartIdentity[] = [];

  for (const entry of entries) {
    const record = asRecord(entry);
    if (record === null) continue;

    const id = asString(record["id"]);
    const oemNumber = asString(record["oemNumber"]);
    if (id === null || oemNumber === null) continue;

    const vendors = Array.isArray(record["vendors"])
      ? record["vendors"].flatMap((value) => {
          const vendor = asString(value);
          return vendor === null ? [] : [vendor];
        })
      : [];

    parts.push({
      id,
      oemNumber,
      supersededBy: asString(record["supersededBy"]),
      vendors,
    });
  }

  return parts;
}

/** Every readable community entry, as the vendor rule sees it. */
export function readSellers(entries: readonly unknown[]): SellerIdentity[] {
  const sellers: SellerIdentity[] = [];

  for (const entry of entries) {
    const record = asRecord(entry);
    if (record === null) continue;
    const id = asString(record["id"]);
    if (id === null) continue;
    sellers.push({
      id,
      communityType: asString(record["communityType"]) ?? "",
    });
  }

  return sellers;
}

/* -------------------------------------------------------------------------
 * The index a page reads
 * ---------------------------------------------------------------------- */

export interface PartsIndex {
  readonly byId: ReadonlyMap<string, PartIdentity>;
  /** `id -> the entries that name it in `supersededBy``, in id order. */
  readonly predecessors: ReadonlyMap<string, readonly PartIdentity[]>;
}

/**
 * Both directions of the supersession edge, derived once from the one stored
 * direction.
 *
 * The reverse edge is *computed*, never stored — see `src/schemas/parts.ts`:
 * a `supersedes` field would be the same edge written twice, and two copies of
 * one edge can disagree.
 */
export function buildPartsIndex(parts: readonly PartIdentity[]): PartsIndex {
  const byId = new Map<string, PartIdentity>();
  for (const part of parts) {
    if (!byId.has(part.id)) byId.set(part.id, part);
  }

  const predecessors = new Map<string, PartIdentity[]>();
  for (const part of [...parts].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const { supersededBy } = part;
    if (supersededBy === null) continue;
    const list = predecessors.get(supersededBy) ?? [];
    list.push(part);
    predecessors.set(supersededBy, list);
  }

  return { byId, predecessors };
}

/**
 * PRT-02's chain, for one part: **oldest → current**, with the current
 * orderable number last.
 *
 * Walking *forward* is unambiguous — a part is superseded by at most one
 * successor. Walking *backward* is not: two old numbers can be consolidated
 * into one new one, so a node can have several predecessors. The rule here is
 * the conservative one: walk back only while there is exactly one predecessor,
 * and report `forked: true` when the walk stopped at a node that has more.
 * The page renders the other branches as a separate list rather than pretending
 * a tree is a line — a chain drawn as "A → B → C" when D also became C is a
 * picture that is simply false, and this is a domain where a reader orders a
 * part from the picture.
 *
 * Returns `null` for an unknown id, and for a chain that does not terminate —
 * a cycle is reported by {@link findPartIssues} and fails the build, so no
 * page ever has to render one, and returning `null` means a renderer cannot
 * loop even if one somehow arrived.
 */
export interface SupersessionChain {
  /** Oldest first, current last. Always contains the requested part. */
  readonly chain: readonly PartIdentity[];
  /** The last element — the number to order today (PRT-02). */
  readonly current: PartIdentity;
  /** Whether the backward walk stopped at a node with several predecessors. */
  readonly forked: boolean;
  /** The predecessors not on `chain`, at that fork. Empty when `forked` is false. */
  readonly otherPredecessors: readonly PartIdentity[];
}

export function supersessionChain(
  id: string,
  index: PartsIndex
): SupersessionChain | null {
  const start = index.byId.get(id);
  if (start === undefined) return null;

  const forward: PartIdentity[] = [start];
  const seen = new Set<string>([start.id]);
  let cursor = start;
  while (cursor.supersededBy !== null) {
    const next = index.byId.get(cursor.supersededBy);
    if (next === undefined) return null; // dangling — the build has failed
    if (seen.has(next.id)) return null; // cycle — likewise
    seen.add(next.id);
    forward.push(next);
    cursor = next;
  }

  const backward: PartIdentity[] = [];
  let forked = false;
  let otherPredecessors: readonly PartIdentity[] = [];
  let head = start;
  for (;;) {
    const before = index.predecessors.get(head.id) ?? [];
    if (before.length === 0) break;
    if (before.length > 1) {
      forked = true;
      otherPredecessors = before;
      break;
    }
    const only = before[0] as PartIdentity;
    if (seen.has(only.id)) return null; // cycle
    seen.add(only.id);
    backward.unshift(only);
    head = only;
  }

  const chain = [...backward, ...forward];
  return {
    chain,
    current: chain[chain.length - 1] as PartIdentity,
    forked,
    otherPredecessors,
  };
}

/* -------------------------------------------------------------------------
 * The build rules
 * ---------------------------------------------------------------------- */

function duplicateEntryIdIssues(parts: readonly PartIdentity[]): PartIssue[] {
  const byId = new Map<string, PartIdentity[]>();
  for (const part of parts) {
    byId.set(part.id, [...(byId.get(part.id) ?? []), part]);
  }

  return [...byId.entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, group]) => ({
      code: "duplicate-entry-id" as const,
      entryId: id,
      field: "id",
      relatedEntryIds: group.map((part) => part.id),
      message:
        `${group.length} parts entries declare \`id: "${id}"\`. Entry ids are ` +
        `how \`supersededBy\` and every other typed reference name a part, so ` +
        `a duplicated id makes every pointer to it ambiguous. ` +
        `refs specs/001-foundation (PRT-02)`,
    }));
}

/**
 * PRT-03, widened to the whole-number rule — see `src/schemas/parts.ts` for
 * why. Comparison is on {@link normalizePartNumber}, so `MB598152` and
 * `MB-598152` are recognised as the one number they are.
 */
function duplicateOemNumberIssues(parts: readonly PartIdentity[]): PartIssue[] {
  const byNumber = new Map<string, PartIdentity[]>();
  for (const part of parts) {
    const key = normalizePartNumber(part.oemNumber);
    byNumber.set(key, [...(byNumber.get(key) ?? []), part]);
  }

  return [...byNumber.entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, group]) => {
      const sorted = [...group].sort((a, b) => (a.id < b.id ? -1 : 1));
      const [first, ...rest] = sorted as [PartIdentity, ...PartIdentity[]];
      const spellings = [...new Set(sorted.map((part) => part.oemNumber))];

      return {
        code: "duplicate-oem-number" as const,
        entryId: first.id,
        field: "oemNumber",
        relatedEntryIds: rest.map((part) => part.id),
        message:
          `${sorted.length} parts entries claim OEM number ` +
          `${spellings.map((number) => `\`${number}\``).join(" / ")}: ` +
          `${sorted.map((part) => `\`${part.id}\``).join(", ")}. One OEM ` +
          `number is one part is one page — a reader searching that number ` +
          `must not get two answers with two fitments and two supersession ` +
          `chains. Merge them into one entry, or one of the numbers is a ` +
          `transcription error` +
          (spellings.length > 1
            ? ` (hyphens are ignored when comparing, so the two spellings ` +
              `above are the same number)`
            : "") +
          `. refs specs/001-foundation (PRT-03)`,
      };
    });
}

function supersessionIssues(parts: readonly PartIdentity[]): PartIssue[] {
  const byId = new Map(parts.map((part) => [part.id, part]));
  const issues: PartIssue[] = [];

  for (const part of parts) {
    const { supersededBy } = part;
    if (supersededBy === null) continue;

    if (!byId.has(supersededBy)) {
      issues.push({
        code: "dangling-supersession",
        entryId: part.id,
        field: "supersededBy",
        relatedEntryIds: [],
        message:
          `\`${part.id}\` says it was superseded by \`${supersededBy}\`, and ` +
          `no parts entry has that id. A supersession pointer is a typed ` +
          `reference the build resolves: the superseding part gets its own ` +
          `entry — with its own fitment, its own sources and both prose ` +
          `locales — or the pointer comes out. A number a reader cannot open ` +
          `is a number they cannot check. refs specs/001-foundation (PRT-02)`,
      });
      continue;
    }

    // Cycle detection, reported once per cycle at its lowest id so a
    // three-part loop is one error and not three.
    const walked: string[] = [part.id];
    const seen = new Set<string>([part.id]);
    let cursor: PartIdentity | undefined = byId.get(supersededBy);
    while (cursor !== undefined) {
      if (seen.has(cursor.id)) {
        const loop = walked.slice(walked.indexOf(cursor.id));
        const lowest = [...loop].sort()[0];
        if (lowest === part.id) {
          issues.push({
            code: "supersession-cycle",
            entryId: part.id,
            field: "supersededBy",
            relatedEntryIds: loop.filter((id) => id !== part.id),
            message:
              `the supersession pointers form a loop: ` +
              `${[...loop, loop[0]].map((id) => `\`${id}\``).join(" → ")}. ` +
              `A chain has to end somewhere — its last entry is the current, ` +
              `orderable number (PRT-02) — and a loop has no end, so no part ` +
              `in it can be ordered and the chain renderer would walk it ` +
              `forever. refs specs/001-foundation (PRT-02)`,
          });
        }
        break;
      }
      seen.add(cursor.id);
      walked.push(cursor.id);
      cursor =
        cursor.supersededBy === null
          ? undefined
          : byId.get(cursor.supersededBy);
    }
  }

  return issues;
}

function vendorIssues(
  parts: readonly PartIdentity[],
  sellers: readonly SellerIdentity[]
): PartIssue[] {
  const byId = new Map(sellers.map((seller) => [seller.id, seller]));
  const issues: PartIssue[] = [];

  for (const part of parts) {
    part.vendors.forEach((vendor, index) => {
      const seller = byId.get(vendor);

      if (seller === undefined) {
        issues.push({
          code: "unknown-vendor",
          entryId: part.id,
          field: `vendors[${index}]`,
          relatedEntryIds: [],
          message:
            `\`${part.id}\` lists vendor \`${vendor}\`, and no \`community\` ` +
            `entry has that id. Vendors are typed references into the ` +
            `community directory (COM-01) rather than a second, parts-local ` +
            `list of shops — add the seller there, with its region, language ` +
            `and sources, and point at it. ` +
            `refs specs/001-foundation (PRT-01)`,
        });
        return;
      }

      if (VENDOR_COMMUNITY_TYPES.includes(seller.communityType)) return;

      issues.push({
        code: "vendor-is-not-a-seller",
        entryId: part.id,
        field: `vendors[${index}]`,
        relatedEntryIds: [vendor],
        message:
          `\`${part.id}\` lists \`${vendor}\` as a vendor, but that community ` +
          `entry is a \`${seller.communityType}\` — not one of ` +
          `${VENDOR_COMMUNITY_TYPES.map((type) => `\`${type}\``).join(" / ")}. ` +
          `A forum where people discuss the part is not a place to order it, ` +
          `and a reader who follows a "where to buy" link to a Facebook group ` +
          `has been sent somewhere they cannot buy anything. ` +
          `refs specs/001-foundation (PRT-01)`,
      });
    });
  }

  return issues;
}

/**
 * Every reason the parts corpus does not hold together; empty when it does.
 *
 * `sellers` is the `community` collection, for the vendor rule. Pass `[]` to
 * skip it — which is what a caller with no community entries in hand does, and
 * is why the vendor rule reports "unknown" rather than assuming.
 */
export function findPartIssues(
  parts: readonly PartIdentity[],
  sellers: readonly SellerIdentity[] = []
): readonly PartIssue[] {
  const identity = [
    ...duplicateEntryIdIssues(parts),
    ...duplicateOemNumberIssues(parts),
  ];

  // Staged the way `validateEntryFitments` stages its checks: while two
  // entries share an id, "does this pointer resolve" is a question with two
  // answers, and reporting a derived failure next to the real one sends the
  // author chasing a symptom.
  if (identity.some((issue) => issue.code === "duplicate-entry-id")) {
    return identity;
  }

  return [
    ...identity,
    ...supersessionIssues(parts),
    ...vendorIssues(parts, sellers),
  ];
}

/** Thrown by {@link assertPartsResolve}; carries the structured issues. */
export class PartsResolutionError extends Error {
  readonly issues: readonly PartIssue[];

  constructor(issues: readonly PartIssue[]) {
    super(
      `${issues.length} parts problem(s):\n` +
        issues.map((issue) => `  • ${issue.message}`).join("\n")
    );
    this.name = "PartsResolutionError";
    this.issues = issues;
  }
}

/** {@link findPartIssues}, as the build's throw. */
export function assertPartsResolve(
  parts: readonly PartIdentity[],
  sellers: readonly SellerIdentity[] = []
): void {
  const issues = findPartIssues(parts, sellers);
  if (issues.length === 0) return;
  throw new PartsResolutionError(issues);
}
