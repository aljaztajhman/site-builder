# Own domains: setup

How a customer's own domain reaches their site, and what has to be set up for it. Product plan and history:
docs/plans/custom-domains.md. In the free beta only **connecting a domain the owner already has** is on;
buying domains through us (Openprovider) stays off until paid plans (owner, 2026-10-19; M7b).

## Config (`config/app.config.json`, `domains`)

| Key | Value today | What |
| --- | --- | --- |
| `connect.enabled` | `true` | Offers "Že imam domeno" in the publish step. |
| `connect.cnameTarget` | `povezava.postavi.si` | What the owner's `www` CNAME points at: our zone's fallback origin. |
| `register.enabled` | `false` | Offers names to buy. While off: no suggestions, the API refuses register requests (409 `register_off`, Slovene message), provisioning fails a leftover registered row as `register_off` without calling a registrar. |
| `providers.edge` | `cloudflare-saas` | Custom hostnames on our zone, credentials from env (below). `fake`: in memory (tests, dev). |
| `providers.registrar` | `fake` | The only choice; never called while registering is off. |
| `providers.dns` | `system` | Reads the owner's CNAME from real DNS (free). `fake` answers as if it were in place (dev). |

The domain step shows when connecting or registering is usable. Connecting is usable only when the edge
is configured: with `cloudflare-saas` and its env missing, the app treats connecting as off (the step
doesn't show, the API answers 409), so a deploy without the credentials changes nothing for customers.

An older config with one `domains.enabled` is still read: it becomes both switches (`migrateDomainsConfig`).

## Environment (web **and** worker on Railway)

| Name | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token scoped to the postavi.si zone with **SSL and Certificates: Edit** (custom hostnames). Secret: set it on Railway, never print it. |
| `CLOUDFLARE_ZONE_ID` | The postavi.si zone id (`756294189eeb167597ba318a8edab12c`). |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_WORKER_SCRIPT` | Optional, for registered domains only (M7b): the account, and the Worker's script name (default `postavi-edge`). That token then also needs Zone Edit, DNS Edit and Workers Routes Edit. |

Both processes need the token: the web process checks the edge is configured before offering the step,
the worker adds the custom hostname and polls its status. With the web set and the worker not, a connected
domain's `edge` step retries and then fails ("Povezave domene … nismo mogli dokončati").

Unit tests never use these: `test-setup.ts` clears the token and blocks outbound fetch; the adapter tests
answer from documented response shapes.

## Cloudflare setup (once, by the director)

1. **Enable Cloudflare for SaaS** on the postavi.si zone (SSL/TLS → Custom Hostnames). Needs a payment
   method on the account; the first 100 hostnames are free, then $0.10 per hostname per month.
2. **Fallback origin record**: a proxied `AAAA povezava 100::` on postavi.si (the edge Worker answers, so
   the address is never reached). The wildcard `*` record does not count as a fallback origin; it needs its
   own record. Then set it as the fallback origin (SSL/TLS → Custom Hostnames → Fallback Origin, or
   `PUT /zones/{zone}/custom_hostnames/fallback_origin {"origin": "povezava.postavi.si"}`) and wait for it to
   be active. `povezava` is a reserved label, so no site can take that slug, and the Worker answers 404 for
   the name itself.
3. **Worker route for customer hostnames**: add the route `*/*` → `postavi-edge` on the zone, next to the
   existing `*.postavi.si/*`. Requests for a custom hostname carry that hostname (`www.pekarna.si`), not
   postavi.si, so only a catch-all route sends them through the Worker. The Worker already forwards any
   hostname that isn't the platform's own; the apex, `www.`, `app.`, `mail.` and the other reserved labels
   under postavi.si still answer 404 (its reserved-label check runs before forwarding), and those records
   are DNS-only, so they never reach it anyway.
4. **API token** with the permission above, scoped to the zone; set `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ZONE_ID` on web and worker in production (and staging, if it should connect domains too:
   both environments would then add hostnames to the same zone).

## What the owner does

"Objavi" → "Vaša domena" → `pekarna.si` → "Preveri": the step shows one record, `CNAME www
povezava.postavi.si`, at their DNS host (named when we recognise its nameservers), and that their email (MX)
stays untouched. "Objavi in poveži" publishes at `<slug>.postavi.si` at once and starts provisioning:
`edge` (custom hostname, HTTP validation, DV certificate) → `dns` (waits for the CNAME, up to
`waitHours.dns`) → `certificate` (waits for Cloudflare's `status` and `ssl.status` to be `active`) → `live`
(the hostname serves, the site is republished with its address, the owner is emailed). The apex
(`pekarna.si`) is redirected to `www` by the owner's DNS host where it can; we don't touch their apex.

Replacing a failed connected domain removes its custom hostname at Cloudflare (best effort, logged).

## Checking it live (M5 criterion 3)

With a test domain the director controls: connect it from a site's publish step on app.postavi.si, add the
CNAME, wait for "Objavljeno", open `https://www.<test domain>/`. Then remove the custom hostname in the
dashboard if the test domain isn't kept.
