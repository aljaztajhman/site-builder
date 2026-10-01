import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp, type ClassifyIntake } from "../src/app.ts";
import { allowancePeriod, monthlyAllowance } from "../src/limits.ts";
import { SITEVERIFY_URL, turnstile, type BotCheck } from "../src/turnstile.ts";
import { adminBrowser, csrfIn, newBrowser, ownerSignIn, type Browser, type Req } from "./session-helpers.ts";

/**
 * Free generation limits at the API (docs/plans/free-generation-limits.md): anonymous → one homepage per
 * device and a loose per-IP limit, Turnstile, junk refused before Sonnet, the preview claimed on sign-up,
 * a free account's 2 homepages and 10 chat edits, the paid monthly € allowance, and the per-tier pools.
 * No network: Turnstile's siteverify and the classifier are stand-ins; the queue records what was sent.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
// A higher daily cap, so the pools (shares of it) have room for every test in this file; the shares are config's.
const config = structuredClone(loadConfig());
config.limits.dailyModelSpendCapEur = 100;
const mail = memoryMailer();
const sent: { name: keyof JobData; data: JobData[keyof JobData] }[] = [];
let platform: Platform;
let dir: string;

// Cloudflare's published test keys (developers.cloudflare.com/turnstile/troubleshooting/testing/).
const SITE_KEY = "1x00000000000000000000AA";
const PASS_SECRET = "1x0000000000000000000000000000000AA";
const FAIL_SECRET = "2x0000000000000000000000000000000AA";
const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const verified: URLSearchParams[] = [];
/** siteverify as the test secrets behave: the always-pass secret accepts the dummy token, the always-fail one refuses. */
const siteverify = (async (url: string, init: RequestInit) => {
  expect(url).toBe(SITEVERIFY_URL);
  const body = new URLSearchParams(String(init.body));
  verified.push(body);
  const ok = body.get("secret") === PASS_SECRET && !!body.get("response");
  return new Response(JSON.stringify(ok ? { success: true } : { success: false, "error-codes": ["invalid-input-response"] }));
}) as unknown as typeof fetch;

/** The classifier stand-in: "junk" text can't be placed; its call is logged like the real one (€0.0006). */
const classifyIntake: ClassifyIntake = async (description, ctx) => {
  await platform.repo.logModelCall({ siteId: ctx.siteId, jobId: null, stage: "classify", model: "claude-haiku-4-5-20251001", inputTokens: 600, outputTokens: 20, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 0.0006, durationMs: 1, ok: true, tier: ctx.tier, accountId: ctx.accountId, aiJobId: ctx.aiJobId });
  if (/kaboom/.test(description)) throw new Error("API unreachable");
  return /asdf/.test(description) ? { businessType: "shop", confidence: 0.12 } : { businessType: "bakery", confidence: 0.97 };
};

function makeApp(botCheck: BotCheck, secureCookies = false) {
  return createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies }, mailer: mail, appUrl: "https://stranko.example", botCheck, classifyIntake });
}
let app: ReturnType<typeof createApp>;
let req: Req;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-limits-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = {
    send: async (name, data) => {
      sent.push({ name, data });
      return `job_${sent.length}`;
    },
    work: async () => undefined,
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  app = makeApp(turnstile({ siteKey: SITE_KEY, secretKey: PASS_SECRET, fetch: siteverify }));
  req = (p, init) => app.request(p, init);
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const DESCRIPTION = "Pekarna Kvas v Kamniku, Šutna 30. Kruh z drožmi, rogljički in potica. Odprto vsak dan od 7.00 do 13.00.";
let ipCounter = 0;
/** A fresh client address, so the per-IP limit only trips where a test means it to. */
const freshIp = () => `203.0.113.${++ipCounter}`;

const anonymousOf = (b: Browser) => !/sb_(account|session)=/.test(b.cookie);

/** Without an account, step 1 (as home.ts does it): the text alone for an upload ticket. */
async function askTicket(r: Req, b: Browser, opts: { description?: string; token?: string | null; ip?: string } = {}) {
  const fields = new URLSearchParams({ _csrf: b.csrf, description: opts.description ?? DESCRIPTION });
  if (opts.token !== null) fields.set("cf-turnstile-response", opts.token ?? DUMMY_TOKEN);
  return r("/api/intake/ticket", { method: "POST", body: fields, headers: { cookie: b.cookie, "x-forwarded-for": opts.ip ?? freshIp() } });
}

/** The landing page's form as a browser posts it: without an account, a ticket first, then the form carrying it. */
async function intake(r: Req, b: Browser, opts: { description?: string; token?: string | null; ip?: string; scope?: string; photos?: File[] } = {}) {
  const ip = opts.ip ?? freshIp();
  let path = "/api/sites";
  if (anonymousOf(b)) {
    const ticket = await askTicket(r, b, { ...opts, ip });
    if (ticket.status !== 200) return ticket;
    path = `/api/sites?ticket=${encodeURIComponent(((await ticket.json()) as { ticket: string }).ticket)}`;
  }
  const form = new FormData();
  form.set("_csrf", b.csrf);
  form.set("description", opts.description ?? DESCRIPTION);
  if (opts.scope) form.set("scope", opts.scope);
  for (const p of opts.photos ?? []) form.append("photos", p);
  return r(path, { method: "POST", body: form, headers: { cookie: b.cookie, "x-forwarded-for": ip } });
}

/** A request body that records how much of it the server read (nothing is pulled until it is read). */
function trackedBody(totalBytes: number, chunkBytes = 64 * 1024) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (pulled >= totalBytes) return controller.close();
        const n = Math.min(chunkBytes, totalBytes - pulled);
        pulled += n;
        controller.enqueue(new Uint8Array(n).fill(65));
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulled: () => pulled };
}
const streamed = (r: Req, path: string, b: Browser, body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
  r(path, { method: "POST", body, duplex: "half", headers: { cookie: b.cookie, "content-type": "multipart/form-data; boundary=xyz", ...headers } } as RequestInit);
const siteOf = (res: Response) => res.headers.get("location")!.split("/").at(-1)!;
const json = (cookie: string) => ({ cookie, "content-type": "application/json" });
const chat = (b: Browser, siteId: string) => req(`/api/sites/${siteId}/chat`, { method: "POST", headers: json(b.cookie), body: JSON.stringify({ message: "Temnejša glava prosim" }) });
const regenerate = (b: Browser, siteId: string, scope = "home") => req(`/api/sites/${siteId}/generate`, { method: "POST", headers: json(b.cookie), body: JSON.stringify({ scope }) });

/** What the queued job's worker would do: save a version, mark the site ready, log the calls, finish the job. */
async function runQueued(costEur = 0.05): Promise<void> {
  const golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  for (const job of sent.splice(0)) {
    const data = job.data as { siteId: string; aiJobId?: string };
    if (job.name === "generate") {
      const site = (await platform.repo.getSite(data.siteId))!;
      await platform.repo.saveSpec(data.siteId, { ...golden, slug: site.slug }, "generate");
    }
    if (data.aiJobId) {
      const j = (await platform.repo.usage.getJob(data.aiJobId))!;
      await platform.repo.logModelCall({ siteId: data.siteId, jobId: "w", stage: job.name === "edit" ? "edit" : "content", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur, durationMs: 1, ok: true, tier: j.tier, accountId: j.account_id, aiJobId: data.aiJobId });
      await platform.repo.usage.finishJob(data.aiJobId, "done");
    }
    await platform.repo.setStatus(data.siteId, "ready");
  }
}

const state = async (b: Browser, id: string) =>
  (await (await req(`/api/sites/${id}`, { headers: { cookie: b.cookie } })).json()) as {
    access: { viewer: string; can: Record<string, boolean>; allowance: Record<string, unknown> & { text: string }; expiresAt: string | null; signIn: string | null };
  };

describe("anonymous: one homepage per device", () => {
  it("makes the first preview without an account, refuses the second and keeps the text", async () => {
    const b = await newBrowser(req);
    const home = await req("/", { headers: { cookie: b.cookie } });
    const page = await home.text();
    // Turnstile's widget and the CSP that lets its script and frame load.
    expect(page).toContain(`data-sitekey="${SITE_KEY}"`);
    expect(home.headers.get("content-security-policy")).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(home.headers.get("content-security-policy")).toContain("frame-src 'self' https://challenges.cloudflare.com");

    const first = await intake(req, b);
    expect(first.status).toBe(303);
    const id = siteOf(first);
    const site = (await platform.repo.getSite(id))!;
    expect(site.account_id).toBeNull();
    expect(site.device_id).toMatch(/^[0-9a-f]{32}$/);
    // The classifier's answer rides along, so the pipeline doesn't ask again.
    expect(site.intake.classification).toEqual({ businessType: "bakery", confidence: 0.97 });
    const job = sent.at(-1)!;
    expect(job.name).toBe("generate");
    const aiJobId = (job.data as { aiJobId: string }).aiJobId;
    expect(await platform.repo.usage.getJob(aiJobId)).toMatchObject({ tier: "anonymous", pool: "anonymous", status: "queued", estimate_eur: config.tiers.estimatesEur.homepage });
    // Turnstile was asked without the visitor's IP.
    expect(verified.at(-1)!.get("remoteip")).toBeNull();
    await runQueued();

    // The device can look at its preview, not change it.
    const s = await state(b, id);
    expect(s.access.viewer).toBe("anonymous");
    expect(s.access.can).toEqual({ edit: false, chat: false, regenerate: false, publish: false, export: false, fullSite: false });
    expect(s.access.allowance).toMatchObject({ homepagesLeft: 0, homepagesTotal: 1 });
    expect(s.access.signIn).toBe(`/login?next=${encodeURIComponent(`/sites/${id}`)}`);
    expect(Date.parse(s.access.expiresAt!) - Date.parse(site.created_at)).toBe(config.tiers.anonymous.keepDays * 86400_000);
    expect((await req(`/preview/${id}/index.html`, { headers: { cookie: b.cookie } })).status).toBe(200);
    const patch = await req(`/api/sites/${id}/patch`, { method: "POST", headers: json(b.cookie), body: JSON.stringify({ ops: [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "X" }] }) });
    expect(patch.status).toBe(401);
    expect(await patch.json()).toMatchObject({ code: "sign_in_required", signIn: `/login?next=${encodeURIComponent(`/sites/${id}`)}` });
    expect((await chat(b, id)).status).toBe(401);
    expect(((await (await regenerate(b, id)).json()) as { code: string }).code).toBe("anonymous_used");
    // Another browser can't see it.
    const other = await newBrowser(req);
    expect((await req(`/api/sites/${id}`, { headers: { cookie: other.cookie } })).status).toBe(401);

    // Refused at the ticket, before any file is sent (the page keeps the text: limits-browser.test.ts).
    const second = await intake(req, b, { description: `${DESCRIPTION} Druga.` });
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: "anonymous_used", message: expect.stringContaining("Brezplačni predogled brez prijave ste že naredili."), signIn: "/login?next=%2F%23zacni" });
    // The landing page links the preview it already made.
    expect(await (await req("/", { headers: { cookie: b.cookie } })).text()).toContain(`href="/sites/${id}"`);
    expect(sent).toHaveLength(0);
  });

  it("gives one preview to ten simultaneous requests from one device", async () => {
    const b = await newBrowser(req);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => intake(req, b, { description: `${DESCRIPTION} ${i}` })));
    expect(results.filter((r) => r.status === 303)).toHaveLength(1);
    // The rest: refused at the ticket (the preview is taken), or their ticket was ended by a newer one.
    for (const r of results.filter((x) => x.status !== 303)) expect([403, 429]).toContain(r.status);
    await runQueued();
  });

  describe("uploads without an account", () => {
    it("are refused before any of the body is read when there is no valid ticket", async () => {
      const b = await newBrowser(req);
      for (const path of ["/api/sites", "/api/sites?ticket=forged.ticket"]) {
        const body = trackedBody(30_000_000);
        const res = await streamed(req, path, b, body.stream, { "x-forwarded-for": freshIp() });
        expect(res.status, path).toBe(403);
        expect(await res.text()).toContain(path === "/api/sites" ? "vklopljen JavaScript" : "Obrazec je potekel");
        expect(body.pulled(), path).toBe(0);
      }
      expect(sent).toHaveLength(0);
    });

    it("refuse a declared size over the cap unread, and give the reserved job back", async () => {
      const b = await newBrowser(req);
      const ticket = ((await (await askTicket(req, b)).json()) as { ticket: string }).ticket;
      const body = trackedBody(1000);
      const res = await streamed(req, `/api/sites?ticket=${encodeURIComponent(ticket)}`, b, body.stream, { "content-length": String(config.tiers.anonymous.uploads.maxTotalBytes + 1) });
      expect(res.status).toBe(413);
      expect(await res.text()).toContain(`skupaj največ ${Math.floor(config.tiers.anonymous.uploads.maxTotalBytes / 1e6)} MB`);
      expect(body.pulled()).toBe(0);
      // The device's preview isn't used up.
      expect((await intake(req, b)).status).toBe(303);
      await runQueued();
    });

    it("cut off an undeclared body as it streams past the cap", async () => {
      const b = await newBrowser(req);
      const ticket = ((await (await askTicket(req, b)).json()) as { ticket: string }).ticket;
      const cap = config.tiers.anonymous.uploads.maxTotalBytes;
      const body = trackedBody(cap * 4);
      const res = await streamed(req, `/api/sites?ticket=${encodeURIComponent(ticket)}`, b, body.stream);
      expect(res.status).toBe(413);
      // Read up to the cap (and the chunk that crossed it), not the 100 MB sent.
      expect(body.pulled()).toBeGreaterThan(cap);
      expect(body.pulled()).toBeLessThanOrEqual(cap + 2 * 64 * 1024);
      expect((await intake(req, b)).status).toBe(303);
      await runQueued();
    });

    it("refuse more photos, or a bigger file, than an upload without an account may hold", async () => {
      const u = config.tiers.anonymous.uploads;
      const photo = (bytes: number, i: number) => new File([new Uint8Array(bytes)], `p${i}.jpg`, { type: "image/jpeg" });
      const b = await newBrowser(req);
      const many = await intake(req, b, { photos: Array.from({ length: u.maxPhotos + 1 }, (_, i) => photo(1000, i)) });
      expect(many.status).toBe(400);
      expect(await many.text()).toContain(`Največ ${u.maxPhotos} fotografij brez prijave.`);
      const big = await intake(req, b, { photos: [photo(u.maxFileBytes + 1, 0)] });
      expect(big.status).toBe(400);
      expect(await big.text()).toContain(`(največ ${Math.floor(u.maxFileBytes / 1e6)} MB)`);
      // Neither used up the preview.
      expect((await intake(req, b)).status).toBe(303);
      await runQueued();
    });

    it("take a ticket once, only on the device it was issued to, and only for the text it checked", async () => {
      const b = await newBrowser(req);
      const ticket = ((await (await askTicket(req, b)).json()) as { ticket: string }).ticket;
      const post = (who: Browser, description = DESCRIPTION) => {
        const form = new FormData();
        form.set("_csrf", who.csrf);
        form.set("description", description);
        return req(`/api/sites?ticket=${encodeURIComponent(ticket)}`, { method: "POST", body: form, headers: { cookie: who.cookie } });
      };
      expect((await post(await newBrowser(req))).status).toBe(403);
      const swapped = await post(b, `${DESCRIPTION} In še nekaj drugega.`);
      expect(swapped.status).toBe(403);
      expect(await swapped.text()).toContain("Opis se je spremenil");
      // That refusal gave the job back; a fresh ticket works once.
      const fresh = ((await (await askTicket(req, b)).json()) as { ticket: string }).ticket;
      const once = (t: string) => {
        const form = new FormData();
        form.set("_csrf", b.csrf);
        form.set("description", DESCRIPTION);
        return req(`/api/sites?ticket=${encodeURIComponent(t)}`, { method: "POST", body: form, headers: { cookie: b.cookie } });
      };
      expect((await once(fresh)).status).toBe(303);
      expect((await once(fresh)).status).toBe(403);
      await runQueued();
    });
  });

  it("allows only a few previews a day from one network (keyed IP hash, never the IP)", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < config.tiers.perIpGenerationsPerDay; i++) expect((await intake(req, await newBrowser(req), { ip })).status).toBe(303);
    const refused = await intake(req, await newBrowser(req), { ip });
    expect(refused.status).toBe(429);
    expect(await refused.text()).toContain("Iz tega omrežja je bilo danes narejenih že veliko predogledov.");
    const { rows } = await platform.db.query<{ ip_key: string }>("select ip_key from ai_jobs where ip_key <> ''");
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(ip);
    await runQueued();
  });
});

describe("bot check (Turnstile)", () => {
  it("refuses without a token and with a token Cloudflare rejects; keeps the text", async () => {
    const missing = await intake(req, await newBrowser(req), { token: null });
    expect(missing.status).toBe(403);
    expect(await missing.text()).toContain("Preverjanje, da niste robot, ni uspelo.");
    const failing = makeApp(turnstile({ siteKey: "2x00000000000000000000AB", secretKey: FAIL_SECRET, fetch: siteverify }));
    const freq: Req = (p, init) => failing.request(p, init);
    expect((await intake(freq, await newBrowser(freq))).status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it("is skipped in development without keys, and refuses previews without an account when deployed without keys", async () => {
    const dev = makeApp({ mode: "skip", siteKey: null, verify: async () => true });
    const dreq: Req = (p, init) => dev.request(p, init);
    const devPage = await dreq("/");
    expect(await devPage.text()).not.toContain("cf-turnstile");
    expect(devPage.headers.get("content-security-policy")).not.toContain("challenges.cloudflare.com");
    expect((await intake(dreq, await newBrowser(dreq), { token: null })).status).toBe(303);
    await runQueued();

    const deployed = makeApp({ mode: "unavailable", siteKey: null, verify: async () => false });
    const preq: Req = (p, init) => deployed.request(p, init);
    expect(await (await preq("/")).text()).toContain("Predogled brez prijave trenutno ni na voljo.");
    const refused = await intake(preq, await newBrowser(preq), { token: null });
    expect(refused.status).toBe(503);
    // Signed-in owners aren't affected.
    const owner = await ownerSignIn(preq, mail.sent, "brez-kljuca@siol.net");
    expect((await intake(preq, owner, { token: null })).status).toBe(303);
    await runQueued();
  });
});

describe("junk intake", () => {
  it("refuses short descriptions and ones the classifier can't place, before any Sonnet call; neither uses up the preview", async () => {
    const b = await newBrowser(req);
    const short = await intake(req, b, { description: "Pekarna v Kamniku, kruh." });
    expect(short.status).toBe(400);
    expect(await short.text()).toContain(`Opis naj ima vsaj ${config.tiers.junk.minDescriptionChars} znakov`);
    const junk = await intake(req, b, { description: "asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf" });
    expect(junk.status).toBe(400);
    expect(await junk.text()).toContain("Iz opisa ne znamo razbrati, kakšno podjetje imate.");
    expect(sent).toHaveLength(0);
    // The classifier's cost is logged against the refused job, in the anonymous pool.
    const { rows } = await platform.db.query<{ status: string; cost: string | number; tier: string }>(
      "select j.status, m.cost_eur as cost, m.tier from ai_jobs j join model_calls m on m.ai_job_id = j.id where j.device_id is not null order by j.id desc limit 1",
    );
    expect(rows[0]).toMatchObject({ status: "refused", tier: "anonymous" });
    expect(Number(rows[0]!.cost)).toBeCloseTo(0.0006, 6);
    // Still one preview left on this device.
    expect((await intake(req, b)).status).toBe(303);
    await runQueued();
  });

  it("goes ahead when the classifier can't be asked (the pipeline asks again)", async () => {
    const res = await intake(req, await newBrowser(req), { description: `${DESCRIPTION} kaboom` });
    expect(res.status).toBe(303);
    expect((await platform.repo.getSite(siteOf(res)))!.intake.classification).toBeUndefined();
    await runQueued();
  });
});

describe("free account", () => {
  it("claims the anonymous preview on sign-up, then gets 2 homepages and 10 chat edits in total", async () => {
    const b = await newBrowser(req);
    const made = await intake(req, b);
    const preview = siteOf(made);
    await runQueued();

    const owner = await ownerSignIn(req, mail.sent, "nova.lastnica@siol.net", b);
    const site = (await platform.repo.getSite(preview))!;
    const account = (await platform.repo.accounts.byKey("nova.lastnica@siol.net"))!;
    expect(site.account_id).toBe(account.id);
    expect(site.device_id).toBeNull();
    const list = await (await req("/sites", { headers: { cookie: owner.cookie } })).text();
    expect(list).toContain(`href="/sites/${preview}"`);
    // The claimed preview doesn't use one of the two.
    expect(list).toContain("Še 2 brezplačni ustvarjanji domače strani in 10 sprememb s pomočnikom.");
    const s = await state(owner, preview);
    expect(s.access).toMatchObject({ viewer: "free", expiresAt: null, signIn: null, can: { edit: true, chat: true, regenerate: true, publish: false, fullSite: false } });
    expect(s.access.allowance).toMatchObject({ homepagesLeft: 2, homepagesTotal: 2, chatEditsLeft: 10, chatEditsTotal: 10 });

    // A whole site isn't a free right; the homepage twice is.
    expect((await intake(req, owner, { scope: "full" })).status).toBe(403);
    expect((await intake(req, owner)).status).toBe(303);
    expect((await regenerate(owner, preview)).status).toBe(200);
    await runQueued();
    const third = await intake(req, owner);
    expect(third.status).toBe(429);
    expect(await third.text()).toContain("Porabili ste 2 brezplačni ustvarjanji domače strani.");
    const again = await regenerate(owner, preview);
    expect(await again.json()).toMatchObject({ code: "free_homepages_used" });

    for (let i = 0; i < config.tiers.free.chatEdits; i++) expect((await chat(owner, preview)).status, `edit ${i + 1}`).toBe(200);
    const eleventh = await chat(owner, preview);
    expect(eleventh.status).toBe(429);
    expect(await eleventh.json()).toMatchObject({ code: "free_edits_used", message: "Porabili ste vseh 10 sprememb s pomočnikom. Stran lahko še naprej urejate neposredno." });
    // A failed edit doesn't count.
    const edits = sent.filter((j) => j.name === "edit");
    await platform.repo.usage.finishJob((edits[0]!.data as { aiJobId: string }).aiJobId, "failed");
    expect((await chat(owner, preview)).status).toBe(200);
    await runQueued(0.01);
    const after = await state(owner, preview);
    expect(after.access.can).toMatchObject({ chat: false, regenerate: false, edit: true });
    expect(after.access.allowance.text).toBe("Brezplačna ustvarjanja in spremembe s pomočnikom ste porabili. Stran lahko še naprej urejate neposredno.");
    // Editing directly is never limited.
    const patch = await req(`/api/sites/${preview}/patch`, { method: "POST", headers: json(owner.cookie), body: JSON.stringify({ ops: [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Kruh z drožmi iz Kamnika" }] }) });
    expect(patch.status).toBe(200);
  });
});

describe("paid (allow-listed) monthly allowance", () => {
  it("is a share of the monthly price plus a first-month extra, counted from the logged €, and renews monthly", async () => {
    const t = config.tiers;
    const monthly = (config.plans.paid.monthlyEur * t.paid.allowancePercentOfMonthlyPrice) / 100;
    const since = new Date("2026-01-31T10:00:00Z");
    expect(allowancePeriod(since, new Date("2026-02-15T00:00:00Z"))).toMatchObject({ first: true, start: since, end: new Date("2026-02-28T10:00:00Z") });
    expect(allowancePeriod(since, new Date("2026-03-01T00:00:00Z"))).toMatchObject({ first: false, start: new Date("2026-02-28T10:00:00Z"), end: new Date("2026-03-31T10:00:00Z") });
    expect(monthlyAllowance(config, since, new Date("2026-02-01T00:00:00Z")).eur).toBeCloseTo(monthly + t.paid.firstMonthExtraEur, 6);
    expect(monthlyAllowance(config, since, new Date("2026-05-01T00:00:00Z")).eur).toBeCloseTo(monthly, 6);

    await platform.repo.accounts.allow("partner@siol.net", "partner@siol.net", null);
    const owner = await ownerSignIn(req, mail.sent, "partner@siol.net");
    const made = await intake(req, owner, { scope: "full" });
    expect(made.status).toBe(303);
    const id = siteOf(made);
    expect(await platform.repo.usage.getJob((sent.at(-1)!.data as { aiJobId: string }).aiJobId)).toMatchObject({ tier: "paid", estimate_eur: t.estimatesEur.fullSite });
    // Spend almost all of this month's allowance (first month: share + extra).
    await runQueued(monthly + t.paid.firstMonthExtraEur - 0.02);
    const s = await state(owner, id);
    expect(s.access.viewer).toBe("paid");
    expect(s.access.allowance.eurTotal).toBeCloseTo(monthly + t.paid.firstMonthExtraEur, 6);
    expect(s.access.can.chat).toBe(false);
    const refused = await chat(owner, id);
    expect(refused.status).toBe(429);
    const body = (await refused.json()) as { code: string; message: string };
    expect(body.code).toBe("allowance_used");
    expect(body.message).toMatch(/^Pomočnik je ta mesec porabil vse, kar vključuje naročnina\. Stran lahko še naprej urejate neposredno; pomočnik spet deluje \d+\. \d+\. \d{4}\.$/);

    // A month later the allowance is new (without the first month's extra) and last month's spend is gone.
    const account = (await platform.repo.accounts.byKey("partner@siol.net"))!;
    await platform.db.query("update allow_list set added_at = now() - interval '40 days' where email_key = 'partner@siol.net'");
    await platform.db.query("update model_calls set created_at = now() - interval '35 days' where account_id = $1", [account.id]);
    const next = await state(owner, id);
    expect(next.access.allowance.eurTotal).toBeCloseTo(monthly, 6);
    expect(next.access.allowance.text).toMatch(/^Pomočnik ta mesec še za približno 3 ustvarjanja celotne strani ali 50 sprememb s pomočnikom \(obnovi se /);
    expect((await chat(owner, id)).status).toBe(200);
    await runQueued(0.01);
  });
});

describe("spending pools", () => {
  it("an empty free pool never blocks paid jobs; the admin can pause a pool", async () => {
    const admin = await adminBrowser(req, PASSWORD);
    await platform.repo.accounts.allow("narocnik@siol.net", "narocnik@siol.net", null);
    const paid = await ownerSignIn(req, mail.sent, "narocnik@siol.net");
    const paidSite = siteOf(await intake(req, paid));
    const free = await ownerSignIn(req, mail.sent, "brezplacni@siol.net");
    const freeSite = siteOf(await intake(req, free));
    await runQueued(0.05);

    // Hold both free pools (the admin's "Ustavi za 24 h"), as the deployed smoke test does.
    for (const pool of ["anonymous", "free"]) {
      const held = await req("/admin/pools/hold", { method: "POST", headers: { cookie: admin.cookie }, body: new URLSearchParams({ pool, hours: "1", _csrf: admin.csrf }) });
      expect(held.status).toBe(200);
    }
    const adminPage = await (await req("/admin", { headers: { cookie: admin.cookie } })).text();
    expect(adminPage).toContain("Spet zaženi");

    const anon = await intake(req, await newBrowser(req));
    expect(anon.status).toBe(429);
    expect(await anon.text()).toContain("Današnji brezplačni predogledi brez prijave so porabljeni.");
    const freeChat = await chat(free, freeSite);
    expect(await freeChat.json()).toMatchObject({ code: "pool_empty" });
    // Paid work still runs.
    expect((await chat(paid, paidSite)).status).toBe(200);
    expect((await intake(req, paid)).status).toBe(303);
    await runQueued(0.01);

    for (const pool of ["anonymous", "free"]) await req("/admin/pools/release", { method: "POST", headers: { cookie: admin.cookie }, body: new URLSearchParams({ pool, _csrf: admin.csrf }) });
    expect((await chat(free, freeSite)).status).toBe(200);
    await runQueued(0.01);
  });

  it("counts real spend per tier: a pool full of logged anonymous calls refuses previews only", async () => {
    const size = config.tiers.pools.anonymous * config.limits.dailyModelSpendCapEur;
    await platform.repo.logModelCall({ siteId: null, jobId: null, stage: "content", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: size, durationMs: 0, ok: true, tier: "anonymous" });
    const res = await intake(req, await newBrowser(req));
    expect(res.status).toBe(429);
    const free = await ownerSignIn(req, mail.sent, "se-en-brezplacni@siol.net");
    expect((await intake(req, free)).status).toBe(303);
    await runQueued(0.01);
    await platform.db.query("delete from model_calls where cost_eur = $1 and tier = 'anonymous'", [size]);
  });

  it("holds each job's estimate until its calls are logged, then counts what it really cost", async () => {
    const b = await newBrowser(req);
    await intake(req, b);
    const aiJobId = (sent.at(-1)!.data as { aiJobId: string }).aiJobId;
    const before = await platform.repo.usage.pool("anonymous");
    expect(before.held).toBeCloseTo(config.tiers.estimatesEur.homepage - 0.0006, 6);
    await runQueued(0.11);
    const after = await platform.repo.usage.pool("anonymous");
    expect(after.held).toBe(0);
    expect(await platform.repo.usage.jobCost(aiJobId)).toBeCloseTo(0.1106, 6);
  });
});

describe("privacy policy", () => {
  it("says what is stored, the IP hash, the cookies and Turnstile", async () => {
    const page = await (await req("/zasebnost")).text();
    for (const s of ["zgoščeni zapis", "po enem dnevu izbrišemo", "Cloudflare Turnstile", "sb_device", "sb_account", `po ${config.tiers.anonymous.keepDays} dneh`]) expect(page, s).toContain(s);
    expect(csrfIn(page)).toBe("");
  });
});
