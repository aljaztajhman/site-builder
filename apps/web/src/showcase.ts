import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CSSProperties } from "react";
import { uiUrl } from "./ui/assets.ts";
import { PRODUCT_NAME } from "./ui/labels.ts";

/**
 * The landing page's trade showcase, as `pnpm examples:build` wrote it (ui/examples/showcase.json, from
 * packages/spec/src/showcase.ts): per trade a fictional site in a colourway clients never get, and the
 * landing page's tokens recoloured from it. `/?primer=<id>` renders the page in that trade's look;
 * home.ts switches between them in place.
 */
export interface TradeShowcase {
  id: string;
  label: string;
  forWhom: string;
  name: string;
  /** Under the examples folder. */
  page: string;
  photos: number;
  font: { family: string; file: string; weights: [number, number] };
  vars: Record<string, string>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
let cached: TradeShowcase[] | undefined;

export function tradeShowcases(): TradeShowcase[] {
  cached ??= JSON.parse(readFileSync(path.join(here, "ui/examples/showcase.json"), "utf8")) as TradeShowcase[];
  return cached;
}

/** The trade's tokens on <html>: custom properties as they are, color-scheme as the property it is. */
export function tradeStyle(t: TradeShowcase): CSSProperties {
  const style: Record<string, string> = {};
  for (const [k, v] of Object.entries(t.vars)) style[k === "color-scheme" ? "colorScheme" : k] = v;
  return style as CSSProperties;
}

/** The trade's heading face for the landing page (the file the showcase site itself loads). */
export const tradeFontFace = (t: TradeShowcase): string =>
  `@font-face{font-family:"${t.font.family}";src:url("${uiUrl(`examples/${t.font.file}`)}") format("woff2");font-weight:${t.font.weights[0]} ${t.font.weights[1]};font-display:swap}`;

/** Under the demo: what the visitor sees, and that their own site will differ. */
export const tradeCaption = (t: TradeShowcase): string =>
  `Takole bi lahko izgledala stran za ${t.forWhom}. ${t.name} je izmišljeno podjetje; vaša stran nastane iz vašega opisa in fotografij, zato bo drugačna.${t.photos ? " Fotografije so ustvarjene z UI." : ""}`;

/** What home.ts needs to switch without a reload. */
export const tradeClientData = (trades: TradeShowcase[]) =>
  trades.map((t) => ({
    id: t.id,
    label: t.label,
    page: uiUrl(`examples/${t.page}`),
    title: `Primer strani: ${t.name}`,
    caption: tradeCaption(t),
    font: { family: t.font.family, url: uiUrl(`examples/${t.font.file}`), weights: `${t.font.weights[0]} ${t.font.weights[1]}` },
    vars: t.vars,
  }));

export const DEFAULT_CAPTION = `Primer: izmišljena trgovina Oljka in sol iz Kopra. Stran je ${PRODUCT_NAME} naredil iz njenega opisa in petih fotografij; manjkajočo ceno smo vpisali, kot bi jo lastnik. Fotografije so ustvarjene z UI.`;
