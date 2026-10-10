/**
 * Motifs a stance signature names that don't exist in the inventory yet, to be drawn in batch I5. A motif signature is
 * pending only when its id is on this list (the signature test checks it); a motif missing from both the registry and
 * this list is unknown and fails.
 */
export const MUST_DRAW_MOTIFS: readonly string[] = [];
