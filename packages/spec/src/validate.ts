import type { z } from "zod";
import { GENERATED_IMAGE_SECTIONS, SiteSpec } from "./site.ts";
import { SECTION_DEFS } from "./sections/index.ts";
import { DIRECTIONS } from "./directions.ts";
import { checkDesign } from "./design-rules.ts";
import { findBannedCopy } from "./banned.ts";
import { getAt, walkObjects, walkStrings } from "./pointer.ts";
import { SITE_LOCALES, isSiteLocale, isWebUrl, type PlaceholderKind } from "./common.ts";
import { EDITOR_STARTER_TEXT } from "./starter.ts";

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

  // Banned: everything centred. At most one centred section per page.
  spec.pages.forEach((p, pi) => {
    const centred = p.sections.filter((s) => defOf(s.type)?.centredVariants?.includes(s.variant));
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

  // Link URLs: z.url() also accepts javascript:, data: and the like; the renderer drops anything not http(s).
  const webUrl = (path: string, url: string) => {
    if (!isWebUrl(url)) add(path, "reference", "link URL must start with http:// or https://");
  };
  walkObjects(spec.pages, (o, p) => {
    if (typeof o.url === "string") webUrl(`/pages${p}/url`, o.url);
  });
  if (spec.business.bookingUrl !== undefined) webUrl("/business/bookingUrl", spec.business.bookingUrl);
  spec.business.social?.forEach((s, i) => webUrl(`/business/social/${i}/url`, s.url));

  // Design rules: direction ranges, contrast, banned backgrounds.
  const dir = DIRECTIONS.find((d) => d.id === spec.design.direction);
  for (const d of checkDesign(spec.design, dir)) add(d.path, "design", d.message);

  // Banned copy.
  for (const v of findBannedCopy(spec.pages, "/pages")) add(v.path, "banned", `${v.rule}: "${v.text}"`);
  for (const v of findBannedCopy(spec.translations ?? {}, "/translations")) add(v.path, "banned", `${v.rule}: "${v.text}"`);

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

const STARTER = new Set(Object.values(EDITOR_STARTER_TEXT));

export function collectStarterText(spec: unknown): string[] {
  const out: string[] = [];
  walkStrings((spec as { pages?: unknown }).pages, (s, p) => {
    if (STARTER.has(s)) out.push(`/pages${p}`);
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
  kind: "invalid" | "placeholder" | "starter" | "alt" | "fact";
  detail: string;
  /** Validation issue code (kind "invalid"). */
  code?: Issue["code"];
  /** The value in question (kind "fact"). */
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
    default:
      return `${b.path}: ${b.detail}`;
  }
}

/** A site can be published only when it validates and every placeholder is filled. */
export function publishBlockers(spec: unknown): string[] {
  return publishChecklist(spec).map(blockerText);
}
