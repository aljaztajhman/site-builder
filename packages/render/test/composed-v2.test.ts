import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lcpImageFor } from "@sb/components";
import { ComposedProps, MOTION_META, MOTIONS, Skeleton, migrateSpec, type Page, type Section, type SiteSpec } from "@sb/spec";
import {
  COMPOSED_MOTION_ISLAND,
  composedIslandFiles,
  composedIslands,
  composedSheets,
  composedStylesheet,
  composedV2Stylesheet,
  minifyCss,
  renderPage,
  sharedBundle,
} from "../src/index.ts";

/**
 * Spec v20 composed section level (docs/plans/studio-phase1-design.md §1.3, §3.4): background layers, the top edge and
 * rise, motion, pin, the header over the opener, the LCP photo, and the second composed sheet (composed-v2.css). No
 * browser here: the HTML hooks and the CSS rules they get; the layout in a browser is the eval harness's.
 */
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;
const base = golden("avtoservis-mrak");
const IMG = base.assets.images[0]!.id;
const IMG2 = base.assets.images[1]!.id;
const v2Source = readFileSync(new URL("../../components/styles/composed-v2.css", import.meta.url), "utf8");
const baseline = JSON.parse(readFileSync(new URL("./composed-goldens.json", import.meta.url), "utf8")) as { sharedHash: string };

const desk = (col: number, span: number, row: number, more: object = {}) => ({ col, span, row, ...more });
const ELEMENTS = [
  { id: "e_title", kind: "heading", text: "Servis vseh znamk v Kranju", level: 1, size: 6, desk: desk(1, 6, 1), phone: { order: 0, span: "full" } },
  { id: "e_lead", kind: "text", paragraphs: ["Menjava olja, zavore, diagnostika."], size: 1, desk: desk(1, 6, 2), phone: { order: 1, span: "full" } },
  { id: "e_call", kind: "action", action: "call", label: "Pokliči", style: "primary", desk: desk(1, 3, 3), phone: { order: 2, span: "full" } },
  { id: "e_photo", kind: "image", image: IMG2, ratio: "4:5", desk: desk(8, 5, 1, { rowSpan: 3 }), phone: { order: 3, span: "full" } },
];
const props = (more: object = {}) => ({ intent: "hero", width: "wide", rows: 3, elements: ELEMENTS, ...more });

function sectionOf(p: object, id = "s_v2", tone?: Section["tone"]): Section {
  return { id, type: "composed", variant: "free", ...(tone ? { tone } : {}), props: ComposedProps.parse(p) } as Section;
}
const plain = (id: string) => sectionOf({ intent: "story", width: "contained", rows: 1, elements: [{ id: `e_${id}`, kind: "text", paragraphs: ["Besedilo."], desk: desk(1, 6, 1), phone: { order: 0, span: "full" } }] }, id);

function render(sections: Section[], edit: (s: SiteSpec) => void = () => {}): { html: string; spec: SiteSpec; page: Page } {
  const spec = structuredClone(base);
  const page = spec.pages.find((p) => p.kind === "home")!;
  page.sections = sections;
  edit(spec);
  return { html: renderPage(spec, page), spec, page };
}
const sectionHtml = (html: string, id = "s_v2") => new RegExp(`<section id="${id}"[\\s\\S]*?</section>`).exec(html)![0];
const openTag = (html: string, id = "s_v2") => new RegExp(`<section id="${id}"[^>]*>`).exec(html)![0];
const bodyTag = (html: string) => /<body[^>]*>/.exec(html)![0];
const v2 = () => composedV2Stylesheet().css;
/** The minified v2 sheet has a rule whose selector list contains `selector` (exactly, as one of its selectors). */
const hasRule = (selector: string) => new RegExp(`(^|[{},])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[,{]`).test(v2());

describe("composedSheets: which composed sheets a page links", () => {
  it("none without a composed section, the core sheet for v19 sections, core and v2 once a section uses a v20 feature", () => {
    expect(composedSheets(base.pages.find((p) => p.kind === "home")!.sections)).toEqual([]);
    expect(composedSheets([plain("s_a"), plain("s_b")])).toEqual(["core"]);
    const features: object[] = [
      { background: [{ kind: "field", role: "inverse" }] },
      { background: [{ kind: "photo", image: IMG, scrim: { role: "inverse", strength: 3 } }] },
      { background: [{ kind: "drawing", drawing: "ornament/rope-line", scale: 2, anchor: "end" }] },
      { top: { edge: "torn" } },
      { motion: "reveal" },
      { pin: { col: 1, span: 6 } },
      { headerOver: true },
    ];
    for (const f of features) expect(composedSheets([plain("s_a"), sectionOf(props(f))]), JSON.stringify(f)).toEqual(["core", "v2"]);
    // headerOver: false is no feature.
    expect(composedSheets([sectionOf(props({ headerOver: false }))])).toEqual(["core"]);
  });

  it("are linked in that order after the site's sheet, from the shared bundle", () => {
    const bundle = sharedBundle();
    const core = composedStylesheet().name;
    const two = composedV2Stylesheet().name;
    const v19 = render([plain("s_a")]).html;
    expect(v19).toContain(`href="../_shared/${bundle.hash}/${core}"`);
    expect(v19).not.toContain("composed-v2");
    const html = render([sectionOf(props({ top: { edge: "cut" } })), plain("s_after")]).html;
    expect(html.indexOf("/site")).toBeLessThan(html.indexOf(core));
    expect(html.indexOf(core)).toBeLessThan(html.indexOf(two));
    expect(html).toContain(`<link rel="stylesheet" href="../_shared/${bundle.hash}/${two}"/>`);
  });

  it("the v2 sheet is content-addressed, in the bundle after the hash: the bundle hash is the recorded one", () => {
    const bundle = sharedBundle();
    const sheet = composedV2Stylesheet();
    expect(sheet.name).toMatch(/^composed-v2-[0-9a-f]{10}\.css$/);
    expect(sheet.css).toBe(minifyCss(v2Source));
    expect(new TextDecoder().decode(bundle.files.get(sheet.name))).toBe(sheet.css);
    expect(bundle.hash).toBe(baseline.sharedHash);
    // The shared sheets know nothing of it.
    for (const [f, data] of bundle.files) if (/^site(-.*)?\.css$/.test(f)) expect(new TextDecoder().decode(data), f).not.toContain(".cx-");
  });

  it("keeps each composed sheet within its budget (inventory COMPOSED_SHEET_BUDGET: core and v2 16 KiB, the pair 28 KiB)", () => {
    const core = Buffer.byteLength(composedStylesheet().css);
    const two = Buffer.byteLength(composedV2Stylesheet().css);
    expect(core).toBeLessThanOrEqual(16 * 1024);
    expect(two).toBeLessThanOrEqual(16 * 1024);
    expect(core + two).toBeLessThanOrEqual(28 * 1024);
  });
});

describe("composed-v2.css", () => {
  it("has the four region markers, in order, section first", () => {
    const at = ["section", "kinds", "extensions", "vocab"].map((r) => v2Source.indexOf(`/* region: ${r} */`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("obeys the bans every sheet obeys", () => {
    expect(v2()).not.toMatch(/gradient\(|backdrop-filter|blur\(|monospace|font-style:italic|border-radius:999|infinite/);
    expect(v2()).not.toMatch(/border-(left|right|inline-start|inline-end):[^;}]*var\(--c-(primary|accent)/);
  });

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

  it("reduced motion is still: every animation and keyframes sits inside @supports (animation-timeline) and prefers-reduced-motion: no-preference, and animates only transform, opacity and clip-path", () => {
    const blocks = walk(v2());
    const animated = blocks.filter((b) => b.prelude.startsWith("@keyframes") || (!b.prelude.startsWith("@") && /(^|;)animation(-[a-z]+)?:/.test(b.body)));
    expect(animated.length).toBeGreaterThanOrEqual(4);
    for (const b of animated) {
      expect(b.ancestors.some((a) => /^@supports\s*\(animation-timeline:(view|scroll)\(\)\)/.test(a)), b.prelude).toBe(true);
      expect(b.ancestors.some((a) => a === "@media (prefers-reduced-motion:no-preference)"), b.prelude).toBe(true);
    }
    for (const k of animated.filter((b) => b.prelude.startsWith("@keyframes"))) {
      for (const frame of walk(k.body)) {
        for (const decl of frame.body.split(";").filter(Boolean)) expect(decl.split(":")[0], k.prelude).toMatch(/^(transform|opacity|clip-path)$/);
        // clip-path animates through the shape tokens only.
        for (const m of frame.body.matchAll(/clip-path:([^;]+)/g)) expect(m[1]).toMatch(/^var\(--shape-[a-z]+\)$/);
      }
    }
    // No transitions sneak motion in outside the guards either.
    expect(v2()).not.toMatch(/transition/);
  });

  it("has a rule for every motion preset in MOTIONS, on its targets", () => {
    for (const m of MOTIONS) {
      const block = walk(v2()).find((b) => b.prelude.startsWith(`.cx-mo-${m} `));
      expect(block, m).toBeDefined();
      for (const t of MOTION_META[m].targets) expect(block!.prelude, `${m} ${t}`).toContain(`.cx-el--${t}`);
    }
  });
});

describe("background layers", () => {
  it("field: on the grid's lines, bleeding where it touches the edge, a band over its elements' phone rows, and the text on it takes its ground", () => {
    const { html } = render([plain("s_a"), sectionOf(props({ background: [{ kind: "field", role: "inverse", cols: { from: 1, to: 6 } }] }))]);
    const s = sectionHtml(html);
    expect(openTag(html)).toContain("cx-v2 cx-bgl");
    // The field is the grid's first child, hidden from assistive technology, placed by lines (no colour inline).
    expect(s).toMatch(/<div class="cx cx--mh-none"[^>]*><div class="cx-field cx-ro-inverse cx-fb-s cx-fb-t cx-fb-b cx-fpb-t" style="--fc0:1;--fc1:7;--fr0:1;--fr1:4;--pr0:1;--pr1:4" aria-hidden="true"><\/div>/);
    // Heading, text and the call are inside cols 1–6: wrapped in the field's ground; the photo (cols 8–12) is not.
    expect(s.match(/<div class="cx-on cx-ro-inverse tone-inverse">/g)).toHaveLength(3);
    expect(s).not.toMatch(/cx-on[^>]*><div[^>]*cx-el--image/);
    // A section with a layer has its own container (the layers sit beside it).
    expect(s).toMatch(/<section[^>]*><div class="container"><div class="cx /);
    for (const sel of [".cx-field", ".cx-fb-s", ".cx-fpb-t", ".cx-on", ".cx-ro-inverse", ".cx-bgl .cx"]) expect(hasRule(sel), sel).toBe(true);
  });

  it("field without elements shown on phones is hidden on phones", () => {
    const { html } = render([plain("s_a"), sectionOf(props({ background: [{ kind: "field", role: "surface", cols: { from: 8, to: 12 }, rows: { from: 1, to: 1 } }] }))]);
    expect(sectionHtml(html)).toContain('class="cx-field cx-ro-surface cx-fb-e cx-fb-t cx-nophone" style="--fc0:8;--fc1:13;--fr0:1;--fr1:2"');
  });

  it("photo: behind the container with its alt, the scrim in its role and strength, the treatment class; phones: band by default", () => {
    const { html } = render([plain("s_a"), sectionOf(props({ background: [{ kind: "photo", image: IMG, treatment: "duotone", scrim: { role: "inverse", strength: 3 }, phone: "cover" }] }))]);
    const s = sectionHtml(html);
    expect(openTag(html)).toContain("cx-v2 cx-bgl cx-bgp cx-bgp--cover");
    expect(s).toMatch(/<section[^>]*><div class="cx-bg-photo cx-tr-duotone"><picture class="media media--contained">[\s\S]*?<\/picture><span class="cx-scrim cx-scrim-3 cx-ro-inverse" aria-hidden="true"><\/span><\/div><div class="container">/);
    const alt = base.assets.images[0]!.alt;
    if (alt) expect(s).toContain(`alt="${alt}`);
    // Not the opener: lazy.
    expect(s).toMatch(/cx-bg-photo[\s\S]*?loading="lazy"/);
    expect(openTag(render([plain("s_a"), sectionOf(props({ background: [{ kind: "photo", image: IMG, scrim: { role: "background", strength: 1 } }] }))]).html)).toContain("cx-bgp--band");
    for (const sel of [".cx-bg-photo", ".cx-bg-photo>.media", ".cx-scrim", ".cx-scrim-1", ".cx-scrim-4", ".cx-bgp--band .cx-bg-photo"]) expect(hasRule(sel), sel).toBe(true);
  });

  it("drawing: a decorative hook by its id, anchored and scaled, in its ink (border by default)", () => {
    const { html } = render([plain("s_a"), sectionOf(props({ background: [{ kind: "drawing", drawing: "motif/bakery/wheat-ear-line", scale: 4, anchor: "start" }, { kind: "field", role: "surface" }] }))]);
    const s = sectionHtml(html);
    expect(s).toContain('<div class="cx-bg-art cx-bga-start cx-bgs-4 cx-ro-border" data-drawing="motif/bakery/wheat-ear-line" aria-hidden="true"></div>');
    for (const sel of [".cx-bg-art", ".cx-bgs-4", ".cx-bga-start", ".cx-bga-center", ".cx-bga-end"]) expect(hasRule(sel), sel).toBe(true);
  });
});

describe("top edge and rise", () => {
  it("classes for the edge and the rise, the drawn edge's hook; never on the page's first section", () => {
    const { html } = render([plain("s_a"), sectionOf(props({ top: { edge: "torn", rise: 2 } }))]);
    expect(openTag(html)).toContain("cx-v2 cx-edge-torn cx-rise-2");
    const drawn = render([plain("s_a"), sectionOf(props({ top: { edge: "drawing", drawing: "ornament/rope-line" } }))]).html;
    expect(sectionHtml(drawn)).toMatch(/<section[^>]*><div class="cx-edge-art" data-drawing="ornament\/rope-line" aria-hidden="true"><\/div><div class="container">/);
    const first = render([sectionOf(props({ top: { edge: "cut", rise: 1 } }))]).html;
    expect(openTag(first)).not.toMatch(/cx-edge|cx-rise|cx-v2/);
    for (const sel of [".cx-edge-rule", ".cx-edge-cut", ".cx-edge-torn", ".cx-rise-1", ".cx-rise-2", ".cx-edge-art"]) expect(hasRule(sel), sel).toBe(true);
    // Every edge in the vocabulary but "straight" has its rule; the shape is a --shape- token.
    expect(v2()).toMatch(/\.cx-edge-cut\{--shape-edgecut:polygon\(0 var\(--cx-ed\)/);
    expect(v2()).toContain("clip-path:var(--shape-edgetorn)");
  });

  it("halves the edge depth and the rise on phones", () => {
    expect(v2()).toMatch(/\.cx-edge-cut,\.cx-edge-torn,\.cx-edge-drawing\{--cx-ed:0\.75rem\}/);
    expect(v2()).toMatch(/@media \(min-width:64rem\)\{\.cx-edge-cut,\.cx-edge-torn,\.cx-edge-drawing\{--cx-ed:1\.5rem\}\}/);
    expect(v2()).toMatch(/\.s\.s-composed\.cx-v2\.cx-v2\{--cx-pt:var\(--space-section\);--cx-ru:0\.75rem;/);
    expect(v2()).toMatch(/@media \(min-width:64rem\)\{\.s\.s-composed\.cx-v2\.cx-v2\{--cx-ru:1\.5rem\}\}/);
  });
});

describe("motion", () => {
  it("the preset as a class on the section, never on the opener (G7: neither starter is safe at load); no island for CSS presets", () => {
    for (const m of MOTIONS) {
      const later = render([plain("s_a"), sectionOf(props({ motion: m }))]);
      expect(openTag(later.html), m).toContain(`cx-mo-${m}`);
      expect(composedIslands(later.page.sections)).toEqual([]);
      expect(openTag(render([sectionOf(props({ motion: m }))]).html), m).not.toContain("cx-mo-");
    }
    expect(MOTIONS.every((m) => MOTION_META[m].js === false)).toBe(true);
    expect(composedIslandFiles()).toEqual([]);
    expect(COMPOSED_MOTION_ISLAND).toBe("composed/motion.js");
  });
});

describe("pin", () => {
  it("wraps the run of elements inside its columns in a sticky column (desktop), display: contents on phones", () => {
    const { html } = render([plain("s_a"), sectionOf(props({ pin: { col: 1, span: 6 } }))]);
    const s = sectionHtml(html);
    expect(openTag(html)).toContain("cx-pinned");
    expect(s).toMatch(/<div class="cx-pin" style="--pc:1;--ps:6"><h1[\s\S]*?cx-el--text[\s\S]*?cx-el--action[\s\S]*?<\/a><\/div><\/div><div[^>]*cx-el--image/);
    expect(v2()).toMatch(/\.cx-pin\{position:sticky;top:1\.5rem;/);
    expect(v2()).toMatch(/@media \(max-width:63\.999rem\)\{\.cx-pin\{display:contents\}\}/);
  });

  it("renders no pin when its elements are not one run in reading order", () => {
    const els = ELEMENTS.map((e) => (e.id === "e_photo" ? { ...e, phone: { order: 1, span: "full" } } : e.id === "e_lead" ? { ...e, phone: { order: 3, span: "full" } } : e));
    const { html } = render([plain("s_a"), sectionOf(props({ elements: els, pin: { col: 1, span: 6 } }))]);
    expect(sectionHtml(html)).not.toContain("cx-pin");
  });
});

describe("the header over the opener", () => {
  // A skeleton with the compact header family: the one that is always sticky.
  const sticky = (s: SiteSpec) => {
    s.design.skeleton = Skeleton.parse({
      header: "compact",
      actions: "bar",
      footer: "columns",
      footerTone: "default",
      width: "contained",
      cards: "bordered",
      buttons: "square",
      dividers: "none",
      photoRatio: "standard",
    });
  };
  const noSkeleton = (s: SiteSpec) => {
    delete s.design.skeleton;
  };

  it("body data-hdr=over and the opener's header ground: the photo's scrim role, else a full-width top field, else the tone", () => {
    const photo = render([sectionOf(props({ headerOver: true, background: [{ kind: "photo", image: IMG, scrim: { role: "inverse", strength: 4 } }] }))], noSkeleton).html;
    expect(bodyTag(photo)).toContain('data-hdr="over"');
    expect(openTag(photo)).toContain("cx-hdr0 cx-hg-inverse");
    expect(openTag(photo)).not.toContain("cx-hgp-");
    // The header markup is unchanged: only the body says it is over.
    const plainHtml = render([sectionOf(props({ background: [{ kind: "photo", image: IMG, scrim: { role: "inverse", strength: 4 } }] }))], noSkeleton).html;
    expect(/<header[\s\S]*?<\/header>/.exec(photo)![0]).toBe(/<header[\s\S]*?<\/header>/.exec(plainHtml)![0]);
    expect(bodyTag(plainHtml)).not.toContain("data-hdr");

    const field = render([sectionOf(props({ headerOver: true, background: [{ kind: "field", role: "band", rows: { from: 1, to: 1 } }] }))], noSkeleton).html;
    // Desktop: the field covers the top row edge to edge; phones: the first phone row (the heading) is inside it too.
    expect(openTag(field)).toContain("cx-hg-band");
    const partial = render([sectionOf(props({ headerOver: true, background: [{ kind: "field", role: "band", cols: { from: 1, to: 6 } }] }), "s_v2", "alt")], noSkeleton).html;
    // Desktop: the header spans more than the field, so it sits on the tone (alt: surface); phones: on the field.
    expect(openTag(partial)).toContain("cx-hg-surface cx-hgp-band");
    const tone = render([sectionOf(props({ headerOver: true }), "s_v2", "inverse")], noSkeleton).html;
    expect(openTag(tone)).toContain("cx-hg-inverse");
  });

  it("only on the page's first section", () => {
    const { html } = render([plain("s_a"), sectionOf(props({ headerOver: true }))], noSkeleton);
    expect(bodyTag(html)).not.toContain("data-hdr");
    expect(openTag(html)).not.toContain("cx-hdr0");
  });

  it("a static header (no skeleton) and a sticky one (skeleton compact) both get it; the rules for each", () => {
    const stat = render([sectionOf(props({ headerOver: true }))], noSkeleton).html;
    expect(stat).toMatch(/<header class="site-header site-header--[a-z]+[^"]*"/);
    expect(stat).not.toContain("site-header--sticky");
    const st = render([sectionOf(props({ headerOver: true }))], sticky).html;
    expect(st).toContain("site-header--sticky");
    expect(bodyTag(st)).toContain('data-hdr="over"');
    // Static: positioned in place over the opener; sticky: stays sticky, a solid ground fades in on scroll (guarded).
    expect(v2()).toContain('body[data-hdr="over"] .site-header:not(.site-header--sticky,.site-header--overlay){position:relative}');
    expect(v2()).toMatch(/body\[data-hdr="over"\] \.site-header\{z-index:40;background:transparent;border-bottom-color:transparent;--c-bg:var\(--cx-rc\);/);
    expect(v2()).toMatch(/body\[data-hdr="over"\] \.site-header--sticky::before\{content:"";position:absolute;inset:0;z-index:-1;background:var\(--cx-rc\)/);
    expect(v2()).toMatch(/@supports \(animation-timeline:scroll\(\)\)\{@media \(prefers-reduced-motion:no-preference\)\{@keyframes cx-hdr-solid/);
    // The opener runs up behind the header and pads its content down by as much: the header's room, at every width.
    expect(v2()).toContain(".cx-hdr0{--cx-hx:16rem}");
    expect(v2()).toContain("margin-top:calc(-1 * (var(--cx-ed,0px) + var(--cx-rs,0) * var(--cx-ru) + var(--cx-hx,0px)))");
    // Phones: the ground of the phone layout, and a solid open menu.
    expect(v2()).toMatch(/@media \(max-width:63\.999rem\)\{[^@]*\[data-hdr="over"\]:has\(\.cx-hgp-band\)\{--cx-rc:var\(--c-band,var\(--c-primary\)\)/);
    expect(v2()).toContain('body[data-hdr="over"] .site-header .site-nav{margin-inline:-1rem;padding-inline:1rem;background:var(--c-bg)}');
    // Every role has a ground rule on both widths.
    for (const r of ComposedProps.shape.background.unwrap().element.options[0].shape.role.options) {
      expect(hasRule(`[data-hdr="over"]:has(.cx-hg-${r})`), r).toBe(true);
      expect(hasRule(`[data-hdr="over"]:has(.cx-hgp-${r})`), r).toBe(true);
      expect(hasRule(`.cx-ro-${r}`), r).toBe(true);
    }
  });
});

describe("LCP", () => {
  it("a background photo in the opener is the page's LCP: preloaded, eager, high priority; the image element is then lazy", () => {
    const opener = sectionOf(props({ background: [{ kind: "photo", image: IMG, scrim: { role: "inverse", strength: 2 } }] }));
    expect(lcpImageFor(opener)).toEqual({ image: IMG, sizes: "100vw" });
    const { html } = render([opener]);
    const s = sectionHtml(html);
    expect(s).toMatch(/cx-bg-photo[\s\S]*?loading="eager"[^>]*fetchPriority="high"|cx-bg-photo[\s\S]*?fetchpriority="high"/i);
    expect(s).toMatch(/cx-el--image[\s\S]*?loading="lazy"/);
    expect(html).toMatch(/<link rel="preload" as="image"[^>]*imageSizes="100vw"[^>]*fetchPriority="high"/i);
    // Without a photo layer, the first image element stays the LCP, as in v19.
    expect(lcpImageFor(sectionOf(props()))?.image).toBe(IMG2);
  });
});

describe("v19 sections are untouched", () => {
  it("a section without v20 features renders without any v20 class or wrapper", () => {
    const s = sectionHtml(render([sectionOf(props())]).html);
    expect(s).not.toMatch(/cx-v2|cx-bg|cx-edge|cx-mo-|cx-pin|cx-hdr0|cx-on\b|cx-field/);
    expect(s).toMatch(/<section[^>]*><div class="container"><div class="cx /);
  });
});
