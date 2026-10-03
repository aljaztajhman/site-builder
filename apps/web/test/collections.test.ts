import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { publishedBase } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminBrowser } from "./session-helpers.ts";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/** Collections over the API: switching one on, entries typed by the owner, their pages in the preview and when published. */
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-coll-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  app = createApp({ platform, config: loadConfig(), platformDomain: "stranko.example", auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

describe("collections in the editor's API", () => {
  it("switches the blog on, takes the owner's post, previews and publishes its page", async () => {
    const { cookie } = await adminBrowser(app.request.bind(app), PASSWORD);
    const json = { cookie, "content-type": "application/json" };
    const golden = JSON.parse(await readFile(path.join(import.meta.dirname, "../../../tools/eval/golden/avtoservis-mrak.json"), "utf8")) as SiteSpec;
    const brief = JSON.parse(await readFile(path.join(import.meta.dirname, "../../../tools/eval/fixtures/avtoservis-mrak/brief.json"), "utf8")) as { description: string };
    const site = await platform.repo.createSite({ name: "Avtoservis Mrak", slug: "avtoservis-zbirke", intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
    await platform.repo.saveSpec(site.id, { ...golden, slug: "avtoservis-zbirke" }, "generate");
    const post = (p: string, body: unknown) => app.request(`/api/sites/${site.id}${p}`, { method: "POST", headers: json, body: JSON.stringify(body) });

    expect((await post("/collections", { baseVersion: 1, kind: "nope" })).status).toBe(400);
    const on = await post("/collections", { baseVersion: 1, kind: "services" });
    expect(on.status, await on.clone().text()).toBe(200);
    // Moving the generated services into the collection is not the owner typing them: the fact check keeps checking them.
    expect(await platform.repo.manualPatches(site.id)).toEqual([[]]);
    expect((await post("/collections", { baseVersion: 2, kind: "services" })).status).toBe(400);

    expect((await post("/collections", { baseVersion: 2, kind: "blog" })).status).toBe(200);
    const entry = { title: "Zimske gume do konca novembra", date: "2026-10-01", summary: "Menjavo gum naročite pravočasno.", body: ["Termine za menjavo gum dajemo do konca novembra."] };
    const typed = await post("/patch", { baseVersion: 3, ops: [{ op: "add", path: "/collections/blog/items/0", value: entry }] });
    expect(typed.status, await typed.clone().text()).toBe(200);

    // The editor's forms: one entry schema per collection.
    const catalogue = (await (await app.request(`/api/sites/${site.id}/catalogue`, { headers: { cookie } })).json()) as { collections: Record<string, { properties: Record<string, unknown> }> };
    expect(Object.keys(catalogue.collections)).toEqual(["blog", "events", "services", "team"]);
    expect(Object.keys(catalogue.collections.blog!.properties)).toEqual(expect.arrayContaining(["title", "date", "summary", "body"]));

    // The preview renders the post's own page one directory down, with the site's address in its head.
    const preview = await app.request(`/preview/${site.id}/novice/zimske-gume-do-konca-novembra.html`, { headers: { cookie } });
    expect(preview.status).toBe(200);
    const html = await preview.text();
    expect(html).toContain(">Zimske gume do konca novembra</h1>");
    expect(html).toContain('<link rel="canonical" href="https://avtoservis-zbirke.stranko.example/novice/zimske-gume-do-konca-novembra.html"/>');
    expect((await app.request(`/preview/${site.id}/novice/nope.html`, { headers: { cookie } })).status).toBe(404);

    // Publishing writes the entry pages, robots.txt, the sitemap and the feed with the platform subdomain.
    const current = await platform.repo.getSpec(site.id);
    const fill = fillPlaceholderOps(current!.spec);
    if (fill.length) expect((await post("/patch", { baseVersion: current!.version, ops: fill })).status).toBe(200);
    const published = await app.request(`/api/sites/${site.id}/publish`, { method: "POST", headers: { cookie } });
    expect(published.status, await published.clone().text()).toBe(200);
    const base = await publishedBase(platform.storage, "avtoservis-zbirke");
    const file = async (p: string) => {
      const data = await platform.storage.get(`${base}${p}`);
      return data ? new TextDecoder().decode(data) : null;
    };
    expect(await file("novice/zimske-gume-do-konca-novembra.html")).toContain("<h1");
    expect(await file("robots.txt")).toContain("Sitemap: https://avtoservis-zbirke.stranko.example/sitemap.xml");
    expect(await file("sitemap.xml")).toContain("<loc>https://avtoservis-zbirke.stranko.example/novice/zimske-gume-do-konca-novembra.html</loc>");
    expect(await file("novice/rss.xml")).toContain("<title>Zimske gume do konca novembra</title>");
    // Served at the app's /s/ path too (still noindex there).
    const served = await app.request("/s/avtoservis-zbirke/novice/rss.xml");
    expect(served.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(served.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
