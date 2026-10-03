import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { livePointerKey } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue, type Storage } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/** Published pages read the live-release pointer once per few seconds, and a publish shows at once. */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
const pointerReads: string[] = [];

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-pubcache-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  const fs = createFsStorage(dir);
  // Counts reads of live pointers; everything else passes through.
  const storage: Storage = new Proxy(fs, {
    get(target, prop, receiver) {
      if (prop === "get") return (key: string) => (key.includes("/_live/") && pointerReads.push(key), target.get(key));
      return Reflect.get(target, prop, receiver);
    },
  });
  platform = { db, repo: new Repo(db), storage, queue, close: () => db.close() };
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

describe("published pages", () => {
  it("reuse the live pointer between requests and show a new publish right away", async () => {
    const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
    const req = app.request.bind(app);
    const cookie = await adminCookie((p, init) => Promise.resolve(req(p, init)), PASSWORD);
    const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
    // The fixture's brief is the client's input: the fact check compares the site against it.
    const brief = JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/pekarna-kvas/brief.json"), "utf8")) as { description: string };
    const site = await platform.repo.createSite({ name: "Kvas", slug: spec.slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
    await platform.repo.saveSpec(site.id, spec, "generate");
    const json = { cookie, "content-type": "application/json" };
    const ops = fillPlaceholderOps(spec);
    if (ops.length) expect((await req(`/api/sites/${site.id}/patch`, { method: "POST", headers: json, body: JSON.stringify({ baseVersion: 1, ops, message: "facts" }) })).status).toBe(200);
    expect((await req(`/api/sites/${site.id}/publish`, { method: "POST", headers: json, body: "{}" })).status).toBe(200);

    pointerReads.length = 0;
    for (let i = 0; i < 3; i++) expect((await req(`/s/${spec.slug}/`)).status).toBe(200);
    expect(pointerReads.filter((k) => k === livePointerKey(spec.slug))).toHaveLength(1);

    // A new headline, published: the next view shows it (the publish forgot the cached pointer).
    const v = (await platform.repo.getSpec(site.id))!.version;
    const edit = await req(`/api/sites/${site.id}/patch`, { method: "POST", headers: json, body: JSON.stringify({ baseVersion: v, ops: [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Kruh iz Kamnika, pečen ponoči" }], message: "naslov" }) });
    expect(edit.status).toBe(200);
    expect((await req(`/api/sites/${site.id}/publish`, { method: "POST", headers: json, body: "{}" })).status).toBe(200);
    expect(await (await req(`/s/${spec.slug}/`)).text()).toContain("Kruh iz Kamnika, pečen ponoči");
  }, 60_000);
});
