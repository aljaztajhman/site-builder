# For the lawyer: what Stranko's own pages say, and what needs your eye

Prepared 2026-10-04 (HQ `it-landing-claims`). The pages are live as drafts at `/zasebnost`, `/pogoji` and `/dostopnost` on the preview app, and in code in `apps/web/src/privacy.tsx` and `apps/web/src/legal.tsx`. They are written in Slovene and address the reader formally (vikanje). Nothing in them is invented. Every number comes from `config/app.config.json`. What nobody has decided yet is a yellow placeholder.

## To fill before launch (config `legal`, one block)

The launch check lists every gap at server start (`[web] not ready for a public launch: …`), and `apps/web/test/legal.test.ts` keeps it honest.

1. `provider.companyName`: full registered name (s.p. or d.o.o.; see decision `sb-legal-entity`).
2. `provider.address`: the registered address, in one line.
3. `provider.registrationNumber`: matična številka.
4. `provider.taxNumber`: davčna številka (with `SI` once VAT-registered).
5. `provider.email`: the contact for privacy requests, accessibility problems and the terms.
6. `terms.cancellation`, `terms.liability`, `terms.changes`, `terms.law`: the four points below, as they should read in Slovene.
7. `lawyerReviewed.privacy` and `lawyerReviewed.terms`: set to `true` after your read. The "Osnutek" note then goes.

## Pogoji uporabe (/pogoji): what it says today

- Who we are (the provider facts above) and what the service does: a website made from the owner's description with AI, edited by the owner, hosted and published by us.
- **Facts**: we never invent phone numbers, addresses, hours, prices, names, reviews or awards. A missing fact is a marked gap that blocks publishing. The owner answers for the truth of what they enter and for the rights to photos and logos they upload. AI-made pictures carry an "Ustvarjeno z UI" label. The owner reads AI-written text before publishing.
- **Free preview**: 1 homepage per device without an account, deleted after 7 days unless the visitor signs in. A free account adds 1 more homepage and 5 assistant edits in total. A preview can't be published.
- **Plans**: Osnovni €15/month or €150/year, Plus €29/month or €290/year. VAT is included, the yearly plans include the domain, and yearly plans are paid by invoice and bank transfer. The page also lists each plan's page, language and picture limits and its monthly AI allowance (€1.50 or €3.50, plus €3 in the first month). Other terms: €99 for the first year for the first 100 Osnovni customers, a €79 setup service (included in yearly Plus), unused whole months credited on an upgrade, and direct editing always free. While billing is off it says the prices are planned.
- **Ownership**: the owner's texts, photos and data are theirs. Paid plans can download the whole site as files at any time. A domain we register is registered in the owner's name.
- **Data**: refers to /zasebnost. The app, database and files are in the EU.
- **Availability**: daily spend limits pause generation and the assistant until the next day. Published sites and direct editing keep working.

### Your points (placeholders today)

- **Cancellation, refunds, withdrawal.** Does the 14-day withdrawal right (ZVPot-1) apply to consumers here? Our customers are mostly s.p. and small companies, but some may buy as consumers. Should we offer the "30 days money back" proposed in GO-TO-MARKET §5? It isn't decided.
- **Liability**: limits for downtime, lost data, and AI-written text the owner published.
- **Changes to the terms**: how and how far ahead owners are told (email to the account?).
- **Governing law and court.**

## Zasebnost (/zasebnost): what to check

- **Controller identity.** The provider facts above come from the same config.
- **What is stored.** Email and sign-in time; the description, photos, logo and every version of the site; form messages (also emailed to the owner); assistant chats; cost per generation; anonymous previews deleted after 7 days; an optional reminder email deleted with its preview; website-checker results for 30 days.
- **Cookies.** Two first-party, strictly necessary cookies (`sb_device` for 365 days, `sb_account` for 30). No tracking. Published sites set no cookies; their visit counts are daily totals only.
- **IP addresses.** Only a keyed hash for rate limits, deleted after a day.
- **Processors.** Cloudflare Turnstile (loads when the visitor starts typing), Resend (email), Anthropic and fal.ai (text and image generation from the owner's description and photos), Railway (hosting in the EU, Amsterdam).
- **Please check:**
  - legal bases per purpose (not stated yet);
  - transfers to the US (Anthropic, fal.ai, Resend, Cloudflare): the safeguards and how to say it;
  - retention for accounts and published sites after cancellation (not decided);
  - whether a DPA is needed between us and each owner for their visitors' form messages and visit counts (we would be their processor).

## Izjava o dostopnosti (/dostopnost)

It says only what is checked: axe with WCAG 2.2 A and AA rules on the landing, sign-in and legal pages at 360 and 1280 px, no sideways scrolling, and footer links at least 24 px tall, all on every code change (`apps/web/test/legal-browser.test.ts`). It also says what isn't checked: the editor, and no manual screen-reader test. It claims no conformance. **Please check** whether the European Accessibility Act as transposed in Slovenia (ZDPS) applies to us as a microenterprise service provider, and whether the statement needs a formal structure or an enforcement contact.

## The sites we make for owners

Each generated site has its own privacy text and an accessibility statement template marked for the owner's review (PRODUCT.md). These are not covered here; review them separately.
