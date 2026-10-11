/**
 * Studio 0.5b, the mockup pipeline (docs/plans/studio-0.5.md): the rebuild. One Opus vision call (stage `rebuild`) looks
 * at the painted homepage mockup and the client's real photos and writes the page in the composition language: per
 * section its intent, tone, copy (headline and lead, Slovene) and composed props whose words and facts are slot markers
 * (`{business.phone}`, `{brief.offerings[0].name}`, `{copy.headline}`), plus the page tokens (colour roles, a font pair),
 * where it painted each client photo, and up to three crop boxes of decorative art.
 *
 * Code then does everything that must hold: `sanitiseProps` keeps only short labels as literal text (no number the client
 * never gave), removes call buttons (the header and the phone bar carry the call) and maps the accepted crops; each section
 * goes through `fillPreset` (slots, schema, repairComposition, validateComposition); a section joins the page only when the
 * whole spec gains no issue (`semanticIssues`); the tokens go through `enforceDesign` (ground, contrast). A section that
 * fails is dropped, not the page; a hero that fails fails the rebuild.
 */
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import {
  DIRECTIONS,
  FONT_PAIRS,
  GENERATED_DECOR_EXCLUDED_INTENTS,
  MAX_SLOT_INDEX,
  SLOTS,
  WORDMARK_STYLES,
  enforceDesign,
  fillPreset,
  groundOf,
  hasSlotMarker,
  intentOfSection,
  luminance,
  presetSection,
  semanticIssues,
  slotValue,
  walkStrings,
  validateSite,
  wordmarkFits,
  type ComposedProps,
  type CompositionPreset,
  type Design,
  type ImageAsset,
  type PresetSources,
  type Section,
  type SiteSpec,
  type VocabKey,
  KIND_PREFIX,
} from "@sb/spec";
import { inventory, type ComposeSources } from "@sb/inventory";
import { approvedVocabs, designerCatalogue } from "../prompts.ts";
import type { ModelRequest } from "../llm/client.ts";
import { HEADLINE_MAX, LEAD_MAX, keptCopy, digitRuns } from "./director.ts";

const Box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Box = z.infer<typeof Box>;

export const RebuildAnswer = z.object({
  tokens: z.object({
    colors: z.record(z.string(), z.string()),
    pairing: z.string(),
    radius: z.number().optional(),
    headingWeight: z.number().optional(),
    headingCase: z.string().optional(),
    density: z.string().optional(),
    wordmark: z.string().optional(),
  }),
  photoRegions: z.array(z.object({ image: z.string(), box: Box })).max(16).default([]),
  crops: z.array(z.object({ id: z.string(), box: Box, shows: z.string(), alt: z.string(), contains: z.array(z.string()).default([]) })).max(8).default([]),
  sections: z
    .array(
      z.object({
        intent: z.string(),
        tone: z.string().optional(),
        copy: z.object({ headline: z.string().optional(), lead: z.string().optional() }).optional(),
        props: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(10),
});
export type RebuildAnswer = z.infer<typeof RebuildAnswer>;

/** Literal (slot-free) text kept only for short labels: buttons, fact labels, small section titles. */
export const LABEL_MAX = 48;
/** Intents a rebuilt homepage may use. */
export const REBUILD_INTENTS = ["hero", "story", "highlights", "steps", "services", "products", "menu", "rooms", "prices", "gallery", "faq", "team", "hours", "area", "notice", "call", "contact"] as const;
const TONES = new Set(["default", "alt", "inverse", "band"]);
const ROLES = ["background", "surface", "text", "muted", "primary", "onPrimary", "accent", "border", "inverse", "onInverse", "band", "onBand"] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;
/** A crop reference in the rebuild's props: "{crop.1}" for the crop with id "crop1". */
const CROP_REF = /^\{crop\.(\d)\}$/;

const SYSTEM = `You rebuild a painted homepage mockup in our composition language. Code fills in the client's facts and checks every rule; you decide the layout, so stay close to the mockup's idea, rhythm, scale and colour.

Answer with ONE JSON object and nothing else:
{
  "tokens": {
    "colors": {"background": "#rrggbb", "surface", "text", "muted", "primary", "onPrimary", "accent", "border", "inverse", "onInverse", "band", "onBand"},
    "pairing": one of the font pair ids given,
    "radius": 0..12, "headingWeight": 400..900, "headingCase": "normal"|"uppercase", "density": "compact"|"regular"|"airy",
    "wordmark": one of the wordmark styles given, or "none"
  },
  "photoRegions": [{"image": "<the client photo's id>", "box": {"x", "y", "w", "h"}}],
  "crops": [{"id": "crop1", "box": {"x", "y", "w", "h"}, "shows": "what the art is, in English", "alt": "the same in Slovene", "contains": []}],
  "sections": [{"intent": "...", "tone": "default"|"alt"|"inverse"|"band", "copy": {"headline": "...", "lead": "..."}, "props": { composed section props }}]
}

Sections: 4 to 7, top to bottom as in the mockup. The first is the hero (intent "hero", the page's only level-1 heading). The opening hours, the address and the phone must be on the page (a contact section near the end, unless the mockup shows them elsewhere). Intents: ${REBUILD_INTENTS.join(", ")}. "props" is a composed section's props exactly as the catalogue below defines them (intent, width, rows, elements with desk and phone places, background, …); props.intent equals the section's intent.

Words and facts (hard rules):
- Every fact and every sentence reaches the page through a slot marker, never as your own text: names, the phone, the address, hours (the hours element), offerings, prices, people, steps, questions. The slots this business has are listed with their values; a slot not listed has no value and its element would be dropped.
- Your own words are only: per section "copy.headline" (at most 70 characters) and "copy.lead" (at most 220), in Slovene, placed with {copy.headline} and {copy.lead}; and short labels written literally (button labels, a fact's label, a small heading such as "Delovni čas"), at most ${LABEL_MAX} characters. A paragraph, list item, quote or ribbon written as literal text is removed by code.
- No numbers in your own words unless they are in the facts. No superlatives or filler ("vrhunski", "kakovost", "dobrodošli"), no English, no em dash, formal "vi".
- No call buttons: an action with action "call" is removed by code (the header and the phone bar carry the call). Show the phone as a fact with treatment "numeral", value "{business.phone}" and link {"action": "call"}. At most one other action per section.

Pictures:
- Where the mockup shows one of the client's photos, use that photo's real id (img_…) in an image, photos or photo-ground layer, and list the region in photoRegions. Never a crop for a client photo.
- crops: at most 3 pieces of decorative art painted in the mockup (a drawn plant, an ornament, a printed pattern, an object drawn in ink) that you want on the page as a labelled AI picture. Box in mockup pixels, tight around the art. Never a crop with people, faces, hands, buildings or premises, signs, any text or letters, logos, a photo, or the client's work; "contains" lists any of those it holds (then code refuses it). Place a crop with an image element whose image is "{crop.1}" for crop1, "{crop.2}" for crop2; only in hero, story, highlights, services, steps, notice, area, hours, faq, call or contact sections.
- A business without photos gets no photos: type, colour fields, drawings and crops only.

Colour (code enforces contrast, so pick what matches the mockup):
- background: the page ground: #ffffff, a light tint (never cream or beige) or a deep dark colour. A saturated colour from the mockup goes to band (a section with tone "band", or a field layer with role "band") with onBand as its text colour; inverse/onInverse is the dark or contrasting field; surface the quiet alternate ground (tone "alt"); primary the button and accent colour, onPrimary the text on it.
- Text on its ground at least 4.5:1, large type at least 3:1, accent on inverse at least 3:1.

Layout:
- Desktop: 12 columns; running text spans 4 to 8 columns; text never overlaps text. Display sizes (6 to 8) at most twice on the whole page. The hero's headline at size 6 or 7 with measure "l" across at least 7 columns, so it sets in two or three lines and the lead shows on the first 1280×800 screen too. Phones: every element gets phone.order; images may bleed.
- Keep the mockup's signature move where the language can say it (a colour field, a huge headline, a photo bled to the edge, a crop beside the type). Leave out what it can't build rather than faking it.
- Fonts: only the font pair ids given; never ask for condensed faces.`;

export interface RebuildInput {
  spec: SiteSpec;
  sources: ComposeSources;
  /** The mockup as a base64 JPEG and its size. */
  mockup: { jpegBase64: string; width: number; height: number };
  /** The client's photos for vision: id, its description, base64 JPEG. */
  photos: { id: string; alt: string; jpegBase64: string }[];
  /** The art director's direction, and the hero copy that passed the checks. */
  direction: { name: string; idea: string; signature: string; composition: string; pairing: string };
  heroCopy: { headline?: string; lead?: string };
  /** Approved wordmark styles that fit the name (empty when the business has a logo). */
  wordmarks: readonly string[];
}

/** The slots with a value for this business, as the rebuild sees them ("{business.phone}" = "041 555 906"). */
export function slotTable(sources: ComposeSources): string[] {
  const src: PresetSources = { business: sources.business, ...(sources.images ? { images: sources.images } : {}), ...(sources.brief ? { brief: sources.brief } : {}) };
  const out: string[] = [];
  const show = (name: string): boolean => {
    const v = slotValue(name, src);
    if (v === undefined) return false;
    const text = typeof v === "string" ? v : "amount" in v ? `${v.from ? "from " : ""}${v.amount} €${v.unit ? ` ${v.unit}` : ""}` : "(no price given: shows a marked placeholder)";
    out.push(`{${name}} = ${JSON.stringify(text.length > 70 ? `${text.slice(0, 67)}…` : text)}`);
    return true;
  };
  for (const pattern of Object.keys(SLOTS)) {
    if (pattern.startsWith("copy.") || pattern === "images[]" || pattern === "photos[]") continue;
    if (!pattern.includes("[]")) {
      show(pattern);
      continue;
    }
    for (let i = 0; i <= MAX_SLOT_INDEX; i++) if (!show(pattern.replace("[]", `[${i}]`))) break;
  }
  return out;
}

/** The rebuild's request: the catalogue and rules as system blocks, the mockup and photos as images. */
export function rebuildRequest(input: RebuildInput): ModelRequest {
  const approved = new Set(inventory().all().filter((a) => a.status === "approved").map((a) => a.id));
  const catalogue = designerCatalogue({ compact: true, approved });
  const { spec, sources, photos } = input;
  const todays = Object.entries(sources.copy)
    .filter(([, c]) => c?.headline || c?.lead)
    .map(([intent, c]) => `- ${intent}: ${[c?.headline, c?.lead].filter(Boolean).join(" / ")}`);
  const text = [
    `The mockup above is ${input.mockup.width}×${input.mockup.height} px; boxes are in its pixels.`,
    `Business: ${spec.business.name} (${spec.business.type}). Own logo: ${spec.assets.logo ? "yes (the header shows it)" : "no"}.`,
    `Direction "${input.direction.name}": ${input.direction.idea}\nSignature: ${input.direction.signature}\nComposition: ${input.direction.composition}\nFont pair the art director chose: ${input.direction.pairing}`,
    `Hero copy (use it, or improve it within the rules): ${[input.heroCopy.headline, input.heroCopy.lead].filter(Boolean).join(" / ") || "none"}`,
    photos.length ? `The client's photos (attached after the mockup, in this order):\n${photos.map((p) => `- ${p.id}: ${p.alt || "no description"}`).join("\n")}` : "The business has no photos.",
    `Slots with a value:\n${slotTable(sources).join("\n")}`,
    todays.length ? `Today's copy by section (you may reuse it as copy):\n${todays.join("\n")}` : "",
    `Font pair ids: ${FONT_PAIRS.map((p) => `${p.id} (${p.label})`).join(", ")}`,
    `Wordmark styles: ${input.wordmarks.length ? input.wordmarks.join(", ") : "none (use \"none\")"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const content: Anthropic.ContentBlockParam[] = [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: input.mockup.jpegBase64 } },
    ...photos.map((p): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.jpegBase64 } })),
    { type: "text", text },
  ];
  return { stage: "rebuild", system: [SYSTEM, catalogue], cache: false, messages: [{ role: "user", content }] };
}

// ---------- the crops ----------

/** What a crop may never show (its own words, or the kinds it says it contains). */
const NOT_DECOR =
  /\b(person|people|man|woman|child|face|portrait|hand|hands|finger|arm|body|skin|tattooed|staff|customer|building|premises|shop ?front|storefront|interior|room|sign|signage|text|letter|lettering|word|logo|photo|photograph|screenshot|work|works|product|products|izdelek|izdelki|izdelka|delo|dela|del)s?\b/i;

export interface CropVerdict {
  id: string;
  box: Box;
  alt: string;
  ok: boolean;
  reason?: string;
}

const overlap = (a: Box, b: Box): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * The crop rule: only decorative art. A crop is refused when it says it holds people, hands, premises, signs, text,
 * logos, a photo or the client's work; when it overlaps a region where the client's photo is painted (the client's
 * photos are always their real files, never a crop of the mockup); when it is tiny or a large share of the mockup;
 * past `max` crops. When the business has photos but the rebuild named no photo region, no crop can be checked against
 * them, so every crop is refused (a per-crop vision check is 1.0's).
 */
export function checkCrops(answer: Pick<RebuildAnswer, "crops" | "photoRegions">, size: { width: number; height: number }, max: number, opts: { clientPhotos: number } = { clientPhotos: 0 }): CropVerdict[] {
  let accepted = 0;
  const unmapped = opts.clientPhotos > 0 && answer.photoRegions.length === 0;
  return answer.crops.map((c) => {
    const x = Math.max(0, Math.round(c.box.x));
    const y = Math.max(0, Math.round(c.box.y));
    const box = { x, y, w: Math.min(size.width - x, Math.round(c.box.w)), h: Math.min(size.height - y, Math.round(c.box.h)) };
    const alt = c.alt.replace(/\s+/g, " ").trim().slice(0, 150);
    const refuse = (reason: string): CropVerdict => ({ id: c.id, box, alt, ok: false, reason });
    if (!/^crop[1-9]$/.test(c.id)) return refuse(`id ${c.id} is not crop1…crop9`);
    if (unmapped) return refuse("the business has photos and the rebuild gave no photo regions to check against");
    if (c.contains.length) return refuse(`contains ${c.contains.join(", ")}`);
    if (NOT_DECOR.test(c.shows)) return refuse(`shows "${c.shows.slice(0, 60)}"`);
    if (box.w < 48 || box.h < 48) return refuse("smaller than 48 px");
    if (box.w * box.h > 0.35 * size.width * size.height) return refuse("over 35 % of the mockup");
    const photo = answer.photoRegions.find((r) => overlap(box, r.box) > 0.05 * box.w * box.h);
    if (photo) return refuse(`overlaps the client's photo ${photo.image}`);
    if (!alt) return refuse("no alt text");
    if (accepted >= max) return refuse(`more than ${max} crops`);
    accepted++;
    return { id: c.id, box, alt, ok: true };
  });
}

// ---------- the props ----------

/**
 * What the model's own words are checked against: the digit runs the client gave (`known`), every word the client's
 * text, the business facts and the brief hold (`words`, lower case), and the web addresses the page may link to
 * (`urls`: the booking link, the social links, any address in the client's text).
 */
export interface LiteralContext {
  known: ReadonlySet<string>;
  words: ReadonlySet<string>;
  urls: ReadonlySet<string>;
}

const WORD = /\p{L}[\p{L}'’-]*/gu;
const normUrl = (u: string): string => u.trim().replace(/\/+$/, "").toLowerCase();

/** The literal check's context for a site: its client text, business facts and brief. */
export function literalContext(spec: SiteSpec, sources: ComposeSources, corpus: string, known: ReadonlySet<string>): LiteralContext {
  const b = spec.business;
  const text = [corpus, JSON.stringify(b), JSON.stringify(sources.brief ?? {})].join("\n");
  const words = new Set([...text.matchAll(WORD)].map((m) => m[0].toLowerCase()));
  const urls = new Set([...(b.bookingUrl ? [b.bookingUrl] : []), ...(b.social ?? []).map((s) => s.url), ...(corpus.match(/https?:\/\/[^\s"'<>)]+/g) ?? [])].map(normUrl));
  return { known, words, urls };
}

/**
 * Capitalised words in the model's own text that the client never wrote (an invented name: "Mojster Janez Novak"). The
 * first word of each sentence is skipped; everything else that starts with a capital must be among the client's words.
 */
export function unknownNames(s: string, words: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const sentence of s.split(/(?<=[.!?:])\s+/)) {
    const ws = [...sentence.matchAll(WORD)].map((m) => m[0]);
    for (const w of ws.slice(1)) if (/^\p{Lu}/u.test(w) && !knownWord(w.toLowerCase(), words)) out.push(w);
  }
  return out;
}

/**
 * A client's word in another case (Slovene declension: "Ptuj" → "na Ptuju", "Sorškega" → "Sorškem"): the two share a
 * stem of at least 4 letters that leaves at most 3 letters of ending on the shorter one. "Janez" is not "Jure".
 */
function knownWord(w: string, words: ReadonlySet<string>): boolean {
  if (words.has(w)) return true;
  if (w.length < 4) return false;
  for (const c of words) {
    if (c.length < 4 || c.slice(0, 4) !== w.slice(0, 4)) continue;
    let n = 4;
    while (n < w.length && n < c.length && w[n] === c[n]) n++;
    if (n >= Math.min(w.length, c.length) - 3) return true;
  }
  return false;
}

/** A literal (slot-free) label is kept when short, with no number and no name the client never gave. */
function literalOk(s: string, ctx: LiteralContext, max = LABEL_MAX): boolean {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= max && digitRuns(t).every((n) => ctx.known.has(n)) && unknownNames(t, ctx.words).length === 0 && !/https?:\/\/|www\./i.test(t);
}
const slotted = (s: unknown): s is string => typeof s === "string" && hasSlotMarker(s);

/** A web address the page may link to: only the business's own (booking, social, or one in the client's text). */
const urlOk = (u: unknown, ctx: LiteralContext): boolean => typeof u === "string" && ctx.urls.has(normUrl(u));

/** The vocabulary each asset field names, so only approved inventory assets reach a page. */
type Vocabs = Record<VocabKey, readonly string[]>;
let approvedCache: Vocabs | undefined;
const VOCAB_PREFIX: Partial<Record<VocabKey, string>> = {
  MASKS: KIND_PREFIX.mask,
  IMAGE_TREATMENTS: KIND_PREFIX.treatment,
  TEXTURES: KIND_PREFIX.texture,
  EDGES: KIND_PREFIX.divider,
  FACT_OBJECTS: KIND_PREFIX.factObject,
  TYPE_TREATMENTS: KIND_PREFIX.typeTreatment,
  MOTIONS: KIND_PREFIX.motion,
};
/**
 * The names a rebuilt page may use: the designer's offer (starters plus approved assets), less any whose inventory
 * asset is not approved (a starter the owner rejected in the approval round goes too).
 */
export function rebuildVocabs(): Vocabs {
  if (approvedCache) return approvedCache;
  const reg = inventory();
  const offered = approvedVocabs(new Set(reg.all().filter((a) => a.status === "approved").map((a) => a.id)));
  const out = {} as Record<VocabKey, readonly string[]>;
  for (const key of Object.keys(offered) as VocabKey[]) {
    const prefix = key === "DRAWINGS" || key === "REPEATABLE" ? "" : VOCAB_PREFIX[key];
    out[key] = prefix === undefined ? offered[key] : offered[key].filter((n) => {
      const a = reg.byId(prefix ? `${prefix}/${n}` : n);
      return !a || a.status === "approved";
    });
  }
  approvedCache = out;
  return out;
}
const inVocab = (v: Vocabs, key: VocabKey, value: unknown): boolean => typeof value !== "string" || v[key].includes(value);

/**
 * The rebuild's props for one section as a preset's props: crop references mapped to their image ids (or left as an
 * unknown slot, so fillPreset drops the element), call buttons removed, literal sentences removed, labels kept when
 * short and free of numbers the client never gave. Mutates and returns `props`; `dropped` hears what went.
 */
export function sanitiseProps(props: Record<string, unknown>, intent: string, ctx: LiteralContext, crops: ReadonlyMap<string, string>, dropped: string[], where: string): Record<string, unknown> {
  props.intent = intent;
  const decorOk = !(GENERATED_DECOR_EXCLUDED_INTENTS as readonly string[]).includes(intent);
  const els = Array.isArray(props.elements) ? (props.elements as Record<string, unknown>[]) : [];
  const keep: Record<string, unknown>[] = [];
  const note = (what: string) => dropped.push(`${where}: ${what}`);
  for (const e of els) {
    if (!e || typeof e !== "object") continue;
    const id = String(e.id ?? e.kind);
    const lit = (key: string, max = LABEL_MAX): boolean => {
      const v = e[key];
      if (v === undefined || slotted(v)) return true;
      if (typeof v === "string" && literalOk(v, ctx, max)) return true;
      note(`${id}.${key} literal text removed`);
      delete e[key];
      return false;
    };
    switch (e.kind) {
      case "action":
        if (e.action === "call") {
          note(`${id}: call button removed (the header and phone bar carry the call)`);
          continue;
        }
        if (!lit("label", 32)) continue;
        break;
      case "heading":
        if (!lit("text")) continue;
        break;
      case "fact":
        if (!slotted(e.value)) {
          note(`${id}: fact value is not a slot`);
          continue;
        }
        lit("label", 60);
        break;
      case "text": {
        const ps = Array.isArray(e.paragraphs) ? e.paragraphs.filter(slotted) : [];
        if (ps.length !== (Array.isArray(e.paragraphs) ? e.paragraphs.length : 0)) note(`${id}: literal paragraphs removed`);
        if (!ps.length) continue;
        e.paragraphs = ps;
        break;
      }
      case "list": {
        const items = (Array.isArray(e.items) ? e.items : []).filter((it: unknown) => (typeof it === "string" ? slotted(it) : !!it && typeof it === "object" && slotted((it as { text?: unknown }).text) && (slotted((it as { lead?: unknown }).lead) || (typeof (it as { lead?: unknown }).lead === "string" && literalOk((it as { lead: string }).lead, ctx, 24)))));
        if (items.length !== (Array.isArray(e.items) ? e.items.length : 0)) note(`${id}: literal list items removed`);
        if (!items.length) continue;
        e.items = items;
        break;
      }
      case "ribbon": {
        const items = (Array.isArray(e.items) ? e.items : []).filter((it: unknown) => slotted(it) || (typeof it === "string" && literalOk(it, ctx, 24)));
        if (!items.length) continue;
        e.items = items;
        break;
      }
      case "sticker":
        if (!lit("text", 32)) continue;
        break;
      case "quote":
        if (!slotted(e.text)) {
          note(`${id}: quote is not the client's words`);
          continue;
        }
        if (e.by !== undefined && !slotted(e.by)) delete e.by;
        break;
      case "prices": {
        const items = (Array.isArray(e.items) ? e.items : []).filter((it: unknown) => {
          const o = it as { name?: unknown; price?: unknown; note?: unknown };
          if (o?.note !== undefined && !slotted(o.note)) delete o.note;
          return !!o && slotted(o.name) && slotted(o.price);
        });
        if (!items.length) continue;
        e.items = items;
        break;
      }
      case "steps":
      case "qa": {
        const items = (Array.isArray(e.items) ? e.items : []).filter((it: unknown) => Object.values((it ?? {}) as Record<string, unknown>).every(slotted));
        if (!items.length) continue;
        e.items = items;
        break;
      }
      case "map":
        if (e.cross !== undefined && !slotted(e.cross)) delete e.cross;
        if (e.note !== undefined && !slotted(e.note)) delete e.note;
        break;
      case "photos":
        if (Array.isArray(e.captions) && !e.captions.every(slotted)) delete e.captions;
        if (Array.isArray(e.images) && e.images.some((i) => typeof i === "string" && CROP_REF.test(i))) {
          note(`${id}: a crop can't be one of a set of photos`);
          continue;
        }
        break;
      case "iconFacts":
        if (Array.isArray(e.items)) for (const it of e.items as Record<string, unknown>[]) if (it?.note !== undefined && !slotted(it.note)) delete it.note;
        break;
      case "image": {
        const m = typeof e.image === "string" ? CROP_REF.exec(e.image) : null;
        if (m) {
          const id2 = crops.get(`crop${m[1]}`);
          if (!id2) note(`${id}: crop${m[1]} was refused`);
          else if (!decorOk) note(`${id}: no AI picture in a ${intent} section`);
          // An unknown slot is no value: fillPreset drops the element and closes its gap.
          else e.image = id2;
        }
        break;
      }
    }
    // Links: a web address only when it is the business's own (booking, social, or in the client's text).
    const link = e.link as { url?: unknown; target?: { url?: unknown } } | undefined;
    const url = link?.url ?? link?.target?.url;
    if (url !== undefined && !urlOk(url, ctx)) {
      note(`${id}: link to ${String(url).slice(0, 60)} removed (not the business's own address)`);
      if (e.kind === "action") continue;
      delete e.link;
    }
    let stray: string | undefined;
    walkStrings(e, (s) => {
      if (!stray && /https?:\/\/|www\./i.test(s) && !urlOk(s, ctx)) stray = s;
    });
    if (stray) {
      note(`${id}: web address ${stray.slice(0, 60)} removed`);
      continue;
    }
    // Inventory assets: only approved (or starter) ones; a draft or rejected drawing, mask, treatment or marker goes.
    const v = rebuildVocabs();
    if (!inVocab(v, "DRAWINGS", e.drawing)) {
      note(`${id}: drawing ${String(e.drawing)} is not approved`);
      if (e.kind === "decor") continue;
      delete e.drawing;
      if (e.marker === "drawing") e.marker = "dot";
    }
    if (e.kind === "ribbon" && !inVocab(v, "DRAWINGS", e.separator)) delete e.separator;
    if (!inVocab(v, "MASKS", e.mask)) {
      note(`${id}: mask ${String(e.mask)} is not approved`);
      delete e.mask;
    }
    if (e.kind === "heading" && !inVocab(v, "TYPE_TREATMENTS", e.treatment)) {
      note(`${id}: treatment ${String(e.treatment)} is not approved`);
      delete e.treatment;
    }
    if ((e.kind === "image" || e.kind === "photos") && !inVocab(v, "IMAGE_TREATMENTS", e.treatment)) {
      note(`${id}: treatment ${String(e.treatment)} is not approved`);
      delete e.treatment;
    }
    if (e.kind === "fact" && !inVocab(v, "FACT_OBJECTS", e.treatment)) {
      note(`${id}: fact object ${String(e.treatment)} is not approved`);
      if (!v.FACT_OBJECTS.includes("numeral")) continue;
      e.treatment = "numeral";
    }
    // A crop anywhere else (a photo ground, a heading's fill) stays an unknown slot and goes with its element or layer.
    keep.push(e);
  }
  props.elements = keep;
  const v = rebuildVocabs();
  const surface = props.surface as { texture?: unknown } | undefined;
  if (surface && !inVocab(v, "TEXTURES", surface.texture)) delete surface.texture;
  const top = props.top as { edge?: unknown; drawing?: unknown } | undefined;
  if (top && (!inVocab(v, "EDGES", top.edge) || !inVocab(v, "DRAWINGS", top.drawing))) {
    dropped.push(`${where}: top edge not approved`);
    delete props.top;
  }
  if (!inVocab(v, "MOTIONS", props.motion)) delete props.motion;
  if (Array.isArray(props.background))
    props.background = (props.background as Record<string, unknown>[]).filter((l) => {
      const ok = inVocab(v, "DRAWINGS", l?.drawing) && inVocab(v, "IMAGE_TREATMENTS", l?.treatment);
      if (!ok) dropped.push(`${where}: background layer with an unapproved drawing or treatment removed`);
      return ok;
    });
  if (Array.isArray(props.background)) props.background = (props.background as Record<string, unknown>[]).filter((l) => !(typeof l?.image === "string" && CROP_REF.test(l.image)));
  if (Array.isArray(props.background) && !(props.background as unknown[]).length) delete props.background;
  return props;
}

// ---------- the page ----------

export class RebuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RebuildError";
  }
}

/** A plain direction for the page ground (the picked genome lets the tokens leave the direction's ranges). */
function directionFor(type: string, background: string): (typeof DIRECTIONS)[number] {
  const g = groundOf(background);
  const ground = g === "other" ? (luminance(background) > 0.25 ? "white" : "dark") : g;
  const plain = DIRECTIONS.filter((d) => !d.template);
  return plain.find((d) => d.palette.background === ground && (d.bestFor as readonly string[]).includes(type)) ?? plain.find((d) => d.palette.background === ground) ?? plain[0]!;
}

/** The page's design from the rebuild's tokens, inside the rules (enforceDesign: ground, contrast, the type system). */
export function rebuildDesign(base: SiteSpec, t: RebuildAnswer["tokens"], idea: string): Design {
  const colors = { ...base.design.colors };
  for (const r of ROLES) {
    const v = t.colors[r];
    if (typeof v === "string" && HEX.test(v)) colors[r] = v.toLowerCase();
  }
  const dir = directionFor(base.business.type, colors.background);
  const radius = Math.max(0, Math.min(12, Math.round(t.radius ?? 4)));
  const design: Design = {
    direction: dir.id,
    fontPair: FONT_PAIRS.some((p) => p.id === t.pairing) ? t.pairing : base.design.fontPair,
    colors,
    radius,
    baseFontSize: 17,
    scale: 1.28,
    headingWeight: Math.max(400, Math.min(900, Math.round((t.headingWeight ?? 700) / 50) * 50)),
    headingCase: t.headingCase === "uppercase" ? "uppercase" : "normal",
    headingTracking: -0.01,
    density: t.density === "compact" || t.density === "airy" ? t.density : "regular",
    shadow: "none",
    imagery: "natural",
    motion: "calm",
    ...(base.design.seed ? { seed: base.design.seed } : {}),
    genome: { source: "picked", palette: "preset", rhythm: "alternate", shape: radius <= 2 ? "square" : "soft" },
    art: { idea: idea.replace(/\s+/g, " ").trim().slice(0, 160) || "Mockup" },
  };
  return enforceDesign(design, dir);
}

const issueKey = (i: { path: string; message: string }): string => `${i.path}|${i.message}`;
const home = (spec: SiteSpec) => spec.pages.find((p) => p.kind === "home")!;

/** Whether adding `next` gives the spec no issue it didn't have. */
function addsNoIssue(spec: SiteSpec, sections: Section[], next: Section): string | null {
  home(spec).sections = sections;
  const before = new Set(semanticIssues(spec).map(issueKey));
  home(spec).sections = [...sections, next];
  const added = semanticIssues(spec).filter((i) => !before.has(issueKey(i)));
  home(spec).sections = sections;
  return added.length ? added.slice(0, 2).map((i) => `${i.path} ${i.message}`).join("; ") : null;
}

export interface RebuiltPage {
  spec: SiteSpec;
  /** The sections placed, as "intent" (or "kept:<intent>" for today's section kept for the contact). */
  sections: string[];
  dropped: string[];
}

/**
 * The homepage from the rebuild's answer over today's spec: today's business, other pages and chrome; the rebuild's
 * tokens and sections; `crops` (crop id → image asset, already cut and stored) as labelled AI pictures. Throws
 * RebuildError when the hero can't be built or fewer than 3 sections remain.
 */
export function assembleRebuild(input: {
  base: SiteSpec;
  sources: ComposeSources;
  answer: RebuildAnswer;
  heroCopy: { headline?: string; lead?: string };
  /** The literal check's context (literalContext). */
  literal: LiteralContext;
  crops: ReadonlyMap<string, ImageAsset>;
  idea: string;
}): RebuiltPage {
  const { answer, literal, sources } = input;
  const known = literal.known;
  /** The model's copy, unless it names someone or something the client never did. */
  const named = (s: string | undefined, what: string): string | undefined => {
    const names = s ? unknownNames(s, literal.words) : [];
    if (names.length) dropped.push(`${what}: ${names.join(", ")} not in the client's words`);
    return names.length ? undefined : s;
  };
  const spec = structuredClone(input.base);
  const baseSections = home(spec).sections.slice();
  const dropped: string[] = [];
  spec.design = rebuildDesign(spec, answer.tokens, input.idea);
  delete spec.design.wordmark;
  spec.assets.images.push(...[...input.crops.values()]);
  const cropIds = new Map([...input.crops].map(([k, a]) => [k, a.id]));
  const images = spec.assets.images.map((i) => ({ id: i.id, origin: i.origin ?? ("client" as const) }));
  home(spec).sections = [];

  const sections: Section[] = [];
  const placed: string[] = [];
  const seen = new Map<string, number>();
  for (const [i, s] of answer.sections.entries()) {
    const intent = s.intent;
    const where = `section ${i + 1} (${intent})`;
    if (!(REBUILD_INTENTS as readonly string[]).includes(intent) || (intent === "hero" && i > 0)) {
      dropped.push(`${where}: intent not allowed here`);
      continue;
    }
    if (i === 0 && intent !== "hero") throw new RebuildError("the first section is not the hero");
    const nth = seen.get(intent) ?? 0;
    if (nth >= 2) {
      dropped.push(`${where}: a third section of the intent`);
      continue;
    }
    const headline = named(keptCopy(s.copy?.headline, HEADLINE_MAX, known, dropped, `${where} headline`), `${where} headline`);
    const lead = named(keptCopy(s.copy?.lead, LEAD_MAX, known, dropped, `${where} lead`), `${where} lead`);
    const todays = nth === 0 ? sources.copy[intent] : undefined;
    const hero = intent === "hero" ? input.heroCopy : undefined;
    const copy = { ...todays, ...hero, ...(headline ? { headline } : {}), ...(lead ? { lead } : {}) };
    const props = sanitiseProps(structuredClone(s.props), intent, literal, cropIds, dropped, where);
    const tone = s.tone && TONES.has(s.tone) ? (s.tone as "default" | "alt" | "inverse" | "band") : undefined;
    const preset: CompositionPreset = { id: `composition/${intent}/mockup-${i + 1}`, ...(tone && tone !== "default" ? { tone } : {}), props: props as unknown as CompositionPreset["props"] };
    const src: PresetSources = { business: sources.business, images, ...(sources.brief ? { brief: sources.brief } : {}), colors: spec.design.colors, ...(copy.headline || copy.lead ? { copy } : {}) };
    const filled = fillPreset(preset, src);
    if (!filled.ok) {
      const why = `${filled.reason}${filled.missing.length ? ` (no value: ${filled.missing.slice(0, 4).join(", ")})` : ""}${filled.issues.length ? `: ${filled.issues.slice(0, 2).join("; ")}` : ""}`;
      if (intent === "hero") throw new RebuildError(`the hero can't be built: ${why}`.slice(0, 300));
      dropped.push(`${where}: ${why}`.slice(0, 300));
      continue;
    }
    // A long headline at a display size sets in five or six lines and pushes the lead off the first screen: the size
    // follows the headline's length (the rebuild's prompt asks for it; code holds it).
    for (const e of filled.props.elements) {
      if (e.kind !== "heading" || e.level !== 1) continue;
      const cap = e.text.length <= 24 ? 8 : e.text.length <= 40 ? 6 : 5;
      if (e.size > cap) {
        dropped.push(`${where}: h1 size ${e.size} → ${cap} for a ${e.text.length}-character headline`);
        e.size = cap;
      }
    }
    for (const d of filled.dropped) dropped.push(`${where}: ${d.id} dropped${d.missing.length ? ` (no value: ${d.missing.join(", ")})` : ""}`);
    const section = presetSection(preset, filled.props as ComposedProps, nth === 0 ? `s_${intent}` : `s_${intent}_${nth + 1}`) as unknown as Section;
    const issue = addsNoIssue(spec, sections, section);
    if (issue) {
      if (intent === "hero") throw new RebuildError(`the hero breaks a page rule: ${issue}`.slice(0, 300));
      dropped.push(`${where}: ${issue}`.slice(0, 300));
      continue;
    }
    sections.push(section);
    placed.push(intent);
    seen.set(intent, nth + 1);
  }
  // The hours and the contact stay on the homepage (mobile checklist): today's section when the rebuild lost them.
  const showsHours = () => placed.includes("hours") || sections.some((s) => JSON.stringify(s.props).includes('"kind":"hours"'));
  for (const intent of ["contact", "hours"] as const) {
    if (intent === "contact" ? placed.includes("contact") || placed.includes("kept:contact") : showsHours()) continue;
    const own = baseSections.find((s) => intentOfSection(s) === intent);
    if (own && !addsNoIssue(spec, sections, own)) {
      sections.push(own);
      placed.push(`kept:${intent}`);
    }
  }
  if (sections.length < 3) throw new RebuildError(`only ${sections.length} sections could be built`);
  home(spec).sections = sections;

  // The wordmark, when the business has no logo and the page still validates with it.
  const w = answer.tokens.wordmark;
  if (!spec.assets.logo && w && (WORDMARK_STYLES as readonly string[]).includes(w) && inventory().byId(`wordmark/${w}`)?.status === "approved" && wordmarkFits(spec.business.name, w as never, "header")) {
    const before = new Set(semanticIssues(spec).map(issueKey));
    spec.design.wordmark = { style: w as never };
    if (!semanticIssues(spec).every((x) => before.has(issueKey(x)))) delete spec.design.wordmark;
  }
  // Crops no section kept are not stored on the page.
  const used = JSON.stringify(spec.pages);
  spec.assets.images = spec.assets.images.filter((img) => img.origin !== "generated" || ![...input.crops.values()].some((c) => c.id === img.id) || used.includes(`"${img.id}"`));
  const v = validateSite(spec);
  if (!v.ok) throw new RebuildError(`does not validate: ${v.issues.slice(0, 3).map((i) => `${i.path} ${i.message}`).join("; ")}`);
  return { spec: v.spec, sections: placed, dropped };
}

/** The approved wordmark styles that fit the business name (none when it has a logo). */
export function rebuildWordmarks(spec: SiteSpec): string[] {
  if (spec.assets.logo) return [];
  return WORDMARK_STYLES.filter((w) => inventory().byId(`wordmark/${w}`)?.status === "approved" && wordmarkFits(spec.business.name, w, "header"));
}
