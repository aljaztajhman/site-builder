// @module-tag slow
import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { buildInvoiceView } from "@sb/platform";
import { pdfRenderer } from "../src/invoices.ts";
import { renderInvoiceHtml } from "../src/invoice-html-fallback.ts";

/** The invoice PDF comes out of Chromium as one A4 page (595 × 842 pt). */
describe("invoice PDF", () => {
  it("renders the invoice page to an A4 PDF", async () => {
    const at = Math.floor(Date.parse("2026-10-19T10:00:00Z") / 1000);
    const view = buildInvoiceView({
      id: "inv_0000000000000001",
      number: "2026-00001",
      issuedAt: new Date(at * 1000),
      config: loadConfig(),
      priceKeys: new Map(),
      founding: false,
      invoice: {
        id: "in_1",
        customer: "cus_1",
        customer_email: "eva@example.si",
        customer_name: "Eva Novak",
        customer_address: null,
        amount_paid: 1900,
        currency: "eur",
        created: at,
        lines: { data: [{ description: "Osnovni", amount: 1900, quantity: 1, period: { start: at, end: at + 30 * 86400 } }] },
      },
    });
    const pdf = await pdfRenderer();
    try {
      const bytes = await pdf.render(renderInvoiceHtml(view));
      const text = Buffer.from(bytes).toString("latin1");
      expect(text.startsWith("%PDF-")).toBe(true);
      // A4 in points (Chromium writes 594.95996 × 841.91998), one page.
      const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(text);
      expect(Math.round(Number(box?.[1]))).toBe(595);
      expect(Math.round(Number(box?.[2]))).toBe(842);
      expect(text).toMatch(/\/Type \/Pages[^>]*\/Count 1\b|\/Count 1\b[^>]*\/Type \/Pages/);
    } finally {
      await pdf.close();
    }
  }, 60_000);
});
