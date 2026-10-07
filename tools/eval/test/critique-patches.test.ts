import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { ImageGenerator, ModelClient, ReplayTransport, StandInImageTransport, critiqueView, extractJson, generateSite, launchCheckBrowser, loadRecordings, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Db } from "@sb/platform";
import { loadFixtures } from "../src/fixtures/load.ts";
import type { Fixture } from "../src/fixtures/schema.ts";

/**
 * The critique reads only the homepage, chrome and business (critiqueView, it-eval-cost-cuts), but its patches
 * still address the full spec: every critique patch in the recorded runs still applies when the run is replayed,
 * and the homepage is page 0 in the spec the critique patched, as in what it read.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const recordingsDir = path.join(here, "../recordings");
let db: Db;
let repo: Repo;
let dir: string;
let browser: CheckBrowser;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  dir = await mkdtemp(path.join(tmpdir(), "sb-critique-patches-"));
  browser = await launchCheckBrowser();
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

const patchesOf = (text: string): unknown[] => (JSON.parse(extractJson(text)) as { patches: unknown[] }).patches;
/** Fixtures whose recorded run has a critique answer with patches, and how many such answers. */
const withPatches = loadFixtures()
  .map((f) => ({ fixture: f, rounds: loadRecordings(path.join(recordingsDir, f.id)).filter((r) => r.stage === "critique" && patchesOf(r.response.text).length > 0).length }))
  .filter((x) => x.rounds > 0);

async function seed(fixture: Fixture) {
  const storage = createFsStorage(path.join(dir, fixture.id));
  const site = await repo.createSite({ name: fixture.id, slug: fixture.id, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "full" } });
  const photoAssetIds: string[] = [];
  for (const [i, p] of fixture.photos.entries()) {
    const data = new Uint8Array(await readFile(p.path));
    const key = `sites/${site.id}/uploads/photo${i}.jpg`;
    await storage.put(key, data, "image/jpeg");
    photoAssetIds.push((await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: p.file })).id);
  }
  let logoAssetId: string | undefined;
  if (fixture.logoPath) {
    const data = new Uint8Array(await readFile(fixture.logoPath));
    const key = `sites/${site.id}/uploads/logo.svg`;
    await storage.put(key, data, "image/svg+xml");
    logoAssetId = (await repo.addAsset({ site_id: site.id, kind: "logo", storage_key: key, mime: "image/svg+xml", width: null, height: null, bytes: data.length, original_name: "logo.svg" })).id;
  }
  await db.query("update sites set intake = $2 where id = $1", [site.id, JSON.stringify({ description: fixture.brief.description, scope: "full", photoAssetIds, ...(logoAssetId ? { logoAssetId } : {}) })]);
  return { storage, site };
}

describe("recorded critique patches", () => {
  it("are recorded for some fixtures (the check below has something to replay)", () => {
    expect(withPatches.length).toBeGreaterThan(0);
  });

  for (const { fixture, rounds } of withPatches) {
    it(`${fixture.id}: every round's patches apply to the full spec, the homepage stays page 0`, async () => {
      const { storage, site } = await seed(fixture);
      const client = new ModelClient({ config, transport: new ReplayTransport(path.join(recordingsDir, fixture.id)), spentToday: async () => 0, onCall: async () => undefined });
      // Generated pictures as `pnpm eval --replay` makes them: flat stand-ins under the recorded ids.
      const images = new ImageGenerator({ config, transport: new StandInImageTransport(), spentToday: async () => 0, onCall: async () => undefined });
      await generateSite({ config, repo, storage, client, browser, lighthouse: false, images }, site.id, null);
      const events = await db.query<{ message: string }>("select message from site_events where site_id = $1 and stage = 'critique'", [site.id]);
      expect(events.rows.map((e) => e.message).filter((m) => /rejected|unusable|failed|changed during/i.test(m))).toEqual([]);
      const versions = await db.query<{ version: number; source: string; spec: { pages: { kind: string }[] } }>("select version, source, spec from spec_versions where site_id = $1 order by version", [site.id]);
      expect(versions.rows.filter((v) => v.source === "critique")).toHaveLength(rounds);
      for (const v of versions.rows) {
        expect(v.spec.pages[0]!.kind).toBe("home");
        expect(critiqueView(v.spec as never).pages.findIndex((p) => p.kind === "home")).toBe(0);
      }
    }, 180_000);
  }
});
