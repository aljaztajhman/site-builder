# Product brief

## What it is

An AI website builder for Slovenian small businesses and sole traders (s.p.). The client gives a description, logo and photos; the platform produces a finished website, equally good on desktop and phone, they can edit, publish, host and connect to a domain. Websites only, not web apps.

## Who it's for

Slovenian SMEs and s.p.: hairdressers, restaurants and gostilne, tourist farms, car repair, dental and physio practices, accountants, builders and installers, local shops and bakeries. Most owners are non-technical and will often manage the site from a phone. Visitors come on phones and on desktops; the site has to look excellent on both (responsive, not mobile-first; owner's direction 2026-09-30).

## Why they'd pick it over Wix, Framer, Durable or Hostinger

- Natural Slovene copy and correct Slovene formatting out of the box.
- Accessible (WCAG 2.2 AA) and GDPR-clean by default: no tracking before consent, self-hosted fonts, consent-gated embeds, generated accessibility statement.
- Fast on mobile: static pages, near-zero JavaScript.
- Flat price, no credits.
- The client can export the whole site as static files at any time.

## Architecture (decided)

- The model outputs a structured **site spec**: JSON with pages, sections, blocks, design tokens, content collections and locales, validated with zod. It never outputs HTML or code for a site.
- A fixed **component library** (React) renders the spec. Each component declares its props schema, variants, content length limits, mobile behaviour and accessibility notes.
- Published sites are **static HTML**. One shared stylesheet for all sites (cached across sites) plus per-site CSS variables for design tokens. JavaScript only for small islands: mobile nav, consent banner, forms, gallery.
- **AI edits** are RFC 6902 JSON Patches against the spec, validated before they're applied.
- Code on GitHub (private repo). Hosting on Railway from phase 1: web service (dashboard, API, published sites), worker service (pipeline jobs, Chromium for checks), Postgres with pg-boss, and a Railway bucket for files. MinIO replaces the bucket locally; the code talks to both through one S3 client.
- Until a platform domain exists, published sites are served at `/s/{slug}/` on the web service. Rendered sites use relative paths only, so the same files work there, on a subdomain later, and offline from an export.
- Later: platform domain with `{slug}.<platform domain>`, Cloudflare in front for customer domains (Cloudflare for SaaS), registration via the Openprovider API.
- Infrastructure budget: ≤ €50/month in total before revenue.

## Generation pipeline

1. **Intake → brief.** Description, logo and photos become a structured brief: business type, audience, tone, pages, features, and the facts the client actually provided. Classification on Haiku 4.5, brief on Sonnet 5.5.
2. **Design direction.** Palette extracted from logo and photos in code. Contrast enforced in code: 4.5:1 for body text, 3:1 for large text and UI. The model picks one curated direction and fills tokens within that direction's allowed ranges.
3. **Images.** sharp pipeline: AVIF and WebP, srcset, explicit width and height, lazy loading below the fold. Alt text in Slovene from the vision model, editable. Client photos first; no stock photos. When the client gives fewer than `imageGen.pipeline.fillUpTo` photos (2), the pipeline generates up to that many mood images from the brief's ideas (materials, tools, ingredients, landscape; never people, the client's premises, signs or their own work), labelled "Ustvarjeno z UI" on the page and in the alt text (EU AI Act Art. 50), and allowed only in hero-split, hero-image, image-text and page-header (validated). Owner's decision 2026-09-30.
4. **Content and assembly.** Slovene copy within each component's length limits, SEO title and description per page, mapped onto components as a spec. Validate; on failure, retry with the validation errors (max 2 retries).
5. **Check.** Render with Playwright at 360×800 and 1280×800. Run axe-core and Lighthouse (mobile). One screenshot critique pass by the vision model against the banned patterns and the mobile checklist, returning patches. Max 2 critique iterations.
6. **Publish and export.** Render static files to storage. Export is a zip of the same files and works offline from `file://`.

Models (all in config):

- Haiku 4.5 (`claude-haiku-4-5-20251001`) for classification.
- Sonnet 5.5 (`claude-sonnet-5-5`) at medium effort for everything else, including vision.
- Opus 5.5 (`claude-opus-5-5`) for the paid full-build pass, behind a config flag.
- Cache the static prompt parts: system prompt, component catalogue, design directions.

Targets on Sonnet 5.5, medium effort:

- Homepage preview ≤ €0.30 and ≤ 60 s.
- Full site ≤ €1.50 and ≤ 4 min.

## Mobile checklist

- Click-to-call and a directions link reachable in one tap on every page for local businesses.
- Body text ≥ 16 px, line length 45–75 characters.
- No horizontal scroll at 360 px. Nothing that only works on hover.
- Primary tap targets ≥ 44×44 px, at least 8 px apart; nothing below 24×24 px.
- LCP image preloaded; LCP ≤ 2.5 s on Lighthouse mobile.
- Forms: visible labels, correct input types (`tel`, `email`), autocomplete attributes.
- Mobile menu: usable one-handed, closes on selection, focus trapped while open, Escape closes it.
- Opening hours and contact visible on the homepage without hunting for them.

## Slovene specifics

- Default locale `sl`. The spec supports more locales from day one (en, de, hr later for tourism).
- Dates `29. 9. 2026`, times `8.00`, prices `12,50 €`, phones `+386 …`.
- Plurals via `Intl.PluralRules('sl')` (one, two, few, other). Never hard-code plural endings.
- Fonts self-hosted and subset to Latin plus Latin Extended-A. Every font pair must render č š ž ć đ correctly; a test verifies it.
- `lang="sl"` on every page. Test long Slovene words at 360 px: no overflow.
- Footer carries the provider information Slovenian e-commerce rules (ZEPT) require: company name, address, registration and tax numbers, contact. Missing values are required placeholders.
- Consent before any non-essential cookie or third-party script. Maps and video embeds load only after a click; plain links to Google Maps are fine.
- Legal pages (privacy policy, accessibility statement) are templates clearly marked for the client's own review, not legal advice.

## Banned patterns (generated sites)

Hard list. Add to it whenever a new default shows up in eval screenshots.

- Cream or off-white page backgrounds as a default
- Italic accent words inside headings
- Numbered section labels such as "01 / 02 / 03"
- Monospace labels or eyebrow text
- Pill-shaped buttons as a default
- Decorative gradient backgrounds (purple-to-blue or any other); gradient text
- Glassmorphism or frosted cards
- Emoji used as icons
- Hero headlines like "Dobrodošli" or "Welcome to …"
- The default row of three icon feature cards
- Everything centred
- Heavy drop shadows on every card
- Filler copy: "vrhunska kakovost", "celovite rešitve", "vaš zanesljiv partner", "z dolgoletnimi izkušnjami", "strast do …"

## Pricing (in config, will change)

- Free preview: homepage only, Sonnet 5.5 at medium effort, watermarked, not publishable, email-verified, rate-limited.
- Paid: flat monthly (€12–19 range), fair-use AI edits, no credits. Full site, editor, CMS, publishing, domains, export.
- No billing until a legal entity exists.

## Roadmap

1. Engine, preview, chat edits, publish, export; on GitHub and running on Railway.
2. Auth, preview limits, visual editor (evaluate Puck), contact forms with email via Resend.
3. CMS collections the client edits: blog, services, price list, team, events.
4. Billing (Stripe), custom domains, domain registration.
