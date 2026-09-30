# Architecture notes (phase 1)

Decisions that aren't obvious from the code. Product-level architecture is in `docs/PRODUCT.md`.

## Spec is the only state
Every change to a site produces a new row in `spec_versions` (source: `generate`, `critique`, `edit` (AI chat), `manual` (direct editor), `revert`). Rendered HTML is never stored except as a publish output, and is always re-rendered from a spec version. Undo = revert to an earlier version (a new version is written).

## Two ways to edit
- **Direct editor** (`POST /api/sites/:id/patch`, `/sections`, `/pages`, `/direction`): the dashboard builds RFC 6902 operations; `applyDirectEdit` applies them to a copy, brings design tokens back inside the chosen direction (`enforceDesign`: ranges, contrast) and validates. No model call, no tokens. Forms are generated from the JSON Schemas exported from the zod section schemas, so a new component gets an editor for free. Clicking a section in the preview selects it; double-clicking text edits it in place (matched by exact text within that section's props, so the rendered HTML needs no editor attributes and preview stays byte-identical to published output). Text typed in the editor counts as client-provided for the fact check.
- **AI assistant** (`POST /api/sites/:id/chat`): the only edit path that calls the model. Returns JSON Patch; the same validation plus the fact check apply.

## Facts
Facts live once, in `spec.business`; components render them. The model never writes phone numbers, addresses or hours into copy or links (links use `{action: "call" | "directions" | "email" | "booking"}`). Two code guards back this up:
1. `verifyBriefFacts` drops any brief fact that doesn't literally appear in the client's text.
2. `checkFacts` (after generation, critique and every edit) flags any phone, email, address, hour, price, person's name or other number in the spec that isn't in the client's input (intake + chat + editor text).
Missing facts are `{ "$placeholder": kind }`; `publishBlockers` refuses to publish while any remain.

## Preview equals published
`renderPage` is the one renderer. Preview (`/preview/:id/<page>.html`), publish (`published/<slug>/…` in storage, served at `/s/<slug>/`) and export (zip) all call it with the same inputs. Pages link to each other as `<slug>.html` and to shared assets as `../_shared/<hash>/…`, which resolves correctly at `/s/<slug>/`, on a future subdomain root, and from `file://` in the export (the zip holds `<slug>/` and `_shared/` side by side, plus a root `index.html` redirect).

## Contact forms
The `contact-form` section renders a plain HTML form that posts to the relative `_submit`, i.e. `/s/<slug>/_submit` today and `/_submit` on a future subdomain. Without JavaScript the server answers with a thank-you page; `form.js` submits in place and announces the result in the form's live region. The rendered HTML is the same everywhere (preview = publish = export), so `form.js` decides at run time: in the dashboard preview and in an offline export (file://) it shows a note and sends nothing. The endpoint (`apps/web/src/forms.tsx`) only accepts forms that exist in the site's *published* spec, drops honeypot submissions while answering success, and rate-limits per sender and per site (`limits.formMessages*`). Messages are stored in `form_messages`; the sender is stored only as a keyed hash of the IP (for the 10-minute limit) and cleared after a day, as the generated privacy policy states. Owners read and delete messages at `/sites/<id>/messages`. Email notification to the owner is not wired yet (needs a sending domain). Published pages' CSP allows `form-action 'self'` and `connect-src 'self'` for this.

## Product UI
The landing page at `/` is the only intake: its prompt box posts the description, photos, logo and scope to `/api/sites` when signed in, and goes through the login (text kept in sessionStorage) when not; `/new` redirects to it. It has its own stylesheet, `ui/home.css`. Dashboard, login, editor and messages share one stylesheet, `apps/web/src/ui/app.css`, built on the tokens in `docs/design/ideas.html` §04 (warm canvas, ink, one accent, hairlines, one shadow for floating things, Bricolage Grotesque + Figtree from the render package's subset fonts). It is served with its fonts and icon at `/assets/ui/<content hash>/…` without a session (the login page needs it) and cached for good; the pages carry no inline CSS. The editor bundle builds its DOM with the same classes. Its shell (app bar, panel, canvas) is built once: re-renders replace the bar and panel, while the preview iframe stays in the page (moving an iframe reloads it), and polling reloads it only when the spec version changes. Generated sites never load this stylesheet.

## Cost controls
`ModelClient` checks today's spend (sum of `model_calls.cost_eur` since UTC midnight) against `limits.dailyModelSpendCapEur` (or `DAILY_SPEND_CAP_EUR`) before every call and logs every call's tokens and € by stage. Jobs don't auto-retry (`retryLimit: 0`). Static prompt parts are the system blocks, most shared first, each ending in a cache breakpoint: content, critique and edit all start with the section catalogue (~16k tokens), so one generation writes it to the cache once and the later stages read it. Stage prompts (rules) come second. Keep new stages in that order, or they write their own copy of the catalogue.

## Generation timing
Brief and design (classify → brief → design) and the image stage (photo variants, alt text) run side by side; content waits for both. The first saved version is logged as stage `preview` with its time; the editor shows it at once while checks and the critique continue, and a critique result arrives as a new version (dropped if the owner edited in between). The eval reports the median time to that first version.

## Local without Docker
`DATABASE_URL=pglite://…` runs real Postgres in-process (PGlite); pg-boss runs on it through its PGlite adapter, and the web process runs the job handlers itself. `STORAGE_DRIVER=fs` stores objects in a directory. Production uses Postgres + a Railway bucket with the same code.

## Known limits
- Lighthouse runs on the homepage only (per checkpoint); axe and the mobile checks run on every page at 360 and 1280 px.
- Every response carries `X-Robots-Tag: noindex`, including published sites, so Lighthouse SEO on the deployed URL loses the "is crawlable" audit; the eval serves files without the header, like a production host would.
- The export is checked offline (file://) in Chromium by `checkExportOffline` during eval: pages, images, fonts, stylesheet, no network. Other browsers are not verified; Firefox's file:// origin rules may block fonts from the parent `_shared/` folder, in which case system fonts are used.
