# HANDOFF T2-102 — Vercel project + DNS (owner actions)

**To:** the owner. **From:** T2-102 (implementer).
**Status:** everything in the repository is done. Three things are not, because
they need a Vercel account and a Namecheap login, and neither an agent nor CI
has one.

All DNS values below were read from Vercel's live documentation on
**2026-08-28**, not from memory:

- [Adding & Configuring a Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
  (page's own "last updated": 2026-08-11)
- [Can I use my domain on Vercel with A records?](https://vercel.com/kb/guide/a-record-and-caa-with-vercel)
  (2026-07-27)
- [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

> **The single most important line in this document:** the A record value and
> the `www` CNAME target are **shown on your project's domain card in the
> Vercel dashboard**, and that card is the source of truth. Vercel's own KB:
> "Always use the value shown in your project's domain card." Type what the
> card says, not what this file or any older guide says — Vercel verifies the
> exact value it expects, and a mismatch leaves the domain permanently
> "Invalid Configuration".

---

## Step 1 — Create the Vercel project (do this BEFORE merging the T2-102 PR)

Sequencing matters, and it is cheap to get right: create and verify the
project first, and the window in which nothing anywhere serves the new site is
zero.

1. Sign in to <https://vercel.com> with the GitHub account that owns
   `sandgraal/monterogarage`.
2. **Add New… → Project → Import Git Repository →** `sandgraal/monterogarage`.
   Install the Vercel GitHub App for that repository if prompted.
3. On the configure screen, leave everything at its detected default. The
   repository now contains `vercel.json`, which sets all of it explicitly:

   | Setting          | Value           | Why                                                                        |
   | ---------------- | --------------- | -------------------------------------------------------------------------- |
   | Framework preset | `astro`         | static Astro build; Vercel needs no adapter for `output: "static"`          |
   | Install command  | `npm ci`        | lockfile-exact, the same install CI does — `npm install` could resolve differently |
   | Build command    | `npm run build` | literally the script CI runs (`astro check && astro build`), so a Vercel build that fails is a real divergence, not a config difference |
   | Output directory | `dist`          | Astro's default, stated so a future Astro change cannot silently move it    |
   | Trailing slash   | enforced        | every canonical and hreflang URL this site emits ends in `/`; the edge now agrees |

4. **Settings → Build and Deployment → Node.js Version:** confirm **24.x**.
   It is Vercel's current default and matches `.nvmrc` (24.19.0) and
   `package.json` `engines.node`. If the dropdown shows anything else, change
   it.
5. **Settings → Git → Production Branch:** confirm `main`. Preview deployments
   for pull requests are on by default — that is MIG-02's "previews back", and
   there is nothing to switch on.
6. Deploy. You should get a working site on the generated `*.vercel.app` URL.
   **Check `/en/` and `/es/` both load** before going further.

> Note on what that first deployment shows: until the T2-102 PR merges, Vercel
> is building `main`, where `base` is still `/monterogarage`. So the
> `*.vercel.app` deployment will serve the site under
> `https://<project>.vercel.app/monterogarage/…`, not at the root. That is
> expected and is exactly what the merge fixes. Verify the paths *with* the
> `/monterogarage` prefix at this stage; after the merge, verify them without.

## Step 2 — Merge the T2-102 pull request

After the merge, `base` is `/` and `site` is `https://monterogarage.com`.
Vercel builds `main` automatically and the production deployment serves the
site at the root of the `*.vercel.app` domain.

What happens to GitHub Pages at this moment: **nothing.** T2-102 deletes the
deploy job, which stops new publishes; it does not unpublish the existing one.
`https://sandgraal.github.io/monterogarage/` keeps serving the deployment made
from T2-101, correctly (it was built with the matching `base`) and
increasingly stale. It stays that way until Step 4.

## Step 3 — Point monterogarage.com at Vercel (Namecheap)

1. In Vercel: **Settings → Domains → Add Domain →** `monterogarage.com`.
   Vercel will offer to also add `www.monterogarage.com`; accept — the
   recommended setup is an apex A record paired with a `www` CNAME.
2. Vercel shows a **domain card** for each. Leave that page open; the next
   step copies values off it.
3. In Namecheap: **Domain List → monterogarage.com → Manage → Advanced DNS**.
   Namecheap sets up new domains with parking records; **delete the existing
   `A`/`ALIAS`/`CNAME`/`URL Redirect` records for `@` and `www` first**
   (typically an `A + dynamic DNS` or a "Parking page" `URL Redirect`). Stale
   apex records from a previous host are the number-one cause of verification
   never completing.

   Then add exactly two records:

   | Type         | Host  | Value                                                                | TTL         |
   | ------------ | ----- | -------------------------------------------------------------------- | ----------- |
   | A Record     | `@`   | **the A value on your apex domain card** — for most projects `76.76.21.21`; newer projects get a project-specific anycast address such as `216.198.79.1` | Automatic (or 5 min) |
   | CNAME Record | `www` | **the CNAME target on your `www` domain card** — a project-specific host, e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com` | Automatic (or 5 min) |

   Notes from Vercel's docs that apply here:
   - The `www` target is **per project**. The old generic
     `cname.vercel-dns.com` is not what current docs tell you to use — copy
     the card.
   - **No AAAA records.** Vercel does not support IPv6 for custom domains on
     third-party DNS; an AAAA record splits traffic and can stall SSL.
   - **No ALIAS/ANAME.** Vercel's apex address is anycast, so these buy
     nothing there.
   - Namecheap writes `@` as the apex; do not type `monterogarage.com` into
     the Host field (it becomes `monterogarage.com.monterogarage.com`).
   - If a CAA record exists, it must permit **Let's Encrypt**, or the
     certificate will never issue.

4. Wait for both domain cards to read **Valid Configuration**. Vercel then
   issues the certificate automatically, usually within minutes. Verify from a
   terminal:

   ```bash
   dig a monterogarage.com +short        # → your card's A value
   dig cname www.monterogarage.com +short # → your card's CNAME target
   curl -I https://monterogarage.com/en/  # → HTTP/2 200
   curl -I https://monterogarage.com/es/  # → HTTP/2 200
   ```

5. Optional, and Vercel recommends it: open the `www` card and use **Redirect
   to** so `www.monterogarage.com` redirects to the apex (or the reverse — the
   docs prefer `www` as primary, for traffic-steering flexibility; either is
   fine, but pick one and make the other redirect, so the canonical URLs this
   site emits are the ones that answer with 200 rather than a hop).

## Step 4 — Retire GitHub Pages (only after Step 3 is green)

1. **Actions → "Retire GitHub Pages (tombstone)" → Run workflow**, on `main`,
   typing `monterogarage.com` into the `confirm` input.
2. The workflow refuses to run unless `https://monterogarage.com/`, `/en/` and
   `/es/` all answer 2xx. That guard is the entire reason it was staged and
   not run automatically at merge: publishing a redirect to a host that does
   not answer would be strictly worse than the stale-but-working Pages copy.
3. It publishes four static files (both locales) so
   `https://sandgraal.github.io/monterogarage/` and every deep link under it
   land on the same path at `monterogarage.com`.
4. Once inbound links have drained (months, not days — there is no hurry and
   no cost), the Pages site can be deleted in **Settings → Pages**. Deleting
   it turns those URLs into GitHub's own 404 instead of a redirect, which is
   why it is not done here.

---

## What did NOT change, deliberately

- **CI is still the merge gate.** The three required checks — "Harness
  validation", "Verify (…)", "Links + a11y" — are untouched and still
  merge-blocking. Vercel is only the deployer.
- **Do not add Vercel's build status as a required check** on `main`. A
  required context that does not report hangs a PR forever rather than
  failing it, and Vercel's checks are not guaranteed to report on every event.
- **No deploy secret exists, and none is needed.** Vercel's GitHub integration
  pulls from the repository; nothing in GitHub Actions holds a Vercel token.
  If a future task wants CLI-driven deploys, that is a new decision with a new
  secret to rotate, not a detail of this one.
