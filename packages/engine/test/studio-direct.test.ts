// @module-tag slow
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { costEur, loadConfig, type AppConfig } from "@sb/config";
import { composerFixture } from "@sb/inventory";
import type { SiteSpec } from "@sb/spec";
import {
  ImageGenerator,
  ModelClient,
  ReplayTransport,
  StandInImageTransport,
  artDirectorRequest,
  estimateCallEur,
  rebuildRequest,
  rebuildWordmarks,
  requestHash,
  runCapEur,
  runStudio,
  sourcesOf,
  studioGuards,
  type ImageGenModelConfig,
  type ImageTransport,
  type MockupDeps,
  type ModelRequest,
  type ModelResponse,
} from "../src/index.ts";

/**
 * Studio "direct", the Fable studio (.claude/plans/studio-shootout.md unit 1): the art director writes the direction
 * for direct composition (no image model), then the composer writes the homepage from the direction alone, in the
 * rebuild's answer format. Recorded-shape answers here; no test calls an API.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const config = loadConfig();
const direct: AppConfig = { ...config, studio: { ...config.studio, mode: "direct" } };
const FABLE = "claude-fable-5-1";
const usage = { input_tokens: 14000, output_tokens: 7000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

type Answer = string | Error;
/** A client that answers per stage, in order; `seen` hears every request with the stage settings it was sent with. */
function scripted(answers: Partial<Record<string, Answer[]>>, seen: { req: ModelRequest; model: string; maxTokens: number; effort?: string }[] = [], cfg: AppConfig = direct): ModelClient {
  const used = new Map<string, number>();
  return new ModelClient({
    config: cfg,
    spentToday: async () => 0,
    onCall: async () => undefined,
    transport: {
      async send(req, stage): Promise<ModelResponse> {
        seen.push({ req, model: stage.model, maxTokens: stage.maxTokens, ...(stage.effort ? { effort: stage.effort } : {}) });
        const n = used.get(req.stage) ?? 0;
        used.set(req.stage, n + 1);
        const a = answers[req.stage]?.[n];
        if (a === undefined) throw new Error(`unexpected call ${req.stage} #${n + 1}`);
        if (a instanceof Error) throw a;
        return { text: a, stopReason: "end_turn", model: stage.model, usage };
      },
    },
  });
}

function pekarna(bodies: { model: ImageGenModelConfig; body: Record<string, unknown> }[]) {
  const fx = composerFixture("pekarna-kvas");
  const stored = new Map<string, Uint8Array>();
  const standIn = new StandInImageTransport();
  const transport: ImageTransport = {
    async generate(model, body) {
      bodies.push({ model, body });
      return standIn.generate(model, body);
    },
  };
  const photo = readFileSync(path.join(ROOT, "tools/eval/fixtures/pekarna-kvas/photos/01.jpg"));
  const deps: MockupDeps = {
    painter: new ImageGenerator({ config, transport, spentToday: async () => 0, onCall: async () => undefined }),
    photo: async () => new Uint8Array(photo),
    logo: async () => new Uint8Array(readFileSync(path.join(ROOT, "tools/eval/fixtures/pekarna-kvas/logo.svg"))),
    imageIds: async (n) => Array.from({ length: n }, (_, i) => `img_g${i + 7}`),
    store: async (id, jpeg) => {
      stored.set(id, jpeg);
      return `sites/x/generated/${id}.jpg`;
    },
  };
  return { spec: fx.base, brief: fx.sources.brief, corpus: fx.description, stored, deps };
}

/** The art director's answer as Fable writes it for direct composition: the image prompt is only a short note. */
const direction = {
  name: "Polica",
  idea: "The daily breads stacked as huge words on a white page, like Jure's shelf.",
  palette: [
    { role: "background", hex: "#ffffff" },
    { role: "text", hex: "#2a1a10" },
    { role: "primary", hex: "#c2401f" },
    { role: "band", hex: "#9b5a1e" },
    { role: "onBand", hex: "#fffaf6" },
  ],
  pairing: "archivo-archivo",
  typeCharacter: "Archivo at 800 for the bread names, set huge.",
  composition: "Hero: headline left over 8 columns, the tray photo bled right. Then the five breads as a stack of names beside the loaves, then a story band, then contact.",
  imagery: "The client's three photos, bled to the right edge; no drawn art.",
  signature: "The bread names stacked like loaves on a shelf.",
  copy: { headline: "Kruh z drožmi, ki vzhaja čez noč", lead: "Družinska pekarna na začetku stare ulice v Kamniku. Vse je ročno delo, brez aditivov." },
  imagePrompt: "No image model: the first screen is the headline on white beside the tray photo bled right.",
};

const desk = (col: number, span: number, row: number, extra: Record<string, unknown> = {}) => ({ col, span, row, ...extra });
const phone = (order: number, span = "full") => ({ order, span });

/** The composer's answer: the rebuild's format with no photo regions; one stray crop reference it must not honour. */
const composed = {
  tokens: {
    colors: { background: "#ffffff", surface: "#eef0f2", text: "#2a1a10", muted: "#5a4334", primary: "#c2401f", onPrimary: "#fffaf6", accent: "#a8692e", border: "#c08a4e", inverse: "#3b2414", onInverse: "#fbf4ec", band: "#9b5a1e", onBand: "#fffaf6" },
    pairing: "archivo-archivo",
    radius: 0,
    headingWeight: 800,
    headingCase: "normal",
    density: "regular",
    wordmark: "none",
  },
  crops: [{ id: "crop1", box: { x: 80, y: 640, w: 220, h: 200 }, shows: "a wheat ear drawn in brown ink", alt: "Klas pšenice", contains: [] }],
  sections: [
    {
      intent: "hero",
      copy: { headline: "Kruh z drožmi, ki vzhaja čez noč" },
      props: {
        intent: "hero",
        width: "wide",
        rows: 3,
        elements: [
          { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "l", desk: desk(1, 8, 1, { alignY: "end" }), phone: phone(0) },
          { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: desk(1, 5, 2), phone: phone(1) },
          { id: "e_ear", kind: "image", image: "{crop.1}", ratio: "1:1", desk: desk(1, 3, 3), phone: phone(2, "half") },
          { id: "e_tray", kind: "image", image: "img_03", ratio: "fill", desk: desk(9, 4, 1, { rowSpan: 3, bleedX: "end" }), phone: phone(3, "bleed") },
        ],
      },
    },
    {
      intent: "products",
      props: {
        intent: "products",
        width: "wide",
        rows: 6,
        elements: [
          { id: "e_head", kind: "heading", text: "Vsak dan", level: 2, size: 2, desk: desk(1, 7, 1), phone: phone(0) },
          ...[0, 1, 2, 3, 4].map((i) => ({ id: `e_b${i}`, kind: "heading", text: `{brief.offerings[${i}].name}`, level: 3, size: 5, weight: 800, desk: desk(1, 7, 2 + i), phone: phone(1 + i) })),
          { id: "e_loaves", kind: "image", image: "img_01", ratio: "fill", desk: desk(8, 5, 1, { rowSpan: 6, bleedX: "end" }), phone: phone(6, "bleed") },
        ],
      },
    },
    {
      intent: "story",
      tone: "band",
      props: {
        intent: "story",
        width: "wide",
        rows: 1,
        elements: [
          { id: "e_t", kind: "text", paragraphs: ["{brief.highlights[1]}"], desk: desk(1, 7, 1), phone: phone(0) },
          { id: "e_hands", kind: "image", image: "img_02", ratio: "4:3", desk: desk(9, 4, 1), phone: phone(1) },
        ],
      },
    },
    {
      intent: "contact",
      props: {
        intent: "contact",
        width: "wide",
        rows: 2,
        elements: [
          { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Naročila po telefonu", labelAt: "before", treatment: "numeral", size: 6, link: { action: "call" }, desk: desk(1, 6, 1), phone: phone(0) },
          { id: "e_where", kind: "text", paragraphs: ["{business.address}"], desk: desk(1, 6, 2), phone: phone(1) },
          { id: "e_hours", kind: "hours", style: "table", desk: desk(8, 5, 1, { rowSpan: 2 }), phone: phone(2) },
        ],
      },
    },
  ],
};

const home = (spec: SiteSpec) => spec.pages.find((p) => p.kind === "home")!;
const images = (q: ModelRequest) => (q.messages[0]!.content as { type: string }[]).filter((b) => b.type === "image").length;
const text = (q: ModelRequest) => (q.messages[0]!.content as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");

describe("studio.mode direct (the Fable studio)", () => {
  it("composes the homepage from the art direction alone: Fable stages from config, no image call, no crops, guards pass", async () => {
    const bodies: { model: ImageGenModelConfig; body: Record<string, unknown> }[] = [];
    const fx = pekarna(bodies);
    const seen: { req: ModelRequest; model: string; maxTokens: number; effort?: string }[] = [];
    const r = await runStudio(scripted({ artDirectorDirect: [JSON.stringify(direction)], composeDirect: [JSON.stringify(composed)] }, seen), direct, { spec: fx.spec, brief: fx.brief, corpus: fx.corpus, seed: 1, mockup: fx.deps });
    if (!r.ok) throw new Error(`${r.reason} / ${r.mockup?.reason}`);
    expect(r.path).toBe("direct");
    expect(r.stance).toBe("direct");
    expect(r.used.stance).toBe("direct");
    expect(r.used.presets).toEqual(["direct:hero", "direct:products", "direct:story", "direct:contact"]);
    // Two calls, on the stages' models from config; the image model is never called.
    expect(seen.map((s) => s.req.stage)).toEqual(["artDirectorDirect", "composeDirect"]);
    expect(seen.map((s) => [s.model, s.effort, s.maxTokens])).toEqual([
      [config.models.artDirectorDirect.model, "medium", config.models.artDirectorDirect.maxTokens],
      [config.models.composeDirect.model, "medium", config.models.composeDirect.maxTokens],
    ]);
    expect(seen[0]!.model).toBe(FABLE);
    expect(bodies).toHaveLength(0);
    expect(r.mockupImage).toBeUndefined();
    // Both calls see the client's photos (and the art director the logo); the composer gets no mockup image.
    expect(images(seen[0]!.req)).toBe(4);
    expect(images(seen[1]!.req)).toBe(3);
    expect(text(seen[1]!.req)).toContain("compose the homepage from this art direction");
    // No crop and no generated picture: the stray {crop.1} is dropped, the client's photos stay their own.
    expect(r.mockup!.crops).toEqual([]);
    expect(r.spec.assets.images.filter((i) => i.origin === "generated")).toEqual([]);
    expect(fx.stored.size).toBe(0);
    expect(JSON.stringify(home(r.spec).sections)).not.toContain("crop");
    expect(studioGuards(r.spec, fx.spec, fx.corpus)).toBeNull();
    expect(home(r.spec).sections.map((s) => (s.props as { intent?: string }).intent)).toEqual(["hero", "products", "story", "contact"]);
    expect(r.spec.design.fontPair).toBe("archivo-archivo");
    expect(r.art?.name).toBe("Polica");
    // € per stage at Fable's price; nothing for a mockup.
    const each = costEur(config, FABLE, usage);
    expect(r.mockup!.eur).toEqual({ artDirector: each, mockup: 0, rebuild: each });
    expect(r.costEur).toBeCloseTo(2 * each, 9);
  }, 60_000);

  it("falls back to the picker when the composer's answer is unusable", async () => {
    const bodies: { model: ImageGenModelConfig; body: Record<string, unknown> }[] = [];
    const fx = pekarna(bodies);
    const seen: { req: ModelRequest; model: string; maxTokens: number }[] = [];
    const picker = (JSON.parse(readFileSync(path.join(ROOT, "tools/eval/recordings-studio/pekarna-kvas/000-director.json"), "utf8")) as { response: { text: string } }).response.text;
    const r = await runStudio(scripted({ artDirectorDirect: [JSON.stringify(direction)], composeDirect: ['{"tokens": "half'], director: [picker] }, seen), direct, { spec: fx.spec, brief: fx.brief, corpus: fx.corpus, seed: 1, mockup: fx.deps });
    expect(seen.map((s) => s.req.stage)).toEqual(["artDirectorDirect", "composeDirect", "director"]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.path).toBe("picker");
    expect(r.mockup).toMatchObject({ ok: false, reason: expect.stringMatching(/^compose: unusable answer/) });
    expect(bodies).toHaveLength(0);
  }, 60_000);

  it("sends nothing past studio.direct.perRunMaxEur", async () => {
    const fx = pekarna([]);
    const seen: { req: ModelRequest; model: string; maxTokens: number }[] = [];
    const tight = { ...direct, studio: { ...direct.studio, direct: { ...direct.studio.direct, perRunMaxEur: 0.001 } } };
    const r = await runStudio(scripted({}, seen, tight), tight, { spec: fx.spec, brief: fx.brief, corpus: fx.corpus, seed: 1, mockup: fx.deps });
    expect(seen).toHaveLength(0);
    expect(r.ok).toBe(false);
    expect(r.mockup?.reason).toMatch(/^cost cap: artDirectorDirect/);
  });

  it("a whole direct run's worst case (both Fable calls at full maxTokens, then the picker) fits studio.direct.perRunMaxEur; the mockup path's cap is untouched", () => {
    const fx = pekarna([]);
    const sources = sourcesOf(fx.spec, fx.brief, fx.corpus);
    const photos = fx.spec.assets.images.slice(0, 4).map((p) => ({ id: p.id, alt: p.alt, jpegBase64: "x" }));
    const ad = artDirectorRequest({ spec: fx.spec, sources, photos, logoPngBase64: "x", direct: true });
    const cd = rebuildRequest({ spec: fx.spec, sources, photos, direction: { ...direction }, heroCopy: direction.copy, wordmarks: rebuildWordmarks(fx.spec) });
    const client = scripted({});
    const eur = estimateCallEur(config, client.stageConfig("artDirectorDirect"), ad) + estimateCallEur(config, client.stageConfig("composeDirect"), cd);
    // The picker's director call (Opus, 8000 tokens out) at most, if the composed page fails.
    const picker = ((config.models.director.maxTokens * config.pricesUsdPerMTok[config.models.director.model]!.output + 20_000 * config.pricesUsdPerMTok[config.models.director.model]!.input) / 1e6) * config.eurPerUsd;
    // pekarna-kvas (4 photos, a logo): €1.579 for the two Fable calls, €0.206 for the picker.
    expect(eur + picker).toBeLessThanOrEqual(config.studio.direct.perRunMaxEur);
    expect(runCapEur(direct)).toBe(config.studio.direct.perRunMaxEur);
    expect(runCapEur(config)).toBe(config.studio.perRunMaxEur);
  });
});

describe("the requests without a mockup", () => {
  const fx = composerFixture("pekarna-kvas");
  const sources = sourcesOf(fx.base, fx.sources.brief, fx.description);
  const base = { spec: fx.base, sources, direction: { ...direction }, heroCopy: direction.copy, wordmarks: [] as string[] };

  it("the composer's request carries no image block without a mockup (only the client's photos), on stage composeDirect", () => {
    const none = rebuildRequest({ ...base, photos: [] });
    expect(none.stage).toBe("composeDirect");
    expect(images(none)).toBe(0);
    expect(text(none)).toContain("compose the homepage from this art direction");
    expect(text(none)).not.toMatch(/mockup above|boxes are in its pixels/);
    expect(none.system[0]).not.toMatch(/painted homepage mockup/);
    expect(none.system[0]).not.toMatch(/"crops"|"photoRegions"/);
    // The direction's palette, type and imagery reach the composer (it has no picture to read them from).
    expect(text(none)).toContain("#c2401f");
    expect(text(none)).toContain("Archivo at 800");
    expect(text(none)).toContain("bled to the right edge");
    const withPhotos = rebuildRequest({ ...base, photos: [{ id: "img_01", alt: "kruh", jpegBase64: "AAAA" }] });
    expect(images(withPhotos)).toBe(1);
    const mockup = rebuildRequest({ ...base, photos: [], mockup: { jpegBase64: "BBBB", width: 1536, height: 1024 } });
    expect(mockup.stage).toBe("rebuild");
    expect(images(mockup)).toBe(1);
  });

  it("the art director's direct request tells it there is no image model, on stage artDirectorDirect", () => {
    const req = artDirectorRequest({ spec: fx.base, sources, photos: [], direct: true });
    expect(req.stage).toBe("artDirectorDirect");
    expect(req.system[0]).toMatch(/no image model/i);
    expect(req.system[0]).not.toMatch(/GPT Image/);
    expect(text(req)).not.toMatch(/Mockup size/);
    const mockup = artDirectorRequest({ spec: fx.base, sources, photos: [], size: { width: 1536, height: 1024 } });
    expect(mockup.stage).toBe("artDirector");
    expect(mockup.system[0]).toMatch(/GPT Image 2\.5/);
  });
});

/** The mockup path's requests (art director, rebuild) on the recorded runs, hashed before direct mode existed. */
const MOCKUP_HASHES: Record<string, string[]> = {
  "pekarna-kvas": ["b023d7c3eb067d8b", "558f7d38171d2994"],
  "avtoservis-mrak": ["f2cb1cb8978ccba0", "1e8a57131365329b"],
};

describe("mockup mode is unchanged", () => {
  it.each(["pekarna-kvas", "avtoservis-mrak"])("%s: the art director's and the rebuild's requests are byte for byte as before", async (id) => {
    const fx = composerFixture(id);
    const dir = path.join(ROOT, "tools/eval/recordings-studio-mockup", id);
    const replay = new ReplayTransport(dir);
    const hashes: string[] = [];
    const client = new ModelClient({ config, spentToday: async () => 0, onCall: async () => undefined, transport: { send: (req, stage) => (hashes.push(requestHash(req, stage.model)), replay.send(req, stage)) } });
    const painter = new ImageGenerator({ config, transport: { generate: async () => new Uint8Array(readFileSync(path.join(dir, "mockup.jpg"))) }, spentToday: async () => 0, onCall: async () => undefined });
    const photo = (n: number) => new Uint8Array(readFileSync(path.join(ROOT, "tools/eval/fixtures", id, "photos", `0${n}.jpg`)));
    const deps: MockupDeps = {
      painter,
      photo: async (imgId) => {
        const i = fx.base.assets.images.findIndex((x) => x.id === imgId);
        return i >= 0 ? photo(i + 1) : undefined;
      },
      ...(fx.base.assets.logo ? { logo: async () => new Uint8Array(readFileSync(path.join(ROOT, "tools/eval/fixtures", id, "logo.svg"))) } : {}),
      imageIds: async (n) => Array.from({ length: n }, (_, i) => `img_g${i + 11}`),
      store: async (imgId) => `sites/x/generated/${imgId}.jpg`,
    };
    const r = await runStudio(client, config, { spec: fx.base, brief: fx.sources.brief, corpus: fx.description, seed: 1, ...(fx.tradeWord ? { tradeWord: fx.tradeWord } : {}), mockup: deps });
    if (!r.ok) throw new Error(`${r.reason} / ${r.mockup?.reason}`);
    expect(r.path).toBe("mockup");
    expect(hashes).toEqual(MOCKUP_HASHES[id]);
  }, 60_000);
});
