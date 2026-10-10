import { cx } from "../../../primitives/index.tsx";
import { placement } from "../elements.tsx";
import type { ElOf } from "../layout.ts";

/**
 * A short line on a label of its own (spec v20 `sticker`): round, oval, a rectangle or a hang tag, in the accent ground by
 * default. Turned a few degrees on desktop (its `tilt`, else −4°), level on phones. Never a rating, award or superlative
 * (the guards and checkFacts hold that); the copy is the client's.
 */
export function StickerBlock({ el, over }: { el: ElOf<"sticker">; over: boolean }) {
  const extra: Record<string, number> = { "--n": Math.min(Math.max(el.text.length, 4), 32) };
  if (el.desk.tilt !== undefined) extra["--tilt"] = el.desk.tilt;
  const p = placement(el, over, extra);
  return (
    <p {...p} className={cx(p.className, "cx-sk", `cx-sk--${el.shape}`)}>
      <span className="cx-sk__t">{el.text}</span>
    </p>
  );
}
