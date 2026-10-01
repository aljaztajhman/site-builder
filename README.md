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
| `pnpm eval [--only <id>]` | Generates the 10 fixtures with real model calls, applies the scripted edits, writes `eval/report.md` and `eval/contact-sheet.png`. Costs money. |
| `pnpm eval --offline` | Same checks on hand-authored golden specs, no model calls. |
| `pnpm eval --record` / `--replay` | Record model exchanges for tests / replay them. |
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
