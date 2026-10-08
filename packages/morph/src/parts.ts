/**
 * Parts: the pieces of a screen that move on their own during a morph (a header, a headline, a button,
 * a photo, a list item …) and the panels they sit on (header bar, sections). A recipe names them by
 * role; two screens' parts with the same role become one another.
 */

export type PartKind = "panel" | "part";
/** What a part is, for pairing parts whose roles differ: a panel, a photo, a control or text. */
export type Sort = "panel" | "media" | "control" | "text";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Part {
  /** Its role. Parts with the same key on the old and the new screen become one another. */
  key: string;
  el: HTMLElement;
  kind: PartKind;
  /** Panels: the region whose parts turn over with it (default: its own key). */
  region?: string;
  /** Casts a shadow while apart (default: panels, photos, controls and list items; not text, where it reads as blur). */
  boxy?: boolean;
  /** Its box in the viewport, set by `visible`. */
  rect: Rect;
}

/**
 * One line of a recipe: which element(s) play a role.
 * - `select` is a CSS selector, run on the document, or inside the part named by `within`.
 * - `all` takes every match (keys get an index: `nav0`, `nav1` …); a number caps the count.
 * - `children` takes the first match's children instead of the match itself (a list's items), keys indexed.
 * - `kind: "panel"` makes it a backdrop panel that turns over with the parts on it; `region` lets a panel
 *   share another panel's region (a card inside a hero turns with the hero).
 * - `boxy` forces the drop shadow while apart on or off (a text part drawn as a tile wants it on).
 * An element plays only the first role it matches.
 */
export interface PartRule {
  key: string;
  select: string;
  within?: string;
  kind?: PartKind;
  all?: boolean | number;
  children?: boolean | number;
  region?: string;
  boxy?: boolean;
}

export type Recipe = readonly PartRule[];

const NO_RECT: Rect = { left: 0, top: 0, width: 0, height: 0 };

/** Every part a recipe names, in recipe order. */
export function findParts(root: ParentNode, recipe: Recipe): Part[] {
  const out: Part[] = [];
  const byKey = new Map<string, Element>();
  const used = new Set<Element>();
  const add = (rule: PartRule, key: string, el: Element) => {
    if (used.has(el)) return;
    used.add(el);
    byKey.set(key, el);
    const part: Part = { key, el: el as HTMLElement, kind: rule.kind ?? "part", rect: NO_RECT };
    if (part.kind === "panel") part.region = rule.region ?? key;
    if (rule.boxy !== undefined) part.boxy = rule.boxy;
    out.push(part);
  };
  const cap = (n: boolean | number | undefined) => (typeof n === "number" ? n : Infinity);
  for (const rule of recipe) {
    const scope: ParentNode | undefined = rule.within === undefined ? root : byKey.get(rule.within);
    if (!scope) continue;
    if (rule.children) {
      const first = scope.querySelector(rule.select);
      if (first) [...first.children].slice(0, cap(rule.children)).forEach((el, i) => add(rule, `${rule.key}${i}`, el));
    } else if (rule.all) {
      [...scope.querySelectorAll(rule.select)].slice(0, cap(rule.all)).forEach((el, i) => add(rule, `${rule.key}${i}`, el));
    } else {
      const el = scope.querySelector(rule.select);
      if (el) add(rule, rule.key, el);
    }
  }
  return out;
}

/** Keeps the parts that are in the viewport with exactly one box, and records that box. */
export function visible(doc: Document): (p: Part) => boolean {
  const vh = doc.defaultView?.innerHeight ?? 0;
  return (p) => {
    // An inline part broken over two lines has two boxes: it can't move as one piece.
    const rects = p.el.getClientRects();
    if (rects.length !== 1) return false;
    const r = rects[0]!;
    if (r.width < 2 || r.height < 2) return false;
    p.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    return r.bottom > 0 && r.top < vh;
  };
}

const CLEAR = "rgba(0, 0, 0, 0)";

/**
 * Panels with no background of their own show the page's through them; once apart they would be
 * see-through. While morphing, each one gets the colour that shows behind it. Returns the undo.
 */
export function fillPanels(list: readonly Part[]): () => void {
  const done: HTMLElement[] = [];
  for (const p of list) {
    if (p.kind !== "panel") continue;
    const view = p.el.ownerDocument.defaultView;
    if (!view || view.getComputedStyle(p.el).backgroundColor !== CLEAR) continue;
    let colour = "#fff";
    for (let e = p.el.parentElement; e; e = e.parentElement) {
      const c = view.getComputedStyle(e).backgroundColor;
      if (c !== CLEAR && c !== "transparent") {
        colour = c;
        break;
      }
    }
    p.el.style.backgroundColor = colour;
    done.push(p.el);
  }
  return () => {
    for (const el of done) el.style.removeProperty("background-color");
  };
}

export const sortOf = (p: Part): Sort =>
  p.kind === "panel" ? "panel" : p.el.matches("picture, img, video, svg") || p.el.querySelector("picture, img, video") ? "media" : p.el.matches(".btn, button, a[role=button]") ? "control" : "text";

/** Parts with a box of their own get a drop shadow while apart; on text a shadow reads as blur. */
export const boxy = (p: Part): boolean => p.boxy ?? (p.kind === "panel" || sortOf(p) !== "text" || p.el.matches("li"));

export interface Pair {
  o: Part;
  n: Part;
}

export interface Matching {
  pairs: Pair[];
  /** Old parts with no partner: they retract into the nearest new part's place. */
  exits: Part[];
  /** New parts with no partner: they unfold out of the nearest old part's place. */
  enters: Part[];
}

/** Same role first; leftovers pair within the same sort when their areas are within 5×. */
export function match(oldParts: readonly Part[], newParts: readonly Part[]): Matching {
  const close = (a: Part, b: Part) => {
    const r = (a.rect.width * a.rect.height) / (b.rect.width * b.rect.height);
    return r < 5 && r > 1 / 5;
  };
  const byKey = new Map(newParts.map((p) => [p.key, p]));
  const pairs: Pair[] = [];
  const oldLeft: Part[] = [];
  for (const o of oldParts) {
    const n = byKey.get(o.key);
    if (n && n.kind === o.kind) {
      pairs.push({ o, n });
      byKey.delete(o.key);
    } else oldLeft.push(o);
  }
  const order = (a: Part, b: Part) => a.rect.top - b.rect.top || a.rect.left - b.rect.left;
  const newLeft = [...byKey.values()].sort(order);
  oldLeft.sort(order);
  const exits: Part[] = [];
  for (const o of oldLeft) {
    const i = newLeft.findIndex((n) => sortOf(o) === sortOf(n) && close(o, n));
    if (i >= 0) pairs.push({ o, n: newLeft.splice(i, 1)[0]! });
    else exits.push(o);
  }
  return { pairs, exits, enters: newLeft };
}
