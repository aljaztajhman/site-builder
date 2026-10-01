import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
import { JunkIntakeError, ModelClient, generateSite, type ModelRequest, type ModelResponse } from "../src/index.ts";

/** Junk intake: a description the classifier can't place gets no Sonnet call, not even the photos' alt text. */
// The junk check is off in production config (owner, 2026-10-01); the mechanism is still tested at this value.
const config = { ...loadConfig(), tiers: { ...loadConfig().tiers, junk: { minDescriptionChars: 40, minClassifierConfidence: 0.5 } } };
let db: Db;
let repo: Repo;
let dir: string;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  dir = await mkdtemp(path.join(tmpdir(), "sb-junk-"));
});
afterAll(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

function client(confidence: number, stages: string[]) {
  return new ModelClient({
    config,
    spentToday: async () => 0,
    onCall: async () => undefined,
    transport: {
      async send(req: ModelRequest): Promise<ModelResponse> {
        stages.push(req.stage);
        if (req.stage !== "classify") throw new Error(`unexpected ${req.stage} call`);
        return { text: JSON.stringify({ businessType: "shop", confidence }), stopReason: "end_turn", model: "claude-haiku-4-5-20251001", usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
      },
    },
  });
}

async function siteWithPhoto(slug: string, classification?: { businessType: string; confidence: number }) {
  const storage = createFsStorage(path.join(dir, "storage"));
  const site = await repo.createSite({ name: slug, slug, intake: { description: "asdf qwer zxcv asdf qwer zxcv asdf qwer", photoAssetIds: [], scope: "home" } });
  const data = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#8a6d4b" } }).jpeg().toBuffer();
  const key = `sites/${site.id}/uploads/p.jpg`;
  await storage.put(key, data, "image/jpeg");
  const photo = await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: 64, height: 48, bytes: data.length, original_name: null });
  await db.query("update sites set intake = $2 where id = $1", [site.id, JSON.stringify({ description: "asdf qwer zxcv asdf qwer zxcv asdf qwer", scope: "home", photoAssetIds: [photo.id], ...(classification ? { classification } : {}) })]);
  return { site, storage };
}

describe("junk intake in the pipeline", () => {
  it("stops after the classifier when it can't place the description (no brief, no alt text, no images)", async () => {
    const { site, storage } = await siteWithPhoto("smeti");
    const stages: string[] = [];
    await expect(generateSite({ config, repo, storage, client: client(0.1, stages) }, site.id, null)).rejects.toBeInstanceOf(JunkIntakeError);
    expect(stages).toEqual(["classify"]);
    expect((await repo.getSpec(site.id))).toBeNull();
  });

  it("uses the intake's classification instead of asking again", async () => {
    const { site, storage } = await siteWithPhoto("smeti-2", { businessType: "shop", confidence: 0.2 });
    const stages: string[] = [];
    await expect(generateSite({ config, repo, storage, client: client(0.99, stages) }, site.id, null)).rejects.toBeInstanceOf(JunkIntakeError);
    expect(stages).toEqual([]);
  });
});
