import type { InvoiceView } from "@sb/platform";

/**
 * PLACEHOLDER until Unit B's `renderInvoiceHtml` (apps/web/src/invoice-view.tsx) is merged: a plain, complete
 * invoice page from the same InvoiceView, so the PDF job and /racun/:id work end to end before the designed view
 * lands. The director swaps the imports to invoice-view.tsx after both PRs merge and deletes this file.
 */

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const eur = (n: number): string => `${n.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const date = (iso: string): string => new Date(iso).toLocaleDateString("sl-SI", { timeZone: "Europe/Ljubljana" });

export function renderInvoiceHtml(v: InvoiceView): string {
  const rows = v.lines
    .map((l) => `<tr><td>${esc(l.text)}</td><td class="n">${l.qty}</td><td class="n">${eur(l.unitGrossEur)}</td><td class="n">${eur(l.qty * l.unitGrossEur)}</td></tr>`)
    .join("");
  const vat =
    v.vat.mode === "included"
      ? `<tr><td>Osnova</td><td class="n">${eur(v.vat.netEur)}</td></tr><tr><td>DDV ${Math.round(v.vat.rate * 100)} %</td><td class="n">${eur(v.vat.vatEur)}</td></tr>`
      : "";
  const s = v.seller;
  const b = v.buyer;
  return `<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Račun ${esc(v.number)}</title>
<style>@page{size:A4;margin:18mm}body{font:14px/1.45 system-ui,sans-serif;color:#111;background:#fff;max-width:780px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 16px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:6px 4px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
.n{text-align:right;white-space:nowrap}.cols{display:flex;gap:32px;flex-wrap:wrap}.cols>div{flex:1;min-width:220px}.tot td{font-weight:700}small{color:#555}</style></head>
<body><h1>Račun ${esc(v.number)}</h1>
<div class="cols"><div><strong>${esc(s.name)}</strong><br>${esc(s.address)}<br>Davčna št.: ${esc(s.taxId)}<br>Matična št.: ${esc(s.registrationNo)}${s.iban ? `<br>IBAN: ${esc(s.iban)}` : ""}<br>${esc(s.email)}</div>
<div><strong>Kupec</strong><br>${esc(b.name)}${b.address ? `<br>${esc(b.address)}` : ""}${b.taxId ? `<br>ID za DDV: ${esc(b.taxId)}` : ""}<br>${esc(b.email)}</div></div>
<p>Datum izdaje: ${date(v.issuedAt)} · Obdobje storitve: ${date(v.serviceFrom)}–${date(v.serviceTo)} · Plačano: ${date(v.paidAt)}</p>
<table><thead><tr><th>Postavka</th><th class="n">Kol.</th><th class="n">Cena z DDV</th><th class="n">Znesek</th></tr></thead><tbody>${rows}</tbody></table>
<table>${vat}<tr class="tot"><td>Skupaj</td><td class="n">${eur(v.totalEur)}</td></tr></table>
${v.fiscal ? `<p><small>ZOI: ${esc(v.fiscal.zoi)} · EOR: ${esc(v.fiscal.eor)}</small></p>` : ""}
${v.notes.map((n) => `<p><small>${esc(n)}</small></p>`).join("")}
</body></html>`;
}
