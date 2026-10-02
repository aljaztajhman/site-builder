import { formatAddress, isPlaceholder, type Link, type SectionOf } from "@sb/spec";
import { ActionLink, Actions, HoursList, Picture, Ph, Section, titleId } from "../../primitives/index.tsx";
import { Branch, CallObject, Radiator, Receipt, Seal, motifOf } from "../../motifs/index.tsx";
import type { RenderCtx, SectionProps } from "../../types.ts";

/** photo: the photo fills the hero at every width. */
export const HERO_SIGNATURE_PHOTO_SIZES = "100vw";
/** arch: 5/11 of the container on desktop, 78 % of the screen on phones. */
export const HERO_SIGNATURE_ARCH_SIZES = "(min-width: 64rem) 32rem, 78vw";
/** label: the arch beside the label card, 5/11 of the container on desktop, 74 % of the screen on phones. */
export const HERO_SIGNATURE_LABEL_SIZES = "(min-width: 64rem) 32rem, 74vw";

/** mirrors: three arches side by side in 7/12 of the container on desktop, about a third of the screen on phones. */
export const HERO_SIGNATURE_MIRROR_SIZES = "(min-width: 64rem) 15rem, 32vw";

/** disc: the round photo at 5/11 of the container on desktop (at most 35 rem), 82 % of the screen on phones. */
export const HERO_SIGNATURE_DISC_SIZES = "(min-width: 64rem) 35rem, 82vw";

/** The photo's sizes per variant; null where the variant shows no photo (it draws instead). */
export const HERO_SIGNATURE_SIZES: Record<SectionOf<"hero-signature">["variant"], string | null> = {
  photo: HERO_SIGNATURE_PHOTO_SIZES,
  arch: HERO_SIGNATURE_ARCH_SIZES,
  label: HERO_SIGNATURE_LABEL_SIZES,
  card: HERO_SIGNATURE_PHOTO_SIZES,
  mirrors: HERO_SIGNATURE_MIRROR_SIZES,
  disc: HERO_SIGNATURE_DISC_SIZES,
  drawing: null,
  receipt: null,
};

/** The photo a variant opens on (its LCP image): the first mirror for mirrors, else image; none where it draws. */
export function signaturePhoto(section: SectionOf<"hero-signature">): string | undefined {
  if (HERO_SIGNATURE_SIZES[section.variant] === null) return undefined;
  return section.variant === "mirrors" ? (section.props.images?.[0] ?? section.props.image) : section.props.image;
}

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
  const image = HERO_SIGNATURE_SIZES[variant] === null ? undefined : props.image;
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

  // receipt, card, mirrors: the address line comes from the facts (the model never writes it); with fact phone
  // the call is the one button, labelled with factLabel, beside one quiet text link that is not a call.
  const address = ctx.site.business.address;
  const streetCity = isPlaceholder(address) ? undefined : `${address.street}, ${address.city}`;
  const buttons = phone ? (
    <>
      <Actions primary={{ label: props.factLabel ?? ctx.t("call"), target: { action: "call" } }} secondary={notCall(props.primary) ?? notCall(props.secondary)} ctx={ctx} />
      {isPlaceholder(ctx.site.business.phone) && <Ph p={ctx.site.business.phone} ctx={ctx} />}
    </>
  ) : (
    <Actions primary={props.primary} secondary={props.secondary} ctx={ctx} />
  );

  if (variant === "card") {
    // The house full-bleed with no overlay; the headline on a white card (a thin inner rule) hanging into the next section.
    const where = props.fact === "address" ? (isPlaceholder(address) ? <Ph p={address} ctx={ctx} /> : streetCity) : props.eyebrow;
    return (
      <Section id={section.id} type={section.type} variant={variant} tone={section.tone} bleed>
        <div className={image ? "hsig hsig--card hsig--has-image" : "hsig hsig--card"}>
          {image && <Picture id={image} ctx={ctx} className="hsig__bg media--contained" sizes={HERO_SIGNATURE_PHOTO_SIZES} priority={index === 0} />}
          <div className="container hsig__body">
            <div className="label-card label-card--rule hsig__card">
              {where && <p className="hsig__where">{where}</p>}
              {title}
              <p className="lead hsig__lead">{props.intro}</p>
              {buttons}
            </div>
          </div>
        </div>
      </Section>
    );
  }

  if (variant === "mirrors") {
    // White ground, the name wall-sized behind everything (decorative: the header and footer say it), the
    // headline left, the photos in mirror arches of different heights right.
    const photos = props.images ?? (props.image ? [props.image] : []);
    return (
      <Section id={section.id} type={section.type} variant={variant} tone={section.tone}>
        <div className={photos.length ? "hsig hsig--mirrors hsig--has-image" : "hsig hsig--mirrors"}>
          {props.wordmark && (
            <p className="hsig__wall" aria-hidden="true">
              {props.wordmark}
            </p>
          )}
          <div className="hsig__text">
            {(props.eyebrow ?? streetCity) && <p className="eyebrow hsig__eyebrow">{props.eyebrow ?? streetCity}</p>}
            {title}
            <p className="lead hsig__lead">{props.intro}</p>
            {buttons}
          </div>
          {photos.length > 0 && (
            <div className="hsig__mirrors" data-count={photos.length}>
              {photos.map((id, i) => (
                <Picture key={id} id={id} ctx={ctx} className="hsig__mirror arch-top media--contained" sizes={HERO_SIGNATURE_MIRROR_SIZES} priority={index === 0 && i === 0} />
              ))}
            </div>
          )}
        </div>
      </Section>
    );
  }

  if (variant === "disc") {
    // White ground, the promise as the headline; the photo round on a disc in the alternate colour with the
    // motif's arc under it, factNote on a small tilted chip over its edge.
    return (
      <Section id={section.id} type={section.type} variant={variant} tone={section.tone}>
        <div className={image ? "hsig hsig--disc hsig--has-image" : "hsig hsig--disc"}>
          <div className="hsig__text">
            {(props.eyebrow ?? streetCity) && <p className="eyebrow hsig__eyebrow">{props.eyebrow ?? streetCity}</p>}
            {title}
            <p className="lead hsig__lead">{props.intro}</p>
            {buttons}
          </div>
          {image ? (
            <figure className="hsig__face">
              <Picture id={image} ctx={ctx} className="hsig__face-media disc media--contained" sizes={HERO_SIGNATURE_DISC_SIZES} priority={index === 0} />
              <span className="hsig__arc" aria-hidden="true" />
              {props.factNote && <figcaption className="hsig__chip">{props.factNote}</figcaption>}
            </figure>
          ) : (
            props.factNote && <p className="hsig__chip hsig__chip--alone">{props.factNote}</p>
          )}
        </div>
      </Section>
    );
  }

  if (variant === "receipt") {
    // The receipt lists what the business does.
    const where = props.eyebrow ?? streetCity;
    return (
      <Section id={section.id} type={section.type} variant={variant} tone={section.tone} bleed>
        <div className="hsig hsig--receipt">
          <div className="container hsig__grid">
            <div className="hsig__text">
              {where && <p className="eyebrow hsig__eyebrow">{where}</p>}
              {title}
              <p className="lead hsig__lead">{props.intro}</p>
              {buttons}
            </div>
            {props.receipt && (
              <div className="hsig__paper">
                <Receipt ctx={ctx} id={section.id} title={props.receipt.title} lines={props.receipt.lines} total={props.receipt.total} note={props.factNote} />
              </div>
            )}
          </div>
        </div>
      </Section>
    );
  }

  if (variant === "label") {
    // The headline on a white label card, the address from the facts on it like a bottle's origin line;
    // the photo in a tall arch beside it, the inset as a disc over the arch's edge.
    const address = ctx.site.business.address;
    const where = props.fact === "address" ? (isPlaceholder(address) ? <Ph p={address} ctx={ctx} /> : `${address.street}, ${address.city}`) : props.factLabel;
    return (
      <Section id={section.id} type={section.type} variant={variant} tone={section.tone ?? "inverse"}>
        <div className={image ? "hsig hsig--label hsig--has-image" : "hsig hsig--label"}>
          <div className="label-card hsig__card">
            <Branch />
            {props.eyebrow && <p className="eyebrow hsig__eyebrow">{props.eyebrow}</p>}
            {where && <p className="hsig__where">{where}</p>}
            {title}
            <p className="lead hsig__lead">{props.intro}</p>
            {phone ? links : <Actions primary={props.primary} secondary={props.secondary} ctx={ctx} />}
            {phone && <CallObject ctx={ctx} />}
          </div>
          {image && (
            <figure className="hsig__door">
              <Picture id={image} ctx={ctx} className="hsig__door-media arch-top media--contained" sizes={HERO_SIGNATURE_LABEL_SIZES} priority={index === 0} />
              {props.inset && (
                <span className="hsig__dot disc">
                  <Picture id={props.inset} ctx={ctx} className="hsig__dot-media media--contained" sizes="(min-width: 64rem) 14rem, 9rem" />
                </span>
              )}
            </figure>
          )}
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
