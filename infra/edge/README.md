# Edge Worker (postavi-edge)

A Cloudflare Worker in front of every published site (docs/plans/custom-domains.md). Not deployed yet.

## What it does

Cloudflare gives each site hostname its certificate; the Worker forwards the request to the Railway web
service and tells the app which site was asked for.

- Forwards method, path, query, body and headers to `ORIGIN` (Railway's own hostname of the web service;
  Railway routes by Host, and overriding Host at Cloudflare is Enterprise-only), with `redirect: "manual"`,
  so the app's own redirects (a second domain to the primary one) reach the visitor as they are.
- Sets `x-postavi-site-host` to the visitor's hostname and `x-postavi-proxy-secret` to `SITE_PROXY_SECRET`,
  after dropping any incoming copies of both. The app serves that site only when the secret matches
  (`apps/web/src/site-hosts.ts`); an Origin of that hostname then passes the app's cross-site check.
- Adds `x-forwarded-proto: https`, `x-forwarded-host` and `x-real-ip` (from `cf-connecting-ip`).
- Never forwards the apex (`postavi.si`) or a platform name under it (`app.`, `mail.`, `www.` …, the list in
  `packages/platform/src/reserved-labels.ts`, copied in the Worker and kept equal by its test): it answers 404,
  so a DNS slip can't put the app behind a site's name.

Hostname layout: `postavi.si` and `www.postavi.si` are the homepage (infra/coming-soon), `app.postavi.si`
the app (APP_URL), `<slug>.postavi.si` published sites (PLATFORM_DOMAIN=postavi.si, through this Worker),
`mail.postavi.si` Resend sending. Customers' own domains reach the Worker through Cloudflare for SaaS.

## Variables

| Name | Where | What |
| --- | --- | --- |
| `ORIGIN` | `wrangler.toml` `[vars]` | Railway's own address of the web service, e.g. `https://web-production-1234.up.railway.app` |
| `PLATFORM_DOMAIN` | `wrangler.toml` `[vars]` | `postavi.si` (the default) |
| `SITE_PROXY_SECRET` | wrangler secret | The same value as the web service's `SITE_PROXY_SECRET` on Railway |

## Deploy

Deployed 2026-10-19 as `postavi-edge` through the Cloudflare API (no wrangler on the dev PC): the module compiled with esbuild, uploaded with `PUT /accounts/{id}/workers/scripts/postavi-edge` (bindings ORIGIN and PLATFORM_DOMAIN as plain text, SITE_PROXY_SECRET as a secret), the route `*.postavi.si/*` and a proxied wildcard `*` AAAA `100::` on the zone. ORIGIN is `https://web-preview-31c6.up.railway.app`. The wrangler way below does the same.

```sh
cd infra/edge
npx wrangler login
npx wrangler secret put SITE_PROXY_SECRET   # paste the web service's value
# set ORIGIN in wrangler.toml, uncomment the routes
npx wrangler deploy
```

Wrangler bundles `src/worker.ts` itself; there is no build step of ours. Tests: `pnpm exec vitest run infra/edge/test`
(part of the fast tier).
