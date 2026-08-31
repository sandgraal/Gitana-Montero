-- T2-202 — the private receipts bucket and its policies.
-- refs specs/002-montero-garage (GAR-05', SHR-01, SHR-03)
--
-- "Private" has to mean four separate things, and each can be true while the
-- others are false: no public URL exists; only the owner can sign; only the
-- owner can read directly; only the owner can enumerate. The bucket flag
-- settles the first. The policies below settle the other three, and they settle
-- them by reading the object's *path*, because the first segment of the path is
-- the only thing about a storage row that says whose it is. "Right bucket, and
-- somebody is logged in" is not that.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- `public = false` is the single decision governing whether every receipt in
-- the system has a permanent unauthenticated URL. Nothing later in this
-- directory may flip it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects
-- ---------------------------------------------------------------------------
-- Convention, and the storage layer's whole notion of ownership:
--
--     receipts/<owner uuid>/<file>
--
-- `(storage.foldername(name))[1]` is that first segment. Every clause of every
-- policy compares it to the caller, so a request for someone else's object is
-- refused at the point it is made — including the request for a *signed URL*,
-- which is a bearer token with a timer: once issued, nothing downstream asks
-- who asked for it.
--
-- Read and write are separate policies rather than one `for all`, so a future
-- edit that loosens one cannot silently loosen the other.

create policy "receipts owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "receipts owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "receipts owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "receipts owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
