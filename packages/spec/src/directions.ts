import type { Direction } from "./design.ts";

/**
 * Curated design directions. Each must look clearly different from the others on the eval contact sheet.
 * Fallback colours must pass every contrast rule in validate.ts (a test checks this).
 */
export const DIRECTIONS: Direction[] = [
  {
    id: "clean-swiss",
    name: "Clean Swiss",
    summary:
      "White page, tight grotesk headings, strict left-aligned grid, square corners, one saturated brand colour used sparingly. Precise and calm. Good for accountants, clinics, installers.",
    bestFor: ["accountant", "dental", "physio", "builder"],
    fontPairs: ["inter-tight-inter"],
    palette: {
      background: "white",
      fallback: {
        background: "#ffffff",
        surface: "#f1f4f8",
        text: "#111418",
        muted: "#4a5360",
        primary: "#1d4ed8",
        onPrimary: "#ffffff",
        accent: "#1d4ed8",
        border: "#d5dbe3",
        inverse: "#111418",
        onInverse: "#ffffff",
      },
      primaryHue: null,
      primarySaturation: [0.45, 0.95],
    },
    ranges: {
      radius: [0, 2],
      baseFontSize: [16, 17],
      scale: [1.2, 1.3],
      headingWeight: [600, 750],
      headingTracking: [-0.03, -0.01],
      headingCase: ["normal"],
      density: ["regular"],
      shadow: ["none"],
    },
    imagery: "natural",
    layout: {
      header: "bar",
      footer: "columns",
      heroes: ["hero-split:image-right", "hero-type:with-facts"],
      rhythm: "flat",
      prefer: ["services-list:rows", "price-list:table", "faq:accordion"],
    },
  },
];

export function direction(id: string): Direction {
  const d = DIRECTIONS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown design direction: ${id}`);
  return d;
}
