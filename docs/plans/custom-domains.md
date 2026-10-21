# Custom domains: from a description to a live site on the owner's domain

Status: plan 2026-10-03; provisioning, the domain step and the providers built against fakes 2026-10-04 (branch claude/domain-flow). HQ items `it-domain-flow`, `it-zero-to-live`, `it-platform-domain`, `it-customer-domains`, `it-openprovider`; overnight plan `on-domain-flow`; decision `sb-email-spam`.

## The promise

The owner writes a short description of what they do and gets a site that is fully set up and live, on a domain in their own name. Paying and confirming are steps we keep; everything else we remove.

## The owner's path (target)

1. **Describe** (landing page). While the site generates, we check domain suggestions from the business name (`suggestDomains`: `pekarnakvas.si`, `pekarna-kvas.si`, … then `.com`) for availability and price.
2. **Fill what we can't invent** (one screen after generation): phone, address, hours, prices that weren't in the description. Never invented; a missing fact stays a placeholder that blocks publishing.
3. **Objavi** → a sheet: the best free domain is preselected ("pekarnakvas.si, vključena v letni paket"), two alternatives, "Že imam domeno". Registrant details are prefilled from the site (business name, address, email) with one "Uredi".
4. **Pay** (when billing exists) and **confirm**.
5. **Live at once** on `pekarnakvas.stranko.<tld>` (platform subdomain, HTTPS immediately), and on the owner's domain as soon as it resolves (.si: about an hour; the registry publishes its zone hourly). The editor shows "Registracija… · Varna povezava… · Objavljeno", and we email the owner when the domain is live.

Target: Publish → live in 3 taps plus payment when the facts are filled. A browser test counts them (as `owner-tasks-browser.test.ts` does for edits).

## Hostnames (owner, 2026-10-19; product renamed Postavi on 2026-10-17)

- `postavi.si`, `www.postavi.si`: the homepage (`infra/coming-soon`).
- `app.postavi.si`: the app (dashboard, editor, API, admin), `APP_URL`.
- `<slug>.postavi.si`: published sites through the edge Worker, `PLATFORM_DOMAIN=postavi.si`. A slug is never one of the platform's own names (`RESERVED_SITE_LABELS` in `packages/platform/src/reserved-labels.ts`: www, app, mail, api, admin …); the resolver treats such a label as the app's, and the Worker answers 404 for it and for the apex.
- `mail.postavi.si`: Resend sending.

## Connect-only beta (owner 2026-10-19; built 2026-10-21, branch claude/m5-connect-only)

In the free beta an owner can **connect a domain they already have**; **buying a domain through us stays off** until paid plans (Openprovider moves to M7b). Setup and env: docs/dev/domains.md.

- Config: `domains.connect` (`enabled`, `cnameTarget: "povezava.postavi.si"`, our zone's fallback origin) and `domains.register` (`enabled: false`) replace the single `domains.enabled`; an old file's `enabled` is read as both (`migrateDomainsConfig`, tested). `providers.edge: "cloudflare-saas"`, `providers.dns: "system"`, the registrar stays `fake`.
- With registering off the publish step opens on "Že imam domeno" alone: no names to buy, no prices, no "vključena v letni paket", no holder form (Chromium test at 360 px). The API answers suggestions with none (the registrar isn't asked, also not while the site generates) and refuses a register request with 409 `register_off` and a Slovene message; provisioning fails a leftover registered row as `register_off` without a registrar call.
- Cloudflare for SaaS adapter wired from env (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`): custom hostname create (ssl method http, type dv; an existing one is found instead), status and certificate polling (`active_redeploying` counts as serving, `*blocked*`/`moved`/`deleted` and timed-out certificates as failed), delete (a gone one is fine). 400/401/403 are permanent, 429/5xx retried. Without the env the edge is "unconfigured" and connecting stays off, so a deploy without the credentials changes nothing for customers. Replacing a failed connected domain deletes its custom hostname (best effort). Tests answer from documented shapes; unit tests can't reach Cloudflare (fetch blocked, token cleared).
- Edge: custom hostnames arrive at the Worker with their own hostname, so the zone needs a catch-all Worker route `*/*` (the director adds it next to `*.postavi.si/*`). The Worker's reserved-label check still answers 404 for the apex and the platform's own names; `povezava` joined the reserved labels, so no site can take that slug.
- Left for the director: enable Cloudflare for SaaS (payment method), the proxied `povezava` record and fallback origin, the `*/*` route, the token and zone id on web and worker; then the live end-to-end check (M5 criterion 3).

## Architecture (researched 2026-10-03; sources in the HQ item notes)

- **Edge**: one Cloudflare Worker in front of every published site. It forwards each request to the Railway web service, naming the site's hostname in `x-postavi-site-host` with a shared secret (`x-postavi-proxy-secret`: `SITE_PROXY_SECRET`) (`SITE_PROXY_SECRET`); Railway routes by Host, and overriding Host at Cloudflare is Enterprise-only. The web service serves the site's live release for that hostname (`apps/web/src/site-hosts.ts`, done). Free plan: 100k requests/day; Workers Paid ($5/month) when traffic nears that.
- **Platform subdomains**: `*.<platform domain>` in our Cloudflare zone, proxied, Worker route; Universal SSL covers one wildcard level. Served by `PLATFORM_DOMAIN` (done).
- **Domains we register** (Openprovider API `/v1`, prepaid balance, free account): check with price → create the customer handle with the owner's own data (the domain is theirs) → DNS zone → register with `owner_handle` → add the domain as a zone in our Cloudflare account, switch nameservers, Worker route. Free DNS, free certificates, apex works. .si: any person or company may register; the registry asks name, address, email, phone and person/company, and verifies email or phone within 21 days (NIS2).
- **Domains the owner already has**: Cloudflare for SaaS on our zone (first 100 hostnames free, then $0.10/month each; enabling needs a payment method on the account). The owner adds one CNAME (`www`) and we verify by HTTP; an apex works only where their DNS host flattens CNAMEs, otherwise `www` plus a redirect, or moving nameservers to us. Their email (MX) is never touched. Domain Connect would automate the DNS step, but no Slovene host supports it yet.
- **Not Railway custom domains**: 2 per service on Hobby, 20 on Pro.

## Data

`site_domains` (migration 16, done): hostname, site, kind (`registered` | `connected`), status (`pending` | `active` | `failed`), step, primary flag, provider ids and last error in `detail`. Only active hostnames serve; non-primary ones 301 to the primary. Migration 18 adds the provisioning bookkeeping (attempts, next run, lease, failure code, the owner's email) and `sites.published_address`.

## Build order

Done (PR #104, branch claude/custom-domains): `site_domains`, serving by hostname (direct and behind the Worker), suggestions from the business name.

Done (branch claude/domain-flow, overnight plan `on-domain-flow`), all against in-memory fakes, no account needed:
1. Provider interfaces with fakes (`packages/platform/src/domain-providers.ts`): `DomainRegistrar` (check with cost, contact handle, register, registration status), `EdgeHostnames` (zone for a registered domain, custom hostname for an owner's own, certificate status, the CNAME target), `DnsLookup` (CNAME, NS, MX; `systemDns` reads real DNS, free). Every write is idempotent. Config `domains` (enabled flag, providers, TLDs with the price shown and the most we pay, retry and wait limits); a schema check keeps each TLD's `maxCostEur` within `plans.costs.domainEurPerYear`, which the margin check counts.
2. Provisioning job (`packages/engine/src/provision.ts`, worker queue `domain`, migration 18): registered `contact → zone → register → certificate → live`, connected `edge → dns → certificate → live`. One run per job claims a lease on the row, runs as far as it can and records the step; a failed step retries after `baseSeconds · 2^n` up to `maxAttempts`, a waiting step (registry, the owner's CNAME, the certificate) is asked again until `waitHours`; a permanent refusal (name taken, price above the ceiling, data refused) fails at once. The worker's sweep (every `sweepSeconds`) queues due rows, so a lost job or a dead process (lease expiry) resumes from the stored step. The price is checked again right before buying. A `registering` marker is stored before the register call; a run that finds it asks the registrar whether we hold the name (`lookup`) and adopts it, so a lost answer never buys a second domain or reports ours as taken, and a failed domain that is or may be bought can't be replaced by another name. A run lets go only of its own lease. The holder's personal details go to the registrar and only its handle is kept. "live" makes the hostname active (a registered domain's www too, redirecting), republishes the site and leaves the owner's email pending; the web process sends it (`apps/web/src/domain-email.ts`, idempotency key per hostname).
3. Republish on a new address: each publish records the address its release carries (`sites.published_address`); the worker republishes a published site whose address changed (a domain went live or away, PLATFORM_DOMAIN set) at start, hourly and at the end of provisioning. The published version is republished, not the draft; a version that no longer passes the checklist is logged and left.
4. The domain step in the editor (`apps/web/src/client/domain-step.ts`, API `apps/web/src/domains.ts`): "Objavi" on a site without a domain opens it; the best available name is preselected with two more, price from config ("13 € na leto · vključena v letni paket"), the holder prefilled from the site's facts (an s.p.'s legal name carries the holder's name; a company needs its contact person typed) with "Uredi"; one tap publishes and starts the domain. "Že imam domeno": the input becomes `www.<domain>` (an apex CNAME would collide with the owner's MX), DNS host named from its nameservers where we know it, the one CNAME to add, a note that their email (MX) stays untouched; we only ever read their DNS. Progress in Slovene: "Registriramo… · Varujemo povezavo… · Objavljeno", failures worded per cause with "Poskusi znova" / "Izberi drugo domeno", "Preveri zdaj" while waiting for the record. Measured in Chromium (`apps/web/test/domain-browser.test.ts`): Publish → live in 2 taps at 360 and 1280 px when the facts are filled; "Že imam domeno" 5 taps (typing the domain not counted).
5. Stats on an own domain: `stats.js` also reports from the site's own hostname (its shared files sit at `/_shared/` there); the beacon goes to `/_hit`, which the hostname routing maps to the site. The beacon passes the cross-site check by `Sec-Fetch-Site`; behind the Worker the Host header is the app's, so an Origin-only browser would be refused: check with the Worker.
6. Adapter skeletons from the current docs, not wired (`packages/platform/src/openprovider.ts`, `cloudflare-saas.ts`), tested against documented response shapes, not recordings.

Still free, not done:
- ~~The Worker script~~ Done 2026-10-19 (branch claude/m5-postavi-rename): `infra/edge/` (Cloudflare module Worker, `wrangler.toml` with placeholder routes, README with deploy steps), tests in `infra/edge/test/` in the fast tier. Not deployed. The beacon check of step 5 is done: an Origin equal to the hostname the Worker forwarded (secret matched) passes the cross-site check (`apps/web/src/access.ts`, test in `apps/web/test/site-hosts.test.ts`).

Needs the owner (HQ "Needs you"):
- Buy the platform domain (`stranko.si` and `stranko.com` are taken; decision `sb-email-spam`, item `it-trademark-domains`).
- Openprovider account (free) and a prepaid balance; Cloudflare for SaaS enabled (payment method on the account). Then wire the adapters (config `domains.providers`), record real responses, and switch `domains.enabled` on.
- Billing and the legal entity before a customer pays for a domain.

## Facts found while building (2026-10-04)

- Openprovider: production `https://api.openprovider.eu/v1`; the sandbox is documented only as `https://api.sandbox.openprovider.nl/v1beta/` (a `/v1` path answers there but isn't documented). Login `POST /v1/auth/login` → `data.token` (Bearer); TTL 48 h per the older v1beta article. Check `POST /v1/domains/check` (`domains[].name/extension`, `with_price`; `results[].status` "free"; `price.reseller` in the account currency; 15 names per call in the old docs). Customer `POST /v1/customers` → `data.handle` (name, address with street/number/zipcode, phone split into country/area/subscriber). Domain `POST /v1/domains` (owner/admin/tech/billing handles, `period`, `name_servers[]`) → `data.id`, `status` ACT/REQ (FAI failed). Rate limits: check 20 calls / 300 s, create 15 / 300 s, token 30 / 60 s. No `.si` specifics in the API reference: ask `GET /v1/domains/additional-data?domain.extension=si` once there is an account.
- Cloudflare for SaaS: custom hostname `POST /zones/{id}/custom_hostnames {hostname, ssl {method "http", type "dv"}}`; active when `status` and `ssl.status` are both "active"; HTTP validation completes only after the owner's CNAME is in place (TXT pre-validation avoids the gap). 100 hostnames included on Free/Pro/Business, $0.10 each after, hard cap per zone (`/custom_hostnames/quota`). Fallback origin `PUT /zones/{id}/custom_hostnames/fallback_origin {origin}`.

## Open questions

- Openprovider: which customer fields .si requires (ask the additional-data endpoints), whether .si needs a deposit, the real .si and .com prices (registry fee €10/year; expect €10–13 at the reseller; config offers .com at €13 unconfirmed), the documented `/v1` sandbox address, whose handles go in admin/tech/billing for .si, and whether a just-requested (REQ) domain is listed by ListDomains `full_name` at once (what `lookup` relies on after a lost register answer).
- Cloudflare: zone count limit on the Free plan; whether a zone can be added before its .si delegation passes.
- Who pays for a domain before billing exists (design partners)?
