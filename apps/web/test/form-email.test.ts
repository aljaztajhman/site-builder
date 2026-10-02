import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, normaliseEmail, type MailMessage, type Mailer, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { formNotificationMail, retryFormNotifications } from "../src/form-email.ts";
import { adminBrowser } from "./session-helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const APP_URL = "https://stranko.example";
const OWNER = "Lastnica.Kvas@primer.si";
let platform: Platform;
let dir: string;
let golden: SiteSpec;

/** A mailer that tests can switch between working, failing and hanging. */
function switchableMailer(): Mailer & { sent: MailMessage[]; mode: "ok" | "fail" | "hang"; tried: number } {
  const inner = memoryMailer();
  const m = {
    kind: "memory" as const,
    sent: inner.sent,
    mode: "ok" as "ok" | "fail" | "hang",
    tried: 0,
    async send(msg: MailMessage) {
      m.tried++;
      if (m.mode === "fail") throw new Error("Resend refused the message: HTTP 503 unavailable");
      if (m.mode === "hang") return new Promise<void>(() => undefined);
      await inner.send(msg);
    },
  };
  return m;
}

function appWith(mailer: Mailer, config: AppConfig = loadConfig()) {
  return createApp({ platform, config, mailer, appUrl: APP_URL, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
}

const submit = (app: ReturnType<typeof createApp>, slug: string, fields: Record<string, string> = {}, ip = "203.0.113.7", json = true) =>
  app.request(`/s/${slug}/_submit`, {
    method: "POST",
    body: new URLSearchParams({ section: "s_enquiry", name: "Ana Novak", email: "ana@primer.si", message: "Zanima me ponudba.", ...fields }),
    headers: { "x-forwarded-for": ip, ...(json ? { accept: "application/json" } : {}) },
  });

/** A site whose homepage has a contact form; published unless `publish` is false; owned by OWNER unless `owner` is false. */
async function site(slug: string, o: { owner?: boolean; publish?: boolean } = {}): Promise<string> {
  const spec = structuredClone(golden);
  spec.slug = slug;
  spec.pages[0]!.sections.push({ id: "s_enquiry", type: "contact-form", variant: "stacked", props: { title: "Pišite nam", askPhone: true } });
  const account = o.owner === false ? null : await platform.repo.accounts.signIn(OWNER, normaliseEmail(OWNER)!.key);
  const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "full" }, accountId: account?.id ?? null });
  const v = await platform.repo.saveSpec(s.id, spec, "generate");
  if (o.publish !== false) await platform.repo.markPublished(s.id, v);
  return s.id;
}

const statuses = async (siteId: string) =>
  (await platform.db.query<{ notify_status: string; notify_attempts: number }>("select notify_status, notify_attempts from form_messages where site_id = $1 order by id", [siteId])).rows.map((r) => [
    r.notify_status,
    Number(r.notify_attempts),
  ]);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-form-email-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

describe("formNotificationMail", () => {
  const base = {
    to: "owner@primer.si",
    siteId: "site_0123456789abcdef",
    messageId: "7",
    siteName: "Pekarna Kvas",
    page: { label: "Domov", url: `${APP_URL}/s/pekarna-kvas/` },
    messagesUrl: `${APP_URL}/sites/site_0123456789abcdef/messages`,
    name: "Ana Novak",
    email: "ana@primer.si",
    phone: "041 555 906",
    message: "Zanima me ponudba.\nLep pozdrav",
  };

  it("is Slovene, formal and plain, with Reply-To the visitor and no dashes", () => {
    const m = formNotificationMail(base);
    expect(m.subject).toBe("Novo sporočilo s spletne strani Pekarna Kvas");
    expect(m.replyTo).toBe("ana@primer.si");
    expect(m.idempotencyKey).toBe("form-message-site_0123456789abcdef-7");
    expect(m.text).toContain("ste prejeli novo sporočilo");
    expect(m.text).toContain("Ime: Ana Novak\nE-pošta: ana@primer.si\nTelefon: 041 555 906\nStran: Domov, https://stranko.example/s/pekarna-kvas/");
    expect(m.text).toContain("Sporočilo:\nZanima me ponudba.\nLep pozdrav");
    expect(m.text).toContain("gre vaš odgovor na naslov ana@primer.si");
    for (const part of [m.subject, m.text, m.html!]) expect(part).not.toMatch(/[–—]/);
  });

  it("escapes everything the visitor typed in the HTML body and keeps the subject on one line", () => {
    const m = formNotificationMail({
      ...base,
      siteName: "Kvas\r\nBcc: x@y.z",
      name: `<script>alert("x")</script>`,
      message: `<img src=x onerror=alert(1)> & "quotes" 'single'`,
      phone: null,
    });
    expect(m.subject).toBe("Novo sporočilo s spletne strani Kvas Bcc: x@y.z");
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(m.html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot; &#39;single&#39;");
    expect(m.text).not.toContain("Telefon");
    // The plain body carries the text as typed (a text body is never interpreted).
    expect(m.text).toContain(`<img src=x onerror=alert(1)>`);
  });

  it("sets no Reply-To for an address that isn't one plain address", () => {
    const m = formNotificationMail({ ...base, email: "ana@primer.si, eve@evil.example" });
    expect(m.replyTo).toBeUndefined();
    expect(m.text).not.toContain("gre vaš odgovor");
  });
});

describe("contact form email to the owner", () => {
  it("sends one email to the owner's account address with Reply-To the visitor and the escaped message", async () => {
    const mailer = switchableMailer();
    const app = appWith(mailer);
    const id = await site("mail-a");
    const res = await submit(app, "mail-a", { name: "Ana <b>Novak</b>", message: "Ali imate <script>x</script> pirin kruh?", phone: "041 555 906" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(1);
    const [m] = mailer.sent;
    expect(m!.to).toBe(OWNER);
    expect(m!.replyTo).toBe("ana@primer.si");
    expect(m!.subject).toBe("Novo sporočilo s spletne strani Pekarna Kvas");
    expect(m!.text).toContain("Stran: Domov, https://stranko.example/s/mail-a/");
    expect(m!.text).toContain(`${APP_URL}/sites/${id}/messages`);
    expect(m!.text).toContain("Telefon: 041 555 906");
    expect(m!.html).toContain("Ali imate &lt;script&gt;x&lt;/script&gt; pirin kruh?");
    expect(m!.html).not.toContain("<script>");
    expect(m!.html).not.toContain("<b>");
    expect(await statuses(id)).toEqual([["sent", 1]]);
    // Nothing else is ever sent for it.
    expect(await retryFormNotifications({ repo: platform.repo, config: loadConfig(), mailer })).toBe(0);
    expect(mailer.sent).toHaveLength(1);
  });

  it("stops a flood: the rate limits refuse before anything is stored or sent", async () => {
    const mailer = switchableMailer();
    const config = loadConfig();
    const app = appWith(mailer, config);
    const id = await site("mail-b");
    const n = config.limits.formMessagesPerSenderPer10Min;
    for (let i = 0; i < n + 5; i++) await submit(app, "mail-b", {}, "198.51.100.40");
    expect(mailer.sent).toHaveLength(n);
    expect((await platform.repo.listFormMessages(id)).length).toBe(n);
  });

  it("limits one sender across every site per day (config limits.formMessagesPerSenderPerDay)", async () => {
    const mailer = switchableMailer();
    const config = structuredClone(loadConfig());
    config.limits.formMessagesPerSenderPerDay = 3;
    const app = appWith(mailer, config);
    await site("mail-c1");
    await site("mail-c2");
    const codes: number[] = [];
    for (const slug of ["mail-c1", "mail-c2", "mail-c1", "mail-c2", "mail-c1"]) codes.push((await submit(app, slug, {}, "198.51.100.41")).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    expect(mailer.sent).toHaveLength(3);
    expect((await submit(app, "mail-c2", {}, "198.51.100.42")).status).toBe(200);
  });

  it("keeps the message when the send fails, answers the visitor the same, shows it to the owner and retries", async () => {
    const mailer = switchableMailer();
    mailer.mode = "fail";
    const config = loadConfig();
    const app = appWith(mailer, config);
    const id = await site("mail-d");
    const ok = await submit(app, "mail-d", { message: "Rezervacija za soboto." }, "198.51.100.43", false);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("Hvala, sporočilo smo prejeli.");
    expect(mailer.sent).toHaveLength(0);
    expect((await platform.repo.listFormMessages(id))[0]).toMatchObject({ message: "Rezervacija za soboto.", notify_status: "pending" });
    expect(await statuses(id)).toEqual([["pending", 1]]);
    // The editor's log says why (no message text, no address).
    const events = await platform.repo.listEvents(id);
    const ev = events.find((e) => e.stage === "form-email");
    expect(ev?.message).toMatch(/failed \(attempt 1\): Resend refused the message: HTTP 503/);
    expect(ev?.message).not.toContain("Rezervacija");

    // The owner sees that the email didn't go out yet.
    const { cookie } = await adminBrowser(app.request.bind(app), PASSWORD);
    const page = await (await app.request(`/sites/${id}/messages`, { headers: { cookie } })).text();
    expect(page).toContain("Rezervacija za soboto.");
    expect(page).toContain("E-poštnega obvestila o tem sporočilu še nismo poslali. Poskusili bomo znova.");

    // Not due yet: the retry waits retryEveryMinutes after the last attempt.
    const deps = { repo: platform.repo, config, mailer, appUrl: APP_URL };
    mailer.mode = "ok";
    expect(await retryFormNotifications(deps)).toBe(0);
    await platform.db.query("update form_messages set notify_at = now() - interval '6 minutes' where site_id = $1", [id]);
    expect(await retryFormNotifications(deps)).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.idempotencyKey).toMatch(new RegExp(`^form-message-${id}-\\d+$`));
    expect(await statuses(id)).toEqual([["sent", 2]]);
  });

  it("gives up after maxAttempts and says so on the messages page; the message stays", async () => {
    const mailer = switchableMailer();
    mailer.mode = "fail";
    const config = loadConfig();
    const app = appWith(mailer, config);
    const id = await site("mail-e");
    await submit(app, "mail-e", {}, "198.51.100.44");
    const deps = { repo: platform.repo, config, mailer, log: () => undefined };
    for (let i = 1; i < config.formEmail.maxAttempts; i++) {
      await platform.db.query("update form_messages set notify_at = now() - interval '1 hour' where site_id = $1", [id]);
      await retryFormNotifications(deps);
    }
    expect(mailer.tried).toBe(config.formEmail.maxAttempts);
    expect(await statuses(id)).toEqual([["failed", config.formEmail.maxAttempts]]);
    await platform.db.query("update form_messages set notify_at = now() - interval '1 hour' where site_id = $1", [id]);
    await retryFormNotifications(deps);
    expect(mailer.tried).toBe(config.formEmail.maxAttempts);
    const { cookie } = await adminBrowser(app.request.bind(app), PASSWORD);
    const page = await (await app.request(`/sites/${id}/messages`, { headers: { cookie } })).text();
    expect(page).toContain("Zanima me ponudba.");
    expect(page).toContain("E-poštnega obvestila o tem sporočilu nismo mogli poslati. Sporočilo je shranjeno tukaj.");
  });

  it("doesn't keep the visitor waiting on a hung send; the retry picks it up later", async () => {
    const mailer = switchableMailer();
    mailer.mode = "hang";
    const config = structuredClone(loadConfig());
    config.formEmail.waitMs = 50;
    const app = appWith(mailer, config);
    const id = await site("mail-f");
    const t0 = Date.now();
    const res = await submit(app, "mail-f", {}, "198.51.100.45");
    expect(res.status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(await statuses(id)).toEqual([["pending", 1]]);
  });

  it("sends nothing for a site without an owner account, and nothing for an unpublished site", async () => {
    const mailer = switchableMailer();
    const app = appWith(mailer);
    const adminMade = await site("mail-g", { owner: false });
    expect((await submit(app, "mail-g", {}, "198.51.100.46")).status).toBe(200);
    expect((await platform.repo.listFormMessages(adminMade)).length).toBe(1);
    expect(await statuses(adminMade)).toEqual([["none", 0]]);
    // An anonymous preview (no account, never published) has no public form at all.
    const anon = await site("mail-h", { owner: false, publish: false });
    expect((await submit(app, "mail-h", {}, "198.51.100.47")).status).toBe(404);
    // Nor does an owner's site before its first publish.
    const draft = await site("mail-i", { publish: false });
    expect((await submit(app, "mail-i", {}, "198.51.100.48")).status).toBe(404);
    expect(await platform.repo.listFormMessages(anon)).toEqual([]);
    expect(await platform.repo.listFormMessages(draft)).toEqual([]);
    // The honeypot pretends success and sends nothing.
    await site("mail-j");
    expect((await submit(app, "mail-j", { website: "http://spam.example" }, "198.51.100.49")).status).toBe(200);
    expect(mailer.tried).toBe(0);
  });
});
