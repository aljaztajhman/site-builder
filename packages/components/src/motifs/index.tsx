/**
 * Trade motifs (docs/design/templates): the objects a template direction draws instead of icons and
 * stock ornaments. Every fact they show comes from the business facts; every colour from the site's
 * tokens (CSS classes in styles/motifs.css), so a motif follows a colour edit.
 */
import { DIRECTIONS, earliestOpening, formatPhoneNational, isPlaceholder, plateCode, siteMotif, type Motif, type SubMotif } from "@sb/spec";
import { Ph, cx } from "../primitives/index.tsx";
import type { RenderCtx } from "../types.ts";
import { JointDrawing, Stem, StripDrawing, Tag, TilesDrawing, WireDrawing } from "./trades.tsx";

export * from "./trades.tsx";

/** The motif of the site's design direction, if it is a template direction. */
export function motifOf(ctx: RenderCtx): Motif | undefined {
  return DIRECTIONS.find((d) => d.id === ctx.site.design.direction)?.template?.motif;
}

/** The sub-trade motif drawn on the template's layout (spec v15 business.subtype), if any. */
export function subMotifOf(ctx: RenderCtx): SubMotif | undefined {
  return siteMotif(ctx.site).sub;
}

/**
 * The drawing beside the drawing hero's call (Cevi's layout): the radiator for plumbing and heating, or the sub-trade's
 * own (a socket on its cable, a dovetailed corner, a tiled roof, a colour strip and a roller). Decorative.
 */
export function TradeDrawing({ ctx, id, className }: { ctx: RenderCtx; id: string; className?: string }) {
  if (motifOf(ctx) !== "pipes") return null;
  switch (subMotifOf(ctx)) {
    case "wire":
      return <WireDrawing className={className} />;
    case "joint":
      return <JointDrawing className={className} />;
    case "tiles":
      return <TilesDrawing id={id} className={className} />;
    case "strip":
      return <StripDrawing className={className} />;
    default:
      return <Radiator className={className} />;
  }
}

/** The mark on a label card and a price label (Etiketa's layout): the olive branch, or a florist's stem, a boutique's tag. */
export function LabelMark({ ctx }: { ctx: RenderCtx }) {
  const sub = subMotifOf(ctx);
  if (sub === "stem") return <Stem />;
  if (sub === "tag") return <Tag />;
  return <Branch />;
}

/** The blue EU strip of a Slovenian plate. Decorative: the link or price around it carries the meaning. */
export function PlateStrip() {
  return (
    <span className="plate__eu" aria-hidden="true">
      <span>SLO</span>
    </span>
  );
}

/**
 * The phone number as the direction's call object, one tel: link: a registration plate with the town's
 * code (plate), a red block with its label inside (pipes, hero size) or the bare number at poster size.
 * A missing phone is a visible placeholder, never a broken link.
 */
export function CallObject({ ctx, label, size = "hero", className }: { ctx: RenderCtx; label?: string | undefined; size?: "hero" | "poster"; className?: string }) {
  const phone = ctx.site.business.phone;
  if (isPlaceholder(phone)) return <Ph p={phone} ctx={ctx} />;
  const number = formatPhoneNational(phone);
  const motif = motifOf(ctx);
  if (motif === "plate") {
    const address = ctx.site.business.address;
    const code = isPlaceholder(address) ? null : plateCode(address.city);
    return (
      <a className={cx("plate", `plate--${size}`, className)} href={`tel:${phone}`} aria-label={`${ctx.t("call")} ${number}`}>
        <PlateStrip />
        <span className="plate__num" aria-hidden="true">
          {code && (
            <>
              {code}
              <span className="plate__dot" />
            </>
          )}
          {number}
        </span>
      </a>
    );
  }
  if (motif === "pipes" && size === "hero") {
    return (
      <a className={cx("callblock", className)} href={`tel:${phone}`}>
        {label && <span className="callblock__label">{label}</span>}
        <span className="callblock__num">{number}</span>
      </a>
    );
  }
  return (
    <a className={cx("bignum", `bignum--${size}`, className)} href={`tel:${phone}`}>
      {number}
    </a>
  );
}

/** The earliest opening time on a round seal ("pon–sob odprto od 6.30"), from the business hours. */
export function Seal({ ctx, className }: { ctx: RenderCtx; className?: string }) {
  const hours = ctx.site.business.hours;
  if (hours === undefined || isPlaceholder(hours))
    return (
      <p className={cx("seal", className)}>
        <Ph p={hours ?? { $placeholder: "hours" }} ctx={ctx} />
      </p>
    );
  const o = earliestOpening(hours, ctx.locale);
  if (!o) return null;
  return (
    <p className={cx("seal", className)}>
      <span className="seal__days">
        {o.everyDay ? ctx.t("everyDay") : o.days} {ctx.t("openFrom")}
      </span>
      <span className="seal__time">{o.time}</span>
    </p>
  );
}

/** A radiator fed by a hot pipe and drained by a cold one (motif pipes). Decorative. */
export function Radiator({ className }: { className?: string }) {
  const fins = [138, 190, 242, 294, 346, 398];
  return (
    <svg className={cx("radiator", className)} viewBox="0 0 540 520" fill="none" aria-hidden="true" focusable="false">
      <path className="radiator__hot" d="M60 0V118H128" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
      <path className="radiator__cold" d="M452 402H500V520" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
      <rect className="radiator__bar" x="128" y="96" width="324" height="44" rx="22" />
      <rect className="radiator__bar" x="128" y="380" width="324" height="44" rx="22" />
      {fins.map((x) => (
        <rect key={x} className="radiator__fin" x={x} y="70" width="40" height="380" rx="20" strokeWidth="8" />
      ))}
      <circle className="radiator__valve" cx="60" cy="40" r="26" strokeWidth="8" />
      <path className="radiator__line" d="M60 22v36M42 40h36" strokeWidth="8" strokeLinecap="round" />
      <rect className="radiator__bar" x="96" y="100" width="36" height="36" rx="8" />
    </svg>
  );
}

/**
 * A paper receipt listing what the business does (motif ledger): a title, the business name from the facts,
 * one checked line per item, an optional double-ruled total and fine print. The lines are copy from the
 * client's own list; the check marks, torn edge and offset shadow are drawn by CSS from the site's tokens.
 */
export function Receipt({ ctx, id, title, lines, total, note, className }: { ctx: RenderCtx; id: string; title: string; lines: string[]; total?: { label: string; value: string } | undefined; note?: string | undefined; className?: string }) {
  return (
    <div className={cx("receipt", className)}>
      <p className="receipt__title" id={`${id}-receipt`}>
        {title}
      </p>
      <p className="receipt__sub">{ctx.site.business.name}</p>
      <ul className="receipt__lines" aria-labelledby={`${id}-receipt`}>
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {total && (
        <p className="receipt__total">
          <span>{total.label}</span>
          <span>{total.value}</span>
        </p>
      )}
      {note && <p className="receipt__fine">{note}</p>}
      <span className="receipt__tear" aria-hidden="true" />
    </div>
  );
}

const LEAVES: [number, number, number, number, number][] = [
  [30, 30, 15, 5.5, -38],
  [40, 50, 15, 5.5, 22],
  [62, 22, 15, 5.5, -42],
  [74, 42, 15, 5.5, 18],
  [96, 10, 14, 5, -44],
  [106, 30, 14, 5, 14],
];

/** An olive branch (motif label): leaves in the label's frame colour, two olives in the primary colour. Decorative. */
export function Branch({ className }: { className?: string }) {
  return (
    <svg className={cx("branch", className)} viewBox="0 0 132 58" fill="none" aria-hidden="true" focusable="false">
      <path className="branch__stem" d="M4 44C36 40 82 30 128 8" strokeWidth="3" strokeLinecap="round" />
      {LEAVES.map(([cx_, cy, rx, ry, a]) => (
        <ellipse key={`${cx_}-${cy}`} className="branch__leaf" cx={cx_} cy={cy} rx={rx} ry={ry} transform={`rotate(${a} ${cx_} ${cy})`} />
      ))}
      <circle className="branch__olive" cx="52" cy="40" r="7" />
      <circle className="branch__olive" cx="88" cy="28" r="6" />
    </svg>
  );
}

/** A spoon (motif spoon): the bowl and the tapering handle, in the band colour (brass). Decorative. */
export function Spoon({ className }: { className?: string }) {
  return (
    <svg className={cx("spoon", className)} viewBox="0 0 22 104" aria-hidden="true" focusable="false">
      <ellipse cx="11" cy="19" rx="10.5" ry="18" />
      <path d="M8.5 34h5l1.5 62a4 4 0 0 1-8 0z" />
    </svg>
  );
}

/**
 * The limb (motif bend): the logo's bent line drawn wide behind the hero, a pale tint of the primary colour, with
 * the joint in the accent colour. Decorative; sliced, never stretched, so the joint stays round.
 */
export function Limb({ className }: { className?: string }) {
  return (
    <svg className={cx("limb", className)} viewBox="0 0 900 900" preserveAspectRatio="xMinYMin slice" fill="none" aria-hidden="true" focusable="false">
      <path className="limb__line" d="M200 -40 L200 430 L960 880" strokeWidth="150" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="limb__joint" cx="200" cy="430" r="46" />
    </svg>
  );
}
