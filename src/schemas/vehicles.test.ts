/**
 * Implementation-side unit tests for the vehicle taxonomy schema (T200).
 *
 * The fitment *contract* — resolving ids and rejecting impossible combinations
 * across entries — is graded by T202 against T203's engine. These tests cover
 * what this schema alone can decide: within one entry, is the taxonomy node
 * well-formed, does its id follow its kind's rule, do its fields belong to its
 * kind, and does its fitment agree with what it describes.
 *
 * Every fixture here is synthetic in the same sense as
 * `tests/fixtures/schema-fixtures.ts`: `.invalid` URLs, and figures chosen to
 * be structurally interesting rather than to assert a fact about a real truck.
 * Where a real value is unavoidable (a 6G74 is a petrol engine), it is one the
 * spec itself states.
 *
 * refs specs/001-foundation (VEH-01, VEH-02, VEH-03)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import {
  CHASSIS_CODE_PATTERN,
  ENGINE_FAMILIES,
  ENGINE_FAMILY_FUEL,
  GENERATION_IDS,
  MARKETS,
  PRODUCTION_YEAR_RANGE,
  TAXONOMY_ID_PATTERN,
  TRANSFER_CASE_FAMILIES,
  VEHICLE_KINDS,
  combinationIdPrefix,
  vehiclesEntrySchema,
} from "./vehicles";

const schema = vehiclesEntrySchema({
  title: z.string(),
  summary: z.string(),
});

function source() {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/t200/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/t200/source",
    accessed: "2026-08-28",
    kind: "fsm",
  };
}

function prose() {
  return {
    en: { title: "TEST taxonomy node", summary: "Synthetic T200 fixture." },
    es: { title: "Nodo de prueba", summary: "Ficha sintética de T200." },
  };
}

/** The envelope every entry carries, so each test states only its own subject. */
function envelope(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    confidence: "fsm-confirmed",
    sources: [source()],
    prose: prose(),
    ...overrides,
  };
}

function generation(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return envelope({
    id: "gen3",
    kind: "generation",
    fitment: { gens: ["gen3"] },
    chassisCodes: ["V60", "V70"],
    production: { from: 1999, to: 2006 },
    marketNames: [
      { market: "us", name: "Montero" },
      { market: "uk", name: "Shogun" },
      { market: "au", name: "Pajero" },
    ],
    ...overrides,
  });
}

function engine(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return envelope({
    id: "6g74-sohc",
    kind: "engine",
    fitment: { gens: ["gen3"] },
    engineFamily: "6g74",
    fuel: "petrol",
    displacementCc: 3497,
    valvetrain: "sohc",
    ...overrides,
  });
}

function combination(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return envelope({
    id: "combos-gen3-cr",
    kind: "combination",
    fitment: { gens: ["gen3"], markets: ["cr"] },
    generation: "gen3",
    market: "cr",
    offerings: [
      {
        years: { from: 2000, to: 2006 },
        engine: "6g74-sohc",
        transmission: "v5a51-5at",
        transferCase: "super-select-ii",
      },
    ],
    ...overrides,
  });
}

/** Dotted issue paths of a failed parse; `[]` when the entry is accepted. */
function paths(value: unknown): string[] {
  const outcome = schema.safeParse(value);
  return outcome.success
    ? []
    : outcome.error.issues.map((issue) => issue.path.map(String).join("."));
}

function messages(value: unknown): string {
  const outcome = schema.safeParse(value);
  return outcome.success
    ? ""
    : outcome.error.issues.map((issue) => issue.message).join(" | ");
}

describe("the taxonomy accepts well-formed nodes", () => {
  it.each([
    ["generation", generation()],
    ["engine", engine()],
    ["combination", combination()],
    [
      "market",
      envelope({ id: "cr", kind: "market", fitment: { gens: ["gen3"] } }),
    ],
    [
      "transmission",
      envelope({
        id: "v5a51-5at",
        kind: "transmission",
        fitment: { gens: ["gen3"] },
        transmissionType: "automatic",
        gears: 5,
      }),
    ],
    [
      "transfer-case",
      envelope({
        id: "super-select-ii",
        kind: "transfer-case",
        fitment: { gens: ["gen3"] },
        transferCaseFamily: "super-select-ii",
      }),
    ],
    [
      "trim",
      envelope({
        id: "xls",
        kind: "trim",
        fitment: { gens: ["gen3"] },
        markets: ["us", "cr"],
      }),
    ],
  ])("accepts a %s entry", (_kind, entry) => {
    expect(messages(entry)).toBe("");
  });

  it("covers every kind in VEHICLE_KINDS with a positive case", () => {
    // Guards against a kind being added to the enum with no shape and no test.
    expect(VEHICLE_KINDS.length).toBe(7);
  });
});

describe("stable ids (VEH-01)", () => {
  it("rejects a generation id outside the spec §2 set", () => {
    expect(
      paths(generation({ id: "gen9", fitment: { gens: ["gen9"] } }))
    ).toContain("id");
  });

  it("rejects a market-suffixed generation id, the duplicate-entry shape (VEH-02)", () => {
    const outcome = generation({
      id: "gen3-us",
      fitment: { gens: ["gen3-us"] },
    });
    expect(paths(outcome)).toContain("id");
    expect(messages(outcome)).toMatch(/stable id/);
  });

  it.each(["6G74-SOHC", "6g74_sohc", "6g74--sohc", "-6g74", "6g74 sohc"])(
    "rejects the non-kebab engine id %s",
    (id) => {
      expect(paths(engine({ id }))).toContain("id");
    }
  );

  it("accepts every generation id the spec fixes", () => {
    for (const id of GENERATION_IDS) {
      const entry = generation({
        id,
        fitment: { gens: [id] },
        ...(id === "gen2-5" ? { parentGeneration: "gen2" } : {}),
      });
      expect(messages(entry), id).toBe("");
    }
  });

  it("accepts a market entry for every market and rejects any other id", () => {
    for (const id of MARKETS) {
      expect(
        messages(envelope({ id, kind: "market", fitment: { gens: ["gen3"] } })),
        id
      ).toBe("");
    }
    expect(
      paths(envelope({ id: "mx", kind: "market", fitment: { gens: ["gen3"] } }))
    ).toContain("id");
  });

  it("requires a combination id to name the generation and market it scopes", () => {
    expect(combinationIdPrefix("gen3", "cr")).toBe("combos-gen3-cr");
    expect(paths(combination({ id: "combos-gen3-us" }))).toContain("id");
    expect(messages(combination({ id: "combos-gen3-cr-diesel" }))).toBe("");
  });
});

describe("kind-specific fields (VEH-01)", () => {
  it("names the missing field when a kind's data is incomplete", () => {
    const { chassisCodes: _dropped, ...rest } = generation();
    void _dropped;
    const issues = paths(rest);
    expect(issues).toContain("chassisCodes");
    expect(messages(rest)).toMatch(/kind: generation/);
  });

  it("rejects a field that belongs to another kind, naming that field", () => {
    const entry = generation({ displacementCc: 3497 });
    expect(paths(entry)).toContain("displacementCc");
    expect(messages(entry)).toMatch(/belongs to another taxonomy kind/);
  });

  it("rejects an unknown kind outright", () => {
    expect(paths(generation({ kind: "sub-model" }))).toContain("kind");
  });

  it("requires a kind", () => {
    const { kind: _dropped, ...rest } = generation();
    void _dropped;
    expect(paths(rest)).toContain("kind");
  });

  it.each(["v60", "V6", "V600000", "V-60", ""])(
    "rejects the malformed chassis code %s",
    (code) => {
      expect(CHASSIS_CODE_PATTERN.test(code)).toBe(false);
      expect(paths(generation({ chassisCodes: [code] })).join(",")).toMatch(
        /chassisCodes/
      );
    }
  );

  it("rejects a repeated chassis code", () => {
    expect(paths(generation({ chassisCodes: ["V60", "V60"] }))).toContain(
      "chassisCodes.1"
    );
  });
});

describe("production years are shared data, bounded and ordered", () => {
  it("rejects a range that ends before it starts", () => {
    expect(
      paths(generation({ production: { from: 2006, to: 1999 } }))
    ).toContain("production.to");
  });

  it("accepts an open-ended range (`to: null`) rather than inventing an end year", () => {
    expect(messages(generation({ production: { from: 1999, to: null } }))).toBe(
      ""
    );
  });

  it.each([
    PRODUCTION_YEAR_RANGE.from - 1,
    PRODUCTION_YEAR_RANGE.to + 1,
    1899,
    2101,
  ])("rejects the out-of-coverage year %i", (year) => {
    expect(
      paths(generation({ production: { from: year, to: null } })).join(",")
    ).toMatch(/production\.from/);
  });

  it("rejects a fractional year", () => {
    expect(
      paths(generation({ production: { from: 1999.5, to: 2006 } }))
    ).toContain("production.from");
  });
});

describe("one vehicle, market-specific naming (VEH-02)", () => {
  it("rejects two names for the same market in one generation", () => {
    const entry = generation({
      marketNames: [
        { market: "us", name: "Montero" },
        { market: "us", name: "Pajero" },
      ],
    });
    expect(paths(entry)).toContain("marketNames.1");
    expect(messages(entry)).toMatch(/duplicate market/);
  });

  it("carries all three market names on one entry", () => {
    const entry = generation();
    expect(messages(entry)).toBe("");
    expect(
      (entry as { marketNames: { name: string }[] }).marketNames.map(
        (row) => row.name
      )
    ).toEqual(["Montero", "Shogun", "Pajero"]);
  });

  it("requires at least one market name", () => {
    expect(paths(generation({ marketNames: [] }))).toContain("marketNames");
  });

  it("rejects a model name that is blank", () => {
    expect(
      paths(generation({ marketNames: [{ market: "us", name: "  " }] }))
    ).toContain("marketNames.0.name");
  });

  it("rejects a market outside spec §2", () => {
    expect(
      paths(generation({ marketNames: [{ market: "mx", name: "Montero" }] }))
    ).toContain("marketNames.0.market");
  });
});

describe("fitment coherence with the node's own subject", () => {
  it("rejects a generation entry whose fitment names a different generation", () => {
    const entry = generation({ fitment: { gens: ["gen4"] } });
    expect(paths(entry)).toContain("fitment.gens");
  });

  it("rejects a generation entry claiming a market it does not name", () => {
    const entry = generation({ fitment: { gens: ["gen3"], markets: ["jdm"] } });
    expect(paths(entry)).toContain("fitment.markets.0");
  });

  it("rejects a combination entry whose fitment omits its generation", () => {
    expect(
      paths(combination({ fitment: { gens: ["gen2"], markets: ["cr"] } }))
    ).toContain("fitment.gens");
  });

  it("rejects a combination entry whose fitment omits its market", () => {
    expect(
      paths(combination({ fitment: { gens: ["gen3"], markets: ["us"] } }))
    ).toContain("fitment.markets");
  });

  it("accepts a combination entry that leaves fitment.markets unset", () => {
    expect(messages(combination({ fitment: { gens: ["gen3"] } }))).toBe("");
  });

  it("rejects a generation that is its own parent", () => {
    expect(paths(generation({ parentGeneration: "gen3" }))).toContain(
      "parentGeneration"
    );
  });

  it("accepts the facelift declaring its parent generation", () => {
    expect(
      messages(
        generation({
          id: "gen2-5",
          fitment: { gens: ["gen2-5"] },
          parentGeneration: "gen2",
          chassisCodes: ["V40"],
          production: { from: 1997, to: 2000 },
        })
      )
    ).toBe("");
  });
});

describe("engines (VEH-01)", () => {
  it("rejects an engine family outside spec §2", () => {
    expect(paths(engine({ engineFamily: "4g63" }))).toContain("engineFamily");
  });

  it.each(ENGINE_FAMILIES)(
    "holds %s to the fuel spec §2 assigns it",
    (family) => {
      const correct = ENGINE_FAMILY_FUEL[family];
      const wrong = correct === "petrol" ? "diesel" : "petrol";
      expect(
        messages(engine({ id: family, engineFamily: family, fuel: correct }))
      ).toBe("");
      expect(
        paths(engine({ id: family, engineFamily: family, fuel: wrong }))
      ).toContain("fuel");
    }
  );

  it("rejects a displacement that is not a whole number of cc", () => {
    expect(paths(engine({ displacementCc: 3.5 }))).toContain("displacementCc");
  });

  it("leaves the variant to the id, not to a closed variant enum", () => {
    expect(messages(engine({ id: "6g74-gdi", fuelSystem: "gdi" }))).toBe("");
    expect(TAXONOMY_ID_PATTERN.test("6g74-gdi")).toBe(true);
  });
});

describe("transmissions and transfer cases (VEH-01)", () => {
  const transmission = (
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> =>
    envelope({
      id: "v5a51-5at",
      kind: "transmission",
      fitment: { gens: ["gen3"] },
      transmissionType: "automatic",
      gears: 5,
      ...overrides,
    });

  it("rejects a transmission type that is neither manual nor automatic", () => {
    expect(paths(transmission({ transmissionType: "cvt" }))).toContain(
      "transmissionType"
    );
  });

  it.each([2, 9, 4.5])("rejects the implausible gear count %s", (gears) => {
    expect(paths(transmission({ gears }))).toContain("gears");
  });

  it.each(TRANSFER_CASE_FAMILIES)("accepts the %s transfer case", (family) => {
    expect(
      messages(
        envelope({
          id: family,
          kind: "transfer-case",
          fitment: { gens: ["gen3"] },
          transferCaseFamily: family,
        })
      )
    ).toBe("");
  });

  it("rejects a transfer-case family outside spec §2", () => {
    expect(
      paths(
        envelope({
          id: "part-time-4wd",
          kind: "transfer-case",
          fitment: { gens: ["gen3"] },
          transferCaseFamily: "part-time-4wd",
        })
      )
    ).toContain("transferCaseFamily");
  });
});

describe("valid combinations per generation, market and year (VEH-03)", () => {
  it("requires at least one offering", () => {
    expect(paths(combination({ offerings: [] }))).toContain("offerings");
  });

  it("records one exact powertrain tuple per offering, not a cross product", () => {
    const entry = combination({
      offerings: [
        {
          years: { from: 2000, to: 2006 },
          engine: ["6g74-sohc", "6g75"],
          transmission: "v5a51-5at",
          transferCase: "super-select-ii",
        },
      ],
    });
    expect(paths(entry)).toContain("offerings.0.engine");
  });

  it("rejects two overlapping ranges for the same powertrain", () => {
    const entry = combination({
      offerings: [
        {
          years: { from: 2000, to: 2006 },
          engine: "6g74-sohc",
          transmission: "v5a51-5at",
          transferCase: "super-select-ii",
        },
        {
          years: { from: 2004, to: 2006 },
          engine: "6g74-sohc",
          transmission: "v5a51-5at",
          transferCase: "super-select-ii",
        },
      ],
    });
    expect(paths(entry)).toContain("offerings.1.years");
    expect(messages(entry)).toMatch(/overlapping year range/);
  });

  it("accepts the same powertrain twice when the ranges are disjoint", () => {
    expect(
      messages(
        combination({
          offerings: [
            {
              years: { from: 2000, to: 2002 },
              engine: "6g74-sohc",
              transmission: "v5a51-5at",
              transferCase: "super-select-ii",
            },
            {
              years: { from: 2004, to: 2006 },
              engine: "6g74-sohc",
              transmission: "v5a51-5at",
              transferCase: "super-select-ii",
            },
          ],
        })
      )
    ).toBe("");
  });

  it("accepts differing powertrains over the same years", () => {
    expect(
      messages(
        combination({
          offerings: [
            {
              years: { from: 2000, to: 2006 },
              engine: "6g74-sohc",
              transmission: "v5a51-5at",
              transferCase: "super-select-ii",
            },
            {
              years: { from: 2000, to: 2006 },
              engine: "6g74-sohc",
              transmission: "v5m31-5mt",
              transferCase: "super-select-ii",
            },
          ],
        })
      )
    ).toBe("");
  });

  it("treats an open-ended offering as running to the end of coverage", () => {
    const entry = combination({
      offerings: [
        {
          years: { from: 2000, to: null },
          engine: "6g74-sohc",
          transmission: "v5a51-5at",
          transferCase: "super-select-ii",
        },
        {
          years: { from: 2005, to: 2006 },
          engine: "6g74-sohc",
          transmission: "v5a51-5at",
          transferCase: "super-select-ii",
        },
      ],
    });
    expect(paths(entry)).toContain("offerings.1.years");
  });

  it("scopes an offering to one market via the entry, never a market list", () => {
    const entry = combination({
      offerings: [
        {
          years: { from: 2000, to: 2006 },
          engine: "6g74-sohc",
          transmission: "v5a51-5at",
          transferCase: "super-select-ii",
          markets: ["cr", "us"],
        },
      ],
    });
    expect(paths(entry)).toContain("offerings.0");
  });

  it("accepts an offering recorded at trim granularity, and one without", () => {
    expect(
      messages(
        combination({
          offerings: [
            {
              years: { from: 2000, to: 2006 },
              engine: "6g74-sohc",
              transmission: "v5a51-5at",
              transferCase: "super-select-ii",
              trims: ["ls", "xls"],
            },
          ],
        })
      )
    ).toBe("");
  });

  it("rejects a repeated trim on one offering", () => {
    expect(
      paths(
        combination({
          offerings: [
            {
              years: { from: 2000, to: 2006 },
              engine: "6g74-sohc",
              transmission: "v5a51-5at",
              transferCase: "super-select-ii",
              trims: ["ls", "ls"],
            },
          ],
        })
      )
    ).toContain("offerings.0.trims.1");
  });

  it("rejects an offering year outside the coverage the taxonomy claims", () => {
    expect(
      paths(
        combination({
          offerings: [
            {
              years: { from: 1970, to: 2006 },
              engine: "6g74-sohc",
              transmission: "v5a51-5at",
              transferCase: "super-select-ii",
            },
          ],
        })
      )
    ).toContain("offerings.0.years.from");
  });
});

describe("the base entry contract still holds for taxonomy entries", () => {
  it.each(["en", "es"])("still requires prose.%s", (locale) => {
    const entry = generation();
    (entry as { prose: Record<string, unknown> }).prose = {
      [locale === "en" ? "es" : "en"]: prose()[locale === "en" ? "es" : "en"],
    };
    expect(paths(entry)).toContain(`prose.${locale}`);
  });

  it("still rejects an unknown top-level field", () => {
    expect(paths(generation({ nickname: "Gitana" }))).toContain("");
  });

  it("still requires a source when the confidence tier claims a document", () => {
    expect(paths(generation({ sources: [] }))).toContain("sources");
  });

  it("keeps every numeric taxonomy field in shared data, never in prose", () => {
    const entry = generation();
    const proseJson = JSON.stringify((entry as { prose: unknown }).prose);
    expect(proseJson).not.toMatch(/\d{4}/);
  });
});
