# Gitana

**EN** · A bilingual reference and build log for the Mitsubishi
Montero / Pajero / Shogun — all generations (1982–2021), all markets — built
around one 2002 Montero (Gen 3, 6G74, Super Select 4WD II) named **Gitana**.

**ES** · Referencia bilingüe y bitácora de proyecto del Mitsubishi
Montero / Pajero / Shogun — todas las generaciones (1982–2021), todos los
mercados — construida alrededor de un Montero 2002 (Gen 3, 6G74,
Super Select 4WD II) llamado **Gitana**.

## What lives here / Qué hay aquí

| | EN | ES |
|---|---|---|
| 🔧 | **Build log** — every job done to the truck: parts, costs, time, outcomes | **Bitácora** — cada trabajo hecho al carro: repuestos, costos, tiempo, resultados |
| 🩺 | **Problem finder** — symptom-first diagnosis for common failures | **Buscador de problemas** — diagnóstico por síntomas de fallas comunes |
| ⚙️ | **Parts & fitment** — OEM numbers, supersessions, what actually fits what | **Repuestos y compatibilidad** — números OEM, sustituciones, qué le sirve a qué |
| 📖 | **Procedures** — torque specs, fluids, intervals, honest difficulty | **Procedimientos** — torques, fluidos, intervalos, dificultad honesta |
| 🏗️ | **Modifications** — lifts, tires, armor, with real tradeoffs | **Modificaciones** — suspensión, llantas, protección, con ventajas y desventajas reales |
| 🌎 | **Community directory** — where Montero people actually are, EN + ES | **Directorio de comunidades** — dónde está la gente del Montero, EN + ES |

Every page exists in **both English and Costa Rican Spanish** — equal
footing, always. Every numeric spec carries a source. Every fact declares
exactly which trucks it applies to. Confidence tiers
(`fsm-confirmed` → `anecdotal`) are shown honestly.

## Stack

Astro · TypeScript strict · Zod-typed content collections (content lives in
git, every fact is a reviewable diff) · Vitest + Playwright · GitHub Pages.
Supabase serves as a derived search read-model only (phase 8) — never the
source of truth.

## Contributing / Contribuir

v1 is read-only; contributions come through GitHub:

- **[Report a problem / Reportar un problema](../../issues/new?template=report-a-problem.yml)**
- **[Correct a fact / Corregir un dato](../../issues/new?template=correct-a-fact.yml)**
- **[Suggest a mod / Sugerir una modificación](../../issues/new?template=suggest-a-mod.yml)**

PRs welcome — see the checklist in the PR template. Corrections with a
source get merged fastest. / Se aceptan PRs — vea la lista en la plantilla.
Las correcciones con fuente se integran más rápido.

## Development

This repo is built by a conducted fleet of AI agents — see `AGENTS.md`
(constitution), `CLAUDE.md` (operating mode), and
`specs/001-foundation/` (spec of record). Start work with `/conduct next`.

```bash
nvm use 24
npm install
npm run verify   # everything CI runs
npm run dev      # http://localhost:4321/Gitana-Montero/
```

The site is served under a base path (`base` in `astro.config.mjs`), so local
URLs include it: `/Gitana-Montero/en/` and `/Gitana-Montero/es/`.
`/Gitana-Montero/` itself is a redirect shim that picks a locale — it is not a
page. Both locales are always built; `npm run check:hreflang` fails the build
if any page's `en`/`es` pair or `x-default` is missing or asymmetric.

## Safety note / Nota de seguridad

**EN:** This site documents work on 20+ year old vehicles. Nothing here is a
substitute for a qualified mechanic on brakes, steering, suspension, fuel,
or SRS systems.
**ES:** Este sitio documenta trabajos en vehículos de más de 20 años. Nada
aquí sustituye a un mecánico calificado en frenos, dirección, suspensión,
combustible o sistemas SRS.
