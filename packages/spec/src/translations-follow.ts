import { getAt } from "./pointer.ts";

/**
 * Translation overlays (spec.translations: locale -> JSON Pointer -> text) point into the spec by array
 * index. When an edit inserts, removes, moves or copies an array element, every pointer at or after it
 * must follow, or an English overlay ends up on another section's text, and one left pointing at a
 * deleted section makes the spec invalid. `followTranslations` gives the overlays as they must be after
 * one operation; call it with the document as it is before that operation is applied.
 */

export interface StructuralOp {
  op: string;
  path: string;
  from?: string;
}

type Overlays = Record<string, Record<string, string> | undefined>;

/** "/a/b/3" -> { parent: "/a/b", index: 3 } when the parent is an array in `doc` (an append "-" gives its length). */
function arraySlot(doc: unknown, path: string, forInsert: boolean): { parent: string; index: number } | null {
  const cut = path.lastIndexOf("/");
  if (cut < 0) return null;
  const parent = path.slice(0, cut);
  const key = path.slice(cut + 1);
  const arr = getAt(doc, parent);
  if (!Array.isArray(arr)) return null;
  if (key === "-" && forInsert) return { parent, index: arr.length };
  if (!/^\d+$/.test(key)) return null;
  return { parent, index: Number(key) };
}

/** Splits a pointer under `parent` into its element index and the rest ("/x/y"), or null when it isn't under it. */
function under(ptr: string, parent: string): { index: number; rest: string } | null {
  if (!ptr.startsWith(`${parent}/`)) return null;
  const tail = ptr.slice(parent.length + 1);
  const slash = tail.indexOf("/");
  const head = slash < 0 ? tail : tail.slice(0, slash);
  if (!/^\d+$/.test(head)) return null;
  return { index: Number(head), rest: slash < 0 ? "" : tail.slice(slash) };
}

const isUnder = (ptr: string, p: string) => ptr === p || ptr.startsWith(`${p}/`);

type Entry = [string, string];

function shift(entries: Entry[], parent: string, from: number, by: 1 | -1): Entry[] {
  return entries.map(([ptr, text]) => {
    const u = under(ptr, parent);
    return u && u.index >= from ? [`${parent}/${u.index + by}${u.rest}`, text] : [ptr, text];
  });
}

/** The overlays after `op` (null when it changes nothing about them). `doc` is the spec before `op`. */
export function followTranslations(doc: unknown, op: StructuralOp): Overlays | null {
  const overlays = (getAt(doc, "/translations") ?? null) as Overlays | null;
  if (!overlays || op.path.startsWith("/translations")) return null;
  const out: Overlays = {};
  let changed = false;
  for (const [locale, overlay] of Object.entries(overlays)) {
    if (!overlay) continue;
    let entries: Entry[] = Object.entries(overlay);
    const before = JSON.stringify(entries);
    if (op.op === "remove") {
      entries = entries.filter(([ptr]) => !isUnder(ptr, op.path));
      const slot = arraySlot(doc, op.path, false);
      if (slot) entries = shift(entries, slot.parent, slot.index + 1, -1);
    } else if (op.op === "add" || op.op === "copy") {
      const slot = arraySlot(doc, op.path, true);
      // Adding to an object key replaces what was there: its overlays go with it.
      if (!slot) entries = entries.filter(([ptr]) => !isUnder(ptr, op.path) || op.path === "");
      else entries = shift(entries, slot.parent, slot.index, 1);
      // A copy takes the original's translations along.
      if (op.op === "copy" && op.from) {
        const target = slot ? `${slot.parent}/${slot.index}` : op.path;
        const src = op.from;
        const copied = Object.entries(overlay)
          .filter(([ptr]) => isUnder(ptr, src))
          .map(([ptr, text]): Entry => [`${target}${ptr.slice(src.length)}`, text]);
        entries = [...entries.filter(([ptr]) => !copied.some(([c]) => c === ptr)), ...copied];
      }
    } else if (op.op === "move" && op.from) {
      const src = op.from;
      if (op.path === src || op.path.startsWith(`${src}/`)) continue;
      // RFC 6902: a move is a remove at `from`, then an add at `path` in the document as it is after the remove.
      const carried = entries.filter(([ptr]) => isUnder(ptr, src)).map(([ptr, text]): Entry => [ptr.slice(src.length), text]);
      entries = entries.filter(([ptr]) => !isUnder(ptr, src));
      const removedSlot = arraySlot(doc, src, false);
      if (removedSlot) entries = shift(entries, removedSlot.parent, removedSlot.index + 1, -1);
      const afterRemove = removedSlot ? withoutElement(doc, removedSlot) : doc;
      const slot = arraySlot(afterRemove, op.path, true);
      if (slot) entries = shift(entries, slot.parent, slot.index, 1);
      else entries = entries.filter(([ptr]) => !isUnder(ptr, op.path));
      const target = slot ? `${slot.parent}/${slot.index}` : op.path;
      entries = [...entries, ...carried.map(([rest, text]): Entry => [`${target}${rest}`, text])];
    } else if (op.op === "replace") {
      // The subtree is new: overlays inside it are kept only where the same shape is still there (checked by the caller).
      continue;
    } else continue;
    const next = Object.fromEntries(entries);
    if (JSON.stringify(Object.entries(next)) !== before) changed = true;
    out[locale] = next;
  }
  if (!changed) return null;
  return { ...overlays, ...out };
}

/** The document with one array element taken out (a shallow copy along the path; the rest is shared). */
function withoutElement(doc: unknown, slot: { parent: string; index: number }): unknown {
  const keys = slot.parent === "" ? [] : slot.parent.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  const copy = (node: unknown, i: number): unknown => {
    if (i === keys.length) return (node as unknown[]).filter((_, k) => k !== slot.index);
    const k = keys[i]!;
    if (Array.isArray(node)) return node.map((x, j) => (String(j) === k ? copy(x, i + 1) : x));
    return { ...(node as Record<string, unknown>), [k]: copy((node as Record<string, unknown>)[k], i + 1) };
  };
  return copy(doc, 0);
}

/** Overlays whose pointer no longer reaches a string, dropped (after a replace changed a subtree's shape). */
export function pruneTranslations(doc: unknown): Overlays | null {
  const overlays = (getAt(doc, "/translations") ?? null) as Overlays | null;
  if (!overlays) return null;
  let changed = false;
  const out: Overlays = {};
  for (const [locale, overlay] of Object.entries(overlays)) {
    if (!overlay) continue;
    const kept = Object.fromEntries(Object.entries(overlay).filter(([ptr]) => typeof getAt(doc, ptr) === "string"));
    if (Object.keys(kept).length !== Object.keys(overlay).length) changed = true;
    out[locale] = kept;
  }
  return changed ? out : null;
}
