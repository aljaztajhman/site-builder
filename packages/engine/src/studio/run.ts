/**
 * Design studio 0.5 (docs/plans/studio-0.5.md): the live path. After today's pipeline has written the site (content and
 * the owner's facts merged), the studio recomposes the homepage: the approved shortlist (code), one director call, the
 * composer over the site's own spec, then the guards. Any failure, a throw included, returns `ok: false` with the reason,
 * and the pipeline keeps today's spec: the owner always gets a site.
 */
import { costEur as priceOf, type AppConfig } from "@sb/config";
import { ComposerError, clientWordsOnly, composeFromBase, studioShortlist, type ComposeSources, type ComposeUsed } from "@sb/inventory";
import { collectPlaceholders, intentOfSection, presetSources, validateSite, type PresetBrief, type SiteSpec } from "@sb/spec";
import { ModelOutputError, estimateCallEur, type ModelClient } from "../llm/client.ts";
import { checkFacts } from "../facts.ts";
import { DirectorAnswer, checkDirection, directorRequest, knownNumbers } from "./director.ts";

/** config designer.agent: "on" for everyone, "trial" only for the accounts in DESIGNER_TRIAL_EMAILS, "off" for no one. */
export function studioEnabled(mode: AppConfig["designer"]["agent"], email: string | null | undefined, trialEmails: string | undefined): boolean {
  if (mode === "on") return true;
  if (mode !== "trial" || !email) return false;
  const list = (trialEmails ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** A section's headline and lead, as the presets' copy slots read them. */
function copyOf(props: Record<string, unknown>): { headline?: string; lead?: string } | undefined {
  const pick = (...keys: string[]): string | undefined => keys.map((k) => props[k]).find((v): v is string => typeof v === "string" && v.trim() !== "");
  const headline = pick("headline", "title", "heading");
  const lead = pick("lead", "intro", "subheadline", "text");
  return headline || lead ? { ...(headline ? { headline } : {}), ...(lead ? { lead } : {}) } : undefined;
}

/** The composer's sources for a live site: its business and images, the brief (steps and answers only in the client's words), today's copy per intent. */
export function sourcesOf(spec: SiteSpec, brief: PresetBrief | undefined, corpus: string): ComposeSources {
  const base = presetSources(spec);
  const copy: ComposeSources["copy"] = {};
  for (const s of spec.pages.find((p) => p.kind === "home")?.sections ?? []) {
    const intent = intentOfSection(s);
    if (!intent || copy[intent]) continue;
    const c = copyOf(s.props as Record<string, unknown>);
    if (c) copy[intent] = c;
  }
  return { business: base.business, ...(base.images ? { images: base.images } : {}), brief: clientWordsOnly(brief, corpus), copy };
}

/** A whole number from the site id: the composer's seed. */
export function studioSeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 1_000_000;
}

export type StudioOutcome =
  | { ok: true; spec: SiteSpec; idea: string; stance: string; used: ComposeUsed; dropped: string[]; costEur: number }
  | { ok: false; reason: string; idea?: string; costEur: number };

export interface StudioInput {
  spec: SiteSpec;
  brief?: PresetBrief;
  /** Everything the client wrote (the fact check's corpus). */
  corpus: string;
  seed: number;
  /** The trade word drawings are named by, for a site without a subtype (fixtures only). */
  tradeWord?: string;
}

const factKeys = (spec: SiteSpec, corpus: string): Set<string> => new Set(checkFacts(spec, corpus).map((v) => `${v.kind}:${v.value}`));

/**
 * The guards on a composed site, against today's: it validates, has no fact the client didn't give that today's site
 * didn't already have, and no kind of unfilled placeholder today's site doesn't have. Null when it passes, else why not.
 */
export function studioGuards(composed: SiteSpec, today: SiteSpec, corpus: string): string | null {
  const v = validateSite(composed);
  if (!v.ok) return `does not validate: ${v.issues.slice(0, 3).map((i) => `${i.path} ${i.message}`).join("; ")}`;
  const before = factKeys(today, corpus);
  const added = [...factKeys(composed, corpus)].filter((k) => !before.has(k));
  if (added.length) return `facts not in the client's input: ${added.slice(0, 5).join(", ")}`;
  // A missing fact the owner already has to fill in (a price) may show in more places; a new kind of gap may not.
  const todays = new Set(collectPlaceholders(today).map((p) => p.kind));
  const gaps = [...new Set(collectPlaceholders(composed).map((p) => p.kind))].filter((k) => !todays.has(k));
  if (gaps.length) return `unfilled placeholders today's site doesn't have: ${gaps.join(", ")}`;
  return null;
}

/** The studio on one site. Never throws: a failure is `ok: false` and the caller keeps today's spec. */
export async function runStudio(client: ModelClient, config: AppConfig, input: StudioInput): Promise<StudioOutcome> {
  let costEur = 0;
  let idea: string | undefined;
  try {
    const sources = sourcesOf(input.spec, input.brief, input.corpus);
    const shortlist = studioShortlist(input.spec, sources, input.tradeWord);
    if (!shortlist.stances.length) return { ok: false, reason: "no stance fits the trade", costEur };
    if (!shortlist.presets.hero?.length) return { ok: false, reason: "no approved hero preset fills for this site", costEur };
    const req = directorRequest({ spec: input.spec, sources, shortlist });
    const estimate = estimateCallEur(config, client.stageConfig("director"), req);
    if (estimate > config.studio.perRunMaxEur) return { ok: false, reason: `the director call's estimate €${estimate.toFixed(3)} is over studio.perRunMaxEur €${config.studio.perRunMaxEur}`, costEur };
    // No retry: one call bounds the run's cost under perRunMaxEur; an unusable answer falls back to today's site.
    const { data, response } = await client.callJson(req, (d) => DirectorAnswer.parse(d), 0);
    costEur = priceOf(config, config.pricesUsdPerMTok[response.model] ? response.model : client.stageConfig("director").model, response.usage);
    idea = data.idea;
    const checked = checkDirection(data, shortlist, knownNumbers(input.spec, sources, input.corpus));
    const stance = checked.stance ?? shortlist.stances[0]!.id;
    const composed = composeFromBase({
      base: input.spec,
      sources,
      stance,
      seed: input.seed,
      catalogue: "approved",
      choice: checked.choice,
      keepBaseSections: true,
      ...(input.tradeWord ? { tradeWord: input.tradeWord } : {}),
    });
    const why = studioGuards(composed.spec, input.spec, input.corpus);
    if (why) return { ok: false, reason: `guards: ${why}`, idea, costEur };
    return { ok: true, spec: composed.spec, idea, stance, used: composed.used, dropped: [...checked.dropped, ...(composed.used.fallbacks ?? []).map((f) => `fell back: ${f}`)], costEur };
  } catch (e) {
    if (e instanceof ModelOutputError) costEur = e.costEur;
    const reason = e instanceof ComposerError ? `composer: ${e.message}` : `${(e as Error).name}: ${(e as Error).message}`;
    return { ok: false, reason: reason.slice(0, 400), ...(idea ? { idea } : {}), costEur };
  }
}
