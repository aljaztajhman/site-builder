/** Minimal RFC 6901 JSON Pointer helpers. */
export function parsePointer(p: string): string[] {
  if (p === "") return [];
  if (!p.startsWith("/")) throw new Error(`Invalid JSON Pointer: ${p}`);
  return p
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function escapeToken(k: string): string {
  return k.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Follows own properties only, so "/constructor/name" or "/__proto__/x" never resolve through the prototype. */
export function getAt(doc: unknown, p: string): unknown {
  let cur: unknown = doc;
  for (const key of parsePointer(p)) {
    if (cur === null || typeof cur !== "object" || !Object.hasOwn(cur, key)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Sets a string leaf in place. Throws when the parent does not exist (own properties only, as getAt). */
export function setAt(doc: unknown, p: string, value: unknown): void {
  const keys = parsePointer(p);
  const last = keys.pop();
  if (last === undefined) throw new Error("Cannot set the document root");
  let cur: unknown = doc;
  for (const key of keys) {
    if (cur === null || typeof cur !== "object" || !Object.hasOwn(cur, key)) throw new Error(`No parent for ${p}`);
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur === null || typeof cur !== "object") throw new Error(`No parent for ${p}`);
  (cur as Record<string, unknown>)[last] = value;
}

/** Calls fn for every string leaf with its pointer and the nearest object key. */
export function walkStrings(v: unknown, fn: (s: string, pointer: string, key: string) => void, p = "", key = ""): void {
  if (typeof v === "string") fn(v, p, key);
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, fn, `${p}/${i}`, key));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walkStrings(x, fn, `${p}/${escapeToken(k)}`, k);
}

/** Calls fn for every object node (not arrays) with its pointer. */
export function walkObjects(v: unknown, fn: (o: Record<string, unknown>, pointer: string) => void, p = ""): void {
  if (Array.isArray(v)) v.forEach((x, i) => walkObjects(x, fn, `${p}/${i}`));
  else if (v && typeof v === "object") {
    fn(v as Record<string, unknown>, p);
    for (const [k, x] of Object.entries(v)) walkObjects(x, fn, `${p}/${escapeToken(k)}`);
  }
}
