# Phase 2: accounts, free preview, editor, contact forms (draft)

Read CLAUDE.md and docs/PRODUCT.md first. Phase 1 must be closed (TASKS.md "Now") before this starts.

Goal: a business owner can sign up from their phone, get a free homepage preview, and, once let in, edit their full site themselves and receive enquiries from its contact form. Still no billing.

## Decisions needed before starting (owner)

- [x] **Sign-in method.** Proposal: email magic link only (no passwords to store, works on phones). Alternative: magic link + Google. Decided (`sb-signin`): magic link only.
- [x] **Who gets a full site in phase 2**, with no billing yet. Proposal: an allow-list of emails the owner manages; everyone else gets the free homepage preview only. Decided (`sb-full-access`): the allow-list, with paid-tier rights.
- [ ] **Visual editor.** Evaluate Puck against extending the current direct editor (schema-driven forms plus inline text in the preview). Proposal: a 1-day spike on Puck, then decide on evidence: does it keep every edit a spec change, and does it work at 360 px?
- [x] **Email provider and sending domain.** PRODUCT.md names Resend. It needs a domain we control for SPF/DKIM, which means buying one (the owner's call and payment). Decided (`sb-email-domain`): Resend, sending from a subdomain of the owner's einvoicecheck.eu (DNS records in TASKS.md).
- [x] **Production environment.** Decided (`sb-production-env`, 2026-09-30): keep the one `preview` environment (tracking `main`) until the first real customer gets a real site; create `production` then.

## Scope

- **Accounts.** Magic-link sign-in and sign-out, sessions (httpOnly, secure, SameSite=Lax), one owner per site, sites listed per account. The shared `ACCESS_PASSWORD` stays for the internal admin dashboard only.
- **Free preview.** Homepage only, Sonnet 5.5 at medium effort, watermarked, not publishable, email-verified. Rate limits per email and per IP, and a global daily cap, all in config. The €0.30 / 60 s homepage target must hold (measure with `pnpm eval --scope home`).
- **Editor.** The chosen path from the decision above. Every edit stays a spec change (no hand-edited output); undo and versions keep working; the whole dashboard is usable at 360 px, because owners manage the site from a phone.
- **Contact forms.** A form section component (visible labels, `tel`/`email` input types, autocomplete), a server endpoint, spam protection (honeypot, per-IP rate limit, no third-party captcha before consent), submissions stored per site and emailed to the owner. Consent text and privacy-policy link on the form.
- **Transactional email** via Resend: magic links and form notifications, Slovene templates.
- **Admin.** Internal view of accounts, sites, spend per day and failed jobs.

## Out of scope

Billing, custom domains, domain registration (phase 3), CMS collections (phase 4), additional locales.

## Done means

- Sign up from a phone at 360 px: email → magic link → intake → homepage preview in ≤ 60 s, ≤ €0.30 (median of the eval, homepage scope).
- Preview limits hold: a second email from the same IP within the limit window is refused; watermark present; publish refused.
- An allow-listed account can generate the full site, edit it (chat and editor), publish and export, all at 360 px.
- The contact form on a published site delivers to the owner's inbox and is stored; the honeypot and rate limit are covered by tests.
- Every edit path produces a spec change with a version; tests cover auth (session expiry, CSRF on state-changing requests, one owner per site).
- CI green; `pnpm eval` still passes phase 1's "Done means" checks on all 10 fixtures.
