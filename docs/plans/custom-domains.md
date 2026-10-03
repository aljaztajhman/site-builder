# Custom domains: from a description to a live site on the owner's domain

Status: plan, 2026-10-03. HQ items `it-domain-flow`, `it-zero-to-live`, `it-platform-domain`, `it-customer-domains`, `it-openprovider`; overnight plan `on-domain-flow`; decision `sb-email-spam`.

## The promise

The owner writes a short description of what they do and gets a site that is fully set up and live, on a domain in their own name. Paying and confirming are steps we keep; everything else we remove.

## The owner's path (target)

1. **Describe** (landing page). While the site generates, we check domain suggestions from the business name (`suggestDomains`: `pekarnakvas.si`, `pekarna-kvas.si`, … then `.com`) for availability and price.
2. **Fill what we can't invent** (one screen after generation): phone, address, hours, prices that weren't in the description. Never invented; a missing fact stays a placeholder that blocks publishing.
3. **Objavi** → a sheet: the best free domain is preselected ("pekarnakvas.si, vključena v letni paket"), two alternatives, "Že imam domeno". Registrant details are prefilled from the site (business name, address, email) with one "Uredi".
4. **Pay** (when billing exists) and **confirm**.
5. **Live at once** on `pekarnakvas.stranko.<tld>` (platform subdomain, HTTPS immediately), and on the owner's domain as soon as it resolves (.si: about an hour; the registry publishes its zone hourly). The editor shows "Registracija… · Varna povezava… · Objavljeno", and we email the owner when the domain is live.

Target: Publish → live in 3 taps plus payment when the facts are filled. A browser test counts them (as `owner-tasks-browser.test.ts` does for edits).

## Architecture (researched 2026-10-03; sources in the HQ item notes)

- **Edge**: one Cloudflare Worker in front of every published site. It forwards each request to the Railway web service, naming the site's hostname in `x-stranko-site-host` with a shared secret (`SITE_PROXY_SECRET`); Railway routes by Host, and overriding Host at Cloudflare is Enterprise-only. The web service serves the site's live release for that hostname (`apps/web/src/site-hosts.ts`, done). Free plan: 100k requests/day; Workers Paid ($5/month) when traffic nears that.
- **Platform subdomains**: `*.<platform domain>` in our Cloudflare zone, proxied, Worker route; Universal SSL covers one wildcard level. Served by `PLATFORM_DOMAIN` (done).
- **Domains we register** (Openprovider API `/v1`, prepaid balance, free account): check with price → create the customer handle with the owner's own data (the domain is theirs) → DNS zone → register with `owner_handle` → add the domain as a zone in our Cloudflare account, switch nameservers, Worker route. Free DNS, free certificates, apex works. .si: any person or company may register; the registry asks name, address, email, phone and person/company, and verifies email or phone within 21 days (NIS2).
- **Domains the owner already has**: Cloudflare for SaaS on our zone (first 100 hostnames free, then $0.10/month each; enabling needs a payment method on the account). The owner adds one CNAME (`www`) and we verify by HTTP; an apex works only where their DNS host flattens CNAMEs, otherwise `www` plus a redirect, or moving nameservers to us. Their email (MX) is never touched. Domain Connect would automate the DNS step, but no Slovene host supports it yet.
- **Not Railway custom domains**: 2 per service on Hobby, 20 on Pro.

## Data

`site_domains` (migration 16, done): hostname, site, kind (`registered` | `connected`), status (`pending` | `active` | `failed`), step, primary flag, provider ids and last error in `detail`. Only active hostnames serve; non-primary ones 301 to the primary.

## Build order

Done in this branch: `site_domains`, serving by hostname (direct and behind the Worker), suggestions from the business name.

Free, needs no account (overnight plan `on-domain-flow`):
1. `DomainRegistrar` and `EdgeHostnames` interfaces with in-memory fakes; config `domains` (TLDs, price ceiling, enabled flag).
2. Provisioning job in the worker: register → DNS → edge → certificate → live, idempotent and retried, owner emailed when live, failure explained in Slovene.
3. The domain step in the editor's publish flow, and "Že imam domeno" with DNS lookups and exact records for the detected host.
4. The Worker script (`infra/edge/`) with tests; not deployed.
5. Openprovider and Cloudflare adapters from their current docs, tested against recorded responses.

Needs the owner (HQ "Needs you"):
- Buy the platform domain (`stranko.si` and `stranko.com` are taken; decision `sb-email-spam`, item `it-trademark-domains`).
- Openprovider account (free) and a prepaid balance; Cloudflare for SaaS enabled (payment method on the account).
- Billing and the legal entity before a customer pays for a domain.

## Open questions

- Openprovider: which customer fields .si requires, whether .si needs a deposit, the real .si price (registry fee €10/year; expect €10–13 at the reseller), and the `/v1` sandbox address.
- Cloudflare: zone count limit on the Free plan; whether a zone can be added before its .si delegation passes.
- Who pays for a domain before billing exists (design partners)?
