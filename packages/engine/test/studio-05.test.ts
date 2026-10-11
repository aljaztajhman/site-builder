import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig, type AppConfig } from "@sb/config";
import { COMPOSER_FIXTURES, composerFixture, inventory, studioShortlist, type StudioShortlist } from "@sb/inventory";
import { STANCES, migrateSpec, publishChecklist, stanceFitsSubtype, validateSite, type SiteSpec } from "@sb/spec";
import {
  DirectorAnswer,
  ModelClient,
  ReplayTransport,
  checkDirection,
  directorRequest,
  knownNumbers,
  runStudio,
  sourcesOf,
  studioEnabled,
  studioGuards,
  type ModelRequest,
  type ModelResponse,
} from "../src/index.ts";

/**
 * Design studio 0.5 (docs/plans/studio-0.5.md): the approved shortlist, the director's answer checked against it, the
 * composer over any site spec, the guards, and the fallback to today's spec. The director's answers for the 3 composer
 * fixtures are recorded (pnpm studio:poc --all, tools/eval/recordings-studio); no test calls the API.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const RECORDINGS = path.join(ROOT, "tools/eval/recordings-studio");
const config = loadConfig();

const usage = { input_tokens: 9000, output_tokens: 1500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
function scripted(answers: (string | ((req: ModelRequest) => string))[], seen: ModelRequest[] = [], cfg: AppConfig = config): ModelClient {
  let n = 0;
  return new ModelClient({
    config: cfg,
    spentToday: async () => 0,
    onCall: async () => undefined,
    transport: {
      async send(req: ModelRequest): Promise<ModelResponse> {
        seen.push(req);
        const a = answers[n++];
        if (a === undefined) throw new Error(`unexpected call ${n} (${req.stage})`);
        return { text: typeof a === "string" ? a : a(req), stopReason: "end_turn", model: "claude-opus-5-5", usage };
      },
    },
  });
}
const replayed = (id: string) => new ModelClient({ config, spentToday: async () => 0, onCall: async () => undefined, transport: new ReplayTransport(path.join(RECORDINGS, id)) });

/** A director answer that picks the shortlist's first entries, with copy. */
function firstPicks(s: StudioShortlist, copy: DirectorAnswer["copy"] = { hero: { headline: "Domača kuhinja ob reki", lead: "Kosila, malice in večerje iz sestavin z bližnjih kmetij." }, sections: [] }): DirectorAnswer {
  const intents = ["hero", "menu", "story", "products", "services", "hours", "contact"].filter((i) => s.presets[i]?.length);
  return {
    idea: "A calm page that starts with the food.",
    stance: s.stances[0]!.id,
    sections: intents.map((intent) => ({ intent, preset: s.presets[intent]![0]!.id })),
    palette: s.palettes[0]!.id,
    pairing: s.pairings[0]!.id,
    wordmark: s.wordmarks[0]?.id ?? "none",
    copy,
  };
}

/** A site that is not one of the composer's fixtures: the restaurant golden, its recorded brief, its client text. */
function restaurant(): { spec: SiteSpec; brief: unknown; corpus: string } {
  const spec = migrateSpec(JSON.parse(readFileSync(path.join(ROOT, "tools/eval/golden/gostilna-zlata-zlica.json"), "utf8"))) as SiteSpec;
  const rec = JSON.parse(readFileSync(path.join(ROOT, "tools/eval/recordings/gostilna-zlata-zlica/001-brief.json"), "utf8")) as { response: { text: string } };
  const corpus = (JSON.parse(readFileSync(path.join(ROOT, "tools/eval/fixtures/gostilna-zlata-zlica/brief.json"), "utf8")) as { description: string }).description;
  return { spec, brief: JSON.parse(rec.response.text), corpus };
}

describe("the studio's shortlist", () => {
  it.each(COMPOSER_FIXTURES)("%s: approved assets only, stances that fit the trade, presets that fill", (id) => {
    const fx = composerFixture(id);
    const s = studioShortlist(fx.base, sourcesOf(fx.base, fx.sources.brief, fx.description), fx.tradeWord);
    const reg = inventory();
    const ids = [...Object.values(s.presets).flat(), ...s.palettes, ...s.pairings, ...s.wordmarks].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(40);
    for (const a of ids) expect(reg.byId(a)?.status, a).toBe("approved");
    for (const st of s.stances) expect(stanceFitsSubtype(STANCES.find((x) => x.id === st.id)!, fx.base.business.type, fx.base.business.subtype), st.id).toBe(true);
    expect(s.presets.hero?.length).toBeGreaterThan(0);
    expect(s.presets.contact?.length).toBeGreaterThan(0);
  });
});

describe("checkDirection", () => {
  const fx = composerFixture("avtoservis-mrak");
  const sources = sourcesOf(fx.base, fx.sources.brief, fx.description);
  const s = studioShortlist(fx.base, sources, fx.tradeWord);
  const known = knownNumbers(fx.base, sources, fx.description);

  it("keeps shortlist ids and drops the rest, so the composer picks its own there", () => {
    const a = firstPicks(s);
    const bad = { ...a, stance: "no-such-stance", palette: "palette/nope", sections: [{ intent: "hero", preset: "composition/hero/not-approved" }, ...a.sections.slice(1)] };
    const c = checkDirection(bad, s, known);
    expect(c.stance).toBeNull();
    expect(c.choice.palette).toBeUndefined();
    expect(c.choice.pairing).toBe(a.pairing);
    // The hero keeps its place and copy; the composer picks its preset.
    expect(c.choice.sections![0]).toEqual({ intent: "hero", copy: a.copy.hero });
    expect(c.choice.sections!.slice(1)).toEqual(a.sections.slice(1));
    expect(c.dropped.join("; ")).toMatch(/stance no-such-stance.*composition\/hero\/not-approved.*palette palette\/nope/);
  });

  it("drops copy with a number the client never gave, and copy over its length; keeps the client's own numbers", () => {
    const a = firstPicks(s, {
      hero: { headline: "Servis vseh znamk že 25 let", lead: "Družinski servis od leta 2008 v Kranju." },
      sections: [
        { intent: "services", headline: "Pokličite 041 123 456" },
        { intent: "story", headline: "x".repeat(120) },
        { intent: "contact", headline: "Kje smo" },
      ],
    });
    const c = checkDirection(a, s, known);
    const copyOf = (intent: string) => c.choice.sections!.find((x) => x.intent === intent)?.copy;
    expect(copyOf("hero")).toEqual({ lead: "Družinski servis od leta 2008 v Kranju." });
    expect(copyOf("services")).toBeUndefined();
    expect(copyOf("story")).toBeUndefined();
    expect(copyOf("contact")).toEqual({ headline: "Kje smo" });
    expect(c.dropped.join("; ")).toMatch(/services headline: number .*041123456.*story headline: longer than.*hero headline: number 25/);
  });

  it("gives an intent's k-th headline to its k-th section (two story sections)", () => {
    const story = s.presets.story!;
    const a: DirectorAnswer = {
      ...firstPicks(s),
      sections: [
        { intent: "hero", preset: s.presets.hero![0]!.id },
        { intent: "story", preset: story[0]!.id },
        { intent: "services", preset: s.presets.services![0]!.id },
        { intent: "story", preset: story[1]!.id },
        { intent: "contact", preset: s.presets.contact![0]!.id },
      ],
      copy: { hero: { headline: "Servis vseh znamk", lead: "Pred popravilom dobite predračun." }, sections: [{ intent: "story", headline: "Prva zgodba" }, { intent: "story", headline: "Druga zgodba" }] },
    };
    const c = checkDirection(a, s, known);
    expect(c.choice.sections!.filter((x) => x.intent === "story").map((x) => x.copy?.headline)).toEqual(["Prva zgodba", "Druga zgodba"]);
  });

  it("the request offers only the shortlist (enums) and asks for no facts", () => {
    const req = directorRequest({ spec: fx.base, sources, shortlist: s });
    expect(req.stage).toBe("director");
    const props = (req.schema as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(props.stance!.enum).toEqual(s.stances.map((x) => x.id));
    expect(props.palette!.enum).toEqual(s.palettes.map((x) => x.id));
    expect(req.system[0]).toMatch(/Never invent facts/);
  });
});

describe("runStudio on the recorded director answers", () => {
  it.each(COMPOSER_FIXTURES)("%s: composes a valid homepage from the director's picks, the guards pass", async (id) => {
    const fx = composerFixture(id);
    const r = await runStudio(replayed(id), config, { spec: fx.base, brief: fx.sources.brief, corpus: fx.description, seed: 1, ...(fx.tradeWord ? { tradeWord: fx.tradeWord } : {}) });
    if (!r.ok) throw new Error(r.reason);
    expect(r.idea.length).toBeGreaterThan(10);
    expect(validateSite(r.spec).ok).toBe(true);
    expect(studioGuards(r.spec, fx.base, fx.description)).toBeNull();
    const home = r.spec.pages.find((p) => p.kind === "home")!;
    expect(home.sections[0]!.type).toBe("composed");
    expect(home.sections.length).toBeGreaterThanOrEqual(4);
    // The director's own picks are what the page is made of (only a pick that couldn't be filled falls back).
    const recorded = DirectorAnswer.parse(JSON.parse((JSON.parse(readFileSync(path.join(RECORDINGS, id, "000-director.json"), "utf8")) as { response: { text: string } }).response.text));
    const picked = recorded.sections.map((x) => x.preset).filter((p) => r.used.presets.includes(p));
    expect(picked.length).toBeGreaterThanOrEqual(Math.ceil(recorded.sections.length / 2));
    expect(r.stance).toBe(recorded.stance);
    // The rest of the site is today's: the other pages, the business, the slug.
    expect(r.spec.slug).toBe(fx.base.slug);
    expect(r.spec.pages.filter((p) => p.kind !== "home")).toEqual(fx.base.pages.filter((p) => p.kind !== "home"));
    expect(r.spec.business).toEqual(fx.base.business);
  }, 60_000);
});

describe("publishing a composed homepage", () => {
  it("an offering without a price inside a composed section blocks publishing like any other placeholder", async () => {
    const fx = composerFixture("pekarna-kvas");
    const r = await runStudio(replayed("pekarna-kvas"), config, { spec: fx.base, brief: fx.sources.brief, corpus: fx.description, seed: 1 });
    if (!r.ok) throw new Error(r.reason);
    const homeIndex = r.spec.pages.findIndex((p) => p.kind === "home");
    const composedPaths = r.spec.pages[homeIndex]!.sections.flatMap((s, i) => (s.type === "composed" ? [`/pages/${homeIndex}/sections/${i}/`] : []));
    const inComposed = publishChecklist(r.spec).filter((b) => b.kind === "placeholder" && composedPaths.some((p) => b.path.startsWith(p)));
    expect(inComposed.length).toBeGreaterThan(0);
    expect(inComposed.every((b) => b.detail === "price")).toBe(true);
  }, 60_000);
});

describe("runStudio over any site spec", () => {
  it("composes the restaurant (not a composer fixture) from its own spec, brief and text", async () => {
    const { spec, brief, corpus } = restaurant();
    const seen: ModelRequest[] = [];
    const client = scripted([(req) => JSON.stringify(firstPicks(JSON.parse(JSON.stringify(shortlistOf(req)))))], seen);
    const r = await runStudio(client, config, { spec, brief: brief as never, corpus, seed: 42 });
    if (!r.ok) throw new Error(r.reason);
    expect(seen.map((q) => q.stage)).toEqual(["director"]);
    expect(validateSite(r.spec).ok).toBe(true);
    const hero = r.spec.pages.find((p) => p.kind === "home")!.sections[0]!;
    expect(JSON.stringify(hero.props)).toContain("Domača kuhinja ob reki");
    expect(r.spec.slug).toBe(spec.slug);
    expect(r.spec.assets.images).toEqual(spec.assets.images);
  }, 60_000);

  it("falls back to today's spec on an unusable answer, with one call and no retry", async () => {
    const { spec, brief, corpus } = restaurant();
    const seen: ModelRequest[] = [];
    const r = await runStudio(scripted(["{\"idea\": \"half an answer\""], seen), config, { spec, brief: brief as never, corpus, seed: 1 });
    expect(r.ok).toBe(false);
    expect(seen).toHaveLength(1);
    if (!r.ok) expect(r.reason).toMatch(/director/);
  });

  it("falls back when the guards fail (a number the client never gave, written past the copy check)", () => {
    const fx = composerFixture("pekarna-kvas");
    const bad = structuredClone(fx.base);
    const hero = bad.pages.find((p) => p.kind === "home")!.sections[0]!;
    (hero.props as { headline: string }).headline = "Pokličite 041 999 888";
    expect(studioGuards(bad, fx.base, fx.description)).toMatch(/facts not in the client's input/);
  });

  it("does not call the director when its estimate is over studio.perRunMaxEur", async () => {
    const { spec, brief, corpus } = restaurant();
    const seen: ModelRequest[] = [];
    const tight = { ...config, studio: { ...config.studio, perRunMaxEur: 0.001 } };
    const r = await runStudio(scripted([], seen, tight), tight, { spec, brief: brief as never, corpus, seed: 1 });
    expect(r.ok).toBe(false);
    expect(seen).toHaveLength(0);
    if (!r.ok) expect(r.reason).toMatch(/perRunMaxEur/);
  });
});

describe("the switch", () => {
  it("off: no one; trial: only the listed emails (any case, spaces); on: everyone", () => {
    expect(studioEnabled("off", "owner@example.com", "owner@example.com")).toBe(false);
    expect(studioEnabled("trial", "Owner@Example.com", " owner@example.com , other@example.com")).toBe(true);
    expect(studioEnabled("trial", "someone@example.com", "owner@example.com")).toBe(false);
    expect(studioEnabled("trial", null, "owner@example.com")).toBe(false);
    expect(studioEnabled("trial", "owner@example.com", undefined)).toBe(false);
    expect(studioEnabled("trial", "owner@example.com", "")).toBe(false);
    expect(studioEnabled("on", null, undefined)).toBe(true);
  });
});

/** The shortlist a director request offers, read back from its schema's enums and its text (for scripted answers). */
function shortlistOf(req: ModelRequest): StudioShortlist {
  const p = (req.schema as { properties: Record<string, { enum?: string[]; items?: { properties: Record<string, { enum: string[] }> } }> }).properties;
  const ids = (k: string) => (p[k]!.enum ?? []).filter((x) => x !== "none").map((id) => ({ id, line: "" }));
  const presetIds = p.sections!.items!.properties.preset!.enum;
  const presets: StudioShortlist["presets"] = {};
  for (const id of presetIds) (presets[id.split("/")[1]!] ??= []).push({ id, line: "" });
  return { stances: ids("stance"), presets, palettes: ids("palette"), pairings: ids("pairing"), wordmarks: ids("wordmark") };
}
