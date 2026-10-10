import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lcpImageFor } from "@sb/components";
import { ComposedProps, migrateSpec, type Page, type Section, type SiteSpec } from "@sb/spec";
import { COMPOSED_RIBBON_ISLAND, composedIslandFiles, composedIslands, composedSheets, composedV2Stylesheet, renderPage, sharedBundle } from "../src/index.ts";

/**
 * Spec v20 element kinds (docs/plans/studio-phase1-design.md §1.5, §3.1, §3.4; F1b-R2): photos, wordmark, ribbon,
 * sticker, map, iconFacts, quote and the Drawing hooks. The HTML each renders, its classes and a11y attributes, the v2
 * sheet link, the LCP of photos and the marquee island. The layout in a browser is the eval harness's.
 */
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;
const base = golden("avtoservis-mrak");
const [IMG1, IMG2, IMG3] = base.assets.images.map((i) => i.id);
const desk = (col: number, span: number, row: number, more: object = {}) => ({ col, span, row, ...more });
const heading = { id: "e_title", kind: "heading", text: "Pri nas", level: 2, size: 4, desk: desk(1, 6, 1), phone: { order: 0, span: "full" } };

function sectionOf(el: object, more: object = {}, id = "s_k"): Section {
  return { id, type: "composed", variant: "free", props: ComposedProps.parse({ intent: "story", width: "wide", rows: 2, elements: [heading, el], ...more }) } as Section;
}
const at = (el: object) => ({ id: "e_k", desk: desk(1, 6, 2), phone: { order: 1, span: "full" }, ...el });

function render(sections: Section[], edit: (s: SiteSpec) => void = () => {}): string {
  const spec = structuredClone(base);
  const page = spec.pages.find((p) => p.kind === "home")! as Page;
  page.sections = sections;
  edit(spec);
  return renderPage(spec, page);
}
/** The element's own markup (the e_k element, from its tag to the section's end). */
const el = (html: string) => /<section id="s_k"[\s\S]*?<\/section>/.exec(html)![0];

describe("v2 kinds link the v2 sheet", () => {
  const kinds: object[] = [
    { kind: "photos", images: [IMG1, IMG2], arrangement: "offset-pair" },
    { kind: "wordmark", size: 5 },
    { kind: "ribbon", items: ["Kruh", "Pecivo"] },
    { kind: "sticker", text: "Odprto tudi ob nedeljah", shape: "round" },
    { kind: "map", style: "street" },
    { kind: "iconFacts", items: [{ fact: "parking" }] },
    { kind: "quote", text: "Najboljši burek v mestu." },
  ];
  it.each(kinds)("%o", (k) => {
    const s = sectionOf(at(k));
    expect(composedSheets([s])).toEqual(["core", "v2"]);
    expect(render([s])).toContain(composedV2Stylesheet().name);
  });
});

describe("photos", () => {
  it("piled (fan, stack, offset-pair): frames in one box, the first on top, captions as a list; masks and treatments", () => {
    const h = el(render([sectionOf(at({ kind: "photos", images: [IMG1, IMG2, IMG3], arrangement: "fan", mask: "arch", treatment: "duotone", captions: ["Delavnica", "Dvigalo"] }))]));
    expect(h).toMatch(/class="cx-el cx-el--photos cx-ps-full cx-ph cx-ph--fan"/);
    expect(h).toContain("--n:3");
    expect(h.match(/class="cx-img cx-ph__f cx-mask-arch cx-tr-duotone"/g)).toHaveLength(3);
    // The fan opens from the middle: the first photo centred (on top), then left, then right.
    expect(h).toMatch(/style="--i:0;--o:0"[\s\S]*style="--i:1;--o:-1"[\s\S]*style="--i:2;--o:1"/);
    expect(h).toMatch(/<ul class="cx-ph__caps" role="list"><li>Delavnica<\/li><li>Dvigalo<\/li><\/ul>/);
    // An offset pair shows two.
    const pair = el(render([sectionOf(at({ kind: "photos", images: [IMG1, IMG2, IMG3], arrangement: "offset-pair" }))]));
    expect(pair.match(/cx-ph__f/g)).toHaveLength(2);
  });

  it("strip: a focusable, labelled region that scrolls inside itself, each photo a figure with its caption", () => {
    const h = el(render([sectionOf(at({ kind: "photos", images: [IMG1, IMG2, IMG3], arrangement: "strip", captions: ["Ena", "Dve"] }))]));
    expect(h).toMatch(/<div class="cx-ph__row" role="region" aria-label="Fotografije" tabindex="0">/);
    expect(h.match(/<figure class="cx-ph__fig">/g)).toHaveLength(3);
    expect(h).toContain('<figcaption class="cx-ph__cap">Ena</figcaption>');
    expect(composedV2Stylesheet().css).toMatch(/\.cx-ph__row\{[^}]*overflow-x:auto[^}]*scroll-snap-type:x mandatory/);
  });

  it("before-after: two figures labelled Prej and Potem (UI words) before the client's captions", () => {
    const h = el(render([sectionOf(at({ kind: "photos", images: [IMG1, IMG2], arrangement: "before-after", captions: ["Stara streha", "Nova streha"] }))]));
    expect(h).toContain('<figcaption class="cx-ph__cap"><span class="cx-ph__ba">Prej</span>Stara streha</figcaption>');
    expect(h).toContain('<figcaption class="cx-ph__cap"><span class="cx-ph__ba">Potem</span>Nova streha</figcaption>');
  });

  it("in the opener, its first photo is the page's LCP: preloaded with the sizes it renders, eager and high priority", () => {
    const s = sectionOf(at({ kind: "photos", images: [IMG2, IMG3], arrangement: "strip" }));
    const lcp = lcpImageFor(s)!;
    expect(lcp.image).toBe(IMG2);
    expect(lcp.sizes).toBe("(min-width: 90rem) 17.2rem, (min-width: 64rem) calc((100vw - 4rem) * 2.4 / 12), calc((100vw - 2rem) * 0.8)");
    const html = render([s]);
    expect(html).toMatch(/<link rel="preload" as="image"[^>]*imageSizes="\(min-width: 90rem\) 17.2rem/);
    const imgs = [...el(html).matchAll(/<img [^>]*>/g)].map((m) => m[0]);
    expect(imgs[0]).toContain('loading="eager"');
    expect(imgs[0]).toContain('fetchPriority="high"');
    expect(imgs[1]).toContain('loading="lazy"');
  });

  it("an image before it in reading order stays the LCP", () => {
    const s = sectionOf(at({ kind: "photos", images: [IMG2, IMG3], arrangement: "stack" }), {
      elements: [heading, { id: "e_img", kind: "image", image: IMG1, ratio: "4:3", desk: desk(7, 6, 1), phone: { order: 0, span: "full" } }, at({ kind: "photos", images: [IMG2, IMG3], arrangement: "stack" })],
    });
    expect(lcpImageFor(s)!.image).toBe(IMG1);
  });
});

describe("wordmark", () => {
  it("the business name as type, in its size step and style (plain without design.wordmark), not a heading", () => {
    const h = el(render([sectionOf(at({ kind: "wordmark", size: 6 }))]));
    expect(h).toMatch(new RegExp(`<p class="cx-el cx-el--wordmark cx-ps-full cx-wm wm-plain" style="[^"]*--fz:var\\(--cx-fs-6\\)[^"]*"[^>]*>${base.business.name}</p>`));
    const text = el(render([sectionOf(at({ kind: "wordmark", size: 3 }))], (s) => void (s.design.wordmark = { style: "plain", role: "text" })));
    expect(text).toContain("cx-wm wm-plain cx-wm--text");
  });
});

describe("ribbon", () => {
  it("still: the items between separators (hidden from screen readers, a space between words), no track, no button", () => {
    const h = el(render([sectionOf(at({ kind: "ribbon", items: ["Kruh", "Pecivo", "Kava"] }))]));
    expect(h).toContain("cx-rb cx-rb--still");
    expect(h).toMatch(/<p class="cx-rb__t"><span class="cx-rb__i">Kruh<\/span> <span class="cx-rb__s" aria-hidden="true"><svg class="cx-rb__sep"/);
    expect(h.match(/cx-rb__s"/g)).toHaveLength(2);
    expect(h).not.toContain("cx-rb__track");
    expect(h).not.toContain("<button");
    expect(composedIslands([sectionOf(at({ kind: "ribbon", items: ["Kruh"] }))])).toEqual([]);
  });

  it("a separator drawing by its id, in the ribbon's colour", () => {
    const h = el(render([sectionOf(at({ kind: "ribbon", items: ["Kruh", "Pecivo"], separator: "motif/bakery/wheat-ear-line" }))]));
    expect(h).toMatch(/<svg class="cx-dw cx-dw--line cx-rb__sep" viewBox="0 0 60 120" aria-hidden="true" focusable="false"><path d="M30 116/);
    expect(h).toContain("stroke:currentColor");
  });

  it("drift: a track of copies hidden from screen readers next to the static row; scroll-linked in the sheet", () => {
    const h = el(render([sectionOf(at({ kind: "ribbon", items: ["Kruh", "Pecivo"], move: "drift" }))]));
    expect(h).toMatch(/<p class="cx-rb__t">/);
    expect(h).toMatch(/<div class="cx-rb__track" aria-hidden="true"><span class="cx-rb__run">/);
    expect(h).toMatch(/--rb-n:\d+/);
    expect(h).not.toContain("<button");
    expect(composedV2Stylesheet().css).toMatch(/@supports \(animation-timeline:scroll\(\)\)\{@media \(prefers-reduced-motion:no-preference\)\{@keyframes cx-rb-loop[\s\S]*\.cx-rb--drift \.cx-rb__track\{animation:cx-rb-drift linear both;animation-timeline:view\(\)\}/);
  });

  it("loop: a pause button (hidden until the island runs, aria-pressed, a fixed Slovene label) and the ribbon island; pauses on hover, focus, off screen", () => {
    const s = sectionOf(at({ kind: "ribbon", items: ["Kruh", "Pecivo"], move: "loop" }));
    const html = render([s]);
    const h = el(html);
    expect(h).toContain("data-cx-loop");
    expect(h).toContain('<button type="button" class="cx-rb__btn" aria-pressed="false" hidden="">Ustavi premikanje</button>');
    // The island toggles aria-pressed only, never the label.
    const island = readFileSync(new URL("../../components/islands/composed/ribbon.js", import.meta.url), "utf8");
    expect(island).toContain('setAttribute("aria-pressed"');
    expect(island).not.toMatch(/textContent|innerText/);
    expect(composedIslands([s])).toEqual([COMPOSED_RIBBON_ISLAND]);
    expect(composedIslandFiles()).toContain("ribbon.js");
    expect(sharedBundle().files.has(`js/${COMPOSED_RIBBON_ISLAND}`)).toBe(true);
    expect(html).toMatch(new RegExp(`<script src="[^"]*/js/${COMPOSED_RIBBON_ISLAND}" defer="">`));
    const css = composedV2Stylesheet().css;
    expect(css).toContain(".cx-rb--loop:is(:hover,:focus-within,.is-off,.is-paused) .cx-rb__track{animation-play-state:paused}");
    // The button is a 44 px target.
    expect(css).toMatch(/\.cx-rb\{[^}]*min-height:2\.75rem/);
    expect(css).toMatch(/\.cx-rb__btn\{[^}]*inset-block:0[^}]*min-width:2\.75rem/);
  });
});

describe("sticker", () => {
  it("a label in its shape, its length as --n, its tilt; turned on desktop only", () => {
    const h = el(render([sectionOf(at({ kind: "sticker", text: "Sveže vsak dan", shape: "tag", desk: desk(1, 3, 2, { tilt: 5 }) }))]));
    expect(h).toMatch(/<p class="cx-el cx-el--sticker cx-ps-full cx-sk cx-sk--tag" style="[^"]*--n:14;--tilt:5"[^>]*><span class="cx-sk__t">Sveže vsak dan<\/span><\/p>/);
    expect(composedV2Stylesheet().css).toMatch(/@media \(min-width:64rem\)\{\.cx-sk\{rotate:calc\(var\(--tilt,-4\) \* 1deg\)\}\}/);
  });
});

describe("map", () => {
  it("the drawing as one labelled image with the street and the cross street; address, note and the directions button under it", () => {
    const h = el(render([sectionOf(at({ kind: "map", style: "corner", cross: "Vogal s Prešernovo", note: "Vhod z dvorišča." }))]));
    const street = (base.business.address as { street: string }).street.replace(/\s+\d+\s*[a-zA-Z]?$/, "");
    expect(h).toContain(`<div class="cx-map__art" role="img" aria-label="Shema poti: ${street}, Vogal s Prešernovo">`);
    expect(h).toMatch(/<svg viewBox="0 0 320 200"[^>]*aria-hidden="true"/);
    expect(h.match(/<path class="cx-map__road/g)).toHaveLength(2);
    expect(h).toContain(`<span class="cx-map__l" style="--lx:1;--ly:40">${street}</span>`);
    expect(h).toContain("<address>");
    expect(h).toContain('<p class="cx-map__note">Vhod z dvorišča.</p>');
    expect(h).toMatch(/<a href="https:\/\/[^"]+" data-action="directions" class="btn btn--secondary cx-map__go" rel="noopener" target="_blank">Navodila za pot<\/a>/);
  });

  it("no address: the placeholder and no link, no street name", () => {
    const h = el(render([sectionOf(at({ kind: "map", style: "pin" }))], (s) => void (s.business.address = { $placeholder: "address" })));
    expect(h).not.toContain("cx-map__l");
    expect(h).not.toContain('data-action="directions"');
    expect(h).toContain('aria-label="Shema poti"');
  });
});

describe("iconFacts", () => {
  it("a list of icon + label (+ the client's note); two a row on phones only when every label is short and there are no notes", () => {
    const h = el(render([sectionOf(at({ kind: "iconFacts", items: [{ fact: "parking" }, { fact: "wifi" }, { fact: "lift" }] }))]));
    expect(h).toMatch(/<ul class="cx-el cx-el--iconFacts cx-ps-full cx-if cx-if--line cx-if--2"[^>]*role="list">/);
    expect(h).toMatch(/<li class="cx-if__i" data-fact="parking"><svg class="cx-if__ic" viewBox="0 0 24 24"[^>]*aria-hidden="true" focusable="false">[\s\S]*?<\/svg><span class="cx-if__l">Parkirišče<\/span><\/li>/);
    const long = el(render([sectionOf(at({ kind: "iconFacts", items: [{ fact: "wheelchair" }, { fact: "terrace", note: "Odprta od maja." }] }))]));
    expect(long).not.toContain("cx-if--2");
    expect(long).toContain('<span class="cx-if__n">Odprta od maja.</span>');
  });

  it("each placeholder icon stays under 1 KiB", () => {
    const h = el(render([sectionOf(at({ kind: "iconFacts", items: ["parking", "card", "wifi", "wheelchair", "terrace", "takeaway", "lift"].map((fact) => ({ fact })) }))]));
    for (const svg of h.match(/<svg class="cx-if__ic"[\s\S]*?<\/svg>/g)!) expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(1024);
  });
});

describe("quote", () => {
  it("a figure: the words verbatim in Slovene quotation marks, the opening one hanging, the speaker after an en dash; no lang on the source locale", () => {
    const h = el(render([sectionOf(at({ kind: "quote", text: "Avto je bil pripravljen še isti dan.", by: "Marko", size: 4 }))]));
    expect(h).toMatch(/<figure class="cx-el cx-el--quote cx-ps-full cx-q" style="[^"]*--fz:var\(--cx-fs-6\)[^"]*"[^>]*data-sz="4">/);
    expect(h).toContain('<blockquote class="cx-q__b"><p class="cx-q__t"><span class="cx-q__o">„</span>Avto je bil pripravljen še isti dan.“</p></blockquote>');
    expect(h).toContain('<figcaption class="cx-q__by"><span aria-hidden="true">– </span>Marko</figcaption>');
    expect(h).not.toContain("—");
    // No bar beside the quote (banned accent single-side border).
    expect(composedV2Stylesheet().css).not.toMatch(/\.cx-q[^{]*\{[^}]*border/);
  });
});

describe("drawings in the R1 hooks", () => {
  it("a background drawing layer and a drawn top edge render the drawing's SVG in their ink; the edge tiles as a strip", () => {
    const html = render([
      sectionOf(at({ kind: "quote", text: "Besedilo." }), {}, "s_first"),
      sectionOf(at({ kind: "quote", text: "Besedilo." }), { background: [{ kind: "drawing", drawing: "motif/bakery/wheat-ear-line", scale: 2, anchor: "end" }], top: { edge: "drawing", drawing: "ornament/rope-line" } }),
    ]);
    const h = el(html);
    expect(h).toMatch(/<div class="cx-bg-art cx-bga-end cx-bgs-2 cx-ro-border" data-drawing="motif\/bakery\/wheat-ear-line" aria-hidden="true"><svg class="cx-dw cx-dw--line" viewBox="0 0 60 120"/);
    expect(h).toMatch(/vector-effect:non-scaling-stroke/);
    expect(h).toMatch(/<div class="cx-edge-art" data-drawing="ornament\/rope-line" aria-hidden="true"><svg class="cx-dw cx-dw--line" viewBox="0 0 2880 12" preserveAspectRatio="xMinYMid slice"[^>]*><defs><pattern id="cxd[A-Za-z0-9_-]+" width="8" height="12" patternUnits="userSpaceOnUse">/);
    expect(h).toMatch(/<rect width="2880" height="12" fill="url\(#cxd[A-Za-z0-9_-]+\)"><\/rect>/);
  });

  it("an unknown drawing id draws nothing in its hook", () => {
    const h = el(render([sectionOf(at({ kind: "quote", text: "Besedilo." }), { background: [{ kind: "drawing", drawing: "ornament/unknown-line", scale: 1, anchor: "start" }] })]));
    expect(h).toMatch(/data-drawing="ornament\/unknown-line" aria-hidden="true"><\/div>/);
  });
});
