import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { checkFacts, clientCorpus, generateSite, launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import { validateSite, type SiteSpec } from "@sb/spec";
import { loadFixture } from "../../../tools/eval/src/fixtures/load.ts";
import { HOME_EDITS, homeRecordings, recordingFile } from "../../../tools/eval/src/home-recordings.ts";
import { startWorker } from "../src/worker.ts";

/**
 * Homepage-scope replays (it-home-replay): with MODEL_REPLAY_DIR set to a fixture's recordings, a homepage job (a
 * free preview) replays the fixture's home/ recordings (`pnpm recordings:home`, built from its golden spec) instead
 * of the full site's calls, and its chat edits replay the homepage's edits.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const recordingsDir = path.join(here, "../../../tools/eval/recordings");
const config = loadConfig();
let platform: Platform;
let dir: string;
let browser: CheckBrowser;
const handlers: { [Q in keyof JobData]?: (data: JobData[Q], jobId: string) => Promise<void> } = {};
const replayBefore = process.env.MODEL_REPLAY_DIR;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-worker-home-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = {
    send: async () => "job",
    work: async (name, handler) => {
      (handlers as Record<string, unknown>)[name] = handler;
    },
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo: new Repo(db), storage: createFsStorage(path.join(dir, "storage")), queue, close: () => db.close() };
  browser = await launchCheckBrowser();
  await startWorker(platform, config, { generateSite: (deps, siteId, jobId) => generateSite({ ...deps, browser, lighthouse: false }, siteId, jobId) });
}, 120_000);

afterAll(async () => {
  if (replayBefore === undefined) delete process.env.MODEL_REPLAY_DIR;
  else process.env.MODEL_REPLAY_DIR = replayBefore;
  await browser?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

/** A site as the intake stores it: the fixture's photos, or none (the landing page's form without uploads). */
async function intake(fixtureId: string, scope: "home" | "full", opts: { description?: string; photos?: boolean } = {}): Promise<string> {
  const fixture = loadFixture(fixtureId);
  const description = opts.description ?? fixture.brief.description;
  const site = await platform.repo.createSite({ name: `${fixtureId}-${scope}`, slug: `${fixtureId}-${scope}-${Date.now()}`, intake: { description, photoAssetIds: [], scope } });
  const ids: string[] = [];
  for (const [i, p] of (opts.photos === false ? [] : fixture.photos).entries()) {
    const key = `sites/${site.id}/uploads/p${i}.jpg`;
    const data = new Uint8Array(await readFile(p.path));
    await platform.storage.put(key, data, "image/jpeg");
    ids.push((await platform.repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: null })).id);
  }
  await platform.db.query("update sites set intake = jsonb_set(intake, '{photoAssetIds}', $2::jsonb) where id = $1", [site.id, JSON.stringify(ids)]);
  return site.id;
}

describe("homepage-scope replays", () => {
  it("the committed home/ recordings are what `pnpm recordings:home` builds from the goldens", async () => {
    for (const id of ["pekarna-kvas", "instalacije-rebernik"]) {
      const built = homeRecordings(loadFixture(id));
      const files = (await readdir(path.join(recordingsDir, id, "home"))).sort();
      expect(files, id).toEqual(built.map(recordingFile));
      for (const r of built) expect(JSON.parse(await readFile(path.join(recordingsDir, id, "home", recordingFile(r)), "utf8")), `${id} ${recordingFile(r)}`).toEqual(r);
    }
  });

  it("a homepage job replays the fixture's homepage recordings to a valid homepage, and its chat edits apply", async () => {
    process.env.MODEL_REPLAY_DIR = path.join(recordingsDir, "pekarna-kvas");
    const id = await intake("pekarna-kvas", "home");
    await handlers.generate!({ siteId: id, scope: "home" }, "home-1");
    expect((await platform.repo.getSite(id))?.status).toBe("ready");
    const spec = (await platform.repo.getSpec(id))!.spec as SiteSpec;
    expect(validateSite(spec).ok).toBe(true);
    expect(checkFacts(spec, await clientCorpus(platform.repo, id))).toEqual([]);
    // The homepage, plus the legal and 404 pages every site has; no other content page.
    expect(spec.pages.filter((p) => p.kind === "home" || p.kind === "standard").map((p) => p.kind)).toEqual(["home"]);
    expect(spec.pages[0]!.kind).toBe("home");
    const errors = await platform.db.query<{ message: string }>("select message from site_events where site_id = $1 and level = 'error'", [id]);
    expect(errors.rows).toEqual([]);

    const replies: string[] = [];
    for (const m of ["Temnejša glava.", "Svetlejša glava."]) {
      const msg = await platform.repo.addChat(id, "user", m);
      await handlers.edit!({ siteId: id, messageId: Number(msg.id) }, `home-edit-${msg.id}`);
      replies.push((await platform.repo.listChat(id)).at(-1)!.content);
    }
    expect(replies).toEqual(HOME_EDITS.slice(0, 2).map((e) => e.reply));
    expect((await platform.repo.getSpec(id))!.spec.chrome.header.tone).toBe("alt");
  }, 240_000);

  it("a free preview typed on the landing page (another description, no photos) still ends ready; publishing waits for the facts", async () => {
    process.env.MODEL_REPLAY_DIR = path.join(recordingsDir, "instalacije-rebernik");
    const description = "Pekarna Kvas v Kamniku, Šutna 30. Kruh z drožmi, rogljički in potica. Odprto vsak dan od 7.00 do 13.00. Naročila na 041 555 906.";
    const id = await intake("instalacije-rebernik", "home", { description, photos: false });
    await handlers.generate!({ siteId: id, scope: "home" }, "home-2");
    expect((await platform.repo.getSite(id))?.status).toBe("ready");
    const spec = (await platform.repo.getSpec(id))!.spec as SiteSpec;
    expect(validateSite(spec).ok).toBe(true);
    expect(spec.pages.filter((p) => p.kind === "home" || p.kind === "standard")).toHaveLength(1);
    const events = await platform.db.query<{ stage: string; message: string }>("select stage, message from site_events where site_id = $1", [id]);
    expect(events.rows.filter((e) => e.stage === "error")).toEqual([]);
    // A replay can't follow the typed text: the fixture's facts are flagged, as with a model that couldn't fix them.
    expect(events.rows.some((e) => e.message === "Spec still has issues after retries")).toBe(true);
  }, 240_000);
});
