/**
 * End-to-end check of a deployed environment on one generated site, the way an owner uses it:
 * chat edit → fill the placeholders in the editor → publish → public page at /s/{slug}/ → contact form
 * (if the site has one; the test message is deleted) → an owner account signs in with a one-time link
 * and can't open this site → export zip opened offline. Costs one chat edit (~€0.02). Each run leaves
 * one account smoke-<time>@stranko-smoke.example behind.
 *
 *   REMOTE_URL=https://… REMOTE_PASSWORD=… pnpm tsx tools/eval/src/remote-smoke.ts <site-id>
 */
import { checkExportOffline, launchCheckBrowser } from "@sb/engine";
import { fillPlaceholderOps } from "./placeholder-fill.ts";
import { csrfIn, remoteAdmin, remoteBrowser, useSignInLink } from "./remote-session.ts";

const base = process.env.REMOTE_URL;
const password = process.env.REMOTE_PASSWORD;
const siteId = process.argv[2];
if (!base || !password || !siteId) {
  console.error("usage: REMOTE_URL=… REMOTE_PASSWORD=… remote-smoke.ts <site-id>");
  process.exit(2);
}

interface SiteState {
  site: { status: string; slug: string; name: string };
  version: number | null;
  spec: { chrome: { header: { tone?: string } } } | null;
  chat: { role: string; content: string }[];
  blockers: string[];
}

let failed = false;
const step = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
  return ok;
};
const stop = () => process.exit(failed ? 1 : 0);

const admin = await remoteAdmin(base, password);
const cookie = admin.cookie;
if (!step("login", admin.ok, `HTTP ${admin.status}`)) stop();

const api = (p: string, init: RequestInit = {}) => fetch(`${base}${p}`, { ...init, headers: { cookie, "content-type": "application/json", ...init.headers } });
const state = async () => (await (await api(`/api/sites/${siteId}`)).json()) as SiteState;

let s = await state();
if (!step("site is ready", s.site.status === "ready" && s.version !== null, `${s.site.status}, v${s.version}`)) stop();

// Chat edit (the only model call): flip the header between dark and light, so the check needs a real change.
const chatBefore = s.chat.length;
const wasDark = s.spec?.chrome.header.tone === "inverse";
const message = wasDark ? "Glava naj bo spet svetla, ne temna." : "Temnejša glava prosim.";
const sent = await api(`/api/sites/${siteId}/chat`, { method: "POST", body: JSON.stringify({ message }) });
step("chat edit accepted", sent.ok, `HTTP ${sent.status}`);
const until = Date.now() + 3 * 60_000;
while (Date.now() < until) {
  s = await state();
  if (s.chat.length >= chatBefore + 2 && s.site.status === "ready") break;
  await new Promise((r) => setTimeout(r, 3000));
}
const reply = s.chat.at(-1);
const isDark = s.spec?.chrome.header.tone === "inverse";
step("chat edit applied", reply?.role === "assistant" && isDark !== wasDark, `header ${wasDark ? "dark → " : "light → "}${isDark ? "dark" : "light"}; reply: ${reply?.content.slice(0, 80) ?? "none"}`);

// Owner fills the missing facts in the editor (direct edit, no model call).
const ops = fillPlaceholderOps(s.spec);
if (ops.length) {
  const patched = await api(`/api/sites/${siteId}/patch`, { method: "POST", body: JSON.stringify({ baseVersion: s.version, ops, message: "smoke test: facts" }) });
  step(`fill ${ops.length} placeholders`, patched.ok, `HTTP ${patched.status}${patched.ok ? "" : ` ${(await patched.text()).slice(0, 200)}`}`);
}
s = await state();
if (!step("no publish blockers", s.blockers.length === 0, s.blockers.slice(0, 5).join(" | "))) stop();

const pub = await api(`/api/sites/${siteId}/publish`, { method: "POST" });
const pubBody = (await pub.json()) as { url?: string; version?: number };
if (!step("publish", pub.ok && !!pubBody.url, `v${pubBody.version} → ${pubBody.url}`)) stop();

// Public page, fetched without the session cookie.
const page = await fetch(`${base}${pubBody.url}`);
const html = await page.text();
step("public page", page.ok && html.includes('lang="sl"'), `HTTP ${page.status}, ${html.length} B`);
step("public page is noindex", (page.headers.get("x-robots-tag") ?? "").includes("noindex"));

// Contact form, when the site has one: a visitor's message reaches the owner, then the test message is deleted.
const formId = (s.spec as unknown as { pages: { sections: { id: string; type: string }[] }[] } | null)?.pages
  .flatMap((p) => p.sections)
  .find((x) => x.type === "contact-form")?.id;
if (formId) {
  const before = ((await (await api(`/api/sites/${siteId}`)).json()) as { messages: number }).messages;
  const sentForm = await fetch(`${base}/s/${s.site.slug}/_submit`, {
    method: "POST",
    headers: { accept: "application/json" },
    body: new URLSearchParams({ section: formId, name: "Smoke Test", email: "smoke@primer.si", message: "Samodejni preizkus obrazca." }),
  });
  const after = ((await (await api(`/api/sites/${siteId}`)).json()) as { messages: number }).messages;
  step("contact form delivers to the owner", sentForm.ok && after === before + 1, `HTTP ${sentForm.status}, messages ${before} → ${after}`);
  const list = await (await api(`/sites/${siteId}/messages`)).text();
  const mid = /messages\/(\d+)\/delete/.exec(list)?.[1];
  if (mid) {
    const del = await fetch(`${base}/sites/${siteId}/messages/${mid}/delete`, { method: "POST", headers: { cookie }, body: new URLSearchParams({ _csrf: csrfIn(list) }), redirect: "manual" });
    step("test message deleted (form with CSRF token)", del.status === 303, `HTTP ${del.status}`);
  }
}

// Accounts: a fresh owner signs in with a link the admin makes (the script has no inbox) and sees only their own sites.
const ownerEmail = `smoke-${Date.now()}@stranko-smoke.example`;
const made = await api("/admin/login-link", { method: "POST", body: JSON.stringify({ email: ownerEmail }) });
const link = made.ok ? ((await made.json()) as { url: string }).url : "";
if (step("admin makes a sign-in link", !!link, `HTTP ${made.status}`)) {
  const owner = await useSignInLink(await remoteBrowser(base), link);
  step("owner signs in with the link", owner.ok, `→ ${owner.location}`);
  const mine = await fetch(`${base}/sites`, { headers: { cookie: owner.cookie }, redirect: "manual" });
  step("owner's sites page", mine.status === 200, `HTTP ${mine.status}`);
  const other = await fetch(`${base}/api/sites/${siteId}`, { headers: { cookie: owner.cookie } });
  step("someone else's site is a 404 for the owner", other.status === 404, `HTTP ${other.status}`);
  const again = await useSignInLink(await remoteBrowser(base), link);
  step("a sign-in link works once", !again.ok);
}

const exp = await api(`/api/sites/${siteId}/export`);
const zip = new Uint8Array(await exp.arrayBuffer());
if (step("export download", exp.ok && zip.length > 10_000, `${(zip.length / 1024).toFixed(0)} KB`)) {
  const browser = await launchCheckBrowser();
  try {
    const r = await checkExportOffline(zip, s.site.slug, browser.browser);
    step("export works offline (file://)", r.ok, r.ok ? `${r.files} files` : r.problems.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }
}
console.log(`\n${base}${pubBody.url}`);
stop();
