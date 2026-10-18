# M2 · Launch gate: plan (2026-10-18)

Goal (docs/ROADMAP.md M2): a new visitor can try the product, sign up, edit and publish on the live app without help.
Not in M2: the Postavi rename in the product (open decision, recommended with M5), Puck, set variety, production environment (M6).

Owner's OK 2026-10-18, with: keep today's editor (Puck parked); "≤ 60 s" is the first preview; emails from `mail.postavi.si`, and Claude may add the DNS records, the Resend domain and key and the Railway variables. Ask again before the €0.42 smoke test.

Mapped by a Haiku scout on 2026-10-18 (main at e3c4b051). Most of the code is built; what's left is mostly live checks, one prompt change and a few missing tests.

## Per criterion

### 1. Free-preview limits live + Railway smoke test with sign-in and limits (TASKS:49, :104)
- Done: limits code on main (`apps/web/src/limits.ts`, tiers in `config/app.config.json`; no on/off switch, so they are already live wherever main is deployed). Turnstile real keys on Railway web. `pnpm smoke:launch <site>` exists: free readiness checks, then `remote-smoke.ts --limits`. Local dry run 16/16 + 8/8 (2026-10-07).
- Left: the live run. It needs Cloudflare's always-pass Turnstile test keys on Railway web during the run, then the real keys back.
- Cost: about €0.42 (approval needed).
- Needs the owner: OK to spend; OK for Claude to swap the two Turnstile variables on Railway web and restore them (Claude never prints them), or the owner swaps them by the printed steps.
- Order: after criterion 2, so the same run also proves real sign-in and form emails from the new domain.

### 2. Sign-in and form emails via Resend from our own domain, with a real send (TASKS:87, :102)
- Done: the Resend adapter, magic-link and form-notification emails, retries, Reply-To. Railway web sends from `einvoicecheck.eu` today (the owner's other domain). No sender domain is hardcoded: only `EMAIL_FROM` changes.
- Proposal: send from **`mail.postavi.si`** now (subdomain, as Resend recommends). postavi.si's DNS at Namecheap is reachable through the domain connector, so Claude can add the records itself; the owner does nothing at Namecheap. The redirect record the owner was asked to remove is already gone (only the Railway ALIAS/CNAME and two verify TXTs are left).
  - Resend: add domain `mail.postavi.si` (eu-west-1), copy its records (MX + SPF TXT on `send.mail`, DKIM TXT `resend._domainkey.mail`), add `_dmarc` `v=DMARC1; p=none;` on postavi.si (none exists), verify.
  - A new Resend API key limited to that domain, then on Railway web: `RESEND_API_KEY`, `EMAIL_FROM` = `Stranko <prijava@mail.postavi.si>` (the display name stays Stranko until the rename decision). einvoicecheck.eu stays untouched in Resend.
  - Real send: a sign-in link to the owner's address and a contact-form message (the smoke test's form step) both arrive; check the SPF/DKIM pass in the headers.
- Risk: Resend's free plan domain count is unclear (pricing page says 3; older info said 1). If Resend refuses a second domain, the fallback is Pro at $20/month: that is the owner's call.
- Cost: €0 (Resend free plan), unless the plan limit hits.
- Needs the owner: OK for the DNS records on postavi.si, the new Resend domain and key, and the two Railway variables.

### 3. "Real business" junk check as its own field (TASKS:55)
- Done: the classifier (`packages/engine/src/prompts.ts` CLASSIFY_SYSTEM, schema `packages/engine/src/brief.ts`), the threshold read in `apps/web/src/app.ts:386` and `packages/engine/src/pipeline.ts:184`, 22 calibration cases and their recordings, `pnpm eval:junk`.
- Left: add `isBusiness` (boolean) to the classifier's answer; refuse when it is false; keep the confidence threshold only as a backstop (or drop it if the re-run shows the field alone separates all 22). Re-record the 22 junk cases and the 20 fixture classify recordings. Fix the stale "junk check is off in production" comments in two tests.
- Cost: about €0.02 (Haiku); small spend, run and book in HQ.
- Who: one Sonnet builder (test-covered unit), Opus review (it is a publishing-gate rule).

### 4. Editor decision: today's editor or Puck (TASKS:94)
- Facts: today's editor is built (`apps/web/src/client/editor.ts`), every edit is a spec change, browser tests at 360 and 1280 px. No Puck code exists; adopting it is weeks of work and a second editing model.
- Recommendation: keep today's editor for 1.0, park Puck.
- Needs the owner: the decision. Then Claude ticks it, parks Puck, closes the PHASE-2 decision.

### 5. Owner's own run on a phone (TASKS:77)
- Claude writes a one-page checklist (`docs/owner-phone-run.md`): open the live URL on the phone, own photos, generate, edit by chat and by tapping, publish, open the published page, send a contact-form message, note anything odd.
- Risk: iPhone photos are HEIC; the intake accepts JPEG/PNG/WebP/AVIF only. Safari usually converts on upload; the checklist asks to note it if a photo is refused.
- Needs the owner: the run itself (about 15 minutes), after criteria 1–3 are live. Model cost of one full run is about €0.30–0.80 on the live cap.

### 6. PHASE-2 exit criteria ticked (docs/phases/PHASE-2.md "Done means")
- Covered by tests today: magic-link limits per email/IP, watermark, publish refused for previews, contact form honeypot/rate limit/delivery, session expiry, CSRF, one owner per site, versions.
- Missing tests (free, Claude): an allow-listed owner publishes and exports at 360 px (browser test); the form's consent text and privacy link; the per-IP generation cap (`perIpGenerationsPerDay`).
- **Target that fails today:** "homepage preview in ≤ 60 s". The latest homepage run (2026-10-15) is 109 s for the whole job; the first preview shows in about 23 s (2026-09-30), and the owner decided earlier (`sb-preview-time`) to show the preview early. Proposal: the criterion reads "first preview ≤ 60 s", measured on the live smoke run, and the 60 s whole-job target moves to M7's speed targets, which already list it. Needs the owner: yes or no. Claude will not loosen it without that.
- "pnpm eval still passes on all 10 fixtures": CI's offline eval is the guard (owner, 2026-10-17: no paid per-fix evals).

## Order of work

| # | Unit | Free / paid | Needs the owner |
|---|------|-------------|-----------------|
| 1 | Editor decision; 60 s reading | free | two answers |
| 2 | Junk field (PR) | ~€0.02 | – |
| 3 | PHASE-2 missing tests + phone checklist (PR) | free | – |
| 4 | Email from mail.postavi.si: Resend domain, DNS, key, Railway vars | free (unless Resend asks $20/mo) | OK for DNS, Resend and Railway |
| 5 | Live smoke test with limits + real emails | ~€0.42 | OK to spend; Turnstile swap |
| 6 | Owner's phone run | ~€0.50 live | the run |
| 7 | Close: ROADMAP, TASKS, PHASE-2, HQ | free | – |

Units 2 and 3 are code and run before the live work, so the smoke test checks the final code. Total paid: about €0.45 from the dev budget plus the owner's own run on the live cap.
