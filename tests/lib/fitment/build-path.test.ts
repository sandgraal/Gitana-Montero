/**
 * Graders — FIT-02's *build path*, not just its logic.
 *
 * > **FIT-02** WHEN an entry declares a fitment, **THE build SHALL** resolve
 * > it against the taxonomy and fail on any reference to a nonexistent ID or
 * > an impossible combination (per VEH-03).
 *
 * `tests/lib/fitment/validation.test.ts` grades what `validateEntryFitments`
 * and `assertFitmentsResolve` *answer*. This file grades the thing that makes
 * those answers matter: that the build feeds them the whole corpus. The check
 * is wired in `astro.config.mjs` → `src/integrations/validate-fitments.ts` →
 * `astro:build:start`, and the input it uses comes from
 * `src/lib/fitment/content.ts`.
 *
 * The failure this guards against is a check that quietly stops covering
 * things: a loader that skipped a collection, or that drifted from
 * `src/content.config.ts`'s glob, would leave `npm run build` green while a
 * whole directory of entries went unresolved. So the loader is graded against
 * an independently-written reader — T202's `readAllContentEntries`, which
 * walks the same tree by its own code — rather than against itself.
 *
 * ## The mutation this file has to survive (T203 review, F1)
 *
 * The reviewer deleted `integrations: [validateFitments]` from
 * `astro.config.mjs` and every test stayed green while a bogus-fitment build
 * exited 0 — the wiring was a claim no grader made. Two describe blocks below
 * close that hole from both ends, and neither is redundant:
 *
 * - **"the wiring is present in astro.config.mjs"** reads the real config and
 *   asserts the integration and its hook exist. This is the block that reddens
 *   under the reviewer's exact mutation.
 * - **"running the hook the way Astro runs it"** calls `runFitmentBuildCheck`
 *   over a deliberately broken corpus. Asserting the config *mentions* an
 *   integration proves nothing about what it does when invoked, and this is
 *   also the only coverage `withFileIndex` — the id → file mapping SCF-04 asks
 *   for — ever gets.
 *
 * refs specs/001-foundation (FIT-01, FIT-02, SCF-04)
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AstroIntegration } from "astro";
import {
  FitmentResolutionError,
  assertFitmentsResolve,
  buildTaxonomy,
  validateEntryFitments,
} from "../../../src/lib/fitment/index.ts";
import { loadContent } from "../../../src/lib/fitment/content.ts";
import { runFitmentBuildCheck } from "../../../src/integrations/validate-fitments.ts";
import astroConfig from "../../../astro.config.mjs";
import {
  makeFitmentEntry,
  readAllContentEntries,
  readVehicleEntries,
} from "../../fixtures/fitment-fixtures.ts";

const ids = (entries: readonly { id?: unknown }[]): string[] =>
  entries.map((entry) => String(entry.id)).sort();

describe("the build sees every entry the site ships (FIT-02)", () => {
  it("loads exactly the corpus the independent fixture reader finds", async () => {
    const { entries } = await loadContent();

    expect(ids(entries.map((entry) => entry.data as { id?: unknown }))).toEqual(
      ids(readAllContentEntries())
    );
  });

  it("loads exactly the `vehicles` collection as the taxonomy", async () => {
    const { taxonomyEntries } = await loadContent();

    expect(ids(taxonomyEntries as { id?: unknown }[])).toEqual(
      ids(readVehicleEntries())
    );
  });

  it("names the file each entry came from, for SCF-04", async () => {
    const { entries } = await loadContent();
    const gen3 = entries.find(
      (entry) => (entry.data as { id?: unknown }).id === "gen3"
    );

    expect(gen3?.file).toBe("src/content/vehicles/gen3.json");
    expect(
      entries.every((entry) => entry.file.startsWith("src/content/"))
    ).toBe(true);
  });

  it("covers more than the taxonomy — the entries FIT-02 is written for", async () => {
    const { entries, taxonomyEntries } = await loadContent();

    expect(entries.length).toBeGreaterThan(taxonomyEntries.length);
  });
});

describe("what the integration actually runs (FIT-02)", () => {
  it("passes on today's content, exactly as `astro:build:start` calls it", async () => {
    const { entries, taxonomyEntries } = await loadContent();
    const taxonomy = buildTaxonomy(taxonomyEntries);

    expect(() =>
      assertFitmentsResolve(
        entries.map((entry) => entry.data),
        taxonomy
      )
    ).not.toThrow();
  });

  it("throws the moment a bogus entry joins that same corpus", async () => {
    // The pair that makes the control above meaningful — same call shape, one
    // extra entry. Without this, "the build passes" could mean "the build
    // checks nothing".
    const { entries, taxonomyEntries } = await loadContent();
    const corpus = [
      ...entries.map((entry) => entry.data),
      makeFitmentEntry({ gens: ["gen9"] }, "test-fitment-intruder"),
    ];

    expect(() =>
      assertFitmentsResolve(corpus, buildTaxonomy(taxonomyEntries))
    ).toThrow(/test-fitment-intruder/);
  });
});

describe("the thrown error carries its issues (SCF-04)", () => {
  it("exposes the structured issue list, not just a message", () => {
    // The build integration adds the *file* each failing id came from, which
    // only it knows. It matches on these ids by equality; an earlier draft
    // grepped the rendered message instead and matched the market entry `me`
    // inside the word "names".
    const taxonomy = buildTaxonomy(readVehicleEntries());
    const bad = makeFitmentEntry({ gens: ["gen9"] }, "test-fitment-bogus");

    let thrown: unknown;
    try {
      assertFitmentsResolve([bad], taxonomy);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FitmentResolutionError);
    expect((thrown as FitmentResolutionError).issues).toEqual(
      validateEntryFitments([bad], taxonomy)
    );
    expect(
      (thrown as FitmentResolutionError).issues.map((issue) => issue.entryId)
    ).toEqual(["test-fitment-bogus"]);
  });
});

/* -------------------------------------------------------------------------
 * The wiring itself (T203 review, F1)
 * ---------------------------------------------------------------------- */

/**
 * Astro's `integrations` option accepts nested arrays and falsy entries, so a
 * config may legally write `[a, cond && b, [c, d]]`. Flattened here rather than
 * indexed positionally: an assertion that read `integrations[0]` would start
 * failing the day someone adds an unrelated integration above this one, which
 * is a false alarm, while `.flat()` alone would still trip over `false`.
 */
function declaredIntegrations(value: unknown): AstroIntegration[] {
  if (Array.isArray(value)) return value.flatMap(declaredIntegrations);
  return typeof value === "object" && value !== null && "name" in value
    ? [value as AstroIntegration]
    : [];
}

describe("the wiring is present in astro.config.mjs (FIT-02)", () => {
  const integrations = declaredIntegrations(astroConfig.integrations);

  it("registers an integration named `montero:validate-fitments`", () => {
    // Deleting `integrations: [validateFitments]` from the config is exactly
    // the mutation the T203 review performed, and it left 1095 tests green
    // while a bogus-fitment build exited 0. This assertion is what reddens.
    expect(integrations.map((integration) => integration.name)).toContain(
      "montero:validate-fitments"
    );
  });

  it("hangs that integration off `astro:build:start`", () => {
    // The hook name is load-bearing, not decoration: an integration registered
    // under a hook Astro never fires during `astro build` is the same silent
    // no-op as no integration at all.
    const wiring = integrations.find(
      (integration) => integration.name === "montero:validate-fitments"
    );

    expect(wiring).toBeDefined();
    expect(typeof wiring?.hooks["astro:build:start"]).toBe("function");
  });

  it("does not run in `astro dev` — a broken page, not a dead dev server", () => {
    // Deliberate, and stated in the config: an author mid-edit should still be
    // able to look at the site. If a future change adds a dev-server hook, it
    // should be a decision someone makes, not a side effect.
    const wiring = integrations.find(
      (integration) => integration.name === "montero:validate-fitments"
    );

    expect(Object.keys(wiring?.hooks ?? {})).toEqual(["astro:build:start"]);
  });
});

describe("running the hook the way Astro runs it (FIT-02, SCF-04)", () => {
  /** Captures what the integration reports on a clean build. */
  const stubLogger = () => {
    const info: string[] = [];
    return {
      info: (message: string) => void info.push(message),
      messages: info,
    };
  };

  const roots: string[] = [];

  /**
   * A miniature `src/content/` tree. Entries are written straight to disk
   * because that is what the build actually reads — a stubbed loader would
   * grade the stub, and the loader is half of what F1 says was untested.
   */
  function makeContentRoot(fitment: Record<string, unknown>): string {
    const root = mkdtempSync(path.join(tmpdir(), "t203-content-"));
    roots.push(root);

    mkdirSync(path.join(root, "vehicles"), { recursive: true });
    mkdirSync(path.join(root, "problems"), { recursive: true });

    writeFileSync(
      path.join(root, "vehicles", "gen3.json"),
      JSON.stringify({
        id: "gen3",
        kind: "generation",
        fitment: { gens: ["gen3"] },
        production: { from: 1999, to: 2006 },
      })
    );
    writeFileSync(
      path.join(root, "problems", "under-test.json"),
      JSON.stringify({ id: "test-build-path-entry", fitment })
    );

    return root;
  }

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("returns quietly and reports its counts on a resolvable corpus", async () => {
    const logger = stubLogger();

    await runFitmentBuildCheck({ logger }, makeContentRoot({ gens: ["gen3"] }));

    expect(logger.messages.join("\n")).toContain("2 fitments resolve against");
  });

  it("throws on a corpus with a nonexistent id", async () => {
    await expect(
      runFitmentBuildCheck(
        { logger: stubLogger() },
        makeContentRoot({ gens: ["gen9"] })
      )
    ).rejects.toThrow(/gen9/);
  });

  it("names the entry AND the file it came from (SCF-04)", async () => {
    // `withFileIndex`'s only coverage. The resolver knows the entry id; only
    // the build caller knows which file that id was read out of, and SCF-04
    // asks for the file.
    await expect(
      runFitmentBuildCheck(
        { logger: stubLogger() },
        makeContentRoot({ gens: ["gen9"] })
      )
    ).rejects.toThrow(/src\/content\/problems\/under-test\.json/);

    await expect(
      runFitmentBuildCheck(
        { logger: stubLogger() },
        makeContentRoot({ gens: ["gen9"] })
      )
    ).rejects.toThrow(/test-build-path-entry/);
  });

  it("throws on a year window outside the recorded production too", async () => {
    // The third issue code reaches the build path like the other two.
    await expect(
      runFitmentBuildCheck(
        { logger: stubLogger() },
        makeContentRoot({ gens: ["gen3"], years: { from: 2010, to: 2012 } })
      )
    ).rejects.toThrow(/year-outside-production/);
  });

  it("logs nothing when it throws", async () => {
    // A build that reported success and then failed would be worse than one
    // that only failed.
    const logger = stubLogger();

    await expect(
      runFitmentBuildCheck({ logger }, makeContentRoot({ gens: ["gen9"] }))
    ).rejects.toThrow();
    expect(logger.messages).toEqual([]);
  });
});
