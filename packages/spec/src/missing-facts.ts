/**
 * Facts only the owner can give us (never invented): the "Še to potrebujemo" screen asks for them together, right
 * after generation (it-zero-to-live). Free text ("text" placeholders), photo descriptions, unchecked values and
 * wording problems stay on the pre-publish checklist. No zod here: the editor imports it.
 */
export const ASKED_FACT_KINDS = ["phone", "email", "address", "hours", "price", "serviceArea", "name", "legalName", "registrationNumber", "taxNumber"] as const;
export type AskedFactKind = (typeof ASKED_FACT_KINDS)[number];

export interface MissingFact {
  path: string;
  kind: AskedFactKind;
}

/** The checklist's missing facts the owner can fill on one screen, in checklist order, each path once. */
export function missingFacts(checklist: readonly { path: string; kind: string; detail: string }[]): MissingFact[] {
  const asked = new Set<string>(ASKED_FACT_KINDS);
  const seen = new Set<string>();
  const out: MissingFact[] = [];
  for (const b of checklist) {
    if (b.kind !== "placeholder" || !asked.has(b.detail) || seen.has(b.path)) continue;
    seen.add(b.path);
    out.push({ path: b.path, kind: b.detail as AskedFactKind });
  }
  return out;
}
