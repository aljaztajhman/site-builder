// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { STUDIO_COMPOSED, STUDIO_FELL_BACK, generateSite, launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import { validateSite, type SiteSpec } from "@sb/spec";
import { loadFixture } from "../../../tools/eval/src/fixtures/load.ts";
import { startWorker, studioForJob } from "../src/worker.ts";

/**
 * Design studio 0.5 (docs/plans/studio-0.5.md) in the worker: config designer.agent "trial" sends only the accounts in
 * DESIGNER_TRIAL_EMAILS through the studio. A trial account's homepage job (replayed: the fixture's home recordings plus
 * the recorded director answer) saves the composed homepage and skips the critique; anyone else's job is today's; a bad
 * director answer keeps today's homepage.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const recordings = path.join(here, "../../../tools/eval/recordings");
const config: AppConfig = { ...loadConfig(), designer: { ...loadConfig().designer, agent: "trial" } };
const OWNER = "lastnik@postavi.example";
let platform: Platform;
let dir: string;
let browser: CheckBrowser;
const handlers: { [Q in keyof JobData]?: (data: JobData[Q], jobId: string) => Promise<void> } = {};
const before = { replay: process.env.MODEL_REPLAY_DIR, trial: process.env.DESIGNER_TRIAL_EMAILS };

/** A replay folder: the fixture's homepage recordings and one director answer. */
async function replayDir(name: string, director: string | { text: string }): Promise<string> {
  const root = path.join(dir, name);
  await mkdir(path.join(root, "home"), { recursive: true });
  await cp(path.join(recordings, "pekarna-kvas/home"), path.join(root, "home"), { recursive: true });
  const rec =
    typeof director === "string"
      ? await readFile(director, "utf8")
      : JSON.stringify({ seq: 99, stage: "director", model: "claude-opus-5-5", hash: "synthetic", origin: "synthetic", response: { text: director.text, stopReason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 9000, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
  await writeFile(path.join(root, "home", "099-director.json"), rec);
  return root;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-worker-studio-"));
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
  for (const [k, v] of [["MODEL_REPLAY_DIR", before.replay], ["DESIGNER_TRIAL_EMAILS", before.trial]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await browser?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

let n = 0;
/** A homepage site of the bakery fixture with its photos, owned by an account with this email. */
async function site(email: string): Promise<string> {
  const fixture = loadFixture("pekarna-kvas");
  const account = await platform.repo.accounts.signIn(email, email);
  const s = await platform.repo.createSite({ name: `studio-${++n}`, slug: `studio-${n}-${Date.now()}`, intake: { description: fixture.brief.description, photoAssetIds: [], scope: "home" }, accountId: account.id });
  const ids: string[] = [];
  for (const [i, p] of fixture.photos.entries()) {
    const key = `sites/${s.id}/uploads/p${i}.jpg`;
    const data = new Uint8Array(await readFile(p.path));
    await platform.storage.put(key, data, "image/jpeg");
    ids.push((await platform.repo.addAsset({ site_id: s.id, kind: "photo", storage_key: key, mime: "image/jpeg", width: null, height: null, bytes: data.length, original_name: null })).id);
  }
  await platform.db.query("update sites set intake = jsonb_set(intake, '{photoAssetIds}', $2::jsonb) where id = $1", [s.id, JSON.stringify(ids)]);
  return s.id;
}

const events = async (id: string) => (await platform.db.query<{ stage: string; message: string; level: string; data: unknown }>("select stage, message, level, data from site_events where site_id = $1 order by id", [id])).rows;

describe("the studio switch in the worker", () => {
  it("off: no one; trial: only a listed account; on: everyone", async () => {
    const a = await platform.repo.accounts.signIn(OWNER, OWNER);
    const ctx = { siteId: null, jobId: null, tier: "free" as const, accountId: a.id };
    const off = { ...config, designer: { ...config.designer, agent: "off" as const } };
    const on = { ...config, designer: { ...config.designer, agent: "on" as const } };
    expect(await studioForJob(platform, off, ctx, OWNER)).toBe(false);
    expect(await studioForJob(platform, config, ctx, `other@example.com, ${OWNER.toUpperCase()}`)).toBe(true);
    expect(await studioForJob(platform, config, ctx, "other@example.com")).toBe(false);
    expect(await studioForJob(platform, config, ctx, undefined)).toBe(false);
    // The admin's password session and guests have no account.
    expect(await studioForJob(platform, config, { ...ctx, accountId: null }, OWNER)).toBe(false);
    expect(await studioForJob(platform, on, { ...ctx, accountId: null }, undefined)).toBe(true);
  });

  it("trial: the admin password session's sites only with DESIGNER_TRIAL_ADMIN=1; guests never", async () => {
    const admin = { siteId: null, jobId: null, tier: "admin" as const, accountId: null };
    const guest = { ...admin, tier: "anonymous" as const };
    expect(await studioForJob(platform, config, admin, undefined, "1")).toBe(true);
    expect(await studioForJob(platform, config, admin, undefined, undefined)).toBe(false);
    expect(await studioForJob(platform, config, admin, undefined, "0")).toBe(false);
    expect(await studioForJob(platform, config, guest, undefined, "1")).toBe(false);
    const off = { ...config, designer: { ...config.designer, agent: "off" as const } };
    expect(await studioForJob(platform, off, admin, undefined, "1")).toBe(false);
  });
});

describe("a homepage job with the studio", () => {
  it("a trial account gets the composed homepage, saved and valid, without the critique", async () => {
    process.env.MODEL_REPLAY_DIR = await replayDir("composed", path.join(recordings, "../recordings-studio/pekarna-kvas/000-director.json"));
    process.env.DESIGNER_TRIAL_EMAILS = OWNER;
    const id = await site(OWNER);
    await handlers.generate!({ siteId: id, scope: "home" }, "studio-1");
    expect((await platform.repo.getSite(id))?.status).toBe("ready");
    const spec = (await platform.repo.getSpec(id))!.spec as SiteSpec;
    expect(validateSite(spec).ok).toBe(true);
    expect(spec.pages.find((p) => p.kind === "home")!.sections[0]!.type).toBe("composed");
    const log = await events(id);
    const composed = log.find((e) => e.message === STUDIO_COMPOSED);
    expect((composed?.data as { idea?: string })?.idea).toMatch(/woodcut/i);
    expect(log.some((e) => e.stage === "critique" && /^Round/.test(e.message))).toBe(false);
    expect(log.filter((e) => e.level === "error")).toEqual([]);
    const calls = await platform.db.query<{ stage: string }>("select stage from model_calls where site_id = $1", [id]);
    expect(calls.rows.filter((c) => c.stage === "director")).toHaveLength(1);
  }, 240_000);

  it("an account that isn't listed gets today's homepage, no director call", async () => {
    process.env.MODEL_REPLAY_DIR = await replayDir("not-listed", path.join(recordings, "../recordings-studio/pekarna-kvas/000-director.json"));
    process.env.DESIGNER_TRIAL_EMAILS = OWNER;
    const id = await site("drug@postavi.example");
    await handlers.generate!({ siteId: id, scope: "home" }, "studio-2");
    const spec = (await platform.repo.getSpec(id))!.spec as SiteSpec;
    expect(spec.pages.find((p) => p.kind === "home")!.sections.some((s) => s.type === "composed")).toBe(false);
    expect((await events(id)).some((e) => e.stage === "studio")).toBe(false);
  }, 240_000);

  it("a bad director answer keeps today's homepage, logs why, and the critique runs as today", async () => {
    process.env.MODEL_REPLAY_DIR = await replayDir("bad", { text: "{\"idea\": \"cut off" });
    process.env.DESIGNER_TRIAL_EMAILS = OWNER;
    const id = await site(OWNER);
    await handlers.generate!({ siteId: id, scope: "home" }, "studio-3");
    expect((await platform.repo.getSite(id))?.status).toBe("ready");
    const spec = (await platform.repo.getSpec(id))!.spec as SiteSpec;
    expect(validateSite(spec).ok).toBe(true);
    expect(spec.pages.find((p) => p.kind === "home")!.sections.some((s) => s.type === "composed")).toBe(false);
    const log = await events(id);
    expect(log.some((e) => e.message === STUDIO_FELL_BACK)).toBe(true);
    expect(log.some((e) => e.stage === "critique" && /^Round/.test(e.message))).toBe(true);
  }, 240_000);
});
