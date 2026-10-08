import type { Issue } from "./validate.ts";
import type { SiteSpec } from "./site.ts";

/**
 * Exactly one main heading per page (the page's h1), and it opens the page: a hero on the homepage, a page header
 * on other pages, the legal text or 404 section on their system pages, or a collection list that opens its page
 * (it renders its title as the h1 there). Used by generation and edits when config promptFixes.oneHero is on
 * (engine stages); not part of validateSite, so sites made before the rule stay valid and editable.
 */
export const MAIN_HEADING_TYPES: ReadonlySet<string> = new Set(["hero-split", "hero-image", "hero-type", "hero-signature", "page-header", "legal", "not-found"]);

type Section = SiteSpec["pages"][number]["sections"][number];
/** Page.sections' maximum (site.ts). */
const MAX_SECTIONS = 14;

/** Does this section render the page's h1 at position `index`? */
export function isMainHeading(s: Pick<Section, "type">, index: number): boolean {
  return MAIN_HEADING_TYPES.has(s.type) || (s.type === "collection" && index === 0);
}

export function mainHeadingIssues(spec: SiteSpec): Issue[] {
  const issues: Issue[] = [];
  spec.pages.forEach((p, pi) => {
    const at = p.sections.flatMap((s, si) => (isMainHeading(s, si) ? [si] : []));
    const what = p.kind === "home" ? "a hero" : "a page-header";
    if (at.length === 0) issues.push({ path: `/pages/${pi}/sections`, code: "structure", message: `the page has no main heading: it must open with ${what} section (exactly one per page)` });
    else if (at.length > 1) issues.push({ path: `/pages/${pi}/sections/${at[1]}`, code: "structure", message: `${at.length} main headings (sections ${at.join(", ")}: ${at.map((i) => p.sections[i]!.type).join(", ")}) on one page; keep exactly one, as the first section` });
    else if (at[0] !== 0) issues.push({ path: `/pages/${pi}/sections/${at[0]}`, code: "structure", message: `the page's main heading (${p.sections[at[0]!]!.type}) must be its first section` });
  });
  return issues;
}

/**
 * The safe repairs, in place: a page's only main heading that isn't first moves to the top (the order changes,
 * nothing is lost); a standard page with none gets a plain page header titled with its own nav label (the owner's
 * page name, no new facts). Two or more headings, or a homepage without a hero, are left for the model to fix:
 * dropping one would lose content, and a hero needs a headline nobody wrote. Returns what was repaired.
 */
export function repairMainHeadings(spec: SiteSpec): string[] {
  const repairs: string[] = [];
  const ids = new Set(spec.pages.flatMap((p) => p.sections.map((s) => s.id)));
  spec.pages.forEach((p, pi) => {
    const at = p.sections.flatMap((s, si) => (MAIN_HEADING_TYPES.has(s.type) ? [si] : []));
    if (at.length === 1 && at[0] !== 0 && !(p.sections[0]!.type === "collection")) {
      const [h] = p.sections.splice(at[0]!, 1);
      p.sections.unshift(h!);
      repairs.push(`/pages/${pi}: moved the ${h!.type} to the top of the page`);
      return;
    }
    if (at.length === 0 && p.kind === "standard" && p.sections[0]?.type !== "collection" && p.nav.label.trim() && p.sections.length < MAX_SECTIONS) {
      let id = `s_${p.id.replace(/^p_/, "")}_head`;
      for (let n = 2; ids.has(id); n++) id = `s_${p.id.replace(/^p_/, "")}_head${n}`;
      ids.add(id);
      p.sections.unshift({ id, type: "page-header", variant: "plain", props: { title: p.nav.label.trim() } } as Section);
      repairs.push(`/pages/${pi}: added a page-header titled "${p.nav.label.trim()}"`);
    }
  });
  return repairs;
}
