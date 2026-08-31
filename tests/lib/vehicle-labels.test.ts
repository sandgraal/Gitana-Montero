/**
 * How a vehicle's shared `data` is written out (T204).
 *
 * The rule being graded is AGENTS.md's, not a formatting preference: a figure
 * is stored once and rendered into both locales. So the same
 * `displacementCc: 3497` has to produce `3.5 L` for an English reader and
 * `3,5 L` for a Costa Rican one, from one number, with no second copy
 * anywhere.
 *
 * refs specs/001-foundation (FIT-03), specs/001-foundation/design/HANDOFF-DESIGN.md
 */
import { describe, expect, it } from "vitest";

import {
  chassisLabel,
  displacementLabel,
  engineLabel,
  engineShortLabel,
  productionLabel,
  vehicleChipLabel,
} from "../../src/lib/vehicle-labels.ts";
import type {
  EngineOption,
  GenerationOption,
} from "../../src/lib/vehicle-options.ts";

const engine = (overrides: Partial<EngineOption> = {}): EngineOption => ({
  id: "6g74-sohc",
  engineFamily: "6g74",
  displacementCc: 3497,
  valvetrain: "sohc",
  fuelSystem: "mpi",
  fitment: { gens: ["gen3"] },
  ...overrides,
});

const gen3: GenerationOption = {
  id: "gen3",
  chassisCodes: ["V60", "V70", "V73W", "V75W"],
  production: { from: 1999, to: 2006 },
  markets: [{ id: "us", name: "Montero" }],
};

describe("displacementLabel", () => {
  it("renders one stored figure in each locale's own number format", () => {
    expect(displacementLabel(3497, "en")).toBe("3.5L");
    // CLDR abbreviates the litre lowercase in Spanish and uppercase in English.
    // Taken from `Intl` rather than written down, which is the point.
    expect(displacementLabel(3497, "es-CR")).toBe("3,5l");
  });
});

describe("engineShortLabel", () => {
  it("names the family and the head", () => {
    expect(engineShortLabel(engine())).toBe("6G74 SOHC");
  });

  it("adds the factory designation that separates two identical engines", () => {
    // `6g74-dohc` and `6g74-gdi` are the same family, head and displacement.
    // GDI is Mitsubishi's own name for the difference, so it is in the label.
    expect(
      engineShortLabel(
        engine({ id: "6g74-gdi", valvetrain: "dohc", fuelSystem: "gdi" })
      )
    ).toBe("6G74 DOHC GDI");
    expect(
      engineShortLabel(engine({ id: "6g74-dohc", valvetrain: "dohc" }))
    ).toBe("6G74 DOHC");
  });

  it("leaves generic fuel-system descriptions out of the name", () => {
    // "MPI" and "indirect injection" describe the engine; they do not name it.
    expect(engineShortLabel(engine({ fuelSystem: "mpi" }))).toBe("6G74 SOHC");
    expect(engineShortLabel(engine({ fuelSystem: "indirect-injection" }))).toBe(
      "6G74 SOHC"
    );
  });

  it("copes with an engine that records no valvetrain", () => {
    const bare = engine({ id: "4g54", engineFamily: "4g54" });
    delete (bare as { valvetrain?: string }).valvetrain;
    expect(engineShortLabel(bare)).toBe("4G54");
  });
});

describe("engineLabel", () => {
  it("is the short name plus the displacement", () => {
    expect(engineLabel(engine(), "en")).toBe("6G74 SOHC · 3.5L");
    expect(engineLabel(engine(), "es-CR")).toBe("6G74 SOHC · 3,5l");
  });
});

describe("chassisLabel", () => {
  it("shows the two family codes, not the whole list", () => {
    expect(chassisLabel(gen3)).toBe("V60/V70");
  });
});

describe("productionLabel", () => {
  it("uses an en dash and never invents an end year", () => {
    expect(productionLabel(gen3)).toBe("1999–2006");
    expect(
      productionLabel({ ...gen3, production: { from: 2006, to: null } })
    ).toBe("2006–");
  });
});

describe("vehicleChipLabel", () => {
  it("reads as the artboard's chip", () => {
    expect(
      vehicleChipLabel({
        generationLabel: "Gen 3",
        market: "us",
        year: 2002,
        engine: engine(),
      })
    ).toBe("Gen 3 · US · 2002 · 6G74 SOHC");
  });

  it("appends the drive only when the reader named one", () => {
    expect(
      vehicleChipLabel({
        generationLabel: "Gen 3",
        market: "us",
        year: 2002,
        engine: engine(),
        drive: "4wd",
      })
    ).toBe("Gen 3 · US · 2002 · 6G74 SOHC · 4WD");
  });

  it("translates only the generation word — the rest is data", () => {
    expect(
      vehicleChipLabel({
        generationLabel: "Generación 3",
        market: "us",
        year: 2002,
        engine: engine(),
      })
    ).toBe("Generación 3 · US · 2002 · 6G74 SOHC");
  });

  it("still reads if the engine has gone missing from the payload", () => {
    expect(
      vehicleChipLabel({
        generationLabel: "Gen 3",
        market: "us",
        year: 2002,
        engine: null,
      })
    ).toBe("Gen 3 · US · 2002");
  });
});
