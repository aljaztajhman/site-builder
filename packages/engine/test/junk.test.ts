import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
import { JunkIntakeError, ModelClient, generateSite, type ModelRequest, type ModelResponse } from "../src/index.ts";

/**
 * Junk intake: a description the classifier says isn't a business, or can't place, gets no Sonnet call, not even
 * the photos' alt text. Production config refuses on isBusiness alone (minClassifierConfidence 0, from pnpm
 * eval:junk on 2026-10-18); `config` here also tests the confidence minimum at 0.5.
 */
const production = loadConfig();
const config = { ...production, tiers: { ...production.tiers, junk: { minDescriptionChars: 40, minClassifierConfidence: 0.5 } } };
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

function client(confidence: number, stages: string[], isBusiness = true, cfg = config) {
  return new ModelClient({
    config: cfg,
    spentToday: async () => 0,
    onCall: async () => undefined,
    transport: {
      async send(req: ModelRequest): Promise<ModelResponse> {
        stages.push(req.stage);
        if (req.stage !== "classify") throw new Error(`unexpected ${req.stage} call`);
        return { text: JSON.stringify({ isBusiness, businessType: "shop", confidence }), stopReason: "end_turn", model: "claude-haiku-4-5-20251001", usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
      },
    },
  });
}

async function siteWithPhoto(slug: string, classification?: { businessType: string; confidence: number; isBusiness?: boolean }) {
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

  it("with production config, refuses what the classifier says isn't a business, however sure it is of a type", async () => {
    const { site, storage } = await siteWithPhoto("smeti-3");
    const stages: string[] = [];
    const run = generateSite({ config: production, repo, storage, client: client(0.95, stages, false, production) }, site.id, null);
    await expect(run).rejects.toBeInstanceOf(JunkIntakeError);
    await expect(run).rejects.toMatchObject({ isBusiness: false, confidence: 0.95 });
    expect(stages).toEqual(["classify"]);
    expect(await repo.getSpec(site.id)).toBeNull();
  });

  it("with production config, lets a real trade through at the confidence the old minimum couldn't tell from junk", async () => {
    // 2026-10-07: tutoring, driving school and vet scored 0.15, as high as a prompt injection.
    const { site, storage } = await siteWithPhoto("prava-1");
    const stages: string[] = [];
    // The stand-in answers only classify: the brief's call is the first after the junk check, and it fails.
    await expect(generateSite({ config: production, repo, storage, client: client(0.15, stages, true, production) }, site.id, null)).rejects.toThrow("unexpected");
    expect(stages[0]).toBe("classify");
    expect(stages.length).toBeGreaterThan(1);
  });

  it("refuses an intake classification that says it isn't a business, and treats one stored without the field as a business", async () => {
    const no = await siteWithPhoto("smeti-4", { businessType: "shop", confidence: 0.9, isBusiness: false });
    const stages: string[] = [];
    await expect(generateSite({ config: production, repo, storage: no.storage, client: client(0.99, stages, true, production) }, no.site.id, null)).rejects.toBeInstanceOf(JunkIntakeError);
    expect(stages).toEqual([]);
    const old = await siteWithPhoto("prava-2", { businessType: "shop", confidence: 0.9 });
    await expect(generateSite({ config: production, repo, storage: old.storage, client: client(0.99, stages, true, production) }, old.site.id, null)).rejects.toThrow("unexpected");
    expect(stages.length).toBeGreaterThan(0);
    expect(stages).not.toContain("classify");
  });
});
