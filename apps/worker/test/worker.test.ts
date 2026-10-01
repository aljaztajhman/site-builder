import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { startWorker } from "../src/worker.ts";

/**
 * The worker's job handlers against a real (in-memory) database. The model is a replay transport with no
 * recordings, so every edit call fails the way a lost connection or an empty account would.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let platform: Platform;
let dir: string;
const handlers: { [Q in keyof JobData]?: (data: JobData[Q], jobId: string) => Promise<void> } = {};
const replayBefore = process.env.MODEL_REPLAY_DIR;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-worker-"));
  process.env.MODEL_REPLAY_DIR = dir; // empty: no recordings
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
  await startWorker(platform, config);
}, 60_000);

afterAll(async () => {
  if (replayBefore === undefined) delete process.env.MODEL_REPLAY_DIR;
  else process.env.MODEL_REPLAY_DIR = replayBefore;
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

async function site(slug: string, status: "ready" | "generating"): Promise<string> {
  const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "home" } });
  await platform.repo.saveSpec(s.id, spec, "generate");
  await platform.repo.setStatus(s.id, status);
  return s.id;
}

async function failedEdit(siteId: string) {
  const msg = await platform.repo.addChat(siteId, "user", "Dodaj pogosta vprašanja o parkiranju");
  await handlers.edit!({ siteId, messageId: Number(msg.id) }, "job-edit");
  return { status: (await platform.repo.getSite(siteId))?.status, reply: (await platform.repo.listChat(siteId)).at(-1)! };
}

describe("edit job that fails", () => {
  it("leaves a running generation's status alone", async () => {
    const id = await site("urejanje-med-ustvarjanjem", "generating");
    const r = await failedEdit(id);
    expect(r.status).toBe("generating");
  });

  it("puts an idle site back to ready and answers the owner in Slovene, without the technical error", async () => {
    const id = await site("urejanje-napaka", "ready");
    const r = await failedEdit(id);
    expect(r.status).toBe("ready");
    expect(r.reply.role).toBe("assistant");
    expect(r.reply.content).toMatch(/^Sprememba ni uspela/);
    expect(r.reply.content).not.toMatch(/recording|Error|Napaka:/);
  });

  it("says so when today's spend cap stops the edit", async () => {
    const id = await site("urejanje-omejitev", "ready");
    await platform.repo.logModelCall({ siteId: id, jobId: null, stage: "edit", model: "test", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: config.limits.dailyModelSpendCapEur + 1, durationMs: 0, ok: true });
    const r = await failedEdit(id);
    expect(r.reply.content).toMatch(/omejitev porabe/);
    expect(r.status).toBe("ready");
  });
});
