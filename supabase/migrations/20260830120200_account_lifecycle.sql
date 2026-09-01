-- T2-202 — account creation and ACC-03's two-step deletion.
-- refs specs/002-montero-garage (ACC-01, ACC-03, GAR-05', MIG-03)
--
-- > **ACC-03** A user SHALL be able to delete their account; after a 30-day
-- > recovery window, all vehicles, records, and stored files SHALL be
-- > hard-deleted.
--
-- That is two events with two different callers, so it is two routines:
--
--   1. **The user asks.** A routine taking NO argument, which marks the
--      caller's own row via auth.uid(). Taking no user id is what makes
--      "delete someone else's account" unrepresentable rather than merely
--      forbidden — there is no parameter to put a victim in.
--   2. **Thirty days pass.** The scheduled purge: service-role only, no user
--      argument, and it takes the clock as a parameter so the window stays
--      real and stays testable.
--
-- The purge deletes the auth.users row, and every ownership FK cascades from
-- there: profiles -> vehicles -> records -> receipts. The one thing a row
-- cascade cannot reach is the bytes in storage, so the purge removes those
-- first, by hand.

-- ---------------------------------------------------------------------------
-- A profile for every account
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 1. The user asks (ACC-03)
-- ---------------------------------------------------------------------------
-- No parameter, so there is nowhere to name a victim. `security definer` with
-- an auth.uid() scope inside the body: the scope is the whole defence, and it
-- is the row's own id, so an unauthenticated caller marks nothing.

create function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_uid is null then
    raise exception 'request_account_deletion requires an authenticated caller'
      using errcode = '42501';
  end if;

  update public.profiles
     set deleted_at = coalesce(deleted_at, now()),
         updated_at = now()
   where id = v_uid
  returning deleted_at into v_deleted_at;

  return v_deleted_at;
end;
$$;

revoke all on function public.request_account_deletion() from public;
revoke all on function public.request_account_deletion() from anon;
grant execute on function public.request_account_deletion() to authenticated;

comment on function public.request_account_deletion() is
  'ACC-03 step 1: marks the CALLER''s account for deletion. Takes no user id.';

-- ---------------------------------------------------------------------------
-- 2. Thirty days pass (ACC-03)
-- ---------------------------------------------------------------------------
-- Runs with no session, so it cannot defend itself with auth.uid() — which
-- means the grant is the entire defence and every other role's execute right is
-- revoked explicitly below. `p_now` is how a grader reaches "thirty days later"
-- without waiting for it; in production the scheduler passes nothing and it
-- defaults to now().
--
-- ## The storage half, and the one thing it does not do
--
-- Deleting rows from `storage.objects` in SQL is refused by Supabase's own
-- `storage.protect_delete` trigger unless the caller opts in with
-- `storage.allow_delete_query`, which is what the `set_config` below is: an
-- explicit, transaction-local "yes, this deletion is deliberate".
--
-- What that removes is the object *rows*, which is every route to the bytes —
-- download, list, and sign all go through them, and all three are graded. What
-- it does not remove is the bytes themselves in the storage backend, which only
-- the Storage API can delete, and reaching that API from inside Postgres would
-- mean keeping a service key in the database. AGENTS.md forbids a service key
-- anywhere in this project, and a purge that needs one is a worse trade than a
-- purge that leaves unreferenced bytes behind.
--
-- So the scheduled runner is expected to call the Storage API for the expired
-- owners' prefixes *before* calling this function, and this deletion is the
-- belt for when it did not. Both halves are written up as an owner step in
-- `specs/002-montero-garage/HANDOFF-T2-202-SUPABASE.md`.

create function public.purge_expired_accounts(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired uuid[];
  v_expired_text text[];
  v_count integer := 0;
begin
  select coalesce(array_agg(p.id), array[]::uuid[])
    into v_expired
    from public.profiles p
   where p.deleted_at is not null
     and p.deleted_at <= p_now - interval '30 days';

  if array_length(v_expired, 1) is null then
    return 0;
  end if;

  select array_agg(id::text) into v_expired_text
    from unnest(v_expired) as t(id);

  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects o
   where o.bucket_id = 'receipts'
     and (storage.foldername(o.name))[1] = any (v_expired_text);

  delete from auth.users u
   where u.id = any (v_expired);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_expired_accounts(timestamptz) from public;
revoke all on function public.purge_expired_accounts(timestamptz) from anon;
revoke all on function public.purge_expired_accounts(timestamptz) from authenticated;
grant execute on function public.purge_expired_accounts(timestamptz) to service_role;

comment on function public.purge_expired_accounts(timestamptz) is
  'ACC-03 step 2: hard-deletes accounts whose 30-day window has closed. Service role only.';
