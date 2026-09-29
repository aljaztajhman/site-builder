import { renderToStaticMarkup } from "react-dom/server";
import {
  CookieConsent,
  Footer,
  Header,
  MobileActionBar,
  SECTION_ISLANDS,
  lcpImageFor,
  rendererFor,
  uiStrings,
  type RenderCtx,
  type ResolvedImage,
} from "@sb/components";
import {
  isPlaceholder,
  mapsUrl,
  setAt,
  fontPair,
  type ImageRef,
  type LinkTarget,
  type Locale,
  type Page,
  type SiteSpec,
} from "@sb/spec";
import { fontFaceCss, fontFiles, tokensCss } from "./tokens.ts";
import { DEFAULT_IMAGE_WIDTHS, variantFile, variantHeight, variantWidths } from "./images.ts";
import { sharedBundle } from "./shared.ts";
import { jsonLd } from "./jsonld.ts";

export interface RenderOptions {
  locale?: Locale;
  imageWidths?: number[];
  /** Override the shared bundle hash (tests). */
  sharedHash?: string;
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
  const up = localeDir(spec, locale) ? "../" : "";
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
    return pageFile(p);
  };

  const href = (t: LinkTarget): string | null => {
    if ("page" in t) return pageHref(t.page) + (t.section ? `#${t.section}` : "");
    if ("url" in t) return t.url;
    switch (t.action) {
      case "call":
        return isPlaceholder(b.phone) ? null : `tel:${b.phone}`;
      case "email":
        return isPlaceholder(b.email) ? null : `mailto:${b.email}`;
      case "directions":
        return isPlaceholder(b.address) ? null : mapsUrl(b.address);
      case "booking":
        return b.bookingUrl ?? null;
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
  for (const s of localizedPage.sections) for (const i of SECTION_ISLANDS[s.type] ?? []) islands.add(i);
  const needsConsent = islands.has("consent.js");

  const first = localizedPage.sections[0];
  const lcp = first ? lcpImageFor(first) : null;
  const lcpImg = lcp ? ctx.image(lcp.image) : null;
  const avif = lcpImg?.sources.find((s) => s.type === "image/avif");

  const pair = fontPair(design.fontPair);
  const fontsBase = ctx.shared("fonts/");
  const preloadFonts = fontFiles(design).filter((f) => f === `${pair.heading.file}.woff2` || f === `${pair.body.file}.woff2`);

  const body = renderToStaticMarkup(
    <body data-imagery={design.imagery} className={localized.chrome.mobileActionBar ? "has-action-bar" : undefined}>
      <a className="skip-link" href="#main">
        {ctx.t("skipToContent")}
      </a>
      <Header ctx={ctx} />
      <main id="main" tabIndex={-1}>
        {localizedPage.sections.map((section, index) => {
          const C = rendererFor(section.type);
          return <C key={section.id} section={section} ctx={ctx} index={index} />;
        })}
      </main>
      <Footer ctx={ctx} />
      {localized.chrome.mobileActionBar && <MobileActionBar ctx={ctx} />}
      {needsConsent && <CookieConsent ctx={ctx} />}
      {[...islands].sort().map((f) => (
        <script key={f} src={ctx.shared(`js/${f}`)} defer />
      ))}
    </body>,
  );

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
