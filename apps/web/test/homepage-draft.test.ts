import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { HOMEPAGE_READY } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { renderPage } from "@sb/render";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";
import { goldenWithDraft } from "./homepage-draft-helpers.ts";

/**
 * Config pipeline.homepageFirst: the homepage a full-site generation logs with "Homepage ready" is served read-only by
 * the preview (?draft=homepage) while the site is generating and until the run's first version is saved. Never a
 * version, never published; the events the editor polls don't carry it.
 */
const PASSWORD = "test-password-1234";
const config = loadConfig();
let platform: Platform;
let dir: string;
let req: (p: string, init?: RequestInit) => Promise<Response>;
let cookie: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-homepage-draft-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  req = async (p, init) => app.request(p, init);
  cookie = await adminCookie(req, PASSWORD);
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

async function generatingSite(slug: string) {
  const site = await platform.repo.createSite({ name: "Računovodstvo Seliškar", slug, intake: { description: "Računovodstvo Seliškar, Murska Sobota.", photoAssetIds: [], scope: "full" } });
  await platform.repo.setStatus(site.id, "generating");
  await platform.repo.addEvent({ siteId: site.id, stage: "classify", message: "start" });
  await platform.repo.addEvent({ siteId: site.id, stage: "content", message: "start" });
  return site;
}
const ready = (siteId: string, homepage?: SiteSpec) =>
  platform.repo.addEvent({ siteId, stage: "content", message: HOMEPAGE_READY, data: { ms: 9000, attempts: 1, issues: [], ...(homepage ? { homepage } : {}) } });
const draftPage = (siteId: string, file = "index.html") => req(`/preview/${siteId}/${file}?draft=homepage`, { headers: { cookie } });
const state = async (siteId: string) => (await (await req(`/api/sites/${siteId}`, { headers: { cookie } })).json()) as { spec: unknown; version: number | null; versions: unknown[]; events: { message: string; data: unknown }[] };

describe("homepage written before the other pages (pipeline.homepageFirst)", () => {
  it("is served by the preview with the published renderer while generating, and is no version", async () => {
    const { draft } = await goldenWithDraft("seliskar-draft");
    const site = await generatingSite("seliskar-draft");
    await ready(site.id, draft);

    const res = await draftPage(site.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    // The same renderer as the saved pages and the published site (the preview's own address in its head).
    const home = draft.pages[0]!;
    expect(html).toBe(renderPage(draft, home, { imageWidths: config.images.widths, siteUrl: null }));
    expect(html).toContain("Računovodstvo za s.p., d.o.o. in društva");
    // Its nav and links point at the pages still being written.
    expect(html).toContain('href="storitve.html"');
    // Only the homepage: the stand-in pages are not served.
    expect((await draftPage(site.id, "storitve.html")).status).toBe(404);

    // The editor's state: no version, no spec; the event says there is a homepage without carrying it.
    const s = await state(site.id);
    expect(s.spec).toBeNull();
    expect(s.version).toBeNull();
    expect(s.versions).toEqual([]);
    expect(s.events.find((e) => e.message === HOMEPAGE_READY)!.data).toEqual({ ms: 9000, attempts: 1, issues: [], homepage: true });
    // Nothing to publish: publishing reads saved versions only.
    const publish = await req(`/api/sites/${site.id}/publish`, { method: "POST", headers: { cookie } });
    expect(publish.status).not.toBe(200);
    expect((await platform.repo.getSite(site.id))!.published_version).toBeNull();
    expect(await platform.repo.listVersions(site.id)).toEqual([]);
  });

  it("is gone once the run's first version is saved, when the run failed, or when a new run starts", async () => {
    const { full, draft } = await goldenWithDraft("seliskar-draft-2");
    const saved = await generatingSite("seliskar-draft-2");
    await ready(saved.id, draft);
    expect((await draftPage(saved.id)).status).toBe(200);
    await platform.repo.saveSpec(saved.id, full, "generate");
    await platform.repo.addEvent({ siteId: saved.id, stage: "preview", message: "First version saved; the editor shows it while checks and critique run", data: { version: 1 } });
    expect((await draftPage(saved.id)).status).toBe(404);
    // The saved version is what the preview shows now.
    expect((await req(`/preview/${saved.id}/index.html`, { headers: { cookie } })).status).toBe(200);

    const failed = await generatingSite("seliskar-draft-3");
    await ready(failed.id, draft);
    await platform.repo.setStatus(failed.id, "failed");
    expect((await draftPage(failed.id)).status).toBe(404);

    const again = await generatingSite("seliskar-draft-4");
    await ready(again.id, draft);
    await platform.repo.addEvent({ siteId: again.id, stage: "classify", message: "start" });
    expect((await draftPage(again.id)).status).toBe(404);
  });

  it("a homepage that doesn't render answers 404, not a server error (the pipeline logs only one that renders)", async () => {
    const { draft } = await goldenWithDraft("seliskar-broken");
    const broken = structuredClone(draft);
    (broken.pages[0]!.sections[0] as { type: string }).type = "no-such-section";
    const site = await generatingSite("seliskar-broken");
    await ready(site.id, broken);
    const res = await draftPage(site.id);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Predogled še ni pripravljen.");
  });

  it("with the switch off (no homepage in the run) nothing changes: no draft, the events as stored", async () => {
    const site = await generatingSite("seliskar-off");
    expect((await draftPage(site.id)).status).toBe(404);
    // An event without the homepage (as logged before) is passed on as it is.
    await ready(site.id);
    expect((await draftPage(site.id)).status).toBe(404);
    const s = await state(site.id);
    const stored = await platform.repo.listEvents(site.id);
    expect(s.events.map((e) => [e.message, e.data])).toEqual(stored.map((e) => [e.message, e.data]));
  });
});
