/**
 * Synthetic fixtures for the T103 entry-schema graders.
 *
 * Everything here is deliberately fake and must stay that way:
 *
 * - Part numbers use the reserved `TEST-` namespace. AGENTS.md treats an
 *   invented part number as the highest-consequence hallucination in this
 *   domain; a plausible-looking Mitsubishi number in a fixture is exactly the
 *   thing that leaks into content later. `TEST-…` can never be mistaken for
 *   an OEM number.
 * - URLs use the reserved `.invalid` TLD (RFC 2606), so `check:links` can
 *   never be tricked into thinking a fixture cites something real.
 * - Entry ids are prefixed `test-schema-`, outside the `g{gen}-{system}-…`
 *   convention in plan.md, so no fixture can collide with a real entry id.
 * - ES prose uses the `usted` register (I18N-07) even though nothing here is
 *   published — fixtures should not model the thing the lint rule forbids.
 *
 * Every export is a factory returning a fresh mutable object, so a grader can
 * delete or overwrite a field without leaking state into the next test.
 *
 * refs specs/001-foundation (I18N-05, I18N-06, SCF-04)
 */

export interface TestSource {
  title?: string;
  url?: string;
  archiveUrl?: string;
  accessed?: string;
  kind?: string;
  [extra: string]: unknown;
}

export interface TestProseLocale {
  title?: string;
  summary?: string;
  [extra: string]: unknown;
}

export interface TestProse {
  en?: TestProseLocale;
  es?: TestProseLocale;
  [extra: string]: unknown;
}

export interface TestEntry {
  id?: string;
  fitment?: { gens?: string[]; [extra: string]: unknown };
  confidence?: string;
  sources?: TestSource[];
  torqueNm?: number;
  oemPartNumber?: string;
  prose?: TestProse;
  [extra: string]: unknown;
}

/** A well-formed source per plan.md "Content conventions". */
export function makeSource(): TestSource {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/test-schema/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/test-schema/source",
    accessed: "2026-08-27",
    kind: "fsm",
  };
}

/** English prose for a fixture entry. */
export function makeProseEn(): TestProseLocale {
  return {
    title: "TEST fixture entry",
    summary: "Synthetic fixture used by the T103 schema graders.",
  };
}

/** Costa Rican Spanish prose for a fixture entry, `usted` register. */
export function makeProseEs(): TestProseLocale {
  return {
    title: "Entrada de prueba TEST",
    summary: "Ficha sintética que usan los verificadores de esquema de T103.",
  };
}

/**
 * A complete, valid entry: shared locale-independent data at the top level
 * (`torqueNm`, `oemPartNumber`, `fitment`, `confidence`, `sources`), human
 * language text under `prose`, both locales present.
 */
export function makeValidEntry(): TestEntry {
  return {
    id: "test-schema-alpha",
    fitment: { gens: ["gen3"] },
    confidence: "fsm-confirmed",
    sources: [makeSource()],
    torqueNm: 88,
    oemPartNumber: "TEST-MB000001",
    prose: { en: makeProseEn(), es: makeProseEs() },
  };
}
