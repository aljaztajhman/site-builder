/**
 * Section motion presets beyond the starters (kind `motion`, ids `motion/<name>`; docs/plans/studio-phase1-design.md
 * §1.1, §5 batch I7): one draft asset per partial in styles/vocab/motion/. Each is CSS only, measured as its own
 * minified partial (the family sheet joins them). The starters (reveal, unmask) live in composed-v2.css.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MOTIONS, MOTION_META } from "@sb/spec";
import { STARTER_NAMES, VOCAB_DIR, vocabSheet } from "@sb/render";
import type { Asset } from "./schema.ts";

/** What each preset does, one line (the registry note; the gallery shows it under the preset). */
const NOTES: Readonly<Record<string, string>> = {
  rise: "I7a: text-bearing elements lift 12px into place as they enter the view (transform and opacity).",
  wipe: "I7a: a photo uncovers left to right as it enters the view (clip-path through a --shape- token).",
  stagger: "I7a: the section's text-bearing elements rise one after another (the range shifts by the element's place).",
  "drift-bg": "I7a: the background photo moves slower than the content (scroll timeline, transform only; lively).",
};

/** Bytes a preset adds to a page: its own partial, minified as the family sheet is. */
export function motionBytes(name: string): number {
  const dir = mkdtempSync(path.join(tmpdir(), "motion-bytes-"));
  try {
    mkdirSync(path.join(dir, "motion"));
    writeFileSync(path.join(dir, "motion", `${name}.css`), readFileSync(path.join(VOCAB_DIR, "motion", `${name}.css`), "utf8"));
    return Buffer.byteLength(vocabSheet("motion", dir).css, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The motion presets beyond the starters as draft assets `motion/<name>`, in MOTIONS order. */
export function motionAssets(): Asset[] {
  const starters = new Set(STARTER_NAMES.motion);
  return MOTIONS.filter((m) => !starters.has(m)).map((m) => {
    const meta = MOTION_META[m];
    return {
      id: `motion/${m}`,
      kind: "motion",
      tags: { trades: [], stances: [], intents: [], mood: [meta.kind, meta.minLevel], ground: ["dark", "tint", "white"], density: ["airy", "compact", "regular"] },
      phone: "ok",
      bytes: motionBytes(m),
      license: "own",
      status: "draft",
      note: NOTES[m] ?? `I7a: ${meta.kind} preset`,
    } satisfies Asset;
  });
}
