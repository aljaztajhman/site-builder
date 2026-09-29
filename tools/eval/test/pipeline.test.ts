import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { ModelClient, ReplayTransport, applyChatEdit, generateSite, launchCheckBrowser, loadRecordings, type CallRecord, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { syntheticRecordings } from "../src/synthetic.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let db: Db;
let repo: Repo;
let dir: string;
let browser: CheckBrowser;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  dir = await mkdtemp(path.join(tmpdir(), "sb-pipeline-"));
  browser = await launchCheckBrowser();
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

/** A pekarna-kvas site with small generated stand-in photos (no dependency on `pnpm fixtures:photos`) and the fixture logo. */
async function seedSite(slug: string) {
  const fixture = loadFixture("pekarna-kvas");
  const golden = JSON.parse(await readFile(path.join(here, "../golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  const storage = createFsStorage(path.join(dir, "storage"));
  const site = await repo.createSite({ name: slug, slug, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "full" } });

  // Small generated stand-ins so the test doesn't depend on `pnpm fixtures:photos`.
  const photoIds: string[] = [];
  for (const [i, img] of golden.assets.images.entries()) {
    const data = await sharp({ create: { width: img.width / 4, height: img.height / 4, channels: 3, background: ["#8a6d4b", "#c9a57a", "#6b4f33"][i]! } }).jpeg().toBuffer();
    const key = `sites/${site.id}/uploads/p${i}.jpg`;
    await storage.put(key, data, "image/jpeg");
    photoIds.push((await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: null })).id);
  }
  const logo = await readFile(fixture.logoPath!);
  await storage.put(`sites/${site.id}/uploads/logo.svg`, logo, "image/svg+xml");
  const logoId = (await repo.addAsset({ site_id: site.id, kind: "logo", storage_key: `sites/${site.id}/uploads/logo.svg`, mime: "image/svg+xml", width: null, height: null, bytes: logo.length, original_name: null })).id;
  await db.query("update sites set intake = $2 where id = $1", [site.id, JSON.stringify({ description: fixture.brief.description, scope: "full", photoAssetIds: photoIds, logoAssetId: logoId })]);

  return { fixture, golden, storage, site };
}

describe("pipeline with replayed model responses (no network)", () => {
  it("generates, checks, critiques and applies a chat edit for pekarna-kvas", async () => {
    const { fixture, golden, storage, site } = await seedSite("pekarna-kvas");

    const recordings = syntheticRecordings(fixture, golden, [
      { reply: "Glava je zdaj temna.", patches: [{ op: "add", path: "/chrome/header/tone", value: "inverse" }] },
    ]);
    const calls: CallRecord[] = [];
    const client = new ModelClient({ config, transport: new ReplayTransport(recordings), spentToday: async () => 0, onCall: async (r) => void calls.push(r) });

    const gen = await generateSite({ config, repo, storage, client, browser, lighthouse: false }, site.id, null);
    expect(gen.check?.validation).toEqual([]);
    expect(gen.check?.facts).toEqual([]);
    expect(gen.check?.pages.flatMap((p) => p.axe)).toEqual([]);
    expect(gen.check?.pages.every((p) => !p.mobile.horizontalScroll)).toBe(true);
    expect(gen.critiqueRounds).toBe(1);
    expect(calls.map((c) => c.stage)).toEqual(["classify", "brief", "design", "altText", "content", "critique"]);

    const spec = (await repo.getSpec(site.id))!.spec;
    expect(spec.design.direction).toBe("warm-craft");
    expect(spec.business.phone).toBe("+38641555906");
    expect(spec.assets.images.map((i) => i.alt)).toEqual(golden.assets.images.map((i) => i.alt));
    expect(await storage.list(`sites/${site.id}/media/`)).toEqual(expect.arrayContaining([`sites/${site.id}/media/img_01-360.avif`, `sites/${site.id}/media/logo.png`]));

    const msg = await repo.addChat(site.id, "user", "Temnejša glava prosim.");
    const edit = await applyChatEdit({ repo, client }, site.id, Number(msg.id));
    expect(edit.issues).toEqual([]);
    expect((await repo.getSpec(site.id))!.spec.chrome.header.tone).toBe("inverse");
    expect((await repo.listChat(site.id)).at(-1)?.content).toBe("Glava je zdaj temna.");
    expect(calls.map((c) => c.stage)).toEqual(["classify", "brief", "design", "altText", "content", "critique", "edit"]);
  }, 180_000);

  it("replays the recorded pekarna-kvas run (real API responses): generation, then every scripted edit", async () => {
    const { fixture, storage, site } = await seedSite("pekarna-kvas-rec");
    const transport = new ReplayTransport(loadRecordings(path.join(here, "../recordings/pekarna-kvas")));
    const calls: CallRecord[] = [];
    const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall: async (r) => void calls.push(r) });

    const gen = await generateSite({ config, repo, storage, client, browser, lighthouse: false }, site.id, null);
    expect(gen.check?.validation).toEqual([]);
    expect(calls.map((c) => c.stage)).toEqual(["classify", "brief", "design", "altText", "content", "content", "critique", "critique"]);

    for (const edit of fixture.edits) {
      const msg = await repo.addChat(site.id, "user", edit.message);
      await applyChatEdit({ repo, client }, site.id, Number(msg.id));
    }
    expect(transport.remaining).toBe(0);
  }, 180_000);

  it("rejects an edit that invents a phone number and keeps the spec", async () => {
    const fixture = loadFixture("pekarna-kvas");
    const golden = JSON.parse(await readFile(path.join(here, "../golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
    const site = await repo.createSite({ name: "x", slug: "pekarna-kvas-2", intake: { description: fixture.brief.description, photoAssetIds: [], scope: "full" } });
    await repo.saveSpec(site.id, { ...golden, slug: "pekarna-kvas-2" }, "manual");
    const bad = { reply: "ok", patches: [{ op: "replace", path: "/business/phone", value: "+38641999999" }] };
    const client = new ModelClient({ config, transport: new ReplayTransport(syntheticRecordings(fixture, golden, [bad, bad]).filter((r) => r.stage === "edit")), spentToday: async () => 0, onCall: async () => undefined });
    const msg = await repo.addChat(site.id, "user", "Spremeni barvo gumbov.");
    const r = await applyChatEdit({ repo, client }, site.id, Number(msg.id));
    expect(r.version).toBeNull();
    expect(r.issues.join(" ")).toMatch(/phone/);
    expect((await repo.getSpec(site.id))!.version).toBe(1);
  });
});

describe("content stage", () => {
  it("falls back to plain JSON when the API rejects the content schema", async () => {
    const { generateContent, Brief } = await import("@sb/engine");
    const fixture = loadFixture("pekarna-kvas");
    const golden = JSON.parse(await readFile(path.join(here, "../golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
    const recs = syntheticRecordings(fixture, golden);
    const brief = Brief.parse(JSON.parse(recs.find((r) => r.stage === "brief")!.response.text));
    const content = recs.find((r) => r.stage === "content")!.response;
    const seen: boolean[] = [];
    const client = new ModelClient({
      config,
      spentToday: async () => 0,
      onCall: async () => undefined,
      transport: {
        async send(req) {
          seen.push(!!req.schema);
          if (req.schema) throw Object.assign(new Error("output_config.format.schema: schema is too complex"), { status: 400 });
          return content;
        },
      },
    });
    const r = await generateContent(client, {
      slug: "pekarna-kvas",
      brief,
      design: golden.design,
      assets: golden.assets,
      scope: "full",
      heroImageIds: [],
      structuredOutput: true,
      retries: 2,
      corpus: fixture.brief.description,
    });
    expect(seen).toEqual([true, false]);
    expect(r.structuredFallback).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.attempts).toBe(1);
  });
});
