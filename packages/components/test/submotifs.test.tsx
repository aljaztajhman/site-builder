import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { direction, heroSignature, type Business, type BusinessSubtype, type Design, type SectionOf } from "@sb/spec";
import { HeroSignature } from "../src/groups/heroes/HeroSignature.tsx";
import { PriceList } from "../src/groups/business/Prices.tsx";
import { subMotifOf } from "../src/motifs/index.tsx";
import { FULL_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

/** Sub-trade motifs (spec v15 business.subtype, variety engine Step 3) on their template's layout. */
const here = path.dirname(fileURLToPath(import.meta.url));

function templateDesign(id: string): Design {
  const d = direction(id);
  return {
    direction: d.id,
    fontPair: d.fontPairs[0]!,
    colors: { ...d.palette.fallback },
    radius: d.ranges.radius[0],
    baseFontSize: d.ranges.baseFontSize[0],
    scale: d.ranges.scale[0],
    headingWeight: d.ranges.headingWeight[1],
    headingCase: d.ranges.headingCase[0]!,
    headingTracking: d.ranges.headingTracking[0],
    density: d.ranges.density[0]!,
    shadow: d.ranges.shadow[0]!,
    imagery: d.imagery,
  };
}

const ctxFor = (dir: string, type: Business["type"], subtype?: BusinessSubtype) =>
  testCtx(testSpec({ design: templateDesign(dir), business: { ...FULL_BUSINESS, type, ...(subtype ? { subtype } : {}) } }));

const drawing = heroSignature.schema.parse({
  id: "s_hero",
  type: "hero-signature",
  variant: "drawing",
  props: { headline: "Elektroinštalacije v Velenju", intro: "Mojster z licenco.", fact: "phone", factLabel: "Pokličite za ogled" },
}) as SectionOf<"hero-signature">;

const prices: SectionOf<"price-list"> = {
  id: "s_cene",
  type: "price-list",
  variant: "tags",
  props: { title: "Šopki", groups: [{ items: [{ name: "Šopek iz sezonskega cvetja", price: { amount: 20, from: true } }] }] },
};

describe("sub-trade motifs on Cevi's layout", () => {
  it("draw the trade's own object beside the call: a socket on its cable, a dovetailed corner, a tiled roof, a colour strip", () => {
    const out = (subtype?: BusinessSubtype) => html(<HeroSignature section={drawing} ctx={ctxFor("cevi", "builder", subtype)} index={0} />);
    expect(out("electrical")).toMatch(/<svg class="wire hsig__drawing"[^>]*aria-hidden="true"/);
    expect(out("carpentry")).toMatch(/<svg class="joint hsig__drawing"[^>]*aria-hidden="true"/);
    expect(out("roofing")).toMatch(/<svg class="tiles hsig__drawing"[^>]*aria-hidden="true"/);
    expect(out("roofing")).toContain('<clipPath id="s_hero-roof">');
    expect(out("painting")).toMatch(/<svg class="strip hsig__drawing"[^>]*aria-hidden="true"/);
    // Plumbing, or no subtype: the radiator, as before.
    for (const o of [out("plumbing"), out()]) {
      expect(o).toMatch(/<svg class="radiator hsig__drawing"/);
      expect(o).not.toMatch(/wire|joint|tiles|strip/);
    }
    // The call object stays the template's: one tel: link in the red block.
    expect(out("electrical").match(/href="tel:/g)).toHaveLength(1);
    expect(out("electrical")).toContain('<a class="callblock" href="tel:+38641123456">');
  });

  it("only on their own template: an electrician on another template or direction gets no wire", () => {
    expect(subMotifOf(ctxFor("cevi", "builder", "electrical"))).toBe("wire");
    expect(subMotifOf(ctxFor("tablica", "builder", "electrical"))).toBeUndefined();
    expect(html(<HeroSignature section={drawing} ctx={ctxFor("industrial", "builder", "electrical")} index={0} />)).not.toMatch(/<svg/);
  });
});

describe("sub-trade motifs on Etiketa's layout", () => {
  it("put a stem (florist) or a hang tag (boutique) on every price label instead of the olive branch", () => {
    const out = (subtype?: BusinessSubtype) => html(<PriceList section={prices} ctx={ctxFor("etiketa", "shop", subtype)} index={1} />);
    expect(out("florist")).toMatch(/<li class="price-label label-card"><svg class="stem"[^>]*aria-hidden="true"/);
    expect(out("boutique")).toMatch(/<li class="price-label label-card"><svg class="tag"[^>]*aria-hidden="true"/);
    expect(out("florist")).not.toContain("branch");
    expect(out("deli")).toMatch(/<svg class="branch"/);
    expect(out()).toMatch(/<svg class="branch"/);
  });

  it("and on the hero's label card", () => {
    const label = heroSignature.schema.parse({
      id: "s_hero",
      type: "hero-signature",
      variant: "label",
      props: { headline: "Šopki za vsak dan", intro: "Cvetličarna na Glavnem trgu.", fact: "address" },
    }) as SectionOf<"hero-signature">;
    expect(html(<HeroSignature section={label} ctx={ctxFor("etiketa", "shop", "florist")} index={0} />)).toMatch(/<div class="label-card hsig__card"><svg class="stem"/);
    expect(html(<HeroSignature section={label} ctx={ctxFor("etiketa", "shop", "boutique")} index={0} />)).toMatch(/<div class="label-card hsig__card"><svg class="tag"/);
  });
});

describe("motifs.css sub-trade rules", () => {
  const css = readFileSync(path.join(here, "../styles/motifs.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const start = css.indexOf('[data-submotif="wire"]');

  it("name their sub-trade in every selector, so sites without one keep their stylesheet", () => {
    expect(start).toBeGreaterThan(0);
    // Nothing before the sub-trade section names a sub-trade; every rule in it does.
    expect(css.slice(0, start)).not.toContain("data-submotif");
    for (const m of css.slice(start).matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const prelude = m[1]!.trim();
      if (prelude.startsWith("@")) continue;
      for (const sel of prelude.split(",")) expect(sel, sel).toMatch(/\[data-submotif="(wire|joint|tiles|strip|stem|tag)"\]/);
    }
  });
});
