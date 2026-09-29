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
- [x] Docker Compose (Postgres, MinIO), Dockerfiles (web; worker on Playwright image), `railway/*.json`
- [x] GitHub Actions: typecheck, lint, test on PRs; eval on manual trigger
- [x] README (setup < 10 lines), .env.example
- [x] Diff review (subagent): 12 findings fixed — param/path validation + CSP, login redirect, body limits, throttle, storage key guard, protected spec paths, publish under site slug, fact check blocks publish, stricter fact matching, version CAS, queued editor saves, spend-cap pricing, interrupted-job recovery, locked migrations
- [x] Offline eval: 10/10 golden sites pass every check (eval/offline-report.md, eval/offline-contact-sheet.png)

## Needs the home PC (Docker, gh, railway, API key)
- [ ] `docker compose up -d && pnpm i && pnpm dev` from a clean clone (Dockerfiles and compose are unverified: no Docker here)
- [ ] Push to private GitHub repo `site-builder`, open the phase 1 PR, CI green
- [ ] `pnpm eval` with real model calls (budget €25/run); check the structured-output schema for content is accepted (fallback: `structuredOutputForContent: false`)
- [ ] `pnpm eval --record` and replace synthetic recordings with real ones for unit tests
- [ ] Tune prompts until the edit checks and cost/time targets hold; report real medians
- [ ] Railway project: web, worker, Postgres, bucket; PR environments or `preview` env; `ACCESS_PASSWORD` variable; `/health` green; ≥ 2 fixtures generated on the deployed env
- [ ] Estimate monthly Railway cost from real usage

## Found / follow-ups
- [ ] Accessibility statement date uses render date (changes on republish); make it a spec field if that matters
- [ ] Header inline script (`js` class) conflicts with a strict CSP; revisit when adding CSP
- [ ] Offline export verified in Chromium only; Firefox may block `file://` fonts from a parent folder (falls back to system fonts) — not verified
- [ ] Newsreader font file is 62 KB (target 60)
- [ ] CSP allows 'unsafe-inline' scripts (header js-class snippet); move it to nav.js or a hash
- [ ] Railway bucket: confirm virtual-hosted vs path style in the bucket's Credentials tab; S3 keys are validated in code
- [ ] team:grid looks uneven when only some members have portraits
- [ ] Cormorant Garamond dropped (misplaced carons in the variable font); EB Garamond instead
