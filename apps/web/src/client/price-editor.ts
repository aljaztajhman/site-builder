/**
 * The editor for price lists ("Cenik") and menus ("Jedilni list"): groups and items the owner edits
 * themselves, no model call. Every change is a spec patch built by @sb/spec/price-edit when the save
 * goes out. Typing saves after a short pause and the preview swaps in the re-rendered section; adding,
 * moving and deleting save at once. No drag: every move is an up/down button, 44 px on touch screens.
 */
import { ENUM_LABEL } from "@sb/spec/labels";
import {
  LIST_SHAPE,
  MENU_TAGS,
  PRICE_ON_REQUEST,
  isPriceOnRequest,
  listEdits,
  parsePriceInput,
  priceInputValue,
  priceLabel,
  priceValue,
  readList,
  type ListAt,
  type ListItem,
  type PatchOp,
  type PriceListType,
} from "@sb/spec/price-edit";

type Child = Node | string | null | undefined | false;
type H = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, unknown>, ...children: (Child | Child[])[]) => HTMLElementTagNameMap[K];

/** What stays open across re-renders (the panel is redrawn after every structural save). */
export interface PriceEditorState {
  /** `${sectionId}:${group}:${item}` of the item whose fields are shown. */
  open: string | null;
  /** Focus this field of the open item once drawn (after "+ Dodaj postavko"). */
  focus: "name" | "price" | null;
}

export interface PriceEditorDeps {
  h: H;
  sectionId: string;
  /** The spec as it is when a save goes out. */
  spec: () => unknown;
  /** Where the section is when a save goes out (it may have moved), or null when it is gone. */
  at: () => ListAt | null;
  /** Sends the operations built at send time; structural saves redraw the panel. */
  save: (build: () => PatchOp[] | null, message: string, structural: boolean) => void;
  /** Delays a save until typing pauses; another save going out first sends it at once. */
  later: (send: () => void) => { push(): void; cancel(): void };
  /** The section's props schema (JSON Schema) for the heading fields. */
  props: { properties?: Record<string, { maxLength?: number }>; required?: string[] };
  ui: PriceEditorState;
  /** "Cena po dogovoru" per item and for the whole list (config `editor.priceOnRequest`). */
  onRequest: boolean;
}

const itemKey = (sectionId: string, g: number, i: number) => `${sectionId}:${g}:${i}`;

/** Two neighbours swap places: whichever of them is open stays open at its new place (read at click time). */
function swapOpen(d: PriceEditorDeps, a: string, b: string): void {
  if (d.ui.open === a) d.ui.open = b;
  else if (d.ui.open === b) d.ui.open = a;
}

/** Two groups swap places: the open item moves with its group. */
function swapOpenGroup(d: PriceEditorDeps, a: number, b: number): void {
  const m = d.ui.open?.startsWith(`${d.sectionId}:`) ? /:(\d+):(\d+)$/.exec(d.ui.open) : null;
  if (!m) return;
  const g = Number(m[1]);
  if (g === a || g === b) d.ui.open = itemKey(d.sectionId, g === a ? b : a, Number(m[2]));
}

/** The item a spec path points into (a checklist entry, a tap in the preview), as an open-state key. */
export function itemKeyForPath(sectionId: string, type: PriceListType, path: string): string | null {
  const shape = LIST_SHAPE[type];
  const m = new RegExp(`/props/${shape.groups}/(\\d+)/${shape.items}/(\\d+)(/|$)`).exec(path);
  return m ? itemKey(sectionId, Number(m[1]), Number(m[2])) : null;
}

const HEAD_FIELDS: [string, string][] = [
  ["eyebrow", "Nadnaslov"],
  ["title", "Naslov"],
  ["intro", "Uvod"],
  ["footnote", "Opomba pod seznamom"],
];

export function priceEditor(d: PriceEditorDeps): HTMLElement {
  const { h } = d;
  const first = d.at();
  const list = first && readList(d.spec(), first);
  if (!first || !list) return h("p", { class: "muted" }, "Tega razdelka ni več.");
  const { type, shape, groups } = list;
  const menu = type === "menu";
  const word = menu ? { item: "jed", items: "jedi", group: "skupino jedi" } : { item: "postavko", items: "postavke", group: "skupino" };
  /** Builds operations against the spec and section position at send time. */
  const build = (f: (spec: unknown, at: ListAt) => PatchOp[] | null) => () => {
    const at = d.at();
    return at ? f(d.spec(), at) : null;
  };
  const structural = (f: (spec: unknown, at: ListAt) => PatchOp[] | null, message: string) => d.save(build(f), message, true);
  const base = `/pages/${first.page}/sections/${first.section}/props`;

  const box = h("div", { class: "pl" });
  box.append(
    h("p", { class: "help" }, menu
      ? "Jedi in cene vpišite sami. Spremembo vidite v predogledu takoj, ko jo shranimo."
      : "Storitve in cene vpišite sami. Spremembo vidite v predogledu takoj, ko jo shranimo."),
  );
  // "Cena po dogovoru" for the whole list in one tap; the owner's choice, so publishing isn't held up by it.
  if (d.onRequest) {
    const items = groups.flatMap((gr) => gr.items);
    if (items.every((it) => isPriceOnRequest(it.price))) box.append(h("p", { class: "help pl-all-onreq" }, "Vse cene so po dogovoru. Ceno postavke vpišete, ko jo odprete."));
    else
      box.append(
        h("div", { class: "pl-tools" },
          h("button", {
            class: "btn sm",
            type: "button",
            id: `pl-onreq-${d.sectionId}`,
            onClick: () => {
              const typed = items.some((it) => !isPriceOnRequest(it.price) && !("$placeholder" in (it.price as object)));
              if (typed && !confirm("Vse cene na seznamu bodo »po dogovoru«, tudi tiste, ki ste jih že vpisali. Nadaljujem?")) return;
              structural((s, at) => listEdits.allOnRequest(s, at), "vse cene po dogovoru");
            },
          }, "Vse cene po dogovoru"),
        ),
      );
  }

  // ---------- Heading fields: each saves on its own path (never the whole props, which holds the list) ----------
  const head = h("div", { class: "pl-head" });
  const props = (((d.spec() as { pages: { sections: { props: Record<string, unknown> }[] }[] }).pages[first.page]?.sections[first.section]?.props) ?? {}) as Record<string, unknown>;
  for (const [key, title] of HEAD_FIELDS) {
    const schema = d.props.properties?.[key];
    if (!schema) continue;
    const required = (d.props.required ?? []).includes(key);
    const max = schema.maxLength ?? 200;
    const input = max > 120 ? h("textarea", { rows: 2, maxlength: max }) : h("input", { type: "text", maxlength: max });
    input.value = typeof props[key] === "string" ? (props[key] as string) : "";
    const err = h("div", { class: "err", role: "status" });
    const later = d.later(() => {
      const v = input.value.trim();
      d.save(build((spec, at) => {
        const ptr = `/pages/${at.page}/sections/${at.section}/props/${key}`;
        const guard: PatchOp = { op: "test", path: `/pages/${at.page}/sections/${at.section}/id`, value: at.id };
        const has = (spec as { pages: { sections: { props: Record<string, unknown> }[] }[] }).pages[at.page]?.sections[at.section]?.props[key] !== undefined;
        if (!v) return has ? [guard, { op: "remove", path: ptr }] : [];
        return [guard, { op: "add", path: ptr, value: v }];
      }), `${title.toLowerCase()}`, false);
    });
    input.addEventListener("input", () => {
      if (required && !input.value.trim()) {
        err.textContent = "Polje ne sme biti prazno.";
        input.setAttribute("aria-invalid", "true");
        return later.cancel();
      }
      err.textContent = "";
      input.removeAttribute("aria-invalid");
      later.push();
    });
    head.append(h("div", { class: "field", "data-path": `${base}/${key}` }, h("label", {}, required ? title : `${title} (neobvezno)`), input, err));
  }

  // ---------- Groups ----------
  groups.forEach((group, g) => {
    const gBox = h("section", { class: "pl-group", "data-path": `${base}/${shape.groups}/${g}`, "aria-label": group.name ? `Skupina ${group.name}` : `Skupina ${g + 1}` });
    const name = h("input", { type: "text", maxlength: shape.groupNameMax, placeholder: menu ? "npr. Juhe" : groups.length > 1 ? "npr. Striženje" : "Brez imena (ena skupina ga ne potrebuje)" });
    name.value = group.name ?? "";
    const nameErr = h("div", { class: "err", role: "status" });
    const rename = d.later(() => d.save(build((spec, at) => listEdits.renameGroup(spec, at, g, name.value)), "ime skupine", false));
    name.addEventListener("input", () => {
      if (shape.groupNameRequired && !name.value.trim()) {
        nameErr.textContent = "Skupina jedi potrebuje ime.";
        name.setAttribute("aria-invalid", "true");
        return rename.cancel();
      }
      nameErr.textContent = "";
      name.removeAttribute("aria-invalid");
      rename.push();
    });
    const gLabel = group.name || `skupina ${g + 1}`;
    gBox.append(
      h("div", { class: "pl-ghead" },
        h("div", { class: "pl-gname" }, h("label", {}, menu ? "Ime skupine jedi" : "Ime skupine"), name, nameErr),
        h("div", { class: "pl-move", role: "group", "aria-label": `Premik skupine ${gLabel}` },
          h("button", { class: "icon", type: "button", "aria-label": `Skupino ${gLabel} premakni gor`, title: "Gor", disabled: g === 0, onClick: () => { swapOpenGroup(d, g, g - 1); structural((s, at) => listEdits.moveGroup(s, at, g, g - 1), "premik skupine"); } }, "↑"),
          h("button", { class: "icon", type: "button", "aria-label": `Skupino ${gLabel} premakni dol`, title: "Dol", disabled: g === groups.length - 1, onClick: () => { swapOpenGroup(d, g, g + 1); structural((s, at) => listEdits.moveGroup(s, at, g, g + 1), "premik skupine"); } }, "↓"),
        ),
      ),
    );

    const ol = h("ol", { class: "pl-items" });
    group.items.forEach((item, i) => ol.append(itemRow(d, { type, g, i, item, count: group.items.length, groups, word, build, structural, base })));
    gBox.append(ol);

    const full = group.items.length >= shape.maxItems;
    gBox.append(
      h("div", { class: "pl-gtools" },
        h("button", {
          class: "btn sm",
          type: "button",
          disabled: full,
          onClick: () => {
            d.ui.open = itemKey(d.sectionId, g, group.items.length);
            d.ui.focus = "name";
            structural((s, at) => listEdits.addItem(s, at, g), "nova vrstica");
          },
        }, `+ Dodaj ${word.item}`),
        groups.length > 1
          ? h("button", {
              class: "btn sm quiet danger",
              type: "button",
              onClick: () => {
                if (!confirm(`Izbrišem ${word.group} »${gLabel}« z vsemi ${word.items}?`)) return;
                d.ui.open = null;
                structural((s, at) => listEdits.removeGroup(s, at, g), "izbrisana skupina");
              },
            }, `Izbriši ${word.group}`)
          : null,
      ),
    );
    if (full) gBox.append(h("p", { class: "help" }, `V eni skupini je lahko največ ${shape.maxItems} postavk.`));
    box.append(gBox);
  });

  box.append(
    h("button", {
      class: "btn",
      type: "button",
      disabled: groups.length >= shape.maxGroups,
      onClick: () => {
        d.ui.open = itemKey(d.sectionId, groups.length, 0);
        d.ui.focus = "name";
        structural((s, at) => listEdits.addGroup(s, at), "nova skupina");
      },
    }, `+ Dodaj ${word.group}`),
    // The heading and the note under the list come last: the list is what owners come to change.
    h("h3", { class: "pl-head-title" }, "Naslov in opomba"),
    head,
  );

  // Focus the field asked for once the panel is in the page.
  if (d.ui.focus && d.ui.open?.startsWith(`${d.sectionId}:`)) {
    const which = d.ui.focus;
    d.ui.focus = null;
    window.setTimeout(() => {
      const el = box.querySelector<HTMLInputElement>(`.pl-item.is-open [data-field="${which}"]`);
      el?.focus();
      el?.select();
      el?.closest(".pl-item")?.scrollIntoView({ block: "nearest" });
    }, 0);
  }
  return box;
}

interface RowCtx {
  type: PriceListType;
  g: number;
  i: number;
  item: ListItem;
  count: number;
  groups: { name?: string; items: ListItem[] }[];
  word: { item: string; items: string; group: string };
  build: (f: (spec: unknown, at: ListAt) => PatchOp[] | null) => () => PatchOp[] | null;
  structural: (f: (spec: unknown, at: ListAt) => PatchOp[] | null, message: string) => void;
  base: string;
}

let rowSeq = 0;

/** One item: a summary line (name, price as on the site) with up/down, and its fields when opened. */
function itemRow(d: PriceEditorDeps, c: RowCtx): HTMLElement {
  const { h } = d;
  const { type, g, i, groups, word, build, structural } = c;
  const shape = LIST_SHAPE[type];
  const key = itemKey(d.sectionId, g, i);
  const open = d.ui.open === key;
  /** The item as the fields show it; every save sends all of it. */
  const draft: ListItem = structuredClone(c.item);
  const bodyId = `pl-body-${++rowSeq}`;

  const nameText = h("span", { class: "pl-name" });
  const priceText = h("span", { class: "pl-price" });
  const offText = h("span", { class: "pl-off" }, "ni na voljo");
  const paint = () => {
    nameText.textContent = draft.name.trim() || "(brez imena)";
    const label = priceLabel(draft.price);
    priceText.textContent = label ?? "Manjka cena";
    priceText.classList.toggle("missing", label === null);
    offText.hidden = draft.unavailable !== true;
    li.classList.toggle("is-off", draft.unavailable === true);
  };

  const li = h("li", { class: open ? "pl-item is-open" : "pl-item", "data-path": `${c.base}/${shape.groups}/${g}/${shape.items}/${i}` });
  const toggle = h("button", { class: "pl-sum", type: "button", "aria-expanded": String(open), "aria-controls": bodyId }, nameText, priceText, offText);
  toggle.addEventListener("click", () => {
    const now = !li.classList.contains("is-open");
    // One item open at a time keeps the list short on a phone.
    li.closest(".pl")?.querySelectorAll<HTMLElement>(".pl-item.is-open").forEach((o) => {
      if (o === li) return;
      o.classList.remove("is-open");
      o.querySelector(".pl-sum")?.setAttribute("aria-expanded", "false");
      o.querySelector<HTMLElement>(".pl-body")!.hidden = true;
    });
    li.classList.toggle("is-open", now);
    toggle.setAttribute("aria-expanded", String(now));
    body.hidden = !now;
    d.ui.open = now ? key : null;
  });
  const itemName = () => draft.name.trim() || word.item;
  li.append(
    h("div", { class: "pl-row" },
      toggle,
      h("div", { class: "pl-move", role: "group", "aria-label": `Premik: ${itemName()}` },
        h("button", { class: "icon", type: "button", "aria-label": `Premakni gor: ${itemName()}`, title: "Gor", disabled: i === 0, onClick: () => { swapOpen(d, itemKey(d.sectionId, g, i), itemKey(d.sectionId, g, i - 1)); structural((s, at) => listEdits.moveItem(s, at, g, i, g, i - 1), "premik"); } }, "↑"),
        h("button", { class: "icon", type: "button", "aria-label": `Premakni dol: ${itemName()}`, title: "Dol", disabled: i === c.count - 1, onClick: () => { swapOpen(d, itemKey(d.sectionId, g, i), itemKey(d.sectionId, g, i + 1)); structural((s, at) => listEdits.moveItem(s, at, g, i, g, i + 1), "premik"); } }, "↓"),
      ),
    ),
  );

  // ---------- Fields ----------
  /** Saves the whole item, unless a field holds something that can't be saved (an empty name, an unreadable price). */
  const send = () => {
    if (!draft.name.trim() || !readPrice()) return;
    d.save(build((s, at) => listEdits.setItem(s, at, g, i, draft)), `${draft.name.trim()}`.slice(0, 120), false);
  };
  const later = d.later(send);
  /** Checkboxes and choices save without waiting for a pause. */
  const now = () => {
    later.cancel();
    send();
  };

  const name = h("input", { type: "text", maxlength: shape.nameMax, "data-field": "name", autocomplete: "off" });
  name.value = draft.name;
  const nameErr = h("div", { class: "err", role: "status" });
  name.addEventListener("input", () => {
    draft.name = name.value;
    paint();
    if (!name.value.trim()) {
      nameErr.textContent = "Ime ne sme biti prazno.";
      name.setAttribute("aria-invalid", "true");
      return later.cancel();
    }
    nameErr.textContent = "";
    name.removeAttribute("aria-invalid");
    later.push();
  });

  const current = draft.price as { amount?: number; from?: boolean; unit?: string; $placeholder?: string; onRequest?: true };
  // "Cena po dogovoru": one tap instead of an amount; shown when the switch is on, or to take one back.
  const onReq = d.onRequest || current.onRequest === true ? h("input", { type: "checkbox", checked: current.onRequest === true, "data-field": "on-request" }) : null;
  const price = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", "data-field": "price", placeholder: "npr. 12,50", maxlength: 16 });
  price.value = typeof current.amount === "number" ? priceInputValue(current.amount) : "";
  const unit = h("input", { type: "text", maxlength: shape.unitMax, autocomplete: "off", placeholder: "npr. / kos, na osebo" });
  unit.value = current.unit ?? "";
  const from = h("input", { type: "checkbox", checked: current.from === true });
  const shown = h("p", { class: "help pl-shown", "aria-live": "polite" });
  const priceErr = h("div", { class: "err", role: "status" });
  /** Reads the three price fields into the draft; false while the amount can't be read. */
  const readPrice = (): boolean => {
    const asked = onReq?.checked === true;
    for (const el of [price, unit, from]) el.disabled = asked;
    if (asked) {
      draft.price = { ...PRICE_ON_REQUEST };
      priceErr.textContent = "";
      price.removeAttribute("aria-invalid");
      shown.textContent = `Na strani: ${priceLabel(draft.price)}`;
      shown.classList.remove("warn");
      paint();
      return true;
    }
    const parsed = parsePriceInput(price.value);
    if (parsed.kind === "error") {
      priceErr.textContent = parsed.message;
      price.setAttribute("aria-invalid", "true");
      shown.textContent = "";
      return false;
    }
    if (parsed.kind === "ok" && parsed.from) from.checked = true;
    priceErr.textContent = "";
    price.removeAttribute("aria-invalid");
    // A price that is still missing keeps its placeholder as it is (with the hint the generator left).
    if (parsed.kind !== "empty" || !("$placeholder" in draft.price)) draft.price = priceValue(parsed, { from: from.checked, unit: unit.value });
    const label = priceLabel(draft.price);
    shown.textContent = label ? `Na strani: ${label}` : "Brez cene. Dokler je ne vpišete, strani ni mogoče objaviti.";
    shown.classList.toggle("warn", !label);
    paint();
    return true;
  };
  readPrice();
  price.addEventListener("input", () => (readPrice() ? later.push() : later.cancel()));
  // Show the amount the way it will be read back ("12.5" becomes "12,50").
  price.addEventListener("change", () => {
    const p = parsePriceInput(price.value);
    if (p.kind === "ok") price.value = priceInputValue(p.amount);
  });
  unit.addEventListener("input", () => (readPrice() ? later.push() : later.cancel()));
  from.addEventListener("change", now);
  // Back from "po dogovoru": the amount still in the field, or a missing price again.
  onReq?.addEventListener("change", () => (readPrice() ? now() : later.cancel()));

  const detail = h("textarea", { rows: 2, maxlength: shape.detailMax });
  detail.value = (draft[shape.detail] as string | undefined) ?? "";
  detail.addEventListener("input", () => {
    draft[shape.detail] = detail.value;
    later.push();
  });

  const off = h("input", { type: "checkbox", checked: draft.unavailable === true });
  off.addEventListener("change", () => {
    draft.unavailable = off.checked;
    paint();
    now();
  });

  // data-path on the fields, so a checklist entry (starter name, missing price) focuses the right one.
  const itemPath = `${c.base}/${shape.groups}/${g}/${shape.items}/${i}`;
  const body = h("div", { class: "pl-body", id: bodyId, hidden: !open });
  body.append(
    h("div", { "data-path": `${itemPath}/name` }, h("label", {}, "Ime"), name, nameErr),
    h("div", { class: "pl-price-row" },
      h("div", { "data-path": `${itemPath}/price` }, h("label", {}, "Cena (€)"), price),
      h("div", {}, h("label", {}, "Enota (neobvezno)"), unit),
    ),
    priceErr,
    ...(onReq ? [h("label", { class: "pl-onreq" }, onReq, " Cena po dogovoru (namesto zneska)")] : []),
    shown,
    h("label", {}, from, " Prikaži kot »od« (najnižja cena)"),
    h("label", {}, type === "menu" ? "Opis jedi (neobvezno)" : "Opis (neobvezno)"), detail,
  );

  if (type === "menu") {
    const tags = new Set(draft.tags ?? []);
    const fs = h("fieldset", { class: "pl-tags" }, h("legend", {}, "Oznake"));
    for (const t of MENU_TAGS) {
      const cb = h("input", { type: "checkbox", checked: tags.has(t), disabled: !tags.has(t) && tags.size >= 4 });
      cb.addEventListener("change", () => {
        if (cb.checked) tags.add(t);
        else tags.delete(t);
        draft.tags = MENU_TAGS.filter((x) => tags.has(x));
        // At most four tags (spec limit): the others wait until one is cleared.
        fs.querySelectorAll<HTMLInputElement>("input").forEach((x) => (x.disabled = !x.checked && tags.size >= 4));
        now();
      });
      fs.append(h("label", {}, cb, ` ${ENUM_LABEL[t] ?? t}`));
    }
    body.append(fs);
  }

  body.append(h("label", { class: "pl-offbox" }, off, " Trenutno ni na voljo (ostane na seznamu z opombo)"));

  if (groups.length > 1) {
    const sel = h("select", {}, ...groups.map((gr, k) => h("option", { value: String(k), selected: k === g, disabled: k !== g && gr.items.length >= shape.maxItems }, gr.name || `Skupina ${k + 1}`)));
    sel.addEventListener("change", () => {
      const to = Number(sel.value);
      if (to === g) return;
      d.ui.open = itemKey(d.sectionId, to, groups[to]!.items.length);
      structural((s, at) => listEdits.moveItem(s, at, g, i, to, groups[to]!.items.length), "premik v skupino");
    });
    body.append(h("label", {}, "Skupina"), sel);
    if (c.count <= 1) sel.disabled = true;
  }

  body.append(
    h("div", { class: "pl-btools" },
      h("button", {
        class: "btn sm quiet danger",
        type: "button",
        disabled: c.count <= 1,
        onClick: () => {
          if (!confirm(`Izbrišem ${word.item} »${itemName()}«?`)) return;
          d.ui.open = null;
          structural((s, at) => listEdits.removeItem(s, at, g, i), "izbrisana vrstica");
        },
      }, `Izbriši ${word.item}`),
      c.count <= 1 ? h("span", { class: "help" }, `Zadnje ${word.item === "jed" ? "jedi" : "postavke"} v skupini ne morete izbrisati; izbrišite skupino.`) : null,
    ),
  );
  li.append(body);
  paint();
  return li;
}
