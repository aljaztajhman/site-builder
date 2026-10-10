import { cx } from "../../../primitives/index.tsx";
import type { RenderCtx } from "../../../types.ts";
import { placement } from "../elements.tsx";
import { stepVar, type ElOf } from "../layout.ts";

/**
 * The business name set as type (spec v20 `wordmark`): the name from business, the style from design.wordmark (its
 * `wm-<style>` block is in composed-v2.css, region vocab; "plain" without one), in the display or the text face. A
 * typographic mark only, never a drawn symbol, and not a heading: the section's heading names the section.
 */
export function WordmarkBlock({ el, ctx, over }: { el: ElOf<"wordmark">; ctx: RenderCtx; over: boolean }) {
  const wm = ctx.site.design.wordmark;
  const p = placement(el, over, { "--fz": stepVar(el.size) });
  return (
    <p {...p} className={cx(p.className, "cx-wm", `wm-${wm?.style ?? "plain"}`, wm?.role === "text" && "cx-wm--text")} data-sz={el.size}>
      {ctx.site.business.name}
    </p>
  );
}
