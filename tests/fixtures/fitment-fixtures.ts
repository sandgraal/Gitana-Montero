/**
 * Fixtures for the T202 fitment-engine graders.
 *
 * Two kinds of input, deliberately kept apart:
 *
 * 1. **The real, merged taxonomy** (`readVehicleEntries`) — T201's 46 entries,
 *    read off disk. Ground truth for resolution and for the boundary-year
 *    tables: a grader that asserts "1999 is in both Gen 2.5 and Gen 3" is only
 *    worth anything if it reads the same `production` ranges the site does.
 * 2. **A synthetic taxonomy** (`makeSyntheticTaxonomyEntries`) — the *only*
 *    place VEH-03's `coverage: "complete"` is exercised, because every real
 *    combination entry today is honestly `partial` and none of them may be
 *    edited to make a grader convenient. Its powertrain ids are invented
 *    (`test-engine-alpha`, `test-gearbox-beta`, …) so nothing in these tests
 *    can be misread as a claim about a real Montero, and so no fixture id can
 *    leak into content. Generation and market ids must come from the closed
 *    `GENERATION_IDS` / `MARKETS` enums — there is no synthetic spelling of
 *    those — which is why the synthetic entries reuse `gen2`/`gen3`/`us`/`cr`.
 *
 * Everything synthetic here is *schema-valid*: the fixture-integrity graders
 * parse each entry against the real `vehiclesEntrySchema`. If a fixture ever
 * stops being a legal taxonomy entry, that shows up as its own red test rather
 * than as a resolver grader failing for an unrelated reason.
 *
 * Other conventions inherited from `tests/fixtures/schema-fixtures.ts`: fake
 * URLs use the reserved `.invalid` TLD (RFC 2606), entry ids are prefixed so
 * they cannot collide with real content, and ES prose uses the `usted`
 * register.
 *
 * refs specs/001-foundation (FIT-01, FIT-02, FIT-04, VEH-03)
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT_ROOT = fileURLToPath(
  new URL("../../src/content/", import.meta.url)
);

/* -------------------------------------------------------------------------
 * Reading the real, merged content
 * ---------------------------------------------------------------------- */

/** A parsed content entry, kept structural: the graders only read `id`/`fitment`. */
export interface ContentEntry {
  readonly id: string;
  readonly kind?: string;
  readonly fitment?: Record<string, unknown>;
  readonly [field: string]: unknown;
}

function readJsonEntries(collection: string): ContentEntry[] {
  const dir = path.join(CONTENT_ROOT, collection);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map(
      (file) =>
        JSON.parse(readFileSync(path.join(dir, file), "utf8")) as ContentEntry
    );
}

/**
 * T201's merged `vehicles` collection, in filename order.
 *
 * Read from disk rather than through `astro:content` so the graders describe
 * the data and not Astro's loader: the resolver's input is entry objects, and
 * T203 must be free to change how the build gets hold of them.
 */
export function readVehicleEntries(): ContentEntry[] {
  return readJsonEntries("vehicles");
}

/** Every JSON entry in every collection — everything that declares a fitment. */
export function readAllContentEntries(): ContentEntry[] {
  return readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort()
    .flatMap((collection) => readJsonEntries(collection));
}

/**
 * A deterministic shuffle, so "the answer does not depend on entry order"
 * (FIT-04) is gradeable without introducing randomness into the suite: a
 * flaky grader is worse than no grader.
 */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    // xorshift32 — small, stable, and no dependency.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const j = state % (i + 1);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/* -------------------------------------------------------------------------
 * Synthetic entries
 * ---------------------------------------------------------------------- */

function source() {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/t202-fitment/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/t202-fitment/source",
    accessed: "2026-08-30",
    kind: "reference",
  };
}

function prose(label: string) {
  return {
    en: {
      title: `TEST ${label}`,
      summary: "Synthetic taxonomy node used by the T202 fitment graders.",
    },
    es: {
      title: `TEST ${label}`,
      summary: "Nodo sintético que usan los verificadores de fitment de T202.",
    },
  };
}

function node(
  id: string,
  kind: string,
  fitment: Record<string, unknown>,
  data: Record<string, unknown>
): ContentEntry {
  return {
    id,
    kind,
    fitment,
    ...data,
    confidence: "community-consensus",
    sources: [source()],
    prose: prose(`${kind} ${id}`),
  };
}

/**
 * The ids the synthetic taxonomy uses, exported so graders name them once.
 * Powertrain ids are invented; generation and market ids cannot be.
 */
export const SYNTHETIC = {
  engineListed: "test-engine-alpha",
  engineLateOnly: "test-engine-beta",
  gearboxListed: "test-gearbox-alpha",
  gearboxUnlisted: "test-gearbox-beta",
  transferCase: "test-tcase-alpha",
  trimListed: "test-trim-alpha",
  trimUnlisted: "test-trim-beta",
} as const;

/**
 * A small taxonomy whose only job is to make VEH-03's four rules gradeable:
 *
 * | scope          | coverage   | what it proves                          |
 * |----------------|------------|-----------------------------------------|
 * | `gen3` × `us`  | `complete` | rules 1 and 4 (closed offering list)     |
 * | `gen3` × `cr`  | `partial`  | rule 2 (absent means unknown)            |
 * | `gen2` × any   | *no entry* | rule 3 (unwritten scope is not a denial) |
 *
 * Inside the complete entry, offering A lists `trims` and offering B omits
 * them, which is what makes rule 4's "unaffected by `coverage`" separable from
 * rule 1.
 */
export function makeSyntheticTaxonomyEntries(): ContentEntry[] {
  return [
    node(
      "gen2",
      "generation",
      { gens: ["gen2"], markets: ["us", "cr"] },
      {
        chassisCodes: ["V20"],
        production: { from: 1991, to: 1999 },
        marketNames: [
          { market: "us", name: "Montero" },
          { market: "cr", name: "Montero" },
        ],
      }
    ),
    node(
      "gen2-5",
      "generation",
      { gens: ["gen2-5"], markets: ["us", "cr"] },
      {
        parentGeneration: "gen2",
        chassisCodes: ["V40"],
        production: { from: 1997, to: 1999 },
        marketNames: [
          { market: "us", name: "Montero" },
          { market: "cr", name: "Montero" },
        ],
      }
    ),
    node(
      "gen3",
      "generation",
      { gens: ["gen3"], markets: ["us", "cr"] },
      {
        chassisCodes: ["V60"],
        production: { from: 1999, to: 2006 },
        marketNames: [
          { market: "us", name: "Montero" },
          { market: "cr", name: "Montero" },
        ],
      }
    ),
    node(
      "us",
      "market",
      { gens: ["gen2", "gen2-5", "gen3"], markets: ["us"] },
      {}
    ),
    node(
      "cr",
      "market",
      { gens: ["gen2", "gen2-5", "gen3"], markets: ["cr"] },
      {}
    ),
    node(
      SYNTHETIC.engineListed,
      "engine",
      { gens: ["gen3"] },
      { engineFamily: "6g72", fuel: "petrol", displacementCc: 2972 }
    ),
    node(
      SYNTHETIC.engineLateOnly,
      "engine",
      { gens: ["gen3"] },
      { engineFamily: "6g74", fuel: "petrol", displacementCc: 3497 }
    ),
    node(
      SYNTHETIC.gearboxListed,
      "transmission",
      { gens: ["gen3"] },
      { transmissionType: "automatic", gears: 4 }
    ),
    node(
      SYNTHETIC.gearboxUnlisted,
      "transmission",
      { gens: ["gen3"] },
      { transmissionType: "manual", gears: 5 }
    ),
    node(
      SYNTHETIC.transferCase,
      "transfer-case",
      { gens: ["gen3"] },
      { transferCaseFamily: "easy-select" }
    ),
    node(
      SYNTHETIC.trimListed,
      "trim",
      { gens: ["gen3"], markets: ["us"] },
      { markets: ["us"] }
    ),
    node(
      SYNTHETIC.trimUnlisted,
      "trim",
      { gens: ["gen3"], markets: ["us"] },
      { markets: ["us"] }
    ),
    node(
      "combos-gen3-us",
      "combination",
      { gens: ["gen3"], markets: ["us"] },
      {
        generation: "gen3",
        market: "us",
        coverage: "complete",
        offerings: [
          {
            years: { from: 2001, to: 2006 },
            engine: SYNTHETIC.engineListed,
            transmission: SYNTHETIC.gearboxListed,
            transferCase: SYNTHETIC.transferCase,
            trims: [SYNTHETIC.trimListed],
          },
          {
            years: { from: 2003, to: 2006 },
            engine: SYNTHETIC.engineLateOnly,
            transmission: SYNTHETIC.gearboxListed,
            transferCase: SYNTHETIC.transferCase,
          },
        ],
      }
    ),
    node(
      "combos-gen3-cr",
      "combination",
      { gens: ["gen3"], markets: ["cr"] },
      {
        generation: "gen3",
        market: "cr",
        coverage: "partial",
        offerings: [
          {
            years: { from: 2001, to: 2006 },
            engine: SYNTHETIC.engineListed,
            transmission: SYNTHETIC.gearboxListed,
            transferCase: SYNTHETIC.transferCase,
          },
        ],
      }
    ),
  ];
}

/**
 * A non-taxonomy content entry declaring `fitment` — what FIT-02 is actually
 * about ("WHEN an entry declares a fitment"). Ids are prefixed `test-fitment-`
 * so they cannot collide with the `g{gen}-{system}-{slug}` convention.
 */
export function makeFitmentEntry(
  fitment: Record<string, unknown>,
  id = "test-fitment-alpha"
): ContentEntry {
  return {
    id,
    fitment,
    confidence: "community-consensus",
    sources: [source()],
    prose: prose("fitment entry"),
  };
}
