import type { Issue } from "./validate.ts";
import type { SiteSpec } from "./site.ts";
import { setAt, walkStrings } from "./pointer.ts";
import { issueKeys, noNewIssues, removeAt } from "./repair-util.ts";

/**
 * An image at most once per page (the outside review, 2026-10-14: the hero's photo again in a later section reads as
 * a site with nothing else to show). The logo is not an image asset, so it is not counted. Like the one-main-heading
 * rule (headings.ts), this is not part of validateSite: sites made before the rule stay valid and editable, and an
 * owner who places one photo twice keeps it. Generation repairs it in code (engine stages).
 */

type Section = SiteSpec["pages"][number]["sections"][number];

interface Use {
  page: number;
  section: number;
  /** Pointer inside the section's props. */
  at: string;
  image: string;
}

function usesOn(spec: SiteSpec, pi: number): Use[] {
  const ids = new Set(spec.assets.images.map((i) => i.id));
  const out: Use[] = [];
  spec.pages[pi]!.sections.forEach((s, si) =>
    walkStrings(s.props, (v, at) => {
      if (ids.has(v)) out.push({ page: pi, section: si, at, image: v });
    }),
  );
  return out;
}

/** Each later use of an image already shown higher on the same page. */
function repeats(spec: SiteSpec, pi: number): Use[] {
  const seen = new Set<string>();
  return usesOn(spec, pi).filter((u) => {
    if (seen.has(u.image)) return true;
    seen.add(u.image);
    return false;
  });
}

export function repeatedImageIssues(spec: SiteSpec): Issue[] {
  return spec.pages.flatMap((p, pi) =>
    repeats(spec, pi).map((u) => ({
      path: `/pages/${pi}/sections/${u.section}/props${u.at}`,
      code: "structure" as const,
      message: `image ${u.image} is already shown higher on this page; each image at most once per page`,
    })),
  );
}

/**
 * A portrait stands for one person: never swapped for another picture (a team member's portrait in the list, or a
 * composed team section). The team section's own photo of the room (image, inset) is not a portrait.
 */
function isPortrait(s: Section, at: string): boolean {
  if (s.type === "team") return !/^\/(image|inset)$/.test(at);
  if (s.type === "composed") return (s.props as { intent?: string }).intent === "team";
  return false;
}

/**
 * The safe repair, in place. Each later use of an image already shown higher on its page gets an image of the site's
 * assets the page doesn't show yet (one the site doesn't use anywhere first, the owner's photos before generated ones),
 * provided the swap leaves the spec as valid as it was (a generated picture only where one may stand); a portrait is
 * never swapped. Without one, the later section drops the image where its schema and variant allow none; otherwise it
 * stays and the returned line says so. With `opts.composedEntries` (the studio's freshly built homepage) a composed
 * section's image element or photo layer that can neither swap nor lose its image goes as a whole (never a portrait).
 * Returns what was repaired (and what was left).
 */
export function repairRepeatedImages(spec: SiteSpec, opts: { composedEntries?: boolean } = {}): string[] {
  const log: string[] = [];
  const siteUsed = new Set<string>();
  walkStrings(spec.pages, (v) => siteUsed.add(v));
  for (let pi = 0; pi < spec.pages.length; pi++) {
    const page = spec.pages[pi]!;
    // Last first: dropping an item of a list never moves a use still to be repaired.
    for (const u of repeats(spec, pi).reverse()) {
      const section = page.sections[u.section]!;
      const where = `/pages/${pi}/sections/${u.section}/props${u.at}`;
      const before = issueKeys(spec);
      const onPage = new Set(usesOn(spec, pi).map((x) => x.image));
      const free = spec.assets.images
        .filter((i) => !onPage.has(i.id))
        .sort((a, b) => Number(siteUsed.has(a.id)) - Number(siteUsed.has(b.id)) || Number(a.origin === "generated") - Number(b.origin === "generated"));
      let done = false;
      if (!isPortrait(section, u.at)) {
        for (const img of free) {
          setAt(section.props, u.at, img.id);
          if (noNewIssues(before, issueKeys(spec))) {
            siteUsed.add(img.id);
            log.push(`${where}: ${u.image} is already shown higher on the page; used ${img.id} instead`);
            done = true;
            break;
          }
        }
        if (!done) setAt(section.props, u.at, u.image);
      }
      if (done) continue;
      const snapshot = structuredClone(section.props);
      // The image alone, else (opts.composedEntries) the composed element or background layer that shows it.
      const holder = opts.composedEntries && section.type === "composed" && !isPortrait(section, u.at) ? /^\/(elements|background)\/\d+/.exec(u.at)?.[0] : undefined;
      for (const at of [u.at, ...(holder && holder !== u.at ? [holder] : [])]) {
        removeAt(section.props, at);
        if (noNewIssues(before, issueKeys(spec))) {
          log.push(`${where}: ${u.image} is already shown higher on the page; dropped ${at === u.at ? "it" : `its ${at.split("/")[1] === "elements" ? "element" : "layer"}`} here (no other image fits)`);
          done = true;
          break;
        }
        (section as { props: unknown }).props = structuredClone(snapshot);
      }
      if (done) continue;
      log.push(`${where}: ${u.image} is already shown higher on the page; left it (no other image fits and the section needs one)`);
    }
  }
  return log;
}
