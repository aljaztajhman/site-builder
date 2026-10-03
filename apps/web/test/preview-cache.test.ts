import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/** The editor's preview renders a version once; a save (a new version) shows at once. */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let specReads = 0;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-previewcache-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  const repo = new Repo(db);
  const getSpec = repo.getSpec.bind(repo);
  repo.getSpec = (...args: Parameters<typeof getSpec>) => (specReads++, getSpec(...args));
  platform = { db, repo, storage: createFsStorage(dir), queue, close: () => db.close() };
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

describe("preview cache", () => {
  it("serves a version's page again without loading the spec, and a new version right away", async () => {
    const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
    const req = app.request.bind(app);
    const cookie = await adminCookie((p, init) => Promise.resolve(req(p, init)), PASSWORD);
    const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
    const site = await platform.repo.createSite({ name: "Kvas", slug: "predogled-kes", intake: { description: "x", photoAssetIds: [], scope: "home" } });
    await platform.repo.saveSpec(site.id, { ...spec, slug: "predogled-kes" }, "generate");
    const get = (q = "") => req(`/preview/${site.id}/index.html${q}`, { headers: { cookie } });

    const first = await get("?v=1");
    expect(first.status).toBe(200);
    const html = await first.text();
    specReads = 0;
    expect(await (await get("?v=1")).text()).toBe(html);
    expect(await (await get()).text()).toBe(html);
    expect(specReads).toBe(0);
    // A layout thumbnail is its own entry.
    const thumb = await get("?v=1&section=s_hero&variant=" + encodeURIComponent((spec.pages[0]!.sections[0]! as { variant: string }).variant));
    expect(thumb.status).toBe(200);
    expect(await thumb.text()).not.toBe(html);

    // A save: the current preview shows it at once; the old version is still there by its number.
    const patch = await req(`/api/sites/${site.id}/patch`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ baseVersion: 1, ops: [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Kruh iz Kamnika, pečen ponoči" }] }) });
    expect(patch.status).toBe(200);
    expect(await (await get()).text()).toContain("Kruh iz Kamnika, pečen ponoči");
    expect(await (await get("?v=1")).text()).toBe(html);
    // Unknown pages and versions are not cached into something else.
    expect((await get("?v=99")).status).toBe(200);
    expect((await req(`/preview/${site.id}/ni-je.html`, { headers: { cookie } })).status).toBe(404);
  });
});
