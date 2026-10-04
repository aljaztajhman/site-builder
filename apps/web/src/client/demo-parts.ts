/**
 * The parts of a rendered example site (header, brand, menu items, headline, buttons, photos, section
 * panels …), found by the component library's class names, and their matching across two sites by role.
 * Read only here, on the landing page's demo; published sites don't change.
 */

export type PartKind = "plate" | "part";
export type Sort = "plate" | "media" | "control" | "text";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Part {
  key: string;
  el: HTMLElement;
  kind: PartKind;
  /** Its box in the frame's viewport, set by `visible`. */
  rect: Rect;
}

const NO_RECT: Rect = { left: 0, top: 0, width: 0, height: 0 };

/** Every part of a site the transformation moves, in document order of roles. */
export function parts(doc: Document): Part[] {
  const out: Part[] = [];
  const used = new Set<Element>();
  const add = (key: string, el: Element | null | undefined, kind: PartKind = "part") => {
    if (!el || used.has(el)) return;
    used.add(el);
    out.push({ key, el: el as HTMLElement, kind, rect: NO_RECT });
  };
  const h = doc.querySelector(".site-header");
  add("header", h, "plate");
  if (h) {
    add("brand", h.querySelector(".site-header__brand"));
    add("toggle", h.querySelector(".nav-toggle"));
    h.querySelectorAll(".site-nav__list > li").forEach((li, i) => add(`nav${i}`, li));
    add("hcta", h.querySelector(".site-header__inner > .btn"));
  }
  const secs = [...doc.querySelectorAll("main > section")];
  const hero = secs[0];
  if (hero) {
    add("hero", hero, "plate");
    add("card", hero.querySelector(".label-card"), "plate");
    add("wall", hero.querySelector(".hsig__wall"));
    add("eyebrow", hero.querySelector(".eyebrow, .hsig__where"));
    add("h1", hero.querySelector("h1"));
    add("lead", hero.querySelector(".lead"));
    hero.querySelectorAll(".actions > *").forEach((a, i) => add(`act${i}`, a));
    hero.querySelectorAll("picture.media").forEach((p, i) => add(`media${i}`, p));
    hero.querySelectorAll(".hero-facts__item").forEach((f, i) => add(`fact${i}`, f));
    add("chip", hero.querySelector(".hsig__chip"));
  }
  const s2 = secs[1];
  if (s2) {
    add("s2", s2, "plate");
    add("s2title", s2.querySelector("h2"));
    const list = s2.querySelector("ul, ol, .week");
    if (list) [...list.children].slice(0, 6).forEach((li, i) => add(`s2i${i}`, li));
    s2.querySelectorAll(".actions > *").forEach((a, i) => add(`s2a${i}`, a));
  }
  // Further sections in view (a tall screen): panels without parts.
  secs.slice(2, 5).forEach((s, i) => add(`s${i + 3}`, s, "plate"));
  return out;
}

/** Keeps the parts that are in the frame's viewport with exactly one box, and records that box. */
export function visible(doc: Document): (p: Part) => boolean {
  const vh = doc.defaultView?.innerHeight ?? 0;
  return (p) => {
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
 * Section panels with no background of their own show the page's through them; once apart they would be
 * see-through. While transforming, each one gets the colour that shows behind it. Returns the undo.
 */
export function fillPanels(list: readonly Part[]): () => void {
  const done: HTMLElement[] = [];
  for (const p of list) {
    if (p.kind !== "plate") continue;
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

/** What a part is, for pairing leftovers: a panel, a photo, a control or text. */
export const sortOf = (p: Part): Sort =>
  p.kind === "plate" ? "plate" : p.el.matches("picture, img") || p.el.querySelector("picture, img") ? "media" : p.el.matches(".btn, button") ? "control" : "text";

/** Parts with a box of their own get a drop shadow while apart; on text a shadow reads as blur. */
export const boxy = (p: Part): boolean => p.kind === "plate" || sortOf(p) !== "text" || p.el.matches("li, .hero-facts__item, .label-card");

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
