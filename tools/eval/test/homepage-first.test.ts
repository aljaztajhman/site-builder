import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { costEur, loadConfig, type AppConfig } from "@sb/config";
import {
  Brief,
  ModelClient,
  ReplayTransport,
  generateContent,
  generateSite,
  launchCheckBrowser,
  type CallRecord,
  type CheckBrowser,
  type ContentInput,
  type ModelRequest,
  type ModelTransport,
} from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
import { validateSite, type SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { syntheticRecordings } from "../src/synthetic.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const homepageFirst: AppConfig = { ...config, pipeline: { homepageFirst: true } };
const USAGE = { input_tokens: 2000, output_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 16000 };

const goldenOf = async (id: string) => JSON.parse(await readFile(path.join(here, "../golden", `${id}.json`), "utf8")) as SiteSpec;
const textOf = (req: ModelRequest) => req.messages[0]!.content as string;

/**
 * Answers content requests from the golden spec: the one-call request with every page, the homepage part with the
 * homepage, a page part ("… (page id p_x, …") with that page. `override(id, n)` replaces a part's n-th answer.
 */
function goldenContent(golden: SiteSpec, override?: (id: string, n: number) => unknown) {
  const pages = golden.pages.filter((p) => p.kind === "home" || p.kind === "standard");
  const seen: { req: ModelRequest; at: number; done?: number }[] = [];
  const asked = new Map<string, number>();
  const transport: ModelTransport = {
    async send(req, stage) {
      const entry: { req: ModelRequest; at: number; done?: number } = { req, at: Date.now() };
      seen.push(entry);
      const first = textOf(req);
      const id = first.startsWith("Build the homepage of the full site") ? "home" : (/\(page id (p_[a-z0-9_-]+),/.exec(first)?.[1] ?? "site");
      const n = (asked.get(id) ?? 0) + 1;
      asked.set(id, n);
      await new Promise((r) => setTimeout(r, id === "home" ? 10 : 2));
      const body =
        override?.(id, n) ??
        (id === "site" ? { chrome: golden.chrome, pages } : id === "home" ? { chrome: golden.chrome, pages: pages.filter((p) => p.kind === "home") } : { pages: pages.filter((p) => p.id === id) });
      entry.done = Date.now();
      return { text: JSON.stringify(body), stopReason: "end_turn", model: stage.model, usage: USAGE };
    },
  };
  return { transport, seen, asked };
}

async function contentInput(id: string, scope: "home" | "full" = "full"): Promise<{ input: ContentInput; golden: SiteSpec }> {
  const fixture = loadFixture(id);
  const golden = await goldenOf(id);
  const brief = Brief.parse(JSON.parse(syntheticRecordings(fixture, golden).find((r) => r.stage === "brief")!.response.text));
  return {
    golden,
    input: { slug: id, brief, design: golden.design, assets: golden.assets, scope, heroImageIds: [], structuredOutput: false, retries: config.limits.contentRetries, corpus: fixture.brief.description },
  };
}

describe("content stage, homepage first (pipeline.homepageFirst)", () => {
  for (const id of ["fizioterapija-pregib", "gostilna-zlata-zlica", "racunovodstvo-seliskar"]) {
    it(`${id}: the homepage, then each page in its own call, merged into the same spec as one call`, async () => {
      const { input, golden } = await contentInput(id);
      const one = goldenContent(golden);
      const records: CallRecord[] = [];
      const single = await generateContent(new ModelClient({ config, transport: one.transport, spentToday: async () => 0, onCall: async () => undefined }), input);
      const split = goldenContent(golden);
      let homepage = 0;
      const r = await generateContent(new ModelClient({ config, transport: split.transport, spentToday: async () => 0, onCall: async (c) => void records.push(c) }), {
        ...input,
        homepageFirst: true,
        onHomepage: () => void (homepage = Date.now()),
      });
      const others = golden.pages.filter((p) => p.kind === "standard").length;
      expect(one.seen).toHaveLength(1);
      expect(split.seen).toHaveLength(1 + others);
      expect(r.issues).toEqual([]);
      expect(validateSite(r.spec).ok).toBe(true);
      expect(r.spec.pages).toEqual(single.spec.pages);
      expect(r.spec.chrome).toEqual(single.spec.chrome);
      expect(r.attempts).toBe(1 + others);
      expect(r.parts).toEqual(["homepage: 1 call(s)", ...golden.pages.filter((p) => p.kind === "standard").map((p) => `${p.id}: 1 call(s)`)]);
      // The homepage is answered (and reported) before any page is asked; the pages are asked side by side.
      const [home, ...pages] = split.seen;
      expect(homepage).toBeGreaterThanOrEqual(home!.done!);
      for (const p of pages) expect(p.at).toBeGreaterThanOrEqual(homepage);
      // Every part sends the same cached system blocks, and every page carries the homepage as written.
      for (const p of split.seen) expect(p.req.system).toEqual(one.seen[0]!.req.system);
      for (const p of pages) expect(textOf(p.req)).toContain(`"page":${JSON.stringify(golden.pages[0]).slice(0, 60)}`);
      // One cost record per call, each priced from config.
      expect(records).toHaveLength(1 + others);
      for (const c of records) {
        expect(c.stage).toBe("content");
        expect(c.costEur).toBeCloseTo(costEur(config, config.models.content.model, USAGE), 10);
      }
    });
  }

  it("retries only the page whose answer fails validation, with the issue's path in that page's own answer", async () => {
    const { input, golden } = await contentInput("fizioterapija-pregib");
    const cenik = golden.pages.find((p) => p.id === "p_cenik")!;
    const long = structuredClone(cenik);
    (long.sections[0]!.props as { title: string }).title = "Cenik ".repeat(20);
    const split = goldenContent(golden, (id, n) => (id === "p_cenik" && n === 1 ? { pages: [long] } : undefined));
    const r = await generateContent(new ModelClient({ config, transport: split.transport, spentToday: async () => 0, onCall: async () => undefined }), { ...input, homepageFirst: true });
    expect(Object.fromEntries(split.asked)).toEqual({ home: 1, p_cenik: 2, p_kontakt: 1 });
    const retry = split.seen.filter((s) => /\(page id p_cenik,/.test(textOf(s.req)))[1]!.req.messages;
    expect(retry).toHaveLength(3);
    expect(retry[2]!.content).toMatch(/- \/pages\/0\/sections\/0\/props\/title: Too big/);
    expect(r.issues).toEqual([]);
    expect(r.parts).toContain("p_cenik: 2 call(s)");
  });

  it("a page that keeps an invented fact leaves the merged spec with its issue, as a one-call answer would", async () => {
    const { input, golden } = await contentInput("fizioterapija-pregib");
    const kontakt = structuredClone(golden.pages.find((p) => p.id === "p_kontakt")!);
    (kontakt.sections[0]!.props as { intro?: string }).intro = "Pokličite nas na 040 123 987, odgovorimo isti dan.";
    const split = goldenContent(golden, (id) => (id === "p_kontakt" ? { pages: [kontakt] } : undefined));
    const r = await generateContent(new ModelClient({ config, transport: split.transport, spentToday: async () => 0, onCall: async () => undefined }), { ...input, homepageFirst: true });
    expect(split.asked.get("p_kontakt")).toBe(1 + config.limits.contentRetries);
    expect(r.issues.join(" ")).toMatch(/\/pages\/2\/sections\/0\/props\/intro: phone/);
    expect(r.parts).toContain(`p_kontakt: ${1 + config.limits.contentRetries} call(s), 1 issue(s) left`);
  });

  it("one call as before for a homepage-only job, a one-page site, or with structured output", async () => {
    for (const [id, scope, structured] of [
      ["fizioterapija-pregib", "home", false],
      ["pekarna-kvas", "full", false],
      ["fizioterapija-pregib", "full", true],
    ] as const) {
      const { input, golden } = await contentInput(id, scope);
      const c = goldenContent(golden, (part) => (scope === "home" && part === "site" ? { chrome: golden.chrome, pages: [{ ...golden.pages[0]!, sections: golden.pages[0]!.sections.slice(0, 1) }] } : undefined));
      await generateContent(new ModelClient({ config, transport: c.transport, spentToday: async () => 0, onCall: async () => undefined }), { ...input, structuredOutput: structured, homepageFirst: true });
      expect([...c.asked.keys()], `${id} ${scope} ${structured}`).toEqual(["site"]);
    }
  });
});

describe("pipeline, homepage first", () => {
  let db: Db;
  let repo: Repo;
  let dir: string;
  let browser: CheckBrowser;
  beforeAll(async () => {
    db = await createDb("pglite://memory");
    await migrate(db);
    repo = new Repo(db);
    dir = await mkdtemp(path.join(tmpdir(), "sb-homepage-first-"));
    browser = await launchCheckBrowser();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    await db?.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("logs the homepage when it is ready, saves one first version after the merge, and logs every part's call", async () => {
    const id = "fizioterapija-pregib";
    const fixture = loadFixture(id);
    const golden = await goldenOf(id);
    const storage = createFsStorage(path.join(dir, "storage"));
    const site = await repo.createSite({ name: id, slug: id, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "full" } });
    const photoIds: string[] = [];
    for (const [i, img] of golden.assets.images.entries()) {
      const data = await sharp({ create: { width: Math.round(img.width / 4), height: Math.round(img.height / 4), channels: 3, background: "#8a9db0" } }).jpeg().toBuffer();
      const key = `sites/${site.id}/uploads/p${i}.jpg`;
      await storage.put(key, data, "image/jpeg");
      photoIds.push((await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: null })).id);
    }
    await db.query("update sites set intake = $2 where id = $1", [site.id, JSON.stringify({ description: fixture.brief.description, scope: "full", photoAssetIds: photoIds })]);

    // Every stage but content from the synthetic answers; content from the golden, part by part.
    const replay = new ReplayTransport(syntheticRecordings(fixture, golden).filter((r) => r.stage !== "content"));
    const content = goldenContent(golden);
    const transport: ModelTransport = { send: (req, stage) => (req.stage === "content" ? content.transport.send(req, stage) : replay.send(req, stage)) };
    const calls: CallRecord[] = [];
    const client = new ModelClient({ config: homepageFirst, transport, spentToday: async () => 0, onCall: async (c) => void calls.push(c) });
    const gen = await generateSite({ config: homepageFirst, repo, storage, client, browser, lighthouse: false }, site.id, null);

    expect(gen.check?.validation).toEqual([]);
    expect(calls.filter((c) => c.stage === "content")).toHaveLength(3);
    expect(gen.homepageMs).toBeGreaterThan(0);
    expect(gen.homepageMs!).toBeLessThan(gen.firstVersionMs);
    const events = (await db.query<{ stage: string; message: string; data: unknown }>("select stage, message, data from site_events where site_id = $1 order by id", [site.id])).rows;
    const messages = events.map((e) => e.message);
    const ready = messages.indexOf("Homepage ready; writing the other pages");
    expect(ready).toBeGreaterThan(-1);
    expect(ready).toBeLessThan(messages.indexOf("First version saved; the editor shows it while checks and critique run"));
    expect(events.find((e) => e.message === "Content written homepage first")!.data).toEqual(["homepage: 1 call(s)", "p_cenik: 1 call(s)", "p_kontakt: 1 call(s)"]);
    // One version from the generation (the merged site), then the critique's if it patched.
    const versions = await db.query<{ source: string }>("select source from spec_versions where site_id = $1 order by version", [site.id]);
    expect(versions.rows.filter((v) => v.source === "generate")).toHaveLength(1);
    expect((await repo.getSpec(site.id))!.spec.pages.filter((p) => p.kind === "standard").map((p) => p.id)).toEqual(["p_cenik", "p_kontakt"]);
  }, 180_000);
});
