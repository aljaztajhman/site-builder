import { describe, expect, it } from "vitest";
import { heroSplit } from "@sb/spec";
import { HeroSplit } from "../src/groups/heroes/HeroSplit.tsx";
import { SPARSE_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

describe("hero-split", () => {
  const section = heroSplit.schema.parse({
    id: "s_hero",
    type: "hero-split",
    variant: "image-right",
    props: {
      eyebrow: "Ljubljana, center",
      headline: "Striženje in barvanje brez čakanja",
      intro: "Termin rezervirate v minuti.",
      primary: { label: "Pokliči", target: { action: "call" } },
      secondary: { label: "Storitve", target: { page: "p_storitve" } },
      image: "img_salon",
    },
  });

  for (const variant of heroSplit.variants) {
    it(`renders ${variant} with h1, actions and a preloaded-priority photo`, () => {
      const out = html(<HeroSplit section={{ ...section, variant }} ctx={testCtx()} index={0} />);
      expect(out).toContain(`s-hero-split--${variant}`);
      expect(out).toMatch(/<h1 id="s_hero-title"[^>]*>Striženje in barvanje brez čakanja<\/h1>/);
      expect(out).toContain('href="tel:+38641123456"');
      expect(out).toContain('href="storitve.html"');
      expect(out).toContain('fetchPriority="high"');
      expect(out).toContain('alt="Notranjost salona s tremi stoli"');
    });
  }

  it("lazy-loads the photo below the fold", () => {
    const out = html(<HeroSplit section={section} ctx={testCtx()} index={2} />);
    expect(out).toContain('loading="lazy"');
  });

  it("drops the call button when the phone is a placeholder", () => {
    const out = html(<HeroSplit section={section} ctx={testCtx(testSpec({ business: SPARSE_BUSINESS }))} index={0} />);
    expect(out).not.toContain("tel:");
    expect(out).toContain('href="storitve.html"');
  });

  it("rejects a headline over the length limit", () => {
    expect(() => heroSplit.schema.parse({ ...section, props: { ...section.props, headline: "x".repeat(71) } })).toThrow();
  });
});
