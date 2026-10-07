# Analytics plan (proposal)

Status: owner decided `sb-analytics` = own-plus-cf. **Steps 1 and 3 built** (2026-10-07, branch `claude/analytics-1`) behind config `analytics.events`, **off** until the owner turns it on (it adds a sentence to `/zasebnost`); `/admin/funnel` and `/admin/engine` are always there. **Step 2 built** (branch `claude/cloudflare-beacon`): the Cloudflare Web Analytics beacon on `/`, `/login` and `/zasebnost` for the hostnames in config `analytics.cloudflare.hosts` (token from the owner's Cloudflare site), and `?utm_source=` stored as `source` on `landing_view` and `intake_submitted`. Step 4 is later.

What was built differs from the text below in these places:
- Funnel order: `plan_changed` (paid) sits before full sites and publishing, because until billing exists the allow-list is what makes them possible. Steps are linked by device key (landing → intake, preview opened → sign-in), site (intake → preview ready → opened) or account (sign-in → claimed → paid → full site → published).
- The admin's own clicks write no funnel events (their generations still write `generation`). `device_key` is an HMAC of the device cookie with its own prefix, not the cookie id.
- `landing_view` is deduped per device in the database (`analytics.landingDedupeMinutes`); `preview_opened` (the editor frame loading the homepage) and `upsell_shown` once per device and site in `analytics.onceMinutes`. `upsell_shown` = a free preview's locked pages, or a plan limit naming the plan with more; `upsell_clicked` = the editor's "Paketi in cene" link (`/?ref=upsell`).
- `exported`, `edit_direct` and `edit_chat` are written per action. `domain_connected` is written when the provisioning job takes a domain live.
- The roll-up runs in the worker's hourly housekeeping (idempotent: one cutoff, one transaction), not nightly.
- Step 3: the production pipeline has no critique score (the judge is eval-only), so the event carries the critique's rounds and issue counts per round. Failed checks are stored by name (`axe:<rule>`, `scroll-360`, `facts`, `lighthouse-performance` …), never the failure line (it can quote the site's facts). `retries` = content-stage calls beyond the first. Template = the chosen direction plus the homepage's first section (`hero`). The same-trade similarity score is not in yet.
- Step 2: the login page is `/login` (there is no `/prijava`). `source` is the lower-cased `utm_source` (letters, digits, `.`, `-`, `_`, at most 40 characters; anything else is none), written on `landing_view` and carried by the landing page's form (a hidden field) to `intake_submitted`. The privacy page names Cloudflare Web Analytics while the token is set.

Two different things get called "analytics" here, and they need different answers:

1. **Product analytics for Stranko**: who comes to the landing page, how many type a description, see a preview, sign up, publish, pay; what the engine costs and how often it fails; what owners do in the editor.
2. **Visitor statistics for customers' sites**: what a hairdresser sees about her own site. This exists today as cookieless daily counts (visits, calls, directions, forms) with a monthly email (`packages/platform/src/stats.ts`, PR #93). It is part of the Osnovni plan.

## Options considered

| | Google Analytics 4 | PostHog (EU cloud) | Plausible / Umami | Cloudflare Web Analytics | Own, in Postgres |
| --- | --- | --- | --- | --- | --- |
| Consent banner needed | Yes (cookies, cross-site ids). On customers' sites that breaks "no tracking before consent", our selling point | By default yes; can run cookieless with less data | No (no cookies, no cross-site id) | No | No |
| Funnels, custom events | Yes, heavy to set up | Yes, best of the lot; session replay, flags | Custom events yes, funnels basic (Plausible) / goals (Umami) | Pageviews, referrers, countries only | Whatever we write; the funnel steps are already server-side rows |
| Cost | Free, paid with the data | Free to 1 M events/month | Plausible €9/month; Umami free self-hosted (+ a Railway service, about €5/month) | Free | Free; our time |
| Script on the page | 50–90 KB, blocked by ~30 % of browsers (ad blockers) | ~60 KB | < 1 KB (Plausible), ~2 KB (Umami) | ~5 KB | 0 (server-side) |
| Data location, DPA | US transfers, DPF | EU (Frankfurt), DPA | EU, DPA / ours | Cloudflare, DPA | Ours |
| Fits a Slovenian small business's site | No | No | Yes, but a monthly fee per site is our whole margin | Partly | Yes (built) |

## Recommendation

**Customers' sites: keep the own cookieless counts and extend them. No Google Analytics by default.**
A tag that needs a consent banner would undo the one thing owners can repeat about us ("brez piškotkov, brez pasic"), add a third party to every site's privacy text, and most owners would never open GA4 anyway. What they want is the monthly email, improved:
- Where visitors came from: search, Google Maps, social, direct, another site. Needs only the `Referer` header, classified into five buckets at count time. Nothing stored per visitor.
- Which pages were opened (per page per day), so an owner sees that the price list is read and the "O nas" page is not.
- Phone or desktop share (from the user agent at count time, two buckets).
- A plain "Statistika" tab in the editor with the last 30 days and the same five numbers as the email, plus a sentence in Slovene that reads the numbers for them ("Največ obiskov v petek, največ klicev iz Google Zemljevidov").
- Plus plan upsell, consent-gated: "connect your own Google Analytics or Meta pixel" for owners who run ads. Loads only after the site's consent banner says yes, which the banner component already supports for embeds. Built when a paying owner asks, not before.

**Stranko's own product: our own event table first, Cloudflare Web Analytics on the landing page for traffic, PostHog only when the questions outgrow that.**

Why own first: almost every funnel step is already a row we write (intake accepted, job finished, first preview shown, sign-in, site claimed, published, plan set). What is missing is one place that counts them per day and shows the drop-off. A third-party tool would only see the client side, and ad blockers would hide a third of it. What we can't see server-side is top-of-funnel traffic (where landing visitors come from, which of the five trade demos they open), and Cloudflare's free, cookieless beacon covers exactly that with no consent banner and no new vendor (Turnstile and the edge Worker are Cloudflare already).

PostHog is the right tool the day we ask "what do owners do inside the editor before they give up" and have enough owners for the answer to mean something (hundreds of sign-ups a month). It can run cookieless and in the EU, but it is a second data processor on our privacy page and a 60 KB script for a question we don't have yet.

## What gets built (in order)

### Step 1: `events` table and `/admin/funnel` (free, about a day)
- Table `product_events(id, at, kind, site_id, account_id, device_key, tier, plan, source, props jsonb)`. `device_key` is the keyed hash we already use for limits, kept 90 days; no IP, no email. Kinds: `landing_view` (server-side, deduped like site visits), `intake_submitted`, `intake_refused` (reason), `preview_ready` (seconds, €), `preview_opened`, `signin_requested`, `signin_done`, `preview_claimed`, `site_generated`, `edit_chat`, `edit_direct`, `published`, `exported`, `plan_changed`, `limit_hit` (which), `upsell_shown`, `upsell_clicked`, `domain_connected`.
- Written where the thing happens (`reserveJob`, the worker's job end, login, publish), one `repo.events.add(...)` each, inside the same transaction where there is one. Never on the request path's critical section; failures to log are logged and ignored.
- `/admin/funnel`: last 7 / 30 days: landing views → intakes → previews ready → previews opened → sign-ins → claimed → full sites → published → paid, each with the conversion to the next step and the median time between steps; refusals by reason; limit hits by kind; `preview_ready` median seconds and € per tier (the eval's numbers, but from real owners). One query per column, no new service.
- Retention: raw events 90 days, then a nightly job rolls them into `product_events_daily(day, kind, tier, plan, source, n)` kept forever. `/zasebnost` gets one sentence: we count steps in the product per device without identifying the person.

### Step 2: the landing page's traffic (free, an hour, owner creates the Cloudflare site)
- Cloudflare Web Analytics beacon on `/`, `/prijava` and `/zasebnost` only; never on `/sites`, the editor or published sites. Gives referrers, countries, which trade demo page was opened, and the share of visitors with JavaScript off (the server-side `landing_view` count minus Cloudflare's count).
- UTM parameters on anything we hand out (the printed cards, the letters, Google Business posts) are stored as `source` on `intake_submitted` so the funnel in Step 1 can be split by campaign without a third party.

### Step 3: engine telemetry in the same table (free, half a day)
- The pipeline already logs tokens and € per stage. Add one `generation` event per job with: stages' seconds and €, critique score, checks failed (which), pictures generated, spend-cap hits, retries, direction and template chosen, and the same-trade similarity score once the variety work lands. `/admin/engine` shows a week of medians and the worst five jobs with a link to each site. This is the production counterpart of `eval/report.md`.

### Step 4: customers' statistics, extended (free, 1–2 days; spec unchanged)
- `site_stats` gets `source` and `device` columns per day (five referrer buckets × two device classes), and a `site_page_stats(site_id, day, page, visits)` table.
- Monthly email and a new "Statistika" tab in the editor as above. Visits on the owner's own device excluded (the editor's device key), so an owner polishing her site doesn't count herself.
- Privacy text on generated sites: "štejemo oglede po straneh in od kod ste prišli (iskalnik, zemljevid, družbena omrežja), brez piškotkov" added to the sentence that is already there.

### Later, only on evidence
- PostHog (EU, cookieless mode) in the editor, when there are enough owners to study in-editor behaviour and the funnel shows the editor is where they stop.
- "Connect your own GA / Meta pixel" on Plus, consent-gated, when a paying owner asks.
- A weekly digest of the funnel to the owner's email and the HQ overview tiles (sign-ups, publishes, € per sign-up), once Step 1 has two weeks of data.

## What we don't do
- No Google Analytics on customers' sites by default, no Google Tag Manager anywhere.
- No session replay or heatmaps before there is a consent flow in the product UI and a reason.
- No analytics vendor whose script runs on published sites: the sites stay under 20 KB of JavaScript and cookie-free.
- No per-visitor rows anywhere, in our tables or a vendor's: counts, buckets and keyed device hashes that expire.

## Open questions for the owner (HQ `sb-analytics`)
1. Agree with "own events + Cloudflare on the landing page", or start with PostHog's free tier straight away for the funnel too (fewer things to build, one more processor, ad blockers hide part of it)?
2. Is the owner comfortable classifying referrers and device class on customers' sites (still no cookies, no per-visitor data), or should customers' stats stay exactly as today?
