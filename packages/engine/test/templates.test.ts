import { describe, expect, it } from "vitest";
import { direction as directionById } from "@sb/spec";
import { designFromChoice, directionsCatalogue, drawsInsteadOfPhotos, heroRule, templateChrome, templateLine, templateOutline, type ContentOutput } from "../src/index.ts";

const choice = (id: string) => ({
  direction: id,
  fontPair: "x",
  primary: "#1d4ed8",
  accent: null,
  radius: 4,
  baseFontSize: 18,
  scale: 1.25,
  headingWeight: 900,
  headingCase: "uppercase" as const,
  headingTracking: -0.02,
  density: "regular" as const,
  shadow: "none" as const,
  reason: "",
});

describe("trade templates in the pipeline", () => {
  it("names the trade's template to the design step, and only when the photos allow it", () => {
    expect(templateLine("car-repair", 3)).toContain("tablica");
    expect(templateLine("builder", 0)).toContain("draws the trade instead of showing pictures");
    expect(templateLine("bakery", 0)).toBe("");
    expect(templateLine("dental", 2)).toBe("");
    expect(directionsCatalogue()).toContain("Hand-made trade template M");
  });

  it("keeps the template's own palette and type, whatever colours the model proposes", () => {
    const d = designFromChoice(choice("tablica"));
    expect(d.colors.primary).toBe("#15181c");
    expect(d.colors.band).toBe("#ffcc00");
    expect(d.headingWeight).toBe(900);
    expect(d.headingCase).toBe("uppercase");
    expect(d.fontPair).toBe("archivo-public-sans");
    // Other directions still take the model's brand colour.
    expect(designFromChoice(choice("clean-swiss")).colors.primary).toBe("#1d4ed8");
    expect(designFromChoice(choice("clean-swiss")).colors.band).toBeUndefined();
  });

  it("gives the content step the template's outline and the picture hero", () => {
    const outline = templateOutline(directionById("skorja"));
    expect(outline).toMatch(/^Homepage outline of the Skorja/);
    expect(outline).toContain("1. hero-signature:arch");
    expect(templateOutline(directionById("editorial"))).toBe("");
    expect(heroRule(["img_01"], directionById("tablica").layout.heroes)).toContain("hero-signature:photo with one of the hero-suitable pictures");
    expect(heroRule(["img_01"], directionById("cevi").layout.heroes)).toBe("");
  });

  it("makes no generated pictures for a template that draws instead", () => {
    expect(drawsInsteadOfPhotos(directionById("cevi"))).toBe(true);
    expect(drawsInsteadOfPhotos(directionById("tablica"))).toBe(false);
  });

  it("fixes the header: dark over the dark hero (not under a logo), no call button above the phone object", () => {
    const content: ContentOutput = {
      chrome: { header: { variant: "bar", cta: "call" }, footer: { variant: "compact" }, mobileActionBar: true },
      pages: [
        {
          id: "p_home",
          kind: "home",
          slug: "",
          nav: { label: "Domov", show: true },
          seo: { title: "x", description: "x" },
          sections: [{ id: "s_hero", type: "hero-signature", variant: "photo", props: { headline: "Servis", intro: "x", fact: "phone", factLabel: "Pokličite" } }],
        },
      ],
    };
    const tablica = designFromChoice(choice("tablica"));
    expect(templateChrome(tablica, content).header).toEqual({ variant: "bar", cta: "none", tone: "inverse" });
    expect(templateChrome(tablica, content, true).header).toEqual({ variant: "bar", cta: "none" });
    expect(templateChrome(designFromChoice(choice("clean-swiss")), content)).toBe(content.chrome);
  });
});
