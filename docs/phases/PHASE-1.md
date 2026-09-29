# Phase 1: engine, preview, chat edits, publish, export

Read CLAUDE.md and docs/PRODUCT.md first. Build phase 1 as described there.

## Prerequisites (I do these before the run)

- `gh auth login` and `railway login` done on this machine.
- `ANTHROPIC_API_KEY` in `.env`.

If any of these is missing, ask me before starting anything else.

## Scope

- GitHub: private repo `site-builder` under github.com/aljaztajhman (working name). Initial scaffold pushed to main; all phase 1 work on a branch with a pull request. GitHub Actions on every PR: typecheck, lint, `pnpm test`. `pnpm eval` runs only on manual trigger because it costs money.
- Railway: one project with a web service, a worker service (Dockerfile based on the official Playwright image), Postgres and a bucket, deployed from the GitHub repo. Production tracks main. Enable PR environments so the phase 1 PR gets its own URL; if that can't be done from the CLI or API, create a `preview` environment tracking the phase 1 branch.
- The deployed URL is public, so: dashboard and API sit behind a single access password (generated, stored as a Railway variable), every response sends `X-Robots-Tag: noindex`, and generation stops once a daily model-spend cap (config, default €10) is reached. Published sites at `/s/{slug}/` are viewable without the password.
- `GET /health` checks the database, bucket and queue.
- Monorepo: `apps/web` (dashboard and API), `packages/spec`, `packages/components`, `packages/engine`, `packages/render`, `tools/eval`. Docker Compose for Postgres and MinIO.
- Site spec schema with a version field and a JSON Schema export for the model.
- Component library of about 30 section components with variants, covering the business types in PRODUCT.md: header and nav, heroes, services, about, team, gallery, price list (cenik), menu, opening hours, contact with consent-gated map, FAQ, CTA, booking link, footer with provider information, legal pages, cookie consent, 404.
- At least 8 design directions, each with token ranges, a font pair, layout preferences and an imagery treatment. Each must look clearly different from the others on the contact sheet.
- The generation pipeline from PRODUCT.md, with token and € logging per stage.
- Dashboard: intake form (description, logo, photos) → progress → preview with a mobile/desktop toggle → chat edit box → publish → download export. Plain and functional; it's an internal tool in this phase.
- Publish to storage, served at `/s/{slug}/`.
- 10 fixture briefs in Slovene, one per business type, with realistic but fictional facts. At least 3 have missing facts (no prices, no opening hours, no photos) to test placeholders. Use locally generated placeholder photos; don't commit copyrighted images.
- 5 scripted chat edits per fixture, mixed Slovene and English, for example: "temnejša glava", "dodaj pogosta vprašanja", "remove the gallery", "change the phone number to …", "use a warmer palette".

## Out of scope

Auth, billing, preview limits, visual editor, CMS editing UI, custom domains, domain registration, additional locales, email sending.

## Done means

- From a clean clone, `docker compose up -d && pnpm i && pnpm dev` runs everything. README setup is under 10 lines.
- `pnpm test` passes with no network calls.
- `pnpm eval` generates all 10 fixtures end to end with real model calls, applies all scripted edits, and writes `eval/report.md` and `eval/contact-sheet.png` (mobile screenshots of every homepage in a grid). Every site, after generation and after each edit:
  - validates against the spec schema
  - has zero axe-core violations
  - scores on Lighthouse mobile: performance ≥ 90, accessibility 100, best practices ≥ 95, SEO ≥ 95
  - has no horizontal scroll at 360 px and meets the tap-target sizes in the mobile checklist
  - has no banned pattern flagged by code checks or the critique pass
  - shows no phone number, address, price, opening hour or name that isn't in the brief or marked as a placeholder
- The report shows per site: scores, € cost per stage, total time. Medians meet the cost and time targets in PRODUCT.md, or the report states the real numbers and what drives them.
- The repo is on GitHub, the phase 1 PR is open, and CI is green on it.
- The phase 1 environment on Railway is live and `/health` is green. On its URL I can log in with the access password, run an intake with my own photos, see the preview on mobile and desktop, make chat edits, publish, open the site at `/s/{slug}/` and download the export. At least 2 fixtures have been generated end to end on the deployed environment, not only locally.
- The export zip opens correctly offline.
- Found includes the phase 1 URL, the name of the Railway variable holding the access password (not its value), and the estimated monthly Railway cost.

Split the component library and the fixtures across subagents. Stop and ask only as CLAUDE.md says.
