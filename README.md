# site-builder

AI website builder for Slovenian small businesses. Product brief: `docs/PRODUCT.md`. Phase plans: `docs/phases/`. Tasks: `TASKS.md`.

## Setup

```bash
cp .env.example .env        # add ANTHROPIC_API_KEY
docker compose up -d        # Postgres + MinIO
pnpm i
pnpm dev                    # web on http://localhost:3000 + worker; admin: ACCESS_PASSWORD, owners: email link (printed in the console)
```

No Docker? Set `DATABASE_URL=pglite://./.data/pg` and `STORAGE_DRIVER=fs` in `.env`, then `pnpm dev:lite`.

## Commands

| Command | What |
| --- | --- |
| `pnpm test` | Unit tests. No network; model responses come from recordings. |
| `pnpm typecheck`, `pnpm lint` | CI runs these plus `pnpm test` on every PR. |
| `pnpm eval [--only <id>]` | Generates the 10 fixtures with real model calls, applies the scripted edits, writes `eval/report.md` and `eval/contact-sheet.png` (`--scope home`: `report-home.md`; with `--only`: `eval/runs/`, so the baseline stays). Costs money. |
| `pnpm eval --offline` | Same checks on hand-authored golden specs, no model calls (`eval/offline-report.md`). |
| `pnpm eval --record` / `--replay` | Record model exchanges for tests / replay them. |
| `pnpm eval --record-missing` | Replay the calls whose request is unchanged and pay only for the rest (a changed stage and the ones after it), rewriting the recordings in place. Judge calls go out as one Message Batch (half price); fal pictures are cached in `tools/eval/image-cache/`. |
| `pnpm eval --twins --no-edits` | Also generate the 12 twins (tools/eval/twins: more businesses of the same trades) and skip the scripted edits; `eval/variety-*.md` reports how alike sites of one trade look. Paid. |
| `pnpm variety:sheet` | Renders every template × palette × hero of the template families at 360 and 1280 px with the page checks (eval/look/families-*.jpg). No model calls. |
| `pnpm variety:skeleton` | Renders every skeleton family (header, phone actions, footer, section styles; spec v15) on three goldens at 360 and 1280 px with the page checks and one call button per screen (eval/look/skeleton-*.jpg). No model calls. |
| `pnpm recordings:home` | Rebuild the homepage-scope replays (`tools/eval/recordings/<id>/home/`) from the golden specs, no model calls. |
| `pnpm fonts` | Rebuilds the subset fonts in `packages/render/assets/fonts`. |
| `pnpm fixtures:photos` | Generates the fixtures' stand-in photos. |

## Layout

- `packages/spec` — the site spec (zod, versioned, migrations) — the single source of truth.
- `packages/components` — React section components + one shared stylesheet + tiny JS islands.
- `packages/render` — spec → static HTML (preview, publish and export use the same function).
- `packages/engine` — generation pipeline, model client (per-stage token/€ logging, spend cap), direct editor, checks.
- `packages/platform` — Postgres/PGlite, S3/MinIO/fs storage, pg-boss queue.
- `apps/web` — landing page at `/`, dashboard at `/sites`, API, preview, published sites at `/s/{slug}/`, `/health`.
- `apps/worker` — pipeline jobs (Playwright image in production).
- `tools/eval` — fixtures, eval runner, report.

Editing a site in the dashboard (text, blocks, facts, design, pages) is deterministic and never calls the model; only the AI assistant tab does.
