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

## Cost controls
`ModelClient` checks today's spend (sum of `model_calls.cost_eur` since UTC midnight) against `limits.dailyModelSpendCapEur` (or `DAILY_SPEND_CAP_EUR`) before every call and logs every call's tokens and € by stage. Jobs don't auto-retry (`retryLimit: 0`). Static prompt parts (rules, section catalogue, directions) are the system blocks with a cache breakpoint after the last one.

## Local without Docker
`DATABASE_URL=pglite://…` runs real Postgres in-process (PGlite); pg-boss runs on it through its PGlite adapter, and the web process runs the job handlers itself. `STORAGE_DRIVER=fs` stores objects in a directory. Production uses Postgres + a Railway bucket with the same code.

## Known limits
- Lighthouse runs on the homepage only (per checkpoint); axe and the mobile checks run on every page at 360 and 1280 px.
- Every response carries `X-Robots-Tag: noindex`, including published sites, so Lighthouse SEO on the deployed URL loses the "is crawlable" audit; the eval serves files without the header, like a production host would.
- The export uses self-hosted fonts via `../_shared/`; Firefox's `file://` same-directory rule blocks fonts from a parent folder, so offline Firefox falls back to system fonts (Chrome and Safari load them).
