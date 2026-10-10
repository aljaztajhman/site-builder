import { renderToStaticMarkup } from "react-dom/server";
import {
  CallFloat,
  CookieConsent,
  ENTRY_IMAGE_SIZES,
  EntryArticle,
  Footer,
  Header,
  CentredSections,
  LandmarkSuffixes,
  MobileActionBar,
  islandsFor,
  lcpImageFor,
  rendererFor,
  barActions,
  composedActions,
  heroOwnsCall,
  navHasMore,
  signatureActions,
  signatureOffersDirections,
  uiStrings,
  type LcpImage,
  type RenderCtx,
  type ResolvedImage,
} from "@sb/components";
import type { ReactNode } from "react";
import {
  COLLECTION_KINDS,
  centredOn,
  collectionEntries,
  entrySlugs,
  entryPages,
  entryTitle,
  isPlaceholder,
  isComposedLayoutPointer,
  isWebUrl,
  mapsUrl,
  setAt,
  fontPair,
  siteMotif,
  stylesheetName,
  type ImageRef,
  type LinkTarget,
  type Locale,
  type Page,
  type Post,
  type ResolvedEntry,
  type SectionOf,
  type SiteSpec,
} from "@sb/spec";
import { fontFaceCss, fontFiles, tokensCss } from "./tokens.ts";
import { DEFAULT_IMAGE_WIDTHS, variantFile, variantHeight, variantWidths } from "./images.ts";
import { COMPOSED_SHEETS, composedIslands, composedSheets, sharedBundle } from "./shared.ts";
import { entryJsonLd, faqJsonLd, jsonLd } from "./jsonld.ts";
import { feedOf, rssXml } from "./feed.ts";
import { OG_LOCALE, SHARE_IMAGE, indexable, normaliseSiteUrl, pagePath, robotsTxt, shareImageOf, sitemapEntries, sitemapXml } from "./seo.ts";
import { landmarkSuffixes } from "./landmarks.ts";

/** The actions the page's first section offers as buttons or links (call, booking, directions, e-mail). */
function heroActions(first: { type: string; variant: string; props: unknown } | undefined): string[] {
  if (!first) return [];
  if (first.type === "hero-signature") return signatureActions(first as SectionOf<"hero-signature">);
  if (first.type === "composed") return composedActions(first as SectionOf<"composed">);
  const p = first.props as { primary?: { target?: { action?: string } }; secondary?: { target?: { action?: string } } };
  return [p.primary?.target?.action, p.secondary?.target?.action].filter((a): a is string => a !== undefined);
}

/**
 * The page's first section puts both a phone link and a directions link on screen (its two actions, or
 * the facts of hero-type with-facts), so the call bar can wait until it has scrolled away without
 * breaking "call and directions in one tap".
 */
function heroOffersCallAndDirections(first: { type: string; variant: string; props: unknown } | undefined): boolean {
  if (!first) return false;
  if (first.type === "hero-type" && first.variant === "with-facts") return true;
  if (first.type === "hero-signature") return signatureOffersDirections(first as SectionOf<"hero-signature">);
  if (first.type === "composed") {
    const actions = composedActions(first as SectionOf<"composed">);
    return actions.includes("call") && actions.includes("directions");
  }
  const p = first.props as { primary?: { target?: { action?: string } }; secondary?: { target?: { action?: string } } };
  const actions = [p.primary?.target?.action, p.secondary?.target?.action];
  return actions.includes("call") && actions.includes("directions");
}

export interface RenderOptions {
  locale?: Locale;
  imageWidths?: number[];
  /** Override the shared bundle hash (tests). */
  sharedHash?: string;
  /**
   * Directory levels below the page's own directory that the document is served at. Only the 404 page
   * uses it: a miss at /s/x/storitve/missing is answered with the 404 page one level down, so every
   * relative path climbs one more "../". 0 (the default) is the page's own place.
   */
  depth?: number;
  /**
   * The site's absolute address (https://pekarnakvas.si/), when it has a domain. Canonical URLs, hreflang,
   * og:url, og:image and the sitemap need it; without it they are left out. Preview, publish and export pass
   * the same address, so the pages are the same.
   */
  siteUrl?: string | null;
}

export function pageFile(page: Pick<Page, "slug">): string {
  return `${page.slug || "index"}.html`;
}

/**
 * Applies a locale's translation overlay. The default locale returns the spec unchanged. Collection entries keep
 * the page names of the default language (a translated title must not move en/novice/odprtje.html).
 */
export function localizeSpec(spec: SiteSpec, locale: Locale): SiteSpec {
  if (locale === spec.locales.default) return spec;
  const clone = structuredClone(spec);
  // A composed section's layout value is never translated (validateSite rejects such an overlay; an old one is ignored).
  for (const [ptr, value] of Object.entries(spec.translations?.[locale] ?? {})) if (!isComposedLayoutPointer(spec, ptr)) setAt(clone, ptr, value);
  for (const kind of COLLECTION_KINDS) {
    const items = spec.collections?.[kind]?.items;
    const slugs = items ? entrySlugs(items) : [];
    clone.collections?.[kind]?.items.forEach((item, i) => {
      if (slugs[i] !== undefined) item.slug = slugs[i];
    });
  }
  return clone;
}

/** Output directory prefix of a locale: "" for the default, "en/" for others. */
export function localeDir(spec: SiteSpec, locale: Locale): string {
  return locale === spec.locales.default ? "" : `${locale}/`;
}

export function makeCtx(spec: SiteSpec, page: Page, opts: RenderOptions & { entry?: boolean } = {}): RenderCtx {
  const locale = opts.locale ?? spec.locales.default;
  const down = "../".repeat(opts.depth ?? 0);
  const up = down + (localeDir(spec, locale) ? "../" : "");
  const hash = opts.sharedHash ?? sharedBundle().hash;
  const widths = opts.imageWidths ?? DEFAULT_IMAGE_WIDTHS;
  const media = (file: string) => `${up}media/${file}`;
  const images = new Map(spec.assets.images.map((i) => [i.id, i]));
  const b = spec.business;

  const image = (id: ImageRef): ResolvedImage => {
    const asset = images.get(id);
    if (!asset) throw new Error(`Unknown image ${id}`);
    const ws = variantWidths(asset, widths);
    const srcSet = (fmt: "avif" | "webp") => ws.map((w) => `${media(variantFile(id, w, fmt))} ${w}w`).join(", ");
    const mid = ws.find((w) => w >= 720) ?? ws[ws.length - 1]!;
    return {
      asset,
      sources: [
        { type: "image/avif", srcSet: srcSet("avif") },
        { type: "image/webp", srcSet: srcSet("webp") },
      ],
      src: media(variantFile(id, mid, "webp")),
      width: mid,
      height: variantHeight(asset, mid),
      alt: asset.alt,
    };
  };

  const pageHref = (pageId: string) => {
    const p = spec.pages.find((x) => x.id === pageId);
    if (!p) throw new Error(`Unknown page ${pageId}`);
    return down + pageFile(p);
  };

  const href = (t: LinkTarget): string | null => {
    if ("page" in t) return pageHref(t.page) + (t.section ? `#${t.section}` : "");
    if ("url" in t) return isWebUrl(t.url) ? t.url : null;
    switch (t.action) {
      case "call":
        return isPlaceholder(b.phone) ? null : `tel:${b.phone}`;
      case "email":
        return isPlaceholder(b.email) ? null : `mailto:${b.email}`;
      case "directions":
        return isPlaceholder(b.address) ? null : mapsUrl(b.address);
      case "booking":
        return b.bookingUrl !== undefined && isWebUrl(b.bookingUrl) ? b.bookingUrl : null;
    }
  };

  return {
    site: spec,
    page,
    locale,
    t: uiStrings(locale),
    image,
    href,
    pageHref,
    ...(opts.entry ? { entry: true } : {}),
    entryHref: (path) => down + path,
    shared: (file) => `${up}../_shared/${hash}/${file}`,
    media,
  };
}

/** What differs between a page of the spec and a collection entry's page; the document around it is the same. */
interface Doc {
  /** The page whose context the document renders in (navigation, links): the page itself, or an entry's list page. */
  page: Page;
  /** The page's sections, for islands, the opening picture and the call bar (none on an entry's page). */
  sections: Page["sections"];
  main: (ctx: RenderCtx) => ReactNode;
  /** Ids of the landmarks named by their headings, for landmarkSuffixes. */
  landmarks: string[];
  title: string;
  description: string;
  ogType: "website" | "article";
  /** Path inside the site per locale (seo.ts pagePath), or null for a page that is never indexed (404). */
  path: ((l: Locale) => string) | null;
  lcp: LcpImage | null;
  islands: string[];
  jsonLd: string[];
}

/** Renders one page to a complete HTML document. Same function for preview, publish and export. */
export function renderPage(spec: SiteSpec, page: Page, opts: RenderOptions = {}): string {
  const locale = opts.locale ?? spec.locales.default;
  const localized = localizeSpec(spec, locale);
  const localizedPage = localized.pages.find((p) => p.id === page.id) ?? page;
  const siteUrl = normaliseSiteUrl(opts.siteUrl);
  const share = shareImageOf(spec);
  const faq = faqJsonLd(localizedPage);
  const first = localizedPage.sections[0];
  return renderDocument(spec, localized, opts, {
    page: localizedPage,
    sections: localizedPage.sections,
    main: (ctx) =>
      localizedPage.sections.map((section, index) => {
        const C = rendererFor(section.type);
        return <C key={section.id} section={section} ctx={ctx} index={index} />;
      }),
    landmarks: localizedPage.sections.map((s) => s.id),
    title: localizedPage.seo.title,
    description: localizedPage.seo.description,
    ogType: "website",
    path: indexable(localizedPage) ? (l) => pagePath(spec, page, l) : null,
    lcp: first ? lcpImageFor(first) : null,
    islands: [],
    jsonLd: [
      ...(localizedPage.kind === "home" ? [jsonLd(localized, { siteUrl, homePath: pagePath(spec, page, locale), shareImage: share?.file ?? null })] : []),
      ...(faq ? [faq] : []),
    ],
  });
}

/**
 * Renders a collection entry's own page (collections.ts entryPages): the site's header and footer around the
 * entry, one directory down (novice/odprtje.html). Same function for preview, publish and export.
 */
export function renderEntryPage(spec: SiteSpec, ref: Pick<ResolvedEntry, "kind" | "index">, opts: RenderOptions = {}): string {
  const locale = opts.locale ?? spec.locales.default;
  const localized = localizeSpec(spec, locale);
  const e = collectionEntries(localized.collections, ref.kind).find((x) => x.index === ref.index);
  if (!e || !e.path) throw new Error(`No page for ${ref.kind} entry ${ref.index}`);
  const listPage = localized.pages.find((p) => p.id === localized.collections?.[ref.kind]?.page) ?? localized.pages.find((p) => p.kind === "home") ?? localized.pages[0]!;
  const entryPath = e.path;
  const title = entryTitle(e.entry);
  const name = localized.business.name;
  const fullTitle = `${title} | ${name}`;
  const summary = "summary" in e.entry ? e.entry.summary : (e.entry.bio ?? `${e.entry.role}, ${name}`);
  const siteUrl = normaliseSiteUrl(opts.siteUrl);
  const path = (l: Locale) => `${localeDir(spec, l)}${entryPath}`;
  return renderDocument(spec, localized, { ...opts, depth: (opts.depth ?? 0) + 1, entry: true }, {
    page: listPage,
    sections: [],
    main: (ctx) => <EntryArticle e={e} ctx={ctx} />,
    landmarks: [],
    title: fullTitle.length <= 60 ? fullTitle : title.slice(0, 60),
    description: summary.slice(0, 160),
    ogType: e.kind === "blog" ? "article" : "website",
    path,
    lcp: e.entry.image ? { image: e.entry.image, sizes: ENTRY_IMAGE_SIZES } : null,
    islands: e.kind === "events" ? ["events.js"] : [],
    jsonLd: [entryJsonLd(localized, e, siteUrl ? siteUrl + path(locale) : null, siteUrl, siteUrl ? largestImageUrl(spec, e.entry.image, siteUrl, opts.imageWidths) : null)],
  });
}

/** Absolute URL of an image's largest WebP variant, for structured data. */
function largestImageUrl(spec: SiteSpec, id: string | undefined, siteUrl: string, widths: number[] = DEFAULT_IMAGE_WIDTHS): string | null {
  const asset = id ? spec.assets.images.find((i) => i.id === id) : undefined;
  if (!asset) return null;
  const w = variantWidths(asset, widths).at(-1)!;
  return `${siteUrl}media/${variantFile(asset.id, w, "webp")}`;
}

function renderDocument(spec: SiteSpec, localized: SiteSpec, opts: RenderOptions & { entry?: boolean }, doc: Doc): string {
  const locale = opts.locale ?? spec.locales.default;
  const ctx = makeCtx(localized, doc.page, opts);
  const design = localized.design;

  // nav.js (the menu) and stats.js (cookieless tap counts, live address only) are on every page.
  const islands = new Set<string>(["nav.js", "stats.js", ...doc.islands]);
  for (const s of doc.sections) for (const i of islandsFor(s)) islands.add(i);
  // Composed motion presets that need JS (spec v20), served after the bundle hash (shared.ts composedIslands).
  for (const i of composedIslands(doc.sections)) islands.add(i);
  // A wide header with more menu entries than its row holds lists the rest under "Več" (Plus has up to 20 pages).
  if (navHasMore(ctx)) islands.add("nav-more.js");
  // The privacy policy says consent can be withdrawn with the footer's "cookie settings" button, which consent.js
  // reveals: on a site with consent-gated embeds the privacy page loads it too, with the notice closed until asked for.
  const consentOnRequest =
    doc.sections === doc.page.sections &&
    doc.page.kind === "privacy" &&
    !islands.has("consent.js") &&
    localized.pages.some((p) => p.sections.some((s) => islandsFor(s).includes("consent.js")));
  if (consentOnRequest) islands.add("consent.js");
  const needsConsent = islands.has("consent.js");

  const first = doc.sections[0];
  const lcp = doc.lcp;
  const lcpImg = lcp ? ctx.image(lcp.image) : null;
  const avif = lcpImg?.sources.find((s) => s.type === "image/avif");

  const pair = fontPair(design.fontPair);
  const fontsBase = ctx.shared("fonts/");
  const preloadFonts = fontFiles(design).filter((f) => f === `${pair.heading.file}.woff2` || f === `${pair.body.file}.woff2`);

  // Trade templates draw their motif (dividers, bullets, plates) from CSS keyed on this attribute; a sub-trade motif
  // (spec v15 business.subtype) draws its own pieces on the template's layout.
  const { motif, sub } = siteMotif(localized);
  const bar = localized.chrome.mobileActionBar === true;
  // Bar on screen from the start with an action the hero also offers (its call, a booking): on a phone the hero's
  // one is hidden (chrome.css), so one screen never shows two of the same.
  const afterHero = heroOffersCallAndDirections(first);
  const shown = heroActions(first);
  // Spec v15: the site's skeleton says where the call lives on phones: the bar, one floating call button, or the header
  // (no fixed element). Either fixed one waits for a hero that offers call and directions itself (reveal.js), so a screen
  // never shows two call buttons; skeleton.css turns every other call button into a text link.
  const skeleton = design.skeleton;
  const fixed = !bar || !skeleton ? (bar ? "bar" : null) : skeleton.actions === "header" ? null : skeleton.actions;
  const covered = fixed === "bar" && !afterHero ? barActions(ctx).filter((a) => a !== "directions" && shown.includes(a)) : [];
  const bodyClass =
    fixed === "bar" ? ["has-action-bar", ...covered.map((a) => `bar-covers-hero-${a}`)].join(" ") : fixed === "float" ? "has-call-float" : undefined;
  // A hero whose call object owns the call (a plate, a call block): only the fixed element's call waits for it.
  const waitCall = skeleton !== undefined && !afterHero && heroOwnsCall(first);
  if (skeleton && ((fixed && (afterHero || waitCall)) || (skeleton.actions === "header" && heroOwnsCall(first)))) islands.add("reveal.js");
  const skeletonAttrs = skeleton
    ? {
        "data-skeleton": "",
        "data-actions": skeleton.actions,
        "data-width": skeleton.width,
        "data-cards": skeleton.cards,
        "data-buttons": skeleton.buttons,
        "data-dividers": skeleton.dividers,
        "data-ratio": skeleton.photoRatio,
      }
    : {};
  // Spec v18: a picked genome's shape language beyond the radius (cut corners, arched tops; genome.css). A preset genome
  // (every migrated site) and the square and soft shapes add nothing, so their HTML is as before.
  const shape = design.genome?.source === "picked" && (design.genome.shape === "cut" || design.genome.shape === "arch") ? design.genome.shape : undefined;
  // The page's one centred section (design.skeleton.centred), if any; none without a skeleton.
  const centred = centredOn(skeleton, doc.sections, motif);
  // Spec v20: the page's opening composed section has the header over it (composed-v2.css, body[data-hdr="over"]).
  const headerOver = doc.sections === doc.page.sections && first?.type === "composed" && (first as SectionOf<"composed">).props.headerOver === true;
  const renderBody = (suffixes: ReadonlyMap<string, string>) => renderToStaticMarkup(
    <body data-imagery={design.imagery} data-motif={motif} data-submotif={sub} data-shape={shape} data-hdr={headerOver ? "over" : undefined} className={bodyClass} {...skeletonAttrs}>
      <a className="skip-link" href="#main">
        {ctx.t("skipToContent")}
      </a>
      <Header ctx={ctx} />
      <main id="main" tabIndex={-1}>
        <LandmarkSuffixes.Provider value={suffixes}>
          <CentredSections.Provider value={centred}>{doc.main(ctx)}</CentredSections.Provider>
        </LandmarkSuffixes.Provider>
      </main>
      <Footer ctx={ctx} />
      {fixed === "bar" && <MobileActionBar ctx={ctx} afterHero={afterHero} reveal={skeleton !== undefined} waitCall={waitCall} />}
      {fixed === "float" && <CallFloat ctx={ctx} reveal={afterHero} waitCall={waitCall} />}
      {needsConsent && <CookieConsent ctx={ctx} onRequest={consentOnRequest} />}
      {[...islands].sort().map((f) => (
        <script key={f} src={ctx.shared(`js/${f}`)} defer />
      ))}
    </body>,
  );
  // Sections are named by their headings; when two share a heading text (e.g. a second booking section
  // from an edit), render again with a hidden "(2)" on the repeat so every landmark name stays unique.
  const firstBody = renderBody(new Map());
  const suffixes = landmarkSuffixes(firstBody, doc.landmarks);
  const body = suffixes.size ? renderBody(suffixes) : firstBody;

  // Search and sharing (seo.ts). A 404 page is never indexed and has no address of its own.
  const siteUrl = normaliseSiteUrl(opts.siteUrl);
  const canonical = siteUrl && doc.path ? siteUrl + doc.path(locale) : null;
  const alternates = siteUrl && doc.path && spec.locales.enabled.length > 1 ? spec.locales.enabled : [];
  const share = shareImageOf(spec);
  const shareAsset = share ? localized.assets.images.find((i) => i.id === share.image) : undefined;
  const feed = siteUrl ? feedOf(spec) : null;
  const head = renderToStaticMarkup(
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{doc.title}</title>
      <meta name="description" content={doc.description} />
      <meta property="og:title" content={doc.title} />
      <meta property="og:description" content={doc.description} />
      <meta property="og:type" content={doc.ogType} />
      <meta property="og:site_name" content={localized.business.name} />
      <meta property="og:locale" content={OG_LOCALE[locale]} />
      {spec.locales.enabled
        .filter((l) => l !== locale)
        .map((l) => (
          <meta key={l} property="og:locale:alternate" content={OG_LOCALE[l]} />
        ))}
      {canonical && <meta property="og:url" content={canonical} />}
      {siteUrl && share && <meta property="og:image" content={`${siteUrl}media/${share.file}`} />}
      {siteUrl && share && <meta property="og:image:width" content={String(SHARE_IMAGE.width)} />}
      {siteUrl && share && <meta property="og:image:height" content={String(SHARE_IMAGE.height)} />}
      {siteUrl && share && shareAsset?.alt && <meta property="og:image:alt" content={shareAsset.alt} />}
      <meta name="twitter:card" content={siteUrl && share ? "summary_large_image" : "summary"} />
      {!doc.path && <meta name="robots" content="noindex" />}
      {canonical && <link rel="canonical" href={canonical} />}
      {alternates.map((l) => (
        <link key={l} rel="alternate" hrefLang={l} href={siteUrl + doc.path!(l)} />
      ))}
      {alternates.length > 0 && <link rel="alternate" hrefLang="x-default" href={siteUrl + doc.path!(spec.locales.default)} />}
      {feed && <link rel="alternate" type="application/rss+xml" title={feed.title} href={siteUrl + feed.path} />}
      <meta name="theme-color" content={design.colors.background} />
      {preloadFonts.map((f) => (
        <link key={f} rel="preload" href={`${fontsBase}${f}`} as="font" type="font/woff2" crossOrigin="" />
      ))}
      {lcp && avif && (
        <link rel="preload" as="image" type="image/avif" imageSrcSet={avif.srcSet} imageSizes={lcp.sizes} fetchPriority="high" />
      )}
      {/* The stylesheet without other trades' motif rules (shared.ts stylesheetFor). */}
      <link rel="stylesheet" href={ctx.shared(stylesheetName({ motif, sub }))} />
      {/* Composed sections have stylesheets of their own (spec v19 core, spec v20 additions), linked only by pages that use them. */}
      {composedSheets(doc.sections).map((k) => (
        <link key={k} rel="stylesheet" href={ctx.shared(COMPOSED_SHEETS[k]().name)} />
      ))}
      <style dangerouslySetInnerHTML={{ __html: fontFaceCss(design, fontsBase) + tokensCss(design, sub) }} />
      {doc.jsonLd.map((json, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      ))}
    </head>,
  );

  return `<!doctype html><html lang="${locale}">${head}${body}</html>`;
}

export interface RenderedSite {
  /** Relative path inside the site directory -> HTML. */
  pages: Map<string, string>;
  /** Other text files: robots.txt, and with the site's address sitemap.xml and the blog's RSS feed. */
  files: Map<string, string>;
  sharedHash: string;
}

/** Renders every page and every collection entry's page in every enabled locale, and the files search engines read. */
export function renderSite(spec: SiteSpec, opts: Omit<RenderOptions, "locale"> = {}): RenderedSite {
  const pages = new Map<string, string>();
  const entries = entryPages(spec.collections);
  for (const locale of spec.locales.enabled) {
    const dir = localeDir(spec, locale);
    for (const page of spec.pages) pages.set(`${dir}${pageFile(page)}`, renderPage(spec, page, { ...opts, locale }));
    for (const e of entries) pages.set(`${dir}${e.path}`, renderEntryPage(spec, e, { ...opts, locale }));
  }
  const siteUrl = normaliseSiteUrl(opts.siteUrl);
  const files = new Map<string, string>([["robots.txt", robotsTxt(siteUrl)]]);
  if (siteUrl) {
    const extra = entries.map((e) => ({
      paths: Object.fromEntries(spec.locales.enabled.map((l) => [l, `${localeDir(spec, l)}${e.path}`])),
      ...(e.kind === "blog" ? { lastmod: (e.entry as Post).date } : {}),
    }));
    files.set("sitemap.xml", sitemapXml(spec, siteUrl, sitemapEntries(spec, extra)));
    const feed = feedOf(spec);
    if (feed) files.set(feed.path, rssXml(spec, siteUrl));
  }
  return { pages, files, sharedHash: opts.sharedHash ?? sharedBundle().hash };
}

/**
 * The page a path inside the site renders, for the preview: a page of the spec ("storitve.html") or a
 * collection entry's page ("novice/odprtje.html"), in the default locale, or either of them under another enabled
 * locale's directory ("en/novice/odprtje.html"), as published. Null when it is neither.
 */
export function renderPath(spec: SiteSpec, path: string, opts: Omit<RenderOptions, "locale" | "depth"> = {}): string | null {
  const first = path.split("/")[0]!;
  const locale = path.includes("/") ? spec.locales.enabled.find((l) => l !== spec.locales.default && first === l) : undefined;
  const rest = locale ? path.slice(first.length + 1) : path;
  const o = locale ? { ...opts, locale } : opts;
  const page = spec.pages.find((p) => pageFile(p) === rest);
  if (page) return renderPage(spec, page, o);
  const entry = entryPages(spec.collections).find((e) => e.path === rest);
  return entry ? renderEntryPage(spec, entry, o) : null;
}

/** Media files a site references (image variants and the logo), for publish and export. */
export function mediaFiles(spec: SiteSpec, imageWidths: number[] = DEFAULT_IMAGE_WIDTHS): string[] {
  const out: string[] = [];
  for (const img of spec.assets.images)
    for (const w of variantWidths(img, imageWidths)) for (const f of ["avif", "webp"] as const) out.push(variantFile(img.id, w, f));
  if (spec.assets.logo) out.push(spec.assets.logo.file);
  return out;
}
