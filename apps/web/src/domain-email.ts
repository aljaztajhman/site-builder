import type { AppConfig } from "@sb/config";
import type { MailMessage, Mailer, Repo } from "@sb/platform";

/**
 * "Your site is live at your domain": one email to the site's owner account when a domain becomes active
 * (the provisioning job leaves it pending). Sent from the web process, which holds the mail settings,
 * every `domains.notify.everyMinutes`; each email is claimed before it is sent (several processes) and
 * carries an idempotency key, so a retry within Resend's 24 h never sends it twice.
 */

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function domainLiveMail(m: { to: string; hostname: string; siteName: string; kind: "registered" | "connected"; dashboardUrl: string | null }): MailMessage {
  const name = m.siteName.replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "Vaša spletna stran";
  const url = `https://${m.hostname}/`;
  const owned =
    m.kind === "registered"
      ? `Domena ${m.hostname} je registrirana na vaše ime: vaša je, tudi če se kdaj odločite za drugega ponudnika.`
      : `Domena ${m.hostname} ostaja pri vašem ponudniku, prav tako vaša e-pošta.`;
  const text = [
    "Pozdravljeni,",
    "",
    `stran ${name} je objavljena na vaši domeni:`,
    url,
    "",
    owned,
    "Povezava je varna (HTTPS). Iskalniki bodo stran na novem naslovu našli v nekaj dneh.",
    ...(m.dashboardUrl ? ["", `Urejanje: ${m.dashboardUrl}`] : []),
  ].join("\n");
  const html = [
    `<div style="font:16px/1.5 system-ui,sans-serif;color:#16181d;max-width:36rem">`,
    `<p>Pozdravljeni,</p>`,
    `<p>stran ${escapeHtml(name)} je objavljena na vaši domeni:<br><a href="${escapeHtml(url)}">${escapeHtml(m.hostname)}</a></p>`,
    `<p>${escapeHtml(owned)} Povezava je varna (HTTPS). Iskalniki bodo stran na novem naslovu našli v nekaj dneh.</p>`,
    ...(m.dashboardUrl ? [`<p><a href="${escapeHtml(m.dashboardUrl)}">Urejanje strani</a></p>`] : []),
    `</div>`,
  ].join("");
  return { to: m.to, subject: `Stran je objavljena na ${m.hostname}`, text, html, idempotencyKey: `domain-live-${m.hostname}` };
}

/** Sends every pending "live" email once. Returns how many went out. */
export async function sendDomainLiveEmails(deps: { repo: Repo; config: AppConfig; mailer: Mailer; appUrl?: string; log?: (line: string) => void }): Promise<number> {
  const { repo, config, mailer } = deps;
  const log = deps.log ?? ((l: string) => console.warn(l));
  const max = config.domains.notify.maxAttempts;
  const origin = deps.appUrl?.replace(/\/$/, "") ?? null;
  let sent = 0;
  for (const row of await repo.domains.dueNotifications(max)) {
    if (!(await repo.domains.claimNotification(row.hostname, row.notify_attempts))) continue;
    const site = await repo.getSite(row.site_id);
    const to = site ? await repo.siteOwnerEmail(site.id) : null;
    if (!site || !to) {
      await repo.domains.setNotification(row.hostname, "none");
      continue;
    }
    try {
      const spec = site.published_version ? (await repo.getSpec(site.id, site.published_version))?.spec : undefined;
      const siteName = spec?.business.name?.trim() || site.name;
      await mailer.send(domainLiveMail({ to, hostname: row.hostname, siteName, kind: row.kind, dashboardUrl: origin ? `${origin}/sites/${site.id}` : null }));
      await repo.domains.setNotification(row.hostname, "sent");
      sent++;
    } catch (e) {
      const last = row.notify_attempts + 1 >= max;
      if (last) await repo.domains.setNotification(row.hostname, "failed");
      const reason = e instanceof Error ? (e.name === "MailUnavailableError" ? "email is not configured" : e.message.slice(0, 120)) : "unknown error";
      log(`[domain-email] ${row.hostname}: attempt ${row.notify_attempts + 1} failed (${reason})${last ? ", giving up" : ", will retry"}`);
    }
  }
  return sent;
}
