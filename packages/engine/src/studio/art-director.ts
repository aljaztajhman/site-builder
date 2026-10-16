/**
 * Studio 0.5b, the mockup pipeline (docs/plans/studio-0.5.md, docs/plans/mockup-spike.md spike 2): the art director.
 * One Opus call (stage `artDirector`, structured output) that sees the client's photos and logo (vision), the brief and
 * the facts, and writes ONE direction for the homepage: the idea, a palette with roles, a type character mapped to one of
 * the font pairs a page can set, the composition, the imagery, one signature move, the hero's headline and lead in
 * Slovene, and the full prompt for the image model that paints the mockup. The texts the mockup must carry are appended
 * to that prompt by code (`mockupTexts`), verbatim from the spec: the image never gets a fact the client didn't give.
 */
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { FONT_PAIRS, formatAddress, formatPhoneNational, hoursRows, isPlaceholder, type SiteSpec } from "@sb/spec";
import type { ComposeSources } from "@sb/inventory";
import type { ModelRequest } from "../llm/client.ts";

const HEX = /^#[0-9a-fA-F]{6}$/;
const ROLES = ["background", "surface", "text", "muted", "primary", "onPrimary", "accent", "border", "inverse", "onInverse", "band", "onBand"] as const;

/** Free description, cut to `max` characters (it only feeds the rebuild's prompt and the logs). */
const prose = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

export const ArtDirection = z.object({
  name: prose(80).pipe(z.string().min(1)),
  idea: prose(400).pipe(z.string().min(1)),
  palette: z.array(z.object({ role: z.string(), hex: z.string() })).min(3).max(14),
  pairing: z.string(),
  typeCharacter: prose(800),
  composition: prose(3000),
  imagery: prose(1200),
  signature: prose(800),
  copy: z.object({ headline: z.string(), lead: z.string() }),
  imagePrompt: z.string().min(40).max(8000),
});
export type ArtDirection = z.infer<typeof ArtDirection>;

/**
 * The answer's JSON Schema (structured output): the pairing is one of the font pairs a page can set. `direct`: no image
 * model reads the image prompt, so it is only the first screen in a sentence or two (the schema's shape is the same).
 */
export function artDirectorSchema(direct = false): Record<string, unknown> {
  const str = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "idea", "palette", "pairing", "typeCharacter", "composition", "imagery", "signature", "copy", "imagePrompt"],
    properties: {
      name: { ...str, description: "Two or three words naming the direction." },
      idea: { ...str, description: "One sentence in English: the page's idea, from this business." },
      palette: {
        type: "array",
        description: "5 to 8 colours with their roles on the page.",
        items: { type: "object", additionalProperties: false, required: ["role", "hex"], properties: { role: { type: "string", enum: [...ROLES] }, hex: { ...str, description: "#rrggbb" } } },
      },
      pairing: { type: "string", enum: FONT_PAIRS.map((p) => p.id) },
      typeCharacter: { ...str, description: "The type's character in a sentence, and how the pairing is used (sizes, weight, case)." },
      composition: { ...str, description: "The first screen and the next sections, top to bottom, on the 12-column grid." },
      imagery: { ...str, description: "How the client's photos are used, and any drawn or printed art (what, where, on which ground)." },
      signature: { ...str, description: "The one move a visitor remembers." },
      copy: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "lead"],
        properties: { headline: { ...str, description: "The hero's headline in Slovene, at most 70 characters." }, lead: { ...str, description: "The hero's lead in Slovene, at most 220 characters." } },
      },
      imagePrompt: direct
        ? { ...str, description: "No image model reads this: the first screen in one or two English sentences, for the composer (at least 40 characters)." }
        : { ...str, description: "The complete prompt for the image model, in English (the required texts are appended by code)." },
    },
  };
}

const PAIRS = FONT_PAIRS.map((p) => `- ${p.id}: ${p.label} (${p.heading.fallback === "serif" ? "serif" : "sans"} headings, ${p.body.fallback === "serif" ? "serif" : "sans"} text)`).join("\n");

/**
 * What differs when there is no image model (studio.mode "direct"): the composer builds the page from the direction's
 * words, so the direction carries the whole design and decorative art comes only from the layout system's own drawings.
 */
const MODE_TEXT = {
  mockup: {
    intro: "An image model (GPT Image 2.5) paints the homepage as one desktop mockup from your prompt; a second designer then rebuilds that mockup in our layout system, with the client's real photos and facts.",
    colour: "the rebuild enforces these; a mockup that breaks them can't be rebuilt as painted",
    art: "- Drawn, printed or painted decorative art (botanical lines, an ornament, a pattern, an object drawn in ink): it is cut out of the mockup and shown as a labelled AI picture, so paint each piece on a plain ground, apart from any text, with no letters, people, hands, buildings, signs or logos in it, and never as a stand-in for the client's own work.",
    prompt:
      "The image prompt (English): one flat full-page screenshot of the desktop homepage at the size given, no browser window, no device frame, no perspective; describe colours by hex, type by character (the pairing's faces by name), and the layout section by section precisely enough to rebuild. Use the attached photographs as the website's photos (recognisable, cropped as a designer would); never invent other photos. Do not list the page's texts: code appends them verbatim.",
  },
  direct: {
    intro: "There is no image model: a second designer composes the homepage directly in our layout system from your direction alone, with the client's real photos and facts. Your words are all it has to go on, so the composition, palette, type and imagery must be precise enough to build without a picture.",
    colour: "code enforces these",
    art: "- No painted or generated pictures: imagery is the client's own photos, type, colour fields and the layout system's simple line drawings and ornaments.",
    prompt:
      "The image prompt: there is no image model. Write one or two sentences in English that sum up the first screen for the composer (what fills it, the scale of the type, the colour field); the composition carries the rest, section by section, with columns, sizes and grounds.",
  },
} as const;

const system = (mode: keyof typeof MODE_TEXT): string => {
  const t = MODE_TEXT[mode];
  return `You are the art director of a studio that designs one-of-a-kind websites for small Slovenian businesses. ${t.intro} So it must be buildable, and it must be this business and no other.

The owner's taste: bold, characterful, immersive; unmistakably this business; never a template, never a safe default. Find the idea in what this business really is and does: its work, its photos, its words, its place.

Write ONE direction.

Banned on every page (hard rules):
- cream, beige, ivory or off-white page grounds; the "cream page with a warm serif" look
- decorative gradients, gradient text, glassmorphism, heavy drop shadows
- everything centred; the default row of three icon cards; pill-shaped buttons; emoji as icons
- italic accent words inside headings; numbered section labels (01 / 02); monospace or uppercase tracked eyebrow labels
- pure black #000000 or pure white #ffffff text
- more than one call button on a screen; more than one primary action in the hero
- invented facts: no reviews, stars, prices, awards, years, numbers, extra people, extra services or slogans beyond the texts given
- no faces of people; for a business without photos no photos at all (drawn, printed, painted or typographic imagery instead)

Trade props: number plates, price tags, receipts, dockets, tickets, stamps, enamel signs and the like are at most one small accent on the whole page, and never the idea.

Colour and contrast (${t.colour}):
- The page ground is pure white #ffffff, a light tint (very light, never cream or beige), or a deep near-black or deep dark colour. A saturated colour (a red, a rust, a green, a blue) is a full-width section field or band, not the page ground.
- Body text on its ground at least 4.5:1; large headings at least 3:1. Any colour used as text on the inverse or band field must reach that on it too. Prefer one strong colour plus ink and paper over many mid tones.

What the layout system can build (stay inside it):
- Full-width sections stacked top to bottom. Each section is a 12-column grid with 1 to 8 rows on desktop; on phones the same elements stack in one column (two small ones may pair up).
- Per section: a colour field behind the whole section or part of its columns; large display type up to about 12vw (one h1 on the page); running text spanning 4 to 8 columns; lists; the phone as a large numeral; opening hours as a table, a compact list or a week strip; the address and a simple schematic map; one action button; a strip or ribbon of short words; the client's photos cropped, masked (arch, circle, cut corners) and bled to the page edge; one photo as a section ground under a flat colour scrim; small overlaps of a photo and type, never text over text; rules and dividers; a simple line drawing or ornament.
${t.art}
- It cannot build 3D, video, curved text, hand lettering, collages of cut-out photos, text inside pictures, or a single drawn line running through several sections.
- Fonts: only these pairings exist (no condensed or poster faces such as Anton, Bebas or Oswald; never ask for one). Pick the pairing and describe its use:
${PAIRS}

${t.prompt}

The hero copy (Slovene, formal "vi"): a headline of at most 70 characters and a lead of at most 220, natural and specific to this business. No numbers of any kind unless they appear in the facts given, no superlatives, no filler ("vrhunski", "kakovost na prvem mestu", "dobrodošli"), no English, no em dash.`;
};
const SYSTEM = { mockup: system("mockup"), direct: system("direct") };

export interface ArtDirectorInput {
  spec: SiteSpec;
  sources: ComposeSources;
  /** The client's photos for vision: id, its description, base64 JPEG. */
  photos: { id: string; alt: string; jpegBase64: string }[];
  /** The logo as a base64 PNG, when the client gave one. */
  logoPngBase64?: string;
  /** The mockup's size in pixels (mockup mode). */
  size?: { width: number; height: number };
  /**
   * studio.mode "direct": no image model; the direction is written for a composer who works from its words alone
   * (stage artDirectorDirect).
   */
  direct?: boolean;
}

const has = (v: unknown): boolean => v !== undefined && v !== null && !(typeof v === "object" && "$placeholder" in (v as object));

/** The art director's request. */
export function artDirectorRequest(input: ArtDirectorInput): ModelRequest & { schema: Record<string, unknown> } {
  const { spec, sources, photos } = input;
  const b = spec.business;
  const brief = sources.brief ?? {};
  const offerings = (brief.offerings ?? []).map((o) => `- ${o.name}${o.description ? `: ${o.description}` : ""}`);
  const copy = Object.entries(sources.copy)
    .filter(([, c]) => c?.headline || c?.lead)
    .map(([intent, c]) => `- ${intent}: ${[c?.headline, c?.lead].filter(Boolean).join(" / ")}`);
  const text = [
    `Business: ${b.name} (${b.type}${b.subtype ? `, ${b.subtype}` : ""})${has(b.address) ? `, ${formatAddress(b.address as Exclude<typeof b.address, { $placeholder: string }>)}` : ""}`,
    `Facts given: phone ${has(b.phone) ? "yes" : "no"}, email ${has(b.email) ? "yes" : "no"}, address ${has(b.address) ? "yes" : "no"}, opening hours ${has(b.hours) ? "yes" : "no"}, own logo ${input.logoPngBase64 ? "yes (attached last)" : "no"}, people named ${brief.facts?.people?.length ?? 0}`,
    brief.summary ? `Summary: ${brief.summary}` : "",
    brief.highlights?.length ? `Highlights:\n${brief.highlights.map((h) => `- ${h}`).join("\n")}` : "",
    offerings.length ? `Offerings:\n${offerings.join("\n")}` : "",
    photos.length ? `Photos (attached in this order):\n${photos.map((p) => `- ${p.id}: ${p.alt || "no description"}`).join("\n")}` : "The business has no photographs: no photos on the page at all.",
    copy.length ? `Today's copy by section:\n${copy.join("\n")}` : "",
    input.size && !input.direct ? `Mockup size: ${input.size.width}×${input.size.height} px.` : "",
  ]
    .filter((x) => x !== "")
    .join("\n\n");
  const content: Anthropic.ContentBlockParam[] = [
    ...photos.map((p): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.jpegBase64 } })),
    ...(input.logoPngBase64 ? [{ type: "image", source: { type: "base64", media_type: "image/png", data: input.logoPngBase64 } } satisfies Anthropic.ImageBlockParam] : []),
    { type: "text", text },
  ];
  const direct = input.direct === true;
  return { stage: direct ? "artDirectorDirect" : "artDirector", system: [SYSTEM[direct ? "direct" : "mockup"]], cache: false, messages: [{ role: "user", content }], schema: artDirectorSchema(direct) };
}

/** The palette as roles → hex (valid #rrggbb only, the last one per role). */
export function paletteRoles(d: ArtDirection): Partial<Record<(typeof ROLES)[number], string>> {
  const out: Partial<Record<(typeof ROLES)[number], string>> = {};
  for (const p of d.palette) if ((ROLES as readonly string[]).includes(p.role) && HEX.test(p.hex)) out[p.role as (typeof ROLES)[number]] = p.hex.toLowerCase();
  return out;
}

/**
 * The texts the mockup carries, verbatim from the spec and the checked hero copy: the name or logo, the navigation, the
 * headline and lead, the offerings, the hours, the address, the phone with one call button. Nothing else.
 */
export function mockupTexts(spec: SiteSpec, sources: ComposeSources, hero: { headline?: string; lead?: string }): string {
  const b = spec.business;
  const nav = spec.pages.filter((p) => p.nav.show).map((p) => `"${p.nav.label}"`);
  const offerings = (sources.brief?.offerings ?? []).slice(0, 6).map((o) => o.name.trim()).filter(Boolean);
  const lines = [
    spec.assets.logo ? `- the logo (attached) for "${b.name}"` : `- the business name "${b.name}" set as a typographic wordmark`,
    nav.length ? `- navigation: ${nav.join(", ")}` : "",
    hero.headline ? `- headline: "${hero.headline}"` : "",
    hero.lead ? `- intro: "${hero.lead}"` : "",
    offerings.length ? `- a section listing: ${offerings.join(", ")}` : "",
    b.hours && !isPlaceholder(b.hours) ? `- opening hours: ${hoursRows(b.hours).map((r) => `"${r.days} ${r.value}"`).join(", ")}` : "",
    b.address && !isPlaceholder(b.address) ? `- address: "${formatAddress(b.address)}"` : "",
    typeof b.phone === "string" && !isPlaceholder(b.phone) ? `- phone: "${formatPhoneNational(b.phone)}" with one button "Pokličite"` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/** The image prompt as sent: the art director's prompt, the photo note, and the required texts verbatim. */
export function mockupPrompt(d: ArtDirection, texts: string, opts: { photos: boolean; logo: boolean }): string {
  const refs = opts.photos
    ? "\n\nUse the attached photographs as the website's photos (keep them recognisable, crop them as a designer would, do not redraw them or add other photos)."
    : "\n\nThe business has no photographs: no photos anywhere on the page.";
  const logo = opts.logo ? " The last attached image is the business's logo." : "";
  return `${d.imagePrompt.trim()}${refs}${logo}\n\nRequired texts, verbatim and spelled exactly (use only these; every word legible; no other words, numbers, reviews or prices):\n${texts}`;
}
