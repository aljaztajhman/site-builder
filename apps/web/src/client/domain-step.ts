/**
 * The domain step of publishing (it-domain-flow): "Objavi" opens it when the site has no domain yet.
 * The best free name from the business name is preselected (price from config, said by the server), two
 * more are offered, and "Že imam domeno" shows the one record to add at the owner's DNS host. The holder's
 * details come prefilled from the site's facts with "Uredi". One tap on the main button publishes and
 * starts the domain; its progress ("Registriramo… · Varujemo povezavo… · Objavljeno") shows in the panel.
 * Everything the owner reads is worded by the server or here in Slovene; nothing is decided here.
 */

type Child = Node | string | null | undefined | false;
type H = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, unknown>, ...children: (Child | Child[])[]) => HTMLElementTagNameMap[K];

export type RegistrantField = "firstName" | "lastName" | "companyName" | "street" | "postalCode" | "city" | "country" | "phone" | "email";
export type Registrant = Partial<Record<RegistrantField, string>> & { kind?: "person" | "company" };

export interface DomainState {
  hostname: string;
  kind: "registered" | "connected";
  status: "pending" | "active" | "failed";
  primary: boolean;
  stages: { label: string; state: "done" | "current" | "todo" }[];
  label: string;
  message: string | null;
  connect: { record: { type: string; name: string; value: string }; dnsHost: string | null; hasMail: boolean; seen: string[] } | null;
  url: string | null;
  failure?: string | null;
}

export interface DomainsInfo {
  enabled: boolean;
  domains: DomainState[];
  platformAddress: string | null;
}

interface OwnPlan {
  hostname: string;
  apex: string;
  record: { type: string; name: string; value: string };
  dnsHost: string | null;
  hasMail: boolean;
  pointing: boolean;
}

export type DomainChoice = { kind: "registered"; hostname: string; registrant: Registrant } | { kind: "connected"; hostname: string } | null;

/** What stays across re-renders while the step is open. */
export interface DomainStepUi {
  open: boolean;
  mode: "buy" | "own";
  loading: boolean;
  suggestions: { name: string; priceEurPerYear: number }[];
  /** Why there are no suggestions (the registrar didn't answer), in Slovene. */
  notice: string | null;
  chosen: string | null;
  registrant: Registrant;
  missing: RegistrantField[];
  labels: Record<RegistrantField, string>;
  /** The prefilled details as one line, worded by the server. */
  holder: string;
  editing: boolean;
  ownInput: string;
  own: OwnPlan | null;
  ownError: string | null;
  busy: boolean;
}

export const newDomainStepUi = (): DomainStepUi => ({
  open: false,
  mode: "buy",
  loading: false,
  suggestions: [],
  notice: null,
  chosen: null,
  registrant: {},
  missing: [],
  labels: {} as Record<RegistrantField, string>,
  holder: "",
  editing: false,
  ownInput: "",
  own: null,
  ownError: null,
  busy: false,
});

export interface DomainStepDeps {
  h: H;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  ui: DomainStepUi;
  rerender: () => void;
  /** Publishes, then starts the chosen domain (null: publish without one). */
  confirm: (choice: DomainChoice) => Promise<void>;
  /** Whether the viewer's plan includes the domain in the yearly price (all paid plans today). */
  includedInPlan: boolean;
}

const eur = (n: number) => `${new Intl.NumberFormat("sl-SI", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n)} €`;

/** Loads suggestions and the holder's prefilled details, then shows the step. */
export async function openDomainStep(d: DomainStepDeps): Promise<void> {
  const ui = d.ui;
  Object.assign(ui, { ...newDomainStepUi(), open: true, loading: true });
  d.rerender();
  const [info, sugg] = await Promise.all([
    d.api<{ registrant: Registrant; holder: string; missing: RegistrantField[]; labels: Record<RegistrantField, string> }>("/domains").catch(() => null),
    d.api<{ suggestions: { name: string; priceEurPerYear: number }[]; message?: string }>("/domains/suggestions").catch(() => ({ suggestions: [], message: "Prostih domen trenutno ne moremo preveriti." })),
  ]);
  ui.loading = false;
  ui.suggestions = sugg.suggestions;
  ui.notice = sugg.message ?? (sugg.suggestions.length ? null : "Za ime vašega podjetja nismo našli proste domene. Povežite domeno, ki jo že imate, ali objavite brez nje.");
  ui.chosen = sugg.suggestions[0]?.name ?? null;
  if (!ui.chosen) ui.mode = "own";
  if (info) {
    ui.registrant = info.registrant;
    ui.missing = info.missing;
    ui.labels = info.labels;
    ui.holder = info.holder;
    ui.editing = info.missing.length > 0;
  }
  d.rerender();
}

const ORDER: RegistrantField[] = ["firstName", "lastName", "companyName", "street", "postalCode", "city", "country", "phone", "email"];

function registrantBlock(d: DomainStepDeps): HTMLElement {
  const { h, ui } = d;
  const r = ui.registrant;
  const company = r.kind === "company";
  const fields = ORDER.filter((k) => k !== "companyName" || company);
  if (!ui.editing) {
    return h("div", { class: "domain-holder" },
      h("div", { class: "sp" },
        h("p", { class: "domain-holder-title" }, "Imetnik domene (vi)"),
        h("p", { class: "muted" }, ui.holder),
      ),
      h("button", { class: "btn quiet sm", type: "button", onClick: () => { ui.editing = true; d.rerender(); } }, "Uredi"),
    );
  }
  const input = (k: RegistrantField) => {
    const el = h("input", {
      type: k === "email" ? "email" : k === "phone" ? "tel" : "text",
      name: `registrant-${k}`,
      value: r[k] ?? "",
      autocomplete: { firstName: "given-name", lastName: "family-name", companyName: "organization", street: "street-address", postalCode: "postal-code", city: "address-level2", country: "country", phone: "tel", email: "email" }[k],
      "aria-invalid": ui.missing.includes(k) ? "true" : undefined,
    });
    // Typing changes only the draft: no re-render, so focus and the keyboard stay.
    el.addEventListener("input", () => {
      r[k] = el.value;
      if (el.value.trim()) el.removeAttribute("aria-invalid");
    });
    return h("div", {}, h("label", {}, ui.labels[k] ?? k), el);
  };
  return h("fieldset", { class: "domain-holder-form" },
    h("legend", {}, "Imetnik domene (vi)"),
    h("p", { class: "help" }, "Domena bo registrirana na vas. Podatke smo vzeli s strani; popravite jih, če je treba."),
    ui.missing.length ? h("p", { class: "note warn" }, `Manjka še: ${ui.missing.map((k) => (ui.labels[k] ?? k).toLowerCase()).join(", ")}.`) : null,
    h("div", { class: "seg", role: "group", "aria-label": "Imetnik je" },
      h("button", { type: "button", "aria-pressed": String(!company), onClick: () => { r.kind = "person"; d.rerender(); } }, "Oseba ali s.p."),
      h("button", { type: "button", "aria-pressed": String(company), onClick: () => { r.kind = "company"; d.rerender(); } }, "Podjetje"),
    ),
    ...fields.map(input),
  );
}

function buyBlock(d: DomainStepDeps): HTMLElement {
  const { h, ui } = d;
  const price = (p: number) => (d.includedInPlan ? `${eur(p)} na leto · vključena v letni paket` : `${eur(p)} na leto`);
  return h("div", { class: "domain-buy" },
    ui.suggestions.length
      ? h("div", { class: "domain-choices", role: "radiogroup", "aria-label": "Domena" },
          ...ui.suggestions.map((s, i) => {
            const id = `domain-choice-${i}`;
            const radio = h("input", { type: "radio", name: "domain-choice", id, value: s.name, checked: ui.chosen === s.name });
            radio.addEventListener("change", () => { ui.chosen = s.name; d.rerender(); });
            return h("div", { class: "domain-choice" }, radio, h("label", { for: id }, h("strong", {}, s.name), h("span", { class: "muted" }, price(s.priceEurPerYear))));
          }))
      : null,
    ui.notice ? h("p", { class: "help" }, ui.notice) : null,
    ui.chosen ? registrantBlock(d) : null,
  );
}

function ownBlock(d: DomainStepDeps): HTMLElement {
  const { h, ui } = d;
  const field = h("input", { type: "text", name: "own-domain", value: ui.ownInput, placeholder: "vasepodjetje.si", autocomplete: "url", inputmode: "url", autocapitalize: "none", spellcheck: "false" });
  field.addEventListener("input", () => { ui.ownInput = field.value; });
  const check = async () => {
    ui.ownError = null;
    ui.busy = true;
    d.rerender();
    try {
      ui.own = await d.api<OwnPlan>("/domains/inspect", { method: "POST", body: JSON.stringify({ hostname: ui.ownInput }) });
    } catch (e) {
      ui.own = null;
      ui.ownError = (e as Error).message;
    }
    ui.busy = false;
    d.rerender();
  };
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void check();
    }
  });
  const p = ui.own;
  return h("div", { class: "domain-own" },
    h("label", {}, "Vaša domena"),
    h("div", { class: "row nowrap" }, field, h("button", { class: "btn", type: "button", id: "own-domain-check", disabled: ui.busy, onClick: () => void check() }, "Preveri")),
    ui.ownError ? h("p", { class: "err", role: "alert" }, ui.ownError) : null,
    p
      ? h("div", { class: "domain-records" },
          h("p", {}, p.dnsHost ? `Pri ponudniku ${p.dnsHost} dodajte ta zapis DNS:` : "Pri ponudniku, kjer urejate DNS domene, dodajte ta zapis:"),
          recordTable(h, p.record),
          h("p", { class: "help" }, `Stran bo na naslovu ${p.hostname}.${p.hostname.startsWith("www.") ? ` Naslov ${p.apex} naj pri ponudniku preusmerja na ${p.hostname}.` : ""}`),
          p.hasMail ? h("p", { class: "help" }, "Vaše e-pošte ne spreminjamo: zapisov MX ne brišite in ne spreminjajte.") : null,
          p.pointing ? h("p", { class: "note" }, "Zapis je že nastavljen.") : h("p", { class: "help" }, "Zapis lahko dodate tudi pozneje; povezavo preverjamo sami in vam pišemo, ko je stran na domeni."),
        )
      : null,
  );
}

/** The record to add, as a small table the owner can copy from. */
export function recordTable(h: H, r: { type: string; name: string; value: string }): HTMLElement {
  return h("table", { class: "dns-record" },
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Vrsta"), h("th", { scope: "col" }, "Ime"), h("th", { scope: "col" }, "Vrednost"))),
    h("tbody", {}, h("tr", {}, h("td", {}, r.type), h("td", {}, h("code", {}, r.name)), h("td", {}, h("code", {}, r.value)))),
  );
}

/** The step itself (in the editor's panel). */
export function domainStep(d: DomainStepDeps): HTMLElement | null {
  const { h, ui } = d;
  if (!ui.open) return null;
  const close = () => { ui.open = false; d.rerender(); };
  const go = async (choice: DomainChoice) => {
    if (ui.busy) return;
    ui.busy = true;
    d.rerender();
    try {
      await d.confirm(choice);
    } finally {
      ui.busy = false;
    }
  };
  let main: HTMLElement | null = null;
  if (!ui.loading) {
    if (ui.mode === "buy" && ui.chosen) {
      main = h("button", { class: "btn primary block", type: "button", id: "domain-confirm", disabled: ui.busy, onClick: () => void go({ kind: "registered", hostname: ui.chosen!, registrant: ui.registrant }) }, `Objavi na ${ui.chosen}`);
    } else if (ui.mode === "own" && ui.own) {
      main = h("button", { class: "btn primary block", type: "button", id: "domain-confirm", disabled: ui.busy, onClick: () => void go({ kind: "connected", hostname: ui.own!.hostname }) }, `Objavi in poveži ${ui.own.hostname}`);
    }
  }
  return h("div", { class: "pane tight", id: "domain-step" },
    h("div", { class: "domain-step" },
      h("div", { class: "row" },
        h("h2", { class: "pane-title sp" }, "Objava na vaši domeni"),
        h("button", { class: "btn quiet sm", type: "button", "aria-label": "Zapri", onClick: close }, "✕"),
      ),
      ui.loading
        ? h("p", { class: "muted", role: "status" }, "Iščemo proste domene za vaše podjetje …")
        : ui.mode === "buy"
          ? buyBlock(d)
          : ownBlock(d),
      main,
      ui.loading
        ? null
        : h("div", { class: "row domain-alt" },
            ui.mode === "buy"
              ? h("button", { class: "btn quiet sm", type: "button", id: "own-domain", onClick: () => { ui.mode = "own"; d.rerender(); } }, "Že imam domeno")
              : ui.suggestions.length
                ? h("button", { class: "btn quiet sm", type: "button", onClick: () => { ui.mode = "buy"; d.rerender(); } }, "Izberi novo domeno")
                : null,
            h("button", { class: "btn quiet sm", type: "button", id: "publish-without-domain", disabled: ui.busy, onClick: () => void go(null) }, "Objavi brez domene"),
          ),
    ),
  );
}

/** Each domain's progress in the panel, with what the owner can do next. */
export function domainStatus(h: H, info: DomainsInfo | undefined, act: { check: (hostname: string) => void; choose: () => void }): HTMLElement | null {
  const list = info?.domains ?? [];
  if (!list.length) return null;
  return h("div", { class: "pane tight", id: "domain-status" },
    ...list.map((dm) =>
      h("div", { class: dm.status === "failed" ? "note bad domain-progress" : "note domain-progress", role: dm.status === "failed" ? "alert" : "status" },
        h("p", {}, h("strong", {}, dm.url ? h("a", { href: dm.url, target: "_blank", rel: "noopener" }, dm.hostname) : dm.hostname), " · ", dm.label),
        h("ol", { class: "domain-stages" }, ...dm.stages.map((s) => h("li", { "data-state": s.state }, h("span", { class: "sr-only" }, s.state === "done" ? "končano: " : s.state === "current" ? "v teku: " : "sledi: "), s.label))),
        dm.message ? h("p", {}, dm.message) : null,
        dm.connect && dm.status === "pending"
          ? h("div", { class: "domain-records" },
              h("p", {}, dm.connect.dnsHost ? `Pri ponudniku ${dm.connect.dnsHost} dodajte zapis:` : "Pri ponudniku DNS dodajte zapis:"),
              recordTable(h, dm.connect.record),
              dm.connect.seen.length ? h("p", { class: "help" }, `Zdaj tam vidimo: ${dm.connect.seen.join(", ")}.`) : null,
              dm.connect.hasMail ? h("p", { class: "help" }, "Vaše e-pošte (zapisov MX) ne spreminjamo.") : null,
            )
          : null,
        dm.status === "pending" && dm.kind === "connected" ? h("button", { class: "btn sm", type: "button", onClick: () => act.check(dm.hostname) }, "Preveri zdaj") : null,
        dm.status === "failed"
          ? h("div", { class: "row" },
              h("button", { class: "btn sm", type: "button", onClick: () => act.check(dm.hostname) }, "Poskusi znova"),
              h("button", { class: "btn quiet sm", type: "button", onClick: act.choose }, "Izberi drugo domeno"),
            )
          : null,
      )),
  );
}
