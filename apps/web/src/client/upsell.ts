/**
 * What the next plan adds, shown where the owner needs it (it-upsells, it-plan-limits). Everything the owner reads is
 * worded by the server (apps/web/src/limits.ts, packages/engine/src/plan-limits.ts) from config; this only places
 * it: the free preview's locked pages with the first plan's price, the plan's name at a button that reached its
 * limit, and the reminder before an anonymous preview is deleted. The server refuses past a limit either way.
 */

type Child = Node | string | null | undefined | false;
type H = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, unknown>, ...children: (Child | Child[])[]) => HTMLElementTagNameMap[K];

export interface Upgrade {
  plan: string;
  name: string;
  monthlyEur: number;
}

export interface Note {
  message: string;
  upgrade: Upgrade | null;
}

/** The viewer's plan limits (engine LimitsInfo). */
export interface Limits {
  maxPages: number;
  locales: number;
  collections: string[];
  /** Generated pictures per month (paid plans). */
  pictures: number;
  /** "Osnovni", "Plus"; null for a free preview. */
  planName: string | null;
  pagesNote: Note;
  localesNote: Note;
  /** Per collection the plan doesn't include. */
  collectionNotes: Partial<Record<string, Note>>;
  /** Per collection the plan doesn't include, on the entries of one the site already has: they are read-only. */
  readOnlyNotes: Partial<Record<string, Note>>;
}

const SVG = "http://www.w3.org/2000/svg";

/** A small padlock (decorative; the text says "zaklenjeno" for screen readers). */
export function lockIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "lock");
  const body = document.createElementNS(SVG, "rect");
  for (const [k, v] of Object.entries({ x: "3", y: "7", width: "10", height: "7", rx: "1.5" })) body.setAttribute(k, v);
  const shackle = document.createElementNS(SVG, "path");
  shackle.setAttribute("d", "M5.5 7V5a2.5 2.5 0 0 1 5 0v2");
  for (const el of [body, shackle]) {
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "currentColor");
    el.setAttribute("stroke-width", "1.5");
  }
  svg.append(body, shackle);
  return svg;
}

/** The plan's name beside a button that reached its limit ("Plus", or "Osnovni" for a free preview). */
export const planTag = (h: H, name: string): HTMLElement => h("span", { class: "plan-tag" }, name);

/**
 * The free preview's other pages (named in the brief), locked, with the first paid plan's price and, when the
 * domain check found one, where the site would be published. `action` is the one next step (sign in, or plans).
 */
export function lockedPagesBlock(h: H, o: { pages: string[]; offer: { name: string; text: string } | null; domain: string | null; action: HTMLElement | null }): HTMLElement | null {
  if (!o.offer || (!o.pages.length && !o.domain)) return null;
  return h("div", { class: "note locked-pages", id: "locked-pages" },
    h("p", {}, h("strong", {}, "Celotna stran")),
    o.pages.length ? h("p", { class: "help" }, `Iz vašega opisa smo načrtovali še te strani. Naredimo jih z naročnino ${o.offer.name}.`) : null,
    o.pages.length
      ? h("ul", { class: "locked" }, ...o.pages.map((p) => h("li", {}, lockIcon(), h("span", { class: "name" }, p), h("span", { class: "sr-only" }, " (zaklenjeno)"), planTag(h, o.offer!.name))))
      : null,
    o.domain ? h("p", { class: "help" }, `Domena ${o.domain} je prosta. Objava na njej je del naročnine ${o.offer.name}.`) : null,
    h("p", { class: "price-line" }, o.offer.text),
    o.action,
  );
}

/** The reminder before an anonymous preview is deleted: one email, only if the visitor asks for it. */
export function reminderBlock(
  h: H,
  o: { reminder: { email: string | null; status: string; sendsAt: string }; save: (email: string) => Promise<string | null>; rerender: () => void },
): HTMLElement {
  const when = new Date(o.reminder.sendsAt).toLocaleDateString("sl-SI", { day: "numeric", month: "long" });
  if (o.reminder.status === "sent") return h("p", { class: "help", id: "reminder" }, `Opomnik smo poslali na ${o.reminder.email ?? "vaš naslov"}.`);
  if (o.reminder.email && o.reminder.status === "pending") {
    return h("div", { class: "reminder", id: "reminder" },
      h("p", { class: "help" }, `Opomnik pošljemo ${when} na ${o.reminder.email}.`),
      h("button", { class: "btn sm quiet", type: "button", onClick: async () => { await o.save(""); o.rerender(); } }, "Ne pošiljajte"),
    );
  }
  const input = h("input", { type: "email", id: "reminder-email", autocomplete: "email", inputmode: "email", placeholder: "ime@podjetje.si" }) as HTMLInputElement;
  const error = h("p", { class: "help err", role: "alert", hidden: true });
  const form = h("form", { class: "reminder", id: "reminder" },
    h("label", { for: "reminder-email" }, "Opomnik pred izbrisom (neobvezno)"),
    h("p", { class: "help" }, `Pošljemo eno sporočilo ${when}, preden predogled izbrišemo. Za nič drugega naslova ne uporabimo.`),
    h("div", { class: "row" }, input, h("button", { class: "btn sm", type: "submit" }, "Opomni me")),
    error,
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void o.save(input.value.trim()).then((message) => {
      if (message) {
        error.textContent = message;
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
      } else o.rerender();
    });
  });
  return form;
}
