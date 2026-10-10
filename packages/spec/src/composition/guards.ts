/**
 * Guards for composed sections (spec v19, docs/plans/ai-designer-spec.md §2.4): the rules a schema can't say.
 *
 * `validateComposition` reports what is wrong (validateSite runs it for every composed section); `repairComposition` makes
 * the safe fixes (a copy, nothing is lost: levels, flags, a span, a dash), logged as "<path>: …" lines like repairSiteCopy.
 * The engine runs the repair before the validation; a composed section that still fails is replaced by a preset layout
 * of its intent (./fallback.ts) or dropped.
 *
 * Facts: `fact.value` and every number in a composed text are checked against the client's corpus by the engine's checkFacts,
 * which walks every string of the pages; there is no rule for it here.
 */
import type { Issue } from "../validate.ts";
import type { Section } from "../sections/index.ts";
import type { SiteSpec } from "../site.ts";
import { BANNED_HEADLINE, NUMBERED_LABEL, findBannedCopy, repairEmDashes } from "../banned.ts";
import { MAIN_HEADING_TYPES, hasComposedH1 } from "../headings.ts";
import { walkStrings } from "../pointer.ts";
import { DecorPath, GRID_COLUMNS, MAX_ELEMENTS, type Element } from "./schema.ts";

export type ComposedSection = Extract<Section, { type: "composed" }>;

/** What a rule needs besides the section itself. Everything is optional: a rule without its context is skipped. */
export interface CompositionContext {
  /** JSON Pointer of the section ("/pages/0/sections/2"); issue and repair paths read "<at>/props/elements/<i>/…". */
  at?: string;
  /** Ids of spec.assets.images: every image element must point at one. */
  imageIds?: ReadonlySet<string>;
  /** Whether business.bookingUrl is set: a "book" action needs it. */
  hasBookingUrl?: boolean;
  /** The page the section is on, for the rules across sections (one h1, display sizes, photo use). */
  page?: { sections: readonly Section[]; index: number };
}

/** The context validateSite uses for the section at `pageIndex` / `sectionIndex`. */
export function compositionContext(spec: SiteSpec, pageIndex: number, sectionIndex: number): CompositionContext {
  return {
    at: `/pages/${pageIndex}/sections/${sectionIndex}`,
    imageIds: new Set(spec.assets.images.map((i) => i.id)),
    hasBookingUrl: !!spec.business.bookingUrl,
    page: { sections: spec.pages[pageIndex]!.sections, index: sectionIndex },
  };
}

/** Elements that carry words, numbers or links: they never overlap each other and are never hidden on phones. */
const TEXT_KINDS: ReadonlySet<Element["kind"]> = new Set(["heading", "text", "list", "fact", "action", "hours", "contact", "prices"]);
export const isTextBearing = (e: Element): boolean => TEXT_KINDS.has(e.kind);

/** Running text spans at least this many columns (never a sliver) and at most this many (45–75 characters at 1280 px). */
export const TEXT_SPAN = { min: 4, max: 8 } as const;
/** A shift step moves an element about this fraction of a cell; deliberately generous so the overlap check is conservative. */
const SHIFT_CELLS = 0.75;
/** Headings from this size rotate (a vertical heading needs the size to be legible). */
const ROTATE_MIN_SIZE = 4;
/** All caps only this heavy and this large (smaller is the banned tracked eyebrow; the renderer sets normal case below). */
export const UPPERCASE_MIN = { weight: 700, size: 2 } as const;
const DISPLAY = { headingSize: 6, factSize: 7, perSection: 1, perPage: 2 } as const;
const MAX_PHOTO_USES = 2;
const MAX_SVG_PATHS = 24;

const isDisplay = (e: Element): boolean => (e.kind === "heading" && e.size >= DISPLAY.headingSize) || (e.kind === "fact" && e.size >= DISPLAY.factSize);

/** Reading order is phone.order, ties by position in the list (the order the renderer stacks them in). */
export function readingOrder(elements: readonly Element[]): { e: Element; i: number }[] {
  return elements.map((e, i) => ({ e, i })).sort((a, b) => a.e.phone.order - b.e.phone.order || a.i - b.i);
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The cells an element covers on the desktop grid, widened toward its shift (both the resting and the shifted place). */
function rectOf(e: Element): Rect {
  const d = e.desk;
  const r = { x0: d.col - 1, x1: d.col - 1 + d.span, y0: d.row - 1, y1: d.row - 1 + (d.rowSpan ?? 1) };
  const sx = (d.shiftX ?? 0) * SHIFT_CELLS;
  const sy = (d.shiftY ?? 0) * SHIFT_CELLS;
  if (sx > 0) r.x1 += sx;
  else r.x0 += sx;
  if (sy > 0) r.y1 += sy;
  else r.y0 += sy;
  return r;
}

const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Section is centred as a whole when it has text and every text-bearing element is centred (banned: everything centred). */
export function isCentredComposed(props: ComposedSection["props"]): boolean {
  const text = props.elements.filter(isTextBearing);
  return text.length > 0 && text.every((e) => e.desk.alignX === "center");
}

/** Number of times each photo id appears in the sections' props. */
function photoUses(sections: readonly Section[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const s of sections) {
    walkStrings(s.props, (v) => {
      if (/^img_/.test(v)) uses.set(v, (uses.get(v) ?? 0) + 1);
    });
  }
  return uses;
}

/** Blocks of a decor or fact, a heading and a text that sit side by side with equal spans (the "row of three icon cards"). */
function cardRows(elements: readonly Element[]): { start: number; span: number }[] {
  const headings = elements.filter((e) => e.kind === "heading");
  const cols = (e: Element) => ({ a: e.desk.col, b: e.desk.col + e.desk.span - 1 });
  const meets = (e: Element, h: Element) => cols(e).a <= cols(h).b && cols(h).a <= cols(e).b;
  const blocks = headings.flatMap((h) => {
    const members = elements.filter((e) => e !== h && (e.kind === "decor" || e.kind === "fact" || e.kind === "text") && meets(e, h) && !headings.some((o) => o !== h && meets(e, o)));
    if (!members.some((e) => e.kind === "decor" || e.kind === "fact") || !members.some((e) => e.kind === "text")) return [];
    const all = [h, ...members];
    return [{ h, y0: Math.min(...all.map((e) => e.desk.row)), y1: Math.max(...all.map((e) => e.desk.row + (e.desk.rowSpan ?? 1))) }];
  });
  const out: { start: number; span: number }[] = [];
  for (const pivot of blocks) {
    const row = blocks.filter((b) => b.h.desk.span === pivot.h.desk.span && b.y0 < pivot.y1 && pivot.y0 < b.y1).sort((a, b) => a.h.desk.col - b.h.desk.col);
    let count = 0;
    let end = 0;
    for (const b of row) {
      if (b.h.desk.col > end) {
        count++;
        end = b.h.desk.col + b.h.desk.span - 1;
      }
    }
    if (count >= 3 && !out.some((o) => o.span === pivot.h.desk.span)) out.push({ start: row[0]!.h.desk.col, span: pivot.h.desk.span });
  }
  return out;
}

/** The other sections of the page that render the page's h1, as { index, type }. */
function otherMainHeadings(ctx: CompositionContext): { before: { index: number; type: string }[]; after: { index: number; type: string }[] } {
  const out = { before: [] as { index: number; type: string }[], after: [] as { index: number; type: string }[] };
  const page = ctx.page;
  if (!page) return out;
  page.sections.forEach((s, index) => {
    if (index < page.index && (MAIN_HEADING_TYPES.has(s.type) || hasComposedH1(s) || (s.type === "collection" && index === 0))) out.before.push({ index, type: s.type });
    // Later composed sections are checked on their own turn; a later preset main heading is only seen from here.
    if (index > page.index && MAIN_HEADING_TYPES.has(s.type)) out.after.push({ index, type: s.type });
  });
  return out;
}

/** Everything a schema can't say about a composed section, as issues (paths are JSON Pointers). */
export function validateComposition(section: ComposedSection, ctx: CompositionContext = {}): Issue[] {
  const issues: Issue[] = [];
  const els = section.props.elements;
  const at = ctx.at ?? "";
  const base = `${at}/props/elements`;
  const add = (path: string, code: Issue["code"], message: string) => issues.push({ path, code, message });
  const rows = section.props.rows;
  const order = readingOrder(els);

  // Grid bounds, unique ids, element count.
  if (els.length > MAX_ELEMENTS) add(base, "structure", `composed: at most ${MAX_ELEMENTS} elements (has ${els.length})`);
  const ids = new Set<string>();
  els.forEach((e, i) => {
    if (ids.has(e.id)) add(`${base}/${i}/id`, "structure", `composed: duplicate element id ${e.id}`);
    ids.add(e.id);
    const d = e.desk;
    if (d.col + d.span - 1 > GRID_COLUMNS) add(`${base}/${i}/desk/span`, "structure", `composed: ${e.id} runs past column ${GRID_COLUMNS} (col ${d.col} + span ${d.span} − 1 must be ≤ ${GRID_COLUMNS})`);
    if (d.row + (d.rowSpan ?? 1) - 1 > rows) add(`${base}/${i}/desk/${d.rowSpan === undefined ? "row" : "rowSpan"}`, "structure", `composed: ${e.id} runs past row ${rows} (row ${d.row} + rowSpan ${d.rowSpan ?? 1} − 1 must be ≤ rows)`);
  });

  // Phones: nothing with words is hidden; only decor and a second photo may be.
  els.forEach((e, i) => {
    if (!e.phone.hidden) return;
    if (isTextBearing(e)) add(`${base}/${i}/phone/hidden`, "structure", `composed: ${e.id} (${e.kind}) carries words and can't be hidden on phones`);
    else if (e.kind === "image" && !els.some((o) => o !== e && o.kind === "image" && !o.phone.hidden)) add(`${base}/${i}/phone/hidden`, "structure", `composed: ${e.id} is the only photo shown on phones; only a second photo may be hidden`);
  });

  // Desktop: text never overlaps text (it may overlap a photo or a drawing).
  const rects = els.map(rectOf);
  for (let j = 0; j < els.length; j++) {
    if (!isTextBearing(els[j]!)) continue;
    for (let i = 0; i < j; i++) {
      if (isTextBearing(els[i]!) && overlaps(rects[i]!, rects[j]!)) add(`${base}/${j}/desk`, "structure", `composed: ${els[j]!.id} overlaps ${els[i]!.id} on desktop; text never overlaps text`);
    }
  }

  // Rotation: large headings only (the renderer ignores it on phones).
  els.forEach((e, i) => {
    if (e.kind === "heading" && e.rotate !== undefined && e.rotate !== "0" && e.size < ROTATE_MIN_SIZE) add(`${base}/${i}/rotate`, "structure", `composed: ${e.id} rotates at size ${e.size}; only headings of size ${ROTATE_MIN_SIZE} or more may rotate`);
  });

  // One h1 per page, and it comes first.
  const h1s = els.flatMap((e, i) => (e.kind === "heading" && e.level === 1 ? [i] : []));
  if (h1s.length > 1) add(`${base}/${h1s[1]}/level`, "structure", "composed: one h1 per section; demote the others to level 2");
  if (h1s.length > 0) {
    const firstHeading = order.find((o) => o.e.kind === "heading");
    if (firstHeading && firstHeading.e.kind === "heading" && firstHeading.e.level !== 1 && !h1s.includes(firstHeading.i)) add(`${base}/${h1s[0]}/level`, "structure", `composed: the h1 must be the first heading in reading order (${firstHeading.e.id} comes before it)`);
    const others = otherMainHeadings(ctx);
    const clash = [...others.before, ...others.after][0];
    if (clash) add(`${base}/${h1s[0]}/level`, "structure", `composed: the page has one h1 and section ${clash.index} (${clash.type}) already carries it`);
    else if (ctx.page && ctx.page.index > 0) add(`${base}/${h1s[0]}/level`, "structure", "composed: the page's h1 must be in its first section");
  }

  // Actions: one primary, one call, a link exactly for "link".
  const actions = els.flatMap((e, i) => (e.kind === "action" ? [{ e, i }] : []));
  const primaries = actions.filter((a) => a.e.kind === "action" && a.e.style === "primary");
  if (primaries.length > 1) add(`${base}/${primaries[1]!.i}/style`, "banned", "composed: one primary action per section (the others are secondary)");
  const calls = actions.filter((a) => a.e.kind === "action" && a.e.action === "call");
  if (calls.length > 1) add(`${base}/${calls[1]!.i}/action`, "banned", "composed: at most one call action per section");
  for (const { e, i } of actions) {
    if (e.kind !== "action") continue;
    if (e.action === "link" && e.link === undefined) add(`${base}/${i}/link`, "structure", `composed: ${e.id} is a link action and needs a link`);
    if (e.action !== "link" && e.link !== undefined) add(`${base}/${i}/link`, "structure", `composed: ${e.id} has a link but its action is ${e.action}; a link belongs only to the link action`);
    if (e.action === "book" && ctx.hasBookingUrl === false) add(`${base}/${i}/action`, "reference", "booking link without business.bookingUrl");
  }

  // Copy: the banned list on every string; numbered headings; greetings as headings.
  els.forEach((e, i) => {
    for (const v of findBannedCopy(e, `${base}/${i}`)) add(v.path, "banned", `${v.rule}: "${v.text}"`);
    if (e.kind !== "heading") return;
    if (NUMBERED_LABEL.test(e.text)) add(`${base}/${i}/text`, "banned", `numbered label: "${e.text}"`);
    for (const b of BANNED_HEADLINE) if (b.pattern.test(e.text)) add(`${base}/${i}/text`, "banned", `${b.label}: "${e.text}"`);
  });

  // Uppercase headings: heavy and sized, never a small tracked eyebrow.
  els.forEach((e, i) => {
    if (e.kind === "heading" && e.case === "uppercase" && ((e.weight ?? 0) < UPPERCASE_MIN.weight || e.size < UPPERCASE_MIN.size)) {
      add(`${base}/${i}/case`, "banned", `uppercase tracked heading: "${e.text}" (uppercase needs weight ${UPPERCASE_MIN.weight}+ and size ${UPPERCASE_MIN.size}+)`);
    }
  });

  // Banned: a row of three icon cards.
  for (const row of cardRows(els)) add(`${base}`, "banned", `row of three icon cards: three or more blocks of ${row.span} columns, each a drawing or fact with a heading and text (from column ${row.start})`);

  // Display sizes: one per section, two per page.
  const display = els.flatMap((e, i) => (isDisplay(e) ? [i] : []));
  if (display.length > DISPLAY.perSection) add(`${base}/${display[1]}`, "structure", `composed: one display size (heading 6–8, fact 7–8) per section; ${display.length} found`);
  if (display.length > 0 && ctx.page) {
    const before = ctx.page.sections.slice(0, ctx.page.index).reduce((n, s) => n + (s.type === "composed" ? s.props.elements.filter(isDisplay).length : 0), 0);
    if (before + display.length > DISPLAY.perPage) add(`${base}/${display[0]}`, "structure", `composed: at most ${DISPLAY.perPage} display sizes per page (${before} earlier on the page)`);
  }

  // Photos exist and are not used more than twice on a page.
  const earlier = ctx.page ? photoUses(ctx.page.sections.slice(0, ctx.page.index)) : new Map<string, number>();
  const used = new Map<string, number>();
  els.forEach((e, i) => {
    if (e.kind !== "image") return;
    if (ctx.imageIds && !ctx.imageIds.has(e.image)) add(`${base}/${i}/image`, "reference", `unknown image ${e.image}`);
    const n = (used.get(e.image) ?? 0) + 1;
    used.set(e.image, n);
    if ((earlier.get(e.image) ?? 0) + n > MAX_PHOTO_USES) add(`${base}/${i}/image`, "structure", `composed: ${e.image} is used more than ${MAX_PHOTO_USES} times on the page`);
  });

  // Drawings: a motif or an svg, never both or neither; at most 24 paths, each only the allowed characters.
  els.forEach((e, i) => {
    if (e.kind !== "decor") return;
    if ((e.motif === undefined) === (e.svg === undefined)) add(`${base}/${i}`, "structure", `composed: ${e.id} needs exactly one of motif and svg`);
    if (e.svg) {
      if (e.svg.paths.length > MAX_SVG_PATHS) add(`${base}/${i}/svg/paths`, "structure", `composed: a drawing has at most ${MAX_SVG_PATHS} paths (${e.svg.paths.length})`);
      e.svg.paths.forEach((p, k) => {
        if (!DecorPath.safeParse(p).success) add(`${base}/${i}/svg/paths/${k}/d`, "structure", "composed: a drawing's path uses characters or colours that aren't allowed (path data only, colour roles only)");
      });
    }
  });

  // Measure: running text is never a sliver and never a long line.
  els.forEach((e, i) => {
    if (e.kind !== "text") return;
    if (e.desk.span < TEXT_SPAN.min || e.desk.span > TEXT_SPAN.max) add(`${base}/${i}/desk/span`, "structure", `composed: running text spans ${TEXT_SPAN.min}–${TEXT_SPAN.max} columns on desktop (${e.id} spans ${e.desk.span})`);
  });

  return issues;
}

/**
 * The safe repairs, on a copy: the original is returned untouched when there is nothing to repair. Em dashes become
 * en dashes, forbidden hiding and uppercase are dropped, extra h1s and primary buttons go down a level, a stray link
 * is dropped and running text's span is clamped into the grid. Returns what was repaired.
 */
export function repairComposition(section: ComposedSection, ctx: CompositionContext = {}): { section: ComposedSection; repairs: string[] } {
  const next = structuredClone(section);
  const els = next.props.elements;
  const base = `${ctx.at ?? ""}/props/elements`;
  const repairs: string[] = [];
  const log = (path: string, what: string) => repairs.push(`${path}: ${what}`);

  repairs.push(...repairEmDashes(els, base));

  els.forEach((e, i) => {
    if (e.phone.hidden && (isTextBearing(e) || (e.kind === "image" && !els.some((o) => o !== e && o.kind === "image" && !o.phone.hidden)))) {
      delete e.phone.hidden;
      log(`${base}/${i}/phone/hidden`, `${e.kind} is shown on phones`);
    }
  });

  // Headings: one h1 per section, the first in reading order; none at all when another section of the page has it.
  const otherH1 = otherMainHeadings(ctx).before.length > 0;
  let kept = false;
  for (const { e, i } of readingOrder(els)) {
    if (e.kind !== "heading" || e.level !== 1) continue;
    if (kept || otherH1) {
      e.level = 2;
      log(`${base}/${i}/level`, "demoted h1 to h2 (one h1 per page)");
    } else kept = true;
  }

  let primary = false;
  for (const { e, i } of readingOrder(els)) {
    if (e.kind !== "action") continue;
    if (e.style === "primary") {
      if (primary) {
        e.style = "secondary";
        log(`${base}/${i}/style`, "extra primary action made secondary");
      }
      primary = true;
    }
    if (e.action !== "link" && e.link !== undefined) {
      delete e.link;
      log(`${base}/${i}/link`, `link dropped (the action is ${e.action})`);
    }
  }

  els.forEach((e, i) => {
    if (e.kind === "text" && (e.desk.span < TEXT_SPAN.min || e.desk.span > TEXT_SPAN.max)) {
      const span = Math.min(TEXT_SPAN.max, Math.max(TEXT_SPAN.min, e.desk.span));
      const col = Math.min(e.desk.col, GRID_COLUMNS - span + 1);
      log(`${base}/${i}/desk`, `text spans ${span} columns (was ${e.desk.span})${col !== e.desk.col ? ` from column ${col}` : ""}`);
      e.desk.span = span;
      e.desk.col = col;
    }
    if (e.kind === "heading" && e.case === "uppercase" && ((e.weight ?? 0) < UPPERCASE_MIN.weight || e.size < UPPERCASE_MIN.size)) {
      delete e.case;
      log(`${base}/${i}/case`, "uppercase dropped (needs weight 700+ and size 2+)");
    }
  });

  return repairs.length ? { section: next, repairs } : { section, repairs };
}
