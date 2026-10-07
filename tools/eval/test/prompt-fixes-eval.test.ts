import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { ModelClient, NO_PROMPT_FIXES, type ModelRequest, type ModelTransport } from "@sb/engine";
import { toModelJsonSchema, type SiteSpec } from "@sb/spec";
import { JUDGE_SYSTEM, JudgeOutput, JudgeOutputNotesFirst, judgeHomepage, judgeSystem } from "../src/judge.ts";
import { homepageCopy, copyOverlap, copySummary } from "../src/copy-similarity.ts";
import { copyLines as varietyCopyLines } from "../src/variety-report.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const GOLDENS = ["avtoservis-mrak", "fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "instalacije-rebernik", "kmetija-grabnar", "pekarna-kvas", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"];
const golden = async (id: string) => JSON.parse(await readFile(path.join(here, "../golden", `${id}.json`), "utf8")) as SiteSpec;

describe("fix: judge (config promptFixes.judge)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sb-judge-fix-"));
    const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } }).png().toBuffer();
    await writeFile(path.join(dir, "home-360.png"), await png(360, 1600));
    await writeFile(path.join(dir, "home-1280.png"), await png(1280, 1600));
    await writeFile(path.join(dir, "home-360-first.png"), await png(360, 800));
    await writeFile(path.join(dir, "home-1280-first.png"), await png(1280, 800));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const answer = JSON.stringify({
    phoneNote: "x",
    desktopNote: "y",
    phone: { impression: 3, hierarchy: 3, imagery: 3, spacing: 3, clutter: 3, distinctiveness: 3 },
    desktop: { impression: 3, hierarchy: 3, imagery: 3, spacing: 3, clutter: 3, distinctiveness: 3 },
    fixes: [],
  });
  async function run(judge: boolean) {
    const seen: ModelRequest[] = [];
    const transport: ModelTransport = { send: async (req, stage) => (seen.push(req), { text: answer, stopReason: "end_turn", model: stage.model, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }) };
    const client = new ModelClient({ config: { ...config, promptFixes: { ...NO_PROMPT_FIXES, judge } }, transport, spentToday: async () => 0, onCall: async () => undefined });
    const out = await judgeHomepage(client, dir, { businessType: "bakery", direction: "skorja", photos: 0, generated: 2 });
    return { seen, out };
  }

  it("off: the judge's prompt and schema as before", async () => {
    expect(judgeSystem(false)).toBe(JUDGE_SYSTEM);
    const { seen } = await run(false);
    expect(seen[0]!.system).toEqual([JUDGE_SYSTEM]);
    expect(seen[0]!.schema).toEqual(toModelJsonSchema(JudgeOutput));
    expect(JSON.stringify(seen[0]!.messages)).not.toContain("Generated pictures");
  });

  it("on: required placeholders and the phone bar are intended, generated pictures named, notes before scores", async () => {
    expect(judgeSystem(true)).toContain("[Vnesite delovni čas]");
    expect(judgeSystem(true)).toContain("don't count the bar as a competing action");
    const { seen, out } = await run(true);
    expect(seen[0]!.system).toEqual([judgeSystem(true)]);
    expect(Object.keys((seen[0]!.schema as { properties: Record<string, unknown> }).properties)).toEqual(["phoneNote", "desktopNote", "phone", "desktop", "fixes"]);
    expect(JSON.stringify(seen[0]!.messages)).toContain("Generated pictures: 2.");
    expect(JudgeOutputNotesFirst.parse(out)).toEqual(out);
  });
});

describe("copy similarity (eval variety report)", () => {
  it("measures word overlap of the homepages' headings, the business's own name and town left out", async () => {
    const specs = await Promise.all(GOLDENS.map(golden));
    const sites = specs.map((s, i) => homepageCopy(GOLDENS[i]!, s.business.type, s));
    for (const s of sites) expect(s.headings.length, s.id).toBeGreaterThan(0);
    // The same homepage is the same copy; another business's name doesn't count as shared copy.
    expect(copyOverlap(sites[0]!, homepageCopy("twin", "car-repair", specs[0]!))).toBe(1);
    const name = specs[6]!.business.name;
    const renamed = structuredClone(specs[6]!);
    const hero = renamed.pages[0]!.sections[0]!.props as Record<string, unknown>;
    hero.headline = `${name} ${String(hero.headline ?? "")}`;
    expect(homepageCopy("x", "bakery", renamed).stems).toEqual(sites[6]!.stems);
    const c = copySummary(sites);
    expect(c.pairs).toHaveLength(45);
    for (const p of c.pairs) expect(p.overlap >= 0 && p.overlap <= 1, `${p.a}/${p.b}`).toBe(true);
    expect(c.acrossTrades).not.toBeNull();
    const lines = varietyCopyLines(sites).join("\n");
    expect(lines).toContain("## Copy: how alike the homepages read");
    expect(lines).toMatch(/Across trades: \*\*0\.\d\d\*\*/);
  });
});
