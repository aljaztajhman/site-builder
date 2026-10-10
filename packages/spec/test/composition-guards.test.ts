import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Section,
  composedFallback,
  compositionContext,
  isCentredComposed,
  mainHeadingIssues,
  repairComposition,
  repairMainHeadings,
  validateComposition,
  validateSite,
  type ComposedSection,
  type CompositionContext,
  type Element,
  type SiteSpec,
} from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (id = "pekarna-kvas"): SiteSpec => JSON.parse(readFileSync(path.join(here, `../../../tools/eval/golden/${id}.json`), "utf8")) as SiteSpec;

// ---------- fixtures ----------

type Desk = { col: number; span: number; row: number; rowSpan?: number; alignX?: "start" | "center" | "end" | "stretch"; shiftX?: number; shiftY?: number; layer?: number };
type Phone = { order: number; span?: "full" | "inset" | "half"; hidden?: boolean };

/** An element with its places; `rest` is the kind's own props. */
const el = (id: string, kind: Element["kind"], desk: Desk, phone: Phone, rest: Record<string, unknown> = {}): Element =>
  ({ id, kind, desk, phone: { span: "full", ...phone }, ...rest }) as unknown as Element;

const heading = (id: string, desk: Desk, order: number, rest: Record<string, unknown> = {}) => el(id, "heading", desk, { order }, { text: "Peka kruh vsak dan", level: 2, size: 3, ...rest });
const text = (id: string, desk: Desk, order: number, rest: Record<string, unknown> = {}) => el(id, "text", desk, { order }, { paragraphs: ["Kruh pečemo ob štirih zjutraj."], ...rest });
const photo = (id: string, desk: Desk, order: number, image = "img_01", phone: Partial<Phone> = {}) => el(id, "image", desk, { order, ...phone }, { image, ratio: "4:5" });
const fact = (id: string, desk: Desk, order: number, rest: Record<string, unknown> = {}) => el(id, "fact", desk, { order }, { value: "2004", label: "Delamo od leta", treatment: "numeral", size: 3, ...rest });
const decor = (id: string, desk: Desk, order: number, rest: Record<string, unknown> = {}) => el(id, "decor", desk, { order }, { motif: "crust", ...rest });
const action = (id: string, desk: Desk, order: number, rest: Record<string, unknown> = {}) => el(id, "action", desk, { order }, { action: "call", label: "Pokliči", style: "primary", ...rest });

/** A clean two-column story: heading and text on the left, a photo on the right. */
const base = (): Element[] => [heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 1, span: 6, row: 2 }, 1), photo("e_photo", { col: 8, span: 5, row: 1, rowSpan: 2 }, 2)];

const composed = (elements: Element[], props: Record<string, unknown> = {}): ComposedSection =>
  ({ id: "s_c", type: "composed", variant: "free", props: { intent: "story", width: "wide", rows: 3, elements, ...props } }) as unknown as ComposedSection;

const messages = (s: ComposedSection, ctx?: CompositionContext) => validateComposition(s, ctx).map((i) => i.message);
const has = (s: ComposedSection, re: RegExp, ctx?: CompositionContext) => messages(s, ctx).some((m) => re.test(m));
const ids = (n: number, make: (i: number) => Element) => Array.from({ length: n }, (_, i) => make(i));

/** A page of sections (for the rules across sections), the one under test at `index`. */
const onPage = (sections: ComposedSection[], index: number, extra: Partial<CompositionContext> = {}): CompositionContext => ({ page: { sections: sections as unknown as Section[], index }, ...extra });

describe("composition guards: the clean section", () => {
  it("passes every rule and repairs nothing", () => {
    const s = composed(base());
    expect(Section.safeParse(s).success).toBe(true);
    expect(validateComposition(s, { imageIds: new Set(["img_01"]) })).toEqual([]);
    const r = repairComposition(s);
    expect(r.repairs).toEqual([]);
    expect(r.section).toBe(s);
  });
});

describe("composition guards: the Tablica sample (composition.test.ts SAMPLE_COMPOSED)", () => {
  it("passes every rule on a page of its own", () => {
    const s = composed(
      [
        heading("e_title", { col: 1, span: 7, row: 1 }, 0, { text: "Servis vseh znamk v Kranju", level: 1, size: 7, weight: 800, measure: "m" }),
        fact("e_plate", { col: 1, span: 6, row: 2 }, 1, { value: "041 555 730", label: "Pokličite za termin", treatment: "plate", size: 5 }),
        action("e_call", { col: 1, span: 3, row: 3, alignX: undefined }, 2),
        photo("e_photo", { col: 8, span: 5, row: 1, rowSpan: 3, layer: 1 }, 3, "img_01"),
        decor("e_mark", { col: 11, span: 2, row: 3, layer: 2, shiftY: 1 }, 4, { motif: "plate" }),
      ],
      { intent: "hero", minHeight: "l" },
    );
    (s.props.elements[4] as { phone: Phone }).phone.hidden = true;
    expect(validateComposition(s, onPage([s], 0, { imageIds: new Set(["img_01"]) }))).toEqual([]);
  });
});

describe("composition guards: grid bounds, ids, count", () => {
  it("rejects an element that runs past column 12", () => {
    const s = composed([...base().slice(0, 2), photo("e_photo", { col: 9, span: 5, row: 1 }, 2)]);
    expect(has(s, /runs past column 12/)).toBe(true);
    expect(validateComposition(s)[0]!.path).toBe("/props/elements/2/desk/span");
    expect(has(composed(base()), /runs past column/)).toBe(false);
  });

  it("rejects an element that runs past the last row", () => {
    const s = composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 3, rowSpan: 2 }, 2)]);
    expect(has(s, /runs past row 3/)).toBe(true);
    expect(has(composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 3, rowSpan: 2 }, 2)], { rows: 4 }), /runs past row/)).toBe(false);
  });

  it("rejects duplicate element ids", () => {
    expect(has(composed([...base(), photo("e_photo", { col: 8, span: 5, row: 3 }, 3, "img_02")]), /duplicate element id e_photo/)).toBe(true);
    expect(has(composed(base()), /duplicate element id/)).toBe(false);
  });

  it("rejects more than 12 elements", () => {
    const many = ids(13, (i) => decor(`e_d${i}`, { col: 1, span: 1, row: 1 }, i));
    expect(has(composed(many), /at most 12 elements/)).toBe(true);
    expect(has(composed(many.slice(0, 12)), /at most 12 elements/)).toBe(false);
  });
});

describe("composition guards: phones", () => {
  it("rejects hidden text-bearing elements and repairs by showing them", () => {
    const els = base();
    els[1] = text("e_text", { col: 1, span: 6, row: 2 }, 1);
    (els[1] as { phone: Phone }).phone.hidden = true;
    const s = composed(els);
    expect(has(s, /e_text \(text\) carries words and can't be hidden on phones/)).toBe(true);
    const r = repairComposition(s);
    expect(r.repairs).toEqual(["/props/elements/1/phone/hidden: text is shown on phones"]);
    expect(validateComposition(r.section)).toEqual([]);
    expect(s.props.elements[1]!.phone.hidden).toBe(true); // the original is untouched
  });

  it("lets decor and a second photo be hidden, but not the only photo", () => {
    const withDecor = composed([...base(), decor("e_mark", { col: 11, span: 2, row: 3 }, 3)]);
    (withDecor.props.elements[3] as { phone: Phone }).phone.hidden = true;
    expect(has(withDecor, /hidden/)).toBe(false);
    const two = composed([...base(), photo("e_second", { col: 8, span: 3, row: 3 }, 3, "img_02", { hidden: true })]);
    expect(has(two, /hidden/)).toBe(false);
    const only = composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 1 }, 2, "img_01", { hidden: true })]);
    expect(has(only, /only photo shown on phones/)).toBe(true);
    expect(repairComposition(only).section.props.elements[2]!.phone.hidden).toBeUndefined();
  });
});

describe("composition guards: text never overlaps text on desktop", () => {
  it("rejects two text-bearing elements on the same cells", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 4, span: 6, row: 1 }, 1)]);
    expect(has(s, /e_text overlaps e_head on desktop; text never overlaps text/)).toBe(true);
    expect(validateComposition(s)[0]!.path).toBe("/props/elements/1/desk");
  });

  it("counts a shift toward a neighbouring text, not one away from it", () => {
    const side = (shiftX: number) => composed([heading("e_head", { col: 1, span: 6, row: 1, shiftX }, 0), text("e_text", { col: 7, span: 6, row: 1 }, 1)], { rows: 1 });
    expect(has(side(1), /overlaps/)).toBe(true);
    expect(has(side(-1), /overlaps/)).toBe(false);
    expect(has(side(0), /overlaps/)).toBe(false);
    const vertical = (shiftY: number) => composed([heading("e_head", { col: 1, span: 6, row: 1, shiftY }, 0), text("e_text", { col: 1, span: 6, row: 2 }, 1)]);
    expect(has(vertical(1), /overlaps/)).toBe(true);
    expect(has(vertical(-1), /overlaps/)).toBe(false);
  });

  it("lets text overlap a photo or a drawing", () => {
    const s = composed([photo("e_photo", { col: 1, span: 12, row: 1, rowSpan: 3 }, 0), heading("e_head", { col: 2, span: 6, row: 2, layer: 1 }, 1), decor("e_mark", { col: 2, span: 3, row: 2 }, 2)]);
    expect(has(s, /overlaps/)).toBe(false);
  });
});

describe("composition guards: rotation", () => {
  it("rotates only headings of size 4 or more", () => {
    const rotated = (size: number) => composed([heading("e_head", { col: 1, span: 2, row: 1, rowSpan: 3 }, 0, { size, rotate: "-90" }), text("e_text", { col: 4, span: 6, row: 1 }, 1)]);
    expect(has(rotated(3), /rotates at size 3/)).toBe(true);
    expect(has(rotated(4), /rotates/)).toBe(false);
  });
});

describe("composition guards: one h1 per page, first in reading order", () => {
  it("rejects a second h1 in a section and repairs it to h2", () => {
    const s = composed([heading("e_a", { col: 1, span: 6, row: 1 }, 0, { level: 1 }), heading("e_b", { col: 1, span: 6, row: 2 }, 1, { level: 1 })]);
    expect(has(s, /one h1 per section/)).toBe(true);
    const r = repairComposition(s);
    expect(r.repairs).toEqual(["/props/elements/1/level: demoted h1 to h2 (one h1 per page)"]);
    expect(has(r.section, /h1/)).toBe(false);
  });

  it("rejects an h1 that comes after another heading in reading order", () => {
    const s = composed([heading("e_a", { col: 1, span: 6, row: 1 }, 0, { level: 2 }), heading("e_b", { col: 1, span: 6, row: 2 }, 1, { level: 1 })]);
    expect(has(s, /h1 must be the first heading in reading order \(e_a comes before it\)/)).toBe(true);
    // Reading order is the phone order, whatever the desktop grid says.
    const swapped = composed([heading("e_a", { col: 1, span: 6, row: 1 }, 1, { level: 2 }), heading("e_b", { col: 1, span: 6, row: 2 }, 0, { level: 1 })]);
    expect(has(swapped, /h1 must be the first/)).toBe(false);
  });

  it("rejects an h1 when another section of the page already has the page's h1", () => {
    const hero = Section.parse(golden().pages[0]!.sections[0]);
    const mine = composed([heading("e_a", { col: 1, span: 6, row: 1 }, 0, { level: 1 })]);
    const page = [hero as unknown as ComposedSection, mine];
    expect(has(mine, /section 0 \(hero-split\) already carries it/, onPage(page, 1))).toBe(true);
    // ... or comes later (a preset's main heading)
    expect(has(mine, /section 1 \(hero-split\) already carries it/, { page: { sections: [mine, hero], index: 0 } })).toBe(true);
    // Alone on the first place it is fine; after a section that has no h1 it is not first.
    expect(has(mine, /h1/, onPage([mine], 0))).toBe(false);
    const quiet = composed(base());
    expect(has(mine, /h1 must be in its first section/, onPage([quiet, mine], 1))).toBe(true);
  });

  it("repairComposition demotes the h1 when an earlier section has it", () => {
    const hero = Section.parse(golden().pages[0]!.sections[0]) as unknown as ComposedSection;
    const mine = composed([heading("e_a", { col: 1, span: 6, row: 1 }, 0, { level: 1 })]);
    const r = repairComposition(mine, onPage([hero, mine], 1, { at: "/pages/0/sections/1" }));
    expect(r.repairs).toEqual(["/pages/0/sections/1/props/elements/0/level: demoted h1 to h2 (one h1 per page)"]);
  });

  it("counts a composed h1 as the main heading (headings.ts) and demotes later ones", () => {
    const spec = golden();
    const home = spec.pages[0]!;
    const first = composed([heading("e_a", { col: 1, span: 6, row: 1 }, 0, { level: 1 })], { intent: "hero" });
    const later = { ...composed([heading("e_b", { col: 1, span: 6, row: 1 }, 0, { level: 1 })]), id: "s_later" } as ComposedSection;
    home.sections = [first as unknown as (typeof home.sections)[number], ...home.sections.slice(1), later as unknown as (typeof home.sections)[number]];
    expect(mainHeadingIssues(spec).map((i) => i.message)).toEqual([expect.stringMatching(/main headings/)]);
    expect(repairMainHeadings(spec)).toEqual([`/pages/0/sections/${home.sections.length - 1}/props/elements/0/level: demoted h1 to h2 (the page has one main heading)`]);
    expect(mainHeadingIssues(spec)).toEqual([]);
    // The first composed h1 stays, and a page with only a composed h1 that isn't first moves it to the top.
    expect((first.props.elements[0] as { level: number }).level).toBe(1);
    home.sections = [...home.sections.slice(1, 3), first as unknown as (typeof home.sections)[number]];
    const moved = repairMainHeadings(spec);
    expect(moved).toEqual(["/pages/0: moved the composed to the top of the page"]);
    expect(home.sections[0]!.id).toBe("s_c");
  });
});

describe("composition guards: actions", () => {
  it("allows one primary action and repairs extra primaries to secondary", () => {
    const two = composed([...base(), action("e_a", { col: 1, span: 3, row: 3 }, 3, { action: "book" }), action("e_b", { col: 5, span: 3, row: 3 }, 4, { action: "directions" })]);
    expect(has(two, /one primary action per section/)).toBe(true);
    const r = repairComposition(two);
    expect(r.repairs).toEqual(["/props/elements/4/style: extra primary action made secondary"]);
    expect(r.section.props.elements[3]).toMatchObject({ style: "primary" });
    expect(r.section.props.elements[4]).toMatchObject({ style: "secondary" });
    expect(has(r.section, /primary/)).toBe(false);
  });

  it("allows at most one call action", () => {
    const calls = composed([...base(), action("e_a", { col: 1, span: 3, row: 3 }, 3), action("e_b", { col: 5, span: 3, row: 3 }, 4, { style: "secondary" })]);
    expect(has(calls, /at most one call action/)).toBe(true);
    const mixed = composed([...base(), action("e_a", { col: 1, span: 3, row: 3 }, 3), action("e_b", { col: 5, span: 3, row: 3 }, 4, { style: "secondary", action: "directions" })]);
    expect(has(mixed, /call action/)).toBe(false);
  });

  it("needs a link exactly for the link action", () => {
    const target = { url: "https://example.si" };
    const link = (extra: Record<string, unknown>) => composed([...base(), action("e_a", { col: 1, span: 3, row: 3 }, 3, extra)]);
    expect(has(link({ action: "link" }), /is a link action and needs a link/)).toBe(true);
    expect(has(link({ action: "link", link: { label: "Več", target } }), /link/)).toBe(false);
    const stray = link({ action: "call", link: { label: "Več", target } });
    expect(has(stray, /has a link but its action is call/)).toBe(true);
    const r = repairComposition(stray);
    expect(r.repairs).toEqual(["/props/elements/3/link: link dropped (the action is call)"]);
    expect(has(r.section, /link/)).toBe(false);
  });

  it("needs a booking URL for a booking action when the site's facts are known", () => {
    const s = composed([...base(), action("e_a", { col: 1, span: 3, row: 3 }, 3, { action: "book" })]);
    expect(has(s, /without business.bookingUrl/, { hasBookingUrl: false })).toBe(true);
    expect(has(s, /without business.bookingUrl/, { hasBookingUrl: true })).toBe(false);
    expect(has(s, /without business.bookingUrl/)).toBe(false);
  });
});

describe("composition guards: copy", () => {
  it("rejects numbered headings and fact labels", () => {
    const head = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { text: "01 / Kruh" })]);
    expect(has(head, /numbered label: "01 \/ Kruh"/)).toBe(true);
    const label = composed([fact("e_fact", { col: 1, span: 4, row: 1 }, 0, { label: "02 Leto" })]);
    expect(has(label, /numbered label: "02 Leto"/)).toBe(true);
    expect(has(composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { text: "Kruh iz peči" })]), /numbered/)).toBe(false);
  });

  it("runs the banned-copy checks on every composed string, greeting headings included", () => {
    const filler = composed([...base().slice(0, 1), text("e_text", { col: 1, span: 6, row: 2 }, 1, { paragraphs: ["Nudimo vrhunsko kakovost."] })]);
    expect(has(filler, /filler: vrhunska kakovost/)).toBe(true);
    expect(has(composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { text: "Dobrodošli pri nas" })]), /"Dobrodošli" headline/)).toBe(true);
    const listed = composed([el("e_list", "list", { col: 1, span: 6, row: 1 }, { order: 0 }, { items: ["Kruh", "Odklenite okus"] })]);
    expect(has(listed, /filler: odklenite/)).toBe(true);
  });

  it("repairs em dashes in every string, like repairSiteCopy", () => {
    const s = composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { text: "Kruh — vsak dan" })]);
    expect(has(s, /em dash/)).toBe(true);
    const r = repairComposition(s, { at: "/pages/0/sections/1" });
    expect(r.repairs).toEqual(["/pages/0/sections/1/props/elements/0/text: em dash replaced"]);
    expect((r.section.props.elements[0] as { text: string }).text).toBe("Kruh – vsak dan");
  });

  it("leaves facts to the engine's checkFacts, which walks every string of the pages", () => {
    // fact.value, prices and every number in a composed text are strings under /pages: nothing to check here.
    expect(has(composed([fact("e_fact", { col: 1, span: 4, row: 1 }, 0, { value: "1999" })]), /1999/)).toBe(false);
  });
});

describe("composition guards: centred sections", () => {
  const centred = (alignX: "center" | "start") => composed([heading("e_head", { col: 3, span: 8, row: 1, alignX }, 0), text("e_text", { col: 3, span: 8, row: 2, alignX }, 1)]);

  it("isCentredComposed is true only when all text is centred", () => {
    expect(isCentredComposed(centred("center").props)).toBe(true);
    expect(isCentredComposed(centred("start").props)).toBe(false);
    expect(isCentredComposed(composed([photo("e_photo", { col: 1, span: 12, row: 1 }, 0)]).props)).toBe(false);
  });

  it("rejects a second centred section on a page, composed or preset", () => {
    const put = (...extra: ComposedSection[]) => {
      const spec = golden();
      const home = spec.pages[0]!;
      home.sections = [home.sections[0]!, ...extra.map((s) => s as unknown as (typeof home.sections)[number]), ...home.sections.slice(1)];
      const v = validateSite(spec);
      return v.ok ? [] : v.issues.filter((i) => /centred sections/.test(i.message));
    };
    expect(put({ ...centred("center"), id: "s_c1" })).toEqual([]);
    expect(put({ ...centred("center"), id: "s_c1" }, { ...centred("center"), id: "s_c2" })[0]).toMatchObject({ code: "banned", message: "2 centred sections on one page (max 1)" });
  });
});

describe("composition guards: a row of three icon cards", () => {
  const card = (n: number, col: number, span: number, opts: { fact?: boolean; textToo?: boolean } = {}): Element[] => [
    opts.fact ? fact(`e_f${n}`, { col, span, row: 1 }, n * 3) : decor(`e_d${n}`, { col, span: 1, row: 1 }, n * 3),
    heading(`e_h${n}`, { col, span, row: 2 }, n * 3 + 1, { size: 1 }),
    ...(opts.textToo === false ? [] : [text(`e_t${n}`, { col, span: Math.max(span, 4), row: 3 }, n * 3 + 2)]),
  ];

  it("rejects three equal blocks of a drawing, a heading and a text side by side", () => {
    const s = composed([...card(0, 1, 4), ...card(1, 5, 4), ...card(2, 9, 4)]);
    expect(has(s, /row of three icon cards/)).toBe(true);
    expect(validateComposition(s).find((i) => /row of three/.test(i.message))).toMatchObject({ code: "banned" });
    const withFacts = composed([...card(0, 1, 4, { fact: true }), ...card(1, 5, 4, { fact: true }), ...card(2, 9, 4, { fact: true })]);
    expect(has(withFacts, /row of three icon cards/)).toBe(true);
  });

  it("allows two blocks, unequal blocks and blocks without a text", () => {
    expect(has(composed([...card(0, 1, 6), ...card(1, 7, 6)]), /row of three/)).toBe(false);
    expect(has(composed([...card(0, 1, 3), ...card(1, 4, 4), ...card(2, 8, 5)]), /row of three/)).toBe(false);
    expect(has(composed([...card(0, 1, 4, { textToo: false }), ...card(1, 5, 4, { textToo: false }), ...card(2, 9, 4, { textToo: false })]), /row of three/)).toBe(false);
  });
});

describe("composition guards: display sizes", () => {
  const big = (id: string, row: number, order: number) => heading(id, { col: 1, span: 8, row }, order, { size: 7, weight: 800 });

  it("allows one display size per section", () => {
    expect(has(composed([big("e_a", 1, 0), big("e_b", 2, 1)]), /one display size/)).toBe(true);
    expect(has(composed([big("e_a", 1, 0), fact("e_f", { col: 9, span: 4, row: 1 }, 1, { size: 7 })]), /one display size/)).toBe(true);
    expect(has(composed([big("e_a", 1, 0), fact("e_f", { col: 9, span: 4, row: 1 }, 1, { size: 6 })]), /one display size/)).toBe(false);
  });

  it("allows two display sizes per page", () => {
    const one = (id: string) => ({ ...composed([big("e_a", 1, 0)]), id }) as ComposedSection;
    const [a, b, c] = [one("s_a"), one("s_b"), one("s_c")];
    expect(has(b, /display sizes per page/, onPage([a, b, c], 1))).toBe(false);
    expect(has(c, /at most 2 display sizes per page \(2 earlier on the page\)/, onPage([a, b, c], 2))).toBe(true);
  });
});

describe("composition guards: photos", () => {
  it("needs every image id to exist in the spec's assets", () => {
    const s = composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 1 }, 2, "img_missing")]);
    expect(has(s, /unknown image img_missing/, { imageIds: new Set(["img_01"]) })).toBe(true);
    expect(has(s, /unknown image/, { imageIds: new Set(["img_missing"]) })).toBe(false);
  });

  it("uses a photo at most twice on a page", () => {
    const three = composed([...base(), photo("e_p2", { col: 1, span: 3, row: 3 }, 3), photo("e_p3", { col: 5, span: 3, row: 3 }, 4)]);
    expect(has(three, /img_01 is used more than 2 times on the page/)).toBe(true);
    expect(validateComposition(three).filter((i) => /used more than/.test(i.message)).map((i) => i.path)).toEqual(["/props/elements/4/image"]);
    const earlier = composed([photo("e_p", { col: 1, span: 4, row: 1 }, 0)]);
    const mine = composed([photo("e_a", { col: 1, span: 4, row: 1 }, 0), photo("e_b", { col: 5, span: 4, row: 1 }, 1, "img_02")]);
    expect(has(mine, /used more than/, onPage([earlier, earlier, mine], 2))).toBe(true);
    expect(has(mine, /used more than/, onPage([earlier, mine], 1))).toBe(false);
  });
});

describe("composition guards: drawings", () => {
  const path24 = (n: number) => Array.from({ length: n }, () => ({ d: "M0 0L10 10", fill: "none", stroke: "text" }));
  const svg = (paths: unknown[]) => ({ width: 40, height: 40, paths });

  it("needs exactly one of motif and svg", () => {
    expect(has(composed([decor("e_d", { col: 1, span: 2, row: 1 }, 0, { motif: undefined })]), /exactly one of motif and svg/)).toBe(true);
    expect(has(composed([decor("e_d", { col: 1, span: 2, row: 1 }, 0, { svg: svg(path24(1)) })]), /exactly one of motif and svg/)).toBe(true);
    expect(has(composed([decor("e_d", { col: 1, span: 2, row: 1 }, 0)]), /exactly one/)).toBe(false);
    expect(has(composed([decor("e_d", { col: 1, span: 2, row: 1 }, 0, { motif: undefined, svg: svg(path24(1)) })]), /exactly one/)).toBe(false);
  });

  it("allows at most 24 paths of allowed characters", () => {
    const drawing = (paths: unknown[]) => composed([decor("e_d", { col: 1, span: 2, row: 1 }, 0, { motif: undefined, svg: svg(paths) })]);
    expect(has(drawing(path24(25)), /at most 24 paths/)).toBe(true);
    expect(has(drawing(path24(24)), /paths/)).toBe(false);
    expect(has(drawing([{ d: "M0 0 <script>", fill: "none" }]), /characters or colours that aren't allowed/)).toBe(true);
    expect(has(drawing([{ d: "M0 0L10 10", fill: "#ff0000" }]), /aren't allowed/)).toBe(true);
  });
});

describe("composition guards: measure", () => {
  it("keeps running text between 4 and 8 columns and repairs by clamping within the grid", () => {
    const at = (col: number, span: number) => composed([text("e_text", { col, span, row: 1 }, 0)], { rows: 1 });
    expect(has(at(1, 3), /spans 4–8 columns/)).toBe(true);
    expect(has(at(1, 9), /spans 4–8 columns on desktop \(e_text spans 9\)/)).toBe(true);
    expect(has(at(1, 4), /spans 4/)).toBe(false);
    expect(has(at(1, 8), /spans 4/)).toBe(false);
    const wide = repairComposition(at(3, 12));
    expect(wide.section.props.elements[0]!.desk).toMatchObject({ col: 3, span: 8 });
    const sliver = repairComposition(at(11, 2));
    expect(sliver.section.props.elements[0]!.desk).toMatchObject({ col: 9, span: 4 });
    expect(sliver.repairs).toEqual(["/props/elements/0/desk: text spans 4 columns (was 2) from column 9"]);
    expect(validateComposition(sliver.section)).toEqual([]);
  });
});

describe("composition guards: uppercase headings", () => {
  const upper = (rest: Record<string, unknown>) => composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0, { case: "uppercase", ...rest })]);

  it("allows uppercase only at weight 700 and size 2 or more", () => {
    expect(has(upper({ weight: 800, size: 3 }), /uppercase/)).toBe(false);
    expect(has(upper({ weight: 600, size: 3 }), /uppercase tracked heading/)).toBe(true);
    expect(has(upper({ weight: 800, size: 1 }), /uppercase tracked heading/)).toBe(true);
    expect(has(upper({ size: 3 }), /uppercase tracked heading/)).toBe(true);
    expect(validateComposition(upper({ weight: 600, size: 3 }))[0]).toMatchObject({ code: "banned" });
  });

  it("repairs by dropping the uppercase", () => {
    const r = repairComposition(upper({ weight: 600, size: 3 }));
    expect(r.repairs).toEqual(["/props/elements/0/case: uppercase dropped (needs weight 700+ and size 2+)"]);
    expect(validateComposition(r.section)).toEqual([]);
  });
});

describe("composition guards in validateSite", () => {
  const withSection = (section: unknown, index = 1): SiteSpec => {
    const spec = golden();
    spec.pages[0]!.sections.splice(index, 0, section as SiteSpec["pages"][number]["sections"][number]);
    return spec;
  };

  it("accepts a clean composed section and leaves the goldens valid", () => {
    const ok = validateSite(withSection(composed(base())));
    expect(ok.ok, JSON.stringify(ok.issues)).toBe(true);
    for (const id of ["pekarna-kvas", "avtoservis-mrak", "kmetija-grabnar"]) expect(validateSite(golden(id)).ok, id).toBe(true);
  });

  it("reports a composed section's issues at its own path, once", () => {
    const bad = composed([...base().slice(0, 2), photo("e_photo", { col: 8, span: 5, row: 1 }, 2, "img_missing")]);
    const v = validateSite(withSection(bad));
    expect(v.ok).toBe(false);
    const unknown = v.issues.filter((i) => /unknown image/.test(i.message));
    expect(unknown).toEqual([{ path: "/pages/0/sections/1/props/elements/2/image", code: "reference", message: "unknown image img_missing" }]);
    const overlap = withSection(composed([heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 2, span: 6, row: 1 }, 1)]));
    expect(validateSite(overlap).issues.map((i) => i.path)).toEqual(["/pages/0/sections/1/props/elements/1/desk"]);
  });

  it("builds the context from the spec", () => {
    const spec = withSection(composed(base()));
    expect(compositionContext(spec, 0, 1)).toMatchObject({ at: "/pages/0/sections/1", hasBookingUrl: false, page: { index: 1 } });
    expect([...compositionContext(spec, 0, 1).imageIds!]).toEqual(["img_01", "img_02", "img_03"]);
  });
});

describe("composedFallback", () => {
  const link = { label: "Več", target: { url: "https://example.si" } };
  const fb = (s: ComposedSection) => composedFallback(s);

  it("makes a hero from the heading, the text, the photo and the actions", () => {
    const s = composed(
      [
        heading("e_h", { col: 1, span: 6, row: 1 }, 0, { text: "Servis vseh znamk v Kranju", level: 1, size: 7 }),
        text("e_t", { col: 1, span: 6, row: 2 }, 1, { paragraphs: ["Popravimo vsako vozilo v enem dnevu."] }),
        action("e_a", { col: 1, span: 3, row: 3 }, 2, { style: "secondary", action: "directions", label: "Pot do nas" }),
        action("e_b", { col: 5, span: 3, row: 3 }, 3, { action: "call", label: "Pokliči" }),
        photo("e_p", { col: 8, span: 5, row: 1, rowSpan: 3 }, 4),
      ],
      { intent: "hero" },
    );
    const out = fb(s)!;
    expect(out).toMatchObject({ id: "s_c", type: "hero-split", variant: "image-right" });
    expect(out.props).toEqual({
      headline: "Servis vseh znamk v Kranju",
      intro: "Popravimo vsako vozilo v enem dnevu.",
      image: "img_01",
      primary: { label: "Pokliči", target: { action: "call" } },
      secondary: { label: "Pot do nas", target: { action: "directions" } },
    });
    expect(Section.safeParse(out).success).toBe(true);
  });

  it("falls back to a type-only hero without a photo, and to the next preset when a text is too long", () => {
    const heroEls = (headline: string, withPhoto: boolean) => [
      heading("e_h", { col: 1, span: 6, row: 1 }, 0, { text: headline, level: 1 }),
      text("e_t", { col: 1, span: 6, row: 2 }, 1, { paragraphs: ["Kratek uvod."] }),
      ...(withPhoto ? [photo("e_p", { col: 8, span: 5, row: 1 }, 2)] : []),
    ];
    expect(fb(composed(heroEls("Servis v Kranju", false), { intent: "hero" }))).toMatchObject({ type: "hero-type", variant: "large" });
    // 80 characters: over hero-split's 70, within hero-type's 90.
    expect(fb(composed(heroEls("x".repeat(80), true), { intent: "hero" }))).toMatchObject({ type: "hero-type" });
    expect(fb(composed(heroEls("x".repeat(95), true), { intent: "hero" }))).toBeNull();
    // A hero without an intro text has nothing to say it with.
    expect(fb(composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0, { level: 1 })], { intent: "hero" }))).toBeNull();
  });

  it("makes a story from the heading, paragraphs and photo", () => {
    const story = composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0, { text: "Naša zgodba" }), text("e_t", { col: 1, span: 6, row: 2 }, 1, { paragraphs: ["Prva.", "Druga."] }), photo("e_p", { col: 8, span: 5, row: 1 }, 2)]);
    expect(fb(story)).toMatchObject({ type: "image-text", variant: "image-right", props: { heading: "Naša zgodba", paragraphs: ["Prva.", "Druga."], image: "img_01" } });
    const noPhoto = composed(story.props.elements.slice(0, 2));
    expect(fb(noPhoto)).toMatchObject({ type: "text", variant: "narrow", props: { heading: "Naša zgodba", paragraphs: ["Prva.", "Druga."] } });
    expect(fb(composed(story.props.elements.slice(0, 1)))).toBeNull();
  });

  it("makes a price list from the prices elements", () => {
    const items = [
      { name: "Hlebec", price: { amount: 3.2 } },
      { name: "Štruca", note: "500 g", price: { amount: 2.5, from: true }, unavailable: true },
    ];
    const s = composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0, { text: "Cenik" }), el("e_p", "prices", { col: 1, span: 8, row: 2 }, { order: 1 }, { items, style: "rows" })], { intent: "prices" });
    const out = fb(s)!;
    expect(out).toMatchObject({ type: "price-list", variant: "table" });
    expect(out.props).toEqual({ title: "Cenik", groups: [{ items }] });
    const plates = composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0, { text: "Cenik" }), el("e_p", "prices", { col: 1, span: 8, row: 2 }, { order: 1 }, { items, style: "plates" })], { intent: "prices" });
    expect(fb(plates)).toMatchObject({ type: "price-list", variant: "tags" });
    expect(fb(composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0)], { intent: "prices" }))).toBeNull();
  });

  it("makes opening hours from the hours element, keeping its style and an intro as the note", () => {
    const s = composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0, { text: "Kdaj smo odprti" }), text("e_t", { col: 1, span: 6, row: 2 }, 1, { paragraphs: ["Ob praznikih zaprto."] }), el("e_o", "hours", { col: 1, span: 6, row: 3 }, { order: 2 }, { style: "week" })], { intent: "hours" });
    expect(fb(s)).toMatchObject({ type: "opening-hours", variant: "week", props: { title: "Kdaj smo odprti", note: "Ob praznikih zaprto." } });
    expect(fb(composed(s.props.elements.slice(0, 2), { intent: "hours" }))).toBeNull();
  });

  it("makes a contact section from the contact element", () => {
    const heads = (show: string[]) => composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0, { text: "Pišite nam" }), el("e_c", "contact", { col: 1, span: 6, row: 2 }, { order: 1 }, { show })], { intent: "contact" });
    expect(fb(heads(["phone", "email"]))).toMatchObject({ type: "contact", variant: "stacked", props: { title: "Pišite nam" } });
    expect(fb(heads(["address", "map"]))).toMatchObject({ type: "contact", variant: "split-map" });
  });

  it("makes a call, a notice and a gallery, and gives up where a preset needs structure it can't find", () => {
    const cta = composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0, { text: "Naročite se" }), action("e_a", { col: 1, span: 3, row: 2 }, 1, { action: "link", link, label: "Več" })], { intent: "call" });
    expect(fb(cta)).toMatchObject({ type: "cta", variant: "band", props: { heading: "Naročite se", primary: { label: "Več", target: link.target } } });
    const gallery = composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0, { text: "Delo" }), photo("e_a", { col: 1, span: 4, row: 2 }, 1, "img_01"), photo("e_b", { col: 5, span: 4, row: 2 }, 2, "img_02")], { intent: "gallery" });
    expect(fb(gallery)).toMatchObject({ type: "gallery", props: { images: [{ image: "img_01" }, { image: "img_02" }] } });
    for (const intent of ["faq", "team", "menu", "steps", "form", "products", "rooms", "collection"]) expect(fb(composed(base(), { intent })), intent).toBeNull();
  });

  it("keeps the section's id and tone", () => {
    const s = { ...composed(base().slice(0, 2)), id: "s_story", tone: "alt" } as ComposedSection;
    expect(fb(s)).toMatchObject({ id: "s_story", tone: "alt", type: "text" });
  });
});
