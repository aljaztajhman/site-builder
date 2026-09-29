# Tasks

Product brief and roadmap: docs/PRODUCT.md. Phase plans: docs/phases/. Tick only what has been run and checked.
Work top-down: finish the current phase's "Done means" before starting the next phase.

## Now: close phase 1 (docs/phases/PHASE-1.md "Done means")

Status against "Done means" (2026-09-29):
- [x] Clean clone: `docker compose up -d && pnpm i && pnpm dev` runs everything; README setup < 10 lines
- [x] `pnpm test` passes with no network calls; CI green on every PR
- [x] Repo on GitHub, phase 1 PR merged (#1), follow-ups #2–#4 merged
- [x] `pnpm eval` live, all 10 fixtures: 54/54 checkpoints pass every check, median generation €0.23 / 154 s (full site; targets €1.50 / 240 s), €2.71 per run — **except the items below**
- [x] Eval: zobozdravstvo-lebar failed at the brief stage (a navLabel over 24 chars, twice). Intermittent: generated fine on re-run (6/6). `callJson` now retries up to 2× with the validation errors (PRODUCT.md: max 2), was 1×
- [x] Eval: opening-hours edit crashed edit validation (`reading 'forEach'`): fact checks ran on a spec that had already failed validation; the model guessed the hours format because the edit prompt never showed /business's schema. Fact checks now run only on a valid spec; the edit prompt includes the business schema
- [x] Eval: "warmer palette" edits were rejected (cream backgrounds, low-contrast accents). The prompt promised "code keeps contrast" but edits skipped `enforceDesign`; design edits now get the same repair as generation. Re-run: frizerstvo-lana and kmetija-grabnar pass
- [ ] Eval: trgovina-oljka-in-sol "more olive and terracotta" fails `colorWarmer` (primary hue 30→73, i.e. olive as asked); the check measures closeness to orange. Decide: check the accent for terracotta, or accept olive as warmer — not changed yet
- [x] Eval: critique answers that were unusable failed the whole generation (a self-corrected double answer; a 420-char note against a 300 limit). JSON extraction now takes the last complete answer of the main shape; critique notes are trimmed; an unusable critique keeps the checked site with a logged warning
- [ ] Eval: homepage-preview target (≤ €0.30, ≤ 60 s) never measured — run `pnpm eval --scope home`
- [x] Deployed: login redirect 400 fixed (#3), live after Railway's deploy pause lifted; verified `/` → 302 → `/login?next=%2F` 200, traversal guard still 400
- [ ] Deployed: full manual flow on the live URL — intake with own photos, preview mobile/desktop, chat edit, publish, open `/s/{slug}/`, download export, open export offline
- [x] Deployed: ≥ 2 fixtures generated end to end (pekarna-kvas €0.24, gostilna-zlata-zlica €0.16; all checks pass)
- [x] Deployed: everything in EU West (Amsterdam). Railway had no migrate button for the volume, so (owner's call) the `sfo` volume was deleted and a new one created in `ams` (2026-09-29); test data lost, the 2 test sites regenerated
- [ ] Deployed: production environment tracking `main` (only `preview` exists; it now tracks `main`)
- [x] Monthly Railway cost from measured usage (3 h window, 2026-09-29): memory avg 1.37 GB (worker 0.74, web 0.56, Postgres 0.07) ≈ $13.70, CPU avg 0.02 vCPU ≈ $0.40 → **≈ $15/month + plan fee** at $10/GB·month and $20/vCPU·month (Railway docs); volume and bucket hold < 1 GB (their per-GB prices not confirmed). Budget €50/month

## Next: phase 2 — auth, preview limits, visual editor, contact forms

Draft plan: docs/phases/PHASE-2.md — 5 decisions there are the owner's (sign-in method, who gets full sites before billing, Puck vs current editor, email domain, production env). Scope:
- [ ] Accounts: email + magic link sign-in, sessions, one owner per site (replaces the shared access password for clients; keep it for the internal dashboard)
- [ ] Free preview limits from PRODUCT.md: homepage only, watermarked, not publishable, email-verified, rate-limited per email/IP; limits in config
- [ ] Visual editor: evaluate Puck against the current direct editor (schema-driven forms + inline text); decide, then build the chosen path. Must stay spec-only (every edit is a spec change)
- [ ] Contact forms: form component, server endpoint, spam protection (honeypot + rate limit, no third-party captcha before consent), email via Resend, submissions stored per site
- [ ] Transactional email via Resend (magic links, form notifications); domain + DNS records
- [ ] Mobile owner flows: the dashboard usable at 360 px (owners manage the site from a phone)
- [ ] Eval: add auth/limits checks to the deployed smoke test (`remote-intake.ts`)

## Later: phase 3 — CMS collections
- [ ] Collections the client edits: blog, services, price list (cenik), team, events; spec migration + components + editor forms
- [ ] Per-collection list/detail pages, RSS for the blog, sitemap entries
- [ ] Slovene formatting for dates, prices and plurals in every collection view

## Later: phase 4 — billing and domains
- [ ] Legal entity first (no billing before it exists)
- [ ] Stripe: flat monthly plan, trial = free preview, dunning, invoices with Slovene VAT rules
- [ ] Platform domain, `{slug}.<domain>` subdomains, Cloudflare for SaaS for customer domains
- [ ] Domain registration via the Openprovider API

## Follow-ups (not blocking a phase)
- [x] Worker ran one job at a time (two deployed intakes queued, 322 s wall each). Measured: worker 0.55 GB idle, 1.69 GB peak with one generate job (limit 8 GB) → generate jobs now run 2 in parallel (`limits.jobConcurrency`); edits and publishes stay sequential (same-site version conflicts)
- [ ] Web and worker idle at ~0.5 GB each because they run TypeScript through `tsx` at runtime; a compiled build would cut the largest cost line
- [ ] Accessibility statement date uses render date (changes on republish); make it a spec field if that matters
- [ ] CSP allows 'unsafe-inline' scripts (header `js`-class snippet); move it to nav.js or a hash
- [ ] Offline export verified in Chromium only; Firefox may block `file://` fonts from a parent folder — not verified
- [ ] Newsreader font file is 62 KB (target 60)
- [ ] team:grid looks uneven when only some members have portraits
- [ ] Railway bucket: confirm virtual-hosted vs path style in the bucket's Credentials tab; S3 keys are validated in code
- [ ] Railway PR environments are on (`site-builder-pr-5` appeared): each open PR runs a full copy of web, worker and Postgres; decide whether to keep them (cost) or keep only `preview`
- [ ] Worker replay mode (`MODEL_REPLAY_DIR`) replays the same recorded edit for every chat message; fine for demos only

## Done (phase 1 build)
- Workspace (TS strict, eslint, vitest with network blocked), config in `config/app.config.json`
- Spec v1 (facts/placeholders, tokens, validation, migrations, JSON Schema export); render (preview = publish = export, byte-identical)
- 27 section types + header/footer/mobile action bar/consent; 10 design directions; 19 subset fonts (č š ž ć đ test)
- 10 fixtures × 5 scripted edits, stand-in photos, 10 golden specs, real recordings for 9 fixtures
- Platform (Postgres/PGlite, S3/MinIO/fs, pg-boss); engine (pipeline stages 1–6, per-stage token/€ logging, daily cap, fact verification, JSON Patch edits); checks (axe, Lighthouse, 360 px, tap targets, banned patterns, facts, offline export)
- Direct editor (no model calls), web app (password, noindex, intake → preview → edit → publish → export, `/s/{slug}/`, `/health`), worker
- `pnpm eval` (live / record / replay / offline); Docker Compose; Dockerfiles; GitHub Actions; README
- Fixed along the way: MinIO image gone from Docker Hub (pgsty/minio fork), `tsx watch` hang on Windows, empty env values, recordings numbering, login redirect 400, `failInterrupted` race
- Railway `preview` env: web + worker from `main` in `ams`, Postgres, bucket `site-files` in `ams`, `ACCESS_PASSWORD` variable, `/health` green
