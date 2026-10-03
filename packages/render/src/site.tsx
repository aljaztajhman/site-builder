import { renderToStaticMarkup } from "react-dom/server";
import {
  CookieConsent,
  Footer,
  Header,
  LandmarkSuffixes,
  MobileActionBar,
  islandsFor,
  lcpImageFor,
  rendererFor,
  barActions,
  signatureActions,
  signatureOffersDirections,
  uiStrings,
  type RenderCtx,
  type ResolvedImage,
} from "@sb/components";
import {
  DIRECTIONS,
  isPlaceholder,
  isWebUrl,
  mapsUrl,
  setAt,
  fontPair,
  type ImageRef,
  type LinkTarget,
  type Locale,
  type Page,
  type SectionOf,
  type SiteSpec,
} from "@sb/spec";
import { fontFaceCss, fontFiles, tokensCss } from "./tokens.ts";
import { DEFAULT_IMAGE_WIDTHS, variantFile, variantHeight, variantWidths } from "./images.ts";
import { sharedBundle } from "./shared.ts";
import { jsonLd } from "./jsonld.ts";
import { landmarkSuffixes } from "./landmarks.ts";

/** The actions the page's first section offers as buttons or links (call, booking, directions, e-mail). */
function heroActions(first: { type: string; variant: string; props: unknown } | undefined): string[] {
  if (!first) return [];
  if (first.type === "hero-signature") return signatureActions(first as SectionOf<"hero-signature">);
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
}

export function pageFile(page: Pick<Page, "slug">): string {
  return `${page.slug || "index"}.html`;
}

/** Applies a locale's translation overlay. The default locale returns the spec unchanged. */
export function localizeSpec(spec: SiteSpec, locale: Locale): SiteSpec {
  if (locale === spec.locales.default) return spec;
  const clone = structuredClone(spec);
  for (const [ptr, value] of Object.entries(spec.translations?.[locale] ?? {})) setAt(clone, ptr, value);
  return clone;
}

/** Output directory prefix of a locale: "" for the default, "en/" for others. */
export function localeDir(spec: SiteSpec, locale: Locale): string {
  return locale === spec.locales.default ? "" : `${locale}/`;
}

export function makeCtx(spec: SiteSpec, page: Page, opts: RenderOptions = {}): RenderCtx {
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
    shared: (file) => `${up}../_shared/${hash}/${file}`,
    media,
  };
}

/** Renders one page to a complete HTML document. Same function for preview, publish and export. */
export function renderPage(spec: SiteSpec, page: Page, opts: RenderOptions = {}): string {
  const locale = opts.locale ?? spec.locales.default;
  const localized = localizeSpec(spec, locale);
  const localizedPage = localized.pages.find((p) => p.id === page.id) ?? page;
  const ctx = makeCtx(localized, localizedPage, opts);
  const design = localized.design;

  const islands = new Set<string>(["nav.js"]);
  for (const s of localizedPage.sections) for (const i of islandsFor(s)) islands.add(i);
  // The privacy policy says consent can be withdrawn with the footer's "cookie settings" button, which consent.js
  // reveals: on a site with consent-gated embeds the privacy page loads it too, with the notice closed until asked for.
  const consentOnRequest =
    localizedPage.kind === "privacy" &&
    !islands.has("consent.js") &&
    localized.pages.some((p) => p.sections.some((s) => islandsFor(s).includes("consent.js")));
  if (consentOnRequest) islands.add("consent.js");
  const needsConsent = islands.has("consent.js");

  const first = localizedPage.sections[0];
  const lcp = first ? lcpImageFor(first) : null;
  const lcpImg = lcp ? ctx.image(lcp.image) : null;
  const avif = lcpImg?.sources.find((s) => s.type === "image/avif");

  const pair = fontPair(design.fontPair);
  const fontsBase = ctx.shared("fonts/");
  const preloadFonts = fontFiles(design).filter((f) => f === `${pair.heading.file}.woff2` || f === `${pair.body.file}.woff2`);

  // Trade templates draw their motif (dividers, bullets, plates) from CSS keyed on this attribute.
  const motif = DIRECTIONS.find((d) => d.id === design.direction)?.template?.motif;
  const bar = localized.chrome.mobileActionBar === true;
  // Bar on screen from the start with an action the hero also offers (its call, a booking): on a phone the hero's
  // one is hidden (chrome.css), so one screen never shows two of the same.
  const afterHero = heroOffersCallAndDirections(first);
  const shown = heroActions(first);
  const covered = bar && !afterHero ? barActions(ctx).filter((a) => a !== "directions" && shown.includes(a)) : [];
  const bodyClass = bar ? ["has-action-bar", ...covered.map((a) => `bar-covers-hero-${a}`)].join(" ") : undefined;
  const renderBody = (suffixes: ReadonlyMap<string, string>) => renderToStaticMarkup(
    <body data-imagery={design.imagery} data-motif={motif} className={bodyClass}>
      <a className="skip-link" href="#main">
        {ctx.t("skipToContent")}
      </a>
      <Header ctx={ctx} />
      <main id="main" tabIndex={-1}>
        <LandmarkSuffixes.Provider value={suffixes}>
          {localizedPage.sections.map((section, index) => {
            const C = rendererFor(section.type);
            return <C key={section.id} section={section} ctx={ctx} index={index} />;
          })}
        </LandmarkSuffixes.Provider>
      </main>
      <Footer ctx={ctx} />
      {bar && <MobileActionBar ctx={ctx} afterHero={afterHero} />}
      {needsConsent && <CookieConsent ctx={ctx} onRequest={consentOnRequest} />}
      {[...islands].sort().map((f) => (
        <script key={f} src={ctx.shared(`js/${f}`)} defer />
      ))}
    </body>,
  );
  // Sections are named by their headings; when two share a heading text (e.g. a second booking section
  // from an edit), render again with a hidden "(2)" on the repeat so every landmark name stays unique.
  const firstBody = renderBody(new Map());
  const suffixes = landmarkSuffixes(firstBody, localizedPage.sections.map((s) => s.id));
  const body = suffixes.size ? renderBody(suffixes) : firstBody;

  const head = renderToStaticMarkup(
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{localizedPage.seo.title}</title>
      <meta name="description" content={localizedPage.seo.description} />
      <meta property="og:title" content={localizedPage.seo.title} />
      <meta property="og:description" content={localizedPage.seo.description} />
      <meta property="og:type" content="website" />
      <meta name="theme-color" content={design.colors.background} />
      {preloadFonts.map((f) => (
        <link key={f} rel="preload" href={`${fontsBase}${f}`} as="font" type="font/woff2" crossOrigin="" />
      ))}
      {lcp && avif && (
        <link rel="preload" as="image" type="image/avif" imageSrcSet={avif.srcSet} imageSizes={lcp.sizes} fetchPriority="high" />
      )}
      <link rel="stylesheet" href={ctx.shared("site.css")} />
      <style dangerouslySetInnerHTML={{ __html: fontFaceCss(design, fontsBase) + tokensCss(design) }} />
      {localizedPage.kind === "home" && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(localized) }} />
      )}
    </head>,
  );

  return `<!doctype html><html lang="${locale}">${head}${body}</html>`;
}

export interface RenderedSite {
  /** Relative path inside the site directory -> HTML. */
  pages: Map<string, string>;
  sharedHash: string;
}

/** Renders every page in every enabled locale. */
export function renderSite(spec: SiteSpec, opts: Omit<RenderOptions, "locale"> = {}): RenderedSite {
  const pages = new Map<string, string>();
  for (const locale of spec.locales.enabled) {
    const dir = localeDir(spec, locale);
    for (const page of spec.pages) pages.set(`${dir}${pageFile(page)}`, renderPage(spec, page, { ...opts, locale }));
  }
  return { pages, sharedHash: opts.sharedHash ?? sharedBundle().hash };
}

/** Media files a site references (image variants and the logo), for publish and export. */
export function mediaFiles(spec: SiteSpec, imageWidths: number[] = DEFAULT_IMAGE_WIDTHS): string[] {
  const out: string[] = [];
  for (const img of spec.assets.images)
    for (const w of variantWidths(img, imageWidths)) for (const f of ["avif", "webp"] as const) out.push(variantFile(img.id, w, f));
  if (spec.assets.logo) out.push(spec.assets.logo.file);
  return out;
}
