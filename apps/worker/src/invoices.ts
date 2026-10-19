import { launchCheckBrowser } from "@sb/engine";
import { BillingStore, MailUnavailableError, type Db, type InvoiceView, type Mailer, type Storage } from "@sb/platform";

/**
 * Postavi's invoices after Stripe reports them paid (billing.ts numbers and stores them): the worker renders each
 * new invoice to an A4 PDF with Playwright, keeps it in the bucket (`invoices/<year>/<number>.pdf`, served by
 * GET /racun/:id.pdf) and emails it to the buyer as "Račun <number>". An invoice stays pending until its email went
 * out; the PDF is rendered once. Resend's idempotency key keeps a retry within 24 h from sending twice.
 */

export type RenderPdf = (html: string) => Promise<Uint8Array>;
export type RenderInvoiceHtml = (view: InvoiceView) => string;

export const invoicePdfKey = (view: Pick<InvoiceView, "number">): string => `invoices/${view.number.slice(0, 4)}/${view.number}.pdf`;

/** One Chromium per batch: the page's own print CSS decides the layout (A4, backgrounds printed). */
export async function pdfRenderer(): Promise<{ render: RenderPdf; close(): Promise<void> }> {
  const b = await launchCheckBrowser();
  return {
    async render(html) {
      const page = await b.browser.newPage();
      try {
        await page.setContent(html, { waitUntil: "load" });
        return new Uint8Array(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
      } finally {
        await page.close();
      }
    },
    close: () => b.close(),
  };
}

const eur = (n: number): string => `${n.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function invoiceEmail(view: InvoiceView, appUrl: string | null): { subject: string; text: string } {
  return {
    subject: `Račun ${view.number}`,
    text: [
      "Pozdravljeni,",
      "",
      `hvala za plačilo. V prilogi je račun ${view.number} za ${eur(view.totalEur)}.`,
      ...(appUrl ? [`Vse račune in naročnino najdete na ${appUrl}/narocnina.`] : []),
      "",
      view.seller.name,
    ].join("\n"),
  };
}

export interface InvoiceDocumentDeps {
  db: Db;
  storage: Storage;
  mailer: Mailer;
  renderHtml: RenderInvoiceHtml;
  /** Opened only when an invoice needs a PDF (tests: a fake). */
  openPdf?: () => Promise<{ render: RenderPdf; close(): Promise<void> }>;
  appUrl?: string | null;
  log?: (line: string) => void;
}

/** One pass: PDFs for new invoices, then their emails. Returns what it did; a failed invoice waits for the next pass. */
export async function sendInvoiceDocuments(deps: InvoiceDocumentDeps, limit = 10): Promise<{ rendered: number; emailed: number; failed: number }> {
  const store = new BillingStore(deps.db);
  const pending = await store.pendingDocuments(limit);
  const out = { rendered: 0, emailed: 0, failed: 0 };
  if (!pending.length) return out;
  const log = deps.log ?? ((l: string) => console.error(l));
  let pdf: { render: RenderPdf; close(): Promise<void> } | null = null;
  try {
    for (const inv of pending) {
      try {
        const view = inv.view;
        let bytes: Uint8Array | null = null;
        if (!inv.pdf_key) {
          pdf ??= await (deps.openPdf ?? pdfRenderer)();
          bytes = await pdf.render(deps.renderHtml(view));
          const key = invoicePdfKey(view);
          await deps.storage.put(key, bytes, "application/pdf");
          await store.setPdf(inv.id, key);
          out.rendered++;
        } else bytes = await deps.storage.get(inv.pdf_key);
        if (!bytes) throw new Error(`invoice ${inv.number}: PDF missing in storage`);
        const to = view.buyer.email;
        if (!to) {
          // Nobody to send it to (Stripe always has the checkout email, so this is a hand-made invoice): it stays in /narocnina.
          await store.markEmailed(inv.id);
          continue;
        }
        const mail = invoiceEmail(view, deps.appUrl ?? null);
        await deps.mailer.send({ to, ...mail, idempotencyKey: `invoice-${inv.id}`, attachments: [{ filename: `racun-${view.number}.pdf`, content: bytes }] });
        await store.markEmailed(inv.id);
        out.emailed++;
      } catch (e) {
        out.failed++;
        if (e instanceof MailUnavailableError) {
          log(`[invoice] ${inv.number}: email not configured, kept for the next pass`);
          break;
        }
        log(`[invoice] ${inv.number}: ${(e as Error).message}`);
      }
    }
  } finally {
    await pdf?.close().catch(() => undefined);
  }
  return out;
}
