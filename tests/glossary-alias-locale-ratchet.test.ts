/**
 * A ratchet on one glossary field that three published ES pages depend on.
 *
 * ## The coupling this exists to hold still
 *
 * `all-general-montero`'s canonical term is **Montero**; `Pajero`, `Shogun`
 * and `Montero Sport` are its regional aliases. `check:glossary`'s
 * conformance scan reads `prose.es` and flags aliases tagged
 * **`locale: "es"`** — an `en` alias is never scanned against Spanish prose,
 * which is exactly why `glossaryAliasSchema` makes `locale` required with no
 * default (`src/schemas/glossary.ts`).
 *
 * That is load-bearing for content, not just for the scanner. The T208
 * bilingual review (tasks.md, 2026-09-01) reverted a first pass that had
 * paraphrased `Pajero` out of three ES entries on the belief the gate would
 * reject it: `vin-code-gen3-export-line-v6` and `-v7` quote the export
 * chart's own `MITSUBISHI PAJERO short/long wheelbase`, and
 * `vin-code-gen3-us-plant-j` names the plant verbatim as both North American
 * charts print it — `Pajero Manufacturing Co., Ltd.` — unchanged in both
 * locales. Naming a document and naming a company are not translation
 * choices.
 *
 * Nothing in the repo pinned `locale: "en"` on those two aliases before this
 * file. **The failure mode is not silence — it is worse than silence.**
 *
 * Measured, and re-derivable: set the `Pajero` alias to `locale: "es"` and run
 * `npm run check:glossary`. It exits 1 with **36 Pajero messages across 24
 * content files plus 5 ES UI strings** in `src/i18n/ui.ts` (`siteTagline`,
 * `homeIntro`, `communityIntro`, `garageEmptyBody`, `partsIntro`). By
 * collection: `reference` 8 files / 8 messages, `vehicles` 9 / 9, `community`
 * 6 / 13, `glossary` 1 / 1. Counts are messages-per-field, so a file whose EN
 * and ES summaries both trip the scan appears more than once — hence 36
 * messages over 24 files rather than one apiece.
 *
 * Not one of those 36 messages names the alias's `locale` field. Every one of
 * them says the ES prose is wrong. So the cheapest reading of that wall is
 * "paraphrase Pajero out of 24 files" — precisely the pass the 2026-09-01
 * review reverted, at eight times the scale, and it would take the plant's
 * registered name and the manual's printed title with it.
 *
 * This file's job is to make the flip fail *at the flip*, naming the one
 * field that moved, before anybody starts editing prose.
 *
 * ## What this file does NOT claim
 *
 * It does not assert that `en` is the right locale for every alias, and it is
 * not a general glossary grader — `tests/check-glossary.test.ts` owns the
 * scanner's behaviour. It pins two named alias terms and the ES entries that
 * depend on them, and it is deliberately list-based: a fourth entry that
 * starts naming the plant is not covered until its id is added below
 * (`.claude/GRADER-PRINCIPLES.md`, "a known-pages sweep is only as complete
 * as its list").
 *
 * refs specs/001-foundation (GLO-01, GLO-02, REF-01)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface AliasRecord {
  readonly term: string;
  readonly locale: string;
  readonly countries: readonly string[];
}

interface GlossaryRecord {
  readonly aliases?: readonly AliasRecord[];
}

interface ReferenceRecord {
  readonly prose?: { readonly es?: Record<string, string> };
}

function readJson<T>(relative: string): T {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")
  ) as T;
}

/** The one glossary entry that owns the Montero/Pajero/Shogun alias set. */
const MONTERO = readJson<GlossaryRecord>(
  "../src/content/glossary/all-general-montero.json"
);

/** The alias terms this ruling depends on, written out rather than derived. */
const RULED_ALIAS_TERMS = ["Pajero", "Shogun"] as const;

/**
 * The reference entries the 2026-09-01 review ruled on by name. Their ES prose
 * quotes a document title or a company name that contains `Pajero`.
 */
const ES_ENTRIES_NAMING_PAJERO = [
  "vin-code-gen3-export-line-v6",
  "vin-code-gen3-export-line-v7",
  "vin-code-gen3-us-plant-j",
] as const;

describe("the Pajero/Shogun alias locale is pinned to `en`", () => {
  it("still carries both ruled aliases — the pin is not vacuous", () => {
    const terms = (MONTERO.aliases ?? []).map((alias) => alias.term);
    for (const term of RULED_ALIAS_TERMS) {
      expect(terms, term).toContain(term);
    }
  });

  it.each([...RULED_ALIAS_TERMS])(
    'tags the `%s` alias `locale: "en"`, so the ES scan never claims it',
    (term) => {
      const matching = (MONTERO.aliases ?? []).filter(
        (alias) => alias.term === term
      );
      expect(matching.length, `${term} alias count`).toBeGreaterThan(0);
      for (const alias of matching) {
        expect(alias.locale, term).toBe("en");
      }
    }
  );

  it("is a claim about these two terms only, not about every alias", () => {
    // Positive control: the file legitimately holds ES-locale aliases
    // elsewhere in the collection, and this rule must not be read as
    // "aliases are English". `Montero Sport` is an `en` marketing name; the
    // assertion below is only that the set is larger than the ruled pair, so
    // the two above are a deliberate subset rather than the whole file.
    expect((MONTERO.aliases ?? []).length).toBeGreaterThan(
      RULED_ALIAS_TERMS.length
    );
  });
});

describe("the ES entries that depend on that locale still depend on it", () => {
  it.each([...ES_ENTRIES_NAMING_PAJERO])(
    "%s names Pajero in its own `prose.es`",
    (id) => {
      const entry = readJson<ReferenceRecord>(
        `../src/content/reference/${id}.json`
      );
      const es = JSON.stringify(entry.prose?.es ?? {});
      expect(es.toUpperCase(), id).toContain("PAJERO");
    }
  );

  it("keeps the EN and ES prose naming it the same way", () => {
    // The ruling's substance: the plant's registered name and the manual's
    // printed title are the same string in both locales. If a future edit
    // drops it from one side only, that is the paraphrase the review
    // reverted, reappearing.
    for (const id of ES_ENTRIES_NAMING_PAJERO) {
      const entry = readJson<{
        readonly prose?: {
          readonly en?: Record<string, string>;
          readonly es?: Record<string, string>;
        };
      }>(`../src/content/reference/${id}.json`);
      const en = JSON.stringify(entry.prose?.en ?? {}).toUpperCase();
      const es = JSON.stringify(entry.prose?.es ?? {}).toUpperCase();
      expect(en, `${id} en`).toContain("PAJERO");
      expect(es, `${id} es`).toContain("PAJERO");
    }
  });
});
