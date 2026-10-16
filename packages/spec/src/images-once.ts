import type { Issue } from "./validate.ts";
import { validateSite } from "./validate.ts";
import type { SiteSpec } from "./site.ts";
import { getAt, parsePointer, setAt, walkStrings } from "./pointer.ts";

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

const issueKeys = (spec: SiteSpec): Set<string> => {
  const v = validateSite(spec);
  return new Set(v.ok ? [] : v.issues.map((i) => `${i.path} ${i.message}`));
};

/** Every issue of `after` was already there before (the change made nothing invalid). */
const noNewIssues = (before: Set<string>, after: Set<string>) => [...after].every((k) => before.has(k));

/** Removes the value at `at` inside props: the key of an object, or the item of an array. */
function removeAt(props: unknown, at: string): void {
  const keys = parsePointer(at);
  const last = keys.pop()!;
  const parentAt = keys.length ? `/${keys.map((k) => k.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}` : "";
  const parent = parentAt ? getAt(props, parentAt) : props;
  if (Array.isArray(parent)) parent.splice(Number(last), 1);
  else if (parent && typeof parent === "object") delete (parent as Record<string, unknown>)[last];
}

/**
 * The safe repair, in place. Each later use of an image already shown higher on its page gets an image of the site's
 * assets the page doesn't show yet (one the site doesn't use anywhere first, the owner's photos before generated ones),
 * provided the swap leaves the spec as valid as it was (a generated picture only where one may stand); a portrait is
 * never swapped. Without one, the later section drops the image where its schema and variant allow none; otherwise it
 * stays and the returned line says so. Returns what was repaired (and what was left).
 */
export function repairRepeatedImages(spec: SiteSpec): string[] {
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
      removeAt(section.props, u.at);
      if (noNewIssues(before, issueKeys(spec))) {
        log.push(`${where}: ${u.image} is already shown higher on the page; dropped it here (no other image fits)`);
        continue;
      }
      (section as { props: unknown }).props = snapshot;
      log.push(`${where}: ${u.image} is already shown higher on the page; left it (no other image fits and the section needs one)`);
    }
  }
  return log;
}
