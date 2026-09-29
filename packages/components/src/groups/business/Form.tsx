import { Section, SectionHead } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/**
 * Enquiry form. Plain HTML that works without JavaScript (posts to `_submit` next to the page and gets a
 * thank-you page back); form.js upgrades it to an in-place submit with a live status message. The action
 * is relative, so the same file works at /s/{slug}/, on a subdomain, and (inert) in an offline export.
 * Messages for the island travel in data attributes, so the island stays locale-free.
 */
export function ContactForm({ section, ctx }: SectionProps<"contact-form">) {
  const { props } = section;
  const id = (name: string) => `${section.id}-${name}`;
  const privacy = ctx.site.pages.find((p) => p.kind === "privacy");
  const req = <span className="cform__req"> ({ctx.t("formRequired")})</span>;
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="cform">
        <SectionHead id={section.id} eyebrow={props.eyebrow} title={props.title} intro={props.intro} />
        <form
          className="cform__form"
          method="post"
          action="_submit"
          data-contact-form=""
          data-msg-sending={ctx.t("formSending")}
          data-msg-sent={ctx.t("formSent")}
          data-msg-error={ctx.t("formError")}
          data-msg-too-many={ctx.t("formTooMany")}
          data-msg-preview={ctx.t("formPreview")}
          data-msg-offline={ctx.t("formOffline")}
        >
          <input type="hidden" name="section" value={section.id} />
          <div className="cform__field">
            <label htmlFor={id("name")}>
              {ctx.t("formName")}
              {req}
            </label>
            <input id={id("name")} name="name" type="text" autoComplete="name" required maxLength={100} />
          </div>
          <div className="cform__field">
            <label htmlFor={id("email")}>
              {ctx.t("formEmail")}
              {req}
            </label>
            <input id={id("email")} name="email" type="email" inputMode="email" autoComplete="email" required maxLength={120} />
          </div>
          {props.askPhone && (
            <div className="cform__field">
              <label htmlFor={id("phone")}>
                {ctx.t("formPhone")}
                <span className="cform__req"> ({ctx.t("formOptional")})</span>
              </label>
              <input id={id("phone")} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} />
            </div>
          )}
          <div className="cform__field">
            <label htmlFor={id("message")}>
              {ctx.t("formMessage")}
              {req}
            </label>
            <textarea
              id={id("message")}
              name="message"
              rows={5}
              required
              maxLength={2000}
              {...(props.messageHint ? { "aria-describedby": id("hint") } : {})}
            />
            {props.messageHint && (
              <p className="cform__hint" id={id("hint")}>
                {props.messageHint}
              </p>
            )}
          </div>
          {/* Honeypot: people never see or reach it; bots that fill every field are dropped. */}
          <div className="cform__hp" aria-hidden="true">
            <label htmlFor={id("website")}>{ctx.t("formHoneypot")}</label>
            <input id={id("website")} name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <p className="cform__privacy">
            {ctx.t("formPrivacy")}
            {privacy && (
              <>
                {" "}
                <a href={ctx.pageHref(privacy.id)}>{ctx.t("privacy")}</a>
              </>
            )}
          </p>
          <button type="submit" className="btn btn--primary cform__submit">
            {ctx.t("formSubmit")}
          </button>
          <p className="cform__status" role="status" aria-live="polite" data-form-status="" />
        </form>
      </div>
    </Section>
  );
}
