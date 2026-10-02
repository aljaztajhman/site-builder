import { formatAddress, isPlaceholder, type Link, type SectionOf } from "@sb/spec";
import { ActionLink, Actions, HoursList, Picture, Ph, Section, titleId } from "../../primitives/index.tsx";
import { CallObject, Radiator, Seal, motifOf } from "../../motifs/index.tsx";
import type { RenderCtx, SectionProps } from "../../types.ts";

/** photo: the photo fills the hero at every width. */
export const HERO_SIGNATURE_PHOTO_SIZES = "100vw";
/** arch: 5/11 of the container on desktop, 78 % of the screen on phones. */
export const HERO_SIGNATURE_ARCH_SIZES = "(min-width: 64rem) 32rem, 78vw";

/** A link that is not a second call: the hero's object already is the call. */
function notCall(link: Link | undefined): Link | undefined {
  return link && "action" in link.target && link.target.action === "call" ? undefined : link;
}

const DIRECTIONS_LINK: Link = { label: "", target: { action: "directions" } };

/** The one text link beside the phone object: the model's non-call link, else directions (labelled at render). */
export function signatureLink(section: SectionOf<"hero-signature">): Link {
  return notCall(section.props.primary) ?? notCall(section.props.secondary) ?? DIRECTIONS_LINK;
}

/** A phone hero that shows directions too, so it puts call and directions on the first screen. */
export function signatureOffersDirections(section: SectionOf<"hero-signature">): boolean {
  return section.props.fact === "phone" && signatureLink(section) === DIRECTIONS_LINK;
}

/** The band under the photo hero: hours and address with a directions link (no phone: the plate shows it). */
function FactStrip({ ctx }: { ctx: RenderCtx }) {
  const b = ctx.site.business;
  const directions = ctx.href({ action: "directions" });
  return (
    <div className="hsig__strip tone-band">
      <dl className="container hsig__strip-list">
        {b.hours !== undefined && (
          <div className="hsig__strip-item">
            <dt>{ctx.t("openingHours")}</dt>
            <dd>
              <HoursList ctx={ctx} short />
            </dd>
          </div>
        )}
        <div className="hsig__strip-item">
          <dt>{ctx.t("address")}</dt>
          <dd>
            {isPlaceholder(b.address) ? (
              <Ph p={b.address} ctx={ctx} />
            ) : (
              <>
                <span className="hsig__strip-value">{formatAddress(b.address)}</span>
                {directions && (
                  <a className="text-link" href={directions} rel="noopener" target="_blank">
                    {ctx.t("directions")}
                  </a>
                )}
              </>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Homepage hero built around the strongest fact as an object (trade templates M, S and J): the phone as
 * the motif's call object, or the earliest opening time on a seal. Facts come from the business data.
 */
export function HeroSignature({ section, ctx, index }: SectionProps<"hero-signature">) {
  const { props, variant } = section;
  const phone = props.fact === "phone";
  const image = variant === "drawing" ? undefined : props.image;
  const title = (
    <h1 id={titleId(section.id)} className={props.headline.length > 34 ? "hsig__title hsig__title--long" : "hsig__title"}>
      {props.headline}
    </h1>
  );
  const head = (
    <>
      {props.eyebrow && <p className="eyebrow hsig__eyebrow">{props.eyebrow}</p>}
      {title}
      <p className="lead hsig__lead">{props.intro}</p>
    </>
  );
  // With the phone as the object, a further link is a quiet text link and never a second call; without one,
  // directions, so the first screen offers call and directions and the phone's call bar can wait below it.
  const links = phone ? (
    (() => {
      const link = signatureLink(section);
      const shown = link === DIRECTIONS_LINK ? { ...link, label: ctx.t("directions") } : link;
      return ctx.href(shown.target) ? (
        <div className="actions hsig__links">
          <ActionLink link={shown} ctx={ctx} kind="text" />
        </div>
      ) : null;
    })()
  ) : (
    <Actions primary={props.primary} secondary={props.secondary} ctx={ctx} />
  );
  const fact = phone ? (
    <div className="hsig__fact">
      {variant !== "drawing" && <p className="hsig__fact-label">{props.factLabel}</p>}
      <CallObject ctx={ctx} label={variant === "drawing" ? props.factLabel : undefined} />
      {props.factNote && <p className="hsig__note">{props.factNote}</p>}
    </div>
  ) : null;
  const seal = phone ? null : <Seal ctx={ctx} className="hsig__seal" />;
  const sealBlock = seal && (
    <div className="hsig__fact">
      <p className="hsig__fact-label">{props.factLabel}</p>
      {seal}
      {props.factNote && <p className="hsig__note">{props.factNote}</p>}
    </div>
  );

  if (variant === "photo") {
    return (
      <Section id={section.id} type={section.type} variant={variant} tone={section.tone ?? "inverse"} bleed>
        <div className={image ? "hsig hsig--photo hsig--has-image" : "hsig hsig--photo"}>
          {image && <Picture id={image} ctx={ctx} className="hsig__bg media--contained" sizes={HERO_SIGNATURE_PHOTO_SIZES} priority={index === 0} />}
          {image && <div className="hsig__shade" aria-hidden="true" />}
          <div className="container hsig__body">
            <div className="hsig__text">{head}</div>
            {fact ?? sealBlock}
            {links}
          </div>
          <FactStrip ctx={ctx} />
        </div>
      </Section>
    );
  }

  if (variant === "drawing") {
    return (
      <Section id={section.id} type={section.type} variant={variant} tone={section.tone}>
        <div className="hsig hsig--drawing">
          <div className="hsig__text">
            {head}
            {fact ?? sealBlock}
            {links}
          </div>
          {motifOf(ctx) === "pipes" && <Radiator className="hsig__drawing" />}
        </div>
      </Section>
    );
  }

  // arch
  return (
    <Section id={section.id} type={section.type} variant={variant} tone={section.tone ?? "inverse"}>
      <div className={image ? "hsig hsig--arch hsig--has-image" : "hsig hsig--arch"}>
        <div className="hsig__text">
          {head}
          {links}
          {fact}
        </div>
        {image ? (
          <figure className="hsig__arch">
            <Picture id={image} ctx={ctx} className="hsig__arch-media media--contained" sizes={HERO_SIGNATURE_ARCH_SIZES} priority={index === 0} />
            {seal}
          </figure>
        ) : (
          sealBlock
        )}
      </div>
    </Section>
  );
}
