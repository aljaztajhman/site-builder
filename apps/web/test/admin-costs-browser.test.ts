import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, runAxe, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue, type Tier } from "@sb/platform";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * The admin's cost history in Chromium at 1280 and 360 px: no sideways page scroll (the wide tables scroll in
 * their own box), axe finds nothing. Screenshots go to SB_SHOTS when set.
 */
const PASSWORD = "test-password-1234";
const config = loadConfig();
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-admin-costs-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Two weeks of calls: homepages, whole sites and edits by three accounts and an anonymous visitor, one call in flight.
  await db.query(
    "insert into accounts (id, email, email_key) values ('acct_1', 'mojca.zupancic.racunovodstvo@siol.net', 'mojca.zupancic.racunovodstvo@siol.net'), ('acct_2', 'info@pekarna-kvas.si', 'info@pekarna-kvas.si'), ('acct_3', 'jure@gmail.com', 'jure@gmail.com')",
  );
  const owners: { account: string | null; tier: Tier; name: string }[] = [
    { account: "acct_1", tier: "paid", name: "Računovodstvo Zupančič, d. o. o." },
    { account: "acct_2", tier: "free", name: "Pekarna Kvas" },
    { account: "acct_3", tier: "free", name: "Jure, mizarstvo" },
    { account: null, tier: "anonymous", name: "Frizerski salon Maja" },
  ];
  const sites: string[] = [];
  for (const [i, o] of owners.entries()) {
    const s = await platform.repo.createSite({ name: o.name, slug: `stran-${i}`, intake: { description: "x", photoAssetIds: [], scope: "home" }, accountId: o.account, deviceId: o.account ? null : "dev_1" });
    sites.push(s.id);
  }
  const at = (daysAgo: number, h: number) => new Date(Date.now() - daysAgo * 86_400_000 - h * 3_600_000).toISOString();
  const call = (o: (typeof owners)[number], site: string, job: string, stage: string, eur: number, when: string, pending = false) =>
    db.query(
      `insert into model_calls (site_id, job_id, stage, model, input_tokens, output_tokens, cost_eur, duration_ms, ok, pending, tier, account_id, ai_job_id, created_at)
       values ($1, 'q', $2, 'm', 0, 0, $3, 0, $4, $5, $6, $7, $8, $9)`,
      [site, stage, eur, !pending, pending, o.tier, o.account, job, when],
    );
  for (let d = 0; d < 14; d++) {
    const o = owners[d % owners.length]!;
    const site = sites[d % owners.length]!;
    const full = o.tier === "paid" && d % 2 === 0;
    const g = await platform.repo.usage.insertJob({ kind: "generate", scope: full ? "full" : "home", tier: o.tier, accountId: o.account, siteId: site, estimateEur: 0.5 });
    await db.query("update ai_jobs set created_at = $2, status = 'done' where id = $1", [g, at(d, 1)]);
    const stages: [string, number][] = [["classify", 0.0006], ["brief", 0.021], ["design", 0.034], ["content", full ? 0.92 : 0.18 + d / 100], ["critique", 0.052], ["altText", 0.004], ["imageGen", 0.068]];
    for (const [stage, eur] of stages) await call(o, site, g, stage, eur, at(d, 1));
    if (o.account) {
      const e = await platform.repo.usage.insertJob({ kind: "edit", tier: o.tier, accountId: o.account, siteId: site, estimateEur: 0.03 });
      await db.query("update ai_jobs set created_at = $2, status = 'done' where id = $1", [e, at(d, 2)]);
      await call(o, site, e, "edit", 0.011 + d / 1000, at(d, 2));
    }
  }
  await db.query(
    "insert into model_calls (site_id, job_id, stage, model, input_tokens, output_tokens, cost_eur, duration_ms, ok, pending, tier) values (null, null, 'content', 'm', 0, 0, 1.2, 0, true, false, null)",
  );
  await call(owners[0]!, sites[0]!, "999", "content", 0.6, at(0, 0), true);

  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("/admin/costs in the browser", () => {
  for (const width of [1280, 360]) {
    it(`at ${width} px: no sideways page scroll, wide tables scroll in their box, axe clean`, async () => {
      const phone = width === 360;
      const context = await cb.browser.newContext({ viewport: { width, height: phone ? 780 : 900 }, hasTouch: phone, isMobile: phone });
      await context.addCookies([{ name: "sb_session", value: cookie.slice("sb_session=".length), url: base }]);
      const page = await context.newPage();
      try {
        const res = await page.goto(`${base}/admin/costs?days=14`);
        expect(res?.status()).toBe(200);
        expect(await page.locator("h1").textContent()).toBe("Poraba skozi čas");
        expect(await page.locator("#t-days").count()).toBe(1);
        expect(await page.locator("table").count()).toBe(5);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), "no sideways page scroll").toBeLessThanOrEqual(width);
        const days = page.locator(".table-scroll", { has: page.locator("#t-days") });
        const box = await days.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
        if (phone) expect(box.scroll, "the day table scrolls inside its box on a phone").toBeGreaterThan(box.client);
        const violations = await runAxe(page);
        expect(violations.map((v) => `${v.id} (${v.impact}, ${v.nodes}): ${v.targets.join(" | ")}`)).toEqual([]);
        if (process.env.SB_SHOTS) await page.screenshot({ path: path.join(process.env.SB_SHOTS, `admin-costs-${width}.png`), fullPage: true });
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
