import type { ReactNode } from "react";
import {
  formatAddress,
  formatPhone,
  formatPrice,
  hoursRows,
  isPlaceholder,
  type Address,
  type Hours,
  type ImageRef,
  type Link,
  type Placeholder,
  type Price,
  type Tone,
} from "@sb/spec";
import { placeholderLabel } from "../i18n.ts";
import type { RenderCtx } from "../types.ts";

/** Joins class names, skipping falsy values. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

export function titleId(sectionId: string): string {
  return `${sectionId}-title`;
}

/**
 * Wrapper for every section: landmark, tone, variant classes and the width container.
 * Classes: `s s-{type} s-{type}--{variant} tone-{tone}`.
 */
export function Section(props: {
  id: string;
  type: string;
  variant: string;
  tone?: Tone | undefined;
  labelled?: boolean;
  className?: string;
  /** Skip the inner .container (for full-bleed layouts that manage their own width). */
  bleed?: boolean;
  children: ReactNode;
}) {
  const { id, type, variant, tone = "default", labelled = true, className, bleed, children } = props;
  return (
    <section
      id={id}
      className={cx("s", `s-${type}`, `s-${type}--${variant}`, `tone-${tone}`, className)}
      aria-labelledby={labelled ? titleId(id) : undefined}
    >
      {bleed ? children : <div className="container">{children}</div>}
    </section>
  );
}

/** Visible marked placeholder for a missing fact. Blocks publishing until filled. */
export function Ph({ p, ctx }: { p: Placeholder; ctx: RenderCtx }) {
  return (
    <mark className="ph" data-ph={p.$placeholder} title={p.note}>
      [{placeholderLabel(p.$placeholder, ctx.locale)}]
    </mark>
  );
}

/** Responsive picture with AVIF and WebP sources, explicit size, lazy below the fold. */
export function Picture(props: {
  id: ImageRef;
  ctx: RenderCtx;
  /** `sizes` attribute; describe the rendered width at each breakpoint. */
  sizes: string;
  /** Above the fold and likely LCP: eager + high priority. */
  priority?: boolean;
  className?: string;
  /** Override alt (e.g. "" when the image is decorative next to identical text). */
  alt?: string;
}) {
  const img = props.ctx.image(props.id);
  const focal = img.asset.focal;
  return (
    <picture className={cx("media", props.className)}>
      {img.sources.map((s) => (
        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={props.sizes} />
      ))}
      <img
        src={img.src}
        width={img.width}
        height={img.height}
        alt={props.alt ?? img.alt}
        loading={props.priority ? "eager" : "lazy"}
        decoding={props.priority ? "sync" : "async"}
        fetchPriority={props.priority ? "high" : undefined}
        style={focal ? { objectPosition: `${Math.round(focal.x * 100)}% ${Math.round(focal.y * 100)}%` } : undefined}
      />
    </picture>
  );
}

/**
 * A link styled as a button (or text link). Renders nothing when the target depends on a
 * missing fact, so a placeholder phone never becomes a broken tel: link.
 */
export function ActionLink(props: { link: Link; ctx: RenderCtx; kind?: "primary" | "secondary" | "text"; className?: string }) {
  const href = props.ctx.href(props.link.target);
  if (!href) return null;
  const external = "url" in props.link.target || ("action" in props.link.target && props.link.target.action === "directions");
  const kind = props.kind ?? "primary";
  return (
    <a
      href={href}
      className={cx(kind === "text" ? "text-link" : `btn btn--${kind}`, props.className)}
      {...(external ? { rel: "noopener", target: "_blank" } : {})}
    >
      {props.link.label}
    </a>
  );
}

/** One primary action; a second one is a text link beside it, so two buttons never compete (with the phone's call bar, that made four). */
export function Actions({ primary, secondary, ctx }: { primary?: Link | undefined; secondary?: Link | undefined; ctx: RenderCtx }) {
  if (!primary && !secondary) return null;
  return (
    <div className="actions">
      {primary && <ActionLink link={primary} ctx={ctx} kind="primary" />}
      {secondary && <ActionLink link={secondary} ctx={ctx} kind={primary ? "text" : "primary"} />}
    </div>
  );
}

/** Phone number as a click-to-call link, or a placeholder. */
export function PhoneLink({ ctx, className }: { ctx: RenderCtx; className?: string }) {
  const phone = ctx.site.business.phone;
  if (isPlaceholder(phone)) return <Ph p={phone} ctx={ctx} />;
  return (
    <a href={`tel:${phone}`} className={className}>
      {formatPhone(phone)}
    </a>
  );
}

export function EmailLink({ ctx, className }: { ctx: RenderCtx; className?: string }) {
  const email = ctx.site.business.email;
  if (isPlaceholder(email)) return <Ph p={email} ctx={ctx} />;
  return (
    <a href={`mailto:${email}`} className={className}>
      {email}
    </a>
  );
}

export function AddressText({ ctx, address }: { ctx: RenderCtx; address?: Address | Placeholder }) {
  const a = address ?? ctx.site.business.address;
  if (isPlaceholder(a)) return <Ph p={a} ctx={ctx} />;
  return (
    <address>
      {a.street}
      <br />
      {a.postalCode} {a.city}
    </address>
  );
}

export function addressLine(a: Address | Placeholder): string | null {
  return isPlaceholder(a) ? null : formatAddress(a);
}

/** Opening hours as a definition list, or a placeholder. */
export function HoursList({ ctx, hours, short }: { ctx: RenderCtx; hours?: Hours | Placeholder | undefined; short?: boolean }) {
  const h = hours ?? ctx.site.business.hours;
  if (!h) return null;
  if (isPlaceholder(h)) return <Ph p={h} ctx={ctx} />;
  return (
    <div className="hours">
      <dl className="hours__list">
        {hoursRows(h, ctx.locale, short).map((r) => (
          <div className="hours__row" key={r.days}>
            <dt>{r.days}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {h.note && <p className="hours__note">{h.note}</p>}
    </div>
  );
}

export function PriceText({ price, ctx }: { price: Price; ctx: RenderCtx }) {
  if (isPlaceholder(price)) return <Ph p={price} ctx={ctx} />;
  return (
    <span className="price">
      {price.from ? `${ctx.t("from")} ` : ""}
      {formatPrice(price.amount, ctx.locale)}
      {price.unit ? ` ${price.unit}` : ""}
    </span>
  );
}

/** Text that may be a placeholder (e.g. a team member name not in the brief). */
export function MaybeText({ value, ctx }: { value: string | Placeholder; ctx: RenderCtx }) {
  return isPlaceholder(value) ? <Ph p={value} ctx={ctx} /> : <>{value}</>;
}

/** Section heading block: optional eyebrow, the h2 title, optional intro. */
export function SectionHead(props: { id: string; eyebrow?: string | undefined; title: string; intro?: string | undefined; level?: 1 | 2 }) {
  const H = props.level === 1 ? "h1" : "h2";
  return (
    <header className="section-head">
      {props.eyebrow && <p className="eyebrow">{props.eyebrow}</p>}
      <H id={titleId(props.id)} className="section-title">
        {props.title}
      </H>
      {props.intro && <p className="lead">{props.intro}</p>}
    </header>
  );
}
