// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { loadConfig, type AppConfig } from "@sb/config";
import { ModelClient, ReplayTransport, generateSite, launchCheckBrowser, HOMEPAGE_READY, type CallRecord, type CheckBrowser, type ModelTransport } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { syntheticRecordings } from "../src/synthetic.ts";
import { goldenContent, goldenOf } from "./homepage-first-content.ts";

const config = loadConfig();
// Pinned: homepage-first on, structured output off (the recordings were made so); another PR deletes homepageFirst.
const homepageFirst: AppConfig = { ...config, pipeline: { homepageFirst: true }, structuredOutputForContent: false };

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
    // The versions saved when the homepage is announced: none (the homepage alone is never a version).
    let versionsAtReady: number | undefined;
    const spy = Object.assign(Object.create(repo) as Repo, {
      addEvent: async (e: Parameters<Repo["addEvent"]>[0]) => {
        if (e.message === HOMEPAGE_READY) versionsAtReady = (await repo.listVersions(site.id)).length;
        return repo.addEvent(e);
      },
    });
    const gen = await generateSite({ config: homepageFirst, repo: spy, storage, client, browser, lighthouse: false }, site.id, null);
    expect(versionsAtReady).toBe(0);

    expect(gen.check?.validation).toEqual([]);
    expect(calls.filter((c) => c.stage === "content")).toHaveLength(3);
    expect(gen.homepageMs).toBeGreaterThan(0);
    expect(gen.homepageMs!).toBeLessThan(gen.firstVersionMs);
    const events = (await db.query<{ stage: string; message: string; data: unknown }>("select stage, message, data from site_events where site_id = $1 order by id", [site.id])).rows;
    const messages = events.map((e) => e.message);
    const ready = messages.indexOf(HOMEPAGE_READY);
    expect(ready).toBeGreaterThan(-1);
    // The event carries the homepage the editor shows: the saved site's homepage, its other pages still empty.
    const draft = (events[ready]!.data as { homepage: SiteSpec }).homepage;
    // Version 1: the generation's merged site, before any critique patch.
    const saved = (await repo.getSpec(site.id, 1))!.spec;
    expect(draft.pages[0]).toEqual(saved.pages[0]);
    expect(draft.pages.filter((p) => p.kind === "standard").map((p) => [p.id, p.sections.length])).toEqual([["p_cenik", 0], ["p_kontakt", 0]]);
    expect(ready).toBeLessThan(messages.indexOf("First version saved; the editor shows it while checks and critique run"));
    expect(events.find((e) => e.message === "Content written homepage first")!.data).toEqual(["homepage: 1 call(s)", "p_cenik: 1 call(s)", "p_kontakt: 1 call(s)"]);
    // One version from the generation (the merged site), then the critique's if it patched.
    const versions = await db.query<{ source: string }>("select source from spec_versions where site_id = $1 order by version", [site.id]);
    expect(versions.rows.filter((v) => v.source === "generate")).toHaveLength(1);
    expect((await repo.getSpec(site.id))!.spec.pages.filter((p) => p.kind === "standard").map((p) => p.id)).toEqual(["p_cenik", "p_kontakt"]);
  }, 180_000);
});
