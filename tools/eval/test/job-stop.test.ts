import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { ImageGenerator, ModelClient, ReplayTransport, StandInImageTransport, generateSite, type CallRecord, type ImageTransport, type ModelTransport, type Recording } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { syntheticRecordings } from "../src/synthetic.ts";

/**
 * A generation that fails stops its paid calls: pictures not yet sent don't start, and pictures already
 * sent are booked (we were billed) but not stored for a site that won't use them. No browser: every job
 * here fails before the checks.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const FIXTURE = "pekarna-kvas"; // its template shows pictures, so they start beside the design call
let db: Db;
let repo: Repo;
let dir: string;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  dir = await mkdtemp(path.join(tmpdir(), "sb-jobstop-"));
}, 60_000);
afterAll(async () => {
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

const IDEAS = [
  { subject: "Sourdough loaves cooling on a wooden rack", alt: "Hlebci kruha z drožmi se hladijo na leseni polici" },
  { subject: "Flour-dusted hands shaping dough on a wooden table", alt: "Roke oblikujejo testo na leseni mizi" },
  { subject: "A basket of fresh rolls in morning light", alt: "Košara svežih žemelj v jutranji svetlobi" },
];

async function recordings(): Promise<Recording[]> {
  const golden = migrateSpec(JSON.parse(await readFile(path.join(here, `../golden/${FIXTURE}.json`), "utf8"))) as SiteSpec;
  return syntheticRecordings(loadFixture(FIXTURE), golden).map((r) => {
    if (r.stage !== "brief") return r;
    const body = JSON.parse(r.response.text) as Record<string, unknown>;
    body.imageIdeas = IDEAS;
    return { ...r, response: { ...r.response, text: JSON.stringify(body) } };
  });
}

/** A full-site generation with one photo, so the brief asks for generated pictures beside it. */
async function seed(slug: string) {
  const storage = createFsStorage(path.join(dir, slug));
  const description = loadFixture(FIXTURE).brief.description;
  const site = await repo.createSite({ name: slug, slug, intake: { description, photoAssetIds: [], scope: "full" } });
  const data = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#6b4f33" } }).jpeg().toBuffer();
  const key = `sites/${site.id}/uploads/p.jpg`;
  await storage.put(key, data, "image/jpeg");
  const photo = await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: 320, height: 240, bytes: data.length, original_name: null });
  await db.query("update sites set intake = $2 where id = $1", [site.id, JSON.stringify({ description, scope: "full", photoAssetIds: [photo.id] })]);
  return { site, storage };
}

const later = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("a failed generation stops its pictures", () => {
  it("starts no picture when the job failed before the pictures were due", async () => {
    const { site, storage } = await seed("stop-before-pictures");
    const replay = new ReplayTransport(await recordings());
    // The photos' descriptions fail while the brief is still being written.
    let altFailed!: () => void;
    const gate = new Promise<void>((r) => (altFailed = r));
    const stages: string[] = [];
    const transport: ModelTransport = {
      async send(req, stage) {
        stages.push(req.stage);
        if (req.stage === "altText") {
          void later(50).then(altFailed);
          throw new Error("vision request failed");
        }
        if (req.stage === "brief") await gate;
        return replay.send(req, stage);
      },
    };
    const calls: CallRecord[] = [];
    const onCall = async (r: CallRecord) => void calls.push(r);
    const stand = new StandInImageTransport();
    const images = new ImageGenerator({ config, transport: stand, spentToday: async () => 0, onCall });
    const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall });

    await expect(generateSite({ config, repo, storage, client, images, lighthouse: false }, site.id, null)).rejects.toThrow(/vision request failed/);
    // Before this change the brief went on to start the pictures (and the design call).
    expect(stand.calls).toBe(0);
    expect(calls.filter((c) => c.stage === "imageGen")).toEqual([]);
    expect(stages).not.toContain("design");
    expect(await storage.list(`sites/${site.id}/generated/`)).toEqual([]);
  }, 60_000);

  it("books pictures already sent when the job fails, but doesn't store them, and waits for them before failing", async () => {
    const { site, storage } = await seed("stop-during-pictures");
    const replay = new ReplayTransport(await recordings());
    const wanted = config.imageGen.pipeline.fillUpTo.full - 1;
    let designFailed!: () => void;
    const gate = new Promise<void>((r) => (designFailed = r));
    let allSent!: () => void;
    const pictures = new Promise<void>((r) => (allSent = r));
    const transport: ModelTransport = {
      async send(req, stage) {
        if (req.stage === "design") {
          await pictures;
          void later(50).then(designFailed);
          throw new Error("design request failed");
        }
        return replay.send(req, stage);
      },
    };
    const stand = new StandInImageTransport();
    let sent = 0;
    let delivered = 0;
    // fal is still drawing when the design call fails; it delivers afterwards.
    const slow: ImageTransport = {
      async generate(model, body) {
        if (++sent === wanted) allSent();
        await gate;
        const out = await stand.generate(model, body);
        delivered++;
        return out;
      },
    };
    const calls: CallRecord[] = [];
    const onCall = async (r: CallRecord) => void calls.push(r);
    const images = new ImageGenerator({ config, transport: slow, spentToday: async () => 0, onCall });
    const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall });

    await expect(generateSite({ config, repo, storage, client, images, lighthouse: false }, site.id, null)).rejects.toThrow(/design request failed/);
    expect(sent).toBe(wanted);
    // The job ended only after its pictures came back: nothing of it runs on.
    expect(delivered).toBe(wanted);
    const booked = calls.filter((c) => c.stage === "imageGen");
    expect(booked).toHaveLength(wanted);
    expect(booked.every((c) => c.ok && c.costEur > 0)).toBe(true);
    expect(await storage.list(`sites/${site.id}/generated/`)).toEqual([]);
    expect((await storage.list(`sites/${site.id}/media/`)).filter((k) => k.includes("img_g"))).toEqual([]);
    const events = await db.query<{ message: string }>("select message from site_events where site_id = $1 and stage = 'imageGen'", [site.id]);
    expect(events.rows.map((e) => e.message)).not.toContain("Image ready");
  }, 60_000);
});
