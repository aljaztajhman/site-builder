import { Section, titleId } from "../../primitives/index.tsx";
import type { SectionProps } from "../../types.ts";

/** Body of the 404 page: title, one sentence, a button back to the homepage. System-only. */
export function NotFound({ section, ctx }: SectionProps<"not-found">) {
  const { props } = section;
  const home = ctx.site.pages.find((p) => p.kind === "home");
  return (
    <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>
      <div className="not-found">
        <h1 id={titleId(section.id)} className="hero-title">
          {props.title}
        </h1>
        <p className="lead">{props.body}</p>
        {home && (
          <div className="actions">
            <a className="btn btn--primary" href={ctx.pageHref(home.id)}>
              {ctx.t("notFoundHome")}
            </a>
          </div>
        )}
      </div>
    </Section>
  );
}
