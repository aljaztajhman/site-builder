import type { AppConfig } from "@sb/config";
import type { MailMessage, Mailer, Repo } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";

/**
 * The owner's email about a contact-form message on their published site. Sent to the site's owner
 * account and nobody else (a site without one, admin-made or an unclaimed preview, gets none: the message
 * is still in the dashboard). The message is stored before anything is sent; a failed send stays
 * 'pending' and `retryFormNotifications` tries again (config `formEmail`).
 *
 * Slovene, vikanje, plain. A text body plus a small HTML body in which everything the visitor typed is
 * escaped. Reply-To is the visitor's address, so the owner can just answer.
 */

// No characters that would add fields to the owner's mailto: link (?, &), break out of an attribute or a
// header (quotes, <>, commas, whitespace), or name a second address.
export const EMAIL = /^[^\s@?&<>"',;:]+@[^\s@?&<>"',;:]+\.[^\s@?&<>"',;:]{2,}$/;

export interface FormMailInput {
  /** The owner's account address. */
  to: string;
  siteId: string;
  messageId: string;
  siteName: string;
  /** The page the form is on: its menu name and (with a public origin) its address. */
  page: { label: string; url: string | null };
  /** The owner's message list in the dashboard, when the public origin is known. */
  messagesUrl: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
}

/** One line of plain text: no line breaks or control characters (subject, labels), at most `max` characters. */
const oneLine = (s: string, max = 150) =>
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function formNotificationMail(m: FormMailInput): MailMessage {
  const site = oneLine(m.siteName) || "vaše spletne strani";
  const replyTo = EMAIL.test(m.email) && m.email.length <= 120 ? m.email : null;
  const pageLine = m.page.url ? `${oneLine(m.page.label)}, ${m.page.url}` : oneLine(m.page.label);
  const text = [
    "Pozdravljeni,",
    "",
    `prek kontaktnega obrazca na spletni strani ${site} ste prejeli novo sporočilo.`,
    "",
    `Ime: ${oneLine(m.name)}`,
    `E-pošta: ${oneLine(m.email)}`,
    ...(m.phone ? [`Telefon: ${oneLine(m.phone)}`] : []),
    `Stran: ${pageLine}`,
    "",
    "Sporočilo:",
    m.message,
    "",
    ...(replyTo ? [`Če odgovorite na to e-poštno sporočilo, gre vaš odgovor na naslov ${replyTo}.`] : []),
    m.messagesUrl ? `Vsa sporočila s spletne strani so shranjena tudi v vašem računu: ${m.messagesUrl}` : "Vsa sporočila s spletne strani so shranjena tudi v vašem računu.",
  ].join("\n");

  const row = (label: string, value: string) => `<tr><td style="padding:2px 12px 2px 0;color:#555">${label}</td><td style="padding:2px 0">${value}</td></tr>`;
  const link = (href: string, label: string) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  const html = [
    `<div style="font:16px/1.5 system-ui,sans-serif;color:#16181d;max-width:36rem">`,
    `<p>Pozdravljeni,</p>`,
    `<p>prek kontaktnega obrazca na spletni strani ${escapeHtml(site)} ste prejeli novo sporočilo.</p>`,
    `<table style="border-collapse:collapse">`,
    row("Ime", escapeHtml(oneLine(m.name))),
    row("E-pošta", replyTo ? link(`mailto:${replyTo}`, replyTo) : escapeHtml(oneLine(m.email))),
    ...(m.phone ? [row("Telefon", escapeHtml(oneLine(m.phone)))] : []),
    row("Stran", m.page.url ? link(m.page.url, oneLine(m.page.label)) : escapeHtml(oneLine(m.page.label))),
    `</table>`,
    `<p style="margin-bottom:4px;color:#555">Sporočilo:</p>`,
    `<p style="margin-top:0;white-space:pre-wrap">${escapeHtml(m.message)}</p>`,
    ...(replyTo ? [`<p>Če odgovorite na to e-poštno sporočilo, gre vaš odgovor na naslov ${escapeHtml(replyTo)}.</p>`] : []),
    `<p>Vsa sporočila s spletne strani so shranjena tudi ${m.messagesUrl ? link(m.messagesUrl, "v vašem računu") : "v vašem računu"}.</p>`,
    `</div>`,
  ].join("");

  return {
    to: m.to,
    subject: `Novo sporočilo s spletne strani ${site}`,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
    // Unique across environments sharing one Resend account (the site id is random); a retry within
    // Resend's 24 h window is dropped instead of sent twice.
    idempotencyKey: `form-message-${m.siteId}-${m.messageId}`,
  };
}

/** The page holding a form section: its menu name and path below the site root ("" for the homepage). */
export function formPage(spec: SiteSpec, sectionId: string): { label: string; path: string } {
  const page = spec.pages.find((p) => p.sections.some((s) => s.id === sectionId)) ?? spec.pages[0];
  const label = page?.nav?.label?.trim() || (page?.slug ? page.slug : "Domov");
  return { label, path: page?.slug ? `${page.slug}/` : "" };
}

export interface NotifyDeps {
  repo: Repo;
  config: AppConfig;
  mailer: Mailer;
  /** Public origin for links (APP_URL); without it the email carries no links. Never the request's Host. */
  appUrl?: string;
  log?: (line: string) => void;
}

/**
 * One send attempt for a stored message, if it is still pending with `attempts` tries behind it. Never
 * throws: the visitor's answer doesn't depend on it. Returns what became of the notification.
 */
export async function notifyOwner(deps: NotifyDeps, messageId: string, attempts: number): Promise<"sent" | "none" | "retry" | "failed" | "skipped"> {
  const { repo, config, mailer } = deps;
  const log = deps.log ?? ((l: string) => console.warn(l));
  const msg = await repo.claimFormNotification(messageId, attempts);
  if (!msg) return "skipped";
  try {
    const site = await repo.getSite(msg.site_id);
    const to = site ? await repo.siteOwnerEmail(site.id) : null;
    if (!site || !to) {
      await repo.setFormNotification(msg.id, "none");
      return "none";
    }
    const version = site.published_version ?? site.current_version;
    const spec = version ? (await repo.getSpec(site.id, version))?.spec : undefined;
    const name = spec && typeof spec.business.name === "string" && spec.business.name.trim() ? spec.business.name : site.name;
    const page = spec ? formPage(spec, msg.section_id) : { label: "Domov", path: "" };
    const origin = deps.appUrl?.replace(/\/$/, "") ?? null;
    await mailer.send(
      formNotificationMail({
        to,
        siteId: site.id,
        messageId: msg.id,
        siteName: name,
        page: { label: page.label, url: origin ? `${origin}/s/${site.slug}/${page.path}` : null },
        messagesUrl: origin ? `${origin}/sites/${site.id}/messages` : null,
        name: msg.name,
        email: msg.email,
        phone: msg.phone,
        message: msg.message,
      }),
    );
    await repo.setFormNotification(msg.id, "sent");
    return "sent";
  } catch (e) {
    const last = msg.notify_attempts >= config.formEmail.maxAttempts;
    await repo.setFormNotification(msg.id, last ? "failed" : "pending").catch(() => undefined);
    // The error names the transport's refusal (HTTP status); never the message, the address or the key.
    const reason = e instanceof Error ? e.name === "MailUnavailableError" ? "email is not configured" : e.message.slice(0, 120) : "unknown error";
    log(`[form-email] message ${msg.id} on ${msg.site_id}: attempt ${msg.notify_attempts} failed (${reason})${last ? ", giving up" : ", will retry"}`);
    await repo
      .addEvent({ siteId: msg.site_id, stage: "form-email", level: "warn", message: `Contact-form email for message ${msg.id} failed (attempt ${msg.notify_attempts}${last ? ", gave up" : ""}): ${reason}` })
      .catch(() => undefined);
    return last ? "failed" : "retry";
  }
}

/** Retries pending notifications that are due (config `formEmail`). Returns how many were sent. */
export async function retryFormNotifications(deps: NotifyDeps, limit = 50): Promise<number> {
  const f = deps.config.formEmail;
  const due = await deps.repo.dueFormNotifications({ maxAttempts: f.maxAttempts, retryAfterMinutes: f.retryEveryMinutes, withinHours: f.retryWithinHours, limit });
  let sent = 0;
  for (const d of due) if ((await notifyOwner(deps, d.id, d.attempts)) === "sent") sent++;
  return sent;
}
