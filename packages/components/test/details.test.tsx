import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ComposedProps, type Page, type Section, type SiteSpec, type Skeleton } from "@sb/spec";
import { AiCaption, ActionLink, Picture, Section as SectionBox, aiCaptionSection, detailsClass } from "../src/primitives/index.tsx";
import { Header } from "../src/chrome/index.tsx";
import { anchorLabel } from "../src/chrome/Header.tsx";
import { Composed } from "../src/groups/composed/index.tsx";
import type { RenderCtx, RenderDetails } from "../src/types.ts";
import { FULL_BUSINESS, SPARSE_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

/**
 * M1 type and details proof, piece A (docs/plans/m1-type-details.md): five render-time switches behind
 * RenderOptions.details, each off by default. The browser checks at 360 and 1280 px are details-browser.test.ts.
 */
const ALL: RenderDetails = { cta: true, header: true, aiCaption: true, fit: true, scale: true };
const withDetails = (ctx: RenderCtx, details: RenderDetails = ALL): RenderCtx => ({ ...ctx, details });
const css = readFileSync(new URL("../styles/details.css", import.meta.url), "utf8");

type Composed = Section & { type: "composed" };
const composed = (id: string, props: object): Composed =>
  ({ id, type: "composed", variant: "free", props: ComposedProps.parse({ intent: "hero", width: "full", rows: 2, ...props }) }) as unknown as Composed;
const heading = (text: string, more: object = {}) => ({ id: "e_h", kind: "heading", text, level: 1, size: 7, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" }, ...more });
const action = (id: string, act: string, style: string, order = 1) => ({ id, kind: "action", action: act, label: act === "call" ? "Pokličite" : "Rezervirajte", style, desk: { col: 1, span: 4, row: 2 }, phone: { order, span: "full" } });
const imageEl = (id: string, image: string) => ({ id, kind: "image", image, ratio: "1:1", desk: { col: 7, span: 6, row: 1 }, phone: { order: 2, span: "full" } });

/** A site whose images are generated (origin), with the given home sections and pages. */
function site(sections: Section[], more: Partial<SiteSpec> = {}): SiteSpec {
  const s = testSpec(more);
  s.assets.images = s.assets.images.map((i) => (i.id === "img_salon" ? i : { ...i, origin: "generated" as const }));
  s.pages = [{ ...s.pages[0]!, sections: sections as never }, ...s.pages.slice(1)];
  return s;
}
const SKELETON: Skeleton = { header: "stacked", actions: "bar", footer: "visit", footerTone: "default", width: "contained", cards: "bordered", buttons: "soft", dividers: "none", photoRatio: "standard" };
/** One page in the menu (the proof pages): the others are hidden from it. */
const onePage = (s: SiteSpec): SiteSpec => ({ ...s, pages: s.pages.map((p, i) => (i === 0 ? p : { ...p, nav: { ...p.nav, show: false } })) as Page[] });

describe("detailsClass (the <html> class list that scopes details.css)", () => {
  it("names each switch that is on, and nothing when none is", () => {
    expect(detailsClass(undefined)).toBe("");
    expect(detailsClass({})).toBe("");
    expect(detailsClass({ cta: false, fit: false })).toBe("");
    expect(detailsClass(ALL)).toBe("dt-cta dt-header dt-ai-caption dt-fit dt-scale");
    expect(detailsClass({ scale: true })).toBe("dt-scale");
  });

  it("scopes every rule of details.css to one of those classes", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{/g) ?? [];
    const selectors = rules.map((r) => r.slice(0, -1).trim()).filter((r) => !r.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(10);
    for (const s of selectors) for (const one of s.split(/,(?![^(]*\))/)) expect(one, one).toMatch(/\.dt-(cta|header|ai-caption|fit|scale)\b/);
  });
});

describe("cta: the call is a real button", () => {
  const link = { label: "Pokličite", target: { action: "call" as const } };

  it("gives a call button the call class and a phone icon; other actions and text links are unchanged", () => {
    const on = html(<ActionLink link={link} ctx={withDetails(testCtx(), { cta: true })} />);
    expect(on).toMatch(/^<a href="tel:\+38641123456" data-action="call" class="btn btn--primary btn--call"><svg class="icon"[^]*<\/svg>Pokličite<\/a>$/);
    expect(html(<ActionLink link={link} ctx={testCtx()} />)).toBe('<a href="tel:+38641123456" data-action="call" class="btn btn--primary">Pokličite</a>');
    expect(html(<ActionLink link={link} ctx={withDetails(testCtx(), { cta: true })} kind="text" />)).toBe('<a href="tel:+38641123456" data-action="call" class="text-link">Pokličite</a>');
    const book = { label: "Rezervirajte", target: { action: "booking" as const } };
    expect(html(<ActionLink link={book} ctx={withDetails(testCtx(), { cta: true })} />)).not.toContain("btn--call");
  });

  it("turns the composed opener's call text link into the primary call button, when it is the section's only button", () => {
    const s = composed("s_hero", { elements: [heading("Ključi v 30 minutah"), action("e_a", "call", "text")] });
    const ctx = testCtx(site([s]));
    expect(html(<Composed section={s} ctx={ctx} index={0} />)).toContain('class="text-link">Pokličite');
    expect(html(<Composed section={s} ctx={withDetails(ctx, { cta: true })} index={0} />)).toContain('class="btn btn--primary btn--call"><svg');
  });

  it("keeps it a text link beside another button (one button per hero) and below the opener", () => {
    const two = composed("s_hero", { elements: [heading("Ključi v 30 minutah"), action("e_b", "book", "primary"), action("e_a", "call", "text", 2)] });
    const s = site([two], { business: { ...FULL_BUSINESS } });
    expect(html(<Composed section={two} ctx={withDetails(testCtx(s), { cta: true })} index={0} />)).toContain('class="text-link">Pokličite');
    const plate = composed("s_hero", {
      elements: [
        heading("Ključi v 30 minutah"),
        { id: "e_f", kind: "fact", value: "041 123 456", label: "Telefon", size: 4, treatment: "plate", link: { action: "call" }, desk: { col: 7, span: 4, row: 1 }, phone: { order: 3, span: "full" } },
        action("e_a", "call", "text", 2),
      ],
    });
    expect(html(<Composed section={plate} ctx={withDetails(testCtx(site([plate])), { cta: true })} index={0} />)).toContain('class="text-link">Pokličite');
    const later = composed("s_later", { intent: "story", elements: [heading("Pokličite nas", { level: 2, size: 4 }), action("e_a", "call", "text")] });
    const s2 = site([composed("s_hero", { elements: [heading("Kruh")] }), later]);
    expect(html(<Composed section={later} ctx={withDetails(testCtx(s2), { cta: true })} index={1} />)).toContain('class="text-link">Pokličite');
  });

  it("gives the header's call button the call class (both header kinds)", () => {
    const legacy = testCtx(testSpec({ chrome: { header: { variant: "bar", cta: "call" }, footer: { variant: "columns" }, mobileActionBar: false } }));
    expect(html(<Header ctx={withDetails(legacy, { cta: true })} />)).toMatch(/class="btn btn--primary site-header__cta btn--call"[^>]*><svg/);
    expect(html(<Header ctx={legacy} />)).not.toContain("btn--call");
    const sk = testSpec();
    const header = testCtx({ ...sk, design: { ...sk.design, skeleton: { ...SKELETON, header: "bar", actions: "header" } } });
    expect(html(<Header ctx={withDetails(header, { cta: true })} />)).toContain('class="btn btn--primary site-header__cta btn--call"');
  });

  it("styles the call button heavy, body-size and at least 48 px tall, keeping the spec's radius", () => {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
    expect(flat).toMatch(/\.dt-cta\)[^{]*\.btn--call[^{]*\{[^}]*min-height: 3rem;[^}]*font-weight: 700;/);
    expect(flat).not.toMatch(/border-radius: (999|50%|9999)/);
  });
});

describe("header: fuller chrome", () => {
  const sections = [
    composed("s_hero", { elements: [heading("Ključi v 30 minutah")] }),
    { id: "s_storitve", type: "services-list", variant: "list", props: { title: "Kaj vse naredimo za vas doma", items: [] } },
    { id: "s_o-nas", type: "about", variant: "text", props: { title: "O nas", body: "Besedilo." } },
    { id: "s_kontakt", type: "contact", variant: "simple", props: { title: "Kontakt" } },
  ] as unknown as Section[];

  it("replaces a lone Domov with anchors to the home page's headed sections (not the opener), labels at most 3 words", () => {
    const s = onePage(site(sections));
    expect(html(<Header ctx={testCtx(s)} />)).toContain(">Domov</a>");
    const out = html(<Header ctx={withDetails(testCtx(s), { header: true })} />);
    expect(out).not.toContain(">Domov</a>");
    // The menu's own list (at 768 px some entries may stand under "Več" too: the brand is larger).
    const list = out.slice(out.indexOf('class="site-nav__list"'), out.indexOf("site-nav__more") > 0 ? out.indexOf("site-nav__more") : undefined);
    const links = [...list.matchAll(/<li(?: data-nav-fit="[^"]+")?><a href="([^"]+)">([^<]+)<\/a><\/li>/g)].map((m) => [m[1], m[2]]);
    // A heading of more than three words stands as the word for what the section is (services).
    expect(links).toEqual([
      ["#s_storitve", "Storitve"],
      ["#s_o-nas", "O nas"],
      ["#s_kontakt", "Kontakt"],
    ]);
    expect(out).toContain("nav-toggle");
  });

  it("shortens a long heading of no known kind to three words, never ending on a short word or punctuation", () => {
    expect(anchorLabel("Kaj delamo za vas vsak dan")).toBe("Kaj delamo");
    expect(anchorLabel("Vodovod, ogrevanje in toplotne črpalke")).toBe("Vodovod, ogrevanje");
    expect(anchorLabel("Zaklenjeni ste?")).toBe("Zaklenjeni ste");
  });

  it("shows no menu at all with fewer than two such sections", () => {
    const s = onePage(site(sections.slice(0, 2)));
    const out = html(<Header ctx={withDetails(testCtx(s), { header: true })} />);
    expect(out).not.toContain("site-nav");
    expect(out).not.toContain("nav-toggle");
  });

  it("keeps a real menu of pages as it is", () => {
    const s = site(sections);
    expect(html(<Header ctx={withDetails(testCtx(s), { header: true })} />)).toBe(html(<Header ctx={testCtx(s)} />));
  });

  it("makes the stacked family a masthead: town, phone and the hours, only from the spec", () => {
    const s = testSpec();
    const stacked = { ...s, design: { ...s.design, skeleton: SKELETON } };
    expect(html(<Header ctx={testCtx(stacked)} />)).not.toContain("site-header__facts");
    const out = html(<Header ctx={withDetails(testCtx(stacked), { header: true })} />);
    expect(out).toContain("site-header--masthead");
    const facts = out.slice(out.indexOf("site-header__facts"), out.indexOf("</p>", out.indexOf("site-header__facts")));
    expect(facts).toContain(">Ljubljana<");
    expect(facts).toContain("041 123 456");
    expect(facts).toMatch(/pon–pet[^<]*8\.00–19\.00/i);
  });

  it("leaves a missing fact out of the masthead (no hours, no invented anything), and drops the row with none", () => {
    const s = testSpec();
    const noHours = { ...s, business: { ...FULL_BUSINESS, hours: undefined }, design: { ...s.design, skeleton: SKELETON } } as SiteSpec;
    const out = html(<Header ctx={withDetails(testCtx(noHours), { header: true })} />);
    expect(out).toContain("site-header__facts");
    expect(out).not.toMatch(/site-header__fact--hours/);
    // Hours that change every day: no summary of one day that would read as the only open one.
    const daily = {
      ...s,
      business: { ...FULL_BUSINESS, hours: { entries: [{ from: "mon", to: "mon", open: "08:00", close: "16:00" }, { from: "tue", to: "tue", open: "12:00", close: "19:00" }] } },
      design: { ...s.design, skeleton: SKELETON },
    } as SiteSpec;
    expect(html(<Header ctx={withDetails(testCtx(daily), { header: true })} />)).not.toMatch(/site-header__fact--hours/);
    const sparse = { ...s, business: SPARSE_BUSINESS, design: { ...s.design, skeleton: SKELETON } } as SiteSpec;
    expect(html(<Header ctx={withDetails(testCtx(sparse), { header: true })} />)).not.toContain("site-header__facts");
  });

  it("does not make other families a masthead", () => {
    const s = testSpec();
    const bar = { ...s, design: { ...s.design, skeleton: { ...SKELETON, header: "bar" as const } } };
    expect(html(<Header ctx={withDetails(testCtx(bar), { header: true })} />)).not.toContain("site-header__facts");
  });
});

describe("aiCaption: one caption per page instead of a chip on every picture", () => {
  it("drops the chip and marks the picture; the alt text still says it", () => {
    const s = site([]);
    const off = html(<Picture id="img_detail" ctx={testCtx(s)} sizes="100vw" />);
    expect(off).toContain("media--ai");
    const on = html(<Picture id="img_detail" ctx={withDetails(testCtx(s), { aiCaption: true })} sizes="100vw" />);
    expect(on).not.toContain("media--ai");
    expect(on).not.toContain("data-ai-label");
    expect(on).toContain('data-ai="generated"');
    expect(on).toContain("(slika je ustvarjena z umetno inteligenco)");
    // A client's own photo is not marked.
    expect(html(<Picture id="img_salon" ctx={withDetails(testCtx(s), { aiCaption: true })} sizes="100vw" />)).not.toContain("data-ai");
  });

  it("finds the first section that shows a generated picture", () => {
    const s = site([
      composed("s_hero", { elements: [heading("Kruh")] }),
      composed("s_a", { intent: "story", elements: [heading("Salon", { level: 2, size: 4 }), imageEl("e_i", "img_salon")] }),
      composed("s_b", { intent: "story", elements: [heading("Detajl", { level: 2, size: 4 }), imageEl("e_i", "img_detail")] }),
      composed("s_c", { intent: "story", elements: [heading("Ekipa", { level: 2, size: 4 }), imageEl("e_i", "img_team")] }),
    ]);
    expect(aiCaptionSection(s.pages[0]!.sections, s)).toBe("s_b");
    expect(aiCaptionSection(s.pages[0]!.sections.slice(0, 2), s)).toBeNull();
  });

  it("puts the caption once, at the end of that section, in the page's language", () => {
    const box = (id: string) => (
      <SectionBox id={id} type="composed" variant="free">
        <p>x</p>
      </SectionBox>
    );
    const out = html(
      <AiCaption.Provider value={{ section: "s_b", text: "Slike na tej strani so ustvarjene z umetno inteligenco." }}>
        {box("s_a")}
        {box("s_b")}
      </AiCaption.Provider>,
    );
    expect(out.match(/ai-caption/g)).toHaveLength(1);
    expect(out).toMatch(/<section id="s_b"[^>]*><div class="container"><p>x<\/p><\/div><p class="container ai-caption">Slike na tej strani so ustvarjene z umetno inteligenco\.<\/p><\/section>$/);
    expect(html(box("s_b"))).not.toContain("ai-caption");
  });

  it("has the caption strings", async () => {
    const { uiStrings } = await import("../src/i18n.ts");
    expect(uiStrings("sl")("aiCaption")).toBe("Slike na tej strani so ustvarjene z umetno inteligenco.");
    expect(uiStrings("en")("aiCaption")).toBe("The pictures on this page were made with AI.");
  });
});

describe("fit: display headlines fit their own column", () => {
  it("sets the headline's text in a fitted block and keeps short words whole", () => {
    const s = composed("s_hero", { elements: [heading("Računovodstvo za Pomurje")] });
    const ctx = testCtx(site([s]));
    const off = html(<Composed section={s} ctx={ctx} index={0} />);
    expect(off).not.toContain("cx-fit");
    const on = html(<Composed section={s} ctx={withDetails(ctx, { fit: true })} index={0} />);
    expect(on).toMatch(/class="cx-el cx-el--heading[^"]* cx-h cx-h--whole"[^>]*><span class="cx-fit">Računovodstvo za Pomurje<\/span><\/h1>/);
  });

  it("lets a word longer than 14 letters break as a last resort", () => {
    const s = composed("s_hero", { elements: [heading("Elektroinštalacije")] });
    const on = html(<Composed section={s} ctx={withDetails(testCtx(site([s])), { fit: true })} index={0} />);
    expect(on).toContain('<span class="cx-fit">');
    expect(on).not.toContain("cx-h--whole");
  });

  it("measures capitals wider on a site set in lower case", () => {
    const s = composed("s_hero", { elements: [heading("Ključavničarstvo", { case: "uppercase" })] });
    const on = html(<Composed section={s} ctx={withDetails(testCtx(site([s])), { fit: true })} index={0} />);
    expect(on).toContain("--fk:calc(var(--fit-k, 0.62) * 1.3)");
  });

  it("sizes by the cell (container query) and caps a display line to the first screen", () => {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
    expect(flat).toMatch(/container-type: inline-size;/);
    expect(flat).toMatch(/100cqi/);
    expect(flat).toMatch(/var\(--fit-k, 0\.62\)/);
    expect(flat).toMatch(/overflow-wrap: normal;/);
  });
});

describe("scale: small things small, big things big", () => {
  it("keeps one eyebrow per page and sets section headings at 40 px and more on desktop", () => {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
    expect(flat).toMatch(/\.dt-scale\) main > \.s:has\(\.eyebrow\) ~ \.s \.eyebrow \{ display: none; \}/);
    expect(flat).toMatch(/2\.5rem/);
  });
});
