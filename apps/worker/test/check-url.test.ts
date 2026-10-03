import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { UrlRefusedError, type UrlCheckResult } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import { CHECK_FAILED_MESSAGE, startWorker } from "../src/worker.ts";

/** The website checker's job: the report saved, a refused address worded for the visitor, our own failures hidden. */
const config = loadConfig();
let platform: Platform;
let dir: string;
let handler: (data: JobData["check-url"], jobId: string) => Promise<void>;
const outcomes = new Map<string, () => Promise<UrlCheckResult>>();
const ran: string[] = [];

const report = (url: string): UrlCheckResult => ({
  url,
  finalUrl: url,
  https: true,
  checkedAt: "2026-10-03T10:00:00Z",
  phone: { width: 360, viewportMeta: true, horizontalScroll: false, tinyTargets: 0, smallPrimaryTargets: 0, smallText: 0, hasCallLink: true, callInViewport: true },
  speed: null,
  cookiesBeforeConsent: [],
  company: { companyForm: true, address: true, email: true, registration: true, taxNumber: true },
  lang: "sl",
});

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-check-url-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = {
    send: async () => "job",
    work: async (name, h) => {
      if (name === "check-url") handler = h as typeof handler;
    },
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo: new Repo(db), storage: createFsStorage(path.join(dir, "storage")), queue, close: () => db.close() };
  await startWorker(platform, config, {
    checkUrl: async (url) => {
      ran.push(url);
      return outcomes.get(url)!();
    },
  });
}, 60_000);

afterAll(async () => {
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

const create = (url: string) => platform.repo.checks.create({ url, host: new URL(url).hostname, ipKey: "", deviceId: null });

describe("check-url job", () => {
  it("saves the report", async () => {
    const id = await create("https://frizer.si/");
    outcomes.set("https://frizer.si/", async () => report("https://frizer.si/"));
    await handler({ checkId: id }, "job-1");
    expect(await platform.repo.checks.get(id)).toMatchObject({ status: "done", result: report("https://frizer.si/") });
    // Run once: a repeated delivery of the same job does nothing.
    await handler({ checkId: id }, "job-1b");
    expect(ran.filter((u) => u === "https://frizer.si/")).toHaveLength(1);
  });

  it("gives the visitor the refusal's own words, and only a general line for our failures", async () => {
    const refused = await create("https://notranji.si/");
    outcomes.set("https://notranji.si/", async () => {
      throw new UrlRefusedError("private", "Ta naslov ni javna spletna stran.");
    });
    await handler({ checkId: refused }, "job-2");
    expect(await platform.repo.checks.get(refused)).toMatchObject({ status: "failed", error: "Ta naslov ni javna spletna stran." });

    const broken = await create("https://zlomljena.si/");
    outcomes.set("https://zlomljena.si/", async () => {
      throw new Error("browserType.launch: Executable doesn't exist at /ms-playwright/chromium");
    });
    await handler({ checkId: broken }, "job-3");
    expect(await platform.repo.checks.get(broken)).toMatchObject({ status: "failed", error: CHECK_FAILED_MESSAGE });
  });

  it("ignores a job whose check is gone", async () => {
    const before = ran.length;
    await handler({ checkId: "chk_000000000000000000000000" }, "job-4");
    expect(ran.length).toBe(before);
  });
});
