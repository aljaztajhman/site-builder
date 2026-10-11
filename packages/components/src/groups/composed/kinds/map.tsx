import type { CSSProperties, ReactNode } from "react";
import { isPlaceholder } from "@sb/spec";
import { ActionLink, AddressText, cx } from "../../../primitives/index.tsx";
import type { RenderCtx } from "../../../types.ts";
import { placement } from "../elements.tsx";
import type { ElOf } from "../layout.ts";
import { kindText } from "./strings.ts";

type MapEl = ElOf<"map">;

/**
 * The drawn streets of each style, in a 320 × 200 box: the client's street runs across (y 120); `street` puts the pin on
 * it, `corner` at the corner it makes with the cross street, `pin` on a bend with a ring round it. Schematic only: no
 * landmarks, no scale, no other names (§1.8).
 */
const ROADS: Record<MapEl["style"], { roads: string; cross?: string; pin: [number, number]; st: [number, number]; x?: [number, number] }> = {
  street: { roads: "M-10 120H330", cross: "M190 -10V210", pin: [252, 120], st: [1, 40], x: [59.4, 62] },
  corner: { roads: "M-10 120H200", cross: "M200 -10V210", pin: [200, 120], st: [1, 40], x: [62.5, 62] },
  pin: { roads: "M-10 150C80 150 110 90 200 90S290 60 330 60", pin: [160, 98], st: [1, 25] },
};

/** A street name on the drawing, at [x, y] per cent of the box (from its left and bottom edges). */
const Label = ({ at, children }: { at: [number, number]; children: ReactNode }) => (
  <span className="cx-map__l" style={{ "--lx": at[0], "--ly": at[1] } as CSSProperties}>
    {children}
  </span>
);

/** The street's name without its house number ("Trubarjeva cesta 12" → "Trubarjeva cesta"). */
const streetName = (street: string) => street.replace(/\s+\d+\s*[a-zA-Z]?(\s*\/\s*\d+)?$/, "");

/**
 * A schematic map drawn from the business address (spec v20 `map`): the street, the client's cross street when given,
 * a pin. The drawing is one image to assistive technology (its label names the streets); under it the address, the
 * client's note and the directions link (a ≥ 44 px button). Phones: full width, never taller than 60 % of the screen.
 */
export function MapBlock({ el, ctx, over }: { el: MapEl; ctx: RenderCtx; over: boolean }) {
  const address = ctx.site.business.address;
  const street = isPlaceholder(address) ? null : streetName(address.street);
  const shape = ROADS[el.style];
  const cross = shape.cross && el.cross ? el.cross : undefined;
  const [px, py] = shape.pin;
  const label = `${kindText(ctx, "mapOf")}${street ? `: ${street}` : ""}${cross ? `, ${cross}` : ""}`;
  // The colour role paints the drawing (pin, ring, frame) only: the address, the note and the link under it keep the
  // section's own text colour, so an accent role can never tint them (nor drop them below contrast on a dark section).
  const p = placement({ ...el, color: undefined }, over);
  return (
    <div {...p} className={cx(p.className, "cx-map", `cx-map--${el.style}`)}>
      <div className={cx("cx-map__art", el.color && `cx-pf cx-fg-${el.color}`)} role="img" aria-label={label}>
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <path className="cx-map__road" d={shape.roads} />
          {shape.cross && (cross || el.style === "corner") && <path className="cx-map__road cx-map__road--x" d={shape.cross} />}
          {el.style === "pin" && <circle className="cx-map__ring" cx={px} cy={py - 6} r="34" />}
          <path className="cx-map__pin" d={`M${px} ${py}c-5-9-14-15-14-25a14 14 0 0 1 28 0c0 10-9 16-14 25z`} />
          <circle className="cx-map__dot" cx={px} cy={py - 25} r="5" />
        </svg>
        {street && <Label at={shape.st}>{street}</Label>}
        {cross && shape.x && <Label at={shape.x}>{cross}</Label>}
      </div>
      <div className="cx-map__cap">
        <AddressText ctx={ctx} />
        {el.note && <p className="cx-map__note">{el.note}</p>}
        <ActionLink link={{ label: ctx.t("directions"), target: { action: "directions" } }} ctx={ctx} kind="secondary" className="cx-map__go" />
      </div>
    </div>
  );
}
