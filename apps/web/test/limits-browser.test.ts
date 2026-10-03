import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { SITEVERIFY_URL, turnstile } from "../src/turnstile.ts";
import { linkFor } from "./session-helpers.ts";

/**
 * The free limits end to end in Chromium, as a visitor meets them: anonymous → one preview → the second
 * refused → sign up by magic link (memory mail transport) → the preview claimed → two more → refused; an
 * allow-listed account makes a whole site; with the free pools held, paid work still runs and a preview
 * without an account is refused. Turnstile's script is a local stand-in for Cloudflare's (no network):
 * it fills the token the way the real widget does, and the server checks it against Cloudflare's
 * always-pass test secret through a siteverify stand-in. The worker is a stand-in that saves a golden spec.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const config = loadConfig();
const mail = memoryMailer();
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;

const PASS_SECRET = "1x0000000000000000000000000000000AA";
const siteverify = (async (url: string, init: RequestInit) => {
  if (url !== SITEVERIFY_URL) throw new Error(url);
  const body = new URLSearchParams(String(init.body));
  return new Response(JSON.stringify({ success: body.get("secret") === PASS_SECRET && body.get("response") === "XXXX.DUMMY.TOKEN.XXXX" }));
}) as unknown as typeof fetch;
/** What Cloudflare's api.js does for us here: a 300 × 65 widget that puts the test token in the form. */
const TURNSTILE_STUB = `for (const el of document.querySelectorAll(".cf-turnstile")) {
  const box = document.createElement("div"); box.style.cssText = "width:100%;min-width:300px;height:65px;background:#eee";
  const input = document.createElement("input"); input.type = "hidden"; input.name = "cf-turnstile-response"; input.value = "XXXX.DUMMY.TOKEN.XXXX";
  el.append(box, input);
}`;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-limits-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  // The worker, standing in: a version, the job's cost logged, the job finished.
  const queue: Queue = {
    send: async (name, data) => {
      const d = data as JobData["generate"];
      setTimeout(() => {
        void (async () => {
          const site = (await platform.repo.getSite(d.siteId))!;
          if (name === "generate") await platform.repo.saveSpec(d.siteId, { ...golden, slug: site.slug }, "generate");
          if (d.aiJobId) {
            const j = (await platform.repo.usage.getJob(d.aiJobId))!;
            await platform.repo.logModelCall({ siteId: d.siteId, jobId: "w", stage: "content", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 0.1, durationMs: 1, ok: true, tier: j.tier, accountId: j.account_id, aiJobId: d.aiJobId });
            await platform.repo.usage.finishJob(d.aiJobId, "done");
          }
          await platform.repo.setStatus(d.siteId, "ready");
        })();
      }, 50);
      return "job";
    },
    work: async () => undefined,
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({
    platform,
    config,
    auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false },
    mailer: mail,
    botCheck: turnstile({ siteKey: "1x00000000000000000000AA", secretKey: PASS_SECRET, fetch: siteverify }),
  });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;

async function browser(width: number) {
  const context = await cb.browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const turnstileRequests: string[] = [];
  await context.route("https://challenges.cloudflare.com/**", (route) => {
    turnstileRequests.push(route.request().url());
    return route.fulfill({ contentType: "text/javascript", body: TURNSTILE_STUB });
  });
  const page = await context.newPage();
  return { page, turnstileRequests, close: () => context.close() };
}

async function shot(page: Page, name: string) {
  const out = process.env.SB_SHOTS;
  if (!out) return;
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
}

/**
 * Types a description on the landing page and presses "Ustvari". Resolves when the next page has loaded,
 * or (without an account, refused at the ticket) when the refusal shows above the form on the same page.
 */
async function create(page: Page, description: string, scope?: "full") {
  await page.goto(`${base}/#zacni`);
  await page.locator("#opis").fill(description);
  if (scope) await page.locator("label[for=scope-full]").click();
  const navigated = page.waitForNavigation({ timeout: 30_000 }).then(() => "page");
  const refused = page.locator(".note.bad").waitFor({ timeout: 30_000 }).then(() => "note");
  navigated.catch(() => undefined);
  refused.catch(() => undefined);
  await page.getByRole("button", { name: "Ustvari" }).click();
  await Promise.race([navigated, refused]);
  await page.waitForLoadState();
}

const DESCRIPTION = "Pekarna Kvas v Kamniku, Šutna 30. Kruh z drožmi, rogljički in potica. Odprto vsak dan od 7.00 do 13.00.";

async function signIn(page: Page, email: string) {
  await page.goto(`${base}/login`);
  await page.locator("#email").fill(email);
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Pošlji povezavo" }).click()]);
  expect(await page.locator("h1").textContent()).toBe("Preverite e-pošto");
  await page.goto(linkFor(mail.sent, email));
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Prijava" }).click()]);
}

describe("free limits in a browser", () => {
  it("anonymous preview, refused second, sign-up claims it, two more, refused (phone width)", async () => {
    const { page, turnstileRequests, close } = await browser(360);
    try {
      await page.goto(`${base}/`);
      // Cloudflare's script isn't loaded for a mere visit, only once the visitor starts on the form.
      await page.waitForTimeout(300);
      expect(turnstileRequests).toEqual([]);
      expect(await page.locator("[data-allowance]").textContent()).toContain("Prva domača stran je brezplačna, brez prijave.");

      await create(page, DESCRIPTION);
      expect(turnstileRequests.length).toBe(1);
      expect(page.url()).toMatch(/\/sites\/site_[0-9a-f]{16}$/);
      const first = page.url().split("/").at(-1)!;
      expect((await platform.repo.getSite(first))!.device_id).not.toBeNull();
      await shot(page, "limits-1-anonymous-preview-360");

      // The landing page now links the preview and refuses another, keeping the text.
      await page.goto(`${base}/`);
      expect(await page.locator(".hero .note").first().textContent()).toContain("Brezplačni predogled ste že naredili");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      await create(page, `${DESCRIPTION} Še ena.`);
      expect(await page.locator(".note.bad").textContent()).toContain("Brezplačni predogled brez prijave ste že naredili.");
      expect(await page.locator("#opis").inputValue()).toBe(`${DESCRIPTION} Še ena.`);
      await shot(page, "limits-2-second-refused-360");

      // Sign up with a magic link on the same phone: the preview becomes the account's.
      await signIn(page, "ana.pekarna@siol.net");
      expect(page.url()).toBe(`${base}/sites`);
      expect(await page.locator(".site-card h2 a").getAttribute("href")).toBe(`/sites/${first}`);
      expect(await page.locator("main.sites > p.muted").textContent()).toContain("Še 1 brezplačno ustvarjanje domače strani in 5 sprememb s pomočnikom.");
      expect((await platform.repo.getSite(first))!.device_id).toBeNull();

      // One more homepage, then no more; the refusal names the plan that adds more (sb-tiers).
      await page.goto(`${base}/`);
      expect(await page.locator("[data-allowance]").textContent()).toContain("Še 1 brezplačno ustvarjanje domače strani in 5 sprememb s pomočnikom.");
      await create(page, `${DESCRIPTION} Druga.`);
      expect(page.url()).toMatch(/\/sites\/site_/);
      await create(page, `${DESCRIPTION} Tretja.`);
      expect(await page.locator(".note.bad").textContent()).toContain("Porabili ste 1 brezplačno ustvarjanje domače strani. Stran lahko še naprej urejate neposredno. Z naročnino Osnovni");
      expect(await page.locator("#opis").inputValue()).toBe(`${DESCRIPTION} Tretja.`);
      // Signed in, no bot check is loaded or needed.
      expect(await page.locator(".cf-turnstile").count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      await shot(page, "limits-3-free-used-360");
    } finally {
      await close();
    }
  }, 120_000);

  it("allow-listed account makes a whole site; with the free pools empty, paid work runs and previews are refused", async () => {
    await platform.repo.accounts.allow("partner@siol.net", "partner@siol.net", "prvi partner");
    const paid = await browser(1280);
    const anon = await browser(360);
    try {
      await signIn(paid.page, "partner@siol.net");
      await create(paid.page, DESCRIPTION, "full");
      expect(paid.page.url()).toMatch(/\/sites\/site_/);
      const id = paid.page.url().split("/").at(-1)!;
      expect((await platform.repo.getSite(id))!.intake.scope).toBe("full");

      // Both free pools held (the admin's "Ustavi za 24 h").
      for (const pool of ["anonymous", "free"] as const) await platform.repo.usage.hold(pool, config.tiers.pools[pool] * config.limits.dailyModelSpendCapEur, 60);
      await create(paid.page, `${DESCRIPTION} Celotna, druga.`, "full");
      expect(paid.page.url()).toMatch(/\/sites\/site_/);
      await create(anon.page, DESCRIPTION);
      expect(await anon.page.locator(".note.bad").textContent()).toContain("Današnji brezplačni predogledi brez prijave so porabljeni.");
      await shot(anon.page, "limits-4-pool-empty-360");
      await platform.repo.usage.releaseHolds();
    } finally {
      await paid.close();
      await anon.close();
    }
  }, 120_000);
});
