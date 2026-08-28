# HANDOFF-DESIGN — Gitana visual direction (T209)

**Status:** Owner-approved 2026-08-28 ("design A" — the primary direction; the
two alternates on the canvas's Directions page were considered and not chosen).
**Source of truth:** the artboards in [`artboards/`](artboards/) (Design
Components HTML; every value below is lifted from them) and the live canvas
Artifact the owner refined. This document is the buildable summary. Where an
artboard and this document disagree, the artboard wins — fix the document.

Direction: **field manual with Costa Rican warmth** — utilitarian reference
structure, warm paper tones, one rust accent, monospace for data. Amber/red are
reserved exclusively for triage and safety so warning states never compete with
chrome.

## Palette

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F7F4EE` | page background |
| `panel` | `#FFFFFF` | cards, panels |
| `panel-soft` | `#FBF9F4` | de-emphasized cards (planned work, filtered-out rows) |
| `ink` | `#2B2620` | text, dark chrome (header/footer background) |
| `ink-soft` | `#3B342B` | secondary dark surfaces (vehicle bar, chips on dark) |
| `muted` | `#6E6559` | secondary text, section labels |
| `muted-strong` | `#55493C` | body copy on white panels, dark-chrome borders |
| `faint` | `#A99C88` | tertiary text, timestamps, placeholder |
| `line` | `#E4DDD1` | borders on paper/panels |
| `chip` | `#EFE9DD` | data-chip background |
| `rust` | `#B0532A` | accent: links, primary buttons, active locale, selection |
| `rust-deep` | `#93441F` | accent hover |
| `rust-tint` | `#FBEEE6` / border `#E9CDBB` | selected-option background |
| `green` | `#3E6B4F` | positive states (fit-count, done) |
| `green-tint` | `#E4EFE7`, text `#2F5E3F` | done badge |
| `on-dark` | `#F7F4EE` text, `#C9BFAF` secondary, `#F7C9A8` accent-on-dark | header/footer |

Triage + safety (bilingual, always):
| State | Colors |
|---|---|
| drive-normally | green `#3E7B4F` band, white text |
| drive-gently-repair-soon | amber `#8A5E14` band, white text, `#FFE9C4` secondary |
| do-not-drive | red `#A32C2C` band, white text |
| tow-only | dark red `#5A1F1F` band, white text |
| safety notice | bg `#FDF3E4`, border 1.5px `#B07A1F`, icon/strong `#8A5E14` |
| confidence caveat | bg `#EFEAE0`, border 1.5px **dashed** `#A99C88`, text `#55493C` |
| safety-critical chip | text `#7A2E2E`, bg `#F6E3D8`, border `#E4C4B0` |
| confidence chip | text `#4A5568`, bg `#E8EDF2`, border `#D2DAE3` |

## Typography

- **Archivo** (Google Fonts, weights 400/500/600/700/800) — all UI and prose.
  Fallback: `"Helvetica Neue", Arial, sans-serif`.
- **IBM Plex Mono** (400/500/600) — every *datum*: part numbers, dates,
  odometer, fitment chips, costs, times, breadcrumbs, source lists. If a value
  comes from shared `data`, it renders in Plex Mono.
- Scale (px): h1 34 (mobile 24) w800 lh1.15 ls-0.3; page-section h1 30;
  card title 17–19 w600–800; section label 13 w700 uppercase ls1.2 muted;
  body 14–15 lh1.5–1.7; chip/meta 12–13; fine print 11–12.
- Links: rust, hover rust-deep. `usted` register throughout ES.

## Spacing & shape

- Page padding 40px desktop / 16px mobile; header height 64px.
- Section gap 24–28; card padding 16–24; intra-card gap 10–14; chip rows gap 8.
- Radii: 8 (cards, banners), 6 (buttons, inputs, chips-large), 4 (data chips),
  999 (filter pills). Borders 1px `line`; emphasis borders 1.5–2px.
- Grids: two-column `repeat(2, minmax(0,1fr))` gap 16–24 on desktop; single
  column mobile. Mobile tap targets ≥44px.

## Component notes (per artboard)

- **Site chrome** ([Main](artboards/Main.dc.html), [ChromeMovil](artboards/ChromeMovil.dc.html)):
  dark `ink` header — GITANA wordmark w800 + "Montero · Pajero · Shogun";
  nav with rust underline on active; vehicle chip (Plex Mono, truck icon) and
  EN/ES switcher (active segment rust-filled) always visible; on mobile the
  vehicle chip moves to a second `ink-soft` bar. Footer: `ink`, disclaimer
  left (localized safety line from ui.ts), GitHub/report links right.
- **Problem page** ([Main](artboards/Main.dc.html) EN / [ProblemaES](artboards/ProblemaES.dc.html) ES):
  order is title → fitment/confidence/safety chips → **triage banner**
  (primary locale large, other locale small below — both always) → safety
  notice (both languages in one band, page locale first) → confidence caveat
  (dashed, only below `tsb`) → symptoms/diagnostics two-up → fix-path cards
  (time/cost-band/difficulty chips; difficulty rendered n/5) → numbered
  sources in Plex Mono with archive state.
- **Vehicle selector** ([Selector](artboards/Selector.dc.html)): three states —
  idle header CTA (rust button), open panel (generation as button row with
  rust-tint selection, market/year/engine dropdowns, impossible combos
  filtered), active state (ink chip with × clear, green fit-count line,
  non-fitting rows at 55% opacity with "filtered" tag, never hidden silently).
- **Garage timeline** ([Taller](artboards/Taller.dc.html)): stat row
  (odometer/entries/planned, Plex Mono) + pill tabs (Timeline/Current
  state/Planned). Vertical `line` rail, rust dots (filled=done,
  outlined=planned); entries show date·odometer above card; done=green badge,
  planned=dashed border on `panel-soft` + amber badge; chips for actual
  time/cost/parts; cross-links to problem/procedure as bordered mini-chips.
- **Glossary** ([Glosario](artboards/Glosario.dc.html)): search placeholder
  demonstrates alias search; system filter pills (active=ink); term cards:
  system tag color-coded, definitions in BOTH languages, alias chips with
  country tags (Plex Mono). *(Owner ruling 2026-08-28, supersedes the
  artboard on this one point: the headword is the PAGE LOCALE's own term —
  EN page leads English, ES page leads the CR term — not ES-first on both.
  Sort order follows the headword. No confidence caveat on term cards —
  see the AGENTS.md glossary carve-out of the same date.)*
- **Icons**: inline stroke SVG only (2px stroke, 16/20/24 grid) — truck,
  clock, warning triangle, info circle, search, chevron, hamburger, ×.
  Never emoji.

## Constraints carried from spec/CI

- Lighthouse budgets: a11y ≥95, performance ≥90 (currently 100/100) — the
  audit samples one page per collection automatically; new templates must stay
  within budget on first landing.
- WCAG2AA via Pa11y (axe + htmlcs) on every built page.
- All copy through the typed UI-strings module (I18N-08 lint); numbers only
  from shared `data` (never in prose); triage/safety/caveat rendered in both
  languages always.

## Alternates (not chosen, kept for reference)

- [DireccionOscura](artboards/DireccionOscura.dc.html) — "Night workshop"
  (dark/amber). Candidate for a future dark theme of THIS direction.
- [DireccionVerde](artboards/DireccionVerde.dc.html) — "Expedition green".

Sample data note: every cost, time, odometer figure and source link in the
artboards is layout sample data, not content. Real values arrive via T303/T403
with citations.
