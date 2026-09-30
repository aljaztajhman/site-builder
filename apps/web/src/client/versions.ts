export interface VersionRow {
  version: number;
  source: string;
  message: string | null;
}

/**
 * The version "Razveljavi" goes back to. A revert copies an older version, so undoing a revert must
 * continue from the version it copied; plain "current − 1" would undo the undo (a redo).
 * Revert messages come from POST /api/sites/:id/revert: "povrnjeno na različico N".
 */
export function undoTarget(versions: VersionRow[], current: number | null): number | null {
  let v = current;
  for (let guard = 0; v !== null && guard <= versions.length; guard++) {
    const row = versions.find((x) => x.version === v);
    const copied = row?.source === "revert" ? /različico (\d+)/.exec(row.message ?? "")?.[1] : undefined;
    if (!copied) return v > 1 ? v - 1 : null;
    v = Number(copied);
  }
  return null;
}
