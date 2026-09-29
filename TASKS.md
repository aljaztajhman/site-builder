# Tasks

Phase 1 plan: docs/phases/PHASE-1.md. Tick only what has been run and checked.

## Local (this machine: no Docker, no gh, no railway, no API key)
- [x] Portable Node 24 LTS + pnpm in `.tools/` (gitignored); git repo, `main` scaffold commit, `phase-1` worktree
- [x] Workspace: TS strict, eslint, vitest with network blocked in unit tests
- [x] Config in `config/app.config.json` (models, effort, prices, limits, targets)
- [x] Spec core: schema v1, facts/placeholders, design tokens, validation, migrations framework, JSON Schema export
- [x] Render core: page shell, tokens → CSS, shared bundle, export zip
- [ ] Component groups: heroes, content, business, structure + chrome (~30 components)
- [ ] 10 design directions + self-hosted subset fonts (č š ž ć đ test)
- [ ] 10 fixtures + 5 edits each + stand-in photo generator
- [ ] Platform: Postgres (pg + PGlite for tests/no-Docker dev), S3 storage (MinIO / Railway bucket / fs), pg-boss queue
- [ ] Engine: model client with per-stage token + € logging, spend cap; pipeline stages 1–6; JSON Patch edits
- [ ] Checks: axe, Lighthouse mobile, 360 px scroll + tap targets, banned patterns, fact check, critique pass
- [ ] Web: access password, noindex, dashboard (intake → progress → preview → chat edit → publish → export), `/s/{slug}/`, `/health`
- [ ] Worker service
- [ ] `pnpm eval` (real calls; `--only`, `--replay`), report.md + contact-sheet.png
- [ ] Offline check run over golden specs (no model calls) to prove components pass axe/Lighthouse/mobile checks
- [ ] Docker Compose (Postgres, MinIO), Dockerfiles (web; worker on Playwright image), railway.json
- [ ] GitHub Actions: typecheck, lint, test on PRs; eval on manual trigger
- [ ] README (setup < 10 lines), .env.example

## Needs the home PC (Docker, gh, railway, API key)
- [ ] `docker compose up -d && pnpm i && pnpm dev` from a clean clone
- [ ] Create private GitHub repo `site-builder`, push main + phase-1 branch, open PR, CI green
- [ ] `pnpm eval` with real model calls; record fixtures for unit tests (`--record`)
- [ ] Railway project: web, worker, Postgres, bucket; PR environments or `preview` env; access password variable; `/health` green
- [ ] Generate ≥ 2 fixtures end to end on the deployed environment
