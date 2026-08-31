-- T2-202 — ACC-01's deny half: the password grant is refused, in the database.
-- refs specs/002-montero-garage (ACC-01)
--
-- > **ACC-01** THE site SHALL authenticate users via Supabase Auth with email
-- > magic link and Google OAuth, **and no password flow.**
--
-- ## The finding this file exists to answer
--
-- **GoTrue exposes no setting that disables password authentication.** Every
-- password-related knob in CLI 2.114 / GoTrue 2.195 makes passwords *stronger*
-- and none makes them *absent*: `minimum_password_length`,
-- `password_requirements`, `secure_password_change`, the leaked-password check.
-- The two that look like off switches are not:
--
--   * `[auth.email] enable_signup = false` disables email sign-up entirely,
--     magic link included — it would close ACC-01's deny half by breaking
--     ACC-01's allow half. (T2-201's grader stopped demanding it for exactly
--     this reason.)
--   * `minimum_password_length` set absurdly high does reject
--     `POST /auth/v1/signup` with a password (422 `weak_password`) — and it
--     rejects `POST /auth/v1/otp` with `create_user` too, with the same error,
--     because GoTrue generates an internal password for passwordless sign-ups
--     and runs it through the same validator. Verified against the local stack:
--     magic-link sign-up dies with it.
--
-- What GoTrue *does* expose is the password-verification hook below, and it is
-- enough for the half that matters. Wired up in `supabase/config.toml`; with it
-- in force, `POST /auth/v1/token?grant_type=password` answers
-- `400 invalid_credentials — Password sign-in is disabled` for an account whose
-- password is *correct*. There is no password anywhere in this project that
-- opens a session.
--
-- ## What is left open, and why it is not closed here
--
-- `POST /auth/v1/signup` with a password still returns 200 and still creates an
-- account. The credential it stores is inert — the hook refuses it forever —
-- but the request is not refused, and nothing in GoTrue can refuse it without
-- also refusing magic-link sign-up.
--
-- A trigger on `auth.users` rejecting a non-empty `encrypted_password` was
-- built and **removed**, because it rejects every account: GoTrue writes a
-- bcrypt hash for passwordless users too (a hash of a random secret, not of the
-- empty string — `crypt('', encrypted_password) = encrypted_password` is false
-- for an account created with no password at all). The stored artefact cannot
-- tell a chosen password from a generated one, and neither can the
-- `before_user_created` hook: its payload for a password sign-up and for an
-- OTP sign-up are byte-identical apart from ids and timestamps. Both were
-- checked against a running stack rather than reasoned about.
--
-- This is recorded as a T2-202 finding for the conductor rather than papered
-- over: `tests/garage/auth-surface.test.ts`'s "refuses to create an account
-- with a password" asserts a behaviour GoTrue cannot be configured into.

-- ---------------------------------------------------------------------------
-- Refuse every password sign-in attempt (auth hook)
-- ---------------------------------------------------------------------------
-- Signature and return shape are GoTrue's: it passes the attempt as jsonb and
-- reads back a decision. `reject` here is unconditional — there is no password
-- this project considers valid, whatever `valid` in the event says.

create function public.deny_password_login(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'decision', 'reject',
    'message', 'Password sign-in is disabled. Use the email link or Google.'
  );
end;
$$;

revoke all on function public.deny_password_login(jsonb) from public;
revoke all on function public.deny_password_login(jsonb) from anon;
revoke all on function public.deny_password_login(jsonb) from authenticated;
grant execute on function public.deny_password_login(jsonb) to supabase_auth_admin;

comment on function public.deny_password_login(jsonb) is
  'ACC-01: GoTrue password-verification hook. Rejects every attempt, always.';
