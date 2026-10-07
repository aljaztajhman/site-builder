# Component contract

How section components are defined and rendered. Read before adding or changing a component.

## Where things live

| What | Where |
| --- | --- |
| Props schema, variants, catalogue notes | `packages/spec/src/sections/<group>.ts` via `defineSection` |
| React renderer | `packages/components/src/groups/<group>/<Name>.tsx`, registered in that group's `index.ts` |
| Styles | `packages/components/styles/<group>.css` (concatenated into one shared `site.css`) |
| Client-side JS (islands) | `packages/components/islands/<name>.js`, plain ES2020, no dependencies, no build step |
| Site chrome (header, footer, mobile action bar, cookie consent) | `packages/components/src/chrome/` |
| Trade motifs (drawn objects of the template directions) | `packages/components/src/motifs/` (`index.tsx` the templates', `trades.tsx` the sub-trades'), `styles/motifs.css`, the repeating pieces as SVG tokens in `packages/render/src/tokens.ts` (`motifVars`, `subMotifVars`) |

Trade motifs: a template direction's motif sets `data-motif` on `<body>` and every rule for it is scoped `[data-motif="x"]`, so each site loads `site-<motif>.css` without the other trades' rules (`packages/render/src/shared.ts`). Sub-trade motifs (spec v15 `business.subtype`, picked by `siteMotif` in `packages/spec/src/motif.ts`) draw on their template's layout: wire, joint, tiles and strip on Cevi (in place of the radiator, the pipe divider, the T-joint bullets and the brand dots), stem and tag on Etiketa (in place of the olive branch, plus a brand mark). They add `data-submotif`, and every one of their rules must name `[data-submotif="x"]` (a test checks it): the site then loads `site-<motif>-<sub>.css`, and the stylesheets of sites without a subtype stay byte-identical. Colours only from tokens; check new motifs with `pnpm motifs:sheet` (360 and 1280 px, axe) and `tools/eval/test/motifs-render.test.ts`.

Groups: `heroes`, `content`, `business`, `structure`. Each group's spec file exports `<group>Schemas` (tuple, `as const`) and `<group>Defs`; each group's components `index.ts` exports `<group>Renderers` keyed by section type. `packages/components/src/registry.ts` uses `satisfies SectionRenderers`, so typecheck fails if a section type has no renderer.

Reference implementation: `hero-split` (`packages/spec/src/sections/heroes.ts`, `packages/components/src/groups/heroes/HeroSplit.tsx`, `styles/heroes.css`).

## Rules

- **Section types are kebab-case**; ids in specs are `s_*`, pages `p_*`, images `img_*`.
- **Props use `z.strictObject`** and the helpers in `packages/spec/src/common.ts`: `text(max)` for every string (the max is the component's content length limit), `Link` for actions, `ImageRef` for photos, `Price` for prices, `orPlaceholder(...)` for facts that may be missing. No free-form HTML or markdown. No recursive schemas (structured outputs don't support them).
- **Facts come from `ctx.site.business`**, never from props: phone, email, address, opening hours, booking URL, provider (ZEPT) data. Use the primitives `PhoneLink`, `EmailLink`, `AddressText`, `HoursList`, `PriceText`, `MaybeText`, `Ph`. A missing fact renders as a visible placeholder (`<mark class="ph">`).
- **Never invent facts.** No props for testimonials, ratings, reviews, awards, client logos, statistics, certifications. Names of people and prices use `orPlaceholder`.
- **Headings**: heroes and `page-header` render the page `h1` (with `id={titleId(section.id)}`); every other section renders an `h2` via `SectionHead` or `titleId`, items use `h3`. Wrap sections in the `Section` primitive.
- **Images**: always through `Picture` with an accurate `sizes`. Pass `priority={index === 0}` in sections that can open a page. If the section can be first on a page with a photo, register an LCP resolver (see `heroLcp`) using the same `sizes` string.
- **Links/buttons**: `ActionLink`/`Actions`. They render nothing when the target needs a missing fact.
- **Text**: all fixed UI strings go through `ctx.t(key)` (`packages/components/src/i18n.ts`, add keys for both `sl` and `en`). Generated copy comes from props.
- **Mobile first**: base CSS is for 360 px; add `@media (min-width: 48rem)` / `64rem` for wider. No horizontal scroll at 360 px, including long Slovene words (headings use `overflow-wrap: break-word`). Primary tap targets ≥ 44×44 px (buttons are 48 px), ≥ 8 px apart, nothing interactive below 24×24 px. Nothing that only works on hover.
- **Tokens only**: colours via `var(--c-*)`, radius `var(--radius)`, fonts `var(--font-heading|body)`, sizes `var(--fs-*)`, spacing `var(--space-section|block)`, shadow `var(--shadow)`. Sections sit on three tones: `tone-default` (bg), `tone-alt` (surface), `tone-inverse` (inverse/onInverse) — every text colour you use must be one of the pairs checked in `packages/spec/src/design-rules.ts` (`CONTRAST_RULES`). Do not put `--c-muted` or `--c-primary` text on `tone-inverse`; use `--c-on-inverse`.
- **Banned (hard, a test greps the stylesheet)**: gradients (`linear-gradient`, `radial-gradient`, `conic-gradient`), `backdrop-filter`, `border-radius` ≥ 999 or `50%` on buttons (pill), monospace fonts, `font-style: italic` on headings, box shadows other than `var(--shadow)`, `text-align: center` as a section default (a variant may be centred only if listed in `centredVariants`), the default row of three icon feature cards, emoji, numbered labels like "01 / 02", filler copy. See docs/PRODUCT.md.
- **Accessibility**: WCAG 2.2 AA, zero axe violations. Landmarks, `aria-labelledby` on sections, visible focus, real buttons for toggles with `aria-expanded`/`aria-controls`, `<details>` for disclosure where it fits, `alt` from assets. Lighthouse accessibility must be 100.
- **No JS unless needed.** Islands are progressive enhancement: the content must be usable without JS.
- **Tests**: every renderer gets a test in `packages/components/test/<group>.test.tsx` rendering each variant with `renderToStaticMarkup` against the spec fixtures in `packages/components/test/helpers.ts`, asserting structure (h1/h2, links, placeholders) and that the section validates with its zod schema.
