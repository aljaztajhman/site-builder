/**
 * "Izberite paket": the plan sheet opened by a publish refusal and by "Paketi in cene" in the editor, and by
 * "Izberite paket" on /narocnina. Osnovni or Plus, monthly or yearly, with the prices, the founding offer and the
 * setup service from GET /api/billing (config); "Na plačilo" posts /api/billing/checkout and goes to Stripe.
 * A native modal <dialog>: focus stays inside, Esc closes, the page behind is inert.
 */
import type { BillingInterval, BillingSummary, CheckoutRequest, PlanKey, RedirectAnswer } from "@sb/platform";
import { PLAN_KEYS, euros, foundingApplies, foundingLine, payLine, priceText, setupIncluded, yearlySaving } from "./billing-text.ts";

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "checked") (el as HTMLInputElement).checked = Boolean(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}

const OFFLINE = "Preverite internetno povezavo in poskusite znova.";

/** GET /api/billing; null when it can't be read (not signed in, the server without billing, offline). */
export async function loadBilling(): Promise<BillingSummary | null> {
  try {
    const r = await fetch("/api/billing", { headers: { accept: "application/json" } });
    return r.ok ? ((await r.json()) as BillingSummary) : null;
  } catch {
    return null;
  }
}

/** POSTs a billing action and returns where to go, or throws with the server's Slovene message. */
export async function billingRedirect(path: "/api/billing/checkout" | "/api/billing/portal", body: CheckoutRequest | Record<string, never> = {}): Promise<string> {
  let r: Response;
  try {
    r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error(OFFLINE);
  }
  const answer = (await r.json().catch(() => ({}))) as Partial<RedirectAnswer> & { code?: string; message?: string };
  if (!r.ok || !answer.url) {
    if (answer.code === "already_subscribed") throw new Error("Naročnino že imate. Paket spremenite na strani Naročnina.");
    throw new Error(answer.message ?? "Plačila trenutno ni mogoče začeti. Poskusite znova čez trenutek.");
  }
  return answer.url;
}

export interface SheetOptions {
  /** The first plan selected (default Osnovni). */
  plan?: PlanKey;
  /** Why the sheet opened, said above the plans ("Za objavo izberite paket."). */
  reason?: string;
  /** Where the browser goes with the answer's URL (tests). */
  go?: (url: string) => void;
}

/** Opens the plan sheet for this summary; resolves when it closes without going to payment. */
export function openPlanSheet(s: BillingSummary, o: SheetOptions = {}): Promise<void> {
  document.getElementById("plan-sheet")?.remove();
  let plan: PlanKey = o.plan ?? "standard";
  let interval: BillingInterval = "year";
  let setup = false;
  let busy = false;

  const error = h("p", { class: "help err", role: "alert", id: "plan-sheet-error", hidden: true });
  const plans = h("div", { class: "plan-options" });
  const setupBox = h("div", { class: "plan-setup" });
  const pay = h("p", { class: "plan-pay num", id: "plan-pay", "aria-live": "polite" });
  const go = h("button", { class: "btn primary block", type: "submit" }, "Na plačilo");

  const radio = (name: string, value: string, checked: boolean, onChange: () => void) =>
    h("input", { type: "radio", name, value, checked, onChange });

  const intervals = h("fieldset", { class: "plan-interval" },
    h("legend", {}, "Plačilo"),
    ...(["year", "month"] as const).map((i) =>
      h("label", { class: "plan-seg" }, radio("plan-interval", i, i === interval, () => { interval = i; draw(); }), h("span", {}, i === "year" ? "Letno" : "Mesečno")),
    ),
  );

  function draw(): void {
    plans.replaceChildren(
      ...PLAN_KEYS.map((k) => {
        const saving = interval === "year" ? yearlySaving(s, k) : 0;
        const founding = foundingApplies(s, k, interval);
        return h("label", { class: k === plan ? "plan-option on" : "plan-option" },
          radio("plan-key", k, k === plan, () => { plan = k; draw(); }),
          h("span", { class: "plan-name" }, s.prices[k].name),
          h("span", { class: "plan-price num" }, founding ? `${euros(s.founding!.firstYearEur)} prvo leto` : priceText(s, k, interval)),
          founding
            ? h("span", { class: "plan-sub" }, foundingLine(s)!)
            : saving
              ? h("span", { class: "plan-sub" }, `Letno prihranite ${euros(saving)}.`)
              : interval === "month"
                ? h("span", { class: "plan-sub" }, `ali ${priceText(s, k, "year")}`)
                : null,
        );
      }),
    );
    const included = setupIncluded(s, plan, interval);
    setupBox.replaceChildren(
      included
        ? h("p", { class: "plan-included" }, `Postavitev skupaj z vami je v letnem paketu ${s.prices[plan].name} vključena.`)
        : h("label", { class: "plan-check" },
            h("input", { type: "checkbox", id: "plan-setup", checked: setup, onChange: (e: Event) => { setup = (e.target as HTMLInputElement).checked; pay.textContent = payLine(s, plan, interval, setup); } }),
            h("span", {}, `Postavitev skupaj z vami, enkratno ${euros(s.setup.eur)}`),
          ),
    );
    pay.textContent = payLine(s, plan, interval, setup);
  }

  const form = h("form", { method: "dialog", class: "plan-form" },
    h("div", { class: "plan-head" },
      h("h2", { id: "plan-sheet-title" }, "Izberite paket"),
      h("button", { class: "btn quiet icon-btn", type: "button", "aria-label": "Zapri", value: "close", onClick: () => dialog.close() }, "✕"),
    ),
    h("p", { class: "help" }, o.reason ?? "Stran objavite takoj po plačilu. Naročnino lahko kadarkoli prekličete, velja do konca plačanega obdobja."),
    intervals,
    h("fieldset", { class: "plan-plans" }, h("legend", {}, "Paket"), plans),
    setupBox,
    pay,
    error,
    go,
    h("p", { class: "help plan-card" }, "Plačilo s kartico prek Stripe. Cene so končne. Račun pošljemo po e-pošti."),
  );
  const dialog = h("dialog", { class: "plan-sheet", id: "plan-sheet", "aria-labelledby": "plan-sheet-title" }, form);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    go.setAttribute("aria-disabled", "true");
    go.textContent = "Odpiram plačilo …";
    error.hidden = true;
    const body: CheckoutRequest = { plan, interval, ...(setup && !setupIncluded(s, plan, interval) ? { setup: true } : {}) };
    billingRedirect("/api/billing/checkout", body).then(
      (url) => (o.go ?? ((u: string) => location.assign(u)))(url),
      (err: unknown) => {
        busy = false;
        go.removeAttribute("aria-disabled");
        go.textContent = "Na plačilo";
        error.textContent = (err as Error).message;
        error.hidden = false;
      },
    );
  });

  draw();
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve();
    }, { once: true });
  });
}
