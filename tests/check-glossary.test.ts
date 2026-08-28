/**
 * Graders — `check:glossary`, the documented T205 stub.
 *
 * refs specs/001-foundation (SCF-02, GLO-01, GLO-02, GLO-04)
 */
import { describe, expect, it } from "vitest";
import { findPrematureGlossaryEntries } from "../scripts/check-glossary.mjs";

interface Entry {
  collection: string;
  file: string;
}

describe("findPrematureGlossaryEntries", () => {
  it("is clean when no glossary entries exist", () => {
    expect(
      findPrematureGlossaryEntries([
        { collection: "problems", file: "src/content/problems/x.md" },
      ] as Entry[])
    ).toEqual([]);
  });

  it("flags any glossary entry as premature, naming the file", () => {
    const problems = findPrematureGlossaryEntries([
      { collection: "glossary", file: "src/content/glossary/repuestos.md" },
    ] as Entry[]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/src\/content\/glossary\/repuestos\.md/);
    expect(problems[0]).toMatch(/T205/);
  });
});
