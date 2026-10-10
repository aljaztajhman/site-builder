import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ComposedProps, ColorRole, MOTIONS, migrateSpec, type Page, type Section, type SiteSpec } from "@sb/spec";
import { COMPOSED_COUNT_ISLAND, composedIslandFiles, composedIslands, composedSheets, composedV2Stylesheet, renderPage, sharedBundle } from "../src/index.ts";

/**
 * Spec v20 extensions of the existing composed kinds (docs/plans/studio-phase1-design.md §1.2, §1.4, §3.1; F1b-R3): Paint,
 * tilt and bleed, the image scrim, and the fact, list, prices, decor, heading and text extensions. No browser here: the
 * HTML hooks and the CSS rules they get; the layout in a browser is the eval harness's (composed-extensions-browser).
 */
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;
const base = golden("avtoservis-mrak");
const IMG = base.assets.images[0]!.id;
const IMG2 = base.assets.images[1]!.id;
const baseline = JSON.parse(readFileSync(new URL("./composed-goldens.json", import.meta.url), "utf8")) as { sharedHash: string };
const v2Source = readFileSync(new URL("../../components/styles/composed-v2.css", import.meta.url), "utf8");
const v2 = () => composedV2Stylesheet().css;
/** The v2 sheet has (or lacks) a fragment: a failure names the fragment, not the whole sheet. */
function cssHas(x: string | RegExp, msg = "") {
  expect(typeof x === "string" ? v2().includes(x) : x.test(v2()), `${msg} ${String(x)}`.trim()).toBe(true);
}
function cssLacks(x: RegExp) {
  expect(x.test(v2()), String(x)).toBe(false);
}

const desk = (col: number, span: number, row: number, more: object = {}) => ({ col, span, row, ...more });
const full = (order: number, more: object = {}) => ({ order, span: "full", ...more });
let n = 0;
const text = (more: object = {}, d: object = desk(1, 6, 1), phone: object = full(0)) => ({ id: `e_t${n++}`, kind: "text", paragraphs: ["Besedilo."], desk: d, phone, ...more });
const fact = (more: object = {}) => ({ id: `e_f${n++}`, kind: "fact", value: "1996", label: "Od leta", treatment: "plate", size: 5, desk: desk(1, 5, 1), phone: full(0), ...more });

function sec(elements: object[], more: object = {}, id = "s_x", tone?: Section["tone"]): Section {
  const props = ComposedProps.parse({ intent: "story", width: "contained", rows: 3, elements, ...more });
  return { id, type: "composed", variant: "free", ...(tone ? { tone } : {}), props } as Section;
}
function render(sections: Section[], edit: (s: SiteSpec) => void = () => {}): { html: string; spec: SiteSpec; page: Page } {
  const spec = structuredClone(base);
  const page = spec.pages.find((p) => p.kind === "home")!;
  page.sections = sections;
  edit(spec);
  return { html: renderPage(spec, page), spec, page };
}
const html = (elements: object[], more: object = {}, edit?: (s: SiteSpec) => void) => render([sec(elements, more)], edit).html;
const classOf = (page: string, kind: string) => new RegExp(`class="([^"]*cx-el--${kind}[^"]*)"`).exec(page)![1]!;

/** Top-level blocks of minified CSS with their at-rule ancestry. */
function walk(css: string, ancestors: string[] = [], out: { prelude: string; body: string; ancestors: string[] }[] = []) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}" && --depth === 0) break;
    }
    const prelude = css.slice(i, open).trim();
    const body = css.slice(open + 1, j);
    out.push({ prelude, body, ancestors });
    if (/^@(media|supports)\b/.test(prelude)) walk(body, [...ancestors, prelude], out);
    i = j + 1;
  }
  return out;
}
/** The at-rule ancestry of every rule whose selector list has `selector`. */
const wrappers = (selector: string) => walk(v2()).filter((b) => !b.prelude.startsWith("@") && b.prelude.split(",").includes(selector)).map((b) => b.ancestors.join(" "));
const DESKTOP = "@media (min-width:64rem)";
const PHONE = "@media (max-width:63.999rem)";

describe("usesV2: every extension links the v2 sheet; none of them in a v19 section does", () => {
  const plainElements = [
    { id: "e_h", kind: "heading", text: "Naslov", level: 2, size: 3, desk: desk(1, 6, 1), phone: full(0) },
    { id: "e_t", kind: "text", paragraphs: ["Besedilo."], desk: desk(1, 6, 2), phone: full(1) },
    { id: "e_l", kind: "list", items: ["Ena", "Dve"], marker: "dot", desk: desk(1, 6, 3), phone: full(2) },
    { id: "e_f", kind: "fact", value: "1996", label: "Od leta", treatment: "seal", size: 4, desk: desk(7, 4, 1), phone: full(3) },
    { id: "e_i", kind: "image", image: IMG, ratio: "4:5", mask: "arch", treatment: "tint", desk: desk(7, 5, 2), phone: full(4) },
    { id: "e_p", kind: "prices", style: "plates", items: [{ name: "Olje", price: { amount: 59 } }], desk: desk(1, 6, 3), phone: full(5) },
    { id: "e_d", kind: "decor", motif: "crust", desk: desk(11, 2, 3), phone: { order: 6, span: "half", hidden: true } },
  ];
  /** The same elements with one field of one element changed. */
  const edit = (id: string, change: object) => plainElements.map((e) => (e.id === id ? { ...e, ...change } : e));
  const place = (id: string, d: object, phone: object = {}) => plainElements.map((e) => (e.id === id ? { ...e, desk: { ...e.desk, ...d }, phone: { ...e.phone, ...phone } } : e));

  it("a v19 section of the same kinds links the core sheet only", () => {
    expect(composedSheets([sec(plainElements)])).toEqual(["core"]);
  });

  const cases: [string, object[]][] = [
    ["tilt", place("e_f", { tilt: 3 })],
    ["bleedX", place("e_i", { bleedX: "end" })],
    ["bleedY", place("e_d", { bleedY: "top" })],
    ["phone span bleed", place("e_i", {}, { span: "bleed" })],
    ["heading color", edit("e_h", { color: "primary" })],
    ["text fill", edit("e_t", { fill: "surface" })],
    ["heading treatment", edit("e_h", { treatment: "stacked" })],
    ["text dropCap", edit("e_t", { dropCap: true })],
    ["list lead", edit("e_l", { items: [{ lead: "2019", text: "Začetek" }] })],
    ["list marker dash", edit("e_l", { marker: "dash" })],
    ["list weight", edit("e_l", { weight: "bold" })],
    ["list size", edit("e_l", { size: 1 })],
    ["fact link", edit("e_f", { link: { action: "call" } })],
    ["fact labelAt", edit("e_f", { labelAt: "before" })],
    ["fact plateCode", edit("e_f", { treatment: "plate", plateCode: true })],
    ["fact count", edit("e_f", { count: true })],
    ["image scrim", edit("e_i", { scrim: { role: "inverse", strength: 2 } })],
    ["image new mask name", edit("e_i", { mask: "diamond" })],
    ["image new treatment name", edit("e_i", { treatment: "posterize" })],
    ["fact new object name", edit("e_f", { treatment: "badge" })],
    ["prices leaders", edit("e_p", { style: "leaders" })],
    ["prices board", edit("e_p", { style: "board" })],
    ["prices docket", edit("e_p", { style: "docket" })],
    ["prices sheet", edit("e_p", { style: "sheet" })],
    ["prices phoneColumns", edit("e_p", { phoneColumns: 2 })],
    ["prices size", edit("e_p", { size: 1 })],
    ["prices plateCode", edit("e_p", { plateCode: true })],
    ["decor drawing", edit("e_d", { motif: undefined, drawing: "motif/bakery/wheat-ear-line" })],
    ["decor fixed", edit("e_d", { fit: "fixed", size: 4 })],
    ["decor repeat", edit("e_d", { motif: undefined, drawing: "ornament/rope-line", repeat: "x" })],
  ];
  for (const [name, elements] of cases) {
    it(`${name}: core and v2`, () => {
      expect(composedSheets([sec(elements)])).toEqual(["core", "v2"]);
    });
  }

  it("a value that adds nothing (tilt 0, weight regular, size 0, mask none, labelAt after) stays on the core sheet", () => {
    const quiet = plainElements.map((e) => {
      if (e.id === "e_l") return { ...e, weight: "regular", size: 0 };
      if (e.id === "e_f") return { ...e, labelAt: "after", desk: { ...e.desk, tilt: 0 } };
      if (e.id === "e_i") return { ...e, mask: "none", treatment: "none" };
      if (e.id === "e_h") return { ...e, treatment: "none" };
      return e;
    });
    expect(composedSheets([sec(quiet)])).toEqual(["core"]);
  });
});

describe("tilt and bleed: desktop only", () => {
  it("tilt is --tilt (degrees) and a class; bleeds are classes; the rules for tilt, bleedX and bleedY are in the desktop media query only", () => {
    const page = html([
      fact({ desk: desk(1, 4, 1, { tilt: -4 }) }),
      { id: "e_i", kind: "image", image: IMG, ratio: "4:5", desk: desk(8, 5, 1, { bleedX: "end" }), phone: full(1) },
      { id: "e_d", kind: "decor", motif: "crust", desk: desk(5, 2, 2, { bleedY: "bottom" }), phone: { order: 2, span: "half", hidden: true } },
    ]);
    expect(classOf(page, "fact")).toContain("cx-tilt");
    expect(page).toMatch(/cx-el--fact[^>]*style="[^"]*--tilt:-4/);
    expect(classOf(page, "image")).toContain("cx-bx-end");
    expect(classOf(page, "decor")).toContain("cx-by-bottom");
    for (const sel of [".cx-tilt", ".cx-bx-start,.cx-bx-both", ".cx-bx-end,.cx-bx-both", ".cx-by-top", ".cx-by-bottom"]) {
      const w = wrappers(sel.split(",")[0]!);
      expect(w.length, sel).toBeGreaterThan(0);
      for (const a of w) expect(a, sel).toBe(DESKTOP);
    }
    // Nothing tilts or bleeds sideways or vertically outside the desktop media query: no such declaration at the top level or on phones.
    for (const b of walk(v2())) {
      if (b.prelude.startsWith("@") || b.ancestors.join(" ") === DESKTOP) continue;
      expect(b.body, b.prelude).not.toMatch(/(^|;)rotate:/);
      if (/cx-b[xy]|cx-tilt/.test(b.prelude)) throw new Error(`${b.prelude} outside the desktop media query`);
    }
  });

  it("the phone bleed is edge to edge on phones only, and a bleed never makes the page scroll sideways (the section clips)", () => {
    const page = html([{ id: "e_i", kind: "image", image: IMG, ratio: "4:3", desk: desk(1, 12, 1), phone: full(0, { span: "bleed" }) }]);
    expect(classOf(page, "image")).toContain("cx-ps-bleed");
    expect(wrappers(".cx-el.cx-ps-bleed")).toEqual([PHONE]);
    cssHas(/\.cx-el\.cx-ps-bleed\{--cx-w:auto;justify-self:stretch;margin-inline:calc\(-1\*var\(--cx-pad\)\)\}/);
    // The core sheet clips the section sideways (.s-composed overflow-x), and a section with a bleed past its edge clips both ways.
    expect(readFileSync(new URL("../../components/styles/composed.css", import.meta.url), "utf8")).toMatch(/\.s-composed \{[^}]*overflow-x: clip/);
    cssHas(/\.s-composed:has\(\.cx-by-top,\.cx-by-bottom\)\{overflow:clip\}/);
    // The room to the page edge follows the section's width: contained 76 rem, wide 90 rem, full none, plus the container's padding.
    cssHas(/\.s-composed\{--cx-mw:76rem;--cx-pad:1rem;--cx-be:calc\(max\(0px,\(100vw - var\(--cx-mw\)\)\/2\) \+ var\(--cx-pad\)\)\}/);
    cssHas(".cx-w-wide{--cx-mw:90rem}");
    cssHas(".cx-w-full{--cx-mw:100vw}");
  });

  it("tilt is no class and no property on an element without one", () => {
    const page = html([fact()]);
    expect(page).not.toContain("--tilt");
    expect(classOf(page, "fact")).not.toMatch(/cx-tilt|cx-b[xy]-/);
  });
});

describe("Paint: color and fill roles", () => {
  it("an element's color is cx-pf cx-fg-<role>, its fill cx-pb cx-bg-<role>; no colour is inline", () => {
    const page = html([
      { id: "e_h", kind: "heading", text: "Naslov", level: 2, size: 3, color: "accent", desk: desk(1, 6, 1), phone: full(0) },
      text({ fill: "inverse", color: "onInverse" }, desk(1, 6, 2), full(1)),
      { id: "e_l", kind: "list", items: ["Ena"], fill: "band", desk: desk(1, 6, 3), phone: full(2) },
    ]);
    expect(classOf(page, "heading")).toContain("cx-pf cx-fg-accent");
    expect(classOf(page, "text")).toContain("cx-pb cx-bg-inverse");
    expect(classOf(page, "text")).toContain("cx-pf cx-fg-onInverse");
    expect(classOf(page, "list")).toContain("cx-pb cx-bg-band");
    for (const m of page.matchAll(/<(?:h2|div|ul)[^>]*cx-el--[a-z]+[^>]*style="([^"]*)"/g)) expect(m[1]).not.toMatch(/color|background|#/);
  });

  it("every colour role has a text rule and a ground rule (with the text role on it), and an own colour comes after the fill's", () => {
    const roles = ColorRole.options;
    expect(roles).toHaveLength(12);
    for (const r of roles) {
      cssHas(new RegExp(`\\.cx-fg-${r}\\{color:var\\(--c-[a-z-]+(,var\\(--c-[a-z-]+\\))?\\)\\}`), r);
      cssHas(new RegExp(`\\.cx-bg-${r}\\{--cx-f:var\\([^;]+;--cx-o:var\\([^}]+\\}`), r);
    }
    expect(v2().indexOf(".cx-pb:where(:not(.cx-fact))")).toBeLessThan(v2().indexOf(".cx-fg-background{"));
  });

  it("an element with its own ground gets no backing panel over a photo (cx-over), one without does", () => {
    const over = (more: object) =>
      html(
        [
          { id: "e_img", kind: "image", image: IMG2, ratio: "fill", desk: desk(1, 12, 1, { rowSpan: 2 }), phone: full(1) },
          { id: "e_h", kind: "heading", text: "Naslov", level: 2, size: 4, desk: desk(2, 6, 1, { layer: 1 }), phone: full(0), ...more },
        ],
        { rows: 2 },
      );
    expect(classOf(over({}), "heading")).toContain("cx-over");
    expect(classOf(over({ fill: "inverse" }), "heading")).not.toContain("cx-over");
    expect(classOf(over({ color: "onInverse" }), "heading")).toContain("cx-over");
  });

  it("a fact paints its object, not its box; the others paint their box", () => {
    cssHas(".cx-pb.cx-fact .cx-fact__obj{background:var(--cx-f);color:var(--cx-o)}");
    cssHas(".cx-pb:where(:not(.cx-fact)){padding:.75rem 1rem;border-radius:var(--radius);background:var(--cx-f);color:var(--cx-o)}");
    cssHas(".cx-fact--plate.cx-fact.cx-pb{--plate-ground:var(--cx-f);--plate-ink:var(--cx-o)}");
  });

  it("hours, contact and prices take Paint too", () => {
    const page = html([
      { id: "e_ho", kind: "hours", style: "table", color: "muted", desk: desk(1, 6, 1), phone: full(0) },
      { id: "e_co", kind: "contact", show: ["phone"], fill: "surface", desk: desk(1, 6, 2), phone: full(1) },
      { id: "e_pr", kind: "prices", style: "rows", items: [{ name: "Olje", price: { amount: 59 } }], color: "primary", desk: desk(1, 6, 3), phone: full(2) },
    ]);
    expect(classOf(page, "hours")).toContain("cx-fg-muted");
    expect(classOf(page, "contact")).toContain("cx-bg-surface");
    expect(classOf(page, "prices")).toContain("cx-fg-primary");
  });
});

describe("image scrim", () => {
  it("is the photo layer's flat scrim over the picture: a role at a strength, hidden from assistive technology", () => {
    const page = html([{ id: "e_i", kind: "image", image: IMG, ratio: "4:3", scrim: { role: "inverse", strength: 3 }, desk: desk(1, 8, 1), phone: full(0) }]);
    expect(page).toMatch(/<span class="cx-scrim cx-scrim-3 cx-ro-inverse" aria-hidden="true"><\/span><\/div>/);
    cssHas(/\.cx-scrim-3\{opacity:0?\.65\}/);
    cssHas(/\.cx-scrim\{position:absolute;inset:0;z-index:1;background:var\(--cx-rc\)/);
    expect(html([{ id: "e_i", kind: "image", image: IMG, ratio: "4:3", desk: desk(1, 8, 1), phone: full(0) }])).not.toContain("cx-scrim");
  });
});

describe("G26: text over an image is painted on top of it", () => {
  it("over-photo text is one half-layer above an element of its own layer, and below the next layer", () => {
    cssHas(".cx-el{z-index:calc(var(--z,0)*2 + 1)}");
    cssHas(".cx-over{z-index:calc(var(--z,0)*2 + 2)}");
    const z = (layer: number, over: boolean) => layer * 2 + (over ? 2 : 1);
    for (const layer of [0, 1, 2, 3]) {
      expect(z(layer, true), `over text above an image of layer ${layer}`).toBeGreaterThan(z(layer, false));
      if (layer < 3) expect(z(layer, true), `over text below layer ${layer + 1}`).toBeLessThan(z(layer + 1, false));
    }
    // And the DOM: the heading comes before the photo in reading order (phone order 0 and 1), both on layer 0, and is marked.
    const page = html([
      { id: "e_h", kind: "heading", text: "Naslov", level: 2, size: 4, desk: desk(2, 6, 1), phone: full(0) },
      { id: "e_img", kind: "image", image: IMG2, ratio: "fill", desk: desk(1, 12, 1, { rowSpan: 2 }), phone: full(1) },
    ]);
    expect(classOf(page, "heading")).toContain("cx-over");
    expect(page.indexOf("cx-el--heading")).toBeLessThan(page.indexOf("cx-el--image"));
  });
});

describe("heading treatment hook and the drop cap", () => {
  it("a treatment is the class cx-tt-<name> (its rules are the inventory's); none is no class", () => {
    const page = html([
      { id: "e_h", kind: "heading", text: "Naslov", level: 2, size: 5, treatment: "stacked", desk: desk(1, 6, 1), phone: full(0) },
      { id: "e_h2", kind: "heading", text: "Drugi", level: 3, size: 3, treatment: "none", desk: desk(1, 6, 2), phone: full(1) },
    ]);
    expect(page).toMatch(/<h2[^>]*class="[^"]*cx-h cx-h--[a-z]+ cx-tt-stacked"|<h2[^>]*class="[^"]*cx-tt-stacked"/);
    expect(page.match(/cx-tt-/g)).toHaveLength(1);
  });
  it("dropCap marks the text, and the first letter of its first paragraph is the rule's", () => {
    const page = html([text({ dropCap: true, paragraphs: ["Prvi odstavek.", "Drugi."] })]);
    expect(classOf(page, "text")).toContain("cx-t--drop");
    cssHas(".cx-t--drop>p:first-child::first-letter{");
  });
});

describe("list: leads, markers, weight, size", () => {
  const list = (more: object) => html([{ id: "e_l", kind: "list", items: ["Ena", "Dve"], desk: desk(1, 6, 1), phone: full(0), ...more }]);

  it("a plain list renders as before: the item text is the li's own", () => {
    const page = list({ marker: "dot" });
    expect(page).toContain('<li>Ena</li><li>Dve</li>');
    expect(classOf(page, "list")).toContain("cx-l cx-l--dot");
    expect(classOf(page, "list")).not.toMatch(/cx-l--leads|cx-lw|cx-ls/);
  });

  it("a lead is a column of its own, the lead then the text, for every item; a plain item of a mixed list spans both", () => {
    const page = list({ items: [{ lead: "2008", text: "Prvi servis" }, "Brez datuma", { lead: "Marec 2019", text: "Nova delavnica" }], marker: "line" });
    expect(classOf(page, "list")).toContain("cx-l--line cx-l--leads");
    expect(page).toContain('<li><span class="cx-l__lead">2008</span> <span class="cx-l__txt">Prvi servis</span></li>');
    expect(page).toContain('<li><span class="cx-l__txt">Brez datuma</span></li>');
    cssHas(".cx-l--leads .cx-l__txt{grid-column:1/-1}");
    cssHas(".cx-l--leads .cx-l__lead + .cx-l__txt{grid-column:2}");
  });

  it("the markers: dash, line (a rail with a dot per item), none and rule", () => {
    for (const m of ["dash", "line", "none", "rule"]) expect(classOf(list({ marker: m }), "list"), m).toContain(`cx-l--${m}`);
    cssHas(/\.cx-l--dash li::before\{content:"";position:absolute;left:0;top:\.8em;width:\.7em;height:2px;background:currentColor\}/);
    cssHas(/\.cx-l--line li:not\(:last-child\)::after\{content:"";position:absolute;/);
    // No accent single-side border anywhere: the rail is a background.
    cssLacks(/border-(left|right|inline-start|inline-end):[^;}]*var\(--c-(primary|accent)/);
  });

  it("a drawing marker is the drawing, hidden from assistive technology, once per item; without a drawing to draw it is the dash", () => {
    const page = list({ marker: "drawing", drawing: "motif/bakery/wheat-ear-line" });
    expect(classOf(page, "list")).toContain("cx-l--drawing");
    expect(page.match(/<svg class="cx-l__mk" viewBox="0 0 40 100" aria-hidden="true" focusable="false">/g)).toHaveLength(2);
    expect(classOf(list({ marker: "drawing", drawing: "ornament/unknown-line" }), "list")).toContain("cx-l--dash");
    expect(list({ marker: "drawing", drawing: "ornament/unknown-line" })).not.toContain("cx-l__mk");
  });

  it("weight and size are classes on the list", () => {
    expect(classOf(list({ weight: "medium", size: 2 }), "list")).toContain("cx-lw-medium cx-ls-2");
    expect(classOf(list({ weight: "regular", size: 0 }), "list")).not.toMatch(/cx-lw|cx-ls/);
    cssHas(".cx-lw-bold{font-weight:700}");
    cssHas(".cx-ls-1{font-size:var(--cx-fs-1)}");
  });
});

describe("fact: link, label order, plate code, count", () => {
  it("a link makes the whole object the link: one a around the object and its label, with the action and a 44 px rule", () => {
    const page = html([fact({ link: { action: "call" }, treatment: "ticket" })]);
    expect(page).toMatch(/<a class="cx-fact__a" href="tel:\+38641555730"><div class="cx-fact__obj"><p class="cx-fact__value">1996<\/p><p class="cx-fact__label">Od leta<\/p><\/div><\/a>/);
    cssHas(/\.cx-fact__a\{display:grid;gap:inherit;justify-items:inherit;align-content:start;min-width:2\.75rem;min-height:2\.75rem;/);
    // The target is 44 px: 2.75 rem.
    expect(2.75 * 16).toBeGreaterThanOrEqual(44);
  });

  it("a link to a page or an address; an external one opens apart; a target that depends on a missing fact is no link", () => {
    const dir = html([fact({ link: { action: "directions" } })]);
    expect(dir).toMatch(/<a class="cx-fact__a" href="https:\/\/www\.google\.com\/maps[^"]*" rel="noopener" target="_blank">/);
    expect(html([fact({ link: { url: "https://example.com/x" } })])).toMatch(/<a class="cx-fact__a" href="https:\/\/example\.com\/x" rel="noopener" target="_blank">/);
    const noPhone = html([fact({ link: { action: "call" } })], {}, (s) => {
      s.business.phone = { $placeholder: "phone" } as never;
    });
    expect(noPhone).not.toContain("cx-fact__a");
    expect(noPhone).toContain('<p class="plate cx-fact__obj">');
    expect(html([fact()])).not.toContain("cx-fact__a");
  });

  it("labelAt before puts the label first (inside the object for stamp, tag, ticket and seal, above it for plate and numeral)", () => {
    const inside = html([fact({ treatment: "stamp", labelAt: "before" })]);
    expect(inside).toMatch(/<div class="cx-fact__obj"><p class="cx-fact__label"[^>]*>Od leta<\/p><p class="cx-fact__value">1996<\/p><\/div>/);
    expect(classOf(inside, "fact")).toContain("cx-fact--lb");
    const outside = html([fact({ treatment: "numeral", labelAt: "before" })]);
    expect(outside).toMatch(/<p class="cx-fact__label">Od leta<\/p><div class="cx-fact__obj"><p class="cx-fact__value">1996<\/p><\/div>/);
    expect(html([fact({ treatment: "numeral" })])).toMatch(/<div class="cx-fact__obj"><p class="cx-fact__value">1996<\/p><\/div><p class="cx-fact__label">Od leta<\/p>/);
  });

  it("plateCode puts the town's registration area on the plate, written by code from the address (none for a town that is no seat)", () => {
    expect(html([fact({ plateCode: true })])).toContain('<span class="plate__num"><span class="plate__code" aria-hidden="true">KR<span class="plate__dot"></span></span>1996</span>');
    expect(html([fact({})])).toContain('<span class="plate__num">1996</span>');
    const town = html([fact({ plateCode: true })], {}, (s) => {
      (s.business.address as { city: string }).city = "Trebnje";
    });
    expect(town).toContain('<span class="plate__num">1996</span>');
    // Only on the plate: another object ignores it.
    expect(html([fact({ treatment: "seal", plateCode: true })])).not.toContain("plate__code");
  });

  it("count: a whole number keeps its final value as text and as the aria-label from the start, with the number to count to", () => {
    const page = html([fact({ treatment: "numeral", count: true, value: "1996" })]);
    expect(page).toContain('<span class="cx-count" data-count="1996" role="img" aria-label="1996">1996</span>');
    // Values with other characters stay still: no count, no island.
    for (const value of ["1.996", "od 35 €", "07.00", "12 let"]) {
      const p = html([fact({ treatment: "numeral", count: true, value })]);
      expect(p, value).not.toContain("cx-count");
      expect(composedIslands(render([sec([fact({ treatment: "numeral", count: true, value })])]).page.sections), value).toEqual([]);
    }
    expect(html([fact({ treatment: "numeral", value: "1996" })])).not.toContain("data-count");
  });
});

describe("the count island", () => {
  const source = readFileSync(new URL("../../components/islands/composed/count.js", import.meta.url), "utf8");

  it("is at most 1 KiB, served at js/composed/count.js after the bundle hash, and linked only by a page with a counting fact", () => {
    expect(Buffer.byteLength(source)).toBeLessThanOrEqual(1024);
    expect(composedIslandFiles()).toContain("count.js");
    expect(COMPOSED_COUNT_ISLAND).toBe("composed/count.js");
    const bundle = sharedBundle();
    expect(new TextDecoder().decode(bundle.files.get("js/composed/count.js"))).toBe(source);
    expect(bundle.hash).toBe(baseline.sharedHash);
    const counting = render([sec([fact({ treatment: "numeral", count: true })])]);
    expect(composedIslands(counting.page.sections)).toEqual([COMPOSED_COUNT_ISLAND]);
    expect(counting.html).toContain(`/js/composed/count.js`);
    const still = render([sec([fact({ treatment: "numeral" })])]);
    expect(composedIslands(still.page.sections)).toEqual([]);
    expect(still.html).not.toContain("count.js");
  });

  it("does nothing under reduced motion or without IntersectionObserver (the final value is the markup), counts once on first view, over at most 1.2 s", () => {
    expect(source).toMatch(/!\("IntersectionObserver" in window\) \|\| matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return/);
    expect(source).toContain("seen.unobserve(e.target)"); // once: unobserved at the first view
    const ms = Number(/\/ (\d+), 1\)/.exec(source)![1]);
    expect(ms).toBeLessThanOrEqual(1200);
    // Only whole numbers: the markup carries data-count for those alone, and the script ignores anything else.
    expect(source).toContain("Number.isInteger(to)");
  });

  it("runs: from 0 to the final value, then the width is released; reduced motion and no observer change nothing", () => {
    const run = (reduced: boolean, observer: boolean) => {
      const el = { text: "1996", style: { minWidth: "" }, offsetWidth: 90, getAttribute: () => "1996", set textContent(v: string) { this.text = v; }, get textContent() { return this.text; } };
      const frames: ((t: number) => void)[] = [];
      let cb: ((e: { isIntersecting: boolean; target: unknown }[]) => void) | undefined;
      class Observer {
        constructor(f: typeof cb) {
          cb = f;
        }
        observe() {}
        unobserve() {}
      }
      const perf = { now: () => 0 };
      const win = observer ? { IntersectionObserver: Observer, performance: perf } : { performance: perf };
      const globals = { matchMedia: () => ({ matches: reduced }), requestAnimationFrame: (f: (t: number) => void) => frames.push(f), document: { querySelectorAll: () => [el] } };
      new Function("window", "IntersectionObserver", ...Object.keys(globals), source)(win, win.IntersectionObserver, ...Object.values(globals));
      cb?.([{ isIntersecting: true, target: el }]);
      const seen: string[] = [];
      for (let t = 0; frames.length && t < 3000; t += 100) {
        frames.shift()!(t);
        seen.push(el.text);
      }
      return { first: seen[0], last: el.text, width: el.style.minWidth, frames: seen.length };
    };
    const ran = run(false, true);
    expect(ran.first).toBe("0");
    expect(ran.last).toBe("1996");
    expect(ran.width).toBe("");
    expect(run(true, true).frames).toBe(0);
    expect(run(false, false).frames).toBe(0);
    expect(run(true, true).last).toBe("1996");
  });
});

describe("prices", () => {
  const items = [{ name: "Menjava olja", price: { amount: 59 } }, { name: "Diagnostika", note: "z izpisom", price: { amount: 35, from: true } }];
  const prices = (more: object) => html([{ id: "e_p", kind: "prices", style: "rows", items, desk: desk(1, 8, 1), phone: full(0), ...more }]);

  it("rows are as before; the new styles are the rows' markup under their own class, with a rule each", () => {
    expect(prices({})).toContain('<div class="prices cx-prices cx-prices--rows">');
    for (const style of ["leaders", "board", "docket", "sheet"]) {
      const page = prices({ style });
      expect(page, style).toContain(`<div class="prices cx-prices cx-prices--${style}"><dl class="prices__dl">`);
      expect(page, style).toContain('<div class="prices__row">');
      cssHas(`.cx-prices--${style}`, style);
    }
    // The leader: an empty pseudo-element between the name and the price, dotted.
    cssHas(/\.cx-prices--leaders \.prices__row::after\{content:"";order:1;flex:1;min-width:1\.5rem;translate:0 -\.25em;border-bottom:2px dotted\}/);
    cssHas(".cx-prices--leaders dd{order:2}");
  });

  it("plates and tags: size, two to a row on phones (phone media query only), the town code on the plate", () => {
    const plates = prices({ style: "plates", size: 2, phoneColumns: 2, plateCode: true });
    // --n: the longest price ("od 35 €": 7 characters) and the town code with its dot (3): the plate's type fits its column.
    expect(plates).toContain('<ul class="price-tags cx-prices cx-prices--plates cx-psz-2 cx-pc2" style="--n:10" role="list">');
    expect(plates.match(/<span class="plate__code" aria-hidden="true">KR<span class="plate__dot"><\/span><\/span>/g)).toHaveLength(2);
    expect(wrappers(".cx-pc2.price-tags")).toEqual([PHONE]);
    cssHas(/\.cx-pc2\.price-tags\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    expect(prices({ style: "tags", phoneColumns: 2 })).toMatch(/cx-prices--tags cx-pc2/);
    expect(prices({ style: "plates" })).not.toContain("plate__code");
    expect(prices({ style: "tags", plateCode: true })).not.toContain("plate__code");
    // Bigger plates and bigger columns for them.
    cssHas(".cx-psz-2{--pf:clamp(2.3rem,1.4rem + 3.2vw,3.6rem)}");
    cssHas(/\.cx-prices--plates \.price-tag\.plate\{font-size:min\(var\(--pf,clamp\([^)]+\)\),calc\(100cqw\/\(var\(--n,8\)\*\.62 \+ 2\.4\)\)\)\}/);
    cssHas(".cx-prices--plates .price-tags__item{container-type:inline-size}");
    // Plates with no extension carry no inline style (v19 markup).
    expect(prices({ style: "plates" })).not.toContain("--n");
    cssHas(".cx-psz-2.price-tags{grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))}");
  });

  it("size 1 and 2 are classes on rows too", () => {
    expect(prices({ size: 1 })).toContain('<div class="prices cx-prices cx-prices--rows cx-psz-1">');
    expect(prices({ size: 0 })).toContain('<div class="prices cx-prices cx-prices--rows">');
  });
});

describe("decor: drawings, a fixed size, strips", () => {
  const decor = (more: object) => html([{ id: "e_d", kind: "decor", desk: desk(1, 3, 1), phone: full(0), ...more }]);

  it("a drawing is drawn inline, hidden from assistive technology, in its own role colours or the element's colour as one ink", () => {
    const page = decor({ drawing: "motif/bakery/wheat-ear-line" });
    expect(page).toMatch(/<svg viewBox="0 0 40 100" aria-hidden="true" focusable="false"><path d="M20 98V28"[^>]*vector-effect="non-scaling-stroke"/);
    expect(page).toContain("stroke:var(--c-text)");
    const inked = decor({ drawing: "motif/bakery/wheat-ear-line", color: "accent" });
    expect(inked).toContain("stroke:var(--c-accent)");
    expect(inked).not.toContain("stroke:var(--c-text)");
    expect(classOf(inked, "decor")).toContain("cx-fg-accent");
    // Strokes keep at least 1.5 px.
    for (const m of page.matchAll(/stroke-width:([\d.]+)/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(1.5);
  });

  it("an id this renderer has no data for draws nothing (the page does not fail); a motif and a custom svg are as before", () => {
    expect(decor({ drawing: "ornament/nothing-line" })).toMatch(/<div[^>]*cx-el--decor[^>]*><\/div>/);
    expect(decor({ motif: "crust" })).toContain("<svg viewBox=\"0 0 74 40\"");
    expect(decor({ svg: { width: 40, height: 20, paths: [{ d: "M0 0L10 10", fill: "none", stroke: "accent", width: 2 }] } })).toContain('viewBox="0 0 40 20"');
  });

  it("fit fixed: size x 2 rem as --sz, never more than 40vw on phones and than its cell on desktop", () => {
    const page = decor({ drawing: "motif/bakery/wheat-ear-line", fit: "fixed", size: 5 });
    expect(classOf(page, "decor")).toContain("cx-decor--fx");
    expect(page).toMatch(/cx-el--decor[^>]*style="[^"]*--sz:5/);
    cssHas(".cx-decor--fx{--cx-w:min(calc(var(--sz)*2rem),40vw)}");
    expect(wrappers(".cx-decor--fx")).toContain(DESKTOP);
    cssHas("@media (min-width:64rem){.cx-decor--fx{--cx-w:min(calc(var(--sz)*2rem),100%)}}");
    expect(decor({ drawing: "motif/bakery/wheat-ear-line" })).not.toContain("--sz");
  });

  it("repeat x: an SVG pattern of the drawing inside one inline svg, as wide as its cell; only a repeating drawing tiles", () => {
    const page = decor({ drawing: "ornament/rope-line", repeat: "x" });
    expect(classOf(page, "decor")).toContain("cx-decor--strip");
    expect(page).toMatch(/<svg class="cx-strip" viewBox="0 0 8000 16" preserveAspectRatio="xMinYMid slice" aria-hidden="true" focusable="false"><defs><pattern id="(cxp\w+)" width="40" height="16" patternUnits="userSpaceOnUse">/);
    expect(page).toMatch(/<rect width="8000" height="16" fill="url\(#cxp\w+\)"><\/rect>/);
    const id = /<pattern id="(\w+)"/.exec(page)![1];
    expect(page.split(`#${id}`)).toHaveLength(2);
    // A drawing that does not repeat draws nothing as a strip.
    expect(decor({ drawing: "motif/bakery/wheat-ear-line", repeat: "x" })).not.toContain("<pattern");
    // Two strips on a page get two ids.
    const two = html([
      { id: "e_a", kind: "decor", drawing: "ornament/rope-line", repeat: "x", desk: desk(1, 12, 1), phone: full(0) },
      { id: "e_b", kind: "decor", drawing: "ornament/rope-line", repeat: "x", desk: desk(1, 12, 2), phone: full(1) },
    ]);
    const ids = [...two.matchAll(/<pattern id="(\w+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("the v2 sheet after the extensions", () => {
  it("keeps its region markers in order, obeys the bans, animates nothing new, and stays within its budget", () => {
    const at = ["section", "kinds", "extensions", "vocab"].map((r) => v2Source.indexOf(`/* region: ${r} */`));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    cssLacks(/gradient\(|backdrop-filter|blur\(|monospace|font-style:italic|border-radius:999|infinite|transition/);
    cssLacks(/border-(left|right|inline-start|inline-end):[^;}]*var\(--c-(primary|accent)/);
    // Every clip-path reads a shape token (the extensions add none); keyframes stay the motion presets'.
    for (const m of v2().matchAll(/clip-path:([^;}]+)/g)) expect(m[1]).toMatch(/^var\(--shape-[a-z]+\)$/);
    expect(v2().match(/@keyframes/g)!.length).toBe(MOTIONS.length + 1);
    expect(Buffer.byteLength(v2())).toBeLessThanOrEqual(16 * 1024);
  });

  it("the extensions leave a v19 composed page byte for byte as it was (no extension class, no second sheet)", () => {
    const page = html([
      { id: "e_h", kind: "heading", text: "Naslov", level: 2, size: 3, desk: desk(1, 6, 1), phone: full(0) },
      fact({ treatment: "seal" }),
      { id: "e_l", kind: "list", items: ["Ena"], marker: "rule", desk: desk(1, 6, 3), phone: full(2) },
    ]);
    expect(page).not.toMatch(/cx-(pf|pb|fg-|bg-|tilt|bx-|by-|tt-|psz|pc2|count|fact__a)|composed-v2/);
  });
});
