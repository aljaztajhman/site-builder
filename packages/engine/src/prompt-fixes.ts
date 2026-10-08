import type { AppConfig } from "@sb/config";
import { SECTION_DEFS, SECTION_LABEL, WARM_SURFACE_DIRECTIONS, type DesignRepairOptions, type Direction } from "@sb/spec";

/**
 * The audit's prompt fixes (docs/plans/audit-2026-10-01.md, "Prompts: what to change"; docs/dev/prompt-fixes.md),
 * each behind its own config switch (`promptFixes`). This file holds only the new wording; prompts.ts builds the
 * prompts from it. With every switch off the prompts are byte-identical to the constants in prompts.ts (cached blocks
 * stay cached, recordings replay strictly): each fix swaps an exact old passage, and `swap` throws when the old
 * passage is gone, so a later edit to the old wording can't silently turn a fix into a no-op.
 */
export type PromptFixes = AppConfig["promptFixes"];

export const NO_PROMPT_FIXES: PromptFixes = {
  pictures: false,
  critique: false,
  altText: false,
  judge: false,
  brief: false,
  classifier: false,
  edit: false,
  directions: false,
  warmSurface: false,
  oneHero: false,
  beige: false,
  catalogue: false,
  sloveneStyle: false,
};
export const ALL_PROMPT_FIXES: PromptFixes = {
  pictures: true,
  critique: true,
  altText: true,
  judge: true,
  brief: true,
  classifier: true,
  edit: true,
  directions: true,
  warmSurface: true,
  oneHero: true,
  beige: true,
  catalogue: true,
  sloveneStyle: true,
};

/** `text` with `from` replaced by `to`; throws when `from` isn't in it (the fix would silently do nothing). */
export function swap(text: string, from: string, to: string): string {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`prompt fix: passage not found: ${from.slice(0, 80)}`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

/** The design repairs the switches turn on (spec enforceDesign). */
export const designRepair = (f: PromptFixes): DesignRepairOptions => ({ ...(f.beige ? { beige: true } : {}), ...(f.warmSurface ? { warmSurface: true } : {}) });

// ---------- catalogue: RULES and section catalogue wording ----------

export const RULES_MOBILE_FIRST = `- Mobile first: most visitors are on a phone. Put the most useful information (what, where, when, how to contact) near the top of the homepage.`;
export const RULES_RESPONSIVE = `- Responsive: every site must be excellent on a desktop screen (1280 px and wider) and on a phone (360 px) alike. Put the most useful information (what, where, when, how to contact) near the top of the homepage.
- One primary action per screen. Call and directions are already one tap away (the header on desktop, a fixed bar on phones), so the hero's primary action is the most useful step that isn't a call (the services, the menu, booking, an enquiry), unless phoning is the only way to buy. Besides the header and the phone bar, at most one call button on a page.`;
export const RULES_PLACEHOLDER_OLD = `use the placeholder object {"$placeholder": "<kind>"} where the schema allows it, or leave the section out.`;
export const RULES_PLACEHOLDER_NEW = `leave the optional field or the section out; use the placeholder object {"$placeholder": "<kind>"} only for a fact the section can't do without (e.g. a price list the client asked for without prices).`;

/** The hero eyebrow's description in the props schemas (packages/spec/src/sections/heroes.ts). */
export const HERO_EYEBROW_OLD = "Short plain label above the headline, e.g. the town or trade. Not numbered.";
export const HERO_EYEBROW_NEW =
  'Optional; usually leave it out. Use it only for one short fact from the brief the headline doesn\'t carry (e.g. "Brez napotnice", "Odprto tudi ob sobotah"). Never just the trade or the town: the header already names the business. Not numbered.';

/** Section descriptions: [old passage, new passage] per section type. */
export const CATALOGUE_DESCRIPTIONS: Record<string, [string, string]> = {
  "contact-strip": [
    "use it right after the hero on local-business homepages.",
    "use it on homepages whose visitors mostly come to call, find or visit the business; it may follow the hero or a section that first says what the business does.",
  ],
  cta: [
    "Use near the end of a page; best on the inverse tone.",
    "Use only for an action the visitor hasn't been offered yet (booking, ordering, the menu, rooms), never to repeat call or directions: the phone bar and the footer already do. Best on the inverse tone.",
  ],
};

// ---------- sloveneStyle: the Slovene style block (content, edit, critique) ----------

/**
 * Audit item 4 (docs/plans/audit-2026-10-01.md): register, typography, English words and word order, placed right
 * after the rules in the content, edit and critique prompts. The eval's Slovene lint (tools/eval/src/slovene-lint.ts)
 * checks the same points in code.
 */
export const SLOVENE_STYLE = `Slovene style, for every visible text (copy, headings, buttons, labels, alt text):
- Address visitors formally in the plural everywhere, buttons and labels included: vi, vas, vam, vaš; "Pokličite nas", "Rezervirajte mizo"; never ti forms ("Pokliči", "tvoj", "boš"). We together with the visitor is plural, never dual: "skupaj poiščemo", not "skupaj poiščeva".
- Slovene typography: quotes „…“, the spaced en dash " – " (never "—" or a spaced hyphen), a decimal comma and a space before units, € and % ("4,20 €", "5 km", "10 %"), number ranges with an unspaced en dash ("8–16"), the ellipsis "…".
- No English where Slovene has a word, even when the client used one: "prevzem v trgovini", not "click & collect"; "na spletu", not "online"; "e-pošta", not "mail". The names of the business, its people, products and brands stay as the client wrote them.
- Natural Slovene word order and idiom, as the owner would say it at the counter, not translated from English ("vsak dan", not "na dnevni bazi"). Headings in sentence case, never Title Case.`;

// ---------- pictures: the brief's imageIdeas ----------

export const IMAGE_IDEAS_OLD = `- imageIdeas: exactly as many as "Generated pictures allowed" in the message (0: an empty list). Atmosphere pictures we can generate for this business: materials, tools, ingredients or products the client names, or the landscape around their town. Never people's faces, staff or customers; never the client's own premises, shop front, rooms, signs or any text; never results of the client's work (haircuts, repairs, dishes they cook, finished jobs) — a generated picture must not pass for the business itself. subject: one concrete scene in English; alt: the same in Slovene.`;
export const IMAGE_IDEAS_NEW = `- imageIdeas: exactly as many as "Generated pictures allowed" in the message (0: an empty list). Atmosphere pictures we can generate for this business, tied to its own trade and town: the materials, tools, ingredients or products this client names, where they are really used, with signs of use, in ordinary Slovenian surroundings. A landscape or a view of the town only when the business sells the place itself (a tourist farm, rooms, a mountain hut). Never people or any part of a person (faces, hands, arms); never the client's own premises, shop front, rooms, signs or any text; never results of the client's work (haircuts, repairs, dishes they cook, finished jobs): a generated picture must not pass for the business itself. The first idea is the hero picture: a wider scene with the subject in the middle third and calm space around it; the others are closer details. subject: one concrete scene in English that gives what, where, the light, the camera distance and the angle. Good: "Copper pipe fittings and a pipe wrench on a scuffed workbench in a basement boiler room, daylight from a small window, medium shot at waist height". Bad: "Vineyard hills at sunset" (not this trade), "Neatly arranged tools on white marble" (styled, looks like stock). alt: the same picture in Slovene.`;

// ---------- brief: its own rules instead of the site's RULES ----------

export const BRIEF_RULES = `Rules for the brief:
- Never invent facts. Facts, offerings, prices, people and highlights come only from the client's text; anything not stated stays null or empty.
- Slovene text (summary, audience, highlights, nav labels, missing) is natural, correct Slovene; imageIdeas subjects are English.`;
export const BRIEF_FACTS_OLD = `Do not infer an email from a business name, do not guess a postal code, do not complete partial data.`;
export const BRIEF_FACTS_NEW = `${BRIEF_FACTS_OLD} address: the street with its house number, the postal code and the town as the client wrote them ("Glavni trg 9, 8000 Novo mesto": street "Glavni trg 9", postalCode "8000", city "Novo mesto"); null only when the client gave no street address.`;

// ---------- classifier ----------

export const CLASSIFY_CONFIDENCE_OLD = `Return the type and your confidence.`;
export const CLASSIFY_CONFIDENCE_NEW = `Return the type and your confidence from 0 to 1: 0.8–1 when the text clearly describes a business of that type; 0.5–0.8 when it is a business that fits the type only roughly; at most 0.5 when it is a business but no type fits; 0–0.2 when the text doesn't describe a business at all (a test, a question, random words, an empty greeting).`;

// ---------- design and directions ----------

export const DESIGN_AVOID_LINE = `\nAvoid: cream or off-white page backgrounds, pill shapes, gradients, glassmorphism, heavy shadows, italic accent words, monospace labels.`;

/** Direction summaries that still promised photos toned in black and white or the brand colour (since PR #23 photos keep their colour). */
export const DIRECTION_SUMMARIES: Record<string, [string, string]> = {
  industrial: ["safety-yellow buttons and rules, black-and-white photos, square corners", "safety-yellow buttons and rules, square-cut photos in their true colours, square corners"],
  "soft-studio": [
    "blush alternate sections and photos toned in the brand colour (duotone) so mixed phone photos look consistent. Calm and personal. Choose for hairdressers, beauty and massage studios and small boutiques, especially when photos vary in quality.",
    "blush alternate sections and softly rounded photos in their true colours. Calm and personal. Choose for hairdressers, beauty and massage studios and small boutiques.",
  ],
};

/** What an imagery treatment does now, for the model (monochrome and duotone only shape photos; colours stay true). */
const IMAGERY_WORDS: Record<string, string> = {
  monochrome: "square-cut photos in their true colours",
  duotone: "softly rounded photos in their true colours",
};

/** Homepage hero lists the directions fix: editorial had no photo hero and offered page-header:plain on the homepage. */
const DIRECTION_HEROES: Record<string, string[]> = {
  editorial: ["hero-type:large", "hero-split:image-right"],
};

export const directionSummary = (d: Direction, f: PromptFixes): string => {
  const fix = f.directions ? DIRECTION_SUMMARIES[d.id] : undefined;
  return fix ? swap(d.summary, fix[0], fix[1]) : d.summary;
};
export const imageryWords = (d: Direction, f: PromptFixes): string => (f.directions ? (IMAGERY_WORDS[d.imagery] ?? d.imagery) : d.imagery);
export const directionHeroes = (d: Direction, f: PromptFixes): string[] => (f.directions ? (DIRECTION_HEROES[d.id] ?? d.layout.heroes) : d.layout.heroes);

// ---------- alt text ----------

export const ALT_SYSTEM_FIXED = `You write alt text in Slovene for photos a small business gave for its own website; the business type and the owner's own description come with the photos. Describe what matters for a visitor who can't see the image, in the business's context ("Sveži hlebci kruha na lesenem pultu pekarne", not "Kruh na mizi"), in one sentence of at most 150 characters, without "slika" or "fotografija" at the start. Name only what the photo shows: no names, places or claims from the description that you can't see.
Also give the focal point (x, y from 0 to 1: the subject a crop must keep) and heroSuitable. heroSuitable is true only when the photo is sharp and well lit, still works cropped to 4:3 and to a square around the focal point, and shows the business's place, work or products. It is false for logos, documents, screenshots, price lists and menus as text, dark, blurry or cluttered shots, and close-ups that say nothing about the business.`;

/** The business context the alt-text request carries with the fix (the owner's text, shortened). */
export function altContext(c: { businessType?: string; name?: string; description?: string }): string {
  const lines = [c.name ? `Business: ${c.name}${c.businessType ? ` (${c.businessType})` : ""}.` : c.businessType ? `Business type: ${c.businessType}.` : ""];
  if (c.description) lines.push(`The owner's description:\n"""\n${c.description.slice(0, 1500)}\n"""`);
  return lines.filter(Boolean).join("\n");
}

// ---------- critique ----------

export const CRITIQUE_INTRO_OLD = "against the banned patterns and the mobile checklist,";
export const CRITIQUE_INTRO_NEW = "against the banned patterns, the priorities and the checklist below,";
export const CRITIQUE_CHECKLIST_OLD = `Mobile checklist: click-to-call and directions reachable in one tap; body text ≥ 16 px; no horizontal scroll at 360 px; primary tap targets ≥ 44×44 px and ≥ 8 px apart; LCP image preloaded; opening hours and contact visible on the homepage without hunting.`;
export const CRITIQUE_CHECKLIST_NEW = `Fix these first, in this order:
1. The same action or fact twice on one screen: two call buttons, the phone or address in the hero and again in the section right below it, a closing call band that repeats the hero.
2. A type-only homepage hero (hero-type) although a hero-suitable photo exists (their ids come with the screenshots): switch it to one of the direction's picture heroes with that photo.
3. Eyebrows that only repeat the trade or the town: remove them; the header already names the business.
4. Copy: first person as the business, one number per claim and only from the client's text, plural and never dual under vikanje ("skupaj poiščemo", not "skupaj poiščeva"), no English words.
Checklist: click-to-call and directions reachable in one tap; no horizontal scroll at 360 px; opening hours and contact visible on the homepage without hunting.
Slovene: change a word only when it is clearly wrong (spelling, grammar, a wrong case or form). Never swap a correct word for one you prefer ("terasico" stays "terasico").
Automated check failures that come from a component's own styling (text size, tap target size, contrast inside a component) can't be fixed in the spec: note them in issues, and never delete or shorten content because of them.`;
export const CRITIQUE_FORMAT_OLD = `Return JSON: {"issues": [...], "patches": [...]}`;
export const CRITIQUE_FORMAT_NEW = `Answer with JSON only, no prose before or after it:
{"issues": ["<one short note per problem>"], "patches": [{"op": "remove", "path": "/pages/0/sections/0/props/eyebrow"}]}`;
export const heroSuitableLine = (ids: string[]): string => `Hero-suitable photos: ${ids.length ? ids.join(", ") : "none"}.`;

// ---------- chat edit ----------

/** The editor's Slovene section names (what owners call sections in requests), for the cached edit system block. */
export function sectionNamesForEdits(): string {
  const types = SECTION_DEFS.filter((d) => !d.systemOnly && !d.ownerOnly).map((d) => d.type);
  return `Section names the owner sees in the editor (requests may use them): ${types.filter((t) => SECTION_LABEL[t]).map((t) => `"${SECTION_LABEL[t]}" = ${t}`).join("; ")}.`;
}
export const EDIT_REPLY_OLD = `- Write the reply in first person plural`;
export const EDIT_REPLY_NEW = `- Write the reply in the language of the client's request (Slovene unless the request is in another language), in first person plural`;

// ---------- warm surfaces (chat edits) ----------

export const EDIT_COLOUR_OLD = `- Colour requests change /design/colors (code keeps contrast).`;
export const EDIT_COLOUR_NEW = `- Colour requests change /design/colors (code keeps contrast). For warmer colours on a warm direction (${WARM_SURFACE_DIRECTIONS.join(", ")}) the section surface may become a warm tint too (peach, apricot, terracotta-tinted, e.g. #f3ddce); cream and beige are banned, and code turns them into such a tint.`;
