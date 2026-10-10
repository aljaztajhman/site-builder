import { z } from "zod";
import {
  Chrome,
  DIRECTIONS,
  SECTION_DEFS,
  SPEC_VERSION,
  isoDay,
  isPlaceholder,
  PageRef,
  subtypeFits,
  text,
  toModelJsonSchema,
  type Business,
  type Design,
  type HoursEntry,
  type Page,
  type SiteSpec,
} from "@sb/spec";
import type { Brief } from "./brief.ts";

/** Sections the model may use: everything except the system-only ones (legal text, 404) and the owner's (collections). */
function modelSectionUnion() {
  const schemas = SECTION_DEFS.filter((d) => !d.systemOnly && !d.ownerOnly && !d.designerOnly).map((d) => d.schema);
  return z.discriminatedUnion("type", schemas as unknown as [z.ZodObject, ...z.ZodObject[]]);
}

/** Page SEO text limits, as in Page in @sb/spec; repairContentOutput shortens longer answers to these. */
export const SEO_LIMITS = { title: 60, description: 160 } as const;

export function contentOutputSchema() {
  const ModelPage = z.strictObject({
    id: PageRef,
    kind: z.enum(["home", "standard"]),
    slug: z.string().regex(/^$|^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
    nav: z.strictObject({ label: text(24), show: z.boolean() }),
    seo: z.strictObject({ title: text(SEO_LIMITS.title), description: text(SEO_LIMITS.description) }),
    sections: z.array(modelSectionUnion()).min(1).max(14),
  });
  // The model never sets the footer's year (assembleSpec does, from the day the site is made).
  const ModelChrome = Chrome.extend({ footer: z.strictObject({ variant: Chrome.shape.footer.shape.variant }) });
  return z.strictObject({ chrome: ModelChrome, pages: z.array(ModelPage).min(1).max(8) });
}

export type ContentOutput = { chrome: SiteSpec["chrome"]; pages: Page[] };

export const contentJsonSchema = () => toModelJsonSchema(contentOutputSchema());

/**
 * Business facts from the verified brief. Every missing fact becomes a required placeholder, except hours
 * where the business has none to show: builders (they work on site) and clients who asked for no hours on
 * the site (`hoursWithheld`, from clientWithholdsHours). Stated hours are always used.
 */
export function businessFromBrief(brief: Brief, opts: { hoursWithheld?: boolean } = {}): Business {
  const f = brief.facts;
  const hours = f.hours?.length
    ? {
        entries: f.hours.map((h): HoursEntry => (h.closed || !h.open || !h.close ? { from: h.from, to: h.to, closed: true } : { from: h.from, to: h.to, open: h.open, close: h.close })),
        ...(f.hoursNote ? { note: f.hoursNote } : {}),
      }
    : undefined;
  return {
    name: brief.name,
    type: brief.businessType,
    // Spec v15: the subtype from the variety engine's concept (config variety.concept); it picks the drawn motif.
    ...(brief.concept?.subtype && subtypeFits(brief.businessType, brief.concept.subtype) ? { subtype: brief.concept.subtype } : {}),
    phone: f.phone && /^\+\d{8,15}$/.test(f.phone) ? f.phone : { $placeholder: "phone" },
    email: f.email ?? { $placeholder: "email" },
    address: f.address && /^\d{4}$/.test(f.address.postalCode) ? { ...f.address } : { $placeholder: "address" },
    hours: hours ?? (brief.businessType === "builder" || opts.hoursWithheld ? undefined : { $placeholder: "hours" }),
    ...(f.bookingUrl ? { bookingUrl: f.bookingUrl } : {}),
    ...(f.social.length ? { social: f.social } : {}),
    ...(f.serviceArea.length ? { serviceArea: f.serviceArea } : {}),
    provider: {
      legalName: f.legalName ?? { $placeholder: "legalName" },
      registrationNumber: f.registrationNumber && /^\d{7}(\d{3})?$/.test(f.registrationNumber) ? f.registrationNumber : { $placeholder: "registrationNumber" },
      taxNumber: f.taxNumber && /^(SI)?\d{8}$/.test(f.taxNumber.replace(/\s/g, "")) ? f.taxNumber.replace(/\s/g, "") : { $placeholder: "taxNumber" },
      ...(f.vatPayer !== null ? { vatPayer: f.vatPayer } : {}),
    },
  };
}

function seoTitle(prefix: string, name: string): string {
  const t = `${prefix} | ${name}`;
  return t.length <= 60 ? t : prefix.slice(0, 60);
}

/** The footer's year from the day the site is made (the model never sets it). */
function withYear(chrome: SiteSpec["chrome"], issued: string): SiteSpec["chrome"] {
  return { ...chrome, footer: { ...chrome.footer, year: Number(issued.slice(0, 4)) } };
}

/** Privacy, accessibility and 404 pages. Generated in code, never by the model. */
export function systemPages(name: string, issued?: string): Page[] {
  return [
    {
      id: "p_zasebnost",
      kind: "privacy",
      slug: "zasebnost",
      nav: { label: "Zasebnost", show: false },
      seo: { title: seoTitle("Varstvo osebnih podatkov", name), description: `Kako ${name} obdeluje osebne podatke obiskovalcev spletne strani.`.slice(0, 160) },
      sections: [{ id: "s_legal_privacy", type: "legal", variant: "default", props: { kind: "privacy" } } as Page["sections"][number]],
    },
    {
      id: "p_dostopnost",
      kind: "accessibility",
      slug: "dostopnost",
      nav: { label: "Dostopnost", show: false },
      seo: { title: seoTitle("Izjava o dostopnosti", name), description: `Izjava o dostopnosti spletne strani ${name}.`.slice(0, 160) },
      sections: [{ id: "s_legal_accessibility", type: "legal", variant: "default", props: { kind: "accessibility", ...(issued ? { date: issued } : {}) } } as Page["sections"][number]],
    },
    {
      id: "p_404",
      kind: "not-found",
      slug: "404",
      nav: { label: "Ni najdeno", show: false },
      seo: { title: seoTitle("Strani ni mogoče najti", name), description: "Iskane strani ni. Vrnite se na domačo stran." },
      sections: [
        {
          id: "s_not_found",
          type: "not-found",
          variant: "default",
          props: { title: "Te strani ni mogoče najti", body: "Morda je bila premaknjena ali pa je naslov napačen. Na domači strani najdete vse ostalo." },
        } as Page["sections"][number],
      ],
    },
  ];
}

/**
 * Section ids must be unique across the site, but the model names sections per page and reuses
 * `s_head`, `s_cta` … on every page (every recorded full-site answer did). Later duplicates get the
 * page as a suffix, and links to them (`{page, section}`) follow, so no regeneration is needed.
 */
export function uniqueSectionIds(pages: Page[]): Page[] {
  const seen = new Set<string>();
  const renamed = new Map<string, string>(); // `${pageId} ${oldId}` -> new id
  const out = pages.map((page) => ({
    ...page,
    sections: page.sections.map((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        return s;
      }
      const base = `${s.id}_${page.id.replace(/^p_/, "")}`;
      let id = base;
      for (let n = 2; seen.has(id); n++) id = `${base}_${n}`;
      seen.add(id);
      renamed.set(`${page.id} ${s.id}`, id);
      return { ...s, id };
    }),
  }));
  if (renamed.size === 0) return out;
  const relink = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(relink);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    const next = Object.fromEntries(Object.entries(o).map(([k, x]) => [k, relink(x)]));
    if (typeof o.page === "string" && typeof o.section === "string") next.section = renamed.get(`${o.page} ${o.section}`) ?? o.section;
    return next;
  };
  return out.map((page) => ({ ...page, sections: page.sections.map((s) => ({ ...s, props: relink(s.props) }) as typeof s) }));
}

/**
 * People the client didn't name ("smo trije", "še dve računovodkinji") would each be a name placeholder on a team
 * section: a fact only the owner can give that blocks publishing. They are left out (never named), and a team
 * section left with nobody goes, unless it is all its page has; links to a section that went point at its page.
 * The editor's "Dodaj člana" adds people (it-zero-to-live).
 */
export function withoutUnnamedTeam(pages: Page[]): Page[] {
  const gone = new Set<string>(); // `${pageId} ${sectionId}`
  const out = pages.map((page) => {
    const sections = page.sections.flatMap((s): Page["sections"] => {
      if (s.type !== "team") return [s];
      const members = s.props.members.filter((m) => !isPlaceholder(m.name));
      if (members.length === s.props.members.length) return [s];
      if (members.length) return [{ ...s, props: { ...s.props, members } }];
      if (page.sections.length === 1) return [s];
      gone.add(`${page.id} ${s.id}`);
      return [];
    });
    return { ...page, sections } as Page;
  });
  if (!gone.size) return out;
  const unlink = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(unlink);
    if (!v || typeof v !== "object") return v;
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unlink(x)])) as Record<string, unknown>;
    if (typeof o.page === "string" && typeof o.section === "string" && gone.has(`${o.page} ${o.section}`)) delete o.section;
    return o;
  };
  return out.map((page) => ({ ...page, sections: page.sections.map((s) => ({ ...s, props: unlink(s.props) }) as typeof s) }));
}

/**
 * Trade templates fix their header: its background (dark over a dark hero, unless there is a logo), and no header call button when
 * the hero already calls: its object is the phone number or it links a call (one primary action per screen).
 */
export function templateChrome(design: Design, content: ContentOutput, hasLogo = false): SiteSpec["chrome"] {
  const dir = DIRECTIONS.find((d) => d.id === design.direction);
  if (!dir?.template) return content.chrome;
  const home = content.pages.find((p) => p.kind === "home");
  const hero = home?.sections[0];
  const links = hero?.type === "hero-signature" ? [hero.props.primary, hero.props.secondary] : [];
  const heroCalls = hero?.type === "hero-signature" && (hero.props.fact === "phone" || links.some((l) => l && "action" in l.target && l.target.action === "call"));
  const header = { ...content.chrome.header };
  // A logo is drawn for a light ground (pekarna-kvas: dark lettering); with one the header stays as the model set it.
  if (dir.layout.headerTone && !hasLogo) header.tone = dir.layout.headerTone;
  if (heroCalls && header.cta === "call") header.cta = "none";
  return { ...content.chrome, header };
}

export function assembleSpec(input: {
  slug: string;
  brief: Brief;
  design: Design;
  assets: SiteSpec["assets"];
  content: ContentOutput;
  /** The client asked for no opening hours on the site (clientWithholdsHours over their text). */
  hoursWithheld?: boolean;
  /** When the site is made (default now): dates the accessibility statement and the footer's year. */
  now?: Date;
}): SiteSpec {
  const issued = isoDay(input.now ?? new Date());
  const business = businessFromBrief(input.brief, { hoursWithheld: input.hoursWithheld });
  let modelPages = input.content.pages.filter((p) => p.kind === "home" || p.kind === "standard");
  // Hours the client won't publish: an opening-hours section would show (and block publishing on) a
  // placeholder nobody will fill, so it goes, unless it is all a page has.
  if (input.hoursWithheld && business.hours === undefined) {
    modelPages = modelPages.map((p) => {
      const sections = p.sections.filter((s) => s.type !== "opening-hours");
      return sections.length && sections.length !== p.sections.length ? { ...p, sections } : p;
    });
  }
  modelPages = withoutUnnamedTeam(modelPages);
  // Home first, keep the model's order for the rest. The homepage keeps its section ids.
  modelPages.sort((a, b) => (a.kind === "home" ? -1 : b.kind === "home" ? 1 : 0));
  return {
    specVersion: SPEC_VERSION,
    slug: input.slug,
    locales: { default: "sl", enabled: ["sl"] },
    business,
    design: input.design,
    assets: input.assets,
    chrome: withYear(templateChrome(input.design, input.content, input.assets.logo !== undefined), issued),
    pages: [...uniqueSectionIds(modelPages), ...systemPages(input.brief.name, issued)],
  };
}
