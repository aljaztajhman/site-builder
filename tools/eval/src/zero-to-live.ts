/**
 * pnpm zero-to-live [--only <id>[,<id>]]
 *
 * Replays each fixture's recorded generation (tools/eval/recordings, no network, no cost) and writes what stands
 * between the generated site and publishing: the pre-publish checklist, grouped into the facts the owner has to
 * give us (we never invent them) and everything else. The replayed specs land in tools/eval/zero-to-live/specs/
 * (the browser test in apps/web/test/zero-to-live-browser.test.ts opens them), the summary in
 * tools/eval/zero-to-live/blockers.json. Pictures are flat stand-ins, as in `pnpm eval --replay`.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { ImageGenerator, ModelClient, ReplayTransport, StandInImageTransport, generateSite, launchCheckBrowser, siteChecklist } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate } from "@sb/platform";
import { missingFacts, type PublishBlocker } from "@sb/spec";
import { loadFixtures } from "./fixtures/load.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = path.join(root, "tools/eval/zero-to-live");
const args = process.argv.slice(2);
const onlyArg = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const only = onlyArg ? new Set(onlyArg.split(",")) : null;

export interface FixtureBlockers {
  id: string;
  /** Everything on the pre-publish checklist right after generation. */
  checklist: PublishBlocker[];
  /** The facts the "Še to potrebujemo" screen asks for (missingFacts). */
  asked: { path: string; kind: string }[];
  /** Checklist entries the screen doesn't cover. */
  other: PublishBlocker[];
}

const config = loadConfig();
const browser = await launchCheckBrowser();
const work = await mkdtemp(path.join(tmpdir(), "sb-zero-to-live-"));
const results: FixtureBlockers[] = [];
await mkdir(path.join(outDir, "specs"), { recursive: true });
try {
  for (const fixture of loadFixtures().filter((f) => !only || only.has(f.id))) {
    const t0 = Date.now();
    const db = await createDb("pglite://memory");
    await migrate(db);
    const repo = new Repo(db);
    const storage = createFsStorage(path.join(work, fixture.id));
    const site = await repo.createSite({ name: fixture.id, slug: fixture.id, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "full" } });
    const photoIds: string[] = [];
    for (const [i, p] of fixture.photos.entries()) {
      const data = new Uint8Array(await readFile(p.path));
      const key = `sites/${site.id}/uploads/photo${i}.jpg`;
      await storage.put(key, data, "image/jpeg");
      photoIds.push((await repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: p.file })).id);
    }
    let logoAssetId: string | undefined;
    if (fixture.logoPath) {
      const data = new Uint8Array(await readFile(fixture.logoPath));
      const key = `sites/${site.id}/uploads/logo.svg`;
      await storage.put(key, data, "image/svg+xml");
      logoAssetId = (await repo.addAsset({ site_id: site.id, kind: "logo", storage_key: key, mime: "image/svg+xml", width: null, height: null, bytes: data.length, original_name: "logo.svg" })).id;
    }
    await db.query("update sites set intake = $2 where id = $1", [
      site.id,
      JSON.stringify({ description: fixture.brief.description, scope: "full", photoAssetIds: photoIds, ...(logoAssetId ? { logoAssetId } : {}) }),
    ]);
    const client = new ModelClient({ config, transport: new ReplayTransport(path.join(root, "tools/eval/recordings", fixture.id)), spentToday: async () => 0, onCall: async () => undefined });
    const images = new ImageGenerator({ config, transport: new StandInImageTransport(), spentToday: async () => 0, onCall: async () => undefined });
    await generateSite({ config, repo, storage, client, browser, lighthouse: false, images }, site.id, null);
    const spec = (await repo.getSpec(site.id))!.spec;
    const checklist = await siteChecklist(repo, site.id, spec);
    const asked = missingFacts(checklist).map((f) => ({ path: f.path, kind: f.kind }));
    const covered = new Set(asked.map((a) => a.path));
    const other = checklist.filter((b) => !covered.has(b.path));
    results.push({ id: fixture.id, checklist, asked, other });
    await writeFile(path.join(outDir, "specs", `${fixture.id}.json`), JSON.stringify(spec, null, 1) + "\n");
    console.log(`${fixture.id}: ${checklist.length} on the checklist, ${asked.length} asked on one screen, ${other.length} other (${Math.round((Date.now() - t0) / 1000)} s)`);
    await db.close();
  }
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
}

// Merge with an earlier run's entries for fixtures not replayed now (--only).
const file = path.join(outDir, "blockers.json");
const earlier = (await readFile(file, "utf8").then((t) => JSON.parse(t) as FixtureBlockers[]).catch(() => [])).filter((e) => !results.some((r) => r.id === e.id));
await writeFile(file, JSON.stringify([...earlier, ...results].sort((a, b) => a.id.localeCompare(b.id)), null, 1) + "\n");
console.log(`Wrote ${path.relative(root, file)}`);
