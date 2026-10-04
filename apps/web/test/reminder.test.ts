import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type MailMessage, type Mailer, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { reminderMail, reminderToken, sendPreviewReminders } from "../src/reminder.tsx";
import { newBrowser, ownerSignIn, type Browser, type Req } from "./session-helpers.ts";

/**
 * The day-5 email before an anonymous preview is deleted (it-upsells): the visitor leaves an address on the preview,
 * one email goes to it `tiers.anonymous.reminder.daysBefore` days before the 7-day deletion (never earlier, never
 * twice, never after), worded in Slovene with the first plan's price, and its link keeps the preview once the
 * visitor signs in with that address, on any device. The mailer is the in-memory fake: nothing is sent.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const SECRET = "s".repeat(32);
const config = loadConfig();
const mail = memoryMailer();
let platform: Platform;
let dir: string;
let req: Req;
let golden: SiteSpec;
const keep = config.tiers.anonymous.keepDays;
const before = config.tiers.anonymous.reminder.daysBefore;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-reminder-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config, auth: { password: "test-password-1234", secret: SECRET, secureCookies: false }, mailer: mail, appUrl: "https://stranko.example" });
  req = (p, init) => app.request(p, init);
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const BRIEF = { pages: [{ kind: "home", slug: "", navLabel: "Domov" }, { kind: "standard", slug: "ponudba", navLabel: "Ponudba" }, { kind: "standard", slug: "kontakt", navLabel: "Kontakt" }] };
let seq = 0;
/** An anonymous preview made by this browser, `ageDays` old. */
async function preview(b: Browser, ageDays = 0): Promise<string> {
  const device = /sb_device=([0-9a-f]{32})\./.exec(b.cookie)![1]!;
  const slug = `opomnik-${++seq}`;
  const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "home" }, deviceId: device });
  await platform.repo.setBrief(s.id, BRIEF);
  await platform.repo.saveSpec(s.id, { ...golden, slug }, "generate");
  await platform.repo.setStatus(s.id, "ready");
  await platform.repo.usage.insertJob({ kind: "generate", scope: "home", tier: "anonymous", deviceId: device, siteId: s.id, estimateEur: 0.3 });
  if (ageDays) await platform.db.query("update sites set created_at = now() - make_interval(secs => $2::double precision) where id = $1", [s.id, ageDays * 86400]);
  return s.id;
}
const remind = (b: Browser, siteId: string, email: string) => req(`/api/sites/${siteId}/reminder`, { method: "POST", headers: { cookie: b.cookie, "content-type": "application/json" }, body: JSON.stringify({ email }) });
const send = (mailer: Mailer = mail, log?: (l: string) => void) => sendPreviewReminders({ repo: platform.repo, config, mailer, appUrl: "https://stranko.example", secret: SECRET, ...(log ? { log } : {}) });
const to = (address: string) => mail.sent.filter((m) => m.to === address);

describe("leaving an address on the preview", () => {
  it("takes a valid address from the device that made the preview, refuses others, and can be taken back", async () => {
    const b = await newBrowser(req);
    const id = await preview(b);
    const bad = await remind(b, id, "ni-naslov");
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { message: string }).message).toBe("Vpišite veljaven e-poštni naslov, na primer ime@podjetje.si.");
    expect((await remind(b, id, "x@mailinator.com")).status).toBe(400);
    expect((await remind(b, id, " Ana@Siol.net ")).status).toBe(200);
    const state = (await (await req(`/api/sites/${id}`, { headers: { cookie: b.cookie } })).json()) as { access: { reminder: { email: string; status: string; sendsAt: string } } };
    expect(state.access.reminder).toMatchObject({ email: "ana@siol.net", status: "pending" });
    const site = (await platform.repo.getSite(id))!;
    expect(Date.parse(state.access.reminder.sendsAt) - Date.parse(site.created_at)).toBe((keep - before) * 86400_000);
    // Another device can't set it (the preview isn't theirs).
    const other = await newBrowser(req);
    expect((await remind(other, id, "napadalec@siol.net")).status).toBe(401);
    expect((await platform.repo.getSite(id))!.reminder_email).toBe("ana@siol.net");
    // Taken back: nothing goes out.
    expect((await remind(b, id, "")).status).toBe(200);
    expect((await platform.repo.getSite(id))!.reminder).toBe("none");
  });
});

describe("sending (day 5 of 7)", () => {
  it("goes once, on the day it is due: not before, not twice, not after the preview is due for deletion", async () => {
    const b = await newBrowser(req);
    const early = await preview(b, keep - before - 0.1);
    const due = await preview(b, keep - before + 0.01);
    const late = await preview(b, keep + 0.01);
    await remind(b, early, "zgodaj@siol.net");
    await remind(b, due, "pravi@siol.net");
    await remind(b, late, "prepozno@siol.net");
    expect(await send()).toBe(1);
    expect(to("pravi@siol.net")).toHaveLength(1);
    expect(to("zgodaj@siol.net")).toHaveLength(0);
    expect(to("prepozno@siol.net")).toHaveLength(0);
    // Twice is never: the second pass finds nothing for it.
    expect(await send()).toBe(0);
    expect((await platform.repo.getSite(due))!.reminder).toBe("sent");
    // After it went, the address can't be changed into a second email.
    expect((await remind(b, due, "drugi@siol.net")).status).toBe(409);
  });

  it("retries a failed send, at most maxAttempts times", async () => {
    const b = await newBrowser(req);
    const id = await preview(b, keep - before + 0.01);
    await remind(b, id, "napaka@siol.net");
    const failing: Mailer = { kind: "memory", send: async () => Promise.reject(new Error("Resend 500")) };
    const lines: string[] = [];
    for (let i = 0; i < config.tiers.anonymous.reminder.maxAttempts + 2; i++) await send(failing, (l) => lines.push(l));
    expect(lines.filter((l) => l.includes(id))).toHaveLength(config.tiers.anonymous.reminder.maxAttempts);
    expect(lines.at(-1)).toContain("giving up");
    expect((await platform.repo.getSite(id))!.reminder).toBe("failed");
  });

  it("sends nothing without the app's public address (the link would be missing)", async () => {
    const b = await newBrowser(req);
    const id = await preview(b, keep - before + 0.01);
    await remind(b, id, "brez-naslova@siol.net");
    const lines: string[] = [];
    expect(await sendPreviewReminders({ repo: platform.repo, config, mailer: mail, secret: SECRET, log: (l) => lines.push(l) })).toBe(0);
    expect(lines[0]).toContain("no APP_URL");
    expect((await platform.repo.getSite(id))!.reminder).toBe("pending");
    await platform.db.query("update sites set reminder = 'none' where id = $1", [id]);
  });
});

describe("the email's wording", () => {
  it("says when the preview goes, how to keep it, and what Osnovni adds, in Slovene", () => {
    const m: MailMessage = reminderMail(config, {
      to: "ana@siol.net",
      siteId: "site_0123456789abcdef",
      siteName: "Pekarna Kvas",
      createdAt: "2026-10-01T08:00:00Z",
      deletesAt: "2026-10-08T08:00:00Z",
      lockedPages: ["Ponudba", "Kontakt"],
      url: "https://stranko.example/predogled/site_0123456789abcdef/abc",
    });
    expect(m.subject).toBe("Vaš predogled v Stranko izbrišemo čez 2 dneva");
    expect(m.idempotencyKey).toBe("preview-reminder-site_0123456789abcdef");
    expect(m.text).toBe(
      [
        "Pozdravljeni,",
        "",
        "predogled spletne strani Pekarna Kvas, ki ste ga naredili 1. 10. 2026, brez prijave hranimo 7 dni, zato ga izbrišemo 8. 10. 2026.",
        "",
        "Če ga želite obdržati, se prijavite s tem e-poštnim naslovom. Predogled ostane vaš, urejate ga naprej in z brezplačnim računom dobite še 1 domačo stran in 5 sprememb s pomočnikom.",
        "https://stranko.example/predogled/site_0123456789abcdef/abc",
        "",
        "Z naročnino Osnovni (15 € na mesec) naredimo celotno stran (Ponudba, Kontakt) in jo objavite na svoji domeni.",
        "",
        "To sporočilo smo poslali, ker ste ga zahtevali pri predogledu. Drugih ne pošiljamo, naslov pa izbrišemo skupaj s predogledom.",
      ].join("\n"),
    );
    expect(m.html).toContain('<a href="https://stranko.example/predogled/site_0123456789abcdef/abc">Obdrži predogled</a>');
    expect(`${m.subject}${m.text}${m.html}`).not.toMatch(/—/);
    // A name with markup is escaped in HTML; without a name it still reads.
    expect(reminderMail(config, { to: "a@b.si", siteId: "s", siteName: "<b>X</b>", createdAt: "2026-10-01T08:00:00Z", deletesAt: "2026-10-08T08:00:00Z", lockedPages: [], url: "u" }).html).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(reminderMail(config, { to: "a@b.si", siteId: "s", siteName: " ", createdAt: "2026-10-01T08:00:00Z", deletesAt: "2026-10-08T08:00:00Z", lockedPages: [], url: "u" }).text).toContain("predogled vaše spletne strani, ki ste ga naredili");
  });

  it("the sent email carries the brief's other pages and a link that works", async () => {
    const b = await newBrowser(req);
    const id = await preview(b, keep - before + 0.01);
    await remind(b, id, "povezava@siol.net");
    await send();
    const m = to("povezava@siol.net")[0]!;
    expect(m.text).toContain("celotno stran (Ponudba, Kontakt)");
    expect(m.text).toContain(`https://stranko.example/predogled/${id}/${reminderToken(SECRET, id, "povezava@siol.net")}`);
  });
});

describe("the link keeps the preview", () => {
  it("asks to sign in, then the account with that address keeps it on any device; another address or a bad token can't", async () => {
    const b = await newBrowser(req);
    const id = await preview(b, keep - before + 0.01);
    await remind(b, id, "lastnica@siol.net");
    await send();
    const link = new URL(/https:\/\/\S+\/predogled\/\S+/.exec(to("lastnica@siol.net")[0]!.text)![0]);
    // Not signed in (another device): to sign-in, coming back here.
    const anon = await req(link.pathname, { headers: { cookie: (await newBrowser(req)).cookie } });
    expect(anon.status).toBe(303);
    expect(anon.headers.get("location")).toBe(`/login?next=${encodeURIComponent(link.pathname)}`);
    // A bad token is a plain "gone".
    expect((await req(`${link.pathname.slice(0, -4)}AAAA`, { headers: { cookie: (await newBrowser(req)).cookie } })).status).toBe(404);
    // Signed in with another address: told which one, the preview stays unclaimed.
    const stranger = await ownerSignIn(req, mail.sent, "nekdo@siol.net");
    const wrong = await req(link.pathname, { headers: { cookie: stranger.cookie } });
    expect(wrong.status).toBe(403);
    expect(await wrong.text()).toContain("Prijavite se z drugim naslovom");
    expect((await platform.repo.getSite(id))!.account_id).toBeNull();
    // Signed in with the address on a new device: the preview (and its job, for the free limits) is the account's.
    const owner = await ownerSignIn(req, mail.sent, "lastnica@siol.net");
    const kept = await req(link.pathname, { headers: { cookie: owner.cookie } });
    expect(kept.status).toBe(303);
    expect(kept.headers.get("location")).toBe(`/sites/${id}`);
    const account = (await platform.repo.accounts.byKey("lastnica@siol.net"))!;
    const site = (await platform.repo.getSite(id))!;
    expect(site.account_id).toBe(account.id);
    expect(site.reminder_email).toBeNull();
    expect((await platform.db.query("select count(*)::int as n from ai_jobs where site_id = $1 and account_id = $2", [id, account.id])).rows[0]!.n).toBe(1);
    // Opened again later: straight to the site.
    expect((await req(link.pathname, { headers: { cookie: owner.cookie } })).headers.get("location")).toBe(`/sites/${id}`);
  });

  it("the privacy policy says what the address is for", async () => {
    const text = await (await req("/zasebnost")).text();
    expect(text).toContain(`eno sporočilo ${before} dni pred izbrisom`);
  });
});
