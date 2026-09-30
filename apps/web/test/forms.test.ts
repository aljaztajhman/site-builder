import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { parseSubmission } from "../src/forms.tsx";

const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let app: ReturnType<typeof createApp>;
const config = loadConfig();

const form = (fields: Record<string, string>) => new URLSearchParams({ section: "s_enquiry", name: "Ana Novak", email: "ana@primer.si", message: "Zanima me ponudba.", ...fields });
const submit = (slug: string, fields: Record<string, string> = {}, ip = "203.0.113.7", json = true) =>
  app.request(`/s/${slug}/_submit`, {
    method: "POST",
    body: form(fields),
    headers: { "x-forwarded-for": ip, ...(json ? { accept: "application/json" } : {}) },
  });

async function login(): Promise<string> {
  const res = await app.request("/login", { method: "POST", body: new URLSearchParams({ password: PASSWORD, next: "/" }) });
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

/** A published site whose homepage has a contact form (askPhone as given). */
async function publishedSite(slug: string, askPhone = true): Promise<string> {
  const golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  const spec = structuredClone(golden);
  spec.slug = slug;
  spec.pages[0]!.sections.push({ id: "s_enquiry", type: "contact-form", variant: "stacked", props: { title: "Pišite nam", askPhone } });
  const site = await platform.repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "full" } });
  const v = await platform.repo.saveSpec(site.id, spec, "generate");
  await platform.repo.markPublished(site.id, v);
  return site.id;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-forms-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

describe("parseSubmission", () => {
  const ok = { section: "s_enquiry", name: "Ana", email: "ana@primer.si", message: "Pozdravljeni" };
  it("trims and accepts a normal message, phone optional", () => {
    const r = parseSubmission({ ...ok, name: "  Ana  ", phone: "" });
    expect(r).toEqual({ ok: true, value: { section: "s_enquiry", name: "Ana", email: "ana@primer.si", phone: null, message: "Pozdravljeni", website: "" } });
  });
  it("names every bad field", () => {
    const r = parseSubmission({ section: "x", name: "", email: "no-at", phone: "call me maybe", message: "a".repeat(2001) });
    expect(r).toEqual({ ok: false, fields: ["section", "name", "email", "phone", "message"] });
  });
  it("rejects addresses that would add fields to the owner's mailto: link", () => {
    expect(parseSubmission({ ...ok, email: "ana@primer.si?bcc=x@y.z" }).ok).toBe(false);
    expect(parseSubmission({ ...ok, email: "ana@primer.si&cc=x" }).ok).toBe(false);
    expect(parseSubmission({ ...ok, email: "ana.novak+ponudba@primer.si" }).ok).toBe(true);
  });
  it("rejects control characters and a multi-line name", () => {
    expect(parseSubmission({ ...ok, message: "hi\u0007" }).ok).toBe(false);
    expect(parseSubmission({ ...ok, name: "Ana\nBcc: x@y.z" }).ok).toBe(false);
  });
});

describe("POST /s/{slug}/_submit", () => {
  it("stores a valid message without the sender's IP and answers JSON to the island", async () => {
    const id = await publishedSite("forma-a");
    const res = await submit("forma-a", { phone: "041 555 906" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [m] = await platform.repo.listFormMessages(id);
    expect(m).toMatchObject({ name: "Ana Novak", email: "ana@primer.si", phone: "041 555 906", message: "Zanima me ponudba.", section_id: "s_enquiry" });
    const raw = await platform.db.query<Record<string, unknown>>("select * from form_messages where site_id = $1", [id]);
    expect(JSON.stringify(raw.rows)).not.toContain("203.0.113.7");
  });

  it("answers a plain HTML post (no JavaScript) with a thank-you page in the site's language", async () => {
    await publishedSite("forma-b");
    const res = await submit("forma-b", {}, "203.0.113.8", false);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('lang="sl"');
    expect(html).toContain("Hvala, sporočilo smo prejeli.");
    expect(html).toContain('href="./"');
  });

  it("drops the phone when the form doesn't ask for it", async () => {
    const id = await publishedSite("forma-c", false);
    await submit("forma-c", { phone: "041 555 906" }, "203.0.113.9");
    expect((await platform.repo.listFormMessages(id))[0]?.phone).toBeNull();
  });

  it("pretends success for the honeypot and stores nothing", async () => {
    const id = await publishedSite("forma-d");
    const res = await submit("forma-d", { website: "http://spam.example" }, "203.0.113.10");
    expect(res.status).toBe(200);
    expect(await platform.repo.listFormMessages(id)).toEqual([]);
  });

  it("rejects invalid input, unknown forms and unpublished sites", async () => {
    await publishedSite("forma-e");
    expect((await submit("forma-e", { email: "no-at" }, "203.0.113.11")).status).toBe(400);
    expect((await submit("forma-e", { section: "s_other" }, "203.0.113.11")).status).toBe(404);
    const draft = await platform.repo.createSite({ name: "d", slug: "osnutek", intake: { description: "x", photoAssetIds: [], scope: "full" } });
    expect(draft.id).toBeTruthy();
    expect((await submit("osnutek")).status).toBe(404);
    expect((await submit("Ne-Obstaja!")).status).toBe(404);
  });

  it("rate-limits one sender, then lets another through", async () => {
    const id = await publishedSite("forma-f");
    for (let i = 0; i < config.limits.formMessagesPerSenderPer10Min; i++) expect((await submit("forma-f", {}, "198.51.100.1")).status).toBe(200);
    const blocked = await submit("forma-f", {}, "198.51.100.1");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
    expect((await submit("forma-f", {}, "198.51.100.2")).status).toBe(200);
    expect((await platform.repo.listFormMessages(id)).length).toBe(config.limits.formMessagesPerSenderPer10Min + 1);
  });

  it("forgets the hashed sender after a day (the privacy policy says so)", async () => {
    const id = await publishedSite("forma-i");
    await submit("forma-i", {}, "203.0.113.20");
    await platform.db.query("update form_messages set created_at = now() - interval '2 days' where site_id = $1", [id]);
    await submit("forma-i", {}, "203.0.113.21");
    const keys = await platform.db.query<{ sender_key: string }>("select sender_key from form_messages where site_id = $1 order by id", [id]);
    expect(keys.rows.map((r) => r.sender_key === "")).toEqual([true, false]);
  });

  it("needs no session, and published pages may post to their own origin", async () => {
    const csp = (await app.request("/s/forma-a/")).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("connect-src 'self'");
  });
});

describe("owner's messages in the dashboard", () => {
  it("is behind the password, lists messages and deletes one", async () => {
    const id = await publishedSite("forma-g");
    await submit("forma-g", { message: "Prosim za termin v petek." }, "192.0.2.50");
    expect((await app.request(`/sites/${id}/messages`)).status).toBe(302);
    const cookie = await login();
    const page = await (await app.request(`/sites/${id}/messages`, { headers: { cookie } })).text();
    expect(page).toContain("Prosim za termin v petek.");
    expect(page).toMatch(/<h1>Sporočila <span[^>]*>1<\/span><\/h1>/);
    const api = (await (await app.request(`/api/sites/${id}`, { headers: { cookie } })).json()) as { messages: number };
    expect(api.messages).toBe(1);
    const [m] = await platform.repo.listFormMessages(id);
    const del = await app.request(`/sites/${id}/messages/${m!.id}/delete`, { method: "POST", headers: { cookie } });
    expect(del.status).toBe(303);
    expect(await platform.repo.listFormMessages(id)).toEqual([]);
  });

  it("refuses a delete without a session", async () => {
    const id = await publishedSite("forma-h");
    await submit("forma-h", {}, "192.0.2.51");
    const [m] = await platform.repo.listFormMessages(id);
    expect((await app.request(`/sites/${id}/messages/${m!.id}/delete`, { method: "POST" })).status).not.toBe(303);
    expect((await platform.repo.listFormMessages(id)).length).toBe(1);
  });
});
