# Tasks

Phase 1 plan: docs/phases/PHASE-1.md. Tick only what has been run and checked.

## Done on the work PC (no Docker, gh, railway or API key there)
- [x] Portable Node 24 LTS + pnpm in `.tools/` (gitignored); git repo, `main` scaffold commit, `phase-1` worktree
- [x] Workspace: TS strict, eslint, vitest with network blocked in unit tests
- [x] Config in `config/app.config.json` (models, effort, prices, limits, targets)
- [x] Spec v1: facts/placeholders, design tokens, validation (structure, references, contrast, banned copy), migrations framework, JSON Schema export
- [x] Render: page shell, tokens → CSS, shared bundle (`_shared/<hash>/`), preview = publish = export (byte-identical, tested)
- [x] 27 section types + header (3 variants, tone), footer (2), mobile action bar, cookie consent; islands nav/consent/gallery
- [x] 10 design directions, 19 subset fonts (č š ž ć đ test)
- [x] 10 fixtures + 5 edits each + stand-in photo generator
- [x] 10 golden specs (hand-authored, fact-checked) for offline eval and demos
- [x] Platform: Postgres / PGlite, S3 / MinIO / fs storage, pg-boss queue (tested on PGlite)
- [x] Engine: model client (per-stage token + € logging, daily cap), pipeline stages 1–6, fact verification, JSON Patch edits
- [x] Checks: axe (360/1280), Lighthouse mobile, 360 px scroll, tap targets, text size, one-tap call/directions, banned patterns, facts, export offline
- [x] Direct editor (no model calls): schema-driven forms, outline move/duplicate/delete/add, click-to-select + double-click inline text editing in the preview, facts, design, pages, versions/undo; starter text blocks publishing
- [x] Web: access password, noindex, intake → progress → preview (mobile/desktop) → edit → publish → export, `/s/{slug}/`, `/health`
- [x] Worker service; pipeline replay test (synthetic recordings, no network)
- [x] `pnpm eval` (live / `--record` / `--replay` / `--offline`), report.md + contact-sheet.png
- [x] Docker Compose (Postgres, MinIO), Dockerfiles (web; worker on Playwright image); Railway service settings set via API (config-as-code is deprecated on Railway)
- [x] GitHub Actions: typecheck, lint, test on PRs; eval on manual trigger
- [x] README (setup < 10 lines), .env.example
- [x] Diff review (subagent): 12 findings fixed — param/path validation + CSP, login redirect, body limits, throttle, storage key guard, protected spec paths, publish under site slug, fact check blocks publish, stricter fact matching, version CAS, queued editor saves, spend-cap pricing, interrupted-job recovery, locked migrations
- [x] Offline eval: 10/10 golden sites pass every check (eval/offline-report.md, eval/offline-contact-sheet.png)

## Needs the home PC (Docker, gh, railway, API key)
- [x] `docker compose up -d && pnpm i && pnpm dev` from a clean clone — fixed on the way: `minio/minio` is gone from Docker Hub (now `pgsty/minio` fork, pinned), `tsx watch` hangs on Windows when stdin is a pipe (dev scripts use `node --watch --import tsx`), empty `APP_CONFIG_PATH=`/`PORT=`/`S3_*=` from .env.example were read as values, `POSTGRES_PORT` for machines with a local Postgres on 5432. Local intake (pekarna-kvas, replay) → ready v3, all checks pass; chat edit replay → v4
- [x] Push to private GitHub repo `site-builder`, open the phase 1 PR, CI green (PR #1, merged)
- [x] Structured-output schema for content: rejected by the API (union limit) → content uses plain JSON + zod validation + one retry
- [ ] `pnpm eval` with real model calls on all 10 fixtures (budget €25/run). Done so far: pekarna-kvas only — €0.40, 6/6 checkpoints, 1 of 5 edits fails its check, generation 277 s (target ≤ 240 s; check stage 200 s of it)
- [ ] `pnpm eval --record` for the other fixtures (pekarna-kvas recorded; replay test uses it: generation + all 5 edits). Recordings were numbered per phase and couldn't replay; the runner now shares one transport per fixture
- [ ] Tune prompts until the edit checks and cost/time targets hold; report real medians
- [x] Railway project `site-builder`, env `preview`: web + worker (Dockerfiles, branch `phase-1`), Postgres, bucket `site-files`; `ACCESS_PASSWORD` set; `/health` green; noindex header
- [ ] ≥ 2 fixtures generated on the deployed env (`tools/eval/src/remote-intake.ts`; run `pnpm fixtures:photos` first)
- [ ] Estimate monthly Railway cost from real usage
- [ ] Point the Railway services at `main` (or a PR environment) now that phase 1 is merged; they still track `phase-1`

## Found / follow-ups
- [ ] Accessibility statement date uses render date (changes on republish); make it a spec field if that matters
- [ ] Header inline script (`js` class) conflicts with a strict CSP; revisit when adding CSP
- [ ] Offline export verified in Chromium only; Firefox may block `file://` fonts from a parent folder (falls back to system fonts) — not verified
- [ ] Newsreader font file is 62 KB (target 60)
- [ ] CSP allows 'unsafe-inline' scripts (header js-class snippet); move it to nav.js or a hash
- [ ] Railway bucket: confirm virtual-hosted vs path style in the bucket's Credentials tab; S3 keys are validated in code
- [ ] team:grid looks uneven when only some members have portraits
- [ ] Cormorant Garamond dropped (misplaced carons in the variable font); EB Garamond instead
- [ ] Railway web/worker/Postgres run in `sfo` (US West) while the bucket is in `ams`; for Slovene users and GDPR, move services to an EU region (Postgres move = volume migration)
- [ ] Worker replay mode (`MODEL_REPLAY_DIR`) replays the same recorded edit for every chat message; fine for demos only
