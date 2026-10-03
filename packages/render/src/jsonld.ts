import { formatAddress, isPlaceholder, isWebUrl, type BusinessType, type Event, type Page, type Person, type Post, type Price, type ResolvedEntry, type Service, type SiteSpec } from "@sb/spec";

const SCHEMA_TYPE: Record<BusinessType, string> = {
  hairdresser: "HairSalon",
  restaurant: "Restaurant",
  "tourist-farm": "LodgingBusiness",
  "car-repair": "AutoRepair",
  dental: "Dentist",
  physio: "Physiotherapy",
  accountant: "AccountingService",
  builder: "HomeAndConstructionBusiness",
  shop: "Store",
  bakery: "Bakery",
};

const DAY_URI: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
const ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export interface JsonLdOptions {
  /** The site's absolute address (normaliseSiteUrl); without it no url, image or logo. */
  siteUrl?: string | null;
  /** Path of the home page in this locale ("" or "en/"). */
  homePath?: string;
  /** File under media/ shown when the site is shared (shareImageOf). */
  shareImage?: string | null;
}

/** At most this many offers and menu items: enough for an answer, small enough for every page load. */
const MAX_OFFERS = 60;

/** An Offer's price part, or null for a placeholder. */
function offerPrice(price: Price | undefined): Record<string, unknown> | null {
  if (!price || isPlaceholder(price)) return null;
  return price.from
    ? { priceSpecification: { "@type": "PriceSpecification", minPrice: price.amount, priceCurrency: "EUR" } }
    : { price: price.amount, priceCurrency: "EUR" };
}

/**
 * What the business offers, from the spec's own lists: services (with their prices when given) and price-list
 * items as an OfferCatalog, a restaurant's menu as a Menu. Only what is on the site; placeholders and items
 * marked unavailable are left out.
 */
function offers(spec: SiteSpec): { catalog: Record<string, unknown>[]; menu: Record<string, unknown>[] } {
  const catalog: Record<string, unknown>[] = [];
  const menu: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const add = (name: string, description: string | undefined, price: Price | undefined, kind: "Service" | "Product" = "Service") => {
    const key = name.toLocaleLowerCase("sl");
    if (seen.has(key) || catalog.length >= MAX_OFFERS) return;
    seen.add(key);
    catalog.push({ "@type": "Offer", itemOffered: { "@type": kind, name, ...(description ? { description } : {}) }, ...offerPrice(price) });
  };
  for (const page of spec.pages)
    for (const s of page.sections) {
      if (s.type === "services-list") for (const it of s.props.items) add(it.name, it.description, it.price);
      else if (s.type === "services-cards") for (const it of s.props.items) add(it.title, it.text, undefined);
      else if (s.type === "products") for (const it of s.props.items) add(it.name, it.unit, it.price, "Product");
      else if (s.type === "rooms") for (const it of s.props.items) add(it.name, it.features?.join(", "), it.price);
      else if (s.type === "price-list") {
        for (const g of s.props.groups) for (const it of g.items) if (!it.unavailable) add(it.name, it.note, it.price);
      } else if (s.type === "menu") {
        for (const c of s.props.categories) {
          const items = c.dishes
            .filter((d) => !d.unavailable)
            .map((d) => {
              const p = offerPrice(d.price);
              return { "@type": "MenuItem", name: d.name, ...(d.description ? { description: d.description } : {}), ...(p ? { offers: { "@type": "Offer", ...p } } : {}) };
            });
          if (items.length) menu.push({ "@type": "MenuSection", name: c.name, hasMenuItem: items.slice(0, MAX_OFFERS) });
        }
      }
    }
  return { catalog, menu };
}

/** LocalBusiness structured data with only the facts the client provided (never placeholders). */
export function jsonLd(spec: SiteSpec, opts: JsonLdOptions = {}): string {
  const b = spec.business;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[b.type],
    name: b.name,
  };
  const site = opts.siteUrl ?? null;
  if (site) {
    data.url = site + (opts.homePath ?? "");
    if (opts.shareImage) data.image = `${site}media/${opts.shareImage}`;
    if (spec.assets.logo) data.logo = `${site}media/${spec.assets.logo.file}`;
  }
  if (!isPlaceholder(b.phone)) data.telephone = b.phone;
  if (!isPlaceholder(b.email)) data.email = b.email;
  if (!isPlaceholder(b.address)) {
    data.address = {
      "@type": "PostalAddress",
      streetAddress: b.address.street,
      postalCode: b.address.postalCode,
      addressLocality: b.address.city,
      addressCountry: "SI",
    };
  }
  if (b.hours && !isPlaceholder(b.hours)) {
    data.openingHoursSpecification = b.hours.entries
      .filter((e) => !e.closed && e.open && e.close)
      .map((e) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ORDER.slice(ORDER.indexOf(e.from), ORDER.indexOf(e.to) + 1).map((d) => DAY_URI[d]),
        opens: e.open,
        closes: e.close,
      }));
  }
  if (b.serviceArea?.length) data.areaServed = b.serviceArea.map((name) => ({ "@type": "Place", name }));
  if (b.bookingUrl && isWebUrl(b.bookingUrl)) data.potentialAction = { "@type": "ReserveAction", target: b.bookingUrl };
  const { catalog, menu } = offers(spec);
  if (catalog.length) data.hasOfferCatalog = { "@type": "OfferCatalog", name: b.name, itemListElement: catalog };
  if (menu.length) data.hasMenu = { "@type": "Menu", hasMenuSection: menu };
  const sameAs = (b.social ?? []).map((s) => s.url).filter(isWebUrl);
  if (sameAs.length) data.sameAs = sameAs;
  return script(data);
}

/** FAQPage for a page with questions and answers (its faq sections), or null. */
export function faqJsonLd(page: Page): string | null {
  const qa = page.sections.flatMap((s) => (s.type === "faq" ? s.props.items : []));
  if (!qa.length) return null;
  return script({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((q) => ({ "@type": "Question", name: q.question, acceptedAnswer: { "@type": "Answer", text: q.answer } })),
  });
}

/** "<" escaped so the JSON can never close the script element. */
export function script(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The UTC offset of Slovenian time on a day: "+01:00" in winter, "+02:00" in summer. */
function ljubljanaOffset(day: string): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Ljubljana", timeZoneName: "longOffset" })
    .formatToParts(new Date(`${day}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1]! : "+01:00";
}

/** An event's start or end: the day, or the day and time with Slovenia's offset. */
const eventMoment = (day: string, time: string | undefined) => (time ? `${day}T${time}:00${ljubljanaOffset(day)}` : day);

/**
 * Structured data of a collection entry's page: a BlogPosting, an Event, a Service or a Person, with the
 * business as author, organiser, provider or employer. Only what the entry says; placeholders left out.
 */
export function entryJsonLd(spec: SiteSpec, e: ResolvedEntry, url: string | null, siteUrl: string | null, imageUrl: string | null = null): string {
  const b = spec.business;
  const org: Record<string, unknown> = { "@type": SCHEMA_TYPE[b.type], name: b.name, ...(siteUrl ? { url: siteUrl } : {}) };
  const image = imageUrl ? { image: imageUrl } : {};
  const base = { "@context": "https://schema.org", ...(url ? { url } : {}), ...image };
  switch (e.kind) {
    case "blog": {
      const p = e.entry as Post;
      return script({ ...base, "@type": "BlogPosting", headline: p.title, description: p.summary, datePublished: p.date, author: org, publisher: org, ...(url ? { mainEntityOfPage: url } : {}) });
    }
    case "events": {
      const ev = e.entry as Event;
      const where = ev.place ?? (!isPlaceholder(b.address) ? formatAddress(b.address) : null);
      const price = offerPrice(ev.price);
      return script({
        ...base,
        "@type": "Event",
        name: ev.title,
        description: ev.summary,
        startDate: eventMoment(ev.date, ev.start),
        ...(ev.endDate || ev.end ? { endDate: eventMoment(ev.endDate ?? ev.date, ev.end) } : {}),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        ...(where ? { location: { "@type": "Place", name: where, ...(ev.place ? {} : { address: where }) } } : {}),
        organizer: org,
        ...(price ? { offers: { "@type": "Offer", ...price, ...(ev.url && isWebUrl(ev.url) ? { url: ev.url } : {}) } } : {}),
      });
    }
    case "services": {
      const sv = e.entry as Service;
      const price = offerPrice(sv.price);
      return script({ ...base, "@type": "Service", name: sv.name, description: sv.summary, provider: org, ...(price ? { offers: { "@type": "Offer", ...price } } : {}) });
    }
    case "team": {
      const m = e.entry as Person;
      return script({ ...base, "@type": "Person", name: m.name, jobTitle: m.role, ...(m.bio ? { description: m.bio } : {}), worksFor: org });
    }
  }
}
