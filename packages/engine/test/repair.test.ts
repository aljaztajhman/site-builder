import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import type { ImageAsset } from "@sb/spec";
import {
  Brief,
  ModelClient,
  SEO_LIMITS,
  contentJsonSchema,
  contentOutputSchema,
  designFromChoice,
  extractJson,
  generateContent,
  generatedImageCount,
  repairContentOutput,
  shortenAtWordBoundary,
  verifyBriefFacts,
  type ModelResponse,
} from "../src/index.ts";

const evalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval");
const recordingsDir = path.join(evalDir, "recordings");
const response = (file: string) => (JSON.parse(readFileSync(path.join(recordingsDir, file), "utf8")) as { response: ModelResponse }).response;
const recorded = (file: string): unknown => JSON.parse(extractJson(response(file).text));

describe("shortenAtWordBoundary", () => {
  it("leaves text within the limit alone (trimmed)", () => {
    expect(shortenAtWordBoundary("  Kontakt | Pekarna Kvas ", 60)).toBe("Kontakt | Pekarna Kvas");
  });

  it("ends on a clause boundary in the second half instead of a dangling word", () => {
    const s = "Inštalacije Rebernik Ptuj | Vodovod, ogrevanje, toplotne črpalke";
    expect(shortenAtWordBoundary(s, 60)).toBe("Inštalacije Rebernik Ptuj | Vodovod, ogrevanje");
  });

  it("never cuts a word and strips a trailing separator", () => {
    // The cut lands right after "Ptuj |"; the dangling separator goes.
    expect(shortenAtWordBoundary("Vodovodne inštalacije Rebernik Ptuj | Ogrevanje", 37)).toBe("Vodovodne inštalacije Rebernik Ptuj");
    expect(shortenAtWordBoundary("Ena dva tri štiri – pet", 19)).toBe("Ena dva tri štiri");
    expect(shortenAtWordBoundary("Ena dva tri štiri - pet", 19)).toBe("Ena dva tri štiri");
    expect(shortenAtWordBoundary("Ena dva tri štiri, pet", 18)).toBe("Ena dva tri štiri");
    const out = shortenAtWordBoundary("Domači kruh iz krušne peči in pecivo vsak dan", 30)!;
    expect(out).toBe("Domači kruh iz krušne peči in");
    expect("Domači kruh iz krušne peči in pecivo vsak dan".split(" ")).toEqual(expect.arrayContaining(out.split(" ")));
  });

  it("keeps the full stop when it ends on a sentence", () => {
    const s = "Pečemo kruh z drožmi vsak dan. Ob sobotah tudi rogljiče in potico po naročilu za praznike.";
    expect(shortenAtWordBoundary(s, 60)).toBe("Pečemo kruh z drožmi vsak dan.");
  });

  it("gives up when one word is longer than the limit", () => {
    expect(shortenAtWordBoundary("Nadpovprečnovelikabeseda", 10)).toBeNull();
  });
});

describe("repairContentOutput", () => {
  it("trims whitespace around keys, keeping order, unless the trimmed key exists", () => {
    const data = { pages: [{ " id": "p_home", "kind ": "home", props: { " link": { label: "x" }, link: { label: "y" } } }] };
    const repairs = repairContentOutput(data);
    expect(Object.keys(data.pages[0]!)).toEqual(["id", "kind", "props"]);
    expect(data.pages[0]!.props).toEqual({ " link": { label: "x" }, link: { label: "y" } });
    expect(repairs).toEqual(['/pages/0: trimmed key " id"', '/pages/0: trimmed key "kind "']);
  });

  it("drops null properties but never array items", () => {
    const data = { a: null, b: [null, { c: null, d: 1 }] };
    expect(repairContentOutput(data)).toEqual(["/a: dropped null", "/b/1/c: dropped null"]);
    expect(data).toEqual({ b: [null, { d: 1 }] });
  });

  it("dropping nulls can't remove a value the content schema accepts: no field in it is nullable", () => {
    expect(JSON.stringify(contentJsonSchema())).not.toMatch(/"null"|:null\b/);
  });

  it("shortens SEO title and description over their limits and reports it", () => {
    const description = `${"Pečemo kruh z drožmi vsak dan. ".repeat(5)}Ob sobotah tudi rogljiče.`;
    const data = { pages: [{ seo: { title: "Inštalacije Rebernik Ptuj | Vodovod, ogrevanje, toplotne črpalke", description } }, { seo: { title: "Kratek", description: "Opis." } }] };
    const repairs = repairContentOutput(data);
    expect(data.pages[0]!.seo.title).toBe("Inštalacije Rebernik Ptuj | Vodovod, ogrevanje");
    expect(data.pages[0]!.seo.description.length).toBeLessThanOrEqual(SEO_LIMITS.description);
    expect(data.pages[0]!.seo.description).toMatch(/dan\.$/);
    expect(data.pages[1]!.seo).toEqual({ title: "Kratek", description: "Opis." });
    expect(repairs).toEqual(["/pages/0/seo/title: shortened from 64 to 46 characters", `/pages/0/seo/description: shortened from ${description.length} to ${data.pages[0]!.seo.description.length} characters`]);
  });

  it("leaves anything else alone: other long texts, non-string SEO fields, non-objects", () => {
    const long = "x ".repeat(100).trim();
    const data = { pages: [{ seo: { title: 5, description: long }, nav: { label: long } }], other: "y" };
    repairContentOutput(data);
    expect(data.pages[0]!.nav.label).toBe(long);
    expect(data.pages[0]!.seo.title).toBe(5);
    expect(repairContentOutput("text")).toEqual([]);
    expect(repairContentOutput(null)).toEqual([]);
  });

  it("repairs the two first answers the 2026-10-01 recording rejected", () => {
    const rebernik = recorded("instalacije-rebernik/003-content.json");
    expect(repairContentOutput(rebernik)).toEqual(["/pages/0/seo/title: shortened from 64 to 46 characters"]);
    expect(contentOutputSchema().safeParse(rebernik).success).toBe(true);

    const grabnar = recorded("kmetija-grabnar/004-content.json");
    expect(repairContentOutput(grabnar)).toEqual(['/pages/0/sections/3/props: trimmed key " link"', "/pages/0/sections/3/props/link: dropped null"]);
    expect(contentOutputSchema().safeParse(grabnar).success).toBe(true);
  });
});

describe("generateContent", () => {
  it("keeps the repaired kmetija-grabnar first answer without a retry and reports the repairs", async () => {
    const config = loadConfig();
    const fixture = JSON.parse(readFileSync(path.join(evalDir, "fixtures/kmetija-grabnar/brief.json"), "utf8")) as { description: string; photos: unknown[] };
    const { brief } = verifyBriefFacts(Brief.parse(recorded("kmetija-grabnar/001-brief.json")), fixture.description);
    const photos: ImageAsset[] = (recorded("kmetija-grabnar/003-altText.json") as { images: unknown[] }).images.map((_, i) => ({ id: `img_${String(i + 1).padStart(2, "0")}`, src: "x", width: 1600, height: 1067, alt: "x" }));
    const wanted = generatedImageCount(config, fixture.photos.length, true, "full").wanted;
    const generated: ImageAsset[] = brief.imageIdeas.slice(0, wanted).map((idea, i) => ({ id: `img_g${i + 1}`, src: "x", width: 1536, height: 1024, alt: idea.alt.slice(0, 180), origin: "generated" }));
    const answers = [response("kmetija-grabnar/004-content.json")];
    let calls = 0;
    const client = new ModelClient({
      config,
      spentToday: async () => 0,
      onCall: async () => undefined,
      transport: { send: async () => answers[calls++] ?? Promise.reject(new Error("unexpected retry")) },
    });
    const r = await generateContent(client, {
      slug: "kmetija-grabnar",
      brief,
      design: designFromChoice(recorded("kmetija-grabnar/002-design.json") as Parameters<typeof designFromChoice>[0]),
      assets: { images: [...photos, ...generated] },
      scope: "full",
      heroImageIds: [],
      structuredOutput: true,
      retries: 2,
      corpus: fixture.description,
    });
    expect(calls).toBe(1);
    expect(r.attempts).toBe(1);
    expect(r.issues).toEqual([]);
    expect(r.repairs).toEqual(['/pages/0/sections/3/props: trimmed key " link"', "/pages/0/sections/3/props/link: dropped null"]);
  });
});
