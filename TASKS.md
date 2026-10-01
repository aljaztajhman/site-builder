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
- [x] Eval: trgovina-oljka-in-sol "more olive and terracotta" failed `colorWarmer` (primary went olive, as asked). Owner's decision `sb-olive-check`: the check is now `colorHueIn` on the accent (terracotta, hue 5–32°, saturation ≥ 0.3); the primary may go olive
- [x] Eval: critique answers that were unusable failed the whole generation (a self-corrected double answer; a 420-char note against a 300 limit). JSON extraction now takes the last complete answer of the main shape; critique notes are trimmed; an unusable critique keeps the checked site with a logged warning
- [x] Eval: homepage preview measured (`--scope home`, all 10 fixtures, 2026-09-29): median **€0.087** ✓ (target €0.30), median **105 s** ✗ (target 60 s); 52/54 checkpoints, 42/45 edits (`eval/report-home.md`). The run overlapped with Docker builds and tests on the same machine: re-run idle, frizerstvo 113 → 75 s, instalacije 56 → 61 s, and both Lighthouse performance failures (82, 76 after colour edits) passed — load noise. Second full home run (`eval/report-home.md`, 2026-09-29 20:00): 60/60 checkpoints, 46/47 edits, median €0.095 / 110 s — also not on an idle machine (tests ran alongside), so the idle time is unmeasured; idle single runs were 61–75 s
- [x] Homepage preview time: 105 s median = ~35 s model stages + ~55–60 s checks (Lighthouse most of it) + 11–20 s critique. Owner's decision `sb-preview-time`: show early. The editor already showed the first saved version while checks ran; the engine review branch runs images beside brief/design and the eval now reports time to first preview: median **23.4 s** to the first preview (live home eval 2026-09-30, all 10 fixtures, idle machine; was ~34 s), whole job 73 s (was 110 s)
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

## Engine and editor review (2026-09-30, branch claude/engine-website-generation-improvements; report artifact linked in the PR)
Fixed on the branch (tests + live eval live home eval 2026-09-30, `eval/report-home.md`: 60/60 checkpoints, 46/47 scripted edits, first preview median 23.4 s, job 73 s, €0.088, 0/10 homepages repeating the contact block (was 5/10), skeleton similarity 0.37 (was 0.42)):
- [x] Full sites wrote the content twice: 10/10 recorded first answers failed only on section ids reused across pages (`s_head`, `s_cta`). Assembly renames later duplicates and relinks; unit test replays all 10 recordings
- [x] Critique never saw the client's text and removed true facts as "invented" (od leta 1996/2011/2008 on 3/10 sites); it now gets the text and is told facts are code-checked
- [x] Full-page screenshots drew the fixed call bar mid-page (4/10 critiques reported it covering content); fixed elements are hidden in those shots, and the critique is told the bar exists
- [x] Contact facts repeated on homepages (critique removed a block on 7/10, 5/10 still repeated after it): shared rule "contact facts in one place near the top", eval counts it
- [x] Section catalogue first with its own cache breakpoint: content, critique and edit share one cache entry
- [x] Image stage runs beside classify/brief/design; eval reports time to first preview, repeated contact blocks and skeleton similarity
- [x] Chat: reply never appeared without a reload (poll didn't start); no conversation context; failed edits showed the model's "Dodali smo …"; undo pressed twice redid; polling re-rendered every 2 s (wiped typing). All fixed
- [x] Replay matches recordings per stage (stages now overlap); `--record` clears stale recordings first
Next, in the owner's order (chat 2026-09-30: images first, "the visuals can be better", "like image-model-comparison.jpg", "you need a way to look"):
- [x] One entry point (owner, 2026-09-30: "/new is redundant, it confuses which page is the main one"): the landing page's prompt box is the intake (photos, logo, Domača/Celotna stran, "Ustvari" posts to /api/sites and opens the editor; a refusal re-renders the landing page with the reason and the text); `/new` redirects to `/#zacni`; "Nova stran" and the empty sites list point there; signed out, the prompt goes to the login and the text and scope come back on `/` (never in the URL). Checked in a browser locally at 1280 and 375 px: signed-in submit → editor; signed-out → login → text, scope and focus restored; no sideways scroll. Landing copy: "enako dober na telefonu in računalniku", measured 23 s / 73 s instead of 110 s
- [x] Landing page example (Pekarna Kvas) with three generated photos (GPT Image 2.5, 480/960 px WebP, 28–117 KB), each labelled "ustvarjeno z UI"; captions say the example is fictional and its photos generated
- [x] Real fixture photos (2026-09-30): all 36 with GPT Image 2.5 in the comparison's style, €2.44, 0 failed, 7.9 MB committed with `photo-manifest.json` (model, prompt, cost); looked at all 36: realistic, no stray lettering. Copy that promises "no invented images" (landing FAQ, "Kako deluje") changes together with builder image generation
- [x] Looking tools (2026-09-30): `eval/look/<site>.png` review sheets (phone and desktop first screens as a visitor sees them, whole pages) + `desktop-first-screens.png`, built after every eval (`tools/eval/src/look.ts`); composition measured on the rendered homepage at 360×800 and 1280×800 (photo share, first photo position, buttons, headline lines, largest empty band on one background) with report-only targets in `config.checks.composition`; vision judge (`tools/eval/src/judge.ts`, eval only, €0.023/site, `--judge`). Calibration: on avtoservis my own blind scores were 2.8/2.8 (phone/desktop), the judge's 2.8/2.8 with the same weak spots
- [ ] Judge baseline for all 10 sites: only 5 scored (phone median 2.8, desktop 3.2) before the Anthropic API ran out of credits (2026-09-30 23:25); re-run `pnpm eval --offline --judge` and a live home eval with --judge once credits are topped up
- [ ] Responsive, not mobile-first (owner, 2026-09-30; CLAUDE.md and PRODUCT.md updated): the prompt's "Mobile first" rule, critique input (whole desktop page, not only its top), review sheets, composition numbers and judge rubric give desktop and phone equal weight
- [x] Visual round 1–2 (2026-10-01, measured offline on the 10 goldens with real photos): photos in true colour (duotone/monochrome recoloured them), photo first in the phone hero, one primary action per hero (the second is a text link), the call bar waits until the hero scrolls away when the hero itself offers call and directions, no duplicate header CTA on phones, tighter spacing (same-tone neighbours share one gap, smaller phone padding, less space above the first section), a squarer desktop hero photo, consent notice in the page flow (it covered desktop content), long headlines step down. Composition targets met: phone 0/10 → 9/10, desktop 1/10 → 8/10 (same metric both times; see `eval/offline-report.md`; checks 10/10 before and after). Not yet measured on generated sites (API credits)
- [ ] Visual changes still open, designed for desktop and phone together: generation should pick a photo hero when the owner gave good photos (avtoservis golden and many generated homepages open with a type-only hero although photos exist); header and hero families per direction; the formulaic "<type> v <kraj>" eyebrow; judge scores on generated sites
- [x] Builder image generation for clients with too few photos (2026-10-01; owner's chat answer to `sb-images-client-sites`): the brief proposes subjects (materials, tools, ingredients, landscape; never faces, premises, signs or the owner's work); when the owner gave fewer than `imageGen.pipeline.fillUpTo` (2) photos, GPT Image 2.5 via fal makes up to that many beside the design step; stored and processed like uploads, spec v3 `origin: "generated"` (identity migration, goldens bumped), validation keeps them to hero-split/hero-image/image-text/page-header, the page shows an "Ustvarjeno z UI" badge and the alt text says it, each image logged per call (€0.068) under the daily cap; editor's picker marks them; landing FAQ/"Kako deluje" and PRODUCT.md say so. Checked: unit + pipeline tests (stand-in images), and a real run for instalacije-rebernik (no photos) with replayed answers: 2 fal images in parallel (~19 s, €0.14), checks pass, first screen meets composition targets on both widths, badge visible (looked at both screens)
- [ ] FAL_KEY on Railway (web + worker): without it the deployed pipeline generates no images
- [ ] Live eval of image generation with real briefs (the two photo-less fixtures) once Anthropic credits are back: do briefs propose good subjects, does content place generated images well
Backlog:
- [ ] Sameness: per-business-type homepage blueprints + hero/header families (item below) + one call button per screen. Today: skeleton similarity 0.42, 9/10 end with the same dark CTA band, 8/10 show a call button in header, hero, sticky bar and closing band
- [ ] Phone editing: tap to edit text (double-click only today), photo upload/replace after generation (asset paths are protected; only intake uploads), Slovene names for variants, design tokens (`airy`, `subtle`), direction names and summaries, missing field labels (`caption`, `bio`, `tags`, …) and the `contact-form` type; English toasts/errors ("colour adjusted …", validation paths)
- [ ] Pre-publish checklist: human labels instead of JSON paths, each entry opens its field; the disabled Publish button explains itself without a tooltip (touch)
- [ ] Section AI actions: Krajše / Prepiši / Druga postavitev (variant thumbnails with real content, no model call); select a section, then ask in chat (patches outside it rejected)
- [ ] Slovene copy check: measure grammar/register/English-word errors with an eval judge first (critique caught "se dogovoriva", "Petek in soboto dodamo", "Click & collect")
- [ ] Atomic publish: today `deletePrefix` then upload, so the live site is missing in between
- [ ] "Ustvari znova" rebuilds from the intake text and drops facts typed in the editor
- [ ] Editor risks: form autosave addresses sections by index (reorder within 0.7 s saves into the wrong section); every autosave pause writes a full version (unbounded list); `GET /api/sites/:id` returns spec, versions, events, chat and runs `siteBlockers` on every poll; a failed edit job sets status `ready` even during a generation
- [ ] Full sites: write the homepage first, then the other pages in parallel (one content call is ~20 s for 5–6 pages)
- [ ] Owner-edited fields: mark them so critique and regenerate don't overwrite them
- [ ] "Warmer" colour edits can't warm the page surface: cream is banned and warm-craft's surface is a cool grey-green (#edf2ef). Live eval 2026-09-30: pekarna "Toplejše barve, kot skorja kruha" warmed muted/accent/border/inverse but left primary (already crust brown) and surface, so the edit check fails (the only failure, 1/47). Give warm directions a warm, non-cream surface range
- [ ] Measure the edit-stage cache hit rate in production; owners' edits minutes apart may miss the 5-minute cache (1-hour TTL writes cost 2×)

## Design system overhaul (branch claude/design-system-overhaul)
- [x] docs/design/ideas.html: proposal for product tokens/components/screens, generated-site hero and header families, and the researched AI-site give-away list (38 tells with code/critique/new status; Slovene copy rules)
- [ ] Owner decisions: accent (`sb-ui-accent`), display face (`sb-ui-display-face`), product name (`sb-brand-name`), approve give-away additions to docs/PRODUCT.md. The product UI ships with the doc's picks (green, Bricolage Grotesque); each is one token to change
- [x] Product UI (2026-09-30): one stylesheet `apps/web/src/ui/app.css` with the ideas.html tokens (canvas, ink, green accent, hairlines, one float shadow, radii 4/8/12, Bricolage + Figtree from the repo's subset fonts), served at `/assets/ui/<hash>/` without a session; no inline CSS left in dashboard pages. Login (wordmark, one field), intake as the prompt box (attach buttons, scope switch, one action; `/new`, and the whole page when there are no sites; refused intakes keep the text and say why), sites as cards with a live 360-px thumbnail, editor restyled (app bar with "Več" menu, generation progress with real stage names and seconds, failure note with "Poskusi znova", versions list, AI pane with cost and log folded), messages page. Checked: screenshots at 360 and 1280 of login, sites, intake, editor (phone and desktop preview, section form, AI, design, versions, menu), generating, checking, failed, messages; axe 0 violations on all of them; no horizontal scroll at 360; typecheck, lint, 495 tests
- [x] Product UI live on Railway `preview` (2026-09-30, PR #14, web-preview-31c6.up.railway.app): hashed stylesheet and fonts served (immutable cache, noindex), login, sites (4 cards), intake, editor (phone, desktop, "Več" menu) and messages at 360 and 1280: fonts loaded, axe 0, no horizontal scroll, no console errors. Read-only check, no model calls
- [ ] Deployed Pekarna Kvas (v2) shows "Napaka": its critique failed on 2026-09-29 19:00 (note over 300 chars), before critique failures kept the site; the status stays `failed` although v2 is fine. The editor says so and offers "Poskusi znova"; a job that fails after a version exists could leave the status at `ready`
- [x] Editor: the preview frame reloaded (and lost its scroll) on every re-render, e.g. every click on a section; it now stays in the page, and polling reloads it only when the version changes
- [x] Preview `?v=` never selected a version (regex `/^d+$/` instead of `/^\d+$/`); fixed, tested
- [ ] Editor at 360 px: preview on top, panel below. The bottom-sheet editor from ideas.html is part of the phase 2 editor work (`sb-editor`)
- [ ] Editor shows section variant ids raw (`grid`, `photo-left`); give them Slovene names
- [x] Product landing page (2026-09-30): docs/design/homepage.html served at `/` to visitors without a session (signed in, `/` stays the dashboard); `home.css` + `client/home.ts` (no inline CSS/JS, CSP unchanged), the Pekarna Kvas example framed from `/assets/ui/<hash>/example-home.html` (only `/assets/ui/` allows same-origin framing). The prompt goes to `/new`; the typed text rides in sessionStorage through the login and fills the intake (never in the URL); "+ Fotografije"/"+ Logotip" focus that control. Paid price from `config.plans.paid.monthlyEurRange`. Working wordmark is now the designs' "Stran" everywhere (was "Graditelj strani", which wrapped the 360-px header). Deviations from the design: `--ink-3` darker (contrast), copy numbers corrected to eval/report-home.md (about two minutes, 10 fixtures, median 110 s, not "a minute"/154 s), chat reply in first person plural, footer e-mail and legal links as placeholders (no pages yet). Checked: full-page pixel diff vs the design 0.60 % at 1280 and 1.34 % at 360 (all in the changed copy/footer), axe 0, no horizontal scroll, no console errors, prompt → login → intake hand-off, no-JS render, vignettes play once in view; 498 tests
- [x] Landing page live on Railway `preview` (2026-09-30, PR #17, web-preview-31c6.up.railway.app/): full-page heights equal the design (8473 px at 360, 5235 at 1280), both example frames load, fonts load, axe 0, no horizontal scroll, no console errors, noindex; `/new` and `/sites/…` still redirect to login, API 401, `/health` ok; web and worker deployments SUCCESS. Read-only check, no model calls
- [x] Landing page always at `/`, signed in or not (2026-09-30): with a session it hid behind the dashboard, so the owner never saw it. The dashboard moved to `/sites`; signed in, the landing header says "Moje strani" instead of "Prijava"; login without a destination goes to `/sites`, logout to `/`
- [ ] Landing page claims not true yet: "Potrebujete le e-poštni naslov, kartice ne" / free preview (today `/new` is behind the access password; `sb-preview-gate`, phase 2 accounts), "od 12 €" (`sb-pricing`), footer provider data, contact e-mail and Zasebnost / Pogoji / Izjava o dostopnosti pages (`sb-legal-entity`, `sb-email-domain`)
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

## Images (docs/research/image-generation.html; decisions in the Decision Inbox)
- [x] fal.ai MCP server for Claude Code: `.mcp.json` + `tools/mcp/fal-headers.ps1` (reads `FAL_KEY` from the Windows user environment at connect time, no app restart). Verified: helper output accepted by mcp.fal.ai (initialize 200, tools/list 200)
- [x] Model comparison (2026-09-30): `pnpm fixtures:ai-photos compare`, 10 fixture subjects × Nano Banana 2, FLUX.2 pro, GPT Image 2.5 high over fal's REST API; 30/30 generated, €1.77 at config prices (NB2 €0.069, FLUX €0.041, GPT €0.068 per image; median 14 / 13 / 20 s). Contact sheet `docs/research/image-model-comparison.jpg`. Looked at each: FLUX drew a "GOSTILNA" sign and house number "14" despite "no lettering" and looks like stock photography; NB2 has correct hands but pseudo-text on a background chalkboard and outputs only 1264 px at 1K; GPT Image had no legible lettering and looks most like an owner's phone photo. Pick: `sb-images-model`
- [ ] Realistic fixture photos with the chosen model: `pnpm fixtures:ai-photos generate --model <name>` (36 photos, ~€2.45 with GPT Image) + `photo-manifest.json` (model, prompt, cost); waits on `sb-images-model` and `sb-images-fixture-storage` (photos are gitignored today); then re-record evals (€2.71 last run)
- [ ] fal cost is estimated from config prices; the account's actual spend isn't readable with this key (billing API 403). Compare against the fal dashboard once
- [ ] Shot list for owners (brief stage + dashboard); Lucide icons for phone, directions, hours
- [ ] Client-facing generation/edits: only after the owner's decisions (spec v2 image origin, marking after sharp, publish gate, legal review)

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
