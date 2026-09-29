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
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/**
 * The contact form end to end in Chromium against the real app over HTTP: the published page,
 * its island, the CSP, the endpoint and the database. No network beyond localhost.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;
let siteId: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-forms-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // The accountant's golden site (it has a contact form).
  const golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/racunovodstvo-seliskar.json"), "utf8")) as SiteSpec;
  const spec = structuredClone(golden);
  // The fixture's brief is the client's input: the fact check compares the site against it.
  const brief = JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/racunovodstvo-seliskar/brief.json"), "utf8")) as { description: string };
  const site = await platform.repo.createSite({ name: "Seliškar", slug: spec.slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
  siteId = site.id;
  await platform.repo.saveSpec(site.id, spec, "generate");

  const login = await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ password: PASSWORD, next: "/" }), redirect: "manual" });
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!;
  // The owner fills the missing facts in the editor (a manual edit counts as client input).
  const patch = await fetch(`${base}/api/sites/${site.id}/patch`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ baseVersion: 1, ops: fillPlaceholderOps(spec), message: "facts" }),
  });
  expect(patch.status, await patch.clone().text()).toBe(200);
  const pub = await fetch(`${base}/api/sites/${site.id}/publish`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
  expect(pub.status, await pub.clone().text()).toBe(200);
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

// Sites scroll smoothly unless reduced motion is asked for; on slow CI runners that keeps the button
// moving while Playwright scrolls it into view, so the tests ask for reduced motion.
const STILL = { reducedMotion: "reduce" as const };
type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
const fill = async (page: Page, message: string) => {
  await page.getByLabel("Ime in priimek").fill("Ana Novak");
  await page.getByLabel("E-pošta").fill("ana@primer.si");
  await page.getByLabel("Telefon").fill("041 555 906");
  await page.getByLabel("Sporočilo").fill(message);
  await page.getByRole("button", { name: "Pošlji sporočilo" }).click();
};

describe("contact form in a browser", () => {
  it("submits in place on a phone with JavaScript, with no CSP violations", async () => {
    const ctx = await cb.browser.newContext({ ...STILL, viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const problems: string[] = [];
    page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
    page.on("pageerror", (e) => problems.push(String(e)));
    const slug = (await platform.repo.getSite(siteId))!.slug;
    await page.goto(`${base}/s/${slug}/`);
    await fill(page, "Zanima me mesečno knjigovodstvo za s.p.");
    await expect.poll(() => page.locator("[data-form-status]").textContent()).toContain("Hvala, sporočilo smo prejeli.");
    expect(page.url()).toBe(`${base}/s/${slug}/`);
    expect(await page.getByLabel("Sporočilo").inputValue()).toBe("");
    expect(problems).toEqual([]);
    const [m] = await platform.repo.listFormMessages(siteId);
    expect(m).toMatchObject({ name: "Ana Novak", email: "ana@primer.si", phone: "041 555 906", message: "Zanima me mesečno knjigovodstvo za s.p." });
    await ctx.close();
  }, 60_000);

  it("posts normally without JavaScript and shows a thank-you page", async () => {
    const ctx = await cb.browser.newContext({ ...STILL, javaScriptEnabled: false });
    const page = await ctx.newPage();
    const slug = (await platform.repo.getSite(siteId))!.slug;
    await page.goto(`${base}/s/${slug}/`);
    await fill(page, "Brez JavaScripta.");
    await page.waitForURL(`${base}/s/${slug}/_submit`);
    expect(await page.locator("h1").textContent()).toContain("Hvala, sporočilo smo prejeli.");
    await page.getByRole("link", { name: "Nazaj na stran" }).click();
    await page.waitForURL(`${base}/s/${slug}/`);
    expect((await platform.repo.listFormMessages(siteId)).map((m) => m.message)).toContain("Brez JavaScripta.");
    await ctx.close();
  }, 60_000);

  it("sends nothing from the dashboard preview and says so", async () => {
    const ctx = await cb.browser.newContext(STILL);
    const [name, value] = cookie.split("=") as [string, string];
    await ctx.addCookies([{ name, value, url: base }]);
    const page = await ctx.newPage();
    const before = (await platform.repo.listFormMessages(siteId)).length;
    await page.goto(`${base}/preview/${siteId}/index.html`);
    await fill(page, "Iz predogleda.");
    await expect.poll(() => page.locator("[data-form-status]").textContent()).toContain("V predogledu se sporočila ne pošiljajo.");
    expect((await platform.repo.listFormMessages(siteId)).length).toBe(before);
    await ctx.close();
  }, 60_000);
});
