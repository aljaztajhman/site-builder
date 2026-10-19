/**
 * The /narocnina page's script (narocnina.tsx renders the page): "Izberite paket" opens the plan sheet with the
 * summary the page was rendered with; "Spremeni ali prekliči" and "Plačaj zdaj" open Stripe's customer portal.
 * Without this script the page still shows the plan, its dates and the invoices.
 */
import type { BillingSummary } from "@sb/platform";
import { billingRedirect, openPlanSheet } from "./plan-sheet.ts";

const root = document.getElementById("narocnina");
const summary = root?.dataset.billing ? (JSON.parse(root.dataset.billing) as BillingSummary) : null;

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-billing-action]")) {
  b.hidden = false;
  b.addEventListener("click", () => {
    if (b.dataset.billingAction === "plans") {
      if (summary) void openPlanSheet(summary);
      return;
    }
    const error = document.getElementById("billing-error")!;
    error.hidden = true;
    b.setAttribute("aria-disabled", "true");
    billingRedirect("/api/billing/portal").then(
      (url) => location.assign(url),
      (e: unknown) => {
        b.removeAttribute("aria-disabled");
        error.textContent = (e as Error).message;
        error.hidden = false;
      },
    );
  });
}
