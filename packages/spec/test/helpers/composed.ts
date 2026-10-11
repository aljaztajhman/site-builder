/**
 * Builders for composed-section tests (the style of composition-guards.test.ts, widened to the v20 fields and kinds).
 * Not a test file: vitest only collects *.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateComposition, type ComposedSection, type CompositionContext, type Element, type Section, type SiteSpec } from "../../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../../../..");

/** A golden spec (tools/eval/golden/<id>.json). */
export const golden = (id = "pekarna-kvas"): SiteSpec => JSON.parse(readFileSync(path.join(root, `tools/eval/golden/${id}.json`), "utf8")) as SiteSpec;
/** A composed eval fixture (tools/eval/composed/<id>.json). */
export const composedFixture = (id: "m" | "s" | "j"): SiteSpec => JSON.parse(readFileSync(path.join(root, `tools/eval/composed/${id}.json`), "utf8")) as SiteSpec;
/** Every golden id. */
export const GOLDEN_IDS = ["avtoservis-mrak", "fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "instalacije-rebernik", "kmetija-grabnar", "pekarna-kvas", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"] as const;

export type Desk = {
  col: number;
  span: number;
  row: number;
  rowSpan?: number;
  alignX?: "start" | "center" | "end" | "stretch";
  shiftX?: number;
  shiftY?: number;
  layer?: number;
  tilt?: number;
  bleedX?: "start" | "end" | "both";
  bleedY?: "top" | "bottom";
};
export type Phone = { order: number; span?: "full" | "inset" | "half" | "bleed"; hidden?: boolean };

/** An element with its places; `rest` is the kind's own props. */
export const el = (id: string, kind: Element["kind"], desk: Desk, phone: Phone, rest: Record<string, unknown> = {}): Element =>
  ({ id, kind, desk, phone: { span: "full", ...phone }, ...rest }) as unknown as Element;

type Rest = Record<string, unknown>;
export const heading = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "heading", desk, { order }, { text: "Peka kruh vsak dan", level: 2, size: 3, ...rest });
export const text = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "text", desk, { order }, { paragraphs: ["Kruh pečemo ob štirih zjutraj."], ...rest });
export const photo = (id: string, desk: Desk, order: number, image = "img_01", phone: Partial<Phone> = {}, rest: Rest = {}) => el(id, "image", desk, { order, ...phone }, { image, ratio: "4:5", ...rest });
export const fact = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "fact", desk, { order }, { value: "2004", label: "Delamo od leta", treatment: "numeral", size: 3, ...rest });
export const decor = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "decor", desk, { order }, { motif: "crust", ...rest });
export const action = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "action", desk, { order }, { action: "call", label: "Pokliči", style: "primary", ...rest });
export const list = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "list", desk, { order }, { items: ["Kruh", "Pecivo"], ...rest });
export const prices = (id: string, desk: Desk, order: number, rest: Rest = {}) =>
  el(id, "prices", desk, { order }, { items: [{ name: "Hlebec", price: { amount: 3.2 } }, { name: "Štruca", price: { amount: 2.5 } }], style: "rows", ...rest });
export const photos = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "photos", desk, { order }, { images: ["img_01", "img_02"], arrangement: "fan", ...rest });
export const wordmark = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "wordmark", desk, { order }, { size: 4, ...rest });
export const ribbon = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "ribbon", desk, { order }, { items: ["Kruh", "Pecivo"], ...rest });
export const sticker = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "sticker", desk, { order }, { text: "Odprto tudi ob nedeljah", shape: "round", ...rest });
export const map = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "map", desk, { order }, { style: "pin", ...rest });
export const iconFacts = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "iconFacts", desk, { order }, { items: [{ fact: "parking" }, { fact: "card" }], ...rest });
export const quote = (id: string, desk: Desk, order: number, rest: Rest = {}) => el(id, "quote", desk, { order }, { text: "Pečemo kot nekoč.", ...rest });

/** A clean two-column story: heading and text on the left, a photo on the right. */
export const base = (): Element[] => [heading("e_head", { col: 1, span: 6, row: 1 }, 0), text("e_text", { col: 1, span: 6, row: 2 }, 1), photo("e_photo", { col: 8, span: 5, row: 1, rowSpan: 2 }, 2)];

/** A composed section; `props` overrides (rows, width, background, top, motion, pin, headerOver, surface …); `tone` sets the section's tone. */
export const composed = (elements: Element[], props: Rest = {}, tone?: "default" | "alt" | "inverse" | "band"): ComposedSection =>
  ({ id: "s_c", type: "composed", variant: "free", ...(tone ? { tone } : {}), props: { intent: "story", width: "wide", rows: 3, elements, ...props } }) as unknown as ComposedSection;

/** The same section under another id (for pages of several sections). */
export const withId = (s: ComposedSection, id: string): ComposedSection => ({ ...s, id }) as ComposedSection;

export const messages = (s: ComposedSection, ctx?: CompositionContext) => validateComposition(s, ctx).map((i) => i.message);
export const has = (s: ComposedSection, re: RegExp, ctx?: CompositionContext) => messages(s, ctx).some((m) => re.test(m));
/** The issue whose message matches `re` (undefined when none does). */
export const issue = (s: ComposedSection, re: RegExp, ctx?: CompositionContext) => validateComposition(s, ctx).find((i) => re.test(i.message));
export const ids = (n: number, make: (i: number) => Element) => Array.from({ length: n }, (_, i) => make(i));

/** A page of sections (for the rules across sections), the one under test at `index`; `prev` is set from the page. */
export const onPage = (sections: ComposedSection[], index: number, extra: Partial<CompositionContext> = {}): CompositionContext => ({
  page: { sections: sections as unknown as Section[], index },
  ...(index > 0 ? { prev: sections[index - 1] as unknown as Section } : {}),
  ...extra,
});

/** The path of a repair log line ("<path>: what"). */
export const repairPath = (line: string): string => line.slice(0, line.indexOf(": "));
