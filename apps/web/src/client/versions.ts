export interface VersionRow {
  version: number;
  source: string;
  message: string | null;
}

/** A row of GET /api/sites/:id `versions` (newest first). */
export interface ListedVersion extends VersionRow {
  created_at: string;
  /** Published at some point (retention keeps every published version). */
  published?: boolean;
}

/**
 * The version "Razveljavi" goes back to. A revert copies an older version, so undoing a revert must
 * continue from the version it copied; plain "current − 1" would undo the undo (a redo).
 * Revert messages come from POST /api/sites/:id/revert: "povrnjeno na različico N".
 * Retention removes old versions, so "one back" is the nearest older version still in the list.
 */
export function undoTarget(versions: VersionRow[], current: number | null): number | null {
  let v = current;
  for (let guard = 0; v !== null && guard <= versions.length; guard++) {
    const row = versions.find((x) => x.version === v);
    const copied = row?.source === "revert" ? /različico (\d+)/.exec(row.message ?? "")?.[1] : undefined;
    if (!copied) return nearestOlder(versions, v);
    v = Number(copied);
  }
  return null;
}

/** The highest version in the list below `v`, or null. */
function nearestOlder(versions: VersionRow[], v: number): number | null {
  let best: number | null = null;
  for (const x of versions) if (x.version < v && (best === null || x.version > best)) best = x.version;
  return best;
}

// ---------- The versions list in groups ----------

/** Direct-editor saves further apart than this start a new group. */
export const GROUP_GAP_MS = 10 * 60_000;

/**
 * What a direct-editor (manual) save changed, from the message the editor sends with it, and the
 * genitive the group label uses ("12 sprememb besedila"). Unknown messages fall into "other".
 */
const KINDS: { kind: string; noun: string; test: RegExp }[] = [
  { kind: "text", noun: " besedila", test: /^(urejen razdelek|urejeno besedilo|nastavitve strani|urejanje$)/ },
  { kind: "facts", noun: " podatkov o podjetju", test: /^podatki$/ },
  { kind: "photos", noun: " fotografij", test: /^(nova fotografija|\d+ nove fotografije|zamenjana slika|opis slike)/ },
  { kind: "design", noun: " oblikovanja", test: /^(oblikovanje|smer )/ },
  {
    kind: "layout",
    noun: " postavitve",
    test: /^(premik|podvojen razdelek|izbrisan razdelek|dodan razdelek|postavitev|ozadje|glava|gumb v glavi|noga|vrstica za klic|meni|vrstni red strani|dodana stran|izbrisana stran)/,
  },
];

function kindOf(row: VersionRow): { kind: string; noun: string } {
  const k = KINDS.find((x) => x.test.test(row.message ?? ""));
  return k ?? { kind: "other", noun: "" };
}

/** "1 sprememba", "2 spremembi", "3 spremembe", "5 sprememb" (Slovene dual and plural, by the last two digits). */
export function changes(n: number): string {
  const r = n % 100;
  return `${n} ${r === 1 ? "sprememba" : r === 2 ? "spremembi" : r === 3 || r === 4 ? "spremembe" : "sprememb"}`;
}

export type VersionItem =
  | { type: "one"; row: ListedVersion }
  | {
      type: "group";
      /** Newest first, as listed. */
      rows: ListedVersion[];
      newest: ListedVersion;
      oldest: ListedVersion;
      /** "12 sprememb besedila, 10:02–10:14" */
      label: string;
      /** "v120–v131" */
      range: string;
      /** "1. 10. 2026" (of the newest save) */
      day: string;
    };

/**
 * The versions list (newest first) as the editor shows it: consecutive direct-editor saves of the same
 * kind, each within `gapMs` of the next and with nothing removed between them, become one group.
 * Generations, critique passes, chat edits, reverts and published versions stay rows of their own.
 */
export function groupVersions(rows: ListedVersion[], opts: { gapMs?: number; timeZone?: string } = {}): VersionItem[] {
  const gap = opts.gapMs ?? GROUP_GAP_MS;
  const tz = opts.timeZone ?? "Europe/Ljubljana";
  const time = (iso: string) => new Date(iso).toLocaleTimeString("sl-SI", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const groupable = (r: ListedVersion) => r.source === "manual" && !r.published;
  const runs: ListedVersion[][] = [];
  for (const row of rows) {
    const run = runs.at(-1);
    const prev = run?.at(-1);
    const joins =
      run !== undefined &&
      prev !== undefined &&
      groupable(prev) &&
      groupable(row) &&
      kindOf(prev).kind === kindOf(row).kind &&
      prev.version - row.version === 1 &&
      Date.parse(prev.created_at) - Date.parse(row.created_at) <= gap;
    if (joins) run.push(row);
    else runs.push([row]);
  }
  return runs.map((run): VersionItem => {
    if (run.length === 1) return { type: "one", row: run[0]! };
    const newest = run[0]!;
    const oldest = run.at(-1)!;
    const [from, to] = [time(oldest.created_at), time(newest.created_at)];
    return {
      type: "group",
      rows: run,
      newest,
      oldest,
      label: `${changes(run.length)}${kindOf(newest).noun}, ${from === to ? from : `${from}–${to}`}`,
      range: `v${oldest.version}–v${newest.version}`,
      day: new Date(newest.created_at).toLocaleDateString("sl-SI", { timeZone: tz }),
    };
  });
}
