/**
 * "Cena po dogovoru" (spec v15 PriceOnRequest, it-price-on-request, owner's decision sb-price-on-request): the owner
 * chose to give a price on request instead of an amount. It is the owner's own fact, so it counts as filled (no
 * publish blocker) and is never invented: only the owner's direct edits set it (behind config `editor.priceOnRequest`).
 * The model is never offered it (OWNER_ONLY in its JSON Schema), and anything the generator, the critique or a chat
 * edit writes goes through `stripModelOnRequest`. No zod here: the editor imports it (through price-edit).
 */

export const PRICE_ON_REQUEST = { onRequest: true } as const;
export type PriceOnRequestValue = typeof PRICE_ON_REQUEST;

export function isPriceOnRequest(v: unknown): v is PriceOnRequestValue {
  return !!v && typeof v === "object" && !Array.isArray(v) && (v as Record<string, unknown>).onRequest === true;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");

export interface OnRequestPrice {
  /** Pointer of the price in the spec. */
  path: string;
  /**
   * What identifies it across an edit that moves or renames things: the section (or collection) with the pointer
   * inside it, and the section with the name of the item the price belongs to.
   */
  keys: string[];
}

/** Every price "po dogovoru" in the site's pages and collections. */
export function onRequestPrices(spec: unknown): OnRequestPrice[] {
  const out: OnRequestPrice[] = [];
  if (!isObj(spec)) return out;
  const visit = (v: unknown, path: string, scope: string, inner: string) => {
    if (Array.isArray(v)) return v.forEach((x, i) => visit(x, `${path}/${i}`, scope, `${inner}/${i}`));
    if (!isObj(v)) return;
    if (isPriceOnRequest(v.price)) {
      const label = typeof v.name === "string" ? v.name : typeof v.title === "string" ? v.title : null;
      out.push({ path: `${path}/price`, keys: [`${scope}${inner}/price`, ...(label !== null ? [`${scope}|${label.trim().toLocaleLowerCase("sl")}`] : [])] });
    }
    for (const [k, x] of Object.entries(v)) if (k !== "price") visit(x, `${path}/${esc(k)}`, scope, `${inner}/${esc(k)}`);
  };
  const pages = Array.isArray(spec.pages) ? spec.pages : [];
  pages.forEach((p, pi) => {
    const sections = isObj(p) && Array.isArray(p.sections) ? p.sections : [];
    sections.forEach((s, si) => {
      if (isObj(s)) visit(s.props, `/pages/${pi}/sections/${si}/props`, `section:${String(s.id)}`, "/props");
    });
  });
  if (isObj(spec.collections)) for (const [kind, c] of Object.entries(spec.collections)) visit(c, `/collections/${esc(kind)}`, `collection:${kind}`, "");
  return out;
}

/**
 * Takes out every price "po dogovoru" in `spec` the owner didn't set: one that `before` (the spec the model was
 * given; null for a new generation) has neither at the same place nor on the item of the same name in the same
 * section. Each becomes a price placeholder again, so the owner is asked for it. Mutates `spec`; returns the
 * pointers it changed.
 */
export function stripModelOnRequest(spec: unknown, before: unknown | null): string[] {
  const owned = new Set((before ? onRequestPrices(before) : []).flatMap((p) => p.keys));
  const stripped: string[] = [];
  for (const p of onRequestPrices(spec)) {
    if (p.keys.some((k) => owned.has(k))) continue;
    const segs = p.path.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    let at: unknown = spec;
    for (const seg of segs.slice(0, -1)) at = Array.isArray(at) ? at[Number(seg)] : (at as Obj)[seg];
    (at as Obj).price = { $placeholder: "price" };
    stripped.push(p.path);
  }
  return stripped;
}

/** Prices "po dogovoru" in `after` that `before` didn't have (by the same identity as stripModelOnRequest). */
export function addedOnRequest(before: unknown, after: unknown): string[] {
  const had = new Set(onRequestPrices(before).flatMap((p) => p.keys));
  return onRequestPrices(after)
    .filter((p) => !p.keys.some((k) => had.has(k)))
    .map((p) => p.path);
}
