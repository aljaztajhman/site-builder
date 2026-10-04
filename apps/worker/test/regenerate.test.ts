import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { OWNER_TEXT_NOTE, applyDirectEdit, generateSite, launchCheckBrowser, typedOps, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import { markOwnerEdits, migrateSpec, type SiteSpec } from "@sb/spec";
import { loadFixture } from "../../../tools/eval/src/fixtures/load.ts";
import { syntheticRecordings } from "../../../tools/eval/src/synthetic.ts";
import { startWorker } from "../src/worker.ts";

/**
 * The worker's generate and edit jobs replaying recorded answers (MODEL_REPLAY_DIR, no model calls; synthetic answers
 * built from the bakery's golden spec): "Ustvari znova" keeps the text the owner typed in the editor
 * (it-keep-owner-edits), and in replay mode each chat message gets its own recorded edit (it-worker-replay).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const EDITS = [
  { reply: "Prvi odgovor.", patches: [{ op: "add", path: "/chrome/header/tone", value: "inverse" }] },
  { reply: "Drugi odgovor.", patches: [{ op: "replace", path: "/chrome/header/tone", value: "alt" }] },
  { reply: "Tretji odgovor.", patches: [{ op: "replace", path: "/chrome/header/tone", value: "default" }] },
];
let platform: Platform;
let dir: string;
let browser: CheckBrowser;
const handlers: { [Q in keyof JobData]?: (data: JobData[Q], jobId: string) => Promise<void> } = {};
const replayBefore = process.env.MODEL_REPLAY_DIR;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-worker-regen-"));
  const golden = migrateSpec(JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8"))) as SiteSpec;
  const recordings = syntheticRecordings(loadFixture("pekarna-kvas"), golden, EDITS);
  for (const r of recordings) await writeFile(path.join(dir, `${String(r.seq).padStart(3, "0")}-${r.stage}.json`), JSON.stringify(r));
  process.env.MODEL_REPLAY_DIR = dir;
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
  // The worker's own generate job, with the test's browser and without Lighthouse.
  await startWorker(platform, config, { generateSite: (deps, siteId, jobId) => generateSite({ ...deps, browser, lighthouse: false }, siteId, jobId) });
}, 120_000);

afterAll(async () => {
  if (replayBefore === undefined) delete process.env.MODEL_REPLAY_DIR;
  else process.env.MODEL_REPLAY_DIR = replayBefore;
  await browser?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

/** The bakery with its fixture photos, as the intake stores it. */
async function bakery(slug: string): Promise<string> {
  const fixture = loadFixture("pekarna-kvas");
  const site = await platform.repo.createSite({ name: slug, slug, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "full" } });
  const ids: string[] = [];
  for (const [i, p] of fixture.photos.entries()) {
    const key = `sites/${site.id}/uploads/p${i}.jpg`;
    const data = new Uint8Array(await readFile(p.path));
    await platform.storage.put(key, data, "image/jpeg");
    ids.push((await platform.repo.addAsset({ site_id: site.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: null })).id);
  }
  await platform.db.query("update sites set intake = jsonb_set(intake, '{photoAssetIds}', $2::jsonb) where id = $1", [site.id, JSON.stringify(ids)]);
  return site.id;
}

/** A direct edit as the web app's /patch saves it: what the owner typed is stored and marked. */
async function ownerTypes(siteId: string, ops: { op: "replace"; path: string; value: unknown }[]): Promise<void> {
  const current = (await platform.repo.getSpec(siteId))!;
  const r = applyDirectEdit(current.spec, ops);
  expect(r.issues).toEqual([]);
  const own = typedOps(current.spec, ops);
  const spec = { ...r.spec, ownerEdits: markOwnerEdits(r.spec, own) };
  await platform.repo.saveSpec(siteId, spec, "manual", "urejanje", own, current.version);
}

const hero = (s: SiteSpec) => s.pages[0]!.sections[0]!.props as { headline: string };

describe("Ustvari znova in the worker", () => {
  it("keeps the headline the owner typed, marks it on the new version, and says so in the site's log", async () => {
    const id = await bakery("regen-text");
    await handlers.generate!({ siteId: id, scope: "full" }, "job-1");
    const first = (await platform.repo.getSpec(id))!.spec;
    expect(hero(first).headline).not.toBe("Naš kruh vzhaja čez noč");
    await ownerTypes(id, [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Naš kruh vzhaja čez noč" }]);
    expect((await platform.repo.getSpec(id))!.spec.ownerEdits).toEqual([{ section: first.pages[0]!.sections[0]!.id, path: "/props/headline" }]);

    await handlers.generate!({ siteId: id, scope: "full" }, "job-2");
    const after = (await platform.repo.getSpec(id))!;
    expect((await platform.repo.getSite(id))?.status).toBe("ready");
    expect(hero(after.spec).headline).toBe("Naš kruh vzhaja čez noč");
    expect(after.spec.ownerEdits).toEqual([{ section: after.spec.pages[0]!.sections[0]!.id, path: "/props/headline" }]);
    const events = await platform.db.query<{ message: string; data: unknown }>("select message, data from site_events where site_id = $1", [id]);
    expect(events.rows.find((e) => e.message === OWNER_TEXT_NOTE)?.data).toEqual({ kept: ["/pages/0/sections/0/props/headline"], dropped: [] });
  }, 240_000);

  it("in replay mode answers each chat message with its own recorded edit, from the first again after the last", async () => {
    const id = await bakery("replay-edits");
    await handlers.generate!({ siteId: id, scope: "full" }, "job-3");
    const replies: string[] = [];
    for (const m of ["Temnejša glava.", "Svetlejša glava.", "Glava kot stran.", "Še enkrat temna."]) {
      const msg = await platform.repo.addChat(id, "user", m);
      await handlers.edit!({ siteId: id, messageId: Number(msg.id) }, `edit-${msg.id}`);
      replies.push((await platform.repo.listChat(id)).at(-1)!.content);
    }
    expect(replies).toEqual(["Prvi odgovor.", "Drugi odgovor.", "Tretji odgovor.", "Prvi odgovor."]);
    expect((await platform.repo.getSpec(id))!.spec.chrome.header.tone).toBe("inverse");
  }, 240_000);
});
