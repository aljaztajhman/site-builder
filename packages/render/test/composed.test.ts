import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lcpImageFor } from "@sb/components";
import { ComposedProps, ELEMENT_KINDS, migrateSpec, type Page, type Section, type SiteSpec } from "@sb/spec";
import { composedStylesheet, renderPage, sharedBundle } from "../src/index.ts";

/** Composed sections (spec v19) in the rendered page; no browser (the browser checks: tools/eval/test/composed-render.test.ts). */
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;
const base = golden("avtoservis-mrak");
const IMG = base.assets.images[0]!.id;
const IMG2 = base.assets.images[1]!.id;

const desk = (col: number, span: number, row: number, more: object = {}) => ({ col, span, row, ...more });

/** The opener of docs/plans/ai-designer-spec.md §2.2 and the spec's SAMPLE_COMPOSED: a heading, the phone as a plate, a call, a photo, a mark. */
const SAMPLE = {
  intent: "hero",
  width: "wide",
  minHeight: "l",
  rows: 3,
  elements: [
    { id: "e_title", kind: "heading", text: "Servis vseh znamk v Kranju", level: 1, size: 7, weight: 800, measure: "m", desk: desk(1, 7, 1), phone: { order: 0, span: "full" } },
    { id: "e_plate", kind: "fact", value: "041 555 730", label: "Pokličite za termin", treatment: "plate", size: 5, desk: desk(1, 6, 2), phone: { order: 1, span: "full" } },
    { id: "e_call", kind: "action", action: "call", label: "Pokliči", style: "primary", desk: desk(1, 3, 3, { alignY: "start" }), phone: { order: 2, span: "full" } },
    { id: "e_photo", kind: "image", image: IMG, ratio: "4:5", mask: "cut", desk: desk(8, 5, 1, { rowSpan: 3, layer: 1 }), phone: { order: 3, span: "full" } },
    { id: "e_mark", kind: "decor", motif: "plate", desk: desk(11, 2, 3, { layer: 2, shiftY: 1 }), phone: { order: 4, span: "half", hidden: true } },
  ],
} as const;

function sectionOf(props: unknown, id = "s_composed"): Section {
  return { id, type: "composed", variant: "free", props: ComposedProps.parse(props) } as Section;
}

/** The site with `sections` in place of its home page's, rendered. */
function render(sections: Section[], edit: (s: SiteSpec) => void = () => {}): { html: string; spec: SiteSpec; page: Page } {
  const spec = structuredClone(base);
  const page = spec.pages.find((p) => p.kind === "home")!;
  page.sections = sections;
  edit(spec);
  return { html: renderPage(spec, page), spec, page };
}

const sectionHtml = (html: string, id = "s_composed") => new RegExp(`<section id="${id}"[\\s\\S]*?</section>`).exec(html)![0];

/** One element of each kind, at an own place. */
const KINDS: Record<(typeof ELEMENT_KINDS)[number], object> = {
  heading: { kind: "heading", text: "Naslov", level: 2, size: 4, case: "uppercase", rotate: "90" },
  text: { kind: "text", paragraphs: ["Prvi odstavek.", "Drugi odstavek."], size: 1 },
  list: { kind: "list", items: ["Menjava olja", "Zavore"], marker: "dot" },
  fact: { kind: "fact", value: "1998", label: "Odprto od leta", treatment: "seal", size: 4 },
  image: { kind: "image", image: IMG2, ratio: "3:2", mask: "arch", treatment: "duotone" },
  action: { kind: "action", action: "directions", label: "Pot do nas", style: "secondary" },
  hours: { kind: "hours", style: "table" },
  contact: { kind: "contact", show: ["phone", "email", "address", "map"] },
  prices: { kind: "prices", style: "rows", items: [{ name: "Menjava olja", price: { amount: 59 } }, { name: "Pregled", price: { amount: 20, from: true } }] },
  decor: { kind: "decor", svg: { width: 40, height: 20, paths: [{ d: "M0 0L40 20", fill: "none", stroke: "accent", width: 2 }] } },
};

function one(kind: (typeof ELEMENT_KINDS)[number], more: object = {}) {
  return sectionOf({ intent: "story", width: "contained", rows: 1, elements: [{ id: `e_${kind}`, ...KINDS[kind], desk: desk(1, 6, 1), phone: { order: 0, span: "full" }, ...more }] });
}

describe("composed sections render", () => {
  it("the sample opener: grid container, placement as custom properties, no inline colour or style element of its own", () => {
    const { html } = render([sectionOf(SAMPLE)]);
    const s = sectionHtml(html);
    expect(s).toContain('class="s s-composed s-composed--free tone-default cx-w-wide"');
    expect(s).toContain('class="cx cx--mh-l"');
    expect(s).toContain('data-intent="hero"');
    expect(s).toContain("--rows:3");
    // Placement per element: column, span, row, row span, layer, shift, phone order.
    expect(s).toMatch(/<div[^>]*class="cx-el cx-el--image[^"]*"[^>]*style="[^"]*--c:8;--s:5;--r:1;--po:3;--rs:3;--z:1/);
    expect(s).toMatch(/cx-el--decor[^>]*style="[^"]*--sy:1/);
    expect(s).toContain("--fz:var(--cx-fs-7)");
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(s).not.toMatch(/rgb\(|hsl\(/);
    // The page's only <style> is the tokens one, as on every page; no extra one for the section.
    expect((html.match(/<style/g) ?? []).length).toBe(1);
  });

  it("puts the DOM in phone order, whatever the order in the spec", () => {
    const els = [
      { id: "e_c", kind: "text", paragraphs: ["Tretji"], desk: desk(1, 4, 3), phone: { order: 2, span: "full" } },
      { id: "e_a", kind: "heading", text: "Prvi", level: 1, size: 5, desk: desk(1, 4, 1), phone: { order: 0, span: "full" } },
      { id: "e_b", kind: "text", paragraphs: ["Drugi"], desk: desk(5, 4, 1), phone: { order: 1, span: "inset", alignX: "center" } },
    ];
    const s = sectionHtml(render([sectionOf({ intent: "story", width: "contained", rows: 3, elements: els })]).html);
    expect(s.indexOf("Prvi")).toBeLessThan(s.indexOf("Drugi"));
    expect(s.indexOf("Drugi")).toBeLessThan(s.indexOf("Tretji"));
    expect(s).toContain("cx-ps-inset");
    expect(s).toContain('data-pa="center"');
  });

  it("names the section by its first heading in reading order; a section without one is no landmark", () => {
    const { html } = render([sectionOf(SAMPLE)]);
    expect(sectionHtml(html)).toContain('aria-labelledby="s_composed-title"');
    expect(sectionHtml(html)).toContain('<h1 id="s_composed-title"');
    const bare = sectionHtml(render([one("text")]).html);
    expect(bare).not.toContain("aria-labelledby");
  });

  describe("every element kind", () => {
    it("heading: level, size step, case and rotation as classes and attributes", () => {
      const s = sectionHtml(render([one("heading")]).html);
      expect(s).toMatch(/<h2 id="s_composed-title"[^>]*class="cx-el cx-el--heading cx-ps-full cx-h cx-h--uppercase"[^>]*data-sz="4"[^>]*data-rotate="90"/);
      expect(sectionHtml(render([one("heading", { level: 3, size: -1 })]).html)).toContain("--fz:var(--cx-fs-m1)");
      expect(sectionHtml(render([one("heading", { level: 1 })]).html)).toContain("<h1 ");
    });

    it("text: a paragraph each, the lead size as a class", () => {
      const s = sectionHtml(render([one("text")]).html);
      expect(s).toContain("cx-t cx-t--lead");
      expect(s.match(/<p>/g)).toHaveLength(2);
    });

    it("list: a ul with its role and marker", () => {
      const s = sectionHtml(render([one("list")]).html);
      expect(s).toMatch(/<ul[^>]*class="[^"]*cx-l cx-l--dot"[^>]*role="list"/);
      expect(s.match(/<li>/g)).toHaveLength(2);
    });

    it("fact: every treatment, the value and its label", () => {
      for (const treatment of ["numeral", "plate", "stamp", "ticket", "seal", "tag"]) {
        const s = sectionHtml(render([one("fact", { treatment })]).html);
        expect(s, treatment).toContain(`cx-fact--${treatment}`);
        expect(s, treatment).toContain("1998");
        expect(s, treatment).toContain("Odprto od leta");
        expect(s, treatment).toContain("--n:4");
      }
      // The plate is the template motif's own: the EU strip, hidden from assistive technology.
      const plate = sectionHtml(render([one("fact", { treatment: "plate" })]).html);
      expect(plate).toContain('<p class="plate cx-fact__obj"><span class="plate__eu" aria-hidden="true">');
    });

    it("image: Picture with the asset's alt, sizes from the span, ratio, mask and treatment classes", () => {
      // Not the page's first section: its photo is lazy.
      const { html, spec } = render([one("text", { id: "e_t" }), sectionOf(one("image").props, "s_img")]);
      const s = sectionHtml(html, "s_img");
      expect(s).toContain("cx-img cx-r-3-2 cx-mask-arch cx-tr-duotone");
      expect(s).toContain(`alt="${spec.assets.images[1]!.alt}"`);
      // contained, 6 of 12 columns: 36 rem in a 76 rem container, then by the screen, and the phone's full row.
      expect(s).toContain('sizes="(min-width: 76rem) 36rem, (min-width: 64rem) calc((100vw - 4rem) * 6 / 12), calc(100vw - 2rem)"');
      expect(s).toContain('loading="lazy"');
    });

    it("image: every mask and ratio has a class, a missing treatment none", () => {
      for (const mask of ["none", "arch", "circle", "cut", "stamp", "ticket"]) expect(sectionHtml(render([one("image", { mask })]).html)).toContain(`cx-mask-${mask}`);
      for (const [ratio, cls] of [["1:1", "cx-r-1-1"], ["4:5", "cx-r-4-5"], ["16:9", "cx-r-16-9"], ["fill", "cx-r-fill"]] as const) expect(sectionHtml(render([one("image", { ratio })]).html)).toContain(cls);
      expect(sectionHtml(render([one("image", { treatment: "none" })]).html)).not.toContain("cx-tr-");
    });

    it("action: call is a tel link, directions a maps link, book the booking link, link its own target", () => {
      const call = sectionHtml(render([one("action", { action: "call", style: "primary", label: "Pokliči" })]).html);
      expect(call).toMatch(/<a href="tel:\+386[0-9]+"[^>]*class="btn btn--primary"[^>]*>Pokliči<\/a>/);
      const dir = sectionHtml(render([one("action")]).html);
      expect(dir).toMatch(/<a href="https:\/\/www\.google\.com\/maps[^"]*"[^>]*class="btn btn--secondary"[^>]*target="_blank"/);
      expect(dir).toContain("Pot do nas");
      const book = sectionHtml(render([one("action", { action: "book", style: "text", label: "Rezerviraj" })], (s) => void (s.business.bookingUrl = "https://example.com/rezervacija")).html);
      expect(book).toContain('href="https://example.com/rezervacija"');
      expect(book).toContain("text-link");
      const link = sectionHtml(render([one("action", { action: "link", style: "primary", link: { label: "Storitve", target: { page: "p_storitve" } } })]).html);
      expect(link).toContain('href="storitve.html"');
    });

    it("action: a target that depends on a missing fact renders nothing, never a broken link", () => {
      const noPhone = render([one("action", { action: "call", style: "primary" })], (s) => void (s.business.phone = { $placeholder: "phone" }));
      expect(sectionHtml(noPhone.html)).not.toContain("cx-act");
      expect(sectionHtml(render([one("action", { action: "book", style: "primary" })]).html)).not.toContain("<a ");
    });

    it("hours: the table, compact and week styles from business.hours; a placeholder when there are none", () => {
      const table = sectionHtml(render([one("hours")]).html);
      expect(table).toContain('class="oh__table"');
      expect(table).toContain("7.00–16.00");
      expect(sectionHtml(render([one("hours", { style: "compact" })]).html)).toContain("hours__list");
      expect(sectionHtml(render([one("hours", { style: "week" })]).html)).toContain('class="week"');
      const none = sectionHtml(render([one("hours")], (s) => void delete s.business.hours).html);
      expect(none).toContain('data-ph="hours"');
    });

    it("contact: the facts asked for, in order, with placeholders as the contact section shows them", () => {
      const s = sectionHtml(render([one("contact")]).html);
      expect(s).toContain("contact__facts");
      expect(s).toMatch(/Telefon[\s\S]*E-pošta[\s\S]*Naslov[\s\S]*Zemljevid/);
      expect(s).toContain('href="tel:+386');
      const only = sectionHtml(render([one("contact", { show: ["phone"] })]).html);
      expect(only).not.toContain("E-pošta");
      const noAddress = sectionHtml(render([one("contact")], (s) => void (s.business.address = { $placeholder: "address" })).html);
      expect(noAddress).toContain('data-ph="address"');
      expect(noAddress).not.toContain("openInMaps");
      expect(noAddress).not.toContain("google.com/maps");
    });

    it("prices: rows, plates and tags, with the price formats of the preset lists", () => {
      const rows = sectionHtml(render([one("prices")]).html);
      expect(rows).toContain("prices__row");
      expect(rows).toMatch(/59\s€/);
      expect(rows).toMatch(/od\s20\s€/);
      const plates = sectionHtml(render([one("prices", { style: "plates" })]).html);
      expect(plates).toContain("price-tag plate");
      expect(plates).toContain("cx-prices--plates");
      expect(sectionHtml(render([one("prices", { style: "tags" })]).html)).toContain("cx-tag__price");
      const onRequest = sectionHtml(render([one("prices", { items: [{ name: "Popravilo", price: { onRequest: true } }] })]).html);
      expect(onRequest).toContain("price--on-request");
      const placeholder = sectionHtml(render([one("prices", { items: [{ name: "Popravilo", price: { $placeholder: "price" } }] })]).html);
      expect(placeholder).toContain('data-ph="price"');
    });

    it("decor: aria-hidden drawings; a motif from the library or paths in roles only", () => {
      const own = sectionHtml(render([one("decor")]).html);
      expect(own).toContain('<svg viewBox="0 0 40 20" aria-hidden="true" focusable="false">');
      expect(own).toContain("stroke:var(--c-accent)");
      expect(own).toContain("fill:none");
      for (const motif of ["plate", "pipes", "crust", "ledger", "label", "spoon", "mirror", "smile", "trail", "bend"]) {
        const s = sectionHtml(render([one("decor", { motif, svg: undefined })]).html);
        expect(s, motif).toMatch(/<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
        expect(s, motif).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      }
      const band = sectionHtml(render([one("decor", { svg: { width: 8, height: 8, paths: [{ d: "M0 0h8v8z", fill: "band", stroke: "onBand" }] } })]).html);
      expect(band).toContain("fill:var(--c-band, var(--c-primary))");
    });
  });

  describe("phones", () => {
    it("hidden elements carry the class that hides them on phones only; nothing else is hidden", () => {
      const s = sectionHtml(render([sectionOf(SAMPLE)]).html);
      expect(s.match(/cx-nophone/g)).toHaveLength(1);
      expect(s).toMatch(/cx-el--decor cx-ps-half cx-nophone/);
    });
  });

  describe("text over a photo", () => {
    const over = (more: object, text: object = KINDS.text) =>
      sectionOf({
        intent: "story",
        width: "contained",
        rows: 3,
        elements: [
          { id: "e_photo", kind: "image", image: IMG, ratio: "4:3", desk: desk(1, 8, 1, { rowSpan: 3 }), phone: { order: 1, span: "full" } },
          { id: "e_over", ...text, desk: desk(5, 6, 2, more), phone: { order: 0, span: "full" } },
        ],
      });

    it("a text whose rectangle overlaps the photo gets a backing panel; the phone's stack has none of it", () => {
      const s = sectionHtml(render([over({ layer: 2 })]).html);
      expect(s).toMatch(/cx-el--text cx-ps-full cx-over/);
      expect(s).not.toMatch(/cx-el--image[^"]*cx-over/);
    });

    it("text beside the photo, an object with its own ground and a primary button get none", () => {
      const beside = sectionOf({
        intent: "story",
        width: "contained",
        rows: 1,
        elements: [
          { id: "e_photo", kind: "image", image: IMG, ratio: "4:3", desk: desk(1, 5, 1), phone: { order: 1, span: "full" } },
          { id: "e_t", ...KINDS.text, desk: desk(6, 6, 1), phone: { order: 0, span: "full" } },
        ],
      });
      expect(sectionHtml(render([beside]).html)).not.toContain("cx-over");
      expect(sectionHtml(render([over({ layer: 2 }, { ...KINDS.fact, treatment: "plate" })]).html)).not.toContain("cx-over");
      expect(sectionHtml(render([over({ layer: 2 }, { kind: "action", action: "call", label: "Pokliči", style: "primary" })]).html)).not.toContain("cx-over");
      expect(sectionHtml(render([over({ layer: 2 }, { kind: "action", action: "call", label: "Pokliči", style: "secondary" })]).html)).toContain("cx-over");
      expect(sectionHtml(render([over({ layer: 2 }, { ...KINDS.fact, treatment: "numeral" })]).html)).toContain("cx-over");
    });
  });

  describe("the opening photo (LCP)", () => {
    it("composedLcp returns the first image in reading order that phones show, with the sizes the picture renders", () => {
      const s = sectionOf(SAMPLE);
      const lcp = lcpImageFor(s);
      expect(lcp).toEqual({ image: IMG, sizes: "(min-width: 90rem) 35.83rem, (min-width: 64rem) calc((100vw - 4rem) * 5 / 12), calc(100vw - 2rem)" });
      const { html } = render([s]);
      expect(sectionHtml(html)).toContain(`sizes="${lcp!.sizes}"`);
      expect(sectionHtml(html)).toContain('fetchPriority="high"');
      expect(html).toContain(`imageSizes="${lcp!.sizes}"`);
    });

    it("skips an image phones hide; no image, no LCP; only the page's first section loads its photo eagerly", () => {
      const els = [
        { id: "e_h", kind: "image", image: IMG, ratio: "1:1", desk: desk(1, 3, 1), phone: { order: 0, span: "half", hidden: true } },
        { id: "e_s", kind: "image", image: IMG2, ratio: "1:1", desk: desk(4, 3, 1), phone: { order: 1, span: "full" } },
      ];
      expect(lcpImageFor(sectionOf({ intent: "gallery", width: "contained", rows: 1, elements: els }))?.image).toBe(IMG2);
      expect(lcpImageFor(one("text"))).toBeNull();
      const second = render([one("text", { id: "e_t" }), sectionOf({ intent: "gallery", width: "contained", rows: 1, elements: els }, "s_second")]).html;
      expect(sectionHtml(second, "s_second")).not.toContain('fetchPriority="high"');
    });
  });
});

describe("the composed stylesheet", () => {
  it("is linked after the site's stylesheet by a page with a composed section, and by no other page", () => {
    const sheet = composedStylesheet();
    const withComposed = render([sectionOf(SAMPLE)]).html;
    expect(withComposed).toContain(`<link rel="stylesheet" href="../_shared/${sharedBundle().hash}/${sheet.name}"/>`);
    expect(withComposed.indexOf(sheet.name)).toBeGreaterThan(withComposed.indexOf("/site"));
    expect(renderPage(base, base.pages.find((p) => p.kind === "home")!)).not.toContain("composed");
    // A page of the same site without a composed section links none either.
    const { spec } = render([sectionOf(SAMPLE)]);
    expect(renderPage(spec, spec.pages.find((p) => p.id === "p_storitve")!)).not.toContain("composed");
  });

  it("ships in the bundle under its content hash, outside the bundle hash, and obeys the bans every stylesheet obeys", () => {
    const bundle = sharedBundle();
    const sheet = composedStylesheet();
    expect(sheet.name).toMatch(/^composed-[0-9a-f]{10}\.css$/);
    expect(new TextDecoder().decode(bundle.files.get(sheet.name))).toBe(sheet.css);
    expect(sheet.css).not.toMatch(/gradient\(|backdrop-filter|monospace|font-style:italic/);
    expect(sheet.css).toContain(".cx-el");
    // The shared sheets know nothing of it.
    for (const [f, data] of bundle.files) if (/^site(-.*)?\.css$/.test(f)) expect(new TextDecoder().decode(data), f).not.toContain(".cx-");
  });
});
