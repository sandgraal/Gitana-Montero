/**
 * Graders — CONTRACT 3: receipts live in private storage.
 *
 * > **GAR-05′** Receipts SHALL be first-class: uploadable (image/PDF) into
 * > user-private storage, with vendor/date/amount fields, **never publicly
 * > accessible** unless the specific record's cost visibility is opened.
 * > **SHR-03** Costs and receipts SHALL stay private even on a public
 * > work-log unless opened per record.
 *
 * A receipt is the most personal object this site will ever hold: a name, an
 * address, a card's last four, a price someone may not want their neighbours
 * to know. "Private" here has to mean four separate things, and each of them
 * can be true while the others are false:
 *
 * 1. **No public URL exists.** Supabase serves a public bucket at a
 *    guessable, permanent, unauthenticated path. If the bucket is public, no
 *    policy anywhere else matters.
 * 2. **Only the owner can sign.** A signed URL is a bearer token with a
 *    timer. Owner B asking for one over owner A's object must be refused at
 *    the point of signing — not left to whether B can guess the path.
 * 3. **Only the owner can read directly.** The authenticated object route is
 *    a second door to the same bytes.
 * 4. **Only the owner can enumerate.** Listing a bucket leaks filenames, and
 *    a filename is `<uuid>/TEST-…-RECEIPT-1.pdf` — enough to try door 2.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker. T2-202 activates a grader by deleting exactly that
 * `.fails`.
 *
 * refs specs/002-montero-garage (GAR-05′, SHR-01, SHR-03)
 */
import { describe, expect, it } from "vitest";
import { RECEIPTS_BUCKET, testReceiptPath } from "./contract.ts";
import {
  detectLiveStack,
  downloadObject,
  fetchPublicObject,
  followSignedUrl,
  listObjects,
  liveTitle,
  provisionScenario,
  signObject,
  stackOf,
  teardownScenario,
  uploadObject,
} from "./harness.ts";
import { migrationSql, policies } from "./sql.ts";

const live = await detectLiveStack();

/* =========================================================================
 * Tier A — declaration
 * ====================================================================== */

describe("the receipts bucket is created private", () => {
  it.fails("creates a bucket named for receipts", () => {
    expect(migrationSql()).toMatch(
      new RegExp(`storage\\.buckets[\\s\\S]*'${RECEIPTS_BUCKET}'`)
    );
  });

  it.fails("creates it with public = false", () => {
    // The single line that decides whether every receipt in the system has a
    // permanent unauthenticated URL. Graded on the literal, because
    // `public` defaulting to false is a Supabase implementation detail and
    // this requirement is not one to leave to a default.
    const sql = migrationSql();
    const insert = sql.slice(sql.indexOf("storage.buckets"));

    expect(insert).toMatch(/false/);
    expect(insert).not.toMatch(
      new RegExp(`'${RECEIPTS_BUCKET}'[^;]*\\btrue\\b`)
    );
  });

  it.fails("writes storage.objects policies scoped to the owner", () => {
    const storagePolicies = policies(migrationSql()).filter(
      (policy) => policy.table === "objects"
    );

    expect(storagePolicies.length).toBeGreaterThan(0);
    for (const policy of storagePolicies) {
      expect(policy.statement, policy.name).toContain("auth.uid()");
    }
  });

  it.fails("grants no storage policy to anon", () => {
    const leaks = policies(migrationSql())
      .filter((policy) => policy.table === "objects")
      .filter(
        (policy) =>
          policy.roles.length === 0 ||
          policy.roles.some((role) => role === "anon" || role === "public")
      );

    expect(leaks.map((policy) => policy.name)).toEqual([]);
  });

  it.fails(
    "keys the storage policy off the object's first path segment",
    () => {
      // The convention the fixtures are written against: `<owner uuid>/<file>`.
      // A policy that does not read the path prefix has no way to tell whose
      // object it is looking at.
      const storagePolicies = policies(migrationSql()).filter(
        (policy) => policy.table === "objects"
      );

      expect(storagePolicies.length).toBeGreaterThan(0);
      for (const policy of storagePolicies) {
        expect(policy.statement, policy.name).toMatch(
          /storage\.foldername|split_part|string_to_array/
        );
      }
    }
  );
});

/* =========================================================================
 * Tier B — behavioural
 * ====================================================================== */

describe.skipIf(!live.available)(
  liveTitle("a receipt has no public URL", live),
  () => {
    it.fails("the public object route does not serve a receipt", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
        const uploaded = await uploadObject(scenario, scenario.ownerA, path);
        expect(uploaded.ok).toBe(true);

        const publicRead = await fetchPublicObject(scenario, path);

        expect(publicRead.ok).toBe(false);
        expect(publicRead.text).not.toContain("TEST-T2-201 synthetic receipt");
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "an unauthenticated direct read does not serve it either",
      async () => {
        const scenario = await provisionScenario(stackOf(live));
        try {
          const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
          await uploadObject(scenario, scenario.ownerA, path);

          const anonRead = await downloadObject(scenario, scenario.anon, path);

          expect(anonRead.ok).toBe(false);
          expect(anonRead.text).not.toContain("TEST-T2-201 synthetic receipt");
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails("anon cannot list the bucket", async () => {
      // Filenames are `<owner uuid>/…`. A listing hands out both halves of
      // what an attacker needs for the direct route.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
        await uploadObject(scenario, scenario.ownerA, path);

        const listing = await listObjects(scenario, scenario.anon);

        expect(listing.text).not.toContain("TEST-T2-201-RECEIPT-1.pdf");
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "POSITIVE CONTROL: the owner reads their own receipt back",
      async () => {
        // Otherwise every assertion above is satisfied by a bucket that does
        // not exist.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
          await uploadObject(scenario, scenario.ownerA, path);

          const ownerRead = await downloadObject(
            scenario,
            scenario.ownerA,
            path
          );

          expect(ownerRead.ok).toBe(true);
          expect(ownerRead.text).toContain("TEST-T2-201 synthetic receipt");
        } finally {
          await teardownScenario(scenario);
        }
      }
    );
  }
);

describe.skipIf(!live.available)(
  liveTitle("signed access is the owner's alone", live),
  () => {
    it.fails("owner B cannot sign for owner A's object", async () => {
      // The refusal has to happen at signing. A signed URL is a bearer token:
      // once issued, nothing downstream asks who asked for it.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
        await uploadObject(scenario, scenario.ownerA, path);

        const signed = await signObject(scenario, scenario.ownerB, path);

        expect(signed.ok).toBe(false);
        expect(signed.text).not.toContain("token");
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("anon cannot sign for anyone's object", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
        await uploadObject(scenario, scenario.ownerA, path);

        const signed = await signObject(scenario, scenario.anon, path);

        expect(signed.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("owner B cannot upload into owner A's folder", async () => {
      // The write side. An attacker who can put a file under someone else's
      // prefix can also replace a receipt with something else entirely.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const path = testReceiptPath(scenario.ownerA.userId ?? "", "forged");

        const uploaded = await uploadObject(scenario, scenario.ownerB, path);

        expect(uploaded.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "POSITIVE CONTROL: the owner's signed URL works without credentials",
      async () => {
        // The feature actually has to work: a signed URL that nobody can
        // follow would satisfy every denial grader above and ship a garage
        // where no receipt is ever visible.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
          await uploadObject(scenario, scenario.ownerA, path);

          const signed = await signObject(scenario, scenario.ownerA, path);
          expect(signed.ok).toBe(true);

          const url = (signed.body as { signedURL?: string }).signedURL ?? "";
          expect(url).toBeTruthy();

          const followed = await followSignedUrl(stackOf(live), url);

          expect(followed.ok).toBe(true);
          expect(followed.text).toContain("TEST-T2-201 synthetic receipt");
        } finally {
          await teardownScenario(scenario);
        }
      }
    );
  }
);
