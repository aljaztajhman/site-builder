/**
 * pnpm seed <fixture-id> — adds a fixture's golden spec (no model calls) as a site in the dev database,
 * with its stand-in photos, so the dashboard editor can be used without an API key.
 * Uses the same .env as `pnpm dev`. With PGlite, stop the web server first (single process).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { platformFromEnv } from "@sb/platform";
import { loadFixture } from "./fixtures/load.ts";
import { seedGolden } from "./runner.ts";

const id = process.argv[2];
if (!id) {
  console.error("usage: pnpm seed <fixture-id>");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = loadFixture(id);
const config = loadConfig();
const platform = await platformFromEnv({ queue: false });
const { repo, storage, db } = platform;
const slug = await repo.uniqueSlug(id);
const site = await repo.createSite({ name: fixture.brief.facts.name, slug, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "full" } });
const photoIds: string[] = [];
for (const [i, p] of fixture.photos.entries()) {
  const data = new Uint8Array(await readFile(p.path));
  const key = `sites/${site.id}/uploads/photo${i}.jpg`;
  await storage.put(key, data, "image/jpeg");
  photoIds.push((await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: p.file })).id);
}
await db.query("update sites set intake = jsonb_set(intake, '{photoAssetIds}', $2::jsonb) where id = $1", [site.id, JSON.stringify(photoIds)]);
await seedGolden(fixture, path.join(here, "../golden"), repo, storage, site.id, config, slug);
await repo.setStatus(site.id, "ready");
console.log(`Seeded ${id} as /sites/${site.id}`);
await platform.close();
