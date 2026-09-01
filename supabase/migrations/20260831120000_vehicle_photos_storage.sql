-- T2-301 — the private `vehicle-photos` bucket, its policies, and the two
-- deletions that have to reach into it.
-- refs specs/002-montero-garage (GAR-01', SHR-01, SHR-02, ACC-03)
--
-- > **GAR-01'** A user SHALL create vehicle profiles with a display name,
-- > taxonomy identity resolved by the 001 fitment engine, **photos**, and
-- > odometer.
--
-- Every name and shape here comes from `tests/garage/contract.ts` and
-- `tests/garage/vehicle-photos.test.ts` (T2-301a [TEST]), which are the
-- authority: the bucket id `vehicle-photos`, the path
-- `<owner uuid>/<vehicle id>/<file>`, and the two cleanup paths below are
-- decisions that file made on the spec's behalf.
--
-- The bucket and its policies are the receipts pattern with one bucket id
-- changed, deliberately: the owner sits in `(storage.foldername(name))[1]` for
-- both, so this is a shape already proved against the whole cross-user matrix
-- rather than a second thing to get right.
--
-- ## Why photos are private even though showcase pages are public (SHR-01/02)
--
-- SHR-01 is unconditional: "everything a user stores SHALL default to
-- private", enforced by row-level security and not by a client-side check. A
-- *public* bucket would give every object a permanent, guessable,
-- unauthenticated URL from the moment it is uploaded — before the owner
-- decided anything, and irrevocably afterwards, because a URL that has been
-- public cannot be un-published. A truck in a driveway is also a house, a
-- plate and a neighbourhood.
--
-- How SHR-02's *public* showcase page then renders an object out of a private
-- bucket is a sharing decision, and the contract leaves it open on purpose for
-- T2-401/T2-402. This migration does not answer it and nothing here should be
-- read as an answer: the owner-facing garage renders its own photos through
-- short-lived signed URLs, which is a signed-in surface.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- Images only. An un-typed bucket is a general-purpose file host that happens
-- to be attached to a truck. Ten megabytes rather than the receipts bucket's
-- twenty: a phone photo is one to five megabytes, and it was the scanned
-- multi-page invoice that needed the larger number.
--
-- Both limits are mirrored in `src/lib/garage/photos.ts` so the page can refuse
-- a file before spending a reader's data uploading it; this is the copy that is
-- enforced.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects
-- ---------------------------------------------------------------------------
--     vehicle-photos/<owner uuid>/<vehicle id>/<file>
--
-- `(storage.foldername(name))[1]` is the owner segment, and every clause of
-- every policy compares it to the caller — so a request for someone else's
-- object is refused at the point it is made, including the request for a
-- *signed URL*, which is a bearer token with a timer: once issued, nothing
-- downstream asks who asked for it.
--
-- No policy reads the vehicle segment, and none should: a user's own vehicles
-- are all equally theirs, and a predicate joining storage to `public.vehicles`
-- would make every photo read depend on a second table's policies staying
-- correct. The vehicle segment earns its keep in the cleanup below, where it
-- turns "delete this vehicle's photos" into a prefix match instead of a
-- reconciliation against `photo_paths`.
--
-- Read and write are separate policies rather than one `for all`, so a future
-- edit that loosens one cannot silently loosen the other.

create policy "vehicle photos owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "vehicle photos owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "vehicle photos owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "vehicle photos owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Deleting one vehicle has to reach its objects
-- ---------------------------------------------------------------------------
-- `records` and `receipts` disappear with a vehicle because they are rows
-- pointing at rows, and `on delete cascade` is exactly that. A storage object
-- is not a row in `public`, so there is nothing for a foreign key to hang from:
-- removing one vehicle from a garage of three would leave its photos in the
-- bucket forever — still readable by their owner, still counted against their
-- quota, and referenced by a `photo_paths` array that no longer exists.
--
-- So it is a trigger, and it deletes **by prefix**: owner segment *and* vehicle
-- segment, which is the whole reason the path carries two. Matching on the
-- owner alone would delete the rest of that owner's garage — the same defect
-- wearing the opposite coat, and much harder to notice in production.
--
-- Not driven off `old.photo_paths`, deliberately. That array is written by a
-- client, so it can disagree with the bucket in both directions: an upload
-- whose row update failed leaves an object the array never knew about, and
-- trusting the array would strand it permanently. The prefix is the truth.
--
-- `security definer` because the caller is `authenticated` and the delete has
-- to happen regardless; `set search_path = ''` so every name below is
-- qualified. `storage.allow_delete_query` is Supabase's own opt-in for a
-- deliberate SQL deletion of object rows — `storage.protect_delete` refuses
-- without it.
--
-- The same limit `purge_expired_accounts` documents applies here: this removes
-- the object *rows*, which is every route to the bytes (download, list and
-- sign all go through them), and not the bytes in the storage backend, which
-- only the Storage API can delete and which reaching from inside Postgres would
-- mean keeping a service key in the database. AGENTS.md forbids that anywhere
-- in this project. The page therefore removes the objects through the Storage
-- API before deleting the row, and this trigger is the belt for when it did
-- not.

create function public.handle_vehicle_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects o
   where o.bucket_id = 'vehicle-photos'
     and (storage.foldername(o.name))[1] = old.owner_id::text
     and (storage.foldername(o.name))[2] = old.id::text;

  return old;
end;
$$;

revoke all on function public.handle_vehicle_deleted() from public;
revoke all on function public.handle_vehicle_deleted() from anon;
revoke all on function public.handle_vehicle_deleted() from authenticated;

comment on function public.handle_vehicle_deleted() is
  'GAR-01'': removes a deleted vehicle''s objects from vehicle-photos. No foreign key can reach storage.';

create trigger on_vehicle_deleted
  after delete on public.vehicles
  for each row execute function public.handle_vehicle_deleted();
