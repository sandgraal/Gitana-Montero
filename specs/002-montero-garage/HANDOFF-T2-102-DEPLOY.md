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

Import and build the project first, so that the moment `main` moves there is a
working production deployment one automatic build later, not an account you
have not made yet. What you are proving here is that **the build works** — not
that the site renders, which it cannot yet. Read the boxed note after step 6
before you look at the deployed URL.

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
   It is Vercel's current default and matches `.nvmrc` (`24`, i.e. the latest
   24.x) and `package.json` `engines.node` (`>=24`). If the dropdown shows
   anything else, change it.
5. **Settings → Git → Production Branch:** confirm `main`. Preview deployments
   for pull requests are on by default — that is MIG-02's "previews back", and
   there is nothing to switch on.
6. Deploy. **The only thing to check here is that the build succeeded** — a
   green deployment in the Vercel dashboard. Do not check whether the site
   renders; see the box immediately below. Then go to Step 2.

> ### ⚠️ The pre-merge deployment will look broken. That is correct.
>
> Until the T2-102 PR merges, Vercel is building `main`, where `base` is still
> `/monterogarage`. `base` changes the **URLs Astro writes into the HTML**; it
> does **not** move the output tree. `dist/` contains `en/`, `es/`, `_astro/`
> and `404.html` at its root either way — there is no `dist/monterogarage/`
> directory and never was. Vercel serves the root of `dist/`, so on that first
> deployment:
>
> - `https://<project>.vercel.app/monterogarage/en/` → **404.** The path does
>   not exist in the output.
> - `https://<project>.vercel.app/en/` → **200, but visibly broken.** The page
>   is there; every stylesheet, script and internal link in it points at
>   `/monterogarage/…`, which is nothing. Expect an unstyled page with dead
>   navigation.
>
> Neither is a misconfiguration and there is nothing to fix: **this is exactly
> what merging the PR fixes**, by setting `base` to `/`. Do not chase it, do
> not change any Vercel setting to work around it, and above all **do not
> treat "the site renders" as a gate on merging** — it cannot pass before the
> merge, and stalling here leaves you mid-cutover.
>
> Creating the project first is still right; it just proves a smaller thing
> than it looks. It proves the import, the build settings and the build
> itself work, so that when `main` moves, production is one automatic build
> away rather than an unknown. The render check happens in Step 2.

## Step 2 — Merge the T2-102 pull request

After the merge, `base` is `/` and `site` is `https://monterogarage.com`.
Vercel builds `main` automatically and the production deployment serves the
site at the root of the `*.vercel.app` domain.

**This is the first render check, and the real one.** On the production
`*.vercel.app` URL, confirm all of:

- `/en/` and `/es/` both load **and are styled** — styling is the tell, because
  it is the stylesheet path that the `base` change fixes;
- the navigation links work (they now point at `/en/…`, `/es/…`);
- `/monterogarage/en/` now 404s, which it should: that prefix is gone.

If `/en/` is still unstyled, Vercel is serving a cached older deployment —
check that the newest deployment is the one promoted to production.

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
3. **First, on the Namecheap "Domain" tab: NAMESERVERS must be "Namecheap
   BasicDNS".** Nothing you type on the Advanced DNS tab has any effect
   otherwise — Namecheap keeps showing you the record editor while the world
   asks a different set of nameservers, so `dig` returns someone else's answer
   and Vercel's card sits at "Invalid Configuration" with records that look
   perfect on screen. Check this before editing anything.
   (Custom DNS pointing at Vercel's own nameservers is the *other* supported
   path — a valid choice, but then the records below live in Vercel, not in
   Namecheap, and this runbook does not cover it. Pick BasicDNS.)

4. In Namecheap: **Domain List → monterogarage.com → Manage → Advanced DNS**.
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

5. **Set the APEX as the primary domain and redirect `www` to it.** This is
   required, not a preference: `astro.config.mjs` has
   `site: "https://monterogarage.com"`, so every canonical link and every
   hreflang href this site emits is an **apex** URL. Making `www` primary
   would put a 308 in front of every canonical URL on the site — the one shape
   of URL that must answer 200 directly. In Vercel: open the **apex** domain
   card, confirm it is the project's primary domain, then open the `www` card
   and use **Redirect to** → `monterogarage.com`.

   (Vercel's docs suggest `www`-primary for traffic-steering flexibility. That
   advice does not survive contact with a checked-in `site` value; if anyone
   ever wants `www`-primary, `astro.config.mjs` has to change in the same
   breath, and every canonical URL with it.)

6. Wait for both domain cards to read **Valid Configuration**. Vercel then
   issues the certificate automatically, usually within minutes. Verify from a
   terminal — note the deliberate absence of `-L` on the first four, so a
   redirect shows up as a redirect instead of being followed silently:

   ```bash
   dig a monterogarage.com +short         # → your card's A value
   dig cname www.monterogarage.com +short # → your card's CNAME target
   curl -sI https://monterogarage.com/en/ # → HTTP/2 200, NOT 3xx
   curl -sI https://monterogarage.com/es/ # → HTTP/2 200, NOT 3xx
   curl -sI https://www.monterogarage.com/en/  # → 308 to the apex (step 5)

   # The one thing nothing in this repository can predict: whether Vercel
   # serves the built `dist/404.html` for an unknown path, or its own
   # generic 404 page. Both are "working"; only the first is the bilingual
   # 404 this site ships (and MIG-05's footer notice with it).
   curl -sI https://monterogarage.com/no-such-page/   # → HTTP/2 404
   curl -s  https://monterogarage.com/no-such-page/ | grep -c "Mitsubishi Motors"
   #   1 or more → our 404.html is being served. Good, nothing to do.
   #   0         → Vercel's generic 404. Not a blocker for the cutover, but
   #               open an issue: the site's own error page is not reaching
   #               visitors. (Fix is a `routes`/rewrite entry in vercel.json;
   #               it needs a real deployment to test against, which is why it
   #               is not guessed at here.)
   ```

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
