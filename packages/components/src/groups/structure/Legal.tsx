import { dayDate, formatDate, isPlaceholder } from "@sb/spec";
import { EmailLink, MaybeText, PhoneLink, Ph, Section, addressLine, titleId } from "../../primitives/index.tsx";
import type { RenderCtx, SectionProps } from "../../types.ts";
import { accessibilityBody, privacyBody, type LegalFacts } from "./legal-text.tsx";

function legalFacts(ctx: RenderCtx, date: string | undefined): LegalFacts {
  const b = ctx.site.business;
  return {
    name: b.name,
    legal: <MaybeText value={b.provider.legalName} ctx={ctx} />,
    address: isPlaceholder(b.address) ? <Ph p={b.address} ctx={ctx} /> : addressLine(b.address),
    reg: <MaybeText value={b.provider.registrationNumber} ctx={ctx} />,
    email: <EmailLink ctx={ctx} />,
    phone: <PhoneLink ctx={ctx} />,
    // The day the statement was prepared, from the spec; a site made before v11 shows the day it is rendered.
    date: formatDate(date ? dayDate(date) : new Date()),
    contactForm: ctx.site.pages.some((p) => p.sections.some((s) => s.type === "contact-form")),
  };
}

/** Privacy policy or accessibility statement generated from the business facts. System-only. */
export function Legal({ section, ctx }: SectionProps<"legal">) {
  const { kind } = section.props;
  const lang = ctx.locale === "sl" ? "sl" : "en";
  const facts = legalFacts(ctx, section.props.date);
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <article className="legal">
        <h1 id={titleId(section.id)} className="legal__title">
          {ctx.t(kind === "privacy" ? "privacy" : "accessibility")}
        </h1>
        <div className="legal__notice" role="note">
          <p>{ctx.t("legalReviewNote")}</p>
        </div>
        <div className="legal__body prose">{kind === "privacy" ? privacyBody(lang, facts) : accessibilityBody(lang, facts)}</div>
      </article>
    </Section>
  );
}
