import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildRound, type BuildResult } from "../src/okus-items.ts";
import { ItemsFile, MadeFile, PairsFile, RoundsIndex, SHOT_NAMES, buildRunPairs, roundSources, runSources, type OkusItem } from "../src/okus-round.ts";

/**
 * Okus round 3: studio homepages from a studio-poc runs dir against today's homepage of the same business. A small
 * made-up runs dir (two businesses that built, three that didn't) checks which items and pairs the round gets, that it
 * is deterministic, that failed runs are skipped with a reason, and that okus:items copies the screenshots and writes
 * made/<itemId>.json (how it was made) outside items.json. No browser, no model call.
 */
let runs: string;

const png = (c: string) => sharp({ create: { width: 64, height: 40, channels: 3, background: c } }).png().toBuffer();

async function business(id: string, studio: object, opts: { today?: boolean; prompts?: object; mockup?: boolean } = {}): Promise<void> {
  await writeFile(path.join(runs, `${id}.studio.json`), JSON.stringify(studio));
  for (const shot of SHOT_NAMES) {
    await writeFile(path.join(runs, `${id}-${shot}.png`), await png("#c0392b"));
    if (opts.today !== false) await writeFile(path.join(runs, `${id}-today-${shot}.png`), await png("#2b44c9"));
  }
  if (opts.prompts) await writeFile(path.join(runs, `${id}.prompts.json`), JSON.stringify(opts.prompts));
  if (opts.mockup) await writeFile(path.join(runs, `${id}-mockup.jpg`), await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#d9a441" } }).jpeg().toBuffer());
}

const ART = {
  name: "Iz noči v jutro",
  idea: "Night to morning.",
  palette: [{ role: "inverse", hex: "#1d1712" }, "#f4efe6", { nope: 1 }],
  pairing: "fraunces-source-sans",
  typeCharacter: "Plump serif.",
  composition: "Hero inverse.",
  imagery: "Three client photos.",
  signature: "Oven arch.",
  copy: { headline: "Kruh z drožmi", lead: "Družinska pekarna.", empty: "" },
  imagePrompt: "One flat screenshot (art fallback).",
};

beforeAll(async () => {
  runs = await mkdtemp(path.join(tmpdir(), "sb-okus-runs-"));
  await business(
    "pekarna-kvas",
    { ok: true, path: "mockup", idea: "Kvas bakes overnight.", mockup: { ok: true, eur: { artDirector: 0.0886, mockup: 0.086, rebuild: 0.1514 } }, art: ART, eur: 0.326 },
    {
      mockup: true,
      prompts: {
        fixture: "pekarna-kvas",
        at: "2026-10-12T10:00:00.000Z",
        calls: [
          { stage: "artDirector", model: "claude-opus-5-5", system: "SYSTEM ART", messages: [{ role: "user", text: "Brief text" }], response: { name: "Iz noči v jutro" } },
          { stage: "rebuild", model: "claude-opus-5-5", system: [{ type: "text", text: "SYSTEM REBUILD" }], messages: [{ role: "user", text: "Rebuild it" }], response: "spec json" },
        ],
        mockup: { prompt: "One flat full-page screenshot.", references: ["ref-a.png"], image: "pekarna-kvas-mockup.jpg" },
      },
    },
  );
  await business("frizerstvo-lana", { ok: true, path: "mockup", idea: "Hair.", art: null });
  await business("avtoservis-mrak", { ok: false, path: null });
  await business("kmetija-grabnar", { ok: true, path: "direct", idea: "No mockup." });
  await business("gostilna-zlata-zlica", { ok: true, path: "mockup" }, { today: false });
});
afterAll(async () => {
  if (runs) await rm(runs, { recursive: true, force: true });
});

describe("round 3 items from a runs dir", () => {
  it("a studio-run and a today item per business that built on the mockup path; the rest skipped with a reason", () => {
    const r = runSources(runs);
    expect(r.sources.map((s) => s.id).sort()).toEqual(["run-frizerstvo-lana", "run-pekarna-kvas", "today-frizerstvo-lana", "today-pekarna-kvas"]);
    for (const s of r.sources) {
      expect(s.kind).toBe(s.id.startsWith("run-") ? "studio-run" : "today");
      expect(s.render).toBe("copy");
    }
    const kvas = r.sources.find((s) => s.id === "run-pekarna-kvas")!;
    expect(kvas).toMatchObject({ fixture: "pekarna-kvas", trade: "bakery", label: "studio run: Iz noči v jutro" });
    expect(r.sources.find((s) => s.id === "today-pekarna-kvas")).toMatchObject({ label: "today: pekarna-kvas", fixture: "pekarna-kvas" });
    expect(r.skipped.map((s) => s.fixture).sort()).toEqual(["avtoservis-mrak", "gostilna-zlata-zlica", "kmetija-grabnar"]);
    const why = Object.fromEntries(r.skipped.map((s) => [s.fixture, s.reason]));
    expect(why["avtoservis-mrak"]).toMatch(/did not build/);
    expect(why["kmetija-grabnar"]).toMatch(/not the mockup path/);
    expect(why["gostilna-zlata-zlica"]).toMatch(/missing screenshots: gostilna-zlata-zlica-today-desk\.png/);
  });

  it("is deterministic and the same as roundSources(3)", () => {
    const ids = runSources(runs).sources.map((s) => s.id);
    expect(runSources(runs).sources.map((s) => s.id)).toEqual(ids);
    expect(roundSources(3, { from: runs }).map((s) => s.id)).toEqual(ids);
    expect(() => roundSources(3)).toThrow(/--from/);
  });

  it("makes a made/ document per run item: direction, calls with stage names, mockup prompt, € by stage", () => {
    const { made } = runSources(runs);
    expect(made.map((m) => m.itemId).sort()).toEqual(["run-frizerstvo-lana", "run-pekarna-kvas"]);
    const kvas = made.find((m) => m.itemId === "run-pekarna-kvas")!;
    expect(kvas.mockupJpg).toBe(path.join(runs, "pekarna-kvas-mockup.jpg"));
    const doc = MadeFile.parse(kvas.doc);
    expect(doc.idea).toBe("Kvas bakes overnight.");
    expect(doc.direction).toEqual({
      name: "Iz noči v jutro",
      idea: "Night to morning.",
      palette: [{ role: "inverse", hex: "#1d1712" }, { role: null, hex: "#f4efe6" }],
      pairing: "fraunces-source-sans",
      typeCharacter: "Plump serif.",
      composition: "Hero inverse.",
      imagery: "Three client photos.",
      signature: "Oven arch.",
      copy: { headline: "Kruh z drožmi", lead: "Družinska pekarna." },
    });
    expect(doc.mockupImage).toBe("img/run-pekarna-kvas-mockup.jpg");
    expect(doc.calls.map((c) => c.stage)).toEqual(["artDirector", "rebuild"]);
    expect(doc.calls[0]).toEqual({ stage: "artDirector", model: "claude-opus-5-5", system: "SYSTEM ART", messages: [{ role: "user", text: "Brief text" }], response: JSON.stringify({ name: "Iz noči v jutro" }, null, 2) });
    expect(doc.calls[1]!.system).toBe("SYSTEM REBUILD");
    expect(doc.mockupPrompt).toBe("One flat full-page screenshot.");
    expect(doc.mockupReferences).toEqual(["ref-a.png"]);
    expect(doc.eur).toEqual({ artDirector: 0.0886, mockup: 0.086, rebuild: 0.1514 });
    expect(doc.eurTotal).toBe(0.326);
    // No prompts.json, no mockup: still a document, with what there is.
    const lana = MadeFile.parse(made.find((m) => m.itemId === "run-frizerstvo-lana")!.doc);
    expect(lana).toMatchObject({ idea: "Hair.", calls: [], mockupImage: null, mockupPrompt: null, eur: {}, eurTotal: null, direction: {} });
  });
});

describe("round 3 pairs", () => {
  const lite = (n: number): Pick<OkusItem, "id" | "kind" | "trade" | "fixture">[] =>
    Array.from({ length: n }, (_, i) => [
      { id: `run-b${i}`, kind: "studio-run" as const, trade: "t", fixture: `b${i}` },
      { id: `today-b${i}`, kind: "today" as const, trade: "t", fixture: `b${i}` },
    ]).flat();

  it("one studio-today pair per business, deterministic, sides mixed", () => {
    const items = lite(15);
    const pairs = buildRunPairs(items, "okus-round-3");
    expect(pairs.length).toBe(15);
    expect(buildRunPairs(items, "okus-round-3")).toEqual(pairs);
    expect(() => PairsFile.parse({ round: 3, pairs })).not.toThrow();
    for (const p of pairs) {
      expect(p.kind).toBe("studio-today");
      expect([p.a, p.b].map((x) => x.replace(/^(run|today)-/, ""))).toEqual([p.a.replace(/^(run|today)-/, ""), p.a.replace(/^(run|today)-/, "")]);
    }
    const runLeft = pairs.filter((p) => p.a.startsWith("run-")).length;
    expect(runLeft).toBeGreaterThan(0);
    expect(runLeft).toBeLessThan(15);
  });

  it("no pair for a business with only one of its items", () => {
    expect(buildRunPairs(lite(2).filter((i) => i.id !== "today-b1"), "okus-round-3").map((p) => [p.a, p.b].sort())).toEqual([["run-b0", "today-b0"]]);
  });
});

describe("okus:items --round 3 --from <runs dir>", () => {
  let okusDir: string;
  let result: BuildResult;
  beforeAll(async () => {
    okusDir = await mkdtemp(path.join(tmpdir(), "sb-okus-r3-"));
    await mkdir(path.join(okusDir, "rounds"), { recursive: true });
    await writeFile(path.join(okusDir, "rounds/index.json"), JSON.stringify({ rounds: [1] }));
    result = await buildRound({ round: 3, from: runs, okusDir });
  }, 120_000);
  afterAll(async () => {
    if (okusDir) await rm(okusDir, { recursive: true, force: true });
  });

  it("writes items.json, pairs.json, the pictures and adds round 3 to the index", async () => {
    const dir = path.join(okusDir, "rounds/3");
    const items = ItemsFile.parse(JSON.parse(await readFile(path.join(dir, "items.json"), "utf8")));
    expect(items.items.map((i) => i.id)).toEqual(runSources(runs).sources.map((s) => s.id));
    const pairs = PairsFile.parse(JSON.parse(await readFile(path.join(dir, "pairs.json"), "utf8")));
    expect(pairs.pairs.length).toBe(2);
    expect(RoundsIndex.parse(JSON.parse(await readFile(path.join(okusDir, "rounds/index.json"), "utf8"))).rounds).toEqual([1, 3]);
    for (const it of items.items) for (const rel of Object.values(it.images)) expect((await sharp(path.join(dir, rel)).metadata()).format).toBe("jpeg");
    expect(result.skipped.length).toBe(3);
    expect(result.bytes).toBeLessThan(15 * 1024 * 1024);
  });

  it("writes made/<itemId>.json and the mockup for run items only, and keeps them out of items.json", async () => {
    const dir = path.join(okusDir, "rounds/3");
    expect((await readdir(path.join(dir, "made"))).sort()).toEqual(["run-frizerstvo-lana.json", "run-pekarna-kvas.json"]);
    const doc = MadeFile.parse(JSON.parse(await readFile(path.join(dir, "made/run-pekarna-kvas.json"), "utf8")));
    expect(doc.calls.length).toBe(2);
    const mock = await sharp(path.join(dir, doc.mockupImage!)).metadata();
    expect([mock.format, mock.width]).toEqual(["jpeg", 1280]);
    expect(existsSync(path.join(dir, "img/run-frizerstvo-lana-mockup.jpg"))).toBe(false);
    const raw = await readFile(path.join(dir, "items.json"), "utf8");
    for (const leak of ["SYSTEM ART", "mockupPrompt", "calls", "made/"]) expect(raw).not.toContain(leak);
  });

  it("--only takes a business id (both of its items)", async () => {
    const sub = await mkdtemp(path.join(tmpdir(), "sb-okus-r3-only-"));
    try {
      const r = await buildRound({ round: 3, from: runs, okusDir: sub, only: ["frizerstvo-lana"] });
      expect(r.items.map((i) => i.id).sort()).toEqual(["run-frizerstvo-lana", "today-frizerstvo-lana"]);
      expect(r.pairs.length).toBe(1);
      expect(await readdir(path.join(sub, "rounds/3/made"))).toEqual(["run-frizerstvo-lana.json"]);
      await expect(buildRound({ round: 3, from: runs, okusDir: sub, only: ["nope"] })).rejects.toThrow(/Unknown item ids: nope/);
    } finally {
      await rm(sub, { recursive: true, force: true });
    }
  }, 60_000);
});
