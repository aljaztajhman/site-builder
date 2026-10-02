/**
 * Trade motifs (docs/design/templates): the objects a template direction draws instead of icons and
 * stock ornaments. Every fact they show comes from the business facts; every colour from the site's
 * tokens (CSS classes in styles/motifs.css), so a motif follows a colour edit.
 */
import { DIRECTIONS, earliestOpening, formatPhoneNational, isPlaceholder, plateCode, type Motif } from "@sb/spec";
import { Ph, cx } from "../primitives/index.tsx";
import type { RenderCtx } from "../types.ts";

/** The motif of the site's design direction, if it is a template direction. */
export function motifOf(ctx: RenderCtx): Motif | undefined {
  return DIRECTIONS.find((d) => d.id === ctx.site.design.direction)?.template?.motif;
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
