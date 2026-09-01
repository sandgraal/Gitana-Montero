/**
 * The parts graph (T501) — the corpus-level half of PRT-01, PRT-02 and
 * PRT-03.
 *
 * These are the rules no single entry can see: is this OEM number claimed
 * twice, does the supersession pointer resolve, does the chain terminate, and
 * does a vendor id name something you can actually buy a part from.
 *
 * Part numbers here are in the reserved `TEST-` namespace and entry ids are
 * `test-`-prefixed, per `tests/fixtures/schema-fixtures.ts`' rule: an invented
 * part number is the highest-consequence hallucination in this domain and a
 * plausible one in a fixture is how it leaks into content.
 *
 * refs specs/001-foundation (PRT-01, PRT-02, PRT-03)
 */
import { describe, expect, it } from "vitest";
import {
  PartsResolutionError,
  VENDOR_COMMUNITY_TYPES,
  assertPartsResolve,
  buildPartsIndex,
  findPartIssues,
  readParts,
  readSellers,
  supersessionChain,
  type PartIdentity,
} from "../../../src/lib/parts/index.ts";

function part(
  id: string,
  oemNumber: string,
  supersededBy: string | null = null,
  vendors: readonly string[] = []
): PartIdentity {
  return { id, oemNumber, supersededBy, vendors };
}

function codes(issues: readonly { code: string }[]): string[] {
  return issues.map((issue) => issue.code).sort();
}

describe("reading entries", () => {
  it("skips an entry with no id or no OEM number — the schema owns that", () => {
    const parts = readParts([
      { id: "test-parts-alpha", oemNumber: "TEST-A0001" },
      { id: "test-parts-beta" },
      { oemNumber: "TEST-A0002" },
      null,
      "not an entry",
    ]);
    expect(parts.map((entry) => entry.id)).toEqual(["test-parts-alpha"]);
  });

  it("reads vendors as a list of ids, ignoring non-strings", () => {
    const [entry] = readParts([
      {
        id: "test-parts-alpha",
        oemNumber: "TEST-A0001",
        vendors: ["test-shop-one", 7, null, "test-shop-two"],
      },
    ]);
    expect(entry?.vendors).toEqual(["test-shop-one", "test-shop-two"]);
  });

  it("reads sellers with a missing type as the empty type, not as valid", () => {
    const sellers = readSellers([
      { id: "test-shop-one", communityType: "shop" },
      { id: "test-forum" },
    ]);
    expect(sellers).toEqual([
      { id: "test-shop-one", communityType: "shop" },
      { id: "test-forum", communityType: "" },
    ]);
  });
});

describe("PRT-03 — one OEM number is one part is one page", () => {
  it("passes when every number is claimed once", () => {
    expect(
      findPartIssues([
        part("test-parts-alpha", "TEST-A0001"),
        part("test-parts-beta", "TEST-A0002"),
      ])
    ).toEqual([]);
  });

  it("fails when two entries claim one number, naming both entries", () => {
    const issues = findPartIssues([
      part("test-parts-beta", "TEST-A0001"),
      part("test-parts-alpha", "TEST-A0001"),
    ]);

    expect(codes(issues)).toEqual(["duplicate-oem-number"]);
    const [issue] = issues;
    expect(issue?.field).toBe("oemNumber");
    // Both ids are reachable structurally — that is what lets the build hook
    // print both *files*, which is the whole point of the requirement.
    expect([issue?.entryId, ...(issue?.relatedEntryIds ?? [])].sort()).toEqual([
      "test-parts-alpha",
      "test-parts-beta",
    ]);
    expect(issue?.message).toContain("test-parts-alpha");
    expect(issue?.message).toContain("test-parts-beta");
  });

  it("catches the same number punctuated two ways", () => {
    const issues = findPartIssues([
      part("test-parts-alpha", "TEST-A0001"),
      part("test-parts-beta", "TESTA0001"),
    ]);
    expect(codes(issues)).toEqual(["duplicate-oem-number"]);
    expect(issues[0]?.message).toContain("hyphens are ignored");
  });

  it("reports one issue per duplicated number, not one per entry", () => {
    const issues = findPartIssues([
      part("test-parts-alpha", "TEST-A0001"),
      part("test-parts-beta", "TEST-A0001"),
      part("test-parts-gamma", "TEST-A0001"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.relatedEntryIds).toHaveLength(2);
  });

  it("fails on a duplicated entry id, and reports nothing derived from it", () => {
    const issues = findPartIssues([
      part("test-parts-alpha", "TEST-A0001", "test-parts-nowhere"),
      part("test-parts-alpha", "TEST-A0002"),
    ]);
    // The dangling pointer is real, and it is deliberately not reported while
    // the id it starts from means two things — one mistake, one error.
    expect(codes(issues)).toEqual(["duplicate-entry-id"]);
  });
});

describe("PRT-02 — supersession pointers resolve and terminate", () => {
  it("fails on a pointer to no entry", () => {
    const issues = findPartIssues([
      part("test-parts-alpha", "TEST-A0001", "test-parts-ghost"),
    ]);
    expect(codes(issues)).toEqual(["dangling-supersession"]);
    expect(issues[0]?.field).toBe("supersededBy");
    expect(issues[0]?.message).toContain("test-parts-ghost");
  });

  it("fails on a loop, once, naming every entry in it", () => {
    const issues = findPartIssues([
      part("test-parts-alpha", "TEST-A0001", "test-parts-beta"),
      part("test-parts-beta", "TEST-A0002", "test-parts-gamma"),
      part("test-parts-gamma", "TEST-A0003", "test-parts-alpha"),
    ]);
    expect(codes(issues)).toEqual(["supersession-cycle"]);
    expect(
      [issues[0]?.entryId, ...(issues[0]?.relatedEntryIds ?? [])].sort()
    ).toEqual(["test-parts-alpha", "test-parts-beta", "test-parts-gamma"]);
  });

  it("fails on a one-entry loop", () => {
    const issues = findPartIssues([
      part("test-parts-alpha", "TEST-A0001", "test-parts-alpha"),
    ]);
    expect(codes(issues)).toEqual(["supersession-cycle"]);
  });

  it("accepts two old numbers consolidated into one — that is not a loop", () => {
    expect(
      findPartIssues([
        part("test-parts-alpha", "TEST-A0001", "test-parts-gamma"),
        part("test-parts-beta", "TEST-A0002", "test-parts-gamma"),
        part("test-parts-gamma", "TEST-A0003"),
      ])
    ).toEqual([]);
  });
});

describe("the chain a page renders (PRT-02)", () => {
  const chainParts = [
    part("test-parts-alpha", "TEST-A0001", "test-parts-beta"),
    part("test-parts-beta", "TEST-A0002", "test-parts-gamma"),
    part("test-parts-gamma", "TEST-A0003"),
  ];
  const index = buildPartsIndex(chainParts);

  it("runs oldest → current whichever link you ask from", () => {
    for (const id of [
      "test-parts-alpha",
      "test-parts-beta",
      "test-parts-gamma",
    ]) {
      const chain = supersessionChain(id, index);
      expect(
        chain?.chain.map((entry) => entry.oemNumber),
        id
      ).toEqual(["TEST-A0001", "TEST-A0002", "TEST-A0003"]);
    }
  });

  it("marks the last number as the one to order", () => {
    const chain = supersessionChain("test-parts-alpha", index);
    expect(chain?.current.id).toBe("test-parts-gamma");
  });

  it("is a single-element chain for a part nothing replaced", () => {
    const solo = buildPartsIndex([part("test-parts-solo", "TEST-S0001")]);
    const chain = supersessionChain("test-parts-solo", solo);
    expect(chain?.chain.map((entry) => entry.id)).toEqual(["test-parts-solo"]);
    expect(chain?.current.id).toBe("test-parts-solo");
    expect(chain?.forked).toBe(false);
  });

  it("says so rather than drawing one branch when the chain forks", () => {
    const forked = buildPartsIndex([
      part("test-parts-alpha", "TEST-A0001", "test-parts-gamma"),
      part("test-parts-beta", "TEST-A0002", "test-parts-gamma"),
      part("test-parts-gamma", "TEST-A0003"),
    ]);

    const chain = supersessionChain("test-parts-gamma", forked);
    expect(chain?.forked).toBe(true);
    expect(chain?.chain.map((entry) => entry.id)).toEqual(["test-parts-gamma"]);
    expect(chain?.otherPredecessors.map((entry) => entry.id)).toEqual([
      "test-parts-alpha",
      "test-parts-beta",
    ]);
  });

  it("returns null rather than looping on a corpus the build would reject", () => {
    const looped = buildPartsIndex([
      part("test-parts-alpha", "TEST-A0001", "test-parts-beta"),
      part("test-parts-beta", "TEST-A0002", "test-parts-alpha"),
    ]);
    expect(supersessionChain("test-parts-alpha", looped)).toBeNull();
  });

  it("returns null for an id nothing declares", () => {
    expect(supersessionChain("test-parts-ghost", index)).toBeNull();
  });
});

describe("vendors are typed references into the community directory", () => {
  const sellers = readSellers([
    { id: "test-shop-one", communityType: "shop" },
    { id: "test-vendor-one", communityType: "vendor" },
    { id: "test-forum-one", communityType: "forum" },
  ]);

  it("accepts every seller type COM-01 recognises", () => {
    for (const communityType of VENDOR_COMMUNITY_TYPES) {
      const issues = findPartIssues(
        [part("test-parts-alpha", "TEST-A0001", null, ["test-seller"])],
        readSellers([{ id: "test-seller", communityType }])
      );
      expect(issues, communityType).toEqual([]);
    }
  });

  it("fails on a vendor id that names no community entry", () => {
    const issues = findPartIssues(
      [part("test-parts-alpha", "TEST-A0001", null, ["test-shop-ghost"])],
      sellers
    );
    expect(codes(issues)).toEqual(["unknown-vendor"]);
    expect(issues[0]?.field).toBe("vendors[0]");
  });

  it("fails when the community entry is not somewhere you can buy a part", () => {
    const issues = findPartIssues(
      [
        part("test-parts-alpha", "TEST-A0001", null, [
          "test-shop-one",
          "test-forum-one",
        ]),
      ],
      sellers
    );
    expect(codes(issues)).toEqual(["vendor-is-not-a-seller"]);
    expect(issues[0]?.field).toBe("vendors[1]");
  });
});

describe("the build's throw", () => {
  it("does nothing when the corpus holds together", () => {
    expect(() =>
      assertPartsResolve([part("test-parts-alpha", "TEST-A0001")])
    ).not.toThrow();
  });

  it("throws once, carrying every issue rather than the first", () => {
    let thrown: unknown;
    try {
      assertPartsResolve([
        part("test-parts-alpha", "TEST-A0001", "test-parts-ghost"),
        part("test-parts-beta", "TEST-A0002", null, ["test-shop-ghost"]),
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PartsResolutionError);
    expect((thrown as PartsResolutionError).issues).toHaveLength(2);
  });

  it("is empty-corpus safe — no entries is not a failure", () => {
    expect(findPartIssues([], [])).toEqual([]);
  });
});
