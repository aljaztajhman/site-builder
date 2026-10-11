import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { loadConfig, type AppConfig } from "@sb/config";
import { composerFixture, inventory } from "@sb/inventory";
import { VOCABS, type SiteSpec } from "@sb/spec";
import {
  ImageGenerator,
  ModelClient,
  StandInImageTransport,
  checkCrops,
  rebuildVocabs,
  unknownNames,
  runStudio,
  sanitiseProps,
  sourcesOf,
  studioGuards,
  type ImageGenModelConfig,
  type ImageTransport,
  type MockupDeps,
  type ModelRequest,
  type ModelResponse,
  type RebuildAnswer,
} from "../src/index.ts";

/**
 * Studio 0.5b, the mockup pipeline (docs/plans/studio-0.5.md "Mockup pipeline"): art director → mockup image → rebuild →
 * guards, falling back to the picker and then to today's site. Synthetic answers here (no test calls an API); the
 * recorded runs are replayed in studio-mockup-replay.test.ts.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const config = loadConfig();
const usage = { input_tokens: 12000, output_tokens: 6000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

type Answer = string | ((req: ModelRequest) => string) | Error;
/** A client that answers per stage, in order; `seen` hears every request. */
function scripted(answers: Partial<Record<string, Answer[]>>, seen: ModelRequest[] = [], cfg: AppConfig = config, delayMs = 0): ModelClient {
  const used = new Map<string, number>();
  return new ModelClient({
    config: cfg,
    spentToday: async () => 0,
    onCall: async () => undefined,
    transport: {
      async send(req: ModelRequest): Promise<ModelResponse> {
        seen.push(req);
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        const n = used.get(req.stage) ?? 0;
        used.set(req.stage, n + 1);
        const a = answers[req.stage]?.[n];
        if (a === undefined) throw new Error(`unexpected call ${req.stage} #${n + 1}`);
        if (a instanceof Error) throw a;
        return { text: typeof a === "string" ? a : a(req), stopReason: "end_turn", model: "claude-opus-5-5", usage };
      },
    },
  });
}

/** A painter over a stand-in image (or a failing one), recording what it was sent. */
function painter(bodies: { model: ImageGenModelConfig; body: Record<string, unknown> }[] = [], fail?: Error): MockupDeps["painter"] {
  const standIn = new StandInImageTransport();
  const transport: ImageTransport = {
    async generate(model, body) {
      bodies.push({ model, body });
      if (fail) throw fail;
      return standIn.generate(model, body);
    },
  };
  return new ImageGenerator({ config, transport, spentToday: async () => 0, onCall: async () => undefined });
}

function pekarna(bodies: { model: ImageGenModelConfig; body: Record<string, unknown> }[] = [], fail?: Error): { spec: SiteSpec; brief: unknown; corpus: string; stored: Map<string, Uint8Array>; deps: MockupDeps } {
  const fx = composerFixture("pekarna-kvas");
  const stored = new Map<string, Uint8Array>();
  const photo = readFileSync(path.join(ROOT, "tools/eval/fixtures/pekarna-kvas/photos/01.jpg"));
  const deps: MockupDeps = {
    painter: painter(bodies, fail),
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
  composition: "Hero: headline left, the tray photo bled right. Then the five breads, then a contact band.",
  imagery: "The client's three photos; one drawn wheat ear in ink.",
  signature: "The bread names stacked like loaves on a shelf.",
  copy: { headline: "Kruh z drožmi, ki vzhaja čez noč", lead: "Družinska pekarna na začetku stare ulice v Kamniku. Vse je ročno delo, brez aditivov." },
  imagePrompt: "One flat full-page screenshot of a desktop homepage, 1536x1024, white page, Archivo heavy type, the loaves photo bled right.",
};

const desk = (col: number, span: number, row: number, extra: Record<string, unknown> = {}) => ({ col, span, row, ...extra });
const phone = (order: number, span = "full") => ({ order, span });

/** A rebuild answer for pekarna-kvas: a hero with a call button and a crop, a products list, a story with a literal paragraph, a contact. */
function rebuild(): RebuildAnswer {
  return {
    tokens: {
      colors: { background: "#ffffff", surface: "#eef0f2", text: "#2a1a10", muted: "#5a4334", primary: "#c2401f", onPrimary: "#fffaf6", accent: "#a8692e", border: "#c08a4e", inverse: "#3b2414", onInverse: "#fbf4ec", band: "#9b5a1e", onBand: "#fffaf6" },
      pairing: "archivo-archivo",
      radius: 0,
      headingWeight: 800,
      headingCase: "normal",
      density: "regular",
      wordmark: "none",
    },
    photoRegions: [{ image: "img_03", box: { x: 900, y: 80, w: 600, h: 500 } }],
    crops: [
      { id: "crop1", box: { x: 80, y: 640, w: 220, h: 200 }, shows: "a wheat ear drawn in brown ink", alt: "Klas pšenice, narisan s tušem", contains: [] },
      { id: "crop2", box: { x: 950, y: 120, w: 400, h: 300 }, shows: "an ornament", alt: "Okras", contains: [] },
      { id: "crop3", box: { x: 400, y: 700, w: 200, h: 200 }, shows: "the baker's hands", alt: "Roke", contains: [] },
    ],
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
            { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: desk(6, 3, 2), phone: phone(2) },
            { id: "e_ear", kind: "image", image: "{crop.1}", ratio: "1:1", desk: desk(1, 3, 3), phone: phone(3, "half") },
            { id: "e_tray", kind: "image", image: "img_03", ratio: "fill", desk: desk(9, 4, 1, { rowSpan: 3, bleedX: "end" }), phone: phone(4, "bleed") },
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
        copy: { headline: "Testo vzhaja 1000 let" },
        props: {
          intent: "story",
          width: "wide",
          rows: 1,
          elements: [
            { id: "e_t", kind: "text", paragraphs: ["Pečemo najboljši kruh v mestu, že 30 let.", "{brief.highlights[1]}"], desk: desk(1, 7, 1), phone: phone(0) },
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
            { id: "e_fake", kind: "fact", value: "25 let", label: "Izkušenj", treatment: "numeral", size: 4, desk: desk(1, 3, 2), phone: phone(1) },
            { id: "e_where", kind: "text", paragraphs: ["{business.address}"], desk: desk(4, 3, 2), phone: phone(2) },
            { id: "e_hours", kind: "hours", style: "table", desk: desk(8, 5, 1, { rowSpan: 2 }), phone: phone(3) },
          ],
        },
      },
    ],
  } as RebuildAnswer;
}

const home = (spec: SiteSpec) => spec.pages.find((p) => p.kind === "home")!;

describe("the mockup pipeline", () => {
  it("builds the homepage from the rebuild: facts through slots, no call buttons, no literal sentences, decorative crops labelled", async () => {
    const bodies: { model: ImageGenModelConfig; body: Record<string, unknown> }[] = [];
    const fx = pekarna(bodies);
    const seen: ModelRequest[] = [];
    const r = await runStudio(scripted({ artDirector: [JSON.stringify(direction)], rebuild: [JSON.stringify(rebuild())] }, seen), config, { spec: fx.spec, brief: fx.brief as never, corpus: fx.corpus, seed: 1, mockup: fx.deps });
    if (!r.ok) throw new Error(`${r.reason} / ${r.mockup?.reason}`);
    expect(r.path).toBe("mockup");
    expect(seen.map((q) => q.stage)).toEqual(["artDirector", "rebuild"]);
    // The art director and the rebuild see the client's photos and logo; the image model gets them as references.
    const images = (q: ModelRequest) => (q.messages[0]!.content as { type: string }[]).filter((b) => b.type === "image").length;
    expect(images(seen[0]!)).toBe(4);
    expect(images(seen[1]!)).toBe(4);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.model.endpoint).toBe(config.imageGen.models[config.studio.mockup.model]!.endpoint);
    expect(bodies[0]!.body.image_urls as string[]).toHaveLength(4);
    expect(bodies[0]!.body.image_size).toEqual({ width: config.studio.mockup.width, height: config.studio.mockup.height });
    expect(String(bodies[0]!.body.prompt)).toContain('"041 555 906" with one button "Pokličite"');
    expect(studioGuards(r.spec, fx.spec, fx.corpus)).toBeNull();

    const sections = home(r.spec).sections;
    expect(sections.map((s) => (s.props as { intent?: string }).intent)).toEqual(["hero", "products", "story", "contact"]);
    const text = JSON.stringify(sections);
    expect(text).toContain("Kruh z drožmi, ki vzhaja čez noč");
    expect(text).toContain("Pirin kruh z drožmi");
    expect(text).toContain("041 555 906");
    expect(text).not.toContain('"action":"call","label"');
    expect(text).not.toContain("najboljši");
    expect(text).not.toContain("25 let");
    expect(text).not.toContain("1000 let");
    expect(r.dropped.join("; ")).toMatch(/call button removed.*literal paragraphs removed.*fact value is not a slot/s);
    // One crop accepted (labelled AI picture in the hero), the photo-region crop and the hands refused.
    expect(r.mockup!.crops).toEqual([
      { id: "crop1", ok: true },
      { id: "crop2", ok: false, reason: "overlaps the client's photo img_03" },
      { id: "crop3", ok: false, reason: expect.stringMatching(/^shows/) },
    ]);
    const crop = r.spec.assets.images.find((i) => i.id === "img_g7");
    expect(crop).toMatchObject({ origin: "generated", src: "sites/x/generated/img_g7.jpg", width: 220, height: 200 });
    expect(JSON.stringify(sections[0])).toContain('"img_g7"');
    expect(fx.stored.has("img_g7")).toBe(true);
    // The page's tokens: the rebuild's font pair, a picked genome, the idea kept as metadata.
    expect(r.spec.design.fontPair).toBe("archivo-archivo");
    expect(r.spec.design.genome?.source).toBe("picked");
    expect(r.spec.design.art?.idea).toContain("daily breads");
    expect(r.costEur).toBeCloseTo(r.mockup!.eur.artDirector + r.mockup!.eur.mockup + r.mockup!.eur.rebuild, 6);
    expect(r.mockup!.eur.mockup).toBeGreaterThan(0);
  }, 60_000);

  it("falls back to the picker when the rebuild's answer is unusable, and logs why", async () => {
    const fx = pekarna();
    const seen: ModelRequest[] = [];
    // The picker's answer: the director's recorded answer for this fixture (tools/eval/recordings-studio).
    const picker = (JSON.parse(readFileSync(path.join(ROOT, "tools/eval/recordings-studio/pekarna-kvas/000-director.json"), "utf8")) as { response: { text: string } }).response.text;
    const r = await runStudio(scripted({ artDirector: [JSON.stringify(direction)], rebuild: ['{"tokens": "half'], director: [picker] }, seen), config, { spec: fx.spec, brief: fx.brief as never, corpus: fx.corpus, seed: 1, mockup: fx.deps });
    expect(seen.map((q) => q.stage)).toEqual(["artDirector", "rebuild", "director"]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.path).toBe("picker");
    expect(r.mockup).toMatchObject({ ok: false, reason: expect.stringMatching(/^rebuild: unusable answer/) });
    expect(r.costEur).toBeGreaterThan(r.mockup!.eur.artDirector + r.mockup!.eur.rebuild);
  }, 60_000);

  it("falls back to the picker when the image model fails (no rebuild call), or when there is no painter", async () => {
    const fx = pekarna([], new Error("fal: HTTP 500"));
    const seen: ModelRequest[] = [];
    const r = await runStudio(scripted({ artDirector: [JSON.stringify(direction)], director: [new Error("no director in this test")] }, seen), config, { spec: fx.spec, brief: fx.brief as never, corpus: fx.corpus, seed: 1, mockup: fx.deps });
    expect(seen.map((q) => q.stage)).toEqual(["artDirector", "director"]);
    expect(r.ok).toBe(false);
    expect(r.mockup?.reason).toMatch(/^mockup image: fal: HTTP 500/);

    const none: ModelRequest[] = [];
    const r2 = await runStudio(scripted({ director: [new Error("stop")] }, none), config, { spec: fx.spec, brief: fx.brief as never, corpus: fx.corpus, seed: 1 });
    expect(none.map((q) => q.stage)).toEqual(["director"]);
    expect(r2.mockup?.reason).toMatch(/no image generator/);
  });

  it("sends nothing past studio.perRunMaxEur", async () => {
    const fx = pekarna();
    const seen: ModelRequest[] = [];
    const tight = { ...config, studio: { ...config.studio, perRunMaxEur: 0.001 } };
    const r = await runStudio(scripted({}, seen, tight), tight, { spec: fx.spec, brief: fx.brief as never, corpus: fx.corpus, seed: 1, mockup: fx.deps });
    expect(seen).toHaveLength(0);
    expect(r.ok).toBe(false);
    expect(r.mockup?.reason).toMatch(/^cost cap: artDirector/);
  });

  it("gives up on the mockup path after studio.mockup.timeoutSeconds and runs the picker", async () => {
    const fx = pekarna();
    const seen: ModelRequest[] = [];
    const quick = { ...config, studio: { ...config.studio, mockup: { ...config.studio.mockup, timeoutSeconds: 0.05 } } };
    const r = await runStudio(scripted({ artDirector: [JSON.stringify(direction)], director: [new Error("stop")] }, seen, quick, 200), quick, { spec: fx.spec, brief: fx.brief as never, corpus: fx.corpus, seed: 1, mockup: fx.deps });
    expect(r.mockup?.reason).toMatch(/timed out/);
    expect(seen.map((q) => q.stage)).toContain("director");
  });

  it("studio.mode picker: no art director, no image", async () => {
    const bodies: { model: ImageGenModelConfig; body: Record<string, unknown> }[] = [];
    const fx = pekarna(bodies);
    const seen: ModelRequest[] = [];
    const picker = { ...config, studio: { ...config.studio, mode: "picker" as const } };
    const r = await runStudio(scripted({ director: [new Error("stop")] }, seen, picker), picker, { spec: fx.spec, brief: fx.brief as never, corpus: fx.corpus, seed: 1, mockup: fx.deps });
    expect(seen.map((q) => q.stage)).toEqual(["director"]);
    expect(bodies).toHaveLength(0);
    expect(r.mockup).toBeUndefined();
  });
});

describe("the crop rule", () => {
  const size = { width: 1536, height: 1024 };
  it("refuses a crop flagged as (or over) a client photo region, people, hands, text or a logo; accepts drawn decoration", () => {
    const region = { image: "img_01", box: { x: 100, y: 100, w: 500, h: 400 } };
    const v = checkCrops(
      {
        photoRegions: [region],
        crops: [
          { id: "crop1", box: region.box, shows: "an ornament", alt: "Okras", contains: [] },
          { id: "crop2", box: { x: 700, y: 100, w: 200, h: 200 }, shows: "a botanical line drawing", alt: "Risba", contains: ["people"] },
          { id: "crop3", box: { x: 700, y: 400, w: 200, h: 200 }, shows: "the shop sign", alt: "Napis", contains: [] },
          { id: "crop4", box: { x: 1000, y: 400, w: 200, h: 200 }, shows: "a fern drawn in one white line", alt: "Praprot", contains: [] },
          { id: "crop5", box: { x: 1200, y: 700, w: 20, h: 200 }, shows: "a swallow", alt: "Lastovka", contains: [] },
          { id: "crop6", box: { x: 0, y: 0, w: 1536, h: 1024 }, shows: "a pattern", alt: "Vzorec", contains: [] },
        ],
      },
      size,
      3,
    );
    expect(v.map((c) => [c.id, c.ok])).toEqual([
      ["crop1", false],
      ["crop2", false],
      ["crop3", false],
      ["crop4", true],
      ["crop5", false],
      ["crop6", false],
    ]);
    expect(v[0]!.reason).toBe("overlaps the client's photo img_01");
    expect(v[1]!.reason).toBe("contains people");
  });

  it("keeps at most studio.mockup.maxCrops", () => {
    const crops = [1, 2, 3, 4].map((i) => ({ id: `crop${i}`, box: { x: i * 300, y: 10, w: 100, h: 100 }, shows: "an ornament", alt: "Okras", contains: [] }));
    expect(checkCrops({ photoRegions: [], crops }, size, 2).map((c) => c.ok)).toEqual([true, true, false, false]);
  });
});

describe("sanitiseProps", () => {
  const fx = composerFixture("pekarna-kvas");
  const known = new Set(["041", "555", "906", "041555906", "30", "1241"]);
  const ctx = { known, words: new Set(["vsak", "dan", "pot", "do", "nas", "pekarna", "kvas"]), urls: new Set<string>() };
  it("keeps slots and short labels; drops sentences, invented numbers, call buttons and a crop where AI pictures can't go", () => {
    const dropped: string[] = [];
    const props = sanitiseProps(
      {
        intent: "products",
        elements: [
          { id: "e_a", kind: "heading", text: "Vsak dan" },
          { id: "e_b", kind: "heading", text: "Že 40 let pečemo" },
          { id: "e_c", kind: "action", action: "call", label: "Pokličite" },
          { id: "e_d", kind: "action", action: "directions", label: "Pot do nas" },
          { id: "e_e", kind: "list", items: ["{brief.offerings[0].name}", "Najboljši rogljički"] },
          { id: "e_f", kind: "image", image: "{crop.1}" },
          { id: "e_g", kind: "quote", text: "Najboljši kruh." },
        ],
      },
      "products",
      ctx,
      new Map([["crop1", "img_g1"]]),
      dropped,
      "s",
    );
    const els = props.elements as { id: string; image?: string }[];
    expect(els.map((e) => e.id)).toEqual(["e_a", "e_d", "e_e", "e_f"]);
    // A crop in a products section stays an unknown slot: fillPreset drops it.
    expect(els.find((e) => e.id === "e_f")!.image).toBe("{crop.1}");
    expect(dropped.join("; ")).toMatch(/e_b.text literal text removed.*e_c: call button removed.*literal list items removed.*no AI picture in a products section.*e_g: quote is not the client's words/);
    expect(sourcesOf(fx.base, fx.sources.brief, fx.description).business.name).toBe("Pekarna Kvas");
  });
});

describe("review fixes (studio 0.5b)", () => {
  const run = (answer: RebuildAnswer, cfg: AppConfig = config, seen: ModelRequest[] = [], bodies: { model: ImageGenModelConfig; body: Record<string, unknown> }[] = [], delayMs = 0) => {
    const fx = pekarna(bodies);
    return {
      fx,
      result: runStudio(scripted({ artDirector: [JSON.stringify(direction)], rebuild: [JSON.stringify(answer)], director: [new Error("no picker in this test")] }, seen, cfg, delayMs), cfg, {
        spec: fx.spec,
        brief: fx.brief as never,
        corpus: fx.corpus,
        seed: 1,
        mockup: fx.deps,
      }),
    };
  };

  it("an invented web address and an invented name are removed, and the page is still built", async () => {
    const a = rebuild();
    const products = a.sections[1]!.props as { elements: Record<string, unknown>[] };
    products.elements.push(
      { id: "e_ig", kind: "action", action: "link", label: "Instagram", link: { label: "Instagram", target: { url: "https://instagram.com/pekarna-izmisljena" } }, style: "secondary", desk: desk(8, 3, 6), phone: phone(9) },
      { id: "e_master", kind: "heading", text: "Mojster Janez Novak", level: 3, size: 2, desk: desk(1, 7, 6), phone: phone(10) },
    );
    const contact = a.sections[3]!.props as { elements: Record<string, unknown>[] };
    (contact.elements[0] as { link: unknown }).link = { url: "https://example.org/narocila" };
    a.sections[2]!.copy = { headline: "Pri mojstru Petru Kovaču" };
    const { fx, result } = run(a);
    const r = await result;
    if (!r.ok) throw new Error(`${r.reason} / ${r.mockup?.reason}`);
    expect(r.path).toBe("mockup");
    const text = JSON.stringify(home(r.spec).sections);
    expect(text).not.toMatch(/instagram|example\.org|Janez|Novak|Kovač/);
    expect(text).toContain("041 555 906");
    expect(r.dropped.join("; ")).toMatch(/link to https:\/\/instagram\.com.*removed/);
    expect(r.dropped.join("; ")).toMatch(/e_master\.text literal text removed/);
    expect(r.dropped.join("; ")).toMatch(/Petru, Kovaču not in the client's words/);
    expect(studioGuards(r.spec, fx.spec, fx.corpus)).toBeNull();
  }, 60_000);

  it("names: a client's place in another case passes, an invented person does not", () => {
    const words = new Set(["ptuj", "sorškega", "jure", "petek", "kamnik"]);
    expect(unknownNames("Delamo na Ptuju in v okolici.", words)).toEqual([]);
    expect(unknownNames("Cvetje s Sorškem polju.", words)).toEqual([]);
    expect(unknownNames("Mojster Janez Novak in Petru Kovaču", words)).toEqual(["Janez", "Novak", "Petru", "Kovaču"]);
  });

  it("a link to the business's own booking or social address is kept", () => {
    const ctx = { known: new Set<string>(), words: new Set<string>(), urls: new Set(["https://instagram.com/pekarnakvas"]) };
    const props = sanitiseProps({ elements: [{ id: "e_ig", kind: "action", action: "link", label: "Instagram", link: { label: "Instagram", target: { url: "https://instagram.com/pekarnakvas/" } } }] }, "contact", ctx, new Map(), [], "s");
    expect((props.elements as unknown[]).length).toBe(1);
  });

  it("after the time limit nothing more is sent: no image, no rebuild; the spend so far is the picker's to subtract", async () => {
    const seen: ModelRequest[] = [];
    const bodies: { model: ImageGenModelConfig; body: Record<string, unknown> }[] = [];
    // The art director answers after 1.5 s; the limit is 0.8 s (the photos are prepared well before it).
    const quick = { ...config, studio: { ...config.studio, mockup: { ...config.studio.mockup, timeoutSeconds: 0.8 } } };
    const r = await run(rebuild(), quick, seen, bodies, 1500).result;
    expect(r.mockup?.reason).toMatch(/timed out/);
    expect(seen.map((q) => q.stage)).toContain("artDirector");
    // The art director's call was in flight: its estimate counts as spent (the picker gets perRunMaxEur less it).
    expect(r.costEur).toBeGreaterThan(0.05);
    // Let the art director's late answer arrive: the run must stop there.
    await new Promise((res) => setTimeout(res, 1500));
    expect(bodies).toHaveLength(0);
    expect(seen.map((q) => q.stage)).not.toContain("rebuild");
  }, 20_000);

  it("refuses every crop when the business has photos and the rebuild named no photo region; work and products are not decoration", () => {
    const crops = [{ id: "crop1", box: { x: 10, y: 10, w: 200, h: 200 }, shows: "an ornament", alt: "Okras", contains: [] }];
    const size = { width: 1536, height: 1024 };
    expect(checkCrops({ photoRegions: [], crops }, size, 3, { clientPhotos: 3 })[0]).toMatchObject({ ok: false, reason: expect.stringMatching(/no photo regions/) });
    expect(checkCrops({ photoRegions: [], crops }, size, 3, { clientPhotos: 0 })[0]!.ok).toBe(true);
    for (const shows of ["the client's work", "a product shot", "izdelek", "a finished tattoo, their work"]) expect(checkCrops({ photoRegions: [], crops: [{ ...crops[0]!, shows }] }, size, 3)[0]!.ok, shows).toBe(false);
  });

  it("drops a rejected drawing (decor, list marker, background layer) and unknown masks or treatments", () => {
    const rejected = inventory()
      .all()
      .find((a) => a.status === "rejected" && (VOCABS.DRAWINGS as readonly string[]).includes(a.id))!.id;
    const ctx = { known: new Set<string>(), words: new Set<string>(), urls: new Set<string>() };
    const dropped: string[] = [];
    const props = sanitiseProps(
      {
        elements: [
          { id: "e_d", kind: "decor", drawing: rejected },
          { id: "e_l", kind: "list", items: ["{brief.offerings[0].name}"], marker: "drawing", drawing: rejected },
          { id: "e_i", kind: "image", image: "img_01", ratio: "1:1", mask: "no-such-mask", treatment: "no-such-treatment" },
          { id: "e_ok", kind: "decor", drawing: rebuildVocabs().DRAWINGS[0] },
        ],
        background: [{ kind: "drawing", drawing: rejected, scale: 2, anchor: "end" }],
      },
      "story",
      ctx,
      new Map(),
      dropped,
      "s",
    );
    const els = props.elements as Record<string, unknown>[];
    expect(els.map((e) => e.id)).toEqual(["e_l", "e_i", "e_ok"]);
    expect(els[0]).toMatchObject({ marker: "dot" });
    expect(els[0]!.drawing).toBeUndefined();
    expect(els[1]!.mask).toBeUndefined();
    expect(els[1]!.treatment).toBeUndefined();
    expect(props.background).toBeUndefined();
    expect(dropped.join("; ")).toContain(`drawing ${rejected} is not approved`);
  });

  it("runStudio never throws: an unexpected error is ok:false and today's spec stays", async () => {
    const fx = pekarna();
    const r = await runStudio(scripted({}), config, { spec: {} as SiteSpec, corpus: "", seed: 1, mockup: fx.deps });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^studio: /);
  });
});

describe("images that may have been billed", () => {
  for (const name of ["TimeoutError", "AbortError"]) {
    it(`a fal ${name} is booked at the image's price (generate and paint)`, async () => {
      const booked: number[] = [];
      const gen = new ImageGenerator({
        config,
        transport: {
          async generate() {
            throw new DOMException("gave up", name);
          },
        },
        spentToday: async () => 0,
        onCall: async (c) => void booked.push(c.costEur),
      });
      await expect(gen.generate("x")).rejects.toThrow("gave up");
      await expect(gen.paint(config.studio.mockup.model, { prompt: "x", image_size: { width: 1536, height: 1024 } }, { stage: "mockup" })).rejects.toThrow("gave up");
      expect(booked).toHaveLength(2);
      for (const b of booked) expect(b).toBeGreaterThan(0);
    });
  }
  it("a refused request (HTTP 4xx) is still booked at €0", async () => {
    const booked: number[] = [];
    const gen = new ImageGenerator({ config, transport: { generate: async () => Promise.reject(new Error("HTTP 422")) }, spentToday: async () => 0, onCall: async (c) => void booked.push(c.costEur) });
    await expect(gen.paint(config.studio.mockup.model, { prompt: "x" }, { stage: "mockup" })).rejects.toThrow();
    expect(booked).toEqual([0]);
  });
});

describe("the mockup is never published", () => {
  it("the stand-in painter's image is a JPEG of the configured size (the run returns it for the eval only)", async () => {
    const p = painter();
    const out = await p.paint(config.studio.mockup.model, { prompt: "x", image_size: { width: 640, height: 480 } }, { stage: "mockup" });
    const meta = await sharp(out.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 640, 480]);
    expect(out.costEur).toBeCloseTo(config.imageGen.models[config.studio.mockup.model]!.usdPerImage! * config.eurPerUsd, 6);
  });
});
