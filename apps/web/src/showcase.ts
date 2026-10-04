import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANDING_TRADES } from "@sb/spec";
import { uiUrl } from "./ui/assets.ts";

/**
 * The landing page's trade demo, as `pnpm examples:build` wrote it (ui/examples/showcase.json, from
 * packages/spec/src/showcase.ts): per trade a fictional site in a colourway clients never get. The demo
 * shows LANDING_TRADES of them as tabs and transforms one site into the next (client/home.ts); the
 * landing page keeps its own look. `/?primer=<id>` opens the demo on that trade.
 */
export interface TradeShowcase {
  id: string;
  label: string;
  forWhom: string;
  name: string;
  /** Under the examples folder. */
  page: string;
  photos: number;
  /** What the demo types before it builds this site. */
  intro: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
let cached: TradeShowcase[] | undefined;

/** Every showcase in showcase.json. */
export function allShowcases(): TradeShowcase[] {
  cached ??= JSON.parse(readFileSync(path.join(here, "ui/examples/showcase.json"), "utf8")) as TradeShowcase[];
  return cached;
}

/** The trades the landing demo shows, in tab order. */
export function tradeShowcases(): TradeShowcase[] {
  const all = allShowcases();
  return LANDING_TRADES.map((id) => {
    const t = all.find((x) => x.id === id);
    if (!t) throw new Error(`showcase.json has no ${id}: run pnpm examples:build`);
    return t;
  });
}

/** Under the demo: the trade, and that the business is made up. */
export const tradeCaption = (t: TradeShowcase): string =>
  `Primer za ${t.forWhom}: ${t.name} je izmišljeno podjetje.${t.photos ? " Fotografije so ustvarjene z UI." : ""}`;

/** The demo frame's title. */
export const tradeTitle = (t: TradeShowcase): string => `Primer strani: ${t.name}`;

/** What home.ts needs to play the demo (in the page as JSON). */
export interface TradeClient {
  id: string;
  label: string;
  page: string;
  title: string;
  caption: string;
  intro: string;
}

export const tradeClientData = (trades: TradeShowcase[]): TradeClient[] =>
  trades.map((t) => ({ id: t.id, label: t.label, page: uiUrl(`examples/${t.page}`), title: tradeTitle(t), caption: tradeCaption(t), intro: t.intro }));
