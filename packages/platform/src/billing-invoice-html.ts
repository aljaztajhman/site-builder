import type { InvoiceView } from "./billing-types.ts";

/**
 * The invoice as one self-contained HTML document: the owner's /racun/:id page (apps/web/src/billing.ts) and the
 * worker's PDF (apps/worker/src/invoices.ts prints this same HTML on A4). It lives here so both can import it (web
 * depends on the worker). Unit B's design (formerly apps/web/src/invoice-view.tsx, JSX) as a plain string template
 * with the same markup. No external files: system fonts, CSS inline. On screen it is an A4 sheet on grey with
 * "Prenesi PDF"; printed, only the sheet.
 */
const TZ = "Europe/Ljubljana";
const money = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" });
const eur = (n: number) => money.format(n);
const day = (iso: string) => new Date(iso).toLocaleDateString("sl-SI", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" });
const pct = (rate: number) => `${Math.round(rate * 1000) / 10} %`.replace(".", ",");
/** Text and attribute values escaped as React escapes them. */
const esc = (s: string | number): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]!);

const CSS = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
html{background:#e4e9ea;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;padding:24px 12px;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f1f22}
.bar{max-width:210mm;margin:0 auto 12px;display:flex;justify-content:flex-end}
.bar a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:8px;background:#0d7a84;color:#fff;font-weight:600;text-decoration:none}
.sheet{width:100%;max-width:210mm;min-height:297mm;margin:0 auto;padding:18mm 16mm;background:#fff;box-shadow:0 1px 3px rgb(15 31 34/.15)}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap;border-bottom:2px solid #0f1f22;padding-bottom:14px}
h1{font-size:26px;margin:0;letter-spacing:-.01em}
.no{font-size:16px;font-weight:600;margin:4px 0 0}
.seller{text-align:right;font-size:13px}
.seller strong{font-size:15px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:22px 0}
h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#53676c;margin:0 0 6px}
dl{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0}
dt{color:#53676c}dd{margin:0}
p{margin:0}
table{width:100%;border-collapse:collapse;margin:8px 0 0}
th{text-align:left;font-size:12px;color:#53676c;font-weight:600;border-bottom:1px solid #b4c5c9;padding:6px 4px}
td{padding:8px 4px;border-bottom:1px solid #dfe8ea;vertical-align:top}
.r{text-align:right;white-space:nowrap}
.totals{margin:14px 0 0 auto;width:min(100%,300px)}
.totals div{display:flex;justify-content:space-between;padding:3px 0}
.totals .sum{border-top:2px solid #0f1f22;margin-top:4px;padding-top:6px;font-weight:700;font-size:16px}
.notes{margin-top:22px;font-size:13px;color:#3d5257}
.notes p+p{margin-top:4px}
.fiscal{margin-top:16px;font-size:12px;color:#3d5257;overflow-wrap:anywhere}
@media (max-width:560px){.sheet{padding:20px 16px;min-height:0}.parties{grid-template-columns:1fr}.seller{text-align:left}}
@media print{html{background:#fff}body{padding:0}.bar{display:none}.sheet{box-shadow:none;max-width:none;width:210mm;min-height:0}}
`;

/** The invoice page; with `pdfLink: false`, the HTML the worker prints to PDF (no "Prenesi PDF" bar). */
export function renderInvoiceHtml(v: InvoiceView, o: { pdfLink?: boolean } = {}): string {
  const s = v.seller;
  const b = v.buyer;
  const included = v.vat.mode === "included";
  const p = (text: string) => `<p>${esc(text)}</p>`;
  const lines = v.lines
    .map((l) => `<tr><td>${esc(l.text)}</td><td class="r">${esc(l.qty)}</td><td class="r">${esc(eur(l.unitGrossEur))}</td><td class="r">${esc(eur(Math.round(l.qty * l.unitGrossEur * 100) / 100))}</td></tr>`)
    .join("");
  return [
    `<!doctype html><html lang="sl"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex, nofollow"/>`,
    `<title>${esc(`Račun ${v.number} · ${s.name}`)}</title><style>${CSS}</style></head><body>`,
    (o.pdfLink ?? true) ? `<nav class="bar" aria-label="Račun"><a href="/racun/${esc(encodeURIComponent(v.id))}.pdf">Prenesi PDF</a></nav>` : "",
    `<main class="sheet"><header><div><h1>Račun</h1><p class="no">${esc(`št. ${v.number}`)}</p></div>`,
    `<div class="seller"><strong>${esc(s.name)}</strong>${p(s.address)}${p(`${included ? "ID za DDV" : "Davčna št."}: ${s.taxId}`)}${p(`Matična št.: ${s.registrationNo}`)}${s.iban ? p(`IBAN: ${s.iban}`) : ""}${p(s.email)}</div></header>`,
    `<div class="parties"><section aria-labelledby="buyer"><h2 id="buyer">Kupec</h2><p><strong>${esc(b.name)}</strong></p>${b.address ? p(b.address) : ""}${b.taxId ? p(`Davčna št.: ${b.taxId}`) : ""}${p(b.email)}</section>`,
    `<section aria-labelledby="dates"><h2 id="dates">Podatki</h2><dl><dt>Datum izdaje</dt><dd>${esc(day(v.issuedAt))}</dd><dt>Obdobje storitve</dt><dd>${esc(`${day(v.serviceFrom)} – ${day(v.serviceTo)}`)}</dd>`,
    `<dt>Datum plačila</dt><dd>${esc(day(v.paidAt))}</dd><dt>Način plačila</dt><dd>Plačilna kartica</dd></dl></section></div>`,
    `<table><thead><tr><th scope="col">Opis</th><th scope="col" class="r">Količina</th><th scope="col" class="r">${included ? "Cena z DDV" : "Cena"}</th><th scope="col" class="r">Znesek</th></tr></thead><tbody>${lines}</tbody></table>`,
    `<div class="totals">`,
    included ? `<div><span>Osnova brez DDV</span><span>${esc(eur(v.vat.netEur))}</span></div><div><span>${esc(`DDV ${pct(v.vat.rate)}`)}</span><span>${esc(eur(v.vat.vatEur))}</span></div>` : "",
    `<div class="sum"><span>Skupaj</span><span>${esc(eur(v.totalEur))}</span></div></div>`,
    v.notes.length ? `<div class="notes">${v.notes.map(p).join("")}</div>` : "",
    v.fiscal ? `<div class="fiscal">${p(`ZOI: ${v.fiscal.zoi}`)}${p(`EOR: ${v.fiscal.eor}`)}</div>` : "",
    `</main></body></html>`,
  ].join("");
}
