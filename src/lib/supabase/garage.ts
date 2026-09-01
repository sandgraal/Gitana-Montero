/**
 * Everything the garage page asks the database and the storage API for
 * (GAR-01′, SHR-01, MIG-03). Browser-only.
 *
 * The counterpart to `./auth.ts`: same shape, same rules, same reason for
 * existing. The page component holds markup and DOM wiring; every request,
 * every column list and every failure mode lives here, so the page never spells
 * a table name and a change of schema is a change to one file.
 *
 * ## This module trusts nothing and enforces nothing
 *
 * Not a hedge — a description of where the boundary is. Row-level security is
 * the enforcement, in the database, on every request (SHR-01: "no
 * client-trusted checks"). What this module does is *ask correctly*: it sends
 * the session's own `owner_id`, it scopes every mutation by id, and it builds
 * storage paths through `src/lib/garage/photos.ts`. If any of that were
 * subverted, the policies would refuse the request; the point of getting it
 * right here is that the honest path works, not that the dishonest one fails.
 *
 * `owner_id` is sent explicitly because `public.vehicles.owner_id` has no
 * default. The insert policy is `with check ((select auth.uid()) = owner_id)`,
 * so the client is *asked* who it is and the database decides whether to
 * believe it.
 *
 * ## Outcomes, not exceptions
 *
 * Every function returns a discriminated result rather than throwing, matching
 * `AuthOutcome` in `./auth.ts`. A garage page has exactly one honest thing to
 * do when a request fails — say so in the reader's language and leave what is
 * on screen alone — and that is easier to get right when failure is a value.
 *
 * refs specs/002-montero-garage (GAR-01′, SHR-01, MIG-03)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./auth.ts";
import {
  VEHICLE_PHOTOS_BUCKET,
  photoIssue,
  photoObjectPath,
  photoPrefix,
  randomPhotoId,
  type ChosenFile,
} from "../garage/photos.ts";
import type { VehicleRow, VehicleWrite } from "../garage/vehicle.ts";

/**
 * The columns the page reads. Named rather than `select("*")`: a `*` would
 * quietly start shipping whatever a later migration adds — including a column
 * a future task means to keep server-side.
 */
const VEHICLE_COLUMNS =
  "id, owner_id, display_name, generation_id, market_id, model_year, " +
  "engine_id, odometer_km, photo_paths, is_showcase_public, is_worklog_public";

/** How long a photo's signed URL lives. */
export const PHOTO_URL_TTL_SECONDS = 60 * 10;

/**
 * PostgREST's result type, narrowed to ours.
 *
 * This project ships no generated `Database` types — that would be a fifth
 * copy of the schema, after the migration, the contract, `VehicleRow` and the
 * column list above — so `supabase-js` types an untyped `select(string)` as
 * `GenericStringError`, which overlaps with nothing. The cast is therefore
 * through `unknown` and lives in one place with this note, rather than being
 * repeated at five call sites where it would read as carelessness.
 *
 * What actually keeps the shape honest is `VEHICLE_COLUMNS`: the query names
 * the columns, so a rename in the schema is a request that errors rather than
 * a row with a missing field.
 */
function asRow(data: unknown): VehicleRow {
  return data as VehicleRow;
}

function asRows(data: unknown): VehicleRow[] {
  return (data ?? []) as VehicleRow[];
}

export type GarageResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "signed-out" | "failed" | "rejected";
    };

function failed<T>(): GarageResult<T> {
  return { ok: false, reason: "failed" };
}

/** The client plus the signed-in user's id, or why neither is available. */
async function session(): Promise<
  GarageResult<{ client: SupabaseClient; userId: string }>
> {
  const client = await getSupabaseClient();
  if (!client) return { ok: false, reason: "unconfigured" };
  const { data, error } = await client.auth.getSession();
  if (error) return failed();
  const userId = data.session?.user.id ?? null;
  if (userId === null) return { ok: false, reason: "signed-out" };
  return { ok: true, value: { client, userId } };
}

/** The signed-in account's id, or `null`. The page's gate. */
export async function currentUserId(): Promise<string | null> {
  const open = await session();
  return open.ok ? open.value.userId : null;
}

/* -------------------------------------------------------------------------
 * Asking "is anyone signed in?" without downloading a client
 * ---------------------------------------------------------------------- */

/**
 * The shape of the key `supabase-js` persists a session under.
 *
 * `sb-<project ref>-auth-token`, its default `storageKey`. Matched by shape
 * rather than rebuilt from the project URL, because the derivation is the
 * library's business and a second copy of it here would be wrong the day the
 * library changed it — and being wrong in that direction (no key matched)
 * would sign a reader out. See {@link hasStoredSession} for why a false
 * negative is the one failure that matters.
 */
export const SESSION_STORAGE_KEY_PATTERN = /^sb-.+-auth-token$/;

/**
 * `true` when this browser has a persisted session for *some* Supabase project.
 *
 * The point is what it lets the caller skip. `getSupabaseClient()` dynamically
 * imports `@supabase/supabase-js` — around 200 kB — and asking it "who is
 * signed in?" therefore costs that download **on page load**, for every
 * visitor, including the reference-site reader who clicked "Garage" out of
 * curiosity and is about to be shown a sign-in prompt. That measured 89 on the
 * Lighthouse performance budget against SCF-06's 90, and the wasted bytes were
 * the whole of the difference.
 *
 * Deliberately optimistic: a stray key means the client loads and then reports
 * no session, which costs a download and nothing else. A *missing* key when a
 * session exists would show a signed-in reader the sign-in prompt, so the
 * caller pairs this with {@link carriesAuthResponse} for the one case where a
 * real session has not been written to storage yet.
 */
export function hasStoredSession(win: Window): boolean {
  try {
    const storage = win.localStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && SESSION_STORAGE_KEY_PATTERN.test(key)) return true;
    }
    return false;
  } catch {
    // Storage blocked: no session can have been persisted either, so the
    // honest answer is the same one.
    return false;
  }
}

/**
 * `true` when this URL is a landing from an auth redirect.
 *
 * The moment `hasStoredSession` is wrong: a browser arriving from a magic link
 * or from Google carries the grant in the URL and has nothing in storage yet.
 * Today those land on the sign-in page rather than here, but "today's
 * `emailRedirectTo`" is not a property this page should depend on — a reader
 * who is silently signed out by a redirect target changing would have no way
 * to tell what happened.
 */
export function carriesAuthResponse(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  return ["code", "access_token", "error", "error_description"].some(
    (key) => url.searchParams.has(key) || hash.has(key)
  );
}

/**
 * The signed-in account's id, without paying for the client to find out there
 * is nobody. `null` means "show the sign-in prompt".
 */
export async function currentUserIdIfAny(win: Window): Promise<string | null> {
  if (!hasStoredSession(win) && !carriesAuthResponse(win.location.href)) {
    return null;
  }
  return currentUserId();
}

/* -------------------------------------------------------------------------
 * Vehicles
 * ---------------------------------------------------------------------- */

/**
 * Every vehicle the signed-in user owns.
 *
 * No `.eq("owner_id", …)` filter, and that is not an oversight: the policy
 * `using ((select auth.uid()) = owner_id)` is what limits the rows, and adding
 * a client-side filter on top would make the page *look* like it depends on
 * one. If the filter were ever the thing doing the work, SHR-01 would already
 * be broken.
 */
export async function listVehicles(): Promise<GarageResult<VehicleRow[]>> {
  const open = await session();
  if (!open.ok) return open;
  const { data, error } = await open.value.client
    .from("vehicles")
    .select(VEHICLE_COLUMNS);
  if (error) return failed();
  return { ok: true, value: asRows(data) };
}

export async function createVehicle(
  write: VehicleWrite
): Promise<GarageResult<VehicleRow>> {
  const open = await session();
  if (!open.ok) return open;
  const { data, error } = await open.value.client
    .from("vehicles")
    .insert({ ...write, owner_id: open.value.userId })
    .select(VEHICLE_COLUMNS)
    .single();
  if (error || !data) return failed();
  return { ok: true, value: asRow(data) };
}

export async function updateVehicle(
  id: string,
  write: VehicleWrite
): Promise<GarageResult<VehicleRow>> {
  const open = await session();
  if (!open.ok) return open;
  const { data, error } = await open.value.client
    .from("vehicles")
    .update(write)
    .eq("id", id)
    .select(VEHICLE_COLUMNS)
    .single();
  if (error || !data) return failed();
  return { ok: true, value: asRow(data) };
}

/**
 * Delete a vehicle and, first, the objects that belong to it.
 *
 * Order matters and the belt-and-braces is deliberate. The Storage API is the
 * only thing that can remove the *bytes*; the `on_vehicle_deleted` trigger
 * removes the object *rows*, which is every route to those bytes, and is what
 * covers the case where this call did not happen or did not finish. Doing only
 * the trigger would leave unreferenced bytes behind; doing only this would
 * leave rows behind whenever a browser closed mid-request.
 *
 * A failure to remove objects does not abort the row delete: the trigger will
 * take the rows, and a vehicle a user asked to delete has to actually go.
 */
export async function deleteVehicle(id: string): Promise<GarageResult<null>> {
  const open = await session();
  if (!open.ok) return open;
  const { client, userId } = open.value;

  const listed = await listPhotoObjects(client, userId, id);
  if (listed.length > 0) {
    await client.storage.from(VEHICLE_PHOTOS_BUCKET).remove(listed);
  }

  const { error } = await client.from("vehicles").delete().eq("id", id);
  if (error) return failed();
  return { ok: true, value: null };
}

/* -------------------------------------------------------------------------
 * Photos
 * ---------------------------------------------------------------------- */

/** The object paths under one vehicle's prefix, as full paths. */
async function listPhotoObjects(
  client: SupabaseClient,
  ownerId: string,
  vehicleId: string
): Promise<string[]> {
  let prefix: string;
  try {
    prefix = photoPrefix(ownerId, vehicleId);
  } catch {
    return [];
  }
  const { data, error } = await client.storage
    .from(VEHICLE_PHOTOS_BUCKET)
    .list(prefix);
  if (error || !data) return [];
  return data.map((entry) => `${prefix}/${entry.name}`);
}

/**
 * Upload one photo and record its path on the vehicle.
 *
 * Two steps that have to both happen, in this order: the object first, then
 * the row. Reversed, a failed upload would leave a `photo_paths` entry
 * pointing at nothing and the page would render a broken image for a photo
 * that was never stored. This way a failed row update leaves an orphan object
 * instead — invisible, and swept by the vehicle-delete trigger and by the
 * account purge, both of which work on the prefix rather than on the array.
 *
 * `rejected` means the file itself was refused (wrong type, too large) rather
 * than the request failing, so the page can say which.
 */
export async function uploadVehiclePhoto(
  vehicle: VehicleRow,
  file: File
): Promise<GarageResult<VehicleRow>> {
  const open = await session();
  if (!open.ok) return open;
  const { client, userId } = open.value;

  if (photoIssue(file as ChosenFile) !== null) {
    return { ok: false, reason: "rejected" };
  }

  let path: string;
  try {
    path = photoObjectPath({
      ownerId: userId,
      vehicleId: vehicle.id,
      mimeType: file.type,
      randomId: randomPhotoId(),
    });
  } catch {
    return { ok: false, reason: "rejected" };
  }

  const uploaded = await client.storage
    .from(VEHICLE_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) return failed();

  return setPhotoPaths(client, vehicle.id, [...vehicle.photo_paths, path]);
}

/**
 * Remove one photo: the row's reference first, then the object.
 *
 * The mirror image of the upload's order, for the mirror-image reason. Dropping
 * the reference first means the worst case is an orphan object nobody renders;
 * deleting the object first would mean a live reference to bytes that are gone,
 * which is a broken image on the reader's own page.
 */
export async function removeVehiclePhoto(
  vehicle: VehicleRow,
  path: string
): Promise<GarageResult<VehicleRow>> {
  const open = await session();
  if (!open.ok) return open;
  const { client } = open.value;

  const updated = await setPhotoPaths(
    client,
    vehicle.id,
    vehicle.photo_paths.filter((entry) => entry !== path)
  );
  if (!updated.ok) return updated;

  await client.storage.from(VEHICLE_PHOTOS_BUCKET).remove([path]);
  return updated;
}

async function setPhotoPaths(
  client: SupabaseClient,
  vehicleId: string,
  paths: readonly string[]
): Promise<GarageResult<VehicleRow>> {
  const { data, error } = await client
    .from("vehicles")
    .update({ photo_paths: paths })
    .eq("id", vehicleId)
    .select(VEHICLE_COLUMNS)
    .single();
  if (error || !data) return failed();
  return { ok: true, value: asRow(data) };
}

/**
 * Short-lived signed URLs for a vehicle's photos, keyed by object path.
 *
 * Signed, because the bucket is private and must stay that way (SHR-01), and
 * this is the owner looking at their own garage — a signed-in surface where a
 * ten-minute URL is not a limitation anybody notices.
 *
 * How a *public* showcase page (SHR-02) renders an object out of a private
 * bucket is a different question with a different answer, and
 * `tests/garage/contract.ts` deliberately leaves it to T2-401/T2-402. Nothing
 * here should be reused as if it were that answer: a URL long-lived enough for
 * a public page is a URL that has stopped being an access control.
 */
export async function signPhotoUrls(
  paths: readonly string[]
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;
  const client = await getSupabaseClient();
  if (!client) return signed;

  const { data, error } = await client.storage
    .from(VEHICLE_PHOTOS_BUCKET)
    .createSignedUrls([...paths], PHOTO_URL_TTL_SECONDS);
  if (error || !data) return signed;

  for (const entry of data) {
    if (entry.error !== null || !entry.signedUrl || !entry.path) continue;
    signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}
