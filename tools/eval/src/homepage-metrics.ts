import type { SiteSpec } from "@sb/spec";

/**
 * Homepage measures the pass/fail checks can't see: how often contact facts repeat, and how alike
 * the generated homepages are across fixtures (every automated check passes 60/60, so these are
 * the numbers that move when generation gets better or worse).
 */
export interface HomepageShape {
  /** Section types in order, e.g. "hero-split:image-left". */
  sections: string[];
  /** Sections that show the phone/address/hours block: hero-type with-facts, contact-strip, opening-hours, contact, booking with-hours. */
  contactBlocks: number;
}

export function homepageShape(spec: SiteSpec): HomepageShape {
  const home = spec.pages.find((p) => p.kind === "home") ?? spec.pages[0]!;
  const contact = home.sections.filter(
    (s) =>
      (s.type === "hero-type" && s.variant === "with-facts") ||
      s.type === "contact-strip" ||
      s.type === "opening-hours" ||
      s.type === "contact" ||
      (s.type === "booking" && s.variant === "with-hours"),
  );
  return { sections: home.sections.map((s) => `${s.type}:${s.variant}`), contactBlocks: contact.length };
}

function lcs(a: string[], b: string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = x === b[j - 1] ? prev + 1 : Math.max(row[j]!, row[j - 1]!);
      prev = cur;
    }
  }
  return row[b.length]!;
}

/**
 * Mean pairwise similarity of homepage skeletons (section types in order, variants ignored):
 * 2·LCS / (|a| + |b|), from 0 (nothing in common) to 1 (identical order of section types).
 */
export function skeletonSimilarity(shapes: HomepageShape[]): number {
  const types = shapes.map((s) => s.sections.map((x) => x.split(":")[0]!));
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      sum += (2 * lcs(types[i]!, types[j]!)) / (types[i]!.length + types[j]!.length);
      pairs++;
    }
  }
  return pairs ? sum / pairs : 0;
}
