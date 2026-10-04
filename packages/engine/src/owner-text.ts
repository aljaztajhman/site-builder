import { describePath, isPlaceholder, validateSite, valueAt, type OwnerEdit, type SiteSpec } from "@sb/spec";

/**
 * "Ustvari znova" keeps what the owner typed in the editor (spec v14 `ownerEdits`, it-keep-owner-edits). The
 * regenerated site has new sections, so each marked value goes to the section that takes the old one's place: on
 * the same page (the homepage, else the same slug), of the same type, the same one of its kind (first, second…),
 * at the same field. Inside a list, an item that names itself (a price list's item, a dish, a team member) must
 * name itself the same in both versions, or the owner's price would land on another item; when the owner renamed
 * the item themselves, their whole item replaces the regenerated one. A value that has no such place, or would
 * make the site invalid, isn't kept; the previous version stays in the history.
 */
type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === "object" && !Array.isArray(v);
const LABEL_KEYS = ["name", "title"] as const;
const labelOf = (v: unknown): string | undefined => {
  if (!isPlain(v)) return undefined;
  for (const k of LABEL_KEYS) if (typeof v[k] === "string") return v[k] as string;
  return undefined;
};

interface Located {
  page: number;
  index: number;
  section: Plain & { id: string; type: string };
}

/** Each section by id, with what identifies its place across versions: page, type and how many of that type come before it. */
function placesOf(spec: SiteSpec): { byId: Map<string, Located & { key: string }>; byKey: Map<string, Located> } {
  const byId = new Map<string, Located & { key: string }>();
  const byKey = new Map<string, Located>();
  spec.pages.forEach((p, pi) => {
    const pageKey = p.kind === "home" ? "home" : `${p.kind}:${p.slug}`;
    const seen = new Map<string, number>();
    p.sections.forEach((s, si) => {
      const n = seen.get(s.type) ?? 0;
      seen.set(s.type, n + 1);
      const key = `${pageKey}|${s.type}|${n}`;
      const at = { page: pi, index: si, section: s as unknown as Located["section"] };
      byId.set(s.id, { ...at, key });
      byKey.set(key, at);
    });
  });
  return { byId, byKey };
}

/**
 * Puts the owner's value at `path` of `target` from `source` (both a section). Returns false when it has no place.
 * `labelMarked(prefix)` says whether the owner typed the label of the list item at `prefix` themselves.
 */
function place(target: Plain, source: Plain, path: string, labelMarked: (prefix: string) => boolean): boolean {
  const segs = path.split("/").slice(1);
  let t: unknown = target;
  let s: unknown = source;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!.replace(/~1/g, "/").replace(/~0/g, "~");
    const last = i === segs.length - 1;
    const sv = Array.isArray(s) ? s[Number(seg)] : isPlain(s) ? s[seg] : undefined;
    if (sv === undefined) return false;
    if (Array.isArray(t)) {
      if (!/^\d+$/.test(seg) || Number(seg) >= t.length) return false;
      const tv = t[Number(seg)];
      const prefix = `/${segs.slice(0, i + 1).join("/")}`;
      if (labelOf(sv) !== undefined && labelOf(sv) !== labelOf(tv)) {
        // Another item at this place: only the owner's own renamed item replaces it, whole.
        if (!labelMarked(prefix)) return false;
        t[Number(seg)] = structuredClone(sv);
        return true;
      }
      if (last) {
        t[Number(seg)] = structuredClone(sv);
        return true;
      }
      t = tv;
      s = sv;
      continue;
    }
    if (!isPlain(t)) return false;
    const tv = t[seg];
    // A missing fact (a price placeholder) or nothing there yet: the owner's whole value from here down.
    if (last || tv === undefined || isPlaceholder(tv) || typeof tv !== typeof sv || Array.isArray(tv) !== Array.isArray(sv)) {
      t[seg] = structuredClone(sv);
      return true;
    }
    t = tv;
    s = sv;
  }
  return false;
}

/** Whether `next` has a validation issue `before` hasn't. */
function newIssues(before: SiteSpec, next: SiteSpec): boolean {
  const had = new Set(validateSite(before).issues.map((i) => `${i.path}|${i.message}`));
  return validateSite(next).issues.some((i) => !had.has(`${i.path}|${i.message}`));
}

export interface OwnerTextResult {
  spec: SiteSpec;
  /** Pointers into the regenerated spec of every value kept. */
  kept: string[];
  /** Where each value that couldn't be kept was, in the replaced version's words ("Domov › Glava › Naslov"). */
  dropped: string[];
}

export function keepOwnerText(current: SiteSpec, regenerated: SiteSpec): OwnerTextResult {
  const marks = current.ownerEdits ?? [];
  let spec: SiteSpec = { ...structuredClone(regenerated) };
  delete spec.ownerEdits;
  if (!marks.length) return { spec, kept: [], dropped: [] };
  const from = placesOf(current);
  const kept: string[] = [];
  const keptMarks: OwnerEdit[] = [];
  const dropped: string[] = [];
  const marksOf = new Map<string, Set<string>>();
  for (const m of marks) marksOf.set(m.section, (marksOf.get(m.section) ?? new Set()).add(m.path));
  for (const m of marks) {
    const src = from.byId.get(m.section);
    const to = src ? placesOf(spec).byKey.get(src.key) : undefined;
    const where = src ? describePath(current, `/pages/${src.page}/sections/${src.index}${m.path}`) : null;
    // Already the same (the regeneration wrote the same, or an earlier mark carried it): kept without a change.
    if (src && to && valueAt(to.section, m.path) !== undefined && valueAt(to.section, m.path) === valueAt(src.section, m.path)) {
      kept.push(`/pages/${to.page}/sections/${to.index}${m.path}`);
      keptMarks.push({ section: to.section.id, path: m.path });
      continue;
    }
    if (!src || !to) {
      if (where) dropped.push(where);
      continue;
    }
    // One value at a time on a copy, kept only when the site stays valid with it.
    const next = structuredClone(spec);
    const target = next.pages[to.page]!.sections[to.index] as unknown as Plain;
    const own = marksOf.get(m.section)!;
    const ok = place(target, src.section, m.path, (prefix) => LABEL_KEYS.some((k) => own.has(`${prefix}/${k}`)));
    // An already invalid regenerated site can't be made worse by the owner's own text: no new issue is enough.
    if (ok && !newIssues(spec, next)) {
      spec = next;
      kept.push(`/pages/${to.page}/sections/${to.index}${m.path}`);
      keptMarks.push({ section: to.section.id, path: m.path });
    } else if (where) dropped.push(where);
  }
  if (keptMarks.length) spec.ownerEdits = keptMarks;
  return { spec, kept, dropped };
}
