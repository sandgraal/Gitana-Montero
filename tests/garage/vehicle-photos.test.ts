/**
 * Graders — the vehicle-photos storage surface (T2-301a [TEST]).
 *
 * > **GAR-01′** A user SHALL create vehicle profiles with a display name,
 * > taxonomy identity resolved by the 001 fitment engine, **photos**, and
 * > odometer.
 * > **SHR-01** Everything a user stores SHALL default to private.
 *
 * T2-202 built the receipts bucket and proved the private-storage pattern
 * against the whole cross-user matrix. T2-301 adds the second private bucket,
 * and this file is what it has to satisfy — written before it, from the spec,
 * by an instance that will not implement it (AGENTS.md separation rule).
 *
 * ## What is genuinely new here, and what is only a second instance
 *
 * Most of the surface is the receipts pattern with one bucket id changed, and
 * that is deliberate: the path convention puts the owner in
 * `(storage.foldername(name))[1]` for photos exactly as for receipts, so the
 * policies are a shape already proved rather than a second thing to get right.
 * Those graders are here anyway, because "the same shape" is a claim about an
 * implementation that does not exist yet.
 *
 * Three things are **not** a second instance of anything:
 *
 * 1. **The account purge is bucket-specific and currently says `receipts`.**
 *    `purge_expired_accounts` deletes storage rows with
 *    `bucket_id = 'receipts'` — correct when receipts were the only bucket,
 *    and silently incomplete the moment they are not. A purged account would
 *    leave every photo row behind: ACC-03 says "all vehicles, records, and
 *    stored files SHALL be hard-deleted", and photos are stored files.
 *    T2-301 must generalise or extend that function.
 * 2. **Deleting one vehicle has to reach its objects, and no foreign key can
 *    do it.** Records and receipts cascade because they are rows pointing at
 *    rows. A storage object is not a row in `public`, so removing a vehicle
 *    from a garage of three leaves its photos in the bucket forever, still
 *    readable by their owner and counted against their quota. This is the
 *    contract T2-201 never had to state because account deletion was the only
 *    deletion.
 * 3. **The bucket is a second bucket**, and the whole-table storage rule
 *    cannot see a bucket that has no policy at all — every policy that exists
 *    is sound, and the missing one is not a policy. `bucketPolicyIssues`
 *    exists for that, pinned in `reviewer-probes.test.ts` as N15–N18.
 *
 * ## Contract decisions this task owns (all in `contract.ts`)
 *
 * - bucket id **`vehicle-photos`**, not `photos`
 * - path **`<owner uuid>/<vehicle id>/<file>`**
 * - `vehicles.photo_paths text[] not null default '{}'`
 *
 * Each is argued where it is declared. The one question deliberately left
 * open is how a *public* showcase page (SHR-02) renders an object from a
 * private bucket — a sharing decision that belongs with T2-401/T2-402.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker; T2-301 activates a grader by deleting exactly
 * that `.fails`. The receipts graders in `storage-privacy.test.ts` are
 * unmarked because T2-202 activated them — nothing here should be read as
 * doubting those.
 *
 * refs specs/002-montero-garage (GAR-01′, SHR-01, ACC-03)
 */
import { describe, expect, it } from "vitest";
import {
  PRIVATE_BUCKETS,
  TEST_TAXONOMY_IDENTITY,
  VEHICLE_PHOTOS_BUCKET,
  testVehicleName,
  testVehiclePhotoPath,
} from "./contract.ts";
import {
  type Actor,
  type Scenario,
  deleteRows,
  detectLiveStack,
  downloadObject,
  fetchPublicObject,
  followSignedUrl,
  insertRow,
  listObjects,
  liveTitle,
  PHOTO_BODY_MARKER,
  SYNTHETIC_JPEG,
  provisionScenario,
  runAccountPurge,
  signObject,
  stackOf,
  teardownScenario,
  updateRows,
  uploadObject,
} from "./harness.ts";
import { bucketPolicyIssues, bucketPrivacyIssues } from "./rules.ts";
import { migrationSql, statements } from "./sql.ts";

const live = await detectLiveStack();

/**
 * The string a leaked photo's *bytes* would contain.
 *
 * Imported rather than re-declared: an earlier draft spelled its own constant
 * that the fixture bytes never contained, so `not.toContain` could not fail
 * under any circumstance (T2-301a review, F3). `harness.ts` appends this after
 * the JPEG's end-of-image marker precisely so the assertion has weight, and
 * `the photo fixtures are coherent` below proves the bytes really carry it.
 */
const PHOTO_MARKER = PHOTO_BODY_MARKER;

/* -------------------------------------------------------------------------
 * Declaration-tier helpers
 * ---------------------------------------------------------------------- */

/** The `create function` statement for `name`, body included. */
function functionBody(sql: string, name: string): string {
  return (
    statements(sql).find((statement) =>
      new RegExp(`create (?:or replace )?function [a-z_.]*${name}\\b`).test(
        statement
      )
    ) ?? ""
  );
}

/**
 * `true` when a routine's storage cleanup actually reaches `bucket`.
 *
 * An unfiltered `delete from storage.objects` reaches every bucket and is
 * fine. A filtered one reaches only the buckets it names — which is the
 * difference between ACC-03 being satisfied and a purged account's photos
 * outliving it.
 */
function deletionReachesBucket(body: string, bucket: string): boolean {
  if (!/delete from storage\.objects/.test(body)) return false;
  if (!/bucket_id/.test(body)) return true;
  return body.includes(`'${bucket}'`);
}

/** The `create trigger` statement that fires on a vehicle being deleted. */
function vehicleDeleteTrigger(sql: string): string | undefined {
  return statements(sql).find(
    (statement) =>
      statement.startsWith("create trigger") &&
      /\bdelete\b/.test(statement) &&
      /\bon (?:public\.)?vehicles\b/.test(statement)
  );
}

/**
 * The body of whatever function the vehicles delete trigger calls.
 *
 * Follows `execute function <name>` rather than matching a list of plausible
 * names, so the grader pins the behaviour the requirement asks for and leaves
 * the naming to whoever writes it (T2-301a review, F1).
 */
function vehicleDeleteCleanupBody(sql: string): string {
  const trigger = vehicleDeleteTrigger(sql);
  if (!trigger) return "";
  const target = /execute (?:function|procedure)\s+([a-z0-9_.]+)\s*\(/.exec(
    trigger
  )?.[1];
  if (!target) return "";
  const bare = target.includes(".") ? target.split(".").pop() : target;
  return bare ? functionBody(sql, bare) : "";
}

/* =========================================================================
 * Tier A — declaration
 * ====================================================================== */

describe("the vehicle-photos bucket is created private", () => {
  it.fails("creates a private bucket and never flips it public", () => {
    expect(bucketPrivacyIssues(migrationSql(), VEHICLE_PHOTOS_BUCKET)).toEqual(
      []
    );
  });

  it.fails("polices the bucket, on all four commands, scoped by path", () => {
    // `bucketPolicyIssues` rather than `storagePolicyIssues`: the whole-table
    // rule is satisfied today by receipts alone, and would stay satisfied if
    // the photos bucket shipped with no policy whatsoever.
    expect(bucketPolicyIssues(migrationSql(), VEHICLE_PHOTOS_BUCKET)).toEqual(
      []
    );
  });

  it.fails("grants no vehicle-photos policy to anon", () => {
    // Both halves matter. Filtering for "granted to" alone would pass
    // vacuously today — there are no photo policies, so there are no policies
    // granted to anon — which is a grader that reports success because the
    // feature is missing. The second assertion is what stops that.
    const issues = bucketPolicyIssues(migrationSql(), VEHICLE_PHOTOS_BUCKET);

    expect(issues.filter((issue) => issue.includes("granted to"))).toEqual([]);
    expect(issues).not.toContain(
      `storage.objects: no policy names the ${VEHICLE_PHOTOS_BUCKET} bucket`
    );
  });

  it.fails("restricts the bucket to image MIME types", () => {
    // Not fussiness: an un-typed bucket is a general-purpose file host that
    // happens to be attached to a truck, and the first thing a private
    // general-purpose file host attracts is content nobody signed up to store.
    const sql = migrationSql();
    const insert =
      statements(sql).find(
        (statement) =>
          statement.startsWith("insert into storage.buckets") &&
          statement.includes(`'${VEHICLE_PHOTOS_BUCKET}'`)
      ) ?? "";

    expect(insert).toMatch(/allowed_mime_types/);
    expect(insert).toMatch(/image\//);
  });
});

describe("ACC-03 reaches photos, not just receipts", () => {
  // The gap this task exists to close at the contract level. Today's purge
  // reads `bucket_id = 'receipts'`, which was the whole truth for exactly as
  // long as there was one bucket.
  it("POSITIVE CONTROL: purge_expired_accounts deletes receipts objects", () => {
    // Unmarked, and passing today. This is what proves the two helpers above
    // actually read the shipped DDL — without it, the marked grader below
    // could be failing because `functionBody` finds nothing, which would look
    // identical in the report and mean something completely different.
    const body = functionBody(migrationSql(), "purge_expired_accounts");

    expect(body, "purge_expired_accounts not found").not.toBe("");
    expect(deletionReachesBucket(body, "receipts")).toBe(true);
  });

  it.fails("purge_expired_accounts deletes vehicle-photos objects", () => {
    // The gap. T2-301 must generalise this function or extend it; ACC-03 says
    // "all vehicles, records, and stored files", and a photo is a stored file.
    const body = functionBody(migrationSql(), "purge_expired_accounts");

    expect(deletionReachesBucket(body, VEHICLE_PHOTOS_BUCKET)).toBe(true);
  });

  it.fails("deleting one vehicle reaches its photo objects", () => {
    // No foreign key can do this: a storage object is not a row in `public`,
    // so `on delete cascade` has nothing to hang from. It needs a trigger on
    // `vehicles` — and the two-segment path convention is what makes the
    // cleanup a prefix match rather than a reconciliation against
    // `photo_paths`.
    expect(
      vehicleDeleteTrigger(migrationSql()),
      "no delete trigger on public.vehicles"
    ).toBeDefined();
  });

  it.fails("the vehicle-delete cleanup targets the photos bucket", () => {
    // Separate from the trigger existing, because a trigger that fires and
    // deletes nothing is the failure this whole file is about.
    //
    // **The function is found by following the trigger, not by guessing its
    // name** (T2-301a review, F1). An earlier draft matched a hard-coded list
    // — `handle_vehicle_deleted`, `vehicle_photos_cleanup` — which is a
    // contract nobody declared: an implementer who wrote the equally natural
    // `cleanup_vehicle_photos` would have failed this grader with no
    // legitimate route to green, and the fix would have been to rename their
    // function to satisfy a test. What the requirement actually cares about is
    // that *whatever the trigger calls* deletes the photo objects, so that is
    // what is asked.
    const sql = migrationSql();
    const body = vehicleDeleteCleanupBody(sql);

    expect(body, "the vehicles delete trigger calls nothing findable").not.toBe(
      ""
    );
    expect(deletionReachesBucket(body, VEHICLE_PHOTOS_BUCKET)).toBe(true);
  });
});

/* =========================================================================
 * The manifest sweep — every private bucket, not just this one
 * ====================================================================== */

/** `true` once some statement creates `bucket`. */
function bucketIsCreated(sql: string, bucket: string): boolean {
  return !bucketPrivacyIssues(sql, bucket).some((issue) =>
    issue.includes("no statement creates")
  );
}

/**
 * The invariants that hold for **every** bucket in `PRIVATE_BUCKETS`.
 *
 * `PRIVATE_BUCKETS`' docstring promised that the privacy graders iterate it,
 * and until now nothing did — the marked graders above name `vehicle-photos`
 * directly, so a third bucket added to the manifest would have got zero
 * coverage from a list that claimed to provide it (T2-301a review, F5).
 *
 * **Unmarked, and conditional on the bucket existing.** That is not a hedge:
 * receipts exists and must pass today, photos does not exist and must not turn
 * this suite red — its *existence* is pinned by the marked grader above, which
 * is where that claim belongs. The conditional is asserted rather than
 * silently returned, so a reader sees the branch instead of wondering why a
 * bucket vanished from the run.
 */
describe.each(PRIVATE_BUCKETS.map((bucket) => [bucket]))(
  "%s — the private-bucket invariants",
  (bucket) => {
    it("is created private and never flipped public", () => {
      const sql = migrationSql();
      if (!bucketIsCreated(sql, bucket)) {
        expect(bucketIsCreated(sql, bucket)).toBe(false);
        return;
      }

      expect(bucketPrivacyIssues(sql, bucket)).toEqual([]);
    });

    it("is policed on all four commands, owner-scoped by path", () => {
      const sql = migrationSql();
      if (!bucketIsCreated(sql, bucket)) {
        expect(bucketIsCreated(sql, bucket)).toBe(false);
        return;
      }

      expect(bucketPolicyIssues(sql, bucket)).toEqual([]);
    });

    it("is reached by the account purge", () => {
      // ACC-03 applies to every stored file, so this is a manifest-wide claim
      // rather than a photos one. It is the sweep's whole point: the next
      // private bucket inherits the purge requirement automatically.
      const sql = migrationSql();
      if (!bucketIsCreated(sql, bucket)) {
        expect(bucketIsCreated(sql, bucket)).toBe(false);
        return;
      }

      expect(
        deletionReachesBucket(
          functionBody(sql, "purge_expired_accounts"),
          bucket
        )
      ).toBe(true);
    });
  }
);

/* =========================================================================
 * Tier B — behavioural
 * ====================================================================== */

/** A vehicle owned by `actor`, with one photo uploaded under its prefix. */
async function createVehicleWithPhoto(
  scenario: Scenario,
  actor: Actor
): Promise<{ readonly vehicleId: string; readonly photoPath: string }> {
  const inserted = await insertRow(scenario, actor, "vehicles", {
    owner_id: actor.userId,
    display_name: testVehicleName(actor.slot),
    ...TEST_TAXONOMY_IDENTITY,
  });
  const rows = Array.isArray(inserted.body) ? inserted.body : [];
  const vehicle = rows[0] as { id?: string } | undefined;
  if (!inserted.ok || !vehicle?.id) {
    throw new Error(
      `could not create vehicle: ${inserted.status} ${inserted.text}`
    );
  }

  const photoPath = testVehiclePhotoPath(
    actor.userId ?? "",
    vehicle.id,
    actor.slot
  );
  // **Row half first, on purpose** (T2-301a review, F2). The handoff claimed
  // this fixture proved `photo_paths` round-trips against the shipped schema,
  // and with the upload first that claim was not something the run could
  // support: the upload threw `NoSuchBucket` and the update never executed.
  // The claim happened to be true, but the evidence offered for it was not
  // evidence. Recording the path before uploading makes it true by
  // construction — every live run now exercises the column — and leaves the
  // failure point exactly where it belongs, on the missing bucket.
  const linked = await updateRows(
    scenario,
    actor,
    "vehicles",
    `id=eq.${vehicle.id}`,
    { photo_paths: [photoPath] }
  );
  if (!linked.ok) {
    throw new Error(
      `could not record photo_paths: ${linked.status} ${linked.text}`
    );
  }

  const uploaded = await uploadObject(scenario, actor, photoPath, {
    bucket: VEHICLE_PHOTOS_BUCKET,
  });
  if (!uploaded.ok) {
    throw new Error(
      `could not upload photo: ${uploaded.status} ${uploaded.text}`
    );
  }

  return { vehicleId: vehicle.id, photoPath };
}

describe.skipIf(!live.available)(
  liveTitle("a vehicle photo has no public URL", live),
  () => {
    it.fails("the public object route does not serve a photo", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { photoPath } = await createVehicleWithPhoto(
          scenario,
          scenario.ownerA
        );

        const publicRead = await fetchPublicObject(
          scenario,
          photoPath,
          VEHICLE_PHOTOS_BUCKET
        );

        expect(publicRead.ok).toBe(false);
        expect(publicRead.text).not.toContain(PHOTO_MARKER);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("an unauthenticated direct read does not serve it", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { photoPath } = await createVehicleWithPhoto(
          scenario,
          scenario.ownerA
        );

        const anonRead = await downloadObject(
          scenario,
          scenario.anon,
          photoPath,
          VEHICLE_PHOTOS_BUCKET
        );

        expect(anonRead.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("anon cannot list the photos bucket", async () => {
      // A photo path is `<owner uuid>/<vehicle id>/<file>`, so a listing
      // hands out the owner id, the vehicle id, and the filename at once.
      const scenario = await provisionScenario(stackOf(live));
      try {
        await createVehicleWithPhoto(scenario, scenario.ownerA);

        const listing = await listObjects(
          scenario,
          scenario.anon,
          "",
          VEHICLE_PHOTOS_BUCKET
        );

        expect(listing.text).not.toContain("PHOTO");
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "POSITIVE CONTROL: the owner reads their own photo back",
      async () => {
        // Every denial above is satisfied by a bucket that does not exist.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const { photoPath } = await createVehicleWithPhoto(
            scenario,
            scenario.ownerA
          );

          const ownerRead = await downloadObject(
            scenario,
            scenario.ownerA,
            photoPath,
            VEHICLE_PHOTOS_BUCKET
          );

          expect(ownerRead.ok).toBe(true);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );
  }
);

describe.skipIf(!live.available)(
  liveTitle("one owner's photos are their own", live),
  () => {
    it.fails("owner B cannot read owner A's photo", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { photoPath } = await createVehicleWithPhoto(
          scenario,
          scenario.ownerA
        );

        const read = await downloadObject(
          scenario,
          scenario.ownerB,
          photoPath,
          VEHICLE_PHOTOS_BUCKET
        );

        expect(read.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("owner B cannot sign for owner A's photo", async () => {
      // The refusal has to happen at signing: a signed URL is a bearer token,
      // and once issued nothing downstream asks who asked for it.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { photoPath } = await createVehicleWithPhoto(
          scenario,
          scenario.ownerA
        );

        const signed = await signObject(
          scenario,
          scenario.ownerB,
          photoPath,
          VEHICLE_PHOTOS_BUCKET
        );

        expect(signed.ok).toBe(false);
        expect(signed.text).not.toContain("token");
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("owner B cannot upload into owner A's prefix", async () => {
      // An attacker who can write under someone else's prefix can also
      // replace a photo with something else entirely.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { vehicleId } = await createVehicleWithPhoto(
          scenario,
          scenario.ownerA
        );
        const forged = testVehiclePhotoPath(
          scenario.ownerA.userId ?? "",
          vehicleId,
          "forged"
        );

        const uploaded = await uploadObject(scenario, scenario.ownerB, forged, {
          bucket: VEHICLE_PHOTOS_BUCKET,
        });

        expect(uploaded.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "POSITIVE CONTROL: the owner's signed URL works without credentials",
      async () => {
        // The feature has to work: a signed URL nobody can follow would
        // satisfy every denial above and ship a garage where no photo ever
        // renders.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const { photoPath } = await createVehicleWithPhoto(
            scenario,
            scenario.ownerA
          );

          const signed = await signObject(
            scenario,
            scenario.ownerA,
            photoPath,
            VEHICLE_PHOTOS_BUCKET
          );
          expect(signed.ok).toBe(true);

          const url = (signed.body as { signedURL?: string }).signedURL ?? "";
          expect(url).toBeTruthy();

          const followed = await followSignedUrl(stackOf(live), url);

          expect(followed.ok).toBe(true);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );
  }
);

describe.skipIf(!live.available)(
  liveTitle("deleting reaches the objects", live),
  () => {
    it.fails("deleting a vehicle removes its photo objects", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { vehicleId, photoPath } = await createVehicleWithPhoto(
          scenario,
          scenario.ownerA
        );

        const deleted = await deleteRows(
          scenario,
          scenario.ownerA,
          "vehicles",
          `id=eq.${vehicleId}`
        );
        expect(deleted.ok).toBe(true);

        const read = await downloadObject(
          scenario,
          scenario.ownerA,
          photoPath,
          VEHICLE_PHOTOS_BUCKET
        );

        expect(read.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "deleting one vehicle leaves another vehicle's photos alone",
      async () => {
        // The over-reach direction, which is the same defect wearing the
        // opposite coat and much harder to notice in production.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const keep = await createVehicleWithPhoto(scenario, scenario.ownerA);
          const drop = await createVehicleWithPhoto(scenario, scenario.ownerA);

          await deleteRows(
            scenario,
            scenario.ownerA,
            "vehicles",
            `id=eq.${drop.vehicleId}`
          );

          const survivor = await downloadObject(
            scenario,
            scenario.ownerA,
            keep.photoPath,
            VEHICLE_PHOTOS_BUCKET
          );

          expect(survivor.ok).toBe(true);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails("the account purge removes photo objects too", async () => {
      // ACC-03's "all vehicles, records, and stored files". Photos are stored
      // files, and today's purge names only the receipts bucket.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { photoPath } = await createVehicleWithPhoto(
          scenario,
          scenario.ownerA
        );

        await runAccountPurge(scenario, scenario.ownerA);

        const read = await downloadObject(
          scenario,
          scenario.ownerA,
          photoPath,
          VEHICLE_PHOTOS_BUCKET
        );

        expect(read.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });
  }
);

/* =========================================================================
 * Guards on this file's own fixtures
 * ====================================================================== */

describe("the photo fixtures are coherent", () => {
  // Unmarked. If the path convention drifts, every storage policy written
  // against `(storage.foldername(name))[1]` silently stops matching, and the
  // graders above would report a leak that is really a typo.
  it("puts the owner first and the vehicle second", () => {
    const path = testVehiclePhotoPath("owner-uuid", "vehicle-uuid", "1");

    expect(path.split("/")).toEqual([
      "owner-uuid",
      "vehicle-uuid",
      "TEST-T2-201-PHOTO-1.jpg",
    ]);
  });

  it("lists both private buckets, receipts included", () => {
    // `toContain`, not exact equality (T2-301a review, F5): a third private
    // bucket added to the manifest should pick up the sweep below, not turn
    // this control red for having done the right thing.
    expect(PRIVATE_BUCKETS).toContain("receipts");
    expect(PRIVATE_BUCKETS).toContain(VEHICLE_PHOTOS_BUCKET);
  });

  it("the photo bytes really carry the marker the leak graders look for", () => {
    // The guard behind F3. `not.toContain(PHOTO_MARKER)` is worth nothing if
    // the fixture never contained it — so this proves the bytes do, and that
    // the JPEG is still a JPEG: `FFD9` is the end-of-image marker, and the
    // text sits after it where decoders ignore it.
    const eoi = SYNTHETIC_JPEG.lastIndexOf(Buffer.from([0xff, 0xd9]));

    expect(eoi, "no JPEG end-of-image marker in the fixture").toBeGreaterThan(
      0
    );
    expect(SYNTHETIC_JPEG.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(SYNTHETIC_JPEG.includes(PHOTO_MARKER)).toBe(true);
    expect(SYNTHETIC_JPEG.indexOf(PHOTO_MARKER)).toBeGreaterThan(eoi);
  });

  it("reads an unfiltered storage deletion as reaching every bucket", () => {
    expect(
      deletionReachesBucket("delete from storage.objects o", "anything")
    ).toBe(true);
  });

  it("reads a receipts-only deletion as NOT reaching photos", () => {
    // The exact shape shipped today, and the reason this task exists.
    const shipped =
      "delete from storage.objects o where o.bucket_id = 'receipts'";

    expect(deletionReachesBucket(shipped, "receipts")).toBe(true);
    expect(deletionReachesBucket(shipped, VEHICLE_PHOTOS_BUCKET)).toBe(false);
  });

  it("reads a two-bucket deletion as reaching both", () => {
    const both =
      "delete from storage.objects o where o.bucket_id in ('receipts', 'vehicle-photos')";

    for (const bucket of PRIVATE_BUCKETS) {
      expect(deletionReachesBucket(both, bucket), bucket).toBe(true);
    }
  });
});
