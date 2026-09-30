/** Slovene labels and formats shared by the server-rendered pages and the editor bundle (no Node imports). */

/** Working wordmark from the designs (docs/design/ideas.html, homepage.html); the real name is the owner's call (`sb-brand-name`). */
export const PRODUCT_NAME = "Stran";

const TZ = "Europe/Ljubljana";
const eur = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" });

/** "0,41 €" */
export const formatEur = (n: number): string => eur.format(n);
/** "29. 9. 2026" */
export const formatDate = (iso: string): string => new Date(iso).toLocaleDateString("sl-SI", { timeZone: TZ });
/** "29. 9. 26, 14:32" */
export const formatDateTime = (iso: string): string => new Date(iso).toLocaleString("sl-SI", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });

export interface StatusLike {
  status: string;
  published_version: number | null;
}

/** Status pill: text and tone (`busy`, `live`, `err` or plain). "Objavljeno" only when a version is actually published. */
export function siteStatus(s: StatusLike): { label: string; tone: "busy" | "live" | "err" | "" } {
  switch (s.status) {
    case "generating":
      return { label: "Ustvarjam …", tone: "busy" };
    case "editing":
      return { label: "Urejam …", tone: "busy" };
    case "publishing":
      return { label: "Objavljam …", tone: "busy" };
    case "failed":
      return { label: "Napaka", tone: "err" };
    case "new":
      return { label: "Novo", tone: "" };
  }
  return s.published_version ? { label: "Objavljeno", tone: "live" } : { label: "Osnutek", tone: "" };
}
