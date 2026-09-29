import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { DIRECTIONS, SPEC_VERSION, isPlaceholder, mapsUrl, type Business, type Page, type SiteSpec } from "@sb/spec";
import { uiStrings } from "../src/i18n.ts";
import type { RenderCtx } from "../src/types.ts";

/** Business with every fact present. */
export const FULL_BUSINESS: Business = {
  name: "Frizerski salon Lipa",
  type: "hairdresser",
  phone: "+38641123456",
  email: "info@salon-lipa.si",
  address: { street: "Trubarjeva cesta 12", postalCode: "1000", city: "Ljubljana" },
  hours: {
    entries: [
      { from: "mon", to: "fri", open: "08:00", close: "19:00" },
      { from: "sat", to: "sat", open: "08:00", close: "13:00" },
      { from: "sun", to: "sun", closed: true },
    ],
  },
  bookingUrl: "https://booking.example.com/lipa",
  provider: { legalName: "Frizerski salon Lipa, Ana Novak s.p.", registrationNumber: "1234567000", taxNumber: "SI12345678", vatPayer: true, registry: "AJPES" },
};

/** Business with facts missing: every fact is a placeholder. */
export const SPARSE_BUSINESS: Business = {
  name: "Mizarstvo Bor",
  type: "builder",
  phone: { $placeholder: "phone" },
  email: { $placeholder: "email" },
  address: { $placeholder: "address" },
  hours: { $placeholder: "hours" },
  provider: {
    legalName: { $placeholder: "legalName" },
    registrationNumber: { $placeholder: "registrationNumber" },
    taxNumber: { $placeholder: "taxNumber" },
  },
};

const dir = DIRECTIONS[0]!;

export function testSpec(overrides: Partial<SiteSpec> = {}): SiteSpec {
  return {
    specVersion: SPEC_VERSION,
    slug: "salon-lipa",
    locales: { default: "sl", enabled: ["sl"] },
    business: FULL_BUSINESS,
    design: {
      direction: dir.id,
      fontPair: dir.fontPairs[0]!,
      colors: dir.palette.fallback,
      radius: dir.ranges.radius[0],
      baseFontSize: 16,
      scale: dir.ranges.scale[0],
      headingWeight: dir.ranges.headingWeight[0],
      headingCase: dir.ranges.headingCase[0]!,
      headingTracking: dir.ranges.headingTracking[0],
      density: dir.ranges.density[0]!,
      shadow: dir.ranges.shadow[0]!,
      imagery: dir.imagery,
    },
    assets: {
      images: [
        { id: "img_salon", src: "uploads/salon.jpg", width: 1600, height: 1200, alt: "Notranjost salona s tremi stoli" },
        { id: "img_detail", src: "uploads/detail.jpg", width: 1200, height: 1600, alt: "Frizerka striže lase" },
        { id: "img_team", src: "uploads/team.jpg", width: 1000, height: 1000, alt: "Ekipa salona" },
      ],
    },
    chrome: { header: { variant: "bar", cta: "call" }, footer: { variant: "columns" }, mobileActionBar: true },
    pages: [
      { id: "p_home", kind: "home", slug: "", nav: { label: "Domov", show: true }, seo: { title: "Salon Lipa", description: "Frizerski salon v Ljubljani." }, sections: [] as never },
      { id: "p_storitve", kind: "standard", slug: "storitve", nav: { label: "Storitve", show: true }, seo: { title: "Storitve", description: "Storitve salona." }, sections: [] as never },
    ],
    ...overrides,
  };
}

/** Minimal RenderCtx equivalent to @sb/render's makeCtx (components can't depend on render). */
export function testCtx(spec: SiteSpec = testSpec(), page?: Page): RenderCtx {
  const b = spec.business;
  const media = (f: string) => `media/${f}`;
  return {
    site: spec,
    page: page ?? spec.pages[0]!,
    locale: "sl",
    t: uiStrings("sl"),
    image: (id) => {
      const asset = spec.assets.images.find((i) => i.id === id);
      if (!asset) throw new Error(`Unknown image ${id}`);
      return {
        asset,
        sources: [
          { type: "image/avif", srcSet: `${media(`${id}-360.avif`)} 360w, ${media(`${id}-720.avif`)} 720w` },
          { type: "image/webp", srcSet: `${media(`${id}-360.webp`)} 360w, ${media(`${id}-720.webp`)} 720w` },
        ],
        src: media(`${id}-720.webp`),
        width: 720,
        height: Math.round((asset.height * 720) / asset.width),
        alt: asset.alt,
      };
    },
    href: (t) => {
      if ("page" in t) {
        const p = spec.pages.find((x) => x.id === t.page);
        return p ? `${p.slug || "index"}.html${t.section ? `#${t.section}` : ""}` : null;
      }
      if ("url" in t) return t.url;
      if (t.action === "call") return isPlaceholder(b.phone) ? null : `tel:${b.phone}`;
      if (t.action === "email") return isPlaceholder(b.email) ? null : `mailto:${b.email}`;
      if (t.action === "directions") return isPlaceholder(b.address) ? null : mapsUrl(b.address);
      return b.bookingUrl ?? null;
    },
    pageHref: (id) => {
      const p = spec.pages.find((x) => x.id === id);
      return `${p?.slug || "index"}.html`;
    },
    shared: (f) => `../_shared/test/${f}`,
    media,
  };
}

export function html(el: ReactElement): string {
  return renderToStaticMarkup(el);
}
