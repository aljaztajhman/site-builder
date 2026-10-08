import { z } from "zod";
import { BANNED_PHRASES, Business, DIRECTIONS, SECTION_DEFS, toModelJsonSchema, type Motif } from "@sb/spec";

/**
 * Static prompt parts. They must be byte-stable across calls so prompt caching works:
 * no timestamps, ids or per-request data here.
 */

export const RULES = `Hard rules for every generated website:
- Copy is natural, correct Slovene (unless told otherwise): short sentences, concrete, specific to this business. Use the client's own facts and wording where possible.
- Voice: the site speaks as the business, in the first person, and addresses visitors formally (vi, vas, vam). Plural by default: "Pečemo vsak dan", "Pri nas …", "Pomagamo vam …". Singular only when the client's text is clearly one person working alone (written as "sem …", "delam …"): "Sem Tina Kos, diplomirana fizioterapevtka. Pomagam vam …". Choose singular or plural once and keep it in every sentence on every page, calls to action included ("pokličite me" with singular, "pokličite nas" with plural). Never describe the business or its people in the third person ("Salon nudi …", "Obravnave izvaja …", "Tina vam pomaga …"); the only exception is the name and role line of a team section.
- Never invent facts. No testimonials, reviews, ratings, awards, client logos, statistics, certifications, years of experience, prices, opening hours, addresses, names or phone numbers that are not in the brief. Numbers in copy must come from the brief. When a section needs a fact that is missing, use the placeholder object {"$placeholder": "<kind>"} where the schema allows it, or leave the section out.
- Contact facts (phone, email, address, hours, booking URL, legal data) are rendered by components from the business facts. Never write them into copy or link URLs; use link targets {"action":"call"|"directions"|"email"|"booking"} instead.
- Banned patterns: hero headlines like "Dobrodošli" or "Welcome to"; numbered labels like "01 / 02"; emoji; the em dash "—" (Slovene uses „…" quotes and the spaced en dash " – " or a comma); eyebrows in capital letters (write them in sentence case); filler phrases (${BANNED_PHRASES.map((b) => `"${b.label}"`).join(", ")}); more than one centred section per page; the default row of three icon feature cards (there is no icon component; don't imitate it with three identical short cards).
- Respect each text field's length limit. Headlines are specific and plain, not slogans.
- Every page starts with a hero section (home) or page-header (other pages). Use each section type at most once per page unless it clearly needs repeating.
- Mobile first: most visitors are on a phone. Put the most useful information (what, where, when, how to contact) near the top of the homepage.
- Say each thing once. On the homepage show the contact facts in exactly one place near the top: hero-type with-facts, or contact-strip (it already includes the hours), or opening-hours; never two of them. Add a contact section to the homepage only when the site has no contact page. The footer and, on phones, a fixed call/directions bar already repeat the phone and directions on every page. A highlights section is only for points no other section makes.`;

/** What each trade motif draws, for the prompts that must leave it alone. */
const MOTIF_WORDS: Record<Motif, string> = {
  plate: "number plates",
  pipes: "pipes",
  crust: "scoring cuts",
  ledger: "a paper receipt and wall-sized figures",
  label: "bottle labels and an olive branch",
  spoon: "a brass spoon and dishes as round plates",
  mirror: "mirror arches and the name as a wall-sized wordmark",
  smile: "a smile arc and the hours as a week chart",
  trail: "trail blazes, signs on a post and a mountain ridge",
  bend: "the logo's bent line and cut corners",
};
const TEMPLATES = DIRECTIONS.filter((d) => d.template);
const TEMPLATE_IDS = TEMPLATES.map((d) => d.id).join(", ");
const TEMPLATE_MOTIFS = TEMPLATES.map((d) => MOTIF_WORDS[d.template!.motif]).join(", ");

/** Catalogue of section components for the model, generated from the spec (the single source of truth). */
export function sectionCatalogue(): string {
  const lines = SECTION_DEFS.filter((d) => !d.systemOnly && !d.ownerOnly).map((d) => {
    const schema = toModelJsonSchema(d.props);
    return [
      `### ${d.type}`,
      `Variants: ${d.variants.join(", ")}. Photos: ${d.images}.`,
      d.description,
      `Mobile: ${d.mobile}`,
      `Props schema: ${JSON.stringify(schema)}`,
    ].join("\n");
  });
  return `# Section components\n\n${lines.join("\n\n")}`;
}

/** Schema of /business for edits: facts the client gives in chat (hours, address, phone) must match it exactly. */
export function businessSchema(): string {
  return `# Business facts (/business)

Schema: ${JSON.stringify(toModelJsonSchema(Business.omit({ subtype: true })))}`;
}

export function directionsCatalogue(): string {
  return `# Design directions\n\n${DIRECTIONS.map((d) =>
    [
      `### ${d.id} — ${d.name}`,
      d.summary,
      `Best for: ${d.bestFor.join(", ")}. Font pairs: ${d.fontPairs.join(", ")}. Page background: ${d.palette.background}. Imagery: ${d.imagery}.`,
      `Ranges: radius ${d.ranges.radius.join("–")}, base font ${d.ranges.baseFontSize.join("–")}px, scale ${d.ranges.scale.join("–")}, heading weight ${d.ranges.headingWeight.join("–")}, tracking ${d.ranges.headingTracking.join("–")}em, heading case ${d.ranges.headingCase.join("/")}, density ${d.ranges.density.join("/")}, shadow ${d.ranges.shadow.join("/")}.`,
      `Layout: header ${d.layout.header}, footer ${d.layout.footer}, heroes ${d.layout.heroes.join(", ")}, rhythm ${d.layout.rhythm}, prefers ${d.layout.prefer.join(", ")}.`,
      d.template ? `Hand-made trade template ${d.template.id}: first choice for ${d.template.firstFor.join(", ")}${d.template.minPhotos ? ` with at least ${d.template.minPhotos} photo` : ", with or without photos"}. Its own palette and type are fixed; primary and accent are ignored.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  ).join("\n\n")}`;
}

export const CLASSIFY_SYSTEM = `You classify Slovenian small businesses from the owner's own description into exactly one business type:
hairdresser (frizer, beauty, barber), restaurant (restavracija, gostilna, bistro, café, pizzeria), tourist-farm (turistična kmetija, apartmaji na kmetiji, glamping on a farm), car-repair (avtoservis, vulkanizer, avtokleparstvo), dental (zobozdravnik, ortodont), physio (fizioterapija, masaža with medical focus, kiropraktik), accountant (računovodstvo, knjigovodstvo, davčno svetovanje), builder (gradbeništvo, inštalater, vodovodar, električar, mizar, krovec), shop (trgovina, butik, lokalna trgovina), bakery (pekarna, slaščičarna, pekarna s kavarno).
Return the type and your confidence.`;

export const BRIEF_SYSTEM = `You turn a Slovenian small-business owner's description into a structured website brief.
${RULES}

Brief rules:
- facts: copy only what the client wrote. Phone in E.164 (+386...). Hours as day ranges with 24h HH:MM. Anything not stated is null or an empty list. Do not infer an email from a business name, do not guess a postal code, do not complete partial data.
- offerings: services, dishes, products or rooms the client listed, with prices only when the client gave them.
- pages: plan the site. The homepage (kind "home", slug "") always comes first. Add standard pages only when the content supports them (e.g. "storitve", "cenik", "jedilnik", "o-nas", "kontakt", "sobe", "galerija"). ASCII slugs, Slovene nav labels. Privacy, accessibility and 404 pages are added automatically; don't list them.
- missing: short Slovene notes on facts the client should still add (e.g. "delovni čas", "cene storitev", "matična številka").
- imageIdeas: exactly as many as "Generated pictures allowed" in the message (0: an empty list). Atmosphere pictures we can generate for this business: materials, tools, ingredients or products the client names, or the landscape around their town. Never people's faces, staff or customers; never the client's own premises, shop front, rooms, signs or any text; never results of the client's work (haircuts, repairs, dishes they cook, finished jobs) — a generated picture must not pass for the business itself. subject: one concrete scene in English; alt: the same in Slovene.`;

export const DESIGN_SYSTEM = `You are the art director for small-business websites. Pick one curated design direction and fill its tokens inside the direction's ranges. Colours: choose primary (and optionally accent) from the brand colours extracted from the logo and photos when they are usable; otherwise from the direction. Code enforces contrast and ranges afterwards, so pick what looks right, not what merely passes.
Avoid: cream or off-white page backgrounds, pill shapes, gradients, glassmorphism, heavy shadows, italic accent words, monospace labels.
Trade templates (${TEMPLATE_IDS}) are hand-made for their trades and look far more specific than the general directions: when the message names one and the business fits its description, choose it.`;

export const ALT_SYSTEM = `You write alt text in Slovene for photos on a small-business website. Describe what matters for a visitor who can't see the image, in one sentence of at most 150 characters, without "slika" or "fotografija" at the start. If a photo is a placeholder with a caption, describe the captioned subject. Also give the focal point (x, y from 0 to 1) and whether the photo works as a large hero image.`;

export const CONTENT_SYSTEM = `You write complete small-business websites as a structured site spec (JSON), in Slovene, using only the section components in the catalogue.
${RULES}`;

export const CRITIQUE_SYSTEM = `You review screenshots of a generated small-business website (mobile 360 px and desktop 1280 px) against the banned patterns and the mobile checklist, and return fixes as RFC 6902 JSON Patch operations against the site spec.
${RULES}

Mobile checklist: click-to-call and directions reachable in one tap; body text ≥ 16 px; no horizontal scroll at 360 px; primary tap targets ≥ 44×44 px and ≥ 8 px apart; LCP image preloaded; opening hours and contact visible on the homepage without hunting.
Only propose patches that change the spec (copy, section order, variants, tones, sections). Don't patch /business facts or /design colours unless a banned pattern requires it. Return an empty patch list when the site is fine.
Filler: code matches the listed filler phrases by word stem; patch other wordings of the same empty claims too (Slovene calques of "seamless", "elevate", "unlock", "empower", "cutting-edge", "in today's fast-paced world").
Facts: code has already checked every number, year, price, name and contact detail on the site against the client's own text, which you get below. Never remove or reword a fact because you think it might be invented; read the client's text instead.
Fixed elements (the phone's call/directions bar, the desktop cookie box) are hidden in the full-page screenshots. Don't report them as covering content.
Trade templates (design directions ${TEMPLATE_IDS}) are hand-made designs: their hero-signature section, the order of sections, band and inverse tones, very large headlines, figures and phone numbers, and the drawn motif (${TEMPLATE_MOTIFS}) are intended. Keep them; fix only real problems.`;

export const EDIT_SYSTEM = `You apply a client's chat request to their website by returning RFC 6902 JSON Patch operations against the site spec, plus a one-sentence reply in the client's language.
${RULES}

Edit rules:
- Change only what the request asks for. Keep ids stable; new sections get new unique ids (s_<word>), new pages p_<word>.
- Facts the client gives in the request (a new phone number, opening hours, a price) may be written to /business or the relevant section; they count as provided by the client.
- Colour requests change /design/colors (code keeps contrast). A darker or lighter header is /chrome/header/tone ("inverse" is dark, "alt" is the surface colour, "default" the page colour); section backgrounds use each section's tone.
- If a request is impossible or would break a rule, return no operations and explain briefly in the reply.
- Write the reply in first person plural, as the team that builds the site: "Dodali smo …", "Glavo smo potemnili …" (never mix singular and plural such as "sem dodali").`;

export const EditOutput = z.strictObject({
  reply: z.string().max(400),
  patches: z.array(
    z.strictObject({
      op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
      path: z.string(),
      from: z.string().optional(),
      value: z.unknown().optional(),
    }),
  ),
});
export type EditOutput = z.infer<typeof EditOutput>;

export const CritiqueOutput = z.strictObject({
  // Notes for the log, never rendered: trimmed rather than rejected. Patches are validated in full.
  issues: z.array(z.string().transform((t) => t.slice(0, 300))).transform((a) => a.slice(0, 20)),
  patches: EditOutput.shape.patches,
});
export type CritiqueOutput = z.infer<typeof CritiqueOutput>;

export const PATCH_FORMAT = `Answer with JSON only, no prose around it:
{"reply": "<one sentence>", "patches": [{"op": "replace", "path": "/pages/0/sections/1/props/title", "value": "..."}]}`;
