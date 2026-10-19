/**
 * Subdomain labels of the platform's own names (docs/plans/custom-domains.md: app.postavi.si, mail.postavi.si …).
 * A site's slug is never one of them, so <slug>.<PLATFORM_DOMAIN> can't shadow the app, mail or DNS names;
 * the host resolver treats such a label as "not a site" and the edge Worker (infra/edge, a copy kept equal by
 * its test) never proxies one. "stranko" stays reserved: the product's name until 2026-10-17.
 */
export const RESERVED_SITE_LABELS: readonly string[] = Object.freeze([
  "www", "app", "mail", "api", "admin", "dashboard", "static", "cdn", "assets", "status", "help", "pomoc", "podpora",
  "blog", "novice", "docs", "send", "bounce", "email", "smtp", "imap", "pop", "ftp", "ns", "ns1", "ns2", "dev", "test",
  "staging", "preview", "demo", "postavi", "stranko", "_dmarc",
]);

const RESERVED = new Set(RESERVED_SITE_LABELS);

/** True when `label` (a slug or a subdomain label, any case) is one of the platform's own names. */
export const isReservedLabel = (label: string): boolean => RESERVED.has(label.trim().toLowerCase());
