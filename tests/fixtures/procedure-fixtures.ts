/**
 * Synthetic fixtures for the T502a graders (PRC-01, PRC-02, PRC-03).
 *
 * ## Everything here is obviously fake, on purpose
 *
 * AGENTS.md calls an invented part number "the highest-consequence
 * hallucination in this domain", and a *plausible* one in a fixture is exactly
 * how one leaks into content: someone greps for a number, finds it in the
 * repo, and ships it. So every identifier in this module is in a reserved test
 * namespace — `TEST-…` part numbers, `test-…` entry ids, `example.invalid`
 * source URLs — and every figure is a round number no factory ever printed.
 *
 * The same goes for the torque and fluid figures: `77` N·m and `3.3` L are
 * placeholders, not specifications. Nothing here is a claim about a Montero.
 *
 * ## Why the builders derive prose from the data
 *
 * `makeProcedure` reads the step / tool / prerequisite ids out of the shared
 * data it just built and writes one prose line per id, in both locales. A
 * grader that wants the *mismatch* — an ES entry missing a step's text — asks
 * for it explicitly (`proseOmit`), so a coverage grader cannot pass merely
 * because the fixture happened to line up. The realistic authoring mistake is
 * adding a step and forgetting one locale's sentence, and a fixture builder
 * that made that impossible would grade nothing.
 *
 * refs specs/001-foundation (PRC-01, PRC-02, PRC-03)
 */
import { LOCALES, type Locale } from "../../src/i18n/routing.ts";

export type { Locale };

export { LOCALES };

/* -------------------------------------------------------------------------
 * Sources
 * ---------------------------------------------------------------------- */

/** One citable, obviously-synthetic source. `kind` is documentary by default. */
export function makeSource(kind = "fsm"): Record<string, unknown> {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/t502a/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/t502a/source",
    accessed: "2026-09-02",
    kind,
  };
}

/* -------------------------------------------------------------------------
 * `reference` entries — what a procedure's `specs[]` ids resolve against
 * ---------------------------------------------------------------------- */

export interface ReferenceOptions {
  readonly id?: string;
  readonly kind?: string;
  readonly system?: string;
  /** Kind-owned fields, merged in as-is. */
  readonly fields?: Record<string, unknown>;
}

/**
 * A `reference` entry of the given kind, valid against
 * `referenceEntrySchema` — the canary parses these, so a fixture that drifts
 * out of schema-validity fails loudly there rather than silently weakening a
 * corpus grader.
 */
export function makeReference(
  options: ReferenceOptions = {}
): Record<string, unknown> {
  const {
    id = "test-ref-torque",
    kind = "torque",
    system = "engine",
    fields,
  } = options;

  const defaults: Record<string, Record<string, unknown>> = {
    torque: { torque: { value: 77, unit: "nm" } },
    fluid: {
      specification: "TEST SPEC 00W-00",
      capacity: { value: 3.3, unit: "l" },
    },
    capacity: { capacity: { value: 3.3, unit: "l" } },
    dimension: { dimension: { value: 1234, unit: "mm" } },
    "fsm-section": { manual: "TEST manual", section: "Group 00 — Test" },
  };

  return {
    id,
    fitment: { gens: ["gen3"] },
    kind,
    system,
    ...(fields ?? defaults[kind] ?? {}),
    confidence: "fsm-confirmed",
    sources: [makeSource()],
    prose: {
      en: {
        title: `TEST reference ${id}`,
        summary: "Synthetic T502a fixture.",
      },
      es: {
        title: `Referencia TEST ${id}`,
        summary: "Entrada sintética de T502a.",
      },
    },
  };
}

/* -------------------------------------------------------------------------
 * `parts` entries — what `partsConsumed[].part` ids resolve against
 * ---------------------------------------------------------------------- */

export function makePart(
  id = "test-part-oil-filter",
  oemNumber = "TEST-P0001"
): Record<string, unknown> {
  return {
    id,
    fitment: { gens: ["gen3"] },
    oemNumber,
    system: "engine",
    confidence: "fsm-confirmed",
    sources: [makeSource()],
    prose: {
      en: { title: `TEST part ${id}`, summary: "Synthetic T502a fixture." },
      es: { title: `Repuesto TEST ${id}`, summary: "Entrada sintética." },
    },
  };
}

/* -------------------------------------------------------------------------
 * `procedures` entries
 * ---------------------------------------------------------------------- */

export interface ProcedureStep {
  readonly id: string;
  readonly specs?: readonly string[];
  readonly parts?: readonly string[];
}

export interface ProcedureTool {
  readonly id: string;
  readonly special?: boolean;
  readonly sstNumber?: string;
}

export interface ProcedurePrerequisite {
  readonly id: string;
  readonly procedure?: string;
}

export interface ProcedurePartConsumed {
  readonly part: string;
  readonly quantity?: number;
}

export interface ProcedureOptions {
  readonly id?: string;
  readonly system?: string;
  readonly safetyCritical?: boolean;
  readonly difficulty?: unknown;
  readonly time?: unknown;
  readonly confidence?: string;
  readonly sources?: readonly unknown[];
  readonly steps?: readonly ProcedureStep[];
  readonly tools?: readonly ProcedureTool[];
  readonly prerequisites?: readonly ProcedurePrerequisite[];
  readonly partsConsumed?: readonly ProcedurePartConsumed[];
  readonly specs?: readonly string[];
  /**
   * Overrides the default bilingual note — pass one locale to build the
   * asymmetric case. Omit `safetyNotes` entirely and both locales get the
   * default; see {@link ProcedureOptions.omitSafetyNotes} for "neither".
   */
  readonly safetyNotes?: Partial<Record<Locale, string>>;
  /**
   * Drops the safety note from every locale.
   *
   * The default is *present*, and that is not cosmetic. A safety-critical
   * procedure is required to carry its own note (PRC-01's ninth field, see
   * `tests/schemas/procedures-safety.test.ts`), so a builder that omitted it
   * by default would make every "this safety-critical entry is accepted"
   * control unsatisfiable and every "one mistake, one error" assertion report
   * two. Found by running the graders against a scratch implementation, which
   * is exactly the interaction a fixture default is supposed to keep out of
   * the way.
   */
  readonly omitSafetyNotes?: boolean;
  /** Titles per locale — the subject `requiresSafetyFlagFromSubject` reads. */
  readonly titles?: Partial<Record<Locale, string>>;
  /** Extra step text per locale, keyed by step id — overrides the derived line. */
  readonly stepProse?: Partial<Record<Locale, Record<string, string>>>;
  /** Prose keys to leave out, per locale: `{ es: { steps: ["test-step-2"] } }`. */
  readonly proseOmit?: Partial<
    Record<
      Locale,
      Partial<Record<"steps" | "tools" | "prerequisites", string[]>>
    >
  >;
  /** Merged into shared data last — for fields the schema must *reject*. */
  readonly extraShared?: Record<string, unknown>;
  /** Merged into every locale's prose last — same purpose. */
  readonly extraProse?: Record<string, unknown>;
}

const DEFAULT_STEPS: readonly ProcedureStep[] = [
  { id: "test-step-lift", parts: [] },
  { id: "test-step-torque", specs: ["test-ref-torque"] },
];

const DEFAULT_TOOLS: readonly ProcedureTool[] = [
  { id: "test-tool-socket" },
  { id: "test-tool-sst", special: true, sstNumber: "TEST-SST-0001" },
];

const DEFAULT_PREREQUISITES: readonly ProcedurePrerequisite[] = [
  { id: "test-prereq-cold" },
];

const DEFAULT_PARTS: readonly ProcedurePartConsumed[] = [
  { part: "test-part-oil-filter", quantity: 1 },
];

/** `stepId` → the sentence, in a locale-obvious way. */
function line(locale: Locale, id: string): string {
  return locale === "en"
    ? `TEST instruction for ${id} — synthetic, no figures.`
    : `Instrucción TEST para ${id} — sintética, sin cifras.`;
}

/** The default entry-specific hazard note, in each locale. No figures in it. */
export const DEFAULT_SAFETY_NOTES: Record<Locale, string> = {
  en: "TEST hazard note — synthetic, states no figure.",
  es: "Nota TEST de riesgo — sintética, no indica ninguna cifra.",
};

/**
 * `{ safetyNotes }` for one locale, or `{}` when the fixture is meant to have
 * none there.
 *
 * Three states, not two: **default** (present in both), **explicit** (exactly
 * the locales named, which is how the asymmetric case is built), and
 * **omitted** (`omitSafetyNotes`, the case the requirement rejects).
 */
function safetyNoteFor(
  locale: Locale,
  explicit: Partial<Record<Locale, string>> | undefined,
  omit: boolean
): Record<string, string> {
  if (omit) return {};
  if (explicit === undefined)
    return { safetyNotes: DEFAULT_SAFETY_NOTES[locale] };
  const note = explicit[locale];
  return note === undefined ? {} : { safetyNotes: note };
}

function proseRecord(
  locale: Locale,
  ids: readonly string[],
  omit: readonly string[] = [],
  overrides: Record<string, string> = {}
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const id of ids) {
    if (omit.includes(id)) continue;
    record[id] = overrides[id] ?? line(locale, id);
  }
  return record;
}

/**
 * A procedures entry as an author would write it — valid by default, with one
 * knob per rule the graders need to break.
 *
 * Returned as a plain `Record<string, unknown>` rather than a typed entry
 * because the schema that would type it does not exist yet, and because a
 * grader must be able to hand the parser shapes the type system would refuse.
 */
export function makeProcedure(
  options: ProcedureOptions = {}
): Record<string, unknown> {
  const {
    id = "test-g3-engine-oil-change",
    system = "engine",
    safetyCritical,
    difficulty = 2,
    time = { value: 45, unit: "min" },
    confidence = "fsm-confirmed",
    sources = [makeSource()],
    steps = DEFAULT_STEPS,
    tools = DEFAULT_TOOLS,
    prerequisites = DEFAULT_PREREQUISITES,
    partsConsumed = DEFAULT_PARTS,
    specs = ["test-ref-torque"],
    safetyNotes,
    omitSafetyNotes = false,
    titles,
    stepProse,
    proseOmit,
    extraShared,
    extraProse,
  } = options;

  const stepIds = steps.map((step) => step.id);
  const toolIds = tools.map((tool) => tool.id);
  const prerequisiteIds = prerequisites.map((prerequisite) => prerequisite.id);

  const prose = Object.fromEntries(
    LOCALES.map((locale) => {
      const omit = proseOmit?.[locale] ?? {};
      return [
        locale,
        {
          title:
            titles?.[locale] ??
            (locale === "en"
              ? `TEST procedure ${id}`
              : `Procedimiento TEST ${id}`),
          summary:
            locale === "en"
              ? "Synthetic T502a fixture. Not a real job."
              : "Entrada sintética de T502a. No es un trabajo real.",
          steps: proseRecord(
            locale,
            stepIds,
            omit.steps,
            stepProse?.[locale] ?? {}
          ),
          tools: proseRecord(locale, toolIds, omit.tools),
          prerequisites: proseRecord(
            locale,
            prerequisiteIds,
            omit.prerequisites
          ),
          ...safetyNoteFor(locale, safetyNotes, omitSafetyNotes),
          ...(extraProse ?? {}),
        },
      ];
    })
  );

  return {
    id,
    /*
     * The year range is here on purpose, not for realism: it puts two numbers
     * inside the *fixed entry envelope*, which `scripts/check-citations.mjs`
     * deliberately never scans ("they describe which vehicles an entry applies
     * to, not a fact the entry is asserting"). Without them, the citation
     * grader's control for that carve-out would be vacuous.
     */
    fitment: { gens: ["gen3"], years: { from: 1999, to: 2006 } },
    system,
    ...(safetyCritical === undefined ? {} : { safetyCritical }),
    difficulty,
    time,
    prerequisites,
    tools,
    partsConsumed,
    specs,
    steps,
    ...(extraShared ?? {}),
    confidence,
    sources,
    prose,
  };
}

/**
 * The same entry with one shared-data field removed — how a grader asks "is
 * this field required?" without the builder having to grow an option per
 * field. Deleting is deliberate: `{ difficulty: undefined }` is a *present*
 * key in JSON terms and some schemas treat the two differently.
 */
export function without(
  entry: Record<string, unknown>,
  field: string
): Record<string, unknown> {
  const copy = { ...entry };
  delete copy[field];
  return copy;
}

/**
 * The corpus a valid {@link makeProcedure} resolves against: the reference
 * entry its `specs[]` names, and the parts entry its `partsConsumed[]` names.
 */
export function makeCorpusFor(procedures: readonly unknown[]): {
  procedures: readonly unknown[];
  references: readonly unknown[];
  parts: readonly unknown[];
} {
  return {
    procedures,
    references: [
      makeReference({ id: "test-ref-torque", kind: "torque" }),
      makeReference({ id: "test-ref-fluid", kind: "fluid" }),
      makeReference({ id: "test-ref-capacity", kind: "capacity" }),
      makeReference({ id: "test-ref-fsm", kind: "fsm-section" }),
      makeReference({ id: "test-ref-dimension", kind: "dimension" }),
    ],
    parts: [makePart()],
  };
}
