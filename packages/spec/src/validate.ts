import type { z } from "zod";
import { GENERATED_IMAGE_SECTIONS, SiteSpec } from "./site.ts";
import { SECTION_DEFS } from "./sections/index.ts";
import { DIRECTIONS } from "./directions.ts";
import { checkDesign } from "./design-rules.ts";
import { findBannedCopy } from "./banned.ts";
import { getAt, walkObjects, walkStrings } from "./pointer.ts";
import type { PlaceholderKind } from "./common.ts";
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

  // Design rules: direction ranges, contrast, banned backgrounds.
  const dir = DIRECTIONS.find((d) => d.id === spec.design.direction);
  for (const d of checkDesign(spec.design, dir)) add(d.path, "design", d.message);

  // Banned copy.
  for (const v of findBannedCopy(spec.pages, "/pages")) add(v.path, "banned", `${v.rule}: "${v.text}"`);
  for (const v of findBannedCopy(spec.translations ?? {}, "/translations")) add(v.path, "banned", `${v.rule}: "${v.text}"`);

  // Locales and translation overlays.
  if (!spec.locales.enabled.includes(spec.locales.default)) add("/locales", "structure", "default locale must be enabled");
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

/** A site can be published only when it validates and every placeholder is filled. */
export function publishBlockers(spec: unknown): string[] {
  const v = validateSite(spec);
  const blockers = v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`);
  for (const p of collectPlaceholders(spec)) blockers.push(`${p.path}: unfilled placeholder (${p.kind})`);
  for (const p of collectStarterText(spec)) blockers.push(`${p}: starter text not replaced`);
  return blockers;
}
