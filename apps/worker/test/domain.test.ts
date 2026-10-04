import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { publishSite } from "@sb/engine";
import { Repo, createDb, createFsStorage, fakeDns, fakeEdge, fakeRegistrar, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";
import { startWorker } from "../src/worker.ts";

/**
 * The worker's "domain" job (fake providers) and its address check at start: a site published before
 * PLATFORM_DOMAIN existed is republished with its platform address when the worker starts with it.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let platform: Platform;
let dir: string;
let siteId: string;
let slug: string;
const handlers: { [Q in keyof JobData]?: (data: JobData[Q], jobId: string) => Promise<void> } = {};
let handle: Awaited<ReturnType<typeof startWorker>>;

function setPointer(obj: Record<string, unknown>, pointer: string, value: unknown): void {
  const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let at: Record<string, unknown> = obj;
  for (const p of parts.slice(0, -1)) at = at[p] as Record<string, unknown>;
  at[parts.at(-1)!] = value;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-worker-domain-"));
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
  // A site published while there was no platform domain: its release carries no address.
  const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/racunovodstvo-seliskar.json"), "utf8")) as SiteSpec;
  const brief = JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/racunovodstvo-seliskar/brief.json"), "utf8")) as { description: string };
  slug = spec.slug;
  const s = await platform.repo.createSite({ name: "Seliškar", slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
  siteId = s.id;
  await platform.repo.saveSpec(s.id, spec, "generate");
  const ops = fillPlaceholderOps(spec);
  const filled = structuredClone(spec) as unknown as Record<string, unknown>;
  for (const op of ops) setPointer(filled, op.path, op.value);
  await platform.repo.saveSpec(s.id, filled as unknown as SiteSpec, "manual", "facts", ops);
  await publishSite({ repo: platform.repo, storage: platform.storage, config, platformDomain: null }, s.id);
  const edge = fakeEdge();
  handle = await startWorker(platform, config, {}, { platformDomain: "stranko.example", domainProviders: { registrar: fakeRegistrar(), edge, dns: fakeDns({}, { anyCnameTo: edge.cnameTarget }) } });
}, 60_000);

afterAll(async () => {
  await handle?.shutdown(1000);
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("worker: domains", () => {
  it("republishes a site with its platform address when it starts with PLATFORM_DOMAIN", async () => {
    expect((await platform.repo.getSite(siteId))!.published_address).toBe(`https://${slug}.stranko.example/`);
  });

  it("runs the domain job: an owner's domain goes live and the site carries its address", async () => {
    await platform.repo.domains.start(siteId, "www.seliskar.si", "connected", { record: { type: "CNAME", name: "www", value: "povezava.stranko.example" } });
    await handlers.domain!({ hostname: "www.seliskar.si" }, "job-domain");
    expect((await platform.repo.domains.get("www.seliskar.si"))!).toMatchObject({ status: "active", notify: "pending" });
    expect((await platform.repo.getSite(siteId))!.published_address).toBe("https://www.seliskar.si/");
    // A job for a domain that isn't due (or is done) does nothing.
    await handlers.domain!({ hostname: "www.seliskar.si" }, "job-domain-2");
    expect((await platform.repo.domains.get("www.seliskar.si"))!.status).toBe("active");
  });
});
