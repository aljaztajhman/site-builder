/**
 * The parts of a rendered example site that the landing demo's transformation moves (header, brand, menu
 * items, headline, buttons, photos, section panels …), named by the component library's class names. The
 * engine (@sb/morph) pairs two sites' parts by these keys. Read only here, on the landing page's demo;
 * published sites don't change.
 */
import type { Recipe } from "@sb/morph";

const section = (n: number) => `main > section:nth-of-type(${n})`;

export const SITE_PARTS: Recipe = [
  { key: "header", select: ".site-header", kind: "panel" },
  { key: "brand", select: ".site-header__brand", within: "header" },
  { key: "toggle", select: ".nav-toggle", within: "header" },
  { key: "nav", select: ".site-nav__list > li", within: "header", all: true },
  { key: "hcta", select: ".site-header__inner > .btn", within: "header" },
  { key: "hero", select: section(1), kind: "panel" },
  // A label card on the hero photo turns over with the hero.
  { key: "card", select: ".label-card", within: "hero", kind: "panel", region: "hero" },
  { key: "wall", select: ".hsig__wall", within: "hero" },
  { key: "eyebrow", select: ".eyebrow, .hsig__where", within: "hero" },
  { key: "h1", select: "h1", within: "hero" },
  { key: "lead", select: ".lead", within: "hero" },
  { key: "act", select: ".actions > *", within: "hero", all: true },
  { key: "media", select: "picture.media", within: "hero", all: true },
  { key: "fact", select: ".hero-facts__item", within: "hero", all: true, boxy: true },
  { key: "chip", select: ".hsig__chip", within: "hero" },
  { key: "s2", select: section(2), kind: "panel" },
  { key: "s2title", select: "h2", within: "s2" },
  { key: "s2i", select: "ul, ol, .week", within: "s2", children: 6 },
  { key: "s2a", select: ".actions > *", within: "s2", all: true },
  // Further sections in view (a tall screen): panels without parts.
  { key: "s3", select: section(3), kind: "panel" },
  { key: "s4", select: section(4), kind: "panel" },
  { key: "s5", select: section(5), kind: "panel" },
];
