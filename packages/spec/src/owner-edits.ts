import { MAX_OWNER_EDITS, type OwnerEdit, type SiteSpec } from "./site.ts";

/**
 * The owner's own texts (spec v14 `ownerEdits`, it-keep-owner-edits): which plain values inside sections the owner
 * typed in the editor, by section id and the value's pointer inside the section. Set on every direct edit from what
 * the edit changed; a chat edit (the assistant) keeps a mark only where it left the value as it was. "Ustvari znova"
 * keeps the marked values (engine owner-text.ts).
 */

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === "object" && !Array.isArray(v);

/** A picture or a page of this site: ids that mean nothing in another version, so never kept as typed text. */
const ID_VALUE = /^(img|p|s)_[a-z0-9_-]+$/;

const unescape = (seg: string) => seg.replace(/~1/g, "/").replace(/~0/g, "~");

/** The value at a pointer inside `root` ("" is root itself), or undefined. */
export function valueAt(root: unknown, pointer: string): unknown {
  let at: unknown = root;
  for (const seg of pointer.split("/").slice(1).map(unescape)) {
    if (Array.isArray(at)) at = /^\d+$/.test(seg) ? at[Number(seg)] : undefined;
    else if (isPlain(at)) at = at[seg];
    else return undefined;
  }
  return at;
}

const plainValue = (v: unknown) => (typeof v === "string" && !ID_VALUE.test(v)) || typeof v === "number" || typeof v === "boolean";

/** Pointers (under `base`) of every plain value in `v`. */
function leaves(v: unknown, base: string, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${base}/${i}`, out));
  else if (isPlain(v)) for (const [k, x] of Object.entries(v)) leaves(x, `${base}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`, out);
  else if (plainValue(v)) out.push(base);
  return out;
}

function sectionsById(spec: SiteSpec): Map<string, unknown> {
  return new Map(spec.pages.flatMap((p) => p.sections.map((s) => [s.id, s] as const)));
}

/** Marks that still point at a plain value of an existing section, each once (the latest kept), at most MAX_OWNER_EDITS. */
function tidy(spec: SiteSpec, marks: OwnerEdit[]): OwnerEdit[] | undefined {
  const sections = sectionsById(spec);
  const seen = new Set<string>();
  const out: OwnerEdit[] = [];
  for (const m of [...marks].reverse()) {
    const key = `${m.section}${m.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const section = sections.get(m.section);
    if (section !== undefined && plainValue(valueAt(section, m.path))) out.push(m);
  }
  out.reverse();
  const capped = out.slice(-MAX_OWNER_EDITS);
  return capped.length ? capped : undefined;
}

/**
 * After a direct edit: the plain values the owner typed (the edit reduced to what changed, engine typedOps) are
 * marked, by the id of the section they are in after the edit. Marks of removed sections are dropped.
 */
export function markOwnerEdits(after: SiteSpec, typed: readonly { path: string; value?: unknown }[]): OwnerEdit[] | undefined {
  const marks = [...(after.ownerEdits ?? [])];
  for (const op of typed) {
    const m = /^\/pages\/(\d+)\/sections\/(\d+)(\/.*)?$/.exec(op.path);
    if (!m) continue;
    const section = after.pages[Number(m[1])]?.sections[Number(m[2])];
    if (!section) continue;
    for (const path of leaves(op.value, m[3] ?? "")) if (path.startsWith("/props/")) marks.push({ section: section.id, path });
  }
  return tidy(after, marks);
}

/** After a chat edit: a mark stays only where the assistant left the owner's value as it was. */
export function keepUnchangedOwnerEdits(before: SiteSpec, after: SiteSpec): OwnerEdit[] | undefined {
  const was = sectionsById(before);
  const now = sectionsById(after);
  const marks = (before.ownerEdits ?? []).filter((m) => {
    const a = valueAt(was.get(m.section), m.path);
    return a !== undefined && a === valueAt(now.get(m.section), m.path);
  });
  return tidy(after, marks);
}
