# GitHub Pages tombstone

The four HTML files next to this README are **not part of the site**. They are
the decommissioning notice that replaces it on its old host.

Montero Garage was published as a GitHub Pages project site at
`https://sandgraal.github.io/monterogarage/` until T2-102 moved hosting to
Vercel behind `https://monterogarage.com` (002 MIG-02). `.github/workflows/
ci.yml` no longer deploys anything, which *freezes* the last Pages deployment
rather than removing it — so the old URL keeps serving a stale-but-working
copy of the site until someone publishes something else over it. These files
are that something else.

They are published by `.github/workflows/pages-tombstone.yml`, which runs on
`workflow_dispatch` only and refuses to run until `monterogarage.com` is
actually answering. Read that workflow's header for the sequence.

## Why the text is hard-coded here

I18N-08 ("no user-facing string is hard-coded in a component; UI text goes
through the typed UI-strings module in both locales") governs the *site*.
These files are not the site: they are four static bytes-on-a-dead-host that
must keep working after this repository stops deploying to that host at all,
and after every string in `src/i18n/ui.ts` has moved on. Wiring them to the
live strings module would make a decommissioned host a consumer of live UI
copy — a coupling that can only rot. The bilingual rule is still honoured in
substance: every one of these pages says the same thing in English and in
Spanish, and neither locale is privileged.

## Files

| File            | Serves                                     | Sends you to                     |
| --------------- | ------------------------------------------ | -------------------------------- |
| `index.html`    | `/monterogarage/`                          | `https://monterogarage.com/`     |
| `en/index.html` | `/monterogarage/en/`                       | `https://monterogarage.com/en/`  |
| `es/index.html` | `/monterogarage/es/`                       | `https://monterogarage.com/es/`  |
| `404.html`      | every other path under `/monterogarage/`   | the same path on the new domain  |

`404.html` is the one that does the real work: it is what GitHub Pages serves
for every deep link into the old site (`/monterogarage/en/glossary/`, every
future page, every link anyone ever shared), and it maps the path across to
the new domain in JavaScript rather than dumping everyone at the root. The
three redirect pages exist because the three paths they cover are the ones a
person is most likely to have bookmarked, and a `<meta http-equiv="refresh">`
works with JavaScript off.
