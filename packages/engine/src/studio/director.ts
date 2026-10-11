/**
 * Design studio 0.5 (docs/plans/studio-0.5.md): the director. One Opus call (stage `director`, structured output) that
 * reads the brief, the photos, the facts that exist and the approved shortlist, and picks the page: a stance, the
 * sections in order with a preset each, a palette, a pairing, a wordmark, and the hero's headline and lead (Slovene).
 * It writes no facts: numbers, hours, prices, names and places reach the page only through the presets' slots.
 *
 * `checkDirection` turns the answer into the composer's choice: ids outside the shortlist are dropped (the composer
 * picks its own for them), copy that is too long or holds a number the client never gave is dropped (the preset then
 * uses today's copy for that section).
 */
import { z } from "zod";
import type { ChoiceSection, ComposeChoice, ComposeSources, StudioShortlist } from "@sb/inventory";
import type { SiteSpec } from "@sb/spec";
import type { ModelRequest } from "../llm/client.ts";

/** Trade props (number plates, price tags, signposts, dockets, stamps) per page: one accent at most (owner, 2026-10-11). */
export const MAX_PROPS = 1;
export const HEADLINE_MAX = 80;
export const LEAD_MAX = 260;

export const DirectorAnswer = z.object({
  idea: z.string().min(1).max(400),
  stance: z.string(),
  sections: z.array(z.object({ intent: z.string(), preset: z.string() })).min(1).max(12),
  palette: z.string(),
  pairing: z.string(),
  wordmark: z.string(),
  copy: z.object({
    hero: z.object({ headline: z.string(), lead: z.string() }),
    sections: z.array(z.object({ intent: z.string(), headline: z.string() })).max(12),
  }),
});
export type DirectorAnswer = z.infer<typeof DirectorAnswer>;

const NO_WORDMARK = "none";

/** The answer's JSON Schema: every id an enum of the shortlist, so a valid answer can only name what is offered. */
export function directorSchema(s: StudioShortlist): Record<string, unknown> {
  const str = { type: "string" };
  const en = (values: string[]) => ({ type: "string", enum: values.length ? values : [NO_WORDMARK] });
  const intents = Object.keys(s.presets);
  const presets = Object.values(s.presets).flatMap((l) => l.map((e) => e.id));
  return {
    type: "object",
    additionalProperties: false,
    required: ["idea", "stance", "sections", "palette", "pairing", "wordmark", "copy"],
    properties: {
      idea: { ...str, description: "One sentence in English: the page's concept." },
      stance: en(s.stances.map((x) => x.id)),
      sections: {
        type: "array",
        description: "The homepage's sections top to bottom, hero first, contact last.",
        items: { type: "object", additionalProperties: false, required: ["intent", "preset"], properties: { intent: en(intents), preset: en(presets) } },
      },
      palette: en(s.palettes.map((x) => x.id)),
      pairing: en(s.pairings.map((x) => x.id)),
      wordmark: en([...s.wordmarks.map((x) => x.id), NO_WORDMARK]),
      copy: {
        type: "object",
        additionalProperties: false,
        required: ["hero", "sections"],
        properties: {
          hero: { type: "object", additionalProperties: false, required: ["headline", "lead"], properties: { headline: str, lead: str } },
          sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["intent", "headline"], properties: { intent: en(intents), headline: str } } },
        },
      },
    },
  };
}

const SYSTEM = `You are the art director of a small studio that makes homepages for Slovenian small businesses. You choose; code builds.

You get one business (its brief, its photos, the facts it gave, today's copy) and a shortlist of approved design assets: stances (named visual languages), section presets per intent, palettes, font pairings and wordmark styles. Pick one coherent page:

- idea: one sentence, the page's concept: why this stance for this business, what the first screen says.
- stance: the visual language that suits this business best. Prefer one with character over a safe neutral one. The page's idea comes from this business (its work, its photos, its words), never from a trade prop.
- Presets marked PROP (number plates, price tags, signposts, dockets, receipts, stamps) are at most one accent on the whole page, and only when this business's own facts call for it (a number plate only around the phone number). Strong general layouts (type-led, photo-led, colour fields, editorial, poster) come first.
- sections: 5 to 8 sections top to bottom. The hero first, the contact last. Each section is an intent with one preset of that intent from the shortlist; an intent at most twice, with two different presets. Use only intents listed. Choose presets that read as one language with the stance; vary rhythm (dense, airy, photo, type) down the page.
- palette, pairing, wordmark: from the shortlist, in keeping with the stance ("none" when the business has its own logo or none suits).
- copy, in Slovene, formal "vi", natural and specific to this business: the hero's headline (at most 70 characters) and lead (at most 220 characters), and a short headline for other sections where you want one.

Hard rules:
- Never invent facts. No numbers of any kind, no years, prices, hours, phone numbers, addresses, names, ratings, awards, guarantees or statistics unless they appear word for word in the facts given. The page fills real facts in by itself.
- No superlatives or empty claims ("najboljši", "vrhunski", "št. 1", "kakovost na prvem mestu").
- No English words in the copy.`;

const line = (e: { id: string; line: string }): string => `- ${e.id}: ${e.line}`;

/** The director's request. */
export function directorRequest(input: { spec: SiteSpec; sources: ComposeSources; shortlist: StudioShortlist }): ModelRequest & { schema: Record<string, unknown> } {
  const { spec, sources, shortlist: s } = input;
  const b = spec.business;
  const brief = sources.brief ?? {};
  const has = (v: unknown): string => (v === undefined || v === null || (typeof v === "object" && "$placeholder" in (v as object)) ? "no" : "yes");
  const offerings = (brief.offerings ?? []).map((o) => `- ${o.name}${o.price ? " (has a price)" : ""}${o.description ? `: ${o.description}` : ""}`);
  const photos = spec.assets.images.map((i) => `- ${i.id} (${i.origin ?? "client"}${i.width && i.height ? `, ${i.width >= i.height ? "landscape" : "portrait"}` : ""}): ${i.alt || "no description"}`);
  const copy = Object.entries(sources.copy)
    .filter(([, c]) => c?.headline || c?.lead)
    .map(([intent, c]) => `- ${intent}: ${[c?.headline, c?.lead].filter(Boolean).join(" / ")}`);
  const user = [
    `Business: ${b.name} (${b.type}${b.subtype ? `, ${b.subtype}` : ""})`,
    `Facts given: phone ${has(b.phone)}, email ${has(b.email)}, address ${has(b.address)}, opening hours ${has(b.hours)}, own logo ${spec.assets.logo ? "yes" : "no"}, people named ${brief.facts?.people?.length ?? 0}, process steps ${brief.steps?.length ?? 0}, questions and answers ${brief.faq?.length ?? 0}`,
    brief.summary ? `Summary: ${brief.summary}` : "",
    brief.highlights?.length ? `Highlights:\n${brief.highlights.map((h) => `- ${h}`).join("\n")}` : "",
    offerings.length ? `Offerings:\n${offerings.join("\n")}` : "",
    `Photos:\n${photos.length ? photos.join("\n") : "- none"}`,
    copy.length ? `Today's copy by intent:\n${copy.join("\n")}` : "",
    "",
    "SHORTLIST",
    `Stances:\n${s.stances.map(line).join("\n")}`,
    `Section presets by intent:\n${Object.entries(s.presets)
      .map(([intent, list]) => `${intent}:\n${list.map(line).join("\n")}`)
      .join("\n")}`,
    `Palettes (background / primary / text):\n${s.palettes.map(line).join("\n")}`,
    `Font pairings:\n${s.pairings.map(line).join("\n")}`,
    `Wordmarks:\n${s.wordmarks.length ? s.wordmarks.map(line).join("\n") : "- none offered"}`,
  ]
    .filter((x) => x !== "")
    .join("\n\n");
  return { stage: "director", system: [SYSTEM], cache: false, messages: [{ role: "user", content: user }], schema: directorSchema(s) };
}

/** Every run of digits in a text, and every phone-like group of runs ("041 555 906") as its digits ("041555906"). */
const numbersIn = (s: string): string[] => [...(s.match(/\d+/g) ?? []), ...(s.match(/\d[\d\s/.-]{4,}\d/g) ?? []).map((g) => g.replace(/\D/g, "")).filter((g) => g.length >= 6)];

/** The digit runs the client gave: their own text, the business facts, the brief. */
export function knownNumbers(spec: SiteSpec, sources: ComposeSources, corpus: string): Set<string> {
  return new Set([...numbersIn(corpus), ...numbersIn(JSON.stringify(spec.business)), ...numbersIn(JSON.stringify(sources.brief ?? {}))]);
}

/** Copy the guards keep: within its length, and no number the client didn't give. Undefined when it can't be kept. */
function keptCopy(s: string | undefined, max: number, known: ReadonlySet<string>, dropped: string[], where: string): string | undefined {
  const t = s?.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  if (t.length > max) {
    dropped.push(`${where}: longer than ${max}`);
    return undefined;
  }
  const unknown = numbersIn(t).filter((n) => !known.has(n));
  if (unknown.length) {
    dropped.push(`${where}: number ${unknown.join(", ")} not in the client's facts`);
    return undefined;
  }
  return t;
}

export interface CheckedDirection {
  stance: string | null;
  choice: ComposeChoice;
  /** What was dropped and why. */
  dropped: string[];
}

/** The director's answer as the composer's choice: only shortlist ids, only copy the guards keep. */
export function checkDirection(a: DirectorAnswer, s: StudioShortlist, known: ReadonlySet<string>): CheckedDirection {
  const dropped: string[] = [];
  const inList = (list: { id: string }[], id: string, what: string): string | undefined => {
    if (list.some((e) => e.id === id)) return id;
    if (id !== NO_WORDMARK) dropped.push(`${what} ${id} not in the shortlist`);
    return undefined;
  };
  const stance = inList(s.stances, a.stance, "stance") ?? null;
  // The k-th headline the director wrote for an intent belongs to its k-th section of that intent.
  const headlines = new Map<string, (string | undefined)[]>();
  for (const c of a.copy.sections) {
    if (c.intent === "hero") continue;
    const list = headlines.get(c.intent) ?? [];
    list.push(keptCopy(c.headline, HEADLINE_MAX, known, dropped, `${c.intent} headline`));
    headlines.set(c.intent, list);
  }
  const hh = keptCopy(a.copy.hero.headline, HEADLINE_MAX, known, dropped, "hero headline");
  const hl = keptCopy(a.copy.hero.lead, LEAD_MAX, known, dropped, "hero lead");
  const seen = new Map<string, number>();
  let props = 0;
  const sections: ChoiceSection[] = a.sections.map((x) => {
    const k = seen.get(x.intent) ?? 0;
    seen.set(x.intent, k + 1);
    const entry = (s.presets[x.intent] ?? []).find((e) => e.id === x.preset);
    let ok = !!entry;
    if (!ok) dropped.push(`section ${x.intent} ${x.preset} not in the shortlist`);
    // A prop is one accent per page at most: a second one loses its preset (the composer picks a plain one, props capped).
    if (entry?.prop && props++ >= MAX_PROPS) {
      ok = false;
      dropped.push(`section ${x.intent} ${x.preset}: more than ${MAX_PROPS} prop on the page`);
    }
    const headline = x.intent === "hero" ? (k === 0 ? hh : undefined) : headlines.get(x.intent)?.[k];
    const lead = x.intent === "hero" && k === 0 ? hl : undefined;
    const copy = headline || lead ? { ...(headline ? { headline } : {}), ...(lead ? { lead } : {}) } : undefined;
    return { intent: x.intent, ...(ok ? { preset: x.preset } : {}), ...(copy ? { copy } : {}) };
  });
  // The hero's copy reaches the page even when the director left the hero out of its sections.
  if (!sections.some((x) => x.intent === "hero") && (hh || hl)) sections.unshift({ intent: "hero", copy: { ...(hh ? { headline: hh } : {}), ...(hl ? { lead: hl } : {}) } });
  const palette = inList(s.palettes, a.palette, "palette");
  const pairing = inList(s.pairings, a.pairing, "pairing");
  const wordmark = inList(s.wordmarks, a.wordmark, "wordmark");
  const choice: ComposeChoice = {
    ...(palette ? { palette } : {}),
    ...(pairing ? { pairing } : {}),
    ...(wordmark ? { wordmark } : {}),
    ...(sections.length ? { sections } : {}),
  };
  return { stance, choice, dropped };
}
