/**
 * Owner editing of price lists ("price-list") and menus ("menu") in the dashboard, with no model call:
 * Slovene price input and every change as RFC 6902 operations against the spec. Pure functions over
 * plain JSON, no zod at run time, so the editor bundle can import them (`@sb/spec/price-edit`).
 *
 * Every builder starts with a "test" of the section id, so a save addressed by index is refused when
 * the section moved meanwhile, and re-points translation overlays when groups or items move or go,
 * so an English overlay keeps following the item it translates.
 */
import { EDITOR_STARTER_TEXT } from "./starter.ts";
import { formatPrice } from "./format.ts";

export type PriceListType = "price-list" | "menu";

export function isPriceListType(t: unknown): t is PriceListType {
  return t === "price-list" || t === "menu";
}

/** The two shapes: where groups and items live, and their limits (equal to the zod schemas; a test checks). */
export interface ListShape {
  groups: "groups" | "categories";
  items: "items" | "dishes";
  /** The optional line under the name. */
  detail: "note" | "description";
  detailMax: number;
  nameMax: number;
  groupNameMax: number;
  /** price-list groups may go without a name (one group); menu categories always have one. */
  groupNameRequired: boolean;
  maxGroups: number;
  maxItems: number;
  unitMax: number;
  /** Starter text of a new item: a publish blocker until the owner renames it. */
  newItem: string;
}

export const LIST_SHAPE: Record<PriceListType, ListShape> = {
  "price-list": { groups: "groups", items: "items", detail: "note", detailMax: 120, nameMax: 80, groupNameMax: 60, groupNameRequired: false, maxGroups: 8, maxItems: 20, unitMax: 20, newItem: EDITOR_STARTER_TEXT.priceItem! },
  menu: { groups: "categories", items: "dishes", detail: "description", detailMax: 160, nameMax: 80, groupNameMax: 60, groupNameRequired: true, maxGroups: 10, maxItems: 20, unitMax: 20, newItem: EDITOR_STARTER_TEXT.menuDish! },
};

/** Menu dietary tags (the spec's MenuTag; a test keeps them equal). */
export const MENU_TAGS = ["vegetarian", "vegan", "gluten-free", "lactose-free", "spicy", "local"] as const;

// ---------- Price input ----------

export type PriceInput = { kind: "empty" } | { kind: "ok"; amount: number; from: boolean } | { kind: "error"; message: string };

const MAX_AMOUNT = 1_000_000;
const FORMAT_HINT = "Vpišite ceno v evrih, na primer 12,50.";

/**
 * What the owner typed in a price field, read the way Slovenes write prices: "12,50", "12.5", "12 €",
 * "12,-", "1.200", "1.200,50", "od 25 €" (sets "od"). Thousands may be grouped with dots or spaces.
 * "1,200" is refused as ambiguous (1.200 € or 1,20 €?), a unit after the amount points to the unit field.
 */
export function parsePriceInput(raw: string): PriceInput {
  // \s covers the no-break spaces a copied price may carry ("12,50 €" from a Slovene page).
  let s = raw.replace(/\s+/g, " ").trim().toLowerCase();
  if (!s) return { kind: "empty" };
  let from = false;
  const od = /^(od|from)\b\s*/.exec(s);
  if (od) {
    from = true;
    s = s.slice(od[0].length);
  }
  s = s
    .replace(/^(€|eur)\s*/, "")
    .replace(/\s*(€|eur|euro|evro|evra|evri|evrov)\.?$/, "")
    .replace(/,-$/, "")
    .trim();
  // Spaces between groups of three digits: "1 200".
  s = s.replace(/(\d) (?=\d{3}(\D|$))/g, "$1");
  if (/^\d[\d.,]*\s*(€|eur)?\s*[/a-zčšž]/.test(s)) return { kind: "error", message: "Enoto (na primer / kos ali na osebo) vpišite v polje Enota, tukaj samo znesek." };
  if (/^-/.test(s)) return { kind: "error", message: "Cena ne more biti negativna." };
  let amount: number;
  if (/^\d+$/.test(s)) amount = Number(s);
  else if (/^\d+[.,]\d{1,2}$/.test(s)) amount = Number(s.replace(",", "."));
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) amount = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s)) amount = Number(s.replace(/,/g, ""));
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) return { kind: "error", message: `Ali mislite ${s.replace(",", ".")} € ali ${s.split(",")[0]},${s.split(",")[1]!.slice(0, 2)} €? Tisoče ločite s piko (1.200), cente z vejico (1,20).` };
  else return { kind: "error", message: FORMAT_HINT };
  if (!Number.isFinite(amount)) return { kind: "error", message: FORMAT_HINT };
  if (amount > MAX_AMOUNT) return { kind: "error", message: "Znesek je prevelik." };
  return { kind: "ok", amount: Math.round(amount * 100) / 100, from };
}

/** An amount as the owner edits it: "12,50", "12", "1200" (no grouping, so it reads back as typed). */
export function priceInputValue(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(".", ",");
}

interface PriceValue {
  amount: number;
  from?: boolean;
  unit?: string;
}
type PriceLike = PriceValue | { $placeholder: string; note?: string };

const isPricePlaceholder = (p: unknown): p is { $placeholder: string } => !!p && typeof p === "object" && "$placeholder" in p;

/** A price as the published site shows it in Slovene ("od 12,50 € / kos"), or null for a missing one. */
export function priceLabel(price: unknown): string | null {
  if (!price || typeof price !== "object" || isPricePlaceholder(price)) return null;
  const p = price as PriceValue;
  if (typeof p.amount !== "number") return null;
  return `${p.from ? "od " : ""}${formatPrice(p.amount)}${p.unit ? ` ${p.unit}` : ""}`;
}

/** The spec value for a price field: the parsed amount with "od" and unit, or a price placeholder when empty. */
export function priceValue(input: Exclude<PriceInput, { kind: "error" }>, opts: { from?: boolean; unit?: string } = {}): PriceLike {
  if (input.kind === "empty") return { $placeholder: "price" };
  const unit = opts.unit?.trim();
  return { amount: input.amount, ...(input.from || opts.from ? { from: true } : {}), ...(unit ? { unit } : {}) };
}

// ---------- Spec operations ----------

export interface PatchOp {
  op: "add" | "remove" | "replace" | "move" | "test";
  path: string;
  from?: string;
  value?: unknown;
}

/** Where the list is: page and section index as the editor sees them, and the section's id (guarded). */
export interface ListAt {
  page: number;
  section: number;
  id: string;
}

export interface ListItem {
  name: string;
  price: PriceLike;
  note?: string;
  description?: string;
  tags?: string[];
  unavailable?: boolean;
  [k: string]: unknown;
}

export interface ListGroup {
  name?: string;
  items: ListItem[];
}

type Obj = Record<string, unknown>;

interface Located {
  type: PriceListType;
  shape: ListShape;
  /** Pointer to the groups array. */
  list: string;
  groups: ListGroup[];
  guard: PatchOp;
}

/** The list at `at` in this spec, or null when that section is gone, moved or not a price list. */
function locate(spec: unknown, at: ListAt): Located | null {
  const pages = (spec as { pages?: unknown[] } | null)?.pages;
  const section = ((pages?.[at.page] as Obj | undefined)?.sections as Obj[] | undefined)?.[at.section];
  if (!section || section.id !== at.id || !isPriceListType(section.type)) return null;
  const shape = LIST_SHAPE[section.type];
  const groups = ((section.props as Obj | undefined)?.[shape.groups] ?? []) as ListGroup[];
  if (!Array.isArray(groups)) return null;
  const base = `/pages/${at.page}/sections/${at.section}`;
  return { type: section.type, shape, list: `${base}/props/${shape.groups}`, groups, guard: { op: "test", path: `${base}/id`, value: at.id } };
}

/** Items of group g, normalised to the shape's key. */
const itemsOf = (l: Located, g: number): ListItem[] | null => {
  const items = (l.groups[g] as Obj | undefined)?.[l.shape.items];
  return Array.isArray(items) ? (items as ListItem[]) : null;
};

/** Where an element at index k of an array ends up after moving the one at `from` to `to`. */
export function movedIndex(k: number, from: number, to: number): number {
  if (k === from) return to;
  if (from < to && k > from && k <= to) return k - 1;
  if (from > to && k >= to && k < from) return k + 1;
  return k;
}

/**
 * Re-points translation overlays under the list after a structural change. `map` gets a group index and,
 * for pointers inside an item, the item index; it returns the new indices, or null when that part is gone.
 */
function translationOps(spec: unknown, l: Located, map: (g: number, i: number | null) => [number, number | null] | null): PatchOp[] {
  const out: PatchOp[] = [];
  const translations = ((spec as Obj).translations ?? {}) as Record<string, Record<string, string> | undefined>;
  const prefix = `${l.list}/`;
  for (const [locale, overlay] of Object.entries(translations)) {
    if (!overlay) continue;
    let changed = false;
    const next: Record<string, string> = {};
    for (const [ptr, text] of Object.entries(overlay)) {
      if (!ptr.startsWith(prefix)) {
        next[ptr] = text;
        continue;
      }
      const rest = ptr.slice(prefix.length).split("/");
      const g = Number(rest[0]);
      const inItem = rest[1] === l.shape.items && /^\d+$/.test(rest[2] ?? "");
      const moved = Number.isInteger(g) ? map(g, inItem ? Number(rest[2]) : null) : [g, null];
      if (!moved) {
        changed = true;
        continue;
      }
      const parts = inItem ? [String(moved[0]), rest[1]!, String(moved[1]), ...rest.slice(3)] : [String(moved[0]), ...rest.slice(1)];
      const np = prefix + parts.join("/");
      if (np !== ptr) changed = true;
      next[np] = text;
    }
    if (changed) out.push({ op: "replace", path: `/translations/${locale}`, value: next });
  }
  return out;
}

/** The item as the spec stores it: trimmed, empty optional fields left out, other keys kept. */
export function cleanItem(type: PriceListType, item: ListItem): ListItem {
  const shape = LIST_SHAPE[type];
  const out: ListItem = { ...item, name: item.name.trim() };
  for (const k of ["note", "description"] as const) {
    if (k !== shape.detail) delete out[k];
    else if (typeof out[k] === "string" && out[k]!.trim()) out[k] = out[k]!.trim();
    else delete out[k];
  }
  if (type !== "menu" || !out.tags?.length) delete out.tags;
  if (out.unavailable !== true) delete out.unavailable;
  if (!isPricePlaceholder(out.price)) {
    const price: PriceValue = { ...(out.price as PriceValue) };
    const unit = price.unit?.trim();
    if (unit) price.unit = unit;
    else delete price.unit;
    if (price.from !== true) delete price.from;
    out.price = price;
  }
  return out;
}

export function newItem(type: PriceListType): ListItem {
  return { name: LIST_SHAPE[type].newItem, price: { $placeholder: "price" } };
}

/**
 * The editor's operations on one price list or menu. Each returns the JSON Patch for the spec as it is
 * now, or null when the change isn't possible (the section moved or is gone, an index is out of range,
 * a limit is reached, or the last item or group would go).
 */
export const listEdits = {
  addGroup(spec: unknown, at: ListAt): PatchOp[] | null {
    const l = locate(spec, at);
    if (!l || l.groups.length >= l.shape.maxGroups) return null;
    return [l.guard, { op: "add", path: `${l.list}/-`, value: { name: EDITOR_STARTER_TEXT.priceGroup!, [l.shape.items]: [newItem(l.type)] } }];
  },

  /** An empty name removes it on a price list (one group needs none); a menu category must keep one. */
  renameGroup(spec: unknown, at: ListAt, g: number, name: string): PatchOp[] | null {
    const l = locate(spec, at);
    const group = l?.groups[g];
    if (!l || !group) return null;
    const v = name.trim();
    if (v.length > l.shape.groupNameMax) return null;
    if (!v) return l.shape.groupNameRequired ? null : group.name === undefined ? [] : [l.guard, { op: "remove", path: `${l.list}/${g}/name` }];
    return [l.guard, { op: group.name === undefined ? "add" : "replace", path: `${l.list}/${g}/name`, value: v }];
  },

  moveGroup(spec: unknown, at: ListAt, g: number, to: number): PatchOp[] | null {
    const l = locate(spec, at);
    if (!l || g === to || !l.groups[g] || to < 0 || to >= l.groups.length) return null;
    return [l.guard, { op: "move", from: `${l.list}/${g}`, path: `${l.list}/${to}` }, ...translationOps(spec, l, (k, i) => [movedIndex(k, g, to), i])];
  },

  removeGroup(spec: unknown, at: ListAt, g: number): PatchOp[] | null {
    const l = locate(spec, at);
    if (!l || !l.groups[g] || l.groups.length <= 1) return null;
    return [l.guard, { op: "remove", path: `${l.list}/${g}` }, ...translationOps(spec, l, (k, i) => (k === g ? null : [k > g ? k - 1 : k, i]))];
  },

  addItem(spec: unknown, at: ListAt, g: number): PatchOp[] | null {
    const l = locate(spec, at);
    const items = l && itemsOf(l, g);
    if (!l || !items || items.length >= l.shape.maxItems) return null;
    return [l.guard, { op: "add", path: `${l.list}/${g}/${l.shape.items}/-`, value: newItem(l.type) }];
  },

  /**
   * Saves the whole item (name, price, detail, tags, unavailable). The whole item, not the one field: the
   * fact check reads "Name: 12 €" from it, so the owner's save counts for the name it is shown with.
   */
  setItem(spec: unknown, at: ListAt, g: number, i: number, item: ListItem): PatchOp[] | null {
    const l = locate(spec, at);
    const items = l && itemsOf(l, g);
    if (!l || !items?.[i] || !item.name.trim()) return null;
    return [l.guard, { op: "replace", path: `${l.list}/${g}/${l.shape.items}/${i}`, value: cleanItem(l.type, item) }];
  },

  /** Moves an item within its group (up, down) or to the end of another group. */
  moveItem(spec: unknown, at: ListAt, g: number, i: number, toG: number, toI: number): PatchOp[] | null {
    const l = locate(spec, at);
    const from = l && itemsOf(l, g);
    const target = l && itemsOf(l, toG);
    if (!l || !from?.[i] || !target) return null;
    if (g === toG) {
      if (i === toI || toI < 0 || toI >= from.length) return null;
      return [
        l.guard,
        { op: "move", from: `${l.list}/${g}/${l.shape.items}/${i}`, path: `${l.list}/${g}/${l.shape.items}/${toI}` },
        ...translationOps(spec, l, (k, j) => [k, k === g && j !== null ? movedIndex(j, i, toI) : j]),
      ];
    }
    // Into another group: this one keeps at least one item, the other stays within its limit.
    if (from.length <= 1 || target.length >= l.shape.maxItems || toI < 0 || toI > target.length) return null;
    return [
      l.guard,
      { op: "move", from: `${l.list}/${g}/${l.shape.items}/${i}`, path: `${l.list}/${toG}/${l.shape.items}/${toI}` },
      ...translationOps(spec, l, (k, j) => {
        if (j === null) return [k, j];
        if (k === g) return j === i ? [toG, toI] : [k, j > i ? j - 1 : j];
        if (k === toG) return [k, j >= toI ? j + 1 : j];
        return [k, j];
      }),
    ];
  },

  removeItem(spec: unknown, at: ListAt, g: number, i: number): PatchOp[] | null {
    const l = locate(spec, at);
    const items = l && itemsOf(l, g);
    if (!l || !items?.[i] || items.length <= 1) return null;
    return [
      l.guard,
      { op: "remove", path: `${l.list}/${g}/${l.shape.items}/${i}` },
      ...translationOps(spec, l, (k, j) => (k === g && j !== null ? (j === i ? null : [k, j > i ? j - 1 : j]) : [k, j])),
    ];
  },
};

/** The groups of the list at `at` (items under `items` whatever the type), for drawing the editor. */
export function readList(spec: unknown, at: ListAt): { type: PriceListType; shape: ListShape; groups: { name?: string; items: ListItem[] }[] } | null {
  const l = locate(spec, at);
  if (!l) return null;
  return { type: l.type, shape: l.shape, groups: l.groups.map((_, g) => ({ ...(l.groups[g]!.name !== undefined ? { name: l.groups[g]!.name } : {}), items: itemsOf(l, g) ?? [] })) };
}
