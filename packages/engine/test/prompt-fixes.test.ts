import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Operation } from "fast-json-patch";
import { loadConfig, type AppConfig } from "@sb/config";
import { DIRECTIONS, checkDesign, direction, isWarmTint, mainHeadingIssues, type SiteSpec } from "@sb/spec";
import {
  ALL_PROMPT_FIXES,
  BRIEF_RULES,
  ImageGenerator,
  ModelClient,
  NO_PROMPT_FIXES,
  PATCH_FORMAT,
  RULES,
  RULES_RESPONSIVE,
  SLOVENE_STYLE,
  altSystem,
  altTexts,
  applyPatches,
  briefSystem,
  businessSchema,
  classifySystem,
  contentSystem,
  critique,
  critiqueSystem,
  designSystem,
  directionHeroes,
  directionsCatalogue,
  editSpec,
  editSystem,
  heroRule,
  pipelineStyle,
  requestBody,
  rules,
  sectionCatalogue,
  type ModelRequest,
  type ModelTransport,
  type PromptFixes,
} from "../src/index.ts";

const config = loadConfig();
const evalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval");
const golden = (id: string) => JSON.parse(readFileSync(path.join(evalDir, "golden", `${id}.json`), "utf8")) as SiteSpec;
const corpus = (id: string) => (JSON.parse(readFileSync(path.join(evalDir, "fixtures", id, "brief.json"), "utf8")) as { description: string }).description;
const GOLDENS = ["avtoservis-mrak", "fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "instalacije-rebernik", "kmetija-grabnar", "pekarna-kvas", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"];
const only = (k: keyof PromptFixes): PromptFixes => ({ ...NO_PROMPT_FIXES, [k]: true });
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

function client(fixes: PromptFixes, answer: string): { client: ModelClient; seen: ModelRequest[] } {
  const seen: ModelRequest[] = [];
  const transport: ModelTransport = {
    async send(req, stage) {
      seen.push(req);
      return { text: answer, stopReason: "end_turn", model: stage.model, usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
    },
  };
  const c: AppConfig = { ...config, promptFixes: fixes };
  return { client: new ModelClient({ config: c, transport, spentToday: async () => 0, onCall: async () => undefined }), seen };
}
const textOf = (req: ModelRequest) =>
  req.messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((b) => ("text" in b ? b.text : "")).join("\n"))).join("\n");
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } }).png().toBuffer().then((b) => new Uint8Array(b));

describe("prompt fixes, all switches off", () => {
  it("the config ships with every switch off", () => {
    expect(Object.entries(config.promptFixes).filter(([k, v]) => k !== "$comment" && v !== false)).toEqual([]);
  });

  it("the config ships with the compact catalogue and homepage-first switches off too", () => {
    expect(config.prompts.compactCatalogue).toBe(false);
    expect(config.pipeline.homepageFirst).toBe(false);
  });

  it("with prompts.compactCatalogue off the catalogue and business schema are the same bytes as before", () => {
    expect(sha(sectionCatalogue(NO_PROMPT_FIXES, {}))).toBe("c1ca4f753e529bc2");
    expect(sha(sectionCatalogue(NO_PROMPT_FIXES, { compact: false }))).toBe("c1ca4f753e529bc2");
    expect(sha(businessSchema({}))).toBe("4e0f96995bd0d4be");
    expect(sha(businessSchema({ compact: false }))).toBe("4e0f96995bd0d4be");
  });

  it("every prompt is byte-identical to origin/main (sha256 taken from 1a7e070's prompts.ts)", () => {
    const off = NO_PROMPT_FIXES;
    expect({
      rules: sha(rules(off)),
      classify: sha(classifySystem(off)),
      brief: sha(briefSystem(off)),
      design: sha(designSystem(off)),
      alt: sha(altSystem(off)),
      content: sha(contentSystem(off)),
      critique: sha(critiqueSystem(off)),
      edit: sha(editSystem(off)),
      sections: sha(sectionCatalogue(off)),
      sectionsDefault: sha(sectionCatalogue()),
      directions: sha(directionsCatalogue(off)),
      business: sha(businessSchema()),
      patchFormat: sha(PATCH_FORMAT),
    }).toEqual({
      rules: "d703efadefad08ff",
      classify: "b1bd01e5e1030730",
      brief: "09d3b4c10486cd56",
      design: "55d0fb4d0c56f39f",
      alt: "8d0646c0aef58daf",
      content: "64574f74151dcfb4",
      critique: "3bb82536f5e1c9e2",
      edit: "bf6ab53fddf8b24f",
      sections: "c1ca4f753e529bc2",
      sectionsDefault: "c1ca4f753e529bc2",
      // Changed on purpose 2026-10-08 (HQ it-template-min-photos): template minimums count generated pictures; Ogledalo needs 1.
      directions: "87d5797d834dc13f",
      business: "4e0f96995bd0d4be",
      patchFormat: "fb8eba337fd71564",
    });
  });

  it("a fix changes only its own prompts", () => {
    const builders = { classify: classifySystem, brief: briefSystem, design: designSystem, alt: altSystem, content: contentSystem, critique: critiqueSystem, edit: editSystem, sections: sectionCatalogue, directions: directionsCatalogue };
    const changed = (k: keyof PromptFixes) => Object.entries(builders).filter(([, b]) => b(only(k)) !== b(NO_PROMPT_FIXES)).map(([n]) => n);
    expect(changed("pictures")).toEqual(["brief"]);
    expect(changed("critique")).toEqual(["critique"]);
    expect(changed("altText")).toEqual(["alt"]);
    expect(changed("judge")).toEqual([]);
    expect(changed("brief")).toEqual(["brief"]);
    expect(changed("classifier")).toEqual(["classify"]);
    expect(changed("edit")).toEqual(["edit"]);
    expect(changed("directions")).toEqual(["design", "directions"]);
    expect(changed("warmSurface")).toEqual(["edit"]);
    expect(changed("oneHero")).toEqual([]);
    expect(changed("beige")).toEqual([]);
    expect(changed("catalogue")).toEqual(["brief", "content", "critique", "edit", "sections"]);
    expect(changed("sloveneStyle")).toEqual(["content", "critique", "edit"]);
  });

  it("every fix at once still builds every prompt (no fix's passage was swapped away by another)", () => {
    for (const b of [classifySystem, briefSystem, designSystem, altSystem, contentSystem, critiqueSystem, editSystem, sectionCatalogue, directionsCatalogue]) expect(b(ALL_PROMPT_FIXES).length).toBeGreaterThan(300);
  });
});

describe("fix: catalogue (eyebrow, contact strip, cta, responsive, call buttons)", () => {
  const on = only("catalogue");
  it("RULES say responsive and limit call buttons instead of mobile first", () => {
    expect(rules(on)).not.toContain("Mobile first");
    expect(rules(on)).toContain(RULES_RESPONSIVE);
    expect(rules(on)).toContain("at most one call button on a page");
    expect(rules(on)).not.toContain('where the schema allows it, or leave the section out');
    for (const s of [contentSystem(on), critiqueSystem(on), editSystem(on)]) {
      expect(s).not.toContain(RULES);
      expect(s).toContain(RULES_RESPONSIVE);
    }
  });
  it("the catalogue no longer suggests the town or trade as eyebrow, the contact strip second, or a closing cta", () => {
    const off = sectionCatalogue(NO_PROMPT_FIXES);
    const c = sectionCatalogue(on);
    expect(off).toContain("e.g. the town or trade");
    expect(c).not.toContain("e.g. the town or trade");
    expect(c).toContain("Never just the trade or the town");
    expect(c).not.toContain("right after the hero on local-business homepages");
    expect(c).not.toContain("Use near the end of a page");
    expect(c).toContain("never to repeat call or directions");
    // Still a catalogue of every section, with valid JSON schemas.
    for (const line of c.split("\n").filter((l) => l.startsWith("Props schema: "))) expect(() => JSON.parse(line.slice("Props schema: ".length))).not.toThrow();
  });
});

describe("fix: sloveneStyle (the Slovene style block)", () => {
  const on = only("sloveneStyle");
  it("content, critique and edit get the block right after the rules; nothing else changes", () => {
    for (const [name, b] of Object.entries({ content: contentSystem, critique: critiqueSystem, edit: editSystem })) {
      const off = b(NO_PROMPT_FIXES);
      const s = b(on);
      expect(off, name).not.toContain(SLOVENE_STYLE);
      expect(s, name).toContain(`${RULES}\n${SLOVENE_STYLE}`);
      expect(s.replace(`\n${SLOVENE_STYLE}`, ""), name).toBe(off);
    }
    expect(briefSystem(on)).toBe(briefSystem(NO_PROMPT_FIXES));
  });
  it("covers register, typography, English words and word order", () => {
    expect(SLOVENE_STYLE).toContain('"skupaj poiščemo", not "skupaj poiščeva"');
    expect(SLOVENE_STYLE).toContain("never ti forms");
    expect(SLOVENE_STYLE).toContain("quotes „…“");
    expect(SLOVENE_STYLE).toContain('"4,20 €"');
    expect(SLOVENE_STYLE).toContain('"prevzem v trgovini", not "click & collect"');
    expect(SLOVENE_STYLE).toContain("never Title Case");
    // The em dash appears only where the block bans it.
    expect(SLOVENE_STYLE.replace('"—"', "")).not.toContain("—");
  });
  it("follows the catalogue fix's rules when both are on", () => {
    const both = { ...NO_PROMPT_FIXES, catalogue: true, sloveneStyle: true };
    for (const b of [contentSystem, critiqueSystem, editSystem]) expect(b(both)).toContain(`${rules(both)}\n${SLOVENE_STYLE}`);
  });
  it("the edit request carries it in its cached system block", async () => {
    const c = client(on, '{"reply": "Ni sprememb.", "patches": []}');
    await editSpec(c.client, { spec: golden("pekarna-kvas"), message: "Odstrani galerijo.", corpus: corpus("pekarna-kvas") });
    expect(c.seen[0]!.system[1]).toContain(SLOVENE_STYLE);
  });
});

describe("fix: pictures (brief imageIdeas and the picture style)", () => {
  const on = only("pictures");
  it("ideas are tied to the trade, compose the hero, no landscape unless the place is sold, no body parts", () => {
    const s = briefSystem(on);
    expect(s).not.toContain("or the landscape around their town");
    expect(s).toContain("only when the business sells the place itself");
    expect(s).toContain("middle third");
    expect(s).toContain("any part of a person (faces, hands, arms)");
    expect(s).toContain("signs of use");
  });
  it("generated pictures get the unstaged phone-photo style", async () => {
    expect(pipelineStyle({ ...config, promptFixes: on })).toBe(config.imageGen.pipeline.unstagedStyle);
    expect(pipelineStyle(config)).toBe(config.imageGen.pipeline.style);
    expect(config.imageGen.pipeline.unstagedStyle).toMatch(/Unstaged photo/);
    expect(config.imageGen.pipeline.unstagedStyle).toMatch(/no part of a person/);
    const seen: Record<string, unknown>[] = [];
    const jpeg = new Uint8Array(await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#808080" } }).jpeg().toBuffer());
    const gen = new ImageGenerator({ config: { ...config, promptFixes: on }, transport: { generate: async (_m, body) => (seen.push(body), jpeg) }, spentToday: async () => 0, onCall: async () => undefined });
    await gen.generate("Copper pipes on a workbench");
    const model = config.imageGen.models[config.imageGen.pipeline.model]!;
    expect(seen[0]).toEqual(requestBody(config, model, `Copper pipes on a workbench ${config.imageGen.pipeline.unstagedStyle}`, false));
  });
});

describe("fix: brief (its own rules, the address)", () => {
  const on = only("brief");
  it("the brief gets its own short rules instead of the site's RULES", () => {
    const s = briefSystem(on);
    expect(briefSystem(NO_PROMPT_FIXES)).toContain(RULES);
    expect(s).not.toContain(RULES);
    expect(s).not.toContain("Banned patterns");
    expect(s).toContain(BRIEF_RULES);
    expect(s).toContain('street "Glavni trg 9", postalCode "8000", city "Novo mesto"');
    expect(s.length).toBeLessThan(briefSystem(NO_PROMPT_FIXES).length - 1500);
  });
  it("classifier: confidence is defined (fix classifier)", () => {
    const s = classifySystem(only("classifier"));
    expect(s).toContain("0–0.2 when the text doesn't describe a business at all");
    expect(s).toContain("at most 0.5 when it is a business but no type fits");
  });
});

describe("fix: directions", () => {
  const on = only("directions");
  it("no black-and-white or duotone promises, no monochrome/duotone imagery printed, no Avoid list", () => {
    const off = directionsCatalogue(NO_PROMPT_FIXES);
    expect(off).toMatch(/black-and-white photos/);
    expect(off).toMatch(/Imagery: monochrome/);
    const c = directionsCatalogue(on);
    expect(c).not.toMatch(/black-and-white|duotone|monochrome/);
    expect(c).toContain("Imagery: square-cut photos in their true colours");
    expect(designSystem(on)).not.toContain("Avoid:");
    expect(designSystem(on)).toContain("Trade templates");
  });
  it("editorial offers a photo hero on the homepage instead of page-header:plain, so photo sites open on a photo", () => {
    const ed = direction("editorial");
    expect(directionHeroes(ed, NO_PROMPT_FIXES)).toContain("page-header:plain");
    expect(heroRule(["img_01"], directionHeroes(ed, NO_PROMPT_FIXES))).toBe("");
    expect(directionHeroes(ed, on)).not.toContain("page-header:plain");
    expect(heroRule(["img_01"], directionHeroes(ed, on))).toContain("hero-split:image-right");
    const block = directionsCatalogue(on).split("### ").find((b) => b.startsWith("editorial"))!;
    expect(block).toContain("heroes hero-type:large, hero-split:image-right");
    // Other directions keep their heroes.
    for (const d of DIRECTIONS.filter((x) => x.id !== "editorial")) expect(directionHeroes(d, on)).toEqual(d.layout.heroes);
  });
});

describe("fix: altText", () => {
  it("criteria for heroSuitable, and the business context in the request only with the switch", async () => {
    expect(altSystem(only("altText"))).toMatch(/heroSuitable is true only when the photo is sharp and well lit/);
    expect(altSystem(only("altText"))).not.toContain("placeholder with a caption");
    const answer = JSON.stringify({ images: [{ index: 0, alt: "Kruh", focalX: 0.5, focalY: 0.5, heroSuitable: true }] });
    const photo = { jpegBase64: Buffer.from(await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).jpeg().toBuffer()).toString("base64") };
    const context = { businessType: "bakery", description: "Pekarna Kvas v Kamniku, kruh z drožmi." };
    const off = client(NO_PROMPT_FIXES, answer);
    await altTexts(off.client, [photo], context);
    expect(textOf(off.seen[0]!)).not.toContain("Pekarna Kvas");
    const on = client(only("altText"), answer);
    const out = await altTexts(on.client, [photo], context);
    expect(textOf(on.seen[0]!)).toContain("Business type: bakery.");
    expect(textOf(on.seen[0]!)).toContain("Pekarna Kvas v Kamniku");
    expect(out[0]!.heroSuitable).toBe(true);
  });
});

describe("fix: critique", () => {
  const on = only("critique");
  it("priorities, Slovene only for clear errors, no deletions for component failures; no unseeable checklist items", () => {
    const s = critiqueSystem(on);
    expect(critiqueSystem(NO_PROMPT_FIXES)).toContain("LCP image preloaded");
    expect(s).not.toContain("LCP image preloaded");
    expect(s).not.toContain("body text ≥ 16 px");
    expect(s).toContain("Fix these first, in this order");
    expect(s).toContain('"terasico" stays "terasico"');
    expect(s).toContain("never delete or shorten content because of them");
  });
  it("the request lists the hero-suitable photos and asks for JSON only", async () => {
    const spec = golden("pekarna-kvas");
    const shots = { mobilePng: await png(360, 900), desktopPng: await png(1280, 800) };
    const input = { spec, ...shots, failures: [], corpus: corpus("pekarna-kvas"), heroImageIds: ["img_01", "img_g1"] };
    const off = client(NO_PROMPT_FIXES, '{"issues": [], "patches": []}');
    await critique(off.client, input);
    expect(textOf(off.seen[0]!)).toContain('Return JSON: {"issues": [...], "patches": [...]}');
    expect(textOf(off.seen[0]!)).not.toContain("Hero-suitable photos");
    const c = client(on, '{"issues": [], "patches": []}');
    await critique(c.client, input);
    expect(textOf(c.seen[0]!)).toContain("Hero-suitable photos: img_01, img_g1.");
    expect(textOf(c.seen[0]!)).toContain("Answer with JSON only, no prose before or after it");
    expect(c.seen[0]!.system).toEqual([sectionCatalogue(on), critiqueSystem(on)]);
  });
});

describe("fix: edit", () => {
  it("the cached edit block names the editor's sections in Slovene and the reply language", async () => {
    const s = editSystem(only("edit"));
    expect(s).toContain('"Poziv k dejanju" = cta');
    expect(s).toContain('"Uvod s fotografijo" = hero-split');
    expect(s).toContain("in the language of the client's request");
    const c = client(only("edit"), '{"reply": "Ni sprememb.", "patches": []}');
    await editSpec(c.client, { spec: golden("pekarna-kvas"), message: "Odstrani poziv k dejanju.", corpus: corpus("pekarna-kvas") });
    expect(c.seen[0]!.system[1]).toBe(`${s}\n\n${businessSchema()}`);
  });
});

describe("fix: warmSurface", () => {
  it("a warm direction's cream surface becomes a warm tint with the switch, the cool fallback without it", () => {
    const spec = golden("pekarna-kvas");
    const dir = direction(spec.design.direction);
    expect(["warm-craft", "skorja", "etiketa", "jedilnik"]).toContain(dir.id);
    const ops: Operation[] = [{ op: "replace", path: "/design/colors/surface", value: "#f5e6d3" }];
    const off = applyPatches(spec, ops, corpus("pekarna-kvas"));
    expect(off.issues).toEqual([]);
    expect(off.spec.design.colors.surface).toBe(dir.palette.fallback.surface);
    const on = applyPatches(spec, ops, corpus("pekarna-kvas"), only("warmSurface"));
    expect(on.issues).toEqual([]);
    expect(isWarmTint(on.spec.design.colors.surface)).toBe(true);
    expect(checkDesign(on.spec.design, dir)).toEqual([]);
  });
  it("the edit prompt says a warm direction may warm its surface (cream still banned)", () => {
    expect(editSystem(only("warmSurface"))).toContain("the section surface may become a warm tint");
  });
});

describe("fix: beige", () => {
  it("a beige page background from an edit is replaced with the switch, kept without it", () => {
    const spec = golden("zobozdravstvo-lebar");
    const dir = direction(spec.design.direction);
    const ops: Operation[] = [{ op: "replace", path: "/design/colors/background", value: "#ece3d0" }];
    const off = applyPatches(spec, ops, corpus("zobozdravstvo-lebar"));
    const on = applyPatches(spec, ops, corpus("zobozdravstvo-lebar"), only("beige"));
    expect(on.issues).toEqual([]);
    expect(on.spec.design.colors.background).not.toBe("#ece3d0");
    expect(checkDesign(on.spec.design, dir)).toEqual([]);
    // Without the switch beige passes on a direction that takes a tinted page (white pages are forced white anyway).
    if (dir.palette.background === "tint") expect(off.spec.design.colors.background).toBe("#ece3d0");
  });
});

describe("fix: oneHero", () => {
  const on = only("oneHero");
  it("every golden page has exactly one main heading, first", () => {
    for (const id of GOLDENS) expect(mainHeadingIssues(golden(id)), id).toEqual([]);
  });
  it("an edit adding a second hero, or removing the homepage's, is rejected with the switch and allowed without it", () => {
    const spec = golden("avtoservis-mrak");
    const hero = spec.pages[0]!.sections[0]!;
    const second: Operation[] = [{ op: "add", path: "/pages/0/sections/2", value: { ...structuredClone(hero), id: "s_second_hero" } }];
    expect(applyPatches(spec, second, corpus("avtoservis-mrak")).issues).toEqual([]);
    expect(applyPatches(spec, second, corpus("avtoservis-mrak"), on).issues.join(" ")).toMatch(/2 main headings/);
    const none: Operation[] = [{ op: "remove", path: "/pages/0/sections/0" }];
    expect(applyPatches(spec, none, corpus("avtoservis-mrak")).issues).toEqual([]);
    expect(applyPatches(spec, none, corpus("avtoservis-mrak"), on).issues.join(" ")).toMatch(/no main heading/);
  });
  it("repairs the safe cases: a page header moved down goes back to the top; a removed one comes back with the nav label", () => {
    const spec = golden("avtoservis-mrak");
    const pi = spec.pages.findIndex((p) => p.kind === "standard" && p.sections.length > 2 && p.sections[0]!.type === "page-header");
    expect(pi).toBeGreaterThan(0);
    const page = spec.pages[pi]!;
    const moved = applyPatches(spec, [{ op: "move", from: `/pages/${pi}/sections/0`, path: `/pages/${pi}/sections/2` }], corpus("avtoservis-mrak"), on);
    expect(moved.issues).toEqual([]);
    expect(moved.spec.pages[pi]!.sections[0]!.id).toBe(page.sections[0]!.id);
    const removed = applyPatches(spec, [{ op: "remove", path: `/pages/${pi}/sections/0` }], corpus("avtoservis-mrak"), on);
    expect(removed.issues).toEqual([]);
    expect(removed.spec.pages[pi]!.sections[0]).toMatchObject({ type: "page-header", variant: "plain", props: { title: page.nav.label } });
    expect(mainHeadingIssues(removed.spec)).toEqual([]);
  });
  it("a heading problem the site already had doesn't block an unrelated edit", () => {
    const spec = structuredClone(golden("avtoservis-mrak"));
    spec.pages[0]!.sections.splice(2, 0, { ...structuredClone(spec.pages[0]!.sections[0]!), id: "s_old_second" });
    const r = applyPatches(spec, [{ op: "add", path: "/chrome/header/tone", value: "inverse" }], corpus("avtoservis-mrak"), on);
    expect(r.issues).toEqual([]);
  });
});
