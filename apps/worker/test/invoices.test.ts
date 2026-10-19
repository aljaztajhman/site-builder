import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { BillingStore, MailUnavailableError, renderInvoiceHtml, Repo, createDb, createFsStorage, handleStripeEvent, memoryMailer, memoryStripe, migrate, syncStripePrices, type Db, type Mailer, type Storage } from "@sb/platform";
import { invoiceEmail, invoicePdfKey, sendInvoiceDocuments } from "../src/invoices.ts";


/** The worker's invoice job: a PDF per paid invoice, kept in the bucket, emailed once as "Račun <number>". */
const config = loadConfig();
let db: Db;
let storage: Storage;
let dir: string;
let accountId: string;
const rendered: string[] = [];
const fakePdf = async () => ({
  render: async (html: string) => {
    rendered.push(html);
    return new TextEncoder().encode(`%PDF-fake ${html.length}`);
  },
  close: async () => undefined,
});

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-invoices-"));
  storage = createFsStorage(dir);
  db = await createDb("pglite://memory");
  await migrate(db);
  const repo = new Repo(db);
  accountId = (await repo.accounts.signIn("eva@example.si", "eva@example.si")).id;
  const stripe = memoryStripe();
  await syncStripePrices(stripe, config);
  await new BillingStore(db).saveCustomer(accountId, "cus_eva");
  const at = Math.floor(Date.parse("2026-10-19T10:00:00Z") / 1000);
  const invoice = {
    id: "in_w1",
    customer: "cus_eva",
    customer_email: "eva@example.si",
    customer_name: "Eva Novak",
    customer_address: null,
    amount_paid: 1900,
    currency: "eur",
    created: at,
    status_transitions: { paid_at: at },
    lines: { data: [{ description: "Osnovni", amount: 1900, quantity: 1, period: { start: at, end: at + 30 * 86400 } }] },
  };
  await handleStripeEvent({ db, config, stripe }, { id: "evt_w1", type: "invoice.paid", created: at, data: { object: invoice } });
});
afterAll(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

describe("invoice documents", () => {
  it("waits when email isn't configured, then renders once and emails the PDF once", async () => {
    const down: Mailer = { kind: "disabled", send: async () => Promise.reject(new MailUnavailableError()) };
    const logs: string[] = [];
    const first = await sendInvoiceDocuments({ db, storage, mailer: down, renderHtml: renderInvoiceHtml, openPdf: fakePdf, log: (l) => logs.push(l) });
    expect(first).toEqual({ rendered: 1, emailed: 0, failed: 1 });
    expect(logs[0]).toMatch(/email not configured/);
    expect(await storage.get(invoicePdfKey({ number: "2026-00001" }))).not.toBeNull();

    const mail = memoryMailer();
    const second = await sendInvoiceDocuments({ db, storage, mailer: mail, renderHtml: renderInvoiceHtml, openPdf: fakePdf, appUrl: "https://postavi.example" });
    expect(second).toEqual({ rendered: 0, emailed: 1, failed: 0 });
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toContain("Račun 2026-00001");
    const m = mail.sent[0]!;
    expect(m).toMatchObject({ to: "eva@example.si", subject: "Račun 2026-00001", idempotencyKey: expect.stringMatching(/^invoice-inv_/) });
    expect(m.text).toContain("https://postavi.example/narocnina");
    expect(m.attachments?.[0]?.filename).toBe("racun-2026-00001.pdf");

    expect(await sendInvoiceDocuments({ db, storage, mailer: mail, renderHtml: renderInvoiceHtml, openPdf: fakePdf })).toEqual({ rendered: 0, emailed: 0, failed: 0 });
    expect(mail.sent).toHaveLength(1);
  });

  it("writes the email in Slovene with the total", () => {
    const e = invoiceEmail({ number: "2026-00007", totalEur: 99, seller: { name: "Postavi d.o.o." } } as never, null);
    expect(e.subject).toBe("Račun 2026-00007");
    expect(e.text).toMatch(/račun 2026-00007 za 99,00\s€/);
  });
});
