/**
 * Graders — `check:locales` (SCF-02) and the `data.id` === file-derived Astro
 * entry id check (T104 review: "the two ids can silently diverge").
 *
 * refs specs/001-foundation (SCF-02, I18N-06)
 */
import { describe, expect, it } from "vitest";
import {
  auditEntries,
  findIdMismatch,
  findLocaleIssues,
} from "../scripts/check-locales.mjs";

interface Entry {
  collection: string;
  file: string;
  relativePath: string;
  data: unknown;
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    collection: "problems",
    file: "src/content/problems/g3-tcase-chain-stretch.md",
    relativePath: "g3-tcase-chain-stretch.md",
    data: {
      id: "g3-tcase-chain-stretch",
      prose: {
        en: { title: "Chain stretch", summary: "Symptoms and fix." },
        es: { title: "Estiramiento de cadena", summary: "Síntomas y arreglo." },
      },
    },
    ...overrides,
  };
}

describe("findLocaleIssues", () => {
  it("finds nothing on a complete, bilingual entry", () => {
    expect(findLocaleIssues(entry())).toEqual([]);
  });

  it("flags a missing prose block entirely", () => {
    const issues = findLocaleIssues(entry({ data: { id: "x" } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/missing `prose`/);
  });

  it("flags a missing es locale (one-locale entry)", () => {
    const issues = findLocaleIssues(
      entry({
        data: {
          id: "x",
          prose: { en: { title: "T", summary: "S" } },
        },
      })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.locale).toBe("es");
    expect(issues[0]?.message).toMatch(/missing `prose\.es`/);
  });

  it("flags a present-but-blank prose field, naming the dotted path", () => {
    const issues = findLocaleIssues(
      entry({
        data: {
          id: "x",
          prose: {
            en: { title: "T", summary: "S" },
            es: { title: "  ", summary: "S" },
          },
        },
      })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/prose\.es\.title.*blank/);
  });
});

describe("findIdMismatch", () => {
  it("returns null when data.id matches the file-derived Astro id", () => {
    expect(findIdMismatch(entry())).toBeNull();
  });

  it("flags a missing id field", () => {
    const issue = findIdMismatch(entry({ data: { prose: {} } }));
    expect(issue?.message).toMatch(/no `id` field/);
  });

  it("flags a diverged id — the T104 review case", () => {
    const issue = findIdMismatch(
      entry({
        relativePath: "wrong-filename.md",
        data: { id: "g3-tcase-chain-stretch", prose: {} },
      })
    );
    expect(issue).not.toBeNull();
    expect(issue?.expected).toBe("wrong-filename");
    expect(issue?.actual).toBe("g3-tcase-chain-stretch");
    expect(issue?.message).toMatch(/have diverged/);
  });
});

describe("auditEntries", () => {
  it("reports both locale and id issues across a mixed entry set", () => {
    const good = entry();
    const badLocale = entry({
      relativePath: "b.md",
      file: "src/content/problems/b.md",
      data: {
        id: "b",
        prose: { en: { title: "T", summary: "S" } },
      },
    });
    const badId = entry({
      relativePath: "wrong.md",
      file: "src/content/problems/wrong.md",
      data: { id: "right", prose: { en: {}, es: {} } },
    });
    const { localeIssues, idIssues } = auditEntries([good, badLocale, badId]);
    expect(localeIssues.length).toBeGreaterThan(0);
    expect(idIssues).toHaveLength(1);
    expect(idIssues[0]?.file).toBe("src/content/problems/wrong.md");
  });

  it("is clean for a well-formed, multi-collection entry set", () => {
    const { localeIssues, idIssues } = auditEntries([
      entry(),
      entry({
        collection: "parts",
        file: "src/content/parts/g3-part.md",
        relativePath: "g3-part.md",
        data: {
          id: "g3-part",
          prose: {
            en: { title: "Part", summary: "Summary" },
            es: { title: "Repuesto", summary: "Resumen" },
          },
        },
      }),
    ]);
    expect(localeIssues).toEqual([]);
    expect(idIssues).toEqual([]);
  });
});
