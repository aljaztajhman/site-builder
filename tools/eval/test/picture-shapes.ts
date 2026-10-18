/**
 * Pages and in-browser measurements for the picture-shape tests (review50-ai-labels.test.ts, picture-edges.test.ts):
 * every page the saved specs make (the goldens and the Review 50 pages), two Fresh 10 pages rebuilt from their recorded
 * answers, and one page with every photo section the saved specs use, rendered in each imagery treatment. With
 * `labelled`, every picture a generated one may be (validateSite says where) is marked generated, so it carries its
 * "Ustvarjeno z UI" label. No model call: stand-in photos and recorded answers.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { Imagery, direction, enforceDesign, migrateSpec, validateSite, type Section, type SiteSpec } from "@sb/spec";
import { repoRoot } from "../src/compose-sheet.ts";

const GOLDEN_DIR = path.join(repoRoot, "tools/eval/golden");
const REVIEW50_DIR = path.join(repoRoot, "eval/outside-review/review50-specs");
const FRESH10_RECORDINGS = path.join(repoRoot, "tools/eval/recordings-fresh10");

const read = (file: string): SiteSpec => migrateSpec(JSON.parse(readFileSync(file, "utf8"))) as SiteSpec;

/** The image ids validateSite won't take as generated where the spec uses them (a team photo, a gallery). */
const notGeneratedThere = (spec: SiteSpec): Set<string> =>
  new Set(
    (validateSite(spec).ok ? [] : validateSite(spec).issues)
      .map((i) => /^(img_\w+) is AI-generated and may only be used in/.exec(i.message)?.[1])
      .filter((id): id is string => !!id),
  );

/** Every picture that may be a generated one marked generated, so it is labelled (the others stay as they were). */
export function labelAll(spec: SiteSpec): SiteSpec {
  const before = new Map(spec.assets.images.map((i) => [i.id, i.origin]));
  for (const img of spec.assets.images) img.origin = "generated";
  for (const id of notGeneratedThere(spec)) {
    const img = spec.assets.images.find((i) => i.id === id)!;
    const was = before.get(id);
    if (was === undefined) delete img.origin;
    else img.origin = was;
  }
  return spec;
}

export interface ShapePage {
  name: string;
  spec: SiteSpec;
  /** Sections left out because their props don't hold on the page's spec, and why. */
  dropped?: string[];
}

/** The goldens and the Review 50 pages that show a picture, as saved (their own direction, imagery and sections). */
export function savedPages(opts: { labelled: boolean }): ShapePage[] {
  const goldens = readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ name: `golden ${f.replace(/\.json$/, "")}`, spec: read(path.join(GOLDEN_DIR, f)) }));
  const review = readdirSync(REVIEW50_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((id) => ({ name: `review50 ${id}`, spec: read(path.join(REVIEW50_DIR, id, "spec-generated.json")) }));
  return [...goldens, ...review]
    .filter((p) => p.spec.assets.images.length > 0)
    .map((p) => ({ name: p.name, spec: opts.labelled ? labelAll(p.spec) : p.spec }))
    .map((p) => ({ ...p, spec: { ...p.spec, slug: p.name.replace(/[^a-z0-9]+/g, "-") } }));
}

/** A recorded stage answer of a Fresh 10 page (the JSON the model wrote). */
function recorded<T>(id: string, file: string): T {
  const rec = JSON.parse(readFileSync(path.join(FRESH10_RECORDINGS, id, file), "utf8")) as { response: { text: string } };
  return JSON.parse(rec.response.text) as T;
}

/**
 * A Fresh 10 page rebuilt from its recorded design and content answers (direction, font pair, radius, its imagery,
 * chrome and homepage sections), on the saved cvetlicarna-marjetica spec for the facts and its two generated pictures
 * (the same ids, img_g1 and img_g2). A section the recorded answer gave a picture it may not take as a generated one
 * (validateSite) is left out: a generation can't publish it.
 */
export function freshPage(id: "plesna-sola-takt" | "sirarna-pr-simnu"): ShapePage {
  const base = read(path.join(REVIEW50_DIR, "cvetlicarna-marjetica", "spec-generated.json"));
  const design = recorded<{ direction: string; fontPair: string; radius: number }>(id, "003-design.json");
  const content = recorded<{ chrome: SiteSpec["chrome"]; pages: { kind: string; sections: Section[] }[] }>(id, "004-content.json");
  const dir = direction(design.direction);
  delete base.design.skeleton;
  delete base.design.genome;
  base.design = enforceDesign({ ...base.design, direction: dir.id, fontPair: design.fontPair as SiteSpec["design"]["fontPair"], radius: design.radius, imagery: dir.imagery }, dir);
  base.chrome = { ...base.chrome, ...content.chrome };
  base.pages.find((p) => p.kind === "home")!.sections = content.pages.find((p) => p.kind === "home")!.sections as never;
  base.slug = `fresh10-${id}`;
  const dropped: string[] = [];
  for (const issue of validateSite(base).ok ? [] : validateSite(base).issues) {
    const at = / is AI-generated and may only be used in/.test(issue.message) ? /^\/pages\/(\d+)\/sections\/(\d+)\//.exec(issue.path) : null;
    if (!at) continue;
    const section = base.pages[Number(at[1])]!.sections[Number(at[2])]!;
    if (!dropped.includes(section.id)) dropped.push(section.id);
  }
  for (const page of base.pages) page.sections = page.sections.filter((s) => !dropped.includes(s.id)) as never;
  return { name: `fresh10 ${id}`, spec: base, dropped };
}

/** One of each photo section the saved specs use, by type:variant, from the first spec that has it. */
function photoSections(): Section[] {
  const out = new Map<string, Section>();
  for (const { spec } of savedPages({ labelled: false })) {
    for (const section of spec.pages.flatMap((p) => p.sections)) {
      const key = `${section.type}:${section.variant}`;
      if (out.has(key) || section.type === "composed" || !/"img_/.test(JSON.stringify(section.props))) continue;
      out.set(key, structuredClone(section));
    }
  }
  // No saved spec opens with the photo hero: its two variants by hand.
  for (const variant of ["overlay-bottom", "overlay-left"] as const) {
    const props = { headline: "Frizer za vso družino v Celju", intro: "Strižemo ženske, moške in otroke.", primary: { label: "Pokličite", target: { action: "call" } }, image: "img_x" };
    if (!out.has(`hero-image:${variant}`)) out.set(`hero-image:${variant}`, { id: "s_x", type: "hero-image", variant, props } as Section);
  }
  return [...out.values()];
}

/**
 * Every photo section the saved specs use, on pages of the frizerstvo-lana golden (its five pictures and facts; twelve
 * sections a page, the spec allows fourteen), in `imagery`: the treatments shape every `.media` of a page (an arched
 * top, rounded corners, a frame, an offset block). Links to the other specs' pages and booking links become calls; a
 * section whose props still don't hold on this spec is left out (validateSite), so each page is one a generation could
 * make. `labelled`: every picture is a generated one, so only the sections a generated picture may be in stay.
 */
export function everyPhotoSection(imagery: Imagery, opts: { labelled: boolean }): ShapePage[] {
  const spec = read(path.join(GOLDEN_DIR, "frizerstvo-lana.json"));
  if (opts.labelled) for (const img of spec.assets.images) img.origin = "generated";
  const have = spec.assets.images.map((i) => i.id);
  const home = spec.pages.find((p) => p.kind === "home")!;
  const pages = new Set(spec.pages.map((p) => p.id));
  const sections: Section[] = [];
  const dropped: string[] = [];
  for (const [n, section] of photoSections().entries()) {
    let i = n;
    const props = JSON.parse(JSON.stringify(section.props), (k, v: unknown) => {
      if (typeof v === "string" && /^img_/.test(v)) return have[i++ % have.length];
      if (k === "target" && v && typeof v === "object" && (("page" in v && !pages.has((v as { page: string }).page)) || (v as { action?: string }).action === "booking")) return { action: "call" };
      return v;
    }) as Section["props"];
    const s = { ...section, id: `s_p${n}`, props } as Section;
    home.sections = [s] as never;
    const v = validateSite(spec);
    if (v.ok) sections.push(s);
    else dropped.push(`${section.type}:${section.variant}: ${v.issues.slice(0, 2).map((x) => `${x.path} ${x.message}`).join("; ")}`);
  }
  const out: ShapePage[] = [];
  for (let k = 0; k * 12 < sections.length; k++) {
    home.sections = sections.slice(k * 12, k * 12 + 12) as never;
    const page = structuredClone(spec);
    // The treatment after validation: the direction's own rules may not pair it with the golden's shape language.
    page.design = { ...page.design, imagery };
    page.slug = `photos-${imagery}${opts.labelled ? "-ai" : ""}-${k + 1}`;
    out.push({ name: `every photo section, ${imagery} (${k + 1})`, spec: page, dropped });
  }
  return out;
}

export const IMAGERIES = Imagery.options;

/** Pictures (a `.media` or an `img` in main) whose box runs past the viewport's left or right edge, and by how much. */
export async function picturesPastEdge(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("main .media, main img")) {
      if (el.closest("[aria-hidden=true]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      // The visible span: the viewport, narrowed by every ancestor that clips its overflow sideways.
      let lo = 0;
      let hi = vw;
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "visible") continue;
        const ar = a.getBoundingClientRect();
        lo = Math.max(lo, ar.left);
        hi = Math.min(hi, ar.right);
      }
      const left = Math.round(lo - r.left);
      const right = Math.round(r.right - hi);
      if (left > 0 || right > 0) out.push(`${el.closest("section")?.id ?? "?"} ${el.parentElement?.className ?? ""} > ${el.tagName.toLowerCase()}.${el.className}: ${left > 0 ? `${left} px cut off on the left` : `${right} px cut off on the right`}`);
    }
    return out;
  });
}

/**
 * Labels not wholly seen: where, and which corners fall off. Each label is scrolled to the middle of the screen first
 * (a fixed or sticky header covers the top), then each corner of its box (inset 2 px: the label is rounded) must hit-test to the picture: a
 * corner the shape clips (border-radius with overflow hidden, clip-path) or another element covers hits something else.
 * A picture that isn't positioned places its label on some other box: reported as such.
 */
export async function clippedLabels(page: Page): Promise<string[]> {
  // The label lets clicks through (pointer-events: none); for the measurement it takes them, so a corner hit-tests to
  // the label (reported as its picture) wherever it is painted on top: over a see-through text layer it is still seen,
  // under a covering element or outside the shape's clip it isn't.
  await page.addStyleTag({ content: ".media--ai::after { pointer-events: auto !important; }" });
  const count = await page.evaluate(() => document.querySelectorAll(".media--ai").length);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const res = await page.evaluate((idx) => {
      const pic = document.querySelectorAll<HTMLElement>(".media--ai")[idx]!;
      const where = `${pic.closest("section")?.id ?? "?"} ${pic.parentElement?.className ?? ""} > ${pic.className}`;
      const cs = getComputedStyle(pic, "::after");
      if (cs.content === "none" || cs.display === "none") return { where, bad: ["no label"] };
      const pcs = getComputedStyle(pic);
      if (pcs.display === "none" || pic.getBoundingClientRect().width === 0) return { where, bad: [] };
      if (pcs.position === "static") return { where, bad: ["the picture isn't positioned: its label is placed on another box"] };
      // The label's box from its used position and size (absolutely positioned against the picture's padding box).
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      const bl = parseFloat(pcs.borderLeftWidth) || 0;
      const bt = parseFloat(pcs.borderTopWidth) || 0;
      const left = cs.left !== "auto" ? parseFloat(cs.left) : pic.clientWidth - parseFloat(cs.right) - w;
      const top = cs.top !== "auto" ? parseFloat(cs.top) : pic.clientHeight - parseFloat(cs.bottom) - h;
      const [tx = "0", ty = "0"] = cs.translate === "none" ? [] : cs.translate.split(/\s+/);
      const shift = (v: string, size: number) => (v.endsWith("%") ? (parseFloat(v) / 100) * size : parseFloat(v));
      const dx = bl + left + shift(tx, w);
      const dy = bt + top + shift(ty, h);
      const before = pic.getBoundingClientRect();
      window.scrollTo({ left: window.scrollX + before.left + dx + w / 2 - window.innerWidth / 2, top: window.scrollY + before.top + dy + h / 2 - window.innerHeight / 2, behavior: "instant" });
      const r = pic.getBoundingClientRect();
      const x0 = r.left + dx;
      const y0 = r.top + dy;
      const corners: [string, number, number][] = [
        ["top left", x0 + 2, y0 + 2],
        ["top right", x0 + w - 2, y0 + 2],
        ["bottom left", x0 + 2, y0 + h - 2],
        ["bottom right", x0 + w - 2, y0 + h - 2],
      ];
      const bad = corners
        .filter(([, x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return !hit || !(hit === pic || pic.contains(hit));
        })
        .map(([c, x, y]) => `${c} (${Math.round(x)}, ${Math.round(y)}) hits ${document.elementFromPoint(x, y)?.className || document.elementFromPoint(x, y)?.tagName}`);
      return { where, bad };
    }, i);
    if (res.bad.length) out.push(`${res.where}: ${res.bad.join("; ")}`);
  }
  return out;
}
