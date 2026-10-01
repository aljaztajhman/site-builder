import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";

/** The editor's "Različice" list in Chromium: autosaves in groups, other changes on their own rows, restore. */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-versions-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ password: PASSWORD, next: "/" }), redirect: "manual" });
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!;
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
}, 60_000);

describe("versions list in a browser", () => {
  it("shows a typing session as one row, keeps the chat edit and the generation apart, and restores the group's last state", async () => {
    const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
    const site = await platform.repo.createSite({ name: "Pekarna", slug: "razlicice", intake: { description: "x", photoAssetIds: [], scope: "home" } });
    const save = async (source: "generate" | "edit" | "manual", message: string | undefined, minute: number, headline: string) => {
      const s = structuredClone({ ...spec, slug: "razlicice" });
      (s.pages[0]!.sections[0]!.props as { headline: string }).headline = headline;
      const v = await platform.repo.saveSpec(site.id, s, source, message);
      await platform.db.query("update spec_versions set created_at = now() - make_interval(mins => $3::integer) where site_id = $1 and version = $2", [site.id, v, 60 - minute]);
    };
    await save("generate", undefined, 0, "Kruh iz krušne peči"); // v1
    for (let i = 0; i < 5; i++) await save("manual", "urejen razdelek hero", 10 + i, `Kruh z drožmi ${i}`); // v2–v6
    await save("edit", "Dodaj praznični delovni čas", 20, "Kruh z drožmi 4"); // v7
    await save("manual", "premik", 21, "Kruh z drožmi 4"); // v8
    await platform.repo.setStatus(site.id, "ready");

    for (const width of [1280, 375]) {
      const context = await cb.browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const [name, value] = cookie.split("=") as [string, string];
      await context.addCookies([{ name, value, url: base }]);
      const page = await context.newPage();
      try {
        await page.goto(`${base}/sites/${site.id}`);
        await page.getByRole("button", { name: "Različice" }).click();
        const rows = page.locator("ol.versions > li");
        await rows.first().waitFor();
        const texts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
        // v8 (current), v7 (chat), v2–v6 as one row, v1.
        expect(texts).toHaveLength(4);
        expect(texts[0]).toMatch(/^v8 urejanje · .* premik trenutna$/);
        expect(texts[1]).toMatch(/^v7 pomočnik · .*Dodaj praznični delovni čas Obnovi$/);
        expect(texts[2]).toMatch(/^v6 5 sprememb besedila, \d\d:\d\d–\d\d:\d\d urejanje · .* · v2–v6 Obnovi$/);
        expect(texts[3]).toMatch(/^v1 ustvarjeno · /);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);      } finally {
        await context.close();
      }
    }

    // "Obnovi" on the group restores its last save (v6).
    const context = await cb.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const [name, value] = cookie.split("=") as [string, string];
    await context.addCookies([{ name, value, url: base }]);
    const page = await context.newPage();
    try {
      await page.goto(`${base}/sites/${site.id}`);
      await page.getByRole("button", { name: "Različice" }).click();
      await page.getByRole("button", { name: /^Obnovi različico 6, zadnjo od: 5 sprememb besedila/ }).click();
      await page.locator("ol.versions > li", { hasText: "povrnjeno na različico 6" }).waitFor();
      const current = await platform.repo.getSpec(site.id);
      expect(current?.version).toBe(9);
      expect((current!.spec.pages[0]!.sections[0]!.props as { headline: string }).headline).toBe("Kruh z drožmi 4");
    } finally {
      await context.close();
    }
  }, 120_000);
});
