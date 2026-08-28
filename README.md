# Montero Garage

**EN** · A bilingual platform where any Mitsubishi Montero / Pajero / Shogun
owner keeps their truck's whole life — a named vehicle profile, every receipt,
every job — private by default, shareable by choice. It sits on a reference
covering all generations (1982–2021) and all markets. The owner's own 2002
Montero (Gen 3, 6G74, Super Select 4WD II), **Gitana Blanca**, is user page #1
and the template every other garage is shaped by.

**ES** · Plataforma bilingüe donde cualquier dueño de un Mitsubishi
Montero / Pajero / Shogun guarda la vida entera de su carro — un perfil del
vehículo con nombre, cada factura, cada trabajo — privado por defecto y
compartido por decisión suya. Está construida sobre una referencia que cubre
todas las generaciones (1982–2021) y todos los mercados. El Montero 2002 del
dueño (Gen 3, 6G74, Super Select 4WD II), **Gitana Blanca**, es la página de
usuario #1 y la plantilla de la que salen todas las demás.

## What lives here / Qué hay aquí

| | EN | ES |
|---|---|---|
| 🚙 | **Your garage** — your vehicles, records and receipts: parts, costs, time, outcomes | **Su taller** — sus vehículos, registros y facturas: repuestos, costos, tiempo, resultados |
| 🩺 | **Problem finder** — symptom-first diagnosis for common failures | **Buscador de problemas** — diagnóstico por síntomas de fallas comunes |
| ⚙️ | **Parts & fitment** — OEM numbers, supersessions, what actually fits what | **Repuestos y compatibilidad** — números OEM, sustituciones, qué le sirve a qué |
| 📖 | **Procedures** — torque specs, fluids, intervals, honest difficulty | **Procedimientos** — torques, fluidos, intervalos, dificultad honesta |
| 🏗️ | **Modifications** — lifts, tires, armor, with real tradeoffs | **Modificaciones** — suspensión, llantas, protección, con ventajas y desventajas reales |
| 🌎 | **Community directory** — where Montero people actually are, EN + ES | **Directorio de comunidades** — dónde está la gente del Montero, EN + ES |

Every page exists in **both English and Costa Rican Spanish** — equal
footing, always. Every numeric spec carries a source. Every fact declares
exactly which trucks it applies to. Confidence tiers
(`fsm-confirmed` → `anecdotal`) are shown honestly. What a user enters about
their own truck is their own record: shown as their testimony, never dressed
up as a site-verified reference fact.

## Stack

Astro · TypeScript strict · Zod-typed content collections (reference content
lives in git, every fact is a reviewable diff) · Vitest + Playwright ·
Supabase for accounts, user vehicles/records and private receipt storage,
behind row-level security · Vercel for hosting.

### Where it is deployed, right now

The rename to `monterogarage` (002 MIG-01) landed before the replatform
(MIG-02), so the live site is still a **GitHub Pages project site** at
`https://sandgraal.github.io/monterogarage/`, and `base` in
`astro.config.mjs` is `/monterogarage` — a Pages project site is served under
`/<RepoName>/`, and CI asserts the two agree. Links from the old
`Gitana-Montero` URLs work via GitHub's repository redirect.

T2-102 moves hosting to Vercel behind **monterogarage.com**, at which point
`site` becomes `https://monterogarage.com`, `base` becomes `/`, and the CI
base assertion retires. Both values live in `astro.config.mjs` and nowhere
else.

## Contributing / Contribuir

Reference content is contributed through GitHub, not through the site:

- **[Report a problem / Reportar un problema](../../issues/new?template=report-a-problem.yml)**
- **[Correct a fact / Corregir un dato](../../issues/new?template=correct-a-fact.yml)**
- **[Suggest a mod / Sugerir una modificación](../../issues/new?template=suggest-a-mod.yml)**

PRs welcome — see the checklist in the PR template. Corrections with a
source get merged fastest. / Se aceptan PRs — vea la lista en la plantilla.
Las correcciones con fuente se integran más rápido.

## Development

This repo is built by a conducted fleet of AI agents — see `AGENTS.md`
(constitution), `CLAUDE.md` (operating mode), `specs/001-foundation/`
(the reference platform) and `specs/002-montero-garage/` (the multi-user
pivot, spec of record). Start work with `/conduct next`.

```bash
nvm use 24
npm install
npm run verify          # every merge-blocking check except link/a11y
npm run dev             # http://localhost:4321/monterogarage/

# The three gates CI adds on top of `verify`, all against the built site:
npm run check:links     # cited sources reachable (network)
npm run test:a11y       # Pa11y, WCAG 2.1 AA
npm run test:lighthouse # accessibility ≥ 95, performance ≥ 90 (SCF-06)
```

`test:a11y` and `test:lighthouse` need `dist/` (run `npm run build` first) and
an installed Chrome. Neither downloads a browser: set `CHROME_PATH` if yours
is somewhere unusual — the error message lists the paths that were tried.

The site is served under a base path (`base` in `astro.config.mjs`), so local
URLs include it: `/monterogarage/en/` and `/monterogarage/es/`.
`/monterogarage/` itself is a redirect shim that picks a locale — it is not a
page. Both locales are always built; `npm run check:hreflang` fails the build
if any page's `en`/`es` pair or `x-default` is missing or asymmetric.

## Safety note / Nota de seguridad

**EN:** This site documents work on 20+ year old vehicles. Nothing here is a
substitute for a qualified mechanic on brakes, steering, suspension, fuel,
or SRS systems.
**ES:** Este sitio documenta trabajos en vehículos de más de 20 años. Nada
aquí sustituye a un mecánico calificado en frenos, dirección, suspensión,
combustible o sistemas SRS.

## Not affiliated / Sin afiliación

**EN:** An independent enthusiast site. Not affiliated with Mitsubishi Motors.
Montero, Pajero and Shogun are trademarks of their respective owners.
**ES:** Un sitio independiente de aficionados. Sin afiliación con Mitsubishi
Motors. Montero, Pajero y Shogun son marcas de sus respectivos dueños.
