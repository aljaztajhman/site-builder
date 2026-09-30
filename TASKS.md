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
- [x] Eval: homepage preview measured (`--scope home`, all 10 fixtures, 2026-09-29): median **€0.087** ✓ (target €0.30), median **105 s** ✗ (target 60 s); 52/54 checkpoints, 42/45 edits (`eval/report-home.md`). The run overlapped with Docker builds and tests on the same machine: re-run idle, frizerstvo 113 → 75 s, instalacije 56 → 61 s, and both Lighthouse performance failures (82, 76 after colour edits) passed — load noise. Second full home run (`eval/report-home.md`, 2026-09-29 20:00): 60/60 checkpoints, 46/47 edits, median €0.095 / 110 s — also not on an idle machine (tests ran alongside), so the idle time is unmeasured; idle single runs were 61–75 s
- [ ] Homepage preview time: 105 s median = ~35 s model stages + ~55–60 s checks (Lighthouse most of it) + 11–20 s critique. Proposal: show the preview as soon as content is rendered (~35–40 s), run checks and critique afterwards and apply the critique as a new version; or skip Lighthouse for previews. Product decision (phase 2 free preview)
- [x] Deployed: login redirect 400 fixed (#3), live after Railway's deploy pause lifted; verified `/` → 302 → `/login?next=%2F` 200, traversal guard still 400
- [x] Deployed: full flow on the live URL, scripted as `tools/eval/src/remote-smoke.ts` (2026-09-29, gostilna-zlata-zlica): login → chat edit (header light → dark) → fill placeholders in the editor → publish → public `/s/gostilna-pri-zlati/` 200 + noindex → export 1.3 MB opens offline. All steps pass
- [ ] Owner's own check on the live URL with their own photos (intake form, mobile/desktop preview toggle in a real browser)
- [x] Deployed: ≥ 2 fixtures generated end to end (pekarna-kvas €0.24, gostilna-zlata-zlica €0.16; all checks pass)
- [x] Deployed: everything in EU West (Amsterdam). Railway had no migrate button for the volume, so (owner's call) the `sfo` volume was deleted and a new one created in `ams` (2026-09-29); test data lost, the 2 test sites regenerated
- [ ] Deployed: production environment tracking `main` (only `preview` exists; it now tracks `main`)
- [x] Monthly Railway cost from measured usage (3 h window, 2026-09-29): memory avg 1.37 GB (worker 0.74, web 0.56, Postgres 0.07) ≈ $13.70, CPU avg 0.02 vCPU ≈ $0.40 → **≈ $15/month + plan fee** at $10/GB·month and $20/vCPU·month (Railway docs); volume and bucket hold < 1 GB (their per-GB prices not confirmed). Budget €50/month

## Next: phase 2 — auth, preview limits, visual editor, contact forms

Draft plan: docs/phases/PHASE-2.md — 5 decisions there are the owner's (sign-in method, who gets full sites before billing, Puck vs current editor, email domain, production env). Scope:
- [ ] Accounts: email + magic link sign-in, sessions, one owner per site (replaces the shared access password for clients; keep it for the internal dashboard)
- [ ] Free preview limits from PRODUCT.md: homepage only, watermarked, not publishable, email-verified, rate-limited per email/IP; limits in config
- [ ] Visual editor: evaluate Puck against the current direct editor (schema-driven forms + inline text); decide, then build the chosen path. Must stay spec-only (every edit is a spec change)
- [x] Contact forms (2026-09-29): `contact-form` section (spec v2, identity migration, stored specs migrated on read), plain-HTML form + `form.js` island, public `_submit` endpoint (published forms only, honeypot, per-sender and per-site rate limits, IP kept only as a keyed hash, cleared after a day), messages page with delete in the dashboard, privacy policy text when a site has a form, CSP `form-action`/`connect-src 'self'`. Tested: unit + endpoint (12), Chromium end to end over HTTP (JS at 360 px, no JS, preview sends nothing, CSP regression caught), offline eval 10/10 with a form on racunovodstvo-seliskar (LH 99/100/100/100, axe 0), live chat edit "add a contact form" → valid `contact-form` first try (€0.05); `remote-smoke.ts` submits and deletes a test message
- [ ] Contact form email notification to the owner (Resend) — waits on the sending-domain decision
- [x] Deployed (2026-09-29): a chat edit on the live app added a contact form to gostilna-zlata-zlica; `remote-smoke.ts` all PASS incl. the form reaching the owner's inbox; a real phone-sized browser submit on the live page showed the thank-you message with no console errors (test messages deleted)
- [x] Chat-edit replies mixed singular and plural ("sem dodali"); the edit prompt now asks for first person plural ("Dodali smo …"): 3/3 live replies correct
- [ ] Contact form in an offline export shows a note and sends nothing; a site moved to another host needs its own form handling
- [ ] Transactional email via Resend (magic links, form notifications); domain + DNS records
- [ ] Mobile owner flows: the dashboard usable at 360 px (owners manage the site from a phone)
- [ ] Eval: add auth/limits checks to the deployed smoke test (`remote-smoke.ts`)

## Design system overhaul (branch claude/design-system-overhaul)
- [x] docs/design/ideas.html: proposal for product tokens/components/screens, generated-site hero and header families, and the researched AI-site give-away list (38 tells with code/critique/new status; Slovene copy rules)
- [ ] Owner decisions: accent (`sb-ui-accent`), display face (`sb-ui-display-face`), product name (`sb-brand-name`), approve give-away additions to docs/PRODUCT.md. The product UI ships with the doc's picks (green, Bricolage Grotesque); each is one token to change
- [x] Product UI (2026-09-30): one stylesheet `apps/web/src/ui/app.css` with the ideas.html tokens (canvas, ink, green accent, hairlines, one float shadow, radii 4/8/12, Bricolage + Figtree from the repo's subset fonts), served at `/assets/ui/<hash>/` without a session; no inline CSS left in dashboard pages. Login (wordmark, one field), intake as the prompt box (attach buttons, scope switch, one action; `/new`, and the whole page when there are no sites; refused intakes keep the text and say why), sites as cards with a live 360-px thumbnail, editor restyled (app bar with "Več" menu, generation progress with real stage names and seconds, failure note with "Poskusi znova", versions list, AI pane with cost and log folded), messages page. Checked: screenshots at 360 and 1280 of login, sites, intake, editor (phone and desktop preview, section form, AI, design, versions, menu), generating, checking, failed, messages; axe 0 violations on all of them; no horizontal scroll at 360; typecheck, lint, 495 tests
- [x] Editor: the preview frame reloaded (and lost its scroll) on every re-render, e.g. every click on a section; it now stays in the page, and polling reloads it only when the version changes
- [x] Preview `?v=` never selected a version (regex `/^d+$/` instead of `/^\d+$/`); fixed, tested
- [ ] Editor at 360 px: preview on top, panel below. The bottom-sheet editor from ideas.html is part of the phase 2 editor work (`sb-editor`)
- [ ] Editor shows section variant ids raw (`grid`, `photo-left`); give them Slovene names
- [ ] Product homepage (docs/design/homepage.html) not built: it quotes a price (`sb-pricing`), a name (`sb-brand-name`) and a public free preview (`sb-preview-gate`); GO-TO-MARKET plans the landing page as a site from our own engine
- [ ] Generated sites: hero families (facts-first, photo-first, type-only, split) and header families per direction; spec version bump + migration + test; eval contact sheet must show no two directions sharing hero and header family
- [ ] Give-aways into code: no U+2014 in copy, Slovene filler additions, accent-coloured single-side borders, eyebrow case and tracking cap, off-black/off-white bounds, one primary action per hero

## Later: phase 3 — CMS collections
- [ ] Collections the client edits: blog, services, price list (cenik), team, events; spec migration + components + editor forms
- [ ] Per-collection list/detail pages, RSS for the blog, sitemap entries
- [ ] Slovene formatting for dates, prices and plurals in every collection view

## Later: phase 4 — billing and domains
- [ ] Legal entity first (no billing before it exists)
- [ ] Stripe: flat monthly plan, trial = free preview, dunning, invoices with Slovene VAT rules
- [ ] Platform domain, `{slug}.<domain>` subdomains, Cloudflare for SaaS for customer domains
- [ ] Domain registration via the Openprovider API
- [ ] Ask the accountant before building billing: do online card payments (Stripe) need fiscal verification of invoices (davčno potrjevanje)? Bank-transfer invoices don't. Yearly invoice + UPN QR may come first (docs/GO-TO-MARKET.md §5, §9)
- [ ] Register customer domains in the customer's name (the "domain held hostage" complaint is our selling point)

## Go-to-market (docs/GO-TO-MARKET.md; decisions in the Decision Inbox)
Owner:
- [ ] Decide name (`sb-brand-name`), trademark search at SIPO/EUIPO, buy domains (unblocks `sb-email-domain`)
- [ ] Decide first market (`sb-first-market`), roadmap order (`sb-roadmap-order`), pricing (`sb-pricing`), legal entity timing (`sb-legal-entity`), 90-day budget (`sb-gtm-budget`)
- [ ] Recruit 10–15 design partners in person (full sites via the allow-list, `sb-full-access`)
Product work (not started):
- [ ] Landing page and waitlist (with reserved founding price, no payment) generated by our own engine; check pricing/FAQ sections exist
- [ ] Preview before email confirmation (`sb-preview-gate`); required placeholders shown as a "še N podatkov do objave" checklist
- [ ] Intake from photos of printed material (menu, price list, flyer, business card) and from an existing website URL
- [ ] Cookieless per-site counts (visits, Call and Directions taps, form sends) and a monthly report email
- [ ] Public website checker (reuses `@sb/engine` checks, no model calls, rate-limited) + the state-of-small-business-websites study on ~300 public sites
- [ ] Referral codes and an optional "Izdelano z …" footer link as a spec field (with billing)
- [ ] Email-to-edit via Resend inbound (after phase 2); chalkboard-photo menu update (after price-list editing)

## Follow-ups (not blocking a phase)
- [x] A long homepage (kmetija-grabnar, home-scope eval) failed generation: its full-page screenshot exceeded the API's 8000 px limit (400). Screenshots over the limit are shrunk to fit; any critique failure except the spend cap now keeps the checked site
- [x] Critique screenshots of long pages were illegible (API scales images to ≤ 1568 px long edge; a 360×5000 page arrived ~110 px wide). Now the whole mobile page in ≤ 1560 px slices (max 6) and the desktop top (2 × 900 px). Measured: ~9–10k input tokens per critique call vs ~6k, +€0.005–0.01 per call; kmetija-grabnar 6/6
- [x] Worker ran one job at a time (two deployed intakes queued, 322 s wall each). Measured: worker 0.55 GB idle, 1.69 GB peak with one generate job (limit 8 GB) → generate jobs now run 2 in parallel (`limits.jobConcurrency`); edits and publishes stay sequential (same-site version conflicts)
- [x] Web idled at ~0.6 GB: not `tsx` itself but Lighthouse (~325 MB) and Playwright (~70 MB) loaded at startup by `@sb/engine`, plus pnpm → pnpm → tsx wrapper processes (~80 MB). Now imported on first check, and the containers start `node --import tsx` directly. Measured in the web image: **621 MB → 174 MB idle**; shutdown on SIGTERM 1 s. Worker idle drops the same way until its first check
- [ ] Accessibility statement date uses render date (changes on republish); make it a spec field if that matters
- [x] CSP for published pages: script-src drops 'unsafe-inline'; the one inline snippet (header `js` class) is allowed by its SHA-256 hash (tested)
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
