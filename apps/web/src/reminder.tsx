import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import type { AppConfig } from "@sb/config";
import { planOffer } from "@sb/engine";
import { isDisposableEmailDomain, normaliseEmail, type MailMessage, type Mailer, type Repo } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { refusalJson, signInUrl, type AppEnv } from "./access.ts";
import type { Track } from "./analytics.ts";
import { chatEdits, count, lockedPagesOf, moreHomepages } from "./limits.ts";
import { Brand, Doc, html } from "./pages.tsx";
import { PRODUCT_NAME, formatDate } from "./ui/labels.ts";

/**
 * The reminder before an anonymous preview is deleted (it-upsells, "day 5 of 7"). A visitor may leave an email on
 * their preview; one message goes to it `tiers.anonymous.reminder.daysBefore` days before the preview is deleted,
 * sent from the web process (it holds the mail settings), claimed first so several processes send it once, with an
 * idempotency key. Its link keeps the preview: signed in with that address (a magic link proves the inbox), the
 * preview becomes the account's on any device. The address is used for nothing else and goes with the preview's row.
 */

export interface ReminderDeps {
  repo: Repo;
  config: AppConfig;
  mailer: Mailer;
  /** Public origin for the link (APP_URL); without it no reminder can be sent. */
  appUrl?: string;
  /** Key of the link's token (the session secret). */
  secret: string;
  log?: (line: string) => void;
}

/** The link's token: only the site and the address it was sent to make it, so nothing is stored for it. */
export const reminderToken = (secret: string, siteId: string, emailKey: string): string => createHmac("sha256", secret).update(`reminder:${siteId}:${emailKey}`).digest("base64url").slice(0, 32);
const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const DAYS_AFTER_CEZ = { one: "dan", two: "dneva", few: "dni", other: "dni" };

export interface ReminderMailInput {
  to: string;
  siteId: string;
  siteName: string;
  createdAt: string;
  deletesAt: string;
  /** Pages the brief planned beyond the homepage, by their menu names. */
  lockedPages: string[];
  url: string;
}

/** The day-5 email, in Slovene: when the preview goes, how to keep it, and what the first paid plan adds. */
export function reminderMail(config: AppConfig, m: ReminderMailInput): MailMessage {
  const name = m.siteName.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
  const days = config.tiers.anonymous.reminder.daysBefore;
  const free = config.tiers.free;
  const keep = `Če ga želite obdržati, se prijavite s tem e-poštnim naslovom. Predogled ostane vaš, urejate ga naprej in z brezplačnim računom dobite še ${moreHomepages(free.homepages)} in ${chatEdits(free.chatEdits)}.`;
  const pages = m.lockedPages.length ? ` (${m.lockedPages.join(", ")})` : "";
  const plan = `Z naročnino ${planOffer(config, "standard")} naredimo celotno stran${pages} in jo objavite na svoji domeni.`;
  const why = "To sporočilo smo poslali, ker ste ga zahtevali pri predogledu. Drugih ne pošiljamo, naslov pa izbrišemo skupaj s predogledom.";
  const intro = `${name ? `predogled spletne strani ${name}` : "predogled vaše spletne strani"}, ki ste ga naredili ${formatDate(m.createdAt)}, brez prijave hranimo ${config.tiers.anonymous.keepDays} dni, zato ga izbrišemo ${formatDate(m.deletesAt)}.`;
  const text = ["Pozdravljeni,", "", intro, "", keep, m.url, "", plan, "", why].join("\n");
  const body = [
    `<div style="font:16px/1.5 system-ui,sans-serif;color:#16181d;max-width:36rem">`,
    `<p>Pozdravljeni,</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<p>${escapeHtml(keep)}</p>`,
    `<p><a href="${escapeHtml(m.url)}">Obdrži predogled</a></p>`,
    `<p>${escapeHtml(plan)}</p>`,
    `<p style="color:#555;font-size:14px">${escapeHtml(why)}</p>`,
    `</div>`,
  ].join("");
  return {
    to: m.to,
    subject: `Vaš predogled v ${PRODUCT_NAME} izbrišemo čez ${count(days, DAYS_AFTER_CEZ)}`,
    text,
    html: body,
    idempotencyKey: `preview-reminder-${m.siteId}`,
  };
}

/** Sends every due reminder once. Returns how many went out. */
export async function sendPreviewReminders(deps: ReminderDeps, limit = 100): Promise<number> {
  const { repo, config, mailer } = deps;
  const log = deps.log ?? ((l: string) => console.warn(l));
  const origin = deps.appUrl?.replace(/\/$/, "") ?? null;
  const r = config.tiers.anonymous.reminder;
  const keepDays = config.tiers.anonymous.keepDays;
  const due = await repo.dueReminders({ keepDays, remindAfterDays: keepDays - r.daysBefore, maxAttempts: r.maxAttempts, limit });
  if (due.length && !origin) {
    log("[reminder] no APP_URL (or RAILWAY_PUBLIC_DOMAIN): preview reminders can't carry their link; none sent");
    return 0;
  }
  let sent = 0;
  for (const d of due) {
    const email = normaliseEmail(d.reminder_email);
    if (!email) {
      await repo.setReminderStatus(d.id, "failed");
      continue;
    }
    if (!(await repo.claimReminder(d.id, d.reminder_attempts))) continue;
    try {
      const site = await repo.getSite(d.id);
      if (!site) continue;
      const spec = (await repo.getSpec(site.id))?.spec as SiteSpec | undefined;
      const siteName = spec?.business.name?.trim() || site.name;
      await mailer.send(
        reminderMail(config, {
          to: email.email,
          siteId: site.id,
          siteName,
          createdAt: site.created_at,
          deletesAt: new Date(Date.parse(site.created_at) + keepDays * 86400_000).toISOString(),
          lockedPages: lockedPagesOf(config, site, spec ?? null),
          url: `${origin}/predogled/${site.id}/${reminderToken(deps.secret, site.id, email.key)}`,
        }),
      );
      await repo.setReminderStatus(site.id, "sent");
      sent++;
    } catch (e) {
      const last = d.reminder_attempts + 1 >= r.maxAttempts;
      if (last) await repo.setReminderStatus(d.id, "failed").catch(() => undefined);
      const reason = e instanceof Error ? (e.name === "MailUnavailableError" ? "email is not configured" : e.message.slice(0, 120)) : "unknown error";
      log(`[reminder] ${d.id}: attempt ${d.reminder_attempts + 1} failed (${reason})${last ? ", giving up" : ", will retry"}`);
    }
  }
  return sent;
}

export function registerReminderRoutes(app: Hono<AppEnv>, deps: Pick<ReminderDeps, "repo" | "config" | "secret"> & { track?: Track }): void {
  const { repo, secret } = deps;

  // The visitor's address for the reminder (the editor's guest panel). Only on this device's unclaimed preview
  // (siteAccess let it through); an empty address takes the reminder back.
  app.post("/api/sites/:id/reminder", async (c) => {
    const site = c.get("site");
    if (!site || site.account_id !== null || !site.device_id) return refusalJson(c, { status: 409, code: "not_anonymous", message: "Ta predogled je že shranjen v računu." });
    const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
    const typed = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
    if (!typed) {
      await repo.db.query("update sites set reminder_email = null, reminder = 'none' where id = $1 and account_id is null and reminder <> 'sent'", [site.id]);
      return c.json({ ok: true, email: null });
    }
    const email = normaliseEmail(typed);
    if (!email) return refusalJson(c, { status: 400, code: "invalid_email", message: "Vpišite veljaven e-poštni naslov, na primer ime@podjetje.si." });
    if (isDisposableEmailDomain(email.domain)) return refusalJson(c, { status: 400, code: "disposable_email", message: "Naslovov za enkratno uporabo ne sprejemamo. Vpišite svoj stalni e-poštni naslov." });
    if (site.reminder === "sent") return refusalJson(c, { status: 409, code: "reminder_sent", message: "Opomnik smo že poslali." });
    if (!(await repo.setReminder(site.id, email.email))) return refusalJson(c, { status: 409, code: "not_anonymous", message: "Ta predogled je že shranjen v računu." });
    return c.json({ ok: true, email: email.email });
  });

  // The email's link: signed in with the address it went to, the preview becomes the account's.
  app.get("/predogled/:id/:token", async (c) => {
    const id = c.req.param("id");
    const token = c.req.param("token");
    const viewer = c.get("viewer");
    c.header("cache-control", "no-store");
    const site = /^site_[0-9a-f]{16}$/.test(id) ? await repo.getSite(id) : null;
    // Opened again after it was kept: straight to it.
    if (site && viewer.kind === "account" && site.account_id === viewer.account.id) return c.redirect(`/sites/${site.id}`, 303);
    const email = site?.reminder_email && site.account_id === null ? normaliseEmail(site.reminder_email) : null;
    if (!site || !email || !/^[A-Za-z0-9_-]{32}$/.test(token) || !same(token, reminderToken(secret, site.id, email.key))) {
      return c.html(notice("Predogleda ni več", "Predogled je bil izbrisan ali pa je že shranjen v računu. Novega naredite na prvi strani.", { href: "/", label: "Na prvo stran" }), 404);
    }
    if (viewer.kind !== "account") return c.redirect(signInUrl(c.req.path), 303);
    if (viewer.account.email_key !== email.key) {
      return c.html(
        notice("Prijavite se z drugim naslovom", `Predogled shranimo v račun z naslovom, na katerega smo poslali sporočilo. Zdaj ste prijavljeni kot ${viewer.account.email}.`, { href: signInUrl(c.req.path), label: "Prijava z drugim naslovom" }),
        403,
      );
    }
    const claimed = await repo.usage.claimSite(site.id, viewer.account.id);
    if (claimed) {
      console.log(`[web] preview ${site.id} kept from its reminder by ${viewer.account.id}`);
      await deps.track?.(c, { kind: "preview_claimed", siteId: site.id, accountId: viewer.account.id, props: { via: "reminder" } });
    }
    return c.redirect(`/sites/${site.id}`, 303);
  });
}

function notice(title: string, text: string, action: { href: string; label: string }): string {
  return html(
    <Doc title={title}>
      <main className="login">
        <Brand href="/" />
        <h1>{title}</h1>
        <p>{text}</p>
        <a className="btn primary block" href={action.href}>
          {action.label}
        </a>
      </main>
    </Doc>,
  );
}
