import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp, type ClassifyIntake } from "../src/app.ts";
import { allowancePeriod, monthlyAllowance, previewBadge } from "../src/limits.ts";
import { SITEVERIFY_URL, turnstile, type BotCheck } from "../src/turnstile.ts";
import { adminBrowser, csrfIn, linkFor, newBrowser, ownerSignIn, setCookies, type Browser, type Req } from "./session-helpers.ts";

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
// The junk check is off in production config (owner, 2026-10-01); the mechanism is still tested at these values.
config.tiers.junk = { minDescriptionChars: 40, minClassifierConfidence: 0.5 };
config.limits.dailyModelSpendCapEur = 100;
// A small per-account cap on photo descriptions, so the loop below stays short; the mechanism is config's.
config.tiers.altText.photosPerDay = { free: 3, paid: 5 };
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
    access: { viewer: string; can: Record<string, boolean>; allowance: Record<string, unknown> & { text: string }; expiresAt: string | null; signIn: string | null; badge: string | null };
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

describe("free-preview badge (sb-preview-watermark)", () => {
  it("only free tiers' unpublished previews get it, config switches it, and the site's HTML never carries it", async () => {
    const draft = { published_version: null };
    expect(previewBadge(config, "anonymous", draft)).toBe("Predogled · Stranko");
    expect(previewBadge(config, "free", draft)).toBe("Predogled · Stranko");
    expect(previewBadge(config, "paid", draft)).toBeNull();
    expect(previewBadge(config, "admin", draft)).toBeNull();
    expect(previewBadge(config, "free", { published_version: 3 })).toBeNull();
    const off = structuredClone(config);
    off.plans.freePreview.watermark = "off";
    expect(previewBadge(off, "anonymous", draft)).toBeNull();
    expect(loadConfig().plans.freePreview.watermark).toBe("app-badge");

    // An anonymous preview: the editor's state says so; the preview HTML (= published output) doesn't.
    const b = await newBrowser(req);
    const id = siteOf(await intake(req, b));
    await runQueued();
    expect((await state(b, id)).access.badge).toBe("Predogled · Stranko");
    const html = await (await req(`/preview/${id}/index.html`, { headers: { cookie: b.cookie } })).text();
    expect(html).toContain("<html");
    expect(html).not.toContain("Predogled · Stranko");
    expect(html).not.toContain("preview-badge");
    // The admin sees the same preview without it.
    const admin = await adminBrowser(req, PASSWORD);
    expect((await state(admin, id)).access.badge).toBeNull();
  });
});

describe("free account", () => {
  it("a magic link claims the previews of the device that asked for it, never those of the device that opens it", async () => {
    // Device A (the attacker, or the owner's laptop) and device B (the victim, or the owner's phone) each made a preview.
    const a = await newBrowser(req);
    const b = await newBrowser(req);
    const fromA = siteOf(await intake(req, a));
    const fromB = siteOf(await intake(req, b));
    await runQueued();
    const deviceB = (await platform.repo.getSite(fromB))!.device_id;
    expect(deviceB).toBeTruthy();

    // A asks for a link; B opens it and presses "Prijava".
    const email = "napadalec.a@siol.net";
    const asked = await req("/login/email", { method: "POST", body: new URLSearchParams({ email, _csrf: a.csrf, next: "/sites" }), headers: { cookie: a.cookie, "x-forwarded-for": freshIp() } });
    expect(asked.status).toBe(200);
    const url = new URL(linkFor(mail.sent, email));
    const page = await req(`${url.pathname}${url.search}`, { headers: { cookie: b.cookie } });
    expect(page.status).toBe(200);
    const done = await req("/login/link", { method: "POST", body: new URLSearchParams({ t: url.searchParams.get("t")!, _csrf: csrfIn(await page.text()) }), headers: { cookie: b.cookie }, redirect: "manual" });
    expect(done.status).toBe(303);

    const account = (await platform.repo.accounts.byKey(email))!;
    expect((await platform.repo.getSite(fromA))!.account_id).toBe(account.id);
    // B's preview stays B's: unclaimed, still tied to B's device, not in the account's list.
    const stillB = (await platform.repo.getSite(fromB))!;
    expect(stillB.account_id).toBeNull();
    expect(stillB.device_id).toBe(deviceB);
    const session = setCookies(done).sb_account!;
    const list = await (await req("/sites", { headers: { cookie: `${b.cookie}; sb_account=${session}` } })).text();
    expect(list).toContain(`href="/sites/${fromA}"`);
    expect(list).not.toContain(`href="/sites/${fromB}"`);
  });

  it("claims the anonymous preview on sign-up, then gets 1 homepage and 5 chat edits in total", async () => {
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
    // The claimed preview doesn't use up the one more.
    expect(list).toContain("Še 1 brezplačno ustvarjanje domače strani in 5 sprememb s pomočnikom.");
    const s = await state(owner, preview);
    expect(s.access).toMatchObject({ viewer: "free", expiresAt: null, signIn: null, badge: "Predogled · Stranko", can: { edit: true, chat: true, regenerate: true, publish: false, fullSite: false } });
    expect(s.access.allowance).toMatchObject({ homepagesLeft: 1, homepagesTotal: 1, chatEditsLeft: 5, chatEditsTotal: 5 });

    // A whole site isn't a free right; one more homepage is.
    expect((await intake(req, owner, { scope: "full" })).status).toBe(403);
    expect((await intake(req, owner)).status).toBe(303);
    await runQueued();
    const third = await intake(req, owner);
    expect(third.status).toBe(429);
    // The refusal names the plan that adds what's missing (sb-tiers upsell).
    expect(await third.text()).toContain("Porabili ste 1 brezplačno ustvarjanje domače strani. Stran lahko še naprej urejate neposredno. Z naročnino Osnovni (15 € na mesec) dobite celotno stran, objavo na svoji domeni in pomočnika vsak mesec.");
    const again = await regenerate(owner, preview);
    expect(await again.json()).toMatchObject({ code: "free_homepages_used" });

    for (let i = 0; i < config.tiers.free.chatEdits; i++) expect((await chat(owner, preview)).status, `edit ${i + 1}`).toBe(200);
    const oneMore = await chat(owner, preview);
    expect(oneMore.status).toBe(429);
    expect(await oneMore.json()).toMatchObject({
      code: "free_edits_used",
      message: "Porabili ste vseh 5 sprememb s pomočnikom. Stran lahko še naprej urejate neposredno. Z naročnino Osnovni (15 € na mesec) dobite celotno stran, objavo na svoji domeni in pomočnika vsak mesec.",
    });
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

  it("never costs more than its lifetime €, the claimed anonymous preview included, whatever the counts say (sb-tiers)", async () => {
    const b = await newBrowser(req);
    const preview = siteOf(await intake(req, b));
    // An expensive preview: it leaves less than one chat edit's estimate of the free lifetime €.
    await runQueued(config.tiers.free.lifetimeEur - config.tiers.estimatesEur.chatEdit / 2);
    const owner = await ownerSignIn(req, mail.sent, "draga.predogled@siol.net", b);
    const s = await state(owner, preview);
    expect(s.access.allowance.chatEditsLeft).toBe(config.tiers.free.chatEdits);
    const refused = await chat(owner, preview);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "free_budget_used", message: expect.stringContaining("Brezplačni del pomočnika je porabljen. Stran lahko še naprej urejate neposredno. Z naročnino Osnovni") });
    // The homepage it still has by count is refused too.
    expect(await (await regenerate(owner, preview)).json()).toMatchObject({ code: "free_budget_used" });
  });
});

describe("paid (allow-listed) monthly allowance", () => {
  it("is the plan's monthly allowance plus a first-month extra, counted from the logged €, and renews monthly", async () => {
    const t = config.tiers;
    const ai = config.plans.standard.ai;
    const monthly = ai.allowanceEurPerMonth;
    const since = new Date("2026-01-31T10:00:00Z");
    expect(allowancePeriod(since, new Date("2026-02-15T00:00:00Z"))).toMatchObject({ first: true, start: since, end: new Date("2026-02-28T10:00:00Z") });
    expect(allowancePeriod(since, new Date("2026-03-01T00:00:00Z"))).toMatchObject({ first: false, start: new Date("2026-02-28T10:00:00Z"), end: new Date("2026-03-31T10:00:00Z") });
    expect(monthlyAllowance(config, "standard", since, new Date("2026-02-01T00:00:00Z")).eur).toBeCloseTo(monthly + ai.firstMonthExtraEur, 6);
    expect(monthlyAllowance(config, "standard", since, new Date("2026-05-01T00:00:00Z")).eur).toBeCloseTo(monthly, 6);
    expect(monthlyAllowance(config, "premium", since, new Date("2026-05-01T00:00:00Z")).eur).toBeCloseTo(config.plans.premium.ai.allowanceEurPerMonth, 6);

    await platform.repo.accounts.allow("partner@siol.net", "partner@siol.net", null);
    const owner = await ownerSignIn(req, mail.sent, "partner@siol.net");
    const made = await intake(req, owner, { scope: "full" });
    expect(made.status).toBe(303);
    const id = siteOf(made);
    expect(await platform.repo.usage.getJob((sent.at(-1)!.data as { aiJobId: string }).aiJobId)).toMatchObject({ tier: "paid", estimate_eur: t.estimatesEur.fullSite });
    // Spend almost all of this month's allowance (first month: share + extra).
    await runQueued(monthly + ai.firstMonthExtraEur - 0.02);
    const s = await state(owner, id);
    expect(s.access.viewer).toBe("paid");
    expect(s.access.allowance.eurTotal).toBeCloseTo(monthly + ai.firstMonthExtraEur, 6);
    expect(s.access.can.chat).toBe(false);
    const refused = await chat(owner, id);
    expect(refused.status).toBe(429);
    const body = (await refused.json()) as { code: string; message: string };
    expect(body.code).toBe("allowance_used");
    expect(body.message).toMatch(/^Pomočnik je ta mesec porabil vse, kar vključuje naročnina\. Stran lahko še naprej urejate neposredno; pomočnik spet deluje \d+\. \d+\. \d{4}\. Paket Plus \(29 € na mesec\) vključuje več pomoči vsak mesec\.$/);

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

  it("follows the account's plan: Plus has the bigger allowance and nothing more to upsell", async () => {
    await platform.repo.accounts.allow("plus@siol.net", "plus@siol.net", null, "premium");
    const owner = await ownerSignIn(req, mail.sent, "plus@siol.net");
    const id = siteOf(await intake(req, owner, { scope: "full" }));
    const ai = config.plans.premium.ai;
    expect((await state(owner, id)).access.allowance.eurTotal).toBeCloseTo(ai.allowanceEurPerMonth + ai.firstMonthExtraEur, 6);
    await runQueued(ai.allowanceEurPerMonth + ai.firstMonthExtraEur - 0.02);
    const body = (await (await chat(owner, id)).json()) as { code: string; message: string };
    expect(body.code).toBe("allowance_used");
    expect(body.message).not.toContain("Paket Plus");
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

describe("photo descriptions (alt jobs)", () => {
  type PhotoAnswer = { ok: boolean; added: string[]; altRefused?: { code: string; message: string } };
  let jpeg: Uint8Array;
  /** "Zamenjaj" in the editor: the site's first picture replaced by an owner's photo. */
  const replacePhoto = async (b: Browser, siteId: string): Promise<PhotoAnswer> => {
    jpeg ??= await readFile(path.join(here, "../../../tools/eval/fixtures/pekarna-kvas/photos/03.jpg"));
    const current = (await platform.repo.getSpec(siteId))!;
    const form = new FormData();
    form.append("photos", new Blob([jpeg as BlobPart], { type: "image/jpeg" }), "pec.jpg");
    form.set("replace", current.spec.assets.images[0]!.id);
    form.set("baseVersion", String(current.version));
    const res = await req(`/api/sites/${siteId}/photos`, { method: "POST", body: form, headers: { cookie: b.cookie } });
    expect(res.status).toBe(200);
    return (await res.json()) as PhotoAnswer;
  };
  const altJobs = () => sent.filter((j) => j.name === "alt");

  it("a free account replacing photos in a loop stops at its cap; the photos still change, and other tiers keep working", async () => {
    const t = config.tiers;
    const free = await ownerSignIn(req, mail.sent, "fotografinja@siol.net");
    const freeSite = siteOf(await intake(req, free));
    await platform.repo.accounts.allow("fotostudio@siol.net", "fotostudio@siol.net", null);
    const paid = await ownerSignIn(req, mail.sent, "fotostudio@siol.net");
    const paidSite = siteOf(await intake(req, paid));
    await runQueued(0.05);
    const freeBefore = (await platform.repo.usage.pool("free")).spent;

    for (let i = 0; i < t.altText.photosPerDay.free; i++) {
      const r = await replacePhoto(free, freeSite);
      expect(r.altRefused, `photo ${i + 1}`).toBeUndefined();
      const job = altJobs().at(-1)!.data as { imageIds: string[]; aiJobId: string };
      expect(job.imageIds).toEqual(r.added);
      // Each one holds its estimate under the free pool until its call is logged.
      expect(await platform.repo.usage.getJob(job.aiJobId)).toMatchObject({ kind: "alt", tier: "free", pool: "free", units: 1, estimate_eur: t.estimatesEur.altTextPerPhoto, status: "queued" });
      expect((await platform.repo.getSite(freeSite))!.status).toBe("editing");
      await runQueued(0.002);
    }
    // Their calls count in the free pool.
    expect((await platform.repo.usage.pool("free")).spent - freeBefore).toBeCloseTo(0.002 * t.altText.photosPerDay.free, 6);

    // Over the cap: the photo is still replaced (direct editing), only the description isn't written.
    const queuedBefore = sent.length;
    const over = await replacePhoto(free, freeSite);
    expect(over.added).toHaveLength(1);
    expect(over.altRefused).toEqual({
      code: "alt_limit",
      message: "Fotografija je dodana, opisa pa ne napišemo samodejno: danes ste porabili vse samodejne opise fotografij. Opis napišite sami pri fotografiji; brez njega strani ni mogoče objaviti.",
    });
    expect(sent.length).toBe(queuedBefore);
    expect((await platform.repo.getSpec(freeSite))!.spec.assets.images.map((i) => i.id)).toContain(over.added[0]);
    expect((await platform.repo.getSite(freeSite))!.status).toBe("ready");
    // Writing the description is direct editing: never limited.
    const images = (await platform.repo.getSpec(freeSite))!.spec.assets.images;
    const k = images.findIndex((i) => i.id === over.added[0]);
    const described = await req(`/api/sites/${freeSite}/patch`, { method: "POST", headers: json(free.cookie), body: JSON.stringify({ ops: [{ op: "replace", path: `/assets/images/${k}/alt`, value: "Hlebci kruha na polici" }] }) });
    expect(described.status).toBe(200);
    // The same account's chat edits are a separate allowance.
    expect((await chat(free, freeSite)).status).toBe(200);
    await runQueued(0.01);

    // Another free account and a paid account still get their descriptions.
    const other = await ownerSignIn(req, mail.sent, "druga.fotografinja@siol.net");
    const otherSite = siteOf(await intake(req, other));
    await runQueued(0.05);
    expect((await replacePhoto(other, otherSite)).altRefused).toBeUndefined();
    expect((await replacePhoto(paid, paidSite)).altRefused).toBeUndefined();
    expect((await platform.repo.usage.getJob((altJobs().at(-1)!.data as { aiJobId: string }).aiJobId))!.tier).toBe("paid");
    await runQueued(0.002);

    // The cap is per 24 hours.
    await platform.db.query("update ai_jobs set created_at = now() - interval '25 hours' where kind = 'alt' and account_id = (select id from accounts where email_key = 'fotografinja@siol.net')");
    expect((await replacePhoto(free, freeSite)).altRefused).toBeUndefined();
    await runQueued(0.002);
    // Every replace makes the photo's variants (sharp): slow on a busy machine.
  }, 180_000);

  it("an empty free pool stops free accounts' descriptions, never paid ones; queued failures don't count", async () => {
    const free = await ownerSignIn(req, mail.sent, "bazen@siol.net");
    const freeSite = siteOf(await intake(req, free));
    await platform.repo.accounts.allow("bazen.placnik@siol.net", "bazen.placnik@siol.net", null);
    const paid = await ownerSignIn(req, mail.sent, "bazen.placnik@siol.net");
    const paidSite = siteOf(await intake(req, paid));
    await runQueued(0.05);

    await platform.repo.usage.hold("free", config.tiers.pools.free * config.limits.dailyModelSpendCapEur, 60);
    expect((await replacePhoto(free, freeSite)).altRefused).toMatchObject({ code: "pool_empty", message: expect.stringMatching(/^Fotografija je dodana, opisa pa ne napišemo samodejno: današnja omejitev porabe pomočnika je dosežena\./) });
    expect((await replacePhoto(paid, paidSite)).altRefused).toBeUndefined();
    await runQueued(0.002);
    await platform.repo.usage.releaseHolds("free");

    // A description job that failed (no model, an error) doesn't use up the cap.
    for (let i = 0; i < config.tiers.altText.photosPerDay.free + 1; i++) {
      expect((await replacePhoto(free, freeSite)).altRefused, `photo ${i + 1}`).toBeUndefined();
      for (const job of sent.splice(0)) await platform.repo.usage.finishJob((job.data as { aiJobId: string }).aiJobId, "failed");
      await platform.repo.setStatus(freeSite, "ready");
    }
  }, 180_000);
});

describe("privacy policy", () => {
  it("says what is stored, the IP hash, the cookies and Turnstile", async () => {
    const page = await (await req("/zasebnost")).text();
    for (const s of ["zgoščeni zapis", "po enem dnevu izbrišemo", "Cloudflare Turnstile", "sb_device", "sb_account", `po ${config.tiers.anonymous.keepDays} dneh`]) expect(page, s).toContain(s);
    expect(csrfIn(page)).toBe("");
  });
});
