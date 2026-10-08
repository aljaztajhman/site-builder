import type { z } from "zod";
import { GENERATED_IMAGE_SECTIONS, SiteSpec } from "./site.ts";
import { SECTION_DEFS } from "./sections/index.ts";
import { DIRECTIONS } from "./directions.ts";
import { subtypeFits } from "./business.ts";
import { checkDesign } from "./design-rules.ts";
import { findBannedCopy } from "./banned.ts";
import { getAt, walkObjects, walkStrings } from "./pointer.ts";
import { SITE_LOCALES, isSiteLocale, isWebUrl, type PlaceholderKind } from "./common.ts";
import { EDITOR_STARTER_TEXT } from "./starter.ts";
import { COLLECTION_KINDS } from "./collections.ts";
import { centredOn } from "./skeleton.ts";
import { secondLocales, untranslated } from "./translatable.ts";

export interface Issue {
  path: string;
  code: "schema" | "reference" | "structure" | "design" | "banned" | "translation";
  message: string;
}

export type ValidationResult = { ok: true; spec: SiteSpec; issues: [] } | { ok: false; spec?: SiteSpec; issues: Issue[] };

export function zodIssues(error: z.ZodError): Issue[] {
  return error.issues.map((i) => ({
    path: "/" + i.path.map(String).join("/"),
    code: "schema" as const,
    message: i.message,
  }));
}

/** Full validation: schema, then references, structure, design rules and banned copy. */
export function validateSite(input: unknown): ValidationResult {
  const parsed = SiteSpec.safeParse(input);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const spec = parsed.data;
  const issues = semanticIssues(spec);
  return issues.length ? { ok: false, spec, issues } : { ok: true, spec, issues: [] };
}

const SYSTEM_PAGE_KINDS = new Set(["privacy", "accessibility", "not-found"]);

export function semanticIssues(spec: SiteSpec): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, code: Issue["code"], message: string) => issues.push({ path, code, message });
  const defOf = (type: string) => SECTION_DEFS.find((d) => d.type === type);

  // Unique ids and slugs.
  const pageIds = new Set<string>();
  const slugs = new Set<string>();
  const sectionIds = new Set<string>();
  spec.pages.forEach((page, pi) => {
    if (pageIds.has(page.id)) add(`/pages/${pi}/id`, "structure", `duplicate page id ${page.id}`);
    pageIds.add(page.id);
    if (slugs.has(page.slug)) add(`/pages/${pi}/slug`, "structure", `duplicate page slug "${page.slug}"`);
    slugs.add(page.slug);
    page.sections.forEach((s, si) => {
      if (sectionIds.has(s.id)) add(`/pages/${pi}/sections/${si}/id`, "structure", `duplicate section id ${s.id}`);
      sectionIds.add(s.id);
    });
  });

  // Required pages.
  const count = (k: string) => spec.pages.filter((p) => p.kind === k).length;
  if (count("home") !== 1) add("/pages", "structure", "exactly one home page is required");
  for (const k of ["privacy", "accessibility", "not-found"] as const) {
    if (count(k) !== 1) add("/pages", "structure", `exactly one ${k} page is required`);
  }
  spec.pages.forEach((p, pi) => {
    if (p.kind === "home" && p.slug !== "") add(`/pages/${pi}/slug`, "structure", "home page slug must be empty");
    if (p.kind !== "home" && p.slug === "") add(`/pages/${pi}/slug`, "structure", "only the home page may have an empty slug");
    if (p.kind === "not-found" && p.slug !== "404") add(`/pages/${pi}/slug`, "structure", "not-found page slug must be 404");
  });

  // System-only sections (legal text, 404) live only on their page kinds.
  spec.pages.forEach((p, pi) =>
    p.sections.forEach((s, si) => {
      if (defOf(s.type)?.systemOnly && !SYSTEM_PAGE_KINDS.has(p.kind)) {
        add(`/pages/${pi}/sections/${si}`, "structure", `${s.type} is only allowed on legal and 404 pages`);
      }
    }),
  );

  // Banned: everything centred. At most one centred section per page: a centred variant, or the one the site's
  // skeleton centres (spec v15, design.skeleton.centred; centredOn keeps at most one per page).
  const motif = DIRECTIONS.find((d) => d.id === spec.design.direction)?.template?.motif;
  spec.pages.forEach((p, pi) => {
    const byAlign = centredOn(spec.design.skeleton, p.sections, motif);
    const centred = p.sections.filter((s) => defOf(s.type)?.centredVariants?.includes(s.variant) || byAlign.has(s.id));
    if (centred.length > 1) add(`/pages/${pi}/sections`, "banned", `${centred.length} centred sections on one page (max 1)`);
  });

  // hero-signature: the line that introduces a phone or an opening time, and the address only on the label card.
  spec.pages.forEach((p, pi) =>
    p.sections.forEach((s, si) => {
      if (s.type === "legal" && s.props.date !== undefined && s.props.kind !== "accessibility") add(`/pages/${pi}/sections/${si}/props/date`, "structure", "only the accessibility statement carries a date");
      if (s.type !== "hero-signature") return;
      const at = `/pages/${pi}/sections/${si}/props`;
      if (s.props.fact !== "address" && s.props.factLabel === undefined) add(`${at}/factLabel`, "structure", `factLabel is required when the hero shows the ${s.props.fact}`);
      if (s.props.fact === "address" && !["label", "card", "bend"].includes(s.variant)) add(`${at}/fact`, "structure", "fact address is only shown by the label, card and bend variants");
      if (s.props.signs && s.variant !== "view") add(`${at}/signs`, "structure", "signs are only shown by the view variant");
      if (s.props.receipt && s.variant !== "receipt") add(`${at}/receipt`, "structure", "receipt is only shown by the receipt variant");
      if (s.props.images && s.variant !== "mirrors") add(`${at}/images`, "structure", "images are only shown by the mirrors variant");
      const wordmark = s.props.wordmark;
      if (wordmark !== undefined) {
        if (s.variant !== "mirrors") add(`${at}/wordmark`, "structure", "wordmark is only shown by the mirrors variant");
        // Decorative, but still the business's own name: one word of it, never a slogan.
        const words = spec.business.name.toLocaleLowerCase("sl").split(/[^\p{L}\p{N}]+/u);
        if (!words.includes(wordmark.toLocaleLowerCase("sl"))) add(`${at}/wordmark`, "structure", "wordmark must be one word of the business name");
      }
    }),
  );

  // A service's description may be left out only where the list is names only (services-list aside).
  spec.pages.forEach((p, pi) =>
    p.sections.forEach((s, si) => {
      if (s.type !== "services-list") return;
      if (s.props.note && s.variant !== "aside") add(`/pages/${pi}/sections/${si}/props/note`, "structure", "note is only shown by the aside variant");
      if (s.variant === "aside") return;
      s.props.items.forEach((it, ii) => {
        if (it.description === undefined) add(`/pages/${pi}/sections/${si}/props/items/${ii}/description`, "structure", "description is required outside the aside variant");
      });
    }),
  );

  // References: images and pages.
  const imageIds = new Set<string>();
  spec.assets.images.forEach((img, i) => {
    if (imageIds.has(img.id)) add(`/assets/images/${i}/id`, "structure", `duplicate image id ${img.id}`);
    imageIds.add(img.id);
  });
  walkStrings(spec.pages, (s, p) => {
    if (/^img_/.test(s) && !imageIds.has(s)) add(`/pages${p}`, "reference", `unknown image ${s}`);
  });
  // AI-generated images are atmosphere, never the business itself: only in a few section types.
  const generated = new Set(spec.assets.images.filter((i) => i.origin === "generated").map((i) => i.id));
  const allowed = new Set<string>(GENERATED_IMAGE_SECTIONS);
  if (generated.size) {
    spec.pages.forEach((page, pi) =>
      page.sections.forEach((s, si) => {
        if (allowed.has(s.type)) return;
        walkStrings(s.props, (v, p) => {
          if (generated.has(v)) add(`/pages/${pi}/sections/${si}/props${p}`, "reference", `${v} is AI-generated and may only be used in ${GENERATED_IMAGE_SECTIONS.join(", ")}`);
        });
      }),
    );
  }
  walkObjects(spec.pages, (o, p) => {
    if (typeof o.page === "string" && /^p_/.test(o.page) && !pageIds.has(o.page)) add(`/pages${p}/page`, "reference", `unknown page ${o.page}`);
    if (o.action === "booking" && !spec.business.bookingUrl) add(`/pages${p}/action`, "reference", "booking link without business.bookingUrl");
  });
  if (spec.chrome.header.cta === "booking" && !spec.business.bookingUrl) {
    add("/chrome/header/cta", "reference", "booking CTA without business.bookingUrl");
  }

  const webUrl = (path: string, url: string) => {
    if (!isWebUrl(url)) add(path, "reference", "link URL must start with http:// or https://");
  };

  // Collections (v12): their list pages, pictures and entry pages; sections only show collections that exist.
  const cols = spec.collections;
  for (const kind of COLLECTION_KINDS) {
    const c = cols?.[kind];
    if (!c) continue;
    const at = `/collections/${kind}`;
    const listPage = spec.pages.find((p) => p.id === c.page);
    if (!listPage) add(`${at}/page`, "reference", `unknown page ${c.page}`);
    else if (SYSTEM_PAGE_KINDS.has(listPage.kind)) add(`${at}/page`, "reference", `a collection can't be listed on the ${listPage.kind} page`);
    const named = new Set<string>();
    c.items.forEach((item, i) => {
      if (item.image !== undefined && !imageIds.has(item.image)) add(`${at}/items/${i}/image`, "reference", `unknown image ${item.image}`);
      if (item.image !== undefined && generated.has(item.image)) add(`${at}/items/${i}/image`, "reference", `${item.image} is AI-generated and may only be used in ${GENERATED_IMAGE_SECTIONS.join(", ")}`);
      if (item.slug !== undefined) {
        if (named.has(item.slug)) add(`${at}/items/${i}/slug`, "structure", `duplicate entry slug "${item.slug}"`);
        named.add(item.slug);
      }
      if ("endDate" in item && item.endDate !== undefined && item.endDate < item.date) add(`${at}/items/${i}/endDate`, "structure", "an event can't end before it starts");
      if ("end" in item && item.end !== undefined && item.start === undefined) add(`${at}/items/${i}/end`, "structure", "an event's end time needs a start time");
      if ("url" in item && item.url !== undefined) webUrl(`${at}/items/${i}/url`, item.url);
    });
  }
  spec.pages.forEach((p, pi) =>
    p.sections.forEach((s, si) => {
      if (s.type === "collection" && !cols?.[s.props.kind]) add(`/pages/${pi}/sections/${si}/props/kind`, "reference", `the ${s.props.kind} collection is not set up`);
    }),
  );
  // The banned phrases are give-aways of generated copy. Blog posts, events and every entry's body are only ever
  // the owner's own words (the model never writes collections, and these start empty), so they aren't checked
  // against them (em dashes are still repaired on save, banned.ts repairSiteCopy). Services and team entries'
  // short texts start as the generated sections' items (startCollection moves them, with their English), so
  // they stay checked like the sections they came from, whoever edits them later.
  for (const kind of ["services", "team"] as const) {
    cols?.[kind]?.items.forEach((item, i) => {
      for (const field of GENERATED_ENTRY_FIELDS[kind]) {
        const text = (item as Record<string, unknown>)[field];
        if (typeof text === "string") for (const v of findBannedCopy(text, `/collections/${kind}/items/${i}/${field}`)) add(v.path, "banned", `${v.rule}: "${v.text}"`);
      }
    });
  }

  // Link URLs: z.url() also accepts javascript:, data: and the like; the renderer drops anything not http(s).
  walkObjects(spec.pages, (o, p) => {
    if (typeof o.url === "string") webUrl(`/pages${p}/url`, o.url);
  });
  if (spec.business.bookingUrl !== undefined) webUrl("/business/bookingUrl", spec.business.bookingUrl);
  spec.business.social?.forEach((s, i) => webUrl(`/business/social/${i}/url`, s.url));
  // Spec v15: the subtype is a trade within the business's own type.
  if (spec.business.subtype !== undefined && !subtypeFits(spec.business.type, spec.business.subtype)) {
    add("/business/subtype", "structure", `subtype ${spec.business.subtype} is not a kind of ${spec.business.type}`);
  }

  // Design rules: direction ranges, contrast, banned backgrounds.
  const dir = DIRECTIONS.find((d) => d.id === spec.design.direction);
  for (const d of checkDesign(spec.design, dir)) add(d.path, "design", d.message);

  // Banned copy.
  for (const v of findBannedCopy(spec.pages, "/pages")) add(v.path, "banned", `${v.rule}: "${v.text}"`);
  // An owner-only entry text's translation is the owner's own words too (it-collection-translations); the
  // English of a services or team entry's short texts may be generated (moved with it), so it is checked.
  const shownTranslations = Object.fromEntries(
    Object.entries(spec.translations ?? {}).map(([locale, map]) => [locale, Object.fromEntries(Object.entries(map ?? {}).filter(([ptr]) => !ptr.startsWith("/collections/") || GENERATED_ENTRY_POINTER.test(ptr)))]),
  );
  for (const v of findBannedCopy(shownTranslations, "/translations")) add(v.path, "banned", `${v.rule}: "${v.text}"`);

  // Locales and translation overlays. Only locales with UI strings (a German site would get English buttons).
  if (!spec.locales.enabled.includes(spec.locales.default)) add("/locales", "structure", "default locale must be enabled");
  for (const locale of new Set([spec.locales.default, ...spec.locales.enabled])) {
    if (!isSiteLocale(locale)) add("/locales", "structure", `locale ${locale} is not available; sites can use ${SITE_LOCALES.join(", ")}`);
  }
  for (const [locale, map] of Object.entries(spec.translations ?? {})) {
    if (!spec.locales.enabled.includes(locale as SiteSpec["locales"]["default"])) {
      add(`/translations/${locale}`, "translation", `locale ${locale} not enabled`);
    }
    for (const ptr of Object.keys(map ?? {})) {
      if (typeof getAt(spec, ptr) !== "string") add(`/translations/${locale}`, "translation", `pointer ${ptr} is not a string in the spec`);
    }
  }

  return issues;
}

/** The services and team entry fields startCollection fills from generated sections (engine collections.ts). */
const GENERATED_ENTRY_FIELDS = { services: ["name", "summary"], team: ["name", "role", "bio"] } as const;
const GENERATED_ENTRY_POINTER = /^\/collections\/(services\/items\/\d+\/(name|summary)|team\/items\/\d+\/(name|role|bio))$/;

const STARTER = new Set(Object.values(EDITOR_STARTER_TEXT));

export function collectStarterText(spec: unknown): string[] {
  const out: string[] = [];
  walkStrings((spec as { pages?: unknown }).pages, (s, p) => {
    if (STARTER.has(s)) out.push(`/pages${p}`);
  });
  // A new blog post or event starts with the same text; it is published only once the owner wrote theirs.
  walkStrings((spec as { collections?: unknown }).collections, (s, p) => {
    if (STARTER.has(s)) out.push(`/collections${p}`);
  });
  return out;
}

export interface PlaceholderRef {
  path: string;
  kind: PlaceholderKind;
  note?: string;
}

export function collectPlaceholders(spec: unknown): PlaceholderRef[] {
  const out: PlaceholderRef[] = [];
  walkObjects(spec, (o, p) => {
    if (typeof o.$placeholder === "string") {
      out.push({ path: p, kind: o.$placeholder as PlaceholderKind, ...(typeof o.note === "string" ? { note: o.note } : {}) });
    }
  });
  return out;
}

/**
 * One thing that stands between the site and publishing. `detail` is the validation message, the
 * placeholder kind (or "serviceArea" for a missing service area), the fact kind, or the image id; the
 * editor turns it into Slovene (labels.ts).
 */
export interface PublishBlocker {
  path: string;
  kind: "invalid" | "placeholder" | "starter" | "alt" | "fact" | "translation";
  detail: string;
  /** Validation issue code (kind "invalid"). */
  code?: Issue["code"];
  /** The value in question (kind "fact"); how many texts there still have no translation (kind "translation", whose detail is the language). */
  value?: string;
}

/** The checklist behind publishBlockers: validation, placeholders, starter text, missing photo descriptions. */
export function publishChecklist(spec: unknown): PublishBlocker[] {
  const v = validateSite(spec);
  const out: PublishBlocker[] = v.ok ? [] : v.issues.map((i) => ({ path: i.path, kind: "invalid" as const, detail: i.message, code: i.code }));
  for (const p of collectPlaceholders(spec)) out.push({ path: p.path, kind: "placeholder", detail: p.kind });
  for (const p of collectStarterText(spec)) out.push({ path: p, kind: "starter", detail: "starter text" });
  if (v.spec) {
    // Sections that show a business fact the spec doesn't have render a placeholder at render time.
    const types = new Set(v.spec.pages.flatMap((p) => p.sections.map((s) => s.type)));
    const b = v.spec.business;
    if (types.has("opening-hours") && b.hours === undefined) out.push({ path: "/business/hours", kind: "placeholder", detail: "hours" });
    if (types.has("service-area") && !b.serviceArea?.length) out.push({ path: "/business/serviceArea", kind: "placeholder", detail: "serviceArea" });
  }
  // A second language: every text of the pages needs its translation (one entry per section, page settings or
  // hours note, at its first text still missing; `value` is how many are), else the visitor reads the default language.
  for (const locale of secondLocales(spec)) {
    const groups = new Map<string, { path: string; n: number }>();
    for (const t of untranslated(spec, locale)) {
      const key = /^\/pages\/\d+\/sections\/\d+/.exec(t.path)?.[0] ?? /^\/pages\/\d+/.exec(t.path)?.[0] ?? t.path;
      const g = groups.get(key);
      if (g) g.n++;
      else groups.set(key, { path: t.path, n: 1 });
    }
    for (const g of groups.values()) out.push({ path: g.path, kind: "translation", detail: locale, value: String(g.n) });
  }
  // A photo the pages show needs a description (alt text) for screen readers.
  if (v.spec) {
    const shown = new Set<string>();
    walkStrings(v.spec.pages, (s) => {
      if (/^img_/.test(s)) shown.add(s);
    });
    v.spec.assets.images.forEach((img, i) => {
      if (shown.has(img.id) && !img.alt.trim()) out.push({ path: `/assets/images/${i}/alt`, kind: "alt", detail: img.id });
    });
  }
  return out;
}

/** A checklist entry as one English line, for logs, API errors and the eval report. */
export function blockerText(b: PublishBlocker): string {
  switch (b.kind) {
    case "placeholder":
      return `${b.path}: unfilled placeholder (${b.detail})`;
    case "starter":
      return `${b.path}: starter text not replaced`;
    case "alt":
      return `${b.path}: photo ${b.detail} has no description`;
    case "fact":
      return `${b.path}: ${b.detail} "${b.value ?? ""}" is not in the client's input`;
    case "translation":
      return `${b.path}: ${b.value ?? "1"} text(s) here without a translation (${b.detail})`;
    default:
      return `${b.path}: ${b.detail}`;
  }
}

/** A site can be published only when it validates and every placeholder is filled. */
export function publishBlockers(spec: unknown): string[] {
  return publishChecklist(spec).map(blockerText);
}
