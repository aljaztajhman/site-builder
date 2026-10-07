import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";
import { costDays, lastDays } from "../src/admin-costs.tsx";
import { adminBrowser, ownerSignIn, type Req } from "./session-helpers.ts";

/** /admin/costs: only the admin opens it; ?days= is capped; settled spend shown, calls in flight apart. */
const PASSWORD = "test-password-1234";
const config = loadConfig();
const mail = memoryMailer();
let platform: Platform;
let dir: string;
let req: Req;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-admin-costs-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, mailer: mail, appUrl: "https://stranko.example" });
  req = (p, init) => app.request(p, init);
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

describe("costDays", () => {
  it("defaults to 30, caps at 90, ignores junk", () => {
    expect(costDays(undefined)).toBe(30);
    expect(costDays("7")).toBe(7);
    expect(costDays("90")).toBe(90);
    expect(costDays("500")).toBe(90);
    for (const junk of ["0", "-3", "abc", "7.5", "1e3", ""]) expect(costDays(junk)).toBe(30);
    expect([1, 2, 3, 7, 30, 90].map(lastDays)).toEqual(["Zadnji dan", "Zadnja 2 dneva", "Zadnji 3 dnevi", "Zadnjih 7 dni", "Zadnjih 30 dni", "Zadnjih 90 dni"]);
  });
});

describe("/admin/costs", () => {
  it("is the admin's alone: a visitor is sent to sign in, an owner (even a paying one) gets a 404", async () => {
    const anon = await req("/admin/costs", { redirect: "manual" });
    expect(anon.status).toBe(302);
    expect(anon.headers.get("location")).toBe("/login?next=%2Fadmin%2Fcosts");
    const owner = await ownerSignIn(req, mail.sent, "lastnica@siol.net");
    expect((await req("/admin/costs", { headers: { cookie: owner.cookie } })).status).toBe(404);
    const key = (await platform.repo.accounts.byKey("lastnica@siol.net"))!.email_key;
    await platform.repo.accounts.allow("lastnica@siol.net", key, null, "premium", false);
    expect((await req("/admin/costs?days=7", { headers: { cookie: owner.cookie } })).status).toBe(404);
  });

  it("shows the window's spend by run, stage, day, account and site, with calls in flight apart", async () => {
    const id = (await platform.repo.accounts.byKey("lastnica@siol.net"))!.id;
    const site = await platform.repo.createSite({ name: "Pekarna Kvas", slug: "pekarna-kvas", intake: { description: "x", photoAssetIds: [], scope: "home" }, accountId: id });
    const job = await platform.repo.usage.insertJob({ kind: "generate", scope: "home", tier: "paid", accountId: id, siteId: site.id, estimateEur: 0.5 });
    const owner = { siteId: site.id, jobId: "q1", tier: "paid" as const, accountId: id, aiJobId: job };
    await platform.repo.logModelCall({ ...owner, stage: "brief", model: "m", inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 0.25, durationMs: 1, ok: true });
    await platform.repo.logModelCall({ ...owner, stage: "content", model: "m", inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 1.5, durationMs: 1, ok: true });
    // A call in flight: its reservation (at its estimate) isn't in the totals.
    await platform.repo.usage.reserveCall({ ...owner, stage: "critique", model: "m", estimateEur: 4, capEur: 100 });

    const admin = await adminBrowser(req, PASSWORD);
    const adminPage = await (await req("/admin", { headers: { cookie: admin.cookie } })).text();
    expect(adminPage).toContain('href="/admin/costs"');

    const res = await req("/admin/costs", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const page = (await res.text()).replace(/\u00a0/g, " ");
    expect(page).toContain("<h1>Poraba skozi čas</h1>");
    expect(page).toContain("Zadnjih 30 dni po UTC");
    expect(page).toContain("1,75 €, klicev: 2");
    expect(page).toContain("klicev: 1, rezervirano 4,00 €");
    expect(page).toContain("Domača stran");
    expect(page).toContain("Vsebina <span class=\"muted\">content</span>");
    expect(page).toContain("lastnica@siol.net");
    expect(page).toContain(`href="/sites/${site.id}"`);
    expect(page).toMatch(/<a class="btn sm primary" href="\/admin\/costs\?days=30" aria-current="page">/);
    expect(page).not.toMatch(/\sstyle=/);
    expect((page.match(/<tr>/g) ?? []).length).toBeGreaterThan(30);

    const capped = await (await req("/admin/costs?days=1000", { headers: { cookie: admin.cookie } })).text();
    expect(capped).toContain("Zadnjih 90 dni po UTC");
    const week = await (await req("/admin/costs?days=7", { headers: { cookie: admin.cookie } })).text();
    expect(week).toContain("Zadnjih 7 dni po UTC");
  });
});
