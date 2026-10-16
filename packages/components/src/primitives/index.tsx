import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import {
  formatAddress,
  formatPhone,
  formatPrice,
  hoursRows,
  isPlaceholder,
  isPriceOnRequest,
  type Address,
  type Hours,
  type ImageRef,
  type Link,
  type Placeholder,
  type Price,
  type Section as SpecSection,
  type SiteSpec,
  type Tone,
} from "@sb/spec";
import { placeholderLabel } from "../i18n.ts";
import type { RenderCtx, RenderDetails } from "../types.ts";

/** Joins class names, skipping falsy values. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

export function titleId(sectionId: string): string {
  return `${sectionId}-title`;
}

/** Id of the hidden text that tells a repeated landmark name apart (see LandmarkSuffixes). */
export function landmarkSuffixId(sectionId: string): string {
  return `${sectionId}-landmark`;
}

/**
 * Section id → text appended to that section's landmark name. Every section is a region named by its
 * own heading; two sections with the same heading text on one page (e.g. a second booking section
 * added by an edit) would be two regions with one name (axe `landmark-unique`). The page renderer
 * finds such repeats and gives each later one a suffix like "(2)"; the first keeps its plain name.
 */
export const LandmarkSuffixes = createContext<ReadonlyMap<string, string>>(new Map());

/**
 * Spec v15: the section ids of the page that render centred (design.skeleton.centred through centredOn: at most one).
 * Empty without a skeleton, so a site without one renders exactly as before.
 */
export const CentredSections = createContext<ReadonlySet<string>>(new Set());

const DETAIL_CLASS: Record<keyof RenderDetails, string> = { cta: "dt-cta", header: "dt-header", aiCaption: "dt-ai-caption", fit: "dt-fit", scale: "dt-scale" };

/** The class list on <html> that turns details.css's rules on (RenderDetails): "" when no switch is on. */
export function detailsClass(details: RenderDetails | undefined): string {
  return (Object.keys(DETAIL_CLASS) as (keyof RenderDetails)[])
    .filter((k) => details?.[k] === true)
    .map((k) => DETAIL_CLASS[k])
    .join(" ");
}

/**
 * details.aiCaption: the section that ends with the page's one AI caption (aiCaptionSection) and its text. Null (the
 * default) draws none.
 */
export const AiCaption = createContext<{ section: string | null; text: string } | null>(null);

/** Whether a value names one of the ids anywhere (an image reference is a plain string). */
function mentions(value: unknown, ids: ReadonlySet<string>): boolean {
  if (typeof value === "string") return ids.has(value);
  if (Array.isArray(value)) return value.some((v) => mentions(v, ids));
  if (value && typeof value === "object") return Object.values(value).some((v) => mentions(v, ids));
  return false;
}

const generatedIds = (site: Pick<SiteSpec, "assets">) => new Set(site.assets.images.filter((i) => i.origin === "generated").map((i) => i.id));

/** Whether content (a section's props, a collection entry) shows a generated picture: it names one. */
export function showsGenerated(content: unknown, site: Pick<SiteSpec, "assets">): boolean {
  const ids = generatedIds(site);
  return ids.size > 0 && mentions(content, ids);
}

/** The first of the sections that shows a generated picture, or null. */
export function aiCaptionSection(sections: readonly SpecSection[], site: Pick<SiteSpec, "assets">): string | null {
  const ids = generatedIds(site);
  if (ids.size === 0) return null;
  return sections.find((s) => mentions(s.props, ids))?.id ?? null;
}

/**
 * Wrapper for every section: landmark, tone, variant classes and the width container; `data-align="centre"` on the one
 * centred section of a page with a skeleton (skeleton.css).
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
  const suffixes = useContext(LandmarkSuffixes);
  const centred = useContext(CentredSections).has(id);
  const caption = useContext(AiCaption);
  const suffix = labelled ? suffixes.get(id) : undefined;
  return (
    <section
      id={id}
      className={cx("s", `s-${type}`, `s-${type}--${variant}`, `tone-${tone}`, className)}
      data-align={centred ? "centre" : undefined}
      aria-labelledby={labelled ? (suffix ? `${titleId(id)} ${landmarkSuffixId(id)}` : titleId(id)) : undefined}
    >
      {suffix && (
        <span id={landmarkSuffixId(id)} hidden>
          {suffix}
        </span>
      )}
      {bleed ? children : <div className="container">{children}</div>}
      {/* details.aiCaption: under the section's pictures, never on one (no mask clips it, it never covers a photo). */}
      {caption?.section === id && <p className="container ai-caption">{caption.text}</p>}
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
  /** Override the object-position the focal point gives (a composed image's crop on thirds). */
  objectPosition?: string;
}) {
  const img = props.ctx.image(props.id);
  const focal = img.asset.focal;
  // AI-generated pictures carry a visible label (EU AI Act Art. 50) and say so in their alt text.
  // With details.aiCaption the label is the page's one caption (AiCaption) instead, and the picture is only marked.
  const generated = img.asset.origin === "generated";
  const captioned = generated && props.ctx.details?.aiCaption === true;
  const alt = props.alt ?? img.alt;
  const mark = captioned ? { "data-ai": "generated" } : generated ? { "data-ai-label": props.ctx.t("aiGenerated") } : {};
  return (
    <picture className={cx("media", generated && !captioned && "media--ai", props.className)} {...mark}>
      {img.sources.map((s) => (
        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={props.sizes} />
      ))}
      <img
        src={img.src}
        width={img.width}
        height={img.height}
        alt={generated && alt ? `${alt} (${props.ctx.t("aiGeneratedAlt")})` : alt}
        loading={props.priority ? "eager" : "lazy"}
        decoding={props.priority ? "sync" : "async"}
        fetchPriority={props.priority ? "high" : undefined}
        style={props.objectPosition ? { objectPosition: props.objectPosition } : focal ? { objectPosition: `${Math.round(focal.x * 100)}% ${Math.round(focal.y * 100)}%` } : undefined}
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
  const action = "action" in props.link.target ? props.link.target.action : undefined;
  // details.cta: a call button is the real thing, with the phone icon (details.css .btn--call).
  const call = kind !== "text" && action === "call" && props.ctx.details?.cta === true;
  return (
    <a
      href={href}
      data-action={action}
      className={cx(kind === "text" ? "text-link" : `btn btn--${kind}`, call && "btn--call", props.className)}
      {...(external ? { rel: "noopener", target: "_blank" } : {})}
    >
      {call && <Icon name="phone" />}
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
  // The owner's "Cena po dogovoru": words in the price's place, wrapping where a price would not.
  if (isPriceOnRequest(price)) return <span className="price price--on-request">{ctx.t("priceOnRequest")}</span>;
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

/*
 * Icon paths copied from Lucide (lucide-static 1.49.0, https://lucide.dev), ISC License:
 * Copyright (c) 2026 Lucide Icons and Contributors. Permission to use, copy, modify, and/or distribute
 * this software for any purpose with or without fee is hereby granted, provided that the above copyright
 * notice and this permission notice appear in all copies.
 * `clock` is derived from Feather, MIT License: Copyright (c) 2013-present Cole Bemis.
 */
const ICON_PATHS = {
  phone: (
    <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
  ),
  "map-pin": (
    <>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  mail: (
    <>
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
      <rect x="2" y="4" width="20" height="16" rx="2" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICON_PATHS;

/**
 * Small line icon for functional fact rows only (phone, address, e-mail, hours, the call bar).
 * Never decorative: no background, no circle, no colour of its own (currentColor), hidden from
 * assistive tech because the label next to it already says what it is. Inline SVG, so it works
 * offline and under the CSP. width/height attributes keep its box before the stylesheet loads.
 */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/** Section heading block: optional eyebrow, the h2 title, optional intro. */
/** Characters (code points) of the text's longest word. */
export function longestWordLength(text: string): number {
  return Math.max(0, ...text.split(/\s+/).map((w) => [...w].length));
}

/**
 * Words shorter than this fit a 360 px phone at every heading size the tokens allow (display at most 44 px there,
 * capitals about 0.8 em a letter: 9 x 0.8 x 44 = 317 px of the 328 px line); longer ones get FitText's clamp.
 */
export const FIT_WORD_FROM = 9;

/**
 * Heading text whose longest word could be wider than a phone (review 50: "ELEKTROINŠTALACIJE" made a 360 px page
 * 435 px wide): the text in a block whose size is the heading's own, capped so the longest word fits the screen
 * (base.css .fit, --lw letters at --fit-k em each). Shorter text is returned as it is.
 */
export function FitText({ text }: { text: string }) {
  const n = longestWordLength(text);
  if (n < FIT_WORD_FROM) return <>{text}</>;
  return (
    <span className="fit" style={{ "--lw": n } as CSSProperties}>
      {text}
    </span>
  );
}

export function SectionHead(props: { id: string; eyebrow?: string | undefined; title: string; intro?: string | undefined; level?: 1 | 2 }) {
  const H = props.level === 1 ? "h1" : "h2";
  return (
    <header className="section-head">
      {props.eyebrow && <p className="eyebrow">{props.eyebrow}</p>}
      <H id={titleId(props.id)} className="section-title">
        <FitText text={props.title} />
      </H>
      {props.intro && <p className="lead">{props.intro}</p>}
    </header>
  );
}
