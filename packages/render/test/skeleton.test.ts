import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CENTRED_TEXT, DIRECTIONS, FAMILIES, HEADER_FAMILIES, MIGRATIONS, SiteSpec, canCentre, enforceDesign, migrateSpec, skeletonOfChrome, type Skeleton } from "@sb/spec";
import { minifyCss, renderPage } from "../src/index.ts";

/** The skeleton (spec v15, design.skeleton) in the page shell, header, footer and phone actions; no browser. */
const raw = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as Record<string, unknown>;
const golden = (id: string) => migrateSpec(raw(id)) as SiteSpec;
const BASE: Skeleton = { header: "bar", actions: "bar", footer: "columns", footerTone: "alt", width: "contained", cards: "filled", buttons: "soft", dividers: "motif", photoRatio: "standard" };
const withSkeleton = (spec: SiteSpec, s: Partial<Skeleton>): SiteSpec => ({ ...spec, design: { ...spec.design, skeleton: { ...BASE, ...s } } });
const home = (spec: SiteSpec) => renderPage(spec, spec.pages[0]!);

describe("migration 14 → 15 (skeleton)", () => {
  it("leaves a stored site as it was: no skeleton, valid, and none of the skeleton's markup", async () => {
    const { validateSite } = await import("@sb/spec");
    for (const id of ["avtoservis-mrak", "kmetija-grabnar", "pekarna-kvas", "zobozdravstvo-lebar"]) {
      const v14 = { ...raw(id), specVersion: 14 };
      const v15 = migrateSpec(v14, MIGRATIONS, 15);
      expect(v15).toEqual({ ...v14, specVersion: 15 });
      expect(validateSite(v15).ok).toBe(true);
      const html = home(v15);
      for (const marker of ["data-skeleton", "nav-toggle--", "site-footer--tone-", "reveal.js", "call-float", "data-after-hero"]) expect(html, `${id} ${marker}`).not.toContain(marker);
    }
  });

  it("maps today's header and footer variants one to one into the skeleton's families", () => {
    const s = skeletonOfChrome({ header: { variant: "split-cta" }, footer: { variant: "compact" } });
    expect([s.header, s.footer, s.actions]).toEqual(["split-cta", "compact", "bar"]);
    expect(HEADER_FAMILIES.slice(0, 3)).toEqual(["bar", "split-cta", "stacked"]);
  });
});

describe("the skeleton in the page", () => {
  it("names its section styles on <body> and its header and footer families", () => {
    const spec = withSkeleton(golden("avtoservis-mrak"), { header: "centred", footer: "wordmark", footerTone: "inverse", width: "wide", cards: "none", buttons: "square", dividers: "rule", photoRatio: "portrait" });
    const html = home(spec);
    expect(html).toMatch(/<body data-imagery="[a-z-]+" class="has-action-bar[^"]*" data-skeleton="" data-actions="bar" data-width="wide" data-cards="none" data-buttons="square" data-dividers="rule" data-ratio="portrait">/);
    expect(html).toContain('class="site-header site-header--centred"');
    expect(html).toContain('class="nav-toggle nav-toggle--icon"');
    expect(html).toContain('class="site-footer site-footer--compact site-footer--wordmark site-footer--tone-inverse"');
    expect(html).toMatch(/<p class="site-footer__wordmark" aria-hidden="true" style="--wm-chars:\d+">Avtoservis Mrak<\/p>/);
  });

  it("draws the menu as a word, an icon or today's box by header family", () => {
    const spec = golden("avtoservis-mrak");
    const toggle = (header: Skeleton["header"]) => /class="nav-toggle nav-toggle--([a-z]+)"/.exec(home(withSkeleton(spec, { header })))![1];
    expect(["bar", "split-cta", "stacked", "centred", "compact", "phone", "word"].map((h) => toggle(h as Skeleton["header"]))).toEqual(["box", "box", "box", "icon", "icon", "word", "word"]);
  });

  it("phone: the number in the header instead of a menu box, and no call button there with the bar", () => {
    const html = home(withSkeleton(golden("avtoservis-mrak"), { header: "phone", actions: "bar" }));
    expect(html).toMatch(/<a class="site-header__phone" href="tel:\+386[0-9]+">/);
    expect(html).not.toMatch(/site-header__cta[^>]*data-action="call"/);
  });

  it("overlay only over a full-bleed photo hero without a logo; elsewhere the menu as a word", () => {
    const farm = golden("kmetija-grabnar");
    expect(home(withSkeleton(farm, { header: "overlay" }))).toContain('class="site-header site-header--overlay"');
    // Inner pages open with a page header: no photo to sit on.
    const inner = withSkeleton(farm, { header: "overlay" });
    expect(renderPage(inner, inner.pages[1]!)).toContain('class="site-header site-header--word"');
    expect(home(withSkeleton(golden("pekarna-kvas"), { header: "overlay" }))).toContain('class="site-header site-header--word"');
  });

  it("actions header: the header carries the call and the directions, stays on screen, and there is no bar", () => {
    const html = home(withSkeleton(golden("avtoservis-mrak"), { header: "compact", actions: "header" }));
    expect(html).toContain("site-header--sticky site-header--carries-call");
    expect(html).toMatch(/<div class="site-header__actions"><a class="btn btn--primary site-header__cta" href="tel:[^"]+" data-action="call">/);
    expect(html).toContain('class="text-link site-header__directions"');
    expect(html).not.toContain("action-bar");
    expect(html).not.toContain("has-action-bar");
  });

  it("actions float: one floating call button with a directions button, no bar; it waits for a hero with both", () => {
    const html = home(withSkeleton(golden("avtoservis-mrak"), { actions: "float" }));
    expect(html).toContain('class="has-call-float"');
    // avtoservis opens on the hero with phone, address and directions: the button waits until it has gone.
    expect(html).toMatch(/<nav class="call-float" aria-label="Hitri kontakt" data-after-hero=""><a class="btn btn--secondary call-float__btn call-float__directions"[^>]*>.*?<\/a><a class="btn btn--primary call-float__btn" href="tel:/);
    expect(html).not.toContain('class="action-bar');
    const inner = withSkeleton(golden("avtoservis-mrak"), { actions: "float" });
    expect(renderPage(inner, inner.pages[1]!)).toContain('<nav class="call-float" aria-label="Hitri kontakt"><a');
  });

  it("the bar waits for a hero that offers call and directions (reveal.js), in every browser", () => {
    const spec = golden("pekarna-kvas");
    const hero = spec.pages[0]!.sections[0]! as { props: Record<string, unknown> };
    hero.props = { ...hero.props, secondary: { label: "Navodila za pot", target: { action: "directions" } } };
    const html = home(withSkeleton(spec, {}));
    expect(html).toContain('<nav class="action-bar" data-after-hero=""');
    expect(html).toMatch(/js\/reveal\.js/);
    expect(html).not.toContain("action-bar--after-hero");
  });

  it("with the plate in the hero (the call object) only the bar's call waits; the directions are there at once", () => {
    const spec = golden("avtoservis-mrak");
    const dir = DIRECTIONS.find((d) => d.id === "tablica")!;
    spec.design = enforceDesign({ ...spec.design, direction: dir.id, fontPair: FAMILIES.tablica!.fontPairs[0]! }, dir);
    spec.pages[0]!.sections[0] = {
      id: "s_hero",
      type: "hero-signature",
      variant: "photo",
      props: { headline: "Popravimo hitro", intro: "Servis in vulkanizerstvo.", fact: "phone", factLabel: "Pokličite nas", primary: { label: "Storitve", target: { page: spec.pages[1]!.id } }, image: spec.assets.images[0]!.id },
    } as SiteSpec["pages"][number]["sections"][number];
    const bar = home(withSkeleton(spec, { actions: "bar" }));
    expect(bar).toMatch(/<a class="btn btn--primary action-bar__btn" href="tel:[^"]+" data-after-hero="">/);
    expect(bar).toContain('<nav class="action-bar" aria-label');
    const header = home(withSkeleton(spec, { actions: "header", header: "phone" }));
    expect(header).toMatch(/<a class="site-header__phone" href="tel:[^"]+" data-after-hero="">/);
    expect(header).toMatch(/js\/reveal\.js/);
  });

  it("never falls back to the street address as the hero's eyebrow", () => {
    const spec = golden("zobozdravstvo-lebar");
    const street = spec.business.address as { street: string };
    const hero = (s: SiteSpec) => /<section id="[^"]+" class="s s-hero-signature[\s\S]*?<\/section>/.exec(home(s))![0];
    expect(hero(spec)).toContain(street.street);
    expect(hero(withSkeleton(spec, {}))).not.toContain(street.street);
  });

  it("footer visit: where and when before the provider rows, the address once", () => {
    const spec = golden("pekarna-kvas");
    const html = home(withSkeleton(spec, { footer: "visit", footerTone: "default" }));
    const footer = /<footer[\s\S]*<\/footer>/.exec(html)![0];
    expect(footer).toContain("Obiščite nas");
    expect(footer).toContain("site-footer__directions");
    expect(footer).toContain("Delovni čas");
    expect(footer.match(/<address>/g)).toHaveLength(1);
  });
});

describe("alignment per section: one centred section per page", () => {
  const sectionTag = (html: string, id: string) => html.match(new RegExp(`<section id="${id}"[^>]*>`))?.[0] ?? "";
  it("centres the listed section that may be centred, the first on the page only, and nothing without a skeleton", () => {
    const base = golden("avtoservis-mrak");
    const page = base.pages[0]!;
    const about = page.sections.find((s) => s.type === "about")!; // text-only, two short paragraphs
    const cards = page.sections.find((s) => s.type === "services-cards")!; // a symmetric grid
    const contact = page.sections.find((s) => s.type === "contact")!; // split-map: never centred
    expect(canCentre(about) && canCentre(cards) && !canCentre(contact)).toBe(true);
    const html = home(withSkeleton(base, { centred: [about.id, cards.id, contact.id] }));
    // services-cards comes first on the page, so it is the one; the rest start at the left edge.
    expect(sectionTag(html, cards.id)).toContain('data-align="centre"');
    expect(html.match(/data-align=/g)).toHaveLength(1);
    expect(home(withSkeleton(base, { centred: [contact.id] }))).not.toContain("data-align");
    expect(home(base)).not.toContain("data-align");
    expect(home(withSkeleton(base, {}))).not.toContain("data-align");
  });
  it("never centres long running text", () => {
    const base = golden("avtoservis-mrak");
    const about = base.pages[0]!.sections.find((s) => s.type === "about")!;
    const long = { ...about, props: { ...about.props, paragraphs: ["x".repeat(CENTRED_TEXT.chars + 1)] } } as typeof about;
    const three = { ...about, props: { ...about.props, paragraphs: ["a", "b", "c"] } } as typeof about;
    expect(canCentre(long)).toBe(false);
    expect(canCentre(three)).toBe(false);
    expect(canCentre({ ...about, variant: "image-side" })).toBe(false);
  });
  it("leaves a narrow text that its trade motif lays out itself (label, bend) as the motif draws it", () => {
    const shop = golden("trgovina-oljka-in-sol");
    const motif = DIRECTIONS.find((d) => d.id === shop.design.direction)!.template!.motif;
    expect(motif).toBe("label");
    const text = shop.pages[0]!.sections.find((s) => s.type === "text")!;
    expect(canCentre(text)).toBe(true);
    expect(canCentre(text, motif)).toBe(false);
    expect(home(withSkeleton(shop, { centred: [text.id] }))).not.toContain("data-align");
  });
  it("the skeleton's centred ids are checked: section ids, a bounded list", async () => {
    const base = golden("avtoservis-mrak");
    const ok = withSkeleton(base, { centred: [base.pages[0]!.sections[1]!.id] });
    expect(SiteSpec.safeParse(ok).success).toBe(true);
    // Two listed on one page: one renders centred, so the "everything centred" rule (at most one) holds.
    const { validateSite } = await import("@sb/spec");
    const two = withSkeleton(base, { centred: base.pages[0]!.sections.slice(1, 4).map((s) => s.id) });
    expect(validateSite(two).issues).toEqual([]);
    expect(SiteSpec.safeParse(withSkeleton(base, { centred: ["not an id"] })).success).toBe(false);
    expect(SiteSpec.safeParse(withSkeleton(base, { centred: Array.from({ length: 17 }, (_, i) => `s_x${i}`) })).success).toBe(false);
  });
});

describe("skeleton.css", () => {
  const css = readFileSync(new URL("../../components/styles/skeleton.css", import.meta.url), "utf8");
  // Split selector lists on commas outside parentheses (:is(a, b) is one selector).
  const split = (list: string) => {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i] === "(") depth++;
      else if (list[i] === ")") depth--;
      else if (list[i] === "," && depth === 0) {
        out.push(list.slice(start, i));
        start = i + 1;
      }
    }
    return [...out, list.slice(start)];
  };
  it("contains no banned patterns and uses tokens only", () => {
    expect(css).not.toMatch(/gradient\(|backdrop-filter|font-style:\s*italic|monospace|border-radius:\s*(9{3,}|50%)/);
    for (const m of css.matchAll(/box-shadow:\s*([^;]+);/g)) expect(["var(--shadow)", "none"]).toContain(m[1]);
    for (const m of css.matchAll(/#[0-9a-f]{3,6}\b|rgb\(/gi)) expect.fail(`raw colour ${m[0]}`);
    // Button radii stay under a pill: at most 12 px on a 48 px button.
    expect(css).toMatch(/border-radius:\s*min\(12px/);
    // Centred text only in the centred header's wordmark and the page's one centred section (data-align="centre").
    const centred = [...minifyCss(css).matchAll(/([^{}]+)\{[^}]*text-align:\s*center/g)].map((m) => m[1]!.trim());
    expect(centred).toHaveLength(2);
    expect(centred[0]).toBe(".site-header--centred .site-header__brand");
    for (const sel of split(centred[1]!)) expect(sel, sel).toContain('[data-align="centre"]');
  });
  it("keys every rule on markup only a site with a skeleton has, so a site without one renders as before", () => {
    const preludes: string[] = [];
    let buf = "";
    for (const ch of minifyCss(css)) {
      if (ch === "{") {
        preludes.push(buf.trim());
        buf = "";
      } else if (ch === "}") buf = "";
      else buf += ch;
    }
    const own = /data-skeleton|data-align|data-actions|data-width|data-cards|data-buttons|data-dividers|data-ratio|data-after-hero|nav-toggle--(word|icon)|site-header--(centred|phone|overlay|word|compact|sticky|carries-call)|site-header__(actions|phone|directions)|call-float|has-call-float|site-footer--tone-|site-footer__(wordmark|visit|directions)/;
    const selectors = preludes.filter((p) => !p.startsWith("@")).flatMap(split);
    expect(selectors.length).toBeGreaterThan(50);
    for (const sel of selectors) expect(sel, sel).toMatch(own);
  });
});
