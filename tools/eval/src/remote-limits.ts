/**
 * The free generation limits on a deployed environment (docs/plans/free-generation-limits.md, "Done
 * means"): a second anonymous generation from the same device is refused; a free account stops after
 * its allowance (config tiers.free: its chat edits; its extra homepages only with --homepages, ~€0.25 each);
 * and with both free pools held, a paid (admin) job still runs while a preview without an account is
 * refused. Part of remote-smoke.ts, run with --limits. Costs one anonymous homepage (~€0.26), the free
 * chat edits (~€0.012 each, 5 today) and one admin edit (~€0.01). Leaves one preview and one account
 * smoke-free-<time>@stranko-smoke.example behind. The counts come from this checkout's config, which is the
 * deployed one when the environment runs main.
 *
 * Turnstile: the script sends Cloudflare's dummy test token. It passes only with Cloudflare's test
 * keys (always-pass secret); with production keys the anonymous steps are reported as not run.
 */
import { loadConfig } from "@sb/config";
import { remoteBrowser, useSignInLink, type RemoteBrowser } from "./remote-session.ts";

/** A free account's allowance (config tiers.free); it was 10 edits and 2 homepages before 2026-10-03. */
const FREE = loadConfig().tiers.free;

type Step = (name: string, ok: boolean, detail?: string) => boolean;

const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const DESCRIPTION = "Pekarna Kvas v Kamniku, Šutna 30. Kruh z drožmi, rogljički in potica. Odprto vsak dan od 7.00 do 13.00. Naročila na 041 555 906.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The landing page's form as home.ts sends it. Without an account: the text alone for an upload ticket
 * (bot check, limits, junk check), then the form carrying it. `html` holds the refusal (page or JSON).
 */
async function intake(b: RemoteBrowser, description: string): Promise<{ status: number; location: string | null; html: string }> {
  let path = "/api/sites";
  if (!/sb_(account|session)=/.test(b.cookie)) {
    const t = await fetch(`${b.base}/api/intake/ticket`, {
      method: "POST",
      body: new URLSearchParams({ _csrf: b.csrf, description, "cf-turnstile-response": DUMMY_TOKEN }),
      headers: { cookie: b.cookie, accept: "application/json" },
    });
    const body = (await t.json().catch(() => ({}))) as { ticket?: string; message?: string };
    if (!t.ok || !body.ticket) return { status: t.status, location: null, html: body.message ?? "" };
    path = `/api/sites?ticket=${encodeURIComponent(body.ticket)}`;
  }
  const form = new FormData();
  form.set("_csrf", b.csrf);
  form.set("description", description);
  const res = await fetch(`${b.base}${path}`, { method: "POST", body: form, headers: { cookie: b.cookie }, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), html: res.status === 303 ? "" : await res.text() };
}

interface SiteState {
  site: { status: string };
  chat: { role: string }[];
}

async function waitFor(b: RemoteBrowser, siteId: string, done: (s: SiteState) => boolean, minutes: number): Promise<SiteState | null> {
  const until = Date.now() + minutes * 60_000;
  let last: SiteState | null = null;
  while (Date.now() < until) {
    last = (await (await fetch(`${b.base}/api/sites/${siteId}`, { headers: { cookie: b.cookie } })).json()) as SiteState;
    if (done(last)) return last;
    await sleep(5000);
  }
  return last;
}

const chat = (b: RemoteBrowser, siteId: string, message: string) =>
  fetch(`${b.base}/api/sites/${siteId}/chat`, { method: "POST", headers: { cookie: b.cookie, "content-type": "application/json" }, body: JSON.stringify({ message }) });

export async function runLimitChecks(opts: { base: string; admin: RemoteBrowser; siteId: string; step: Step; homepages: boolean }): Promise<void> {
  const { base, admin, siteId, step } = opts;
  console.log("\n— Free generation limits —");

  // 1. Anonymous: one preview per device.
  const anon = await remoteBrowser(base);
  const first = await intake(anon, DESCRIPTION);
  let preview: string | null = null;
  if (first.status === 303 && first.location) {
    preview = first.location.split("/").at(-1)!;
    step("anonymous preview without an account", true, `→ ${first.location}`);
  } else if (first.status === 403 && first.html.includes("niste robot")) {
    step("anonymous preview without an account", false, "Turnstile refused Cloudflare's test token: the deployed keys are production keys, so this part can't run unattended (use the test keys on preview)");
  } else if (first.status === 503) {
    step("anonymous preview without an account", false, "TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY not set on the web service: previews without an account are refused");
  } else {
    step("anonymous preview without an account", false, `HTTP ${first.status} ${first.html.match(/class="note bad"[^>]*>([^<]+)/)?.[1] ?? ""}`);
  }
  if (preview) {
    const second = await intake(anon, `${DESCRIPTION} Še ena.`);
    step("a second anonymous generation from the same device is refused", second.status === 429 && second.html.includes("Brezplačni predogled brez prijave ste že naredili"), `HTTP ${second.status}`);

    // 2. Sign up in the same browser (the admin makes the link: the script has no inbox): the preview is claimed.
    const email = `smoke-free-${Date.now()}@stranko-smoke.example`;
    const made = await fetch(`${base}/admin/login-link`, { method: "POST", headers: { cookie: admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const link = made.ok ? ((await made.json()) as { url: string }).url : "";
    const owner = link ? await useSignInLink(anon, link) : null;
    const claimed = owner?.ok ? await fetch(`${base}/api/sites/${preview}`, { headers: { cookie: owner.cookie } }) : null;
    step("signing up claims the anonymous preview", claimed?.status === 200, `HTTP ${claimed?.status ?? made.status}`);
    if (owner?.ok) {
      const ready = await waitFor(owner, preview, (s) => s.site.status === "ready" || s.site.status === "failed", 6);
      step("the anonymous preview is generated", ready?.site.status === "ready", ready?.site.status ?? "timeout");

      // 3. A free account: its chat edits in total (queued edits count), then refused.
      const results: number[] = [];
      for (let i = 0; i < FREE.chatEdits; i++) results.push((await chat(owner, preview, i % 2 ? "Glava naj bo svetla." : "Glava naj bo temna.")).status);
      const over = await chat(owner, preview, "Še ena sprememba.");
      const body = (await over.json().catch(() => ({}))) as { code?: string };
      step(`a free account stops after its ${FREE.chatEdits} chat edits`, results.every((s) => s === 200) && over.status === 429 && body.code === "free_edits_used", `${results.join(",")} → ${over.status} ${body.code ?? ""}`);
      if (opts.homepages) {
        // The same browser, now signed in: the claimed preview didn't use one of them.
        const allowed: number[] = [];
        for (let i = 0; i < FREE.homepages; i++) allowed.push((await intake(owner, `${DESCRIPTION} Še ena (${i + 1}).`)).status);
        const refused = await intake(owner, `${DESCRIPTION} Ena preveč.`);
        step(`a free account gets ${FREE.homepages} more homepage(s), then no more`, allowed.every((s) => s === 303) && refused.status === 429, `${allowed.join(", ")} → ${refused.status}`);
      }
    }
  }

  // 4. Both free pools held (the admin's "Ustavi za 24 h", here for an hour): previews without an account
  // are refused, a paid (admin) job still runs. Released at the end whatever happens.
  const hold = (pool: string) => fetch(`${base}/admin/pools/hold`, { method: "POST", headers: { cookie: admin.cookie }, body: new URLSearchParams({ pool, hours: "1", _csrf: admin.csrf }) });
  const release = (pool: string) => fetch(`${base}/admin/pools/release`, { method: "POST", headers: { cookie: admin.cookie }, body: new URLSearchParams({ pool, _csrf: admin.csrf }) });
  try {
    const held = [await hold("anonymous"), await hold("free")];
    step("admin holds the anonymous and free pools", held.every((r) => r.status === 200), held.map((r) => r.status).join(", "));
    const refused = await intake(await remoteBrowser(base), DESCRIPTION);
    step("with the free pools empty, a preview without an account is refused", refused.status === 429 && refused.html.includes("Današnji brezplačni predogledi"), `HTTP ${refused.status}`);
    const before = ((await (await fetch(`${base}/api/sites/${siteId}`, { headers: { cookie: admin.cookie } })).json()) as { chat: unknown[] }).chat.length;
    const paid = await chat(admin, siteId, "Glava naj bo spet taka, kot je bila.");
    const after = paid.ok ? await waitFor(admin, siteId, (s) => s.chat.length >= before + 2 && s.site.status === "ready", 8) : null;
    step("a paid job runs with the free pools empty", paid.ok && !!after && after.chat.length >= before + 2, `HTTP ${paid.status}, reply ${after ? "received" : "missing"}`);
  } finally {
    await release("anonymous");
    await release("free");
  }
}
