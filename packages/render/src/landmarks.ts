/**
 * Landmark names of rendered sections. Every section is a region named by its own heading
 * (`aria-labelledby` → `{id}-title`); two sections with the same heading text on one page would be two
 * regions with one name (axe `landmark-unique`). These helpers read the names back from the rendered
 * markup (React's static output, so tags are well formed and attribute values escaped) and pick a
 * suffix for every repeat.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Start tag of the element with this id: its tag name and where its start tag begins and ends. */
function findElement(html: string, id: string): { tag: string; start: number; open: number } | null {
  const at = html.indexOf(` id="${escapeAttr(id)}"`);
  if (at < 0) return null;
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(start))?.[1];
  const open = html.indexOf(">", at);
  if (!tag || open < 0) return null;
  return { tag: tag.toLowerCase(), start, open: open + 1 };
}

/** Text content of the element with this id (tags stripped, entities decoded, whitespace collapsed). */
export function elementText(html: string, id: string): string | null {
  const el = findElement(html, id);
  if (!el) return null;
  const re = new RegExp(`<(/?)${el.tag}\\b[^>]*>`, "gi");
  re.lastIndex = el.open;
  let depth = 1;
  let end = html.length;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      end = m.index;
      break;
    }
  }
  return decodeEntities(html.slice(el.open, end).replace(/<br\b[^>]*>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Accessible name of the element with this id from its aria-labelledby / aria-label, or null if it has none. */
export function labelledName(html: string, id: string): string | null {
  const el = findElement(html, id);
  if (!el) return null;
  const startTag = html.slice(el.start, el.open);
  const by = /\saria-labelledby="([^"]*)"/.exec(startTag)?.[1];
  const name = by
    ? decodeEntities(by)
        .split(/\s+/)
        .filter(Boolean)
        .map((ref) => elementText(html, ref) ?? "")
        .join(" ")
    : decodeEntities(/\saria-label="([^"]*)"/.exec(startTag)?.[1] ?? "");
  const clean = name.replace(/\s+/g, " ").trim();
  return clean || null;
}

/**
 * Section id → suffix for each section whose landmark name repeats an earlier one on the page
 * ("(2)", "(3)", … until the name is unique; names compare case-insensitively like axe does).
 * The first section with a name keeps it unchanged.
 */
export function landmarkSuffixes(html: string, sectionIds: readonly string[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const id of sectionIds) {
    const name = labelledName(html, id);
    if (!name) continue;
    if (!used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      continue;
    }
    for (let n = 2; ; n++) {
      const candidate = `${name} (${n})`.toLowerCase();
      if (!used.has(candidate)) {
        used.add(candidate);
        out.set(id, `(${n})`);
        break;
      }
    }
  }
  return out;
}
