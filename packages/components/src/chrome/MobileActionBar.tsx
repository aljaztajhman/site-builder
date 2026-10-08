import { DIRECTIONS } from "@sb/spec";
import { Icon, type IconName } from "../primitives/index.tsx";
import type { UiKey } from "../i18n.ts";
import type { RenderCtx } from "../types.ts";

type BarAction = "call" | "directions" | "booking";

/** Each action's label, and its shorter one when three share the bar at 360 px. */
const BAR: Record<BarAction, { label: UiKey; short: UiKey; icon: IconName; external: boolean }> = {
  call: { label: "callShort", short: "callShort", icon: "phone", external: false },
  directions: { label: "directions", short: "directionsShort", icon: "map-pin", external: true },
  booking: { label: "bookShort", short: "bookShort", icon: "calendar", external: false },
};

/**
 * The bar's actions: the template's (a practice that sells appointments books first, then call and directions),
 * else call and directions. Call and directions stay one tap away on every page, whatever the template adds.
 */
export function barActions(ctx: RenderCtx): BarAction[] {
  const wanted = DIRECTIONS.find((d) => d.id === ctx.site.design.direction)?.template?.phoneBar ?? ["call", "directions"];
  return wanted.filter((a) => ctx.href({ action: a }) !== null).slice(0, 3);
}

/**
 * Fixed call / directions bar below 48rem (a template may put a booking first). Each button needs its fact; with
 * none, nothing renders.
 * The page shell adds `has-action-bar` to <body> so content is padded clear of the bar.
 * `afterHero`: the page's first section already offers call and directions, so the bar slides in only once it
 * has scrolled away (CSS scroll timeline; without support, or with reduced motion, it is always there).
 */
export function MobileActionBar({ ctx, afterHero = false, reveal = false, waitCall = false }: { ctx: RenderCtx; afterHero?: boolean; reveal?: boolean; waitCall?: boolean }) {
  const actions = barActions(ctx);
  if (actions.length === 0) return null;
  // A site with a skeleton (reveal) shows the bar once the hero has gone (reveal.js), in every browser and with reduced
  // motion too, so the hero's call and the bar's are never on one screen; without one, the CSS scroll timeline as before.
  // waitCall: the hero's call object owns the call, so only the bar's call waits (the directions are there at once).
  const props = reveal ? { className: "action-bar", ...(afterHero ? { "data-after-hero": "" } : {}) } : { className: afterHero ? "action-bar action-bar--after-hero" : "action-bar" };
  return (
    <nav {...props} aria-label={ctx.t("quickContact")}>
      {actions.map((a, i) => {
        const { label: long, short, icon, external } = BAR[a];
        const label = actions.length > 2 ? short : long;
        return (
          <a
            key={a}
            className={i === 0 ? "btn btn--primary action-bar__btn" : "btn btn--secondary action-bar__btn"}
            href={ctx.href({ action: a })!}
            rel={external ? "noopener" : undefined}
            target={external ? "_blank" : undefined}
            {...(waitCall && a === "call" ? { "data-after-hero": "" } : {})}
          >
            <Icon name={icon} />
            {ctx.t(label)}
          </a>
        );
      })}
    </nav>
  );
}

/**
 * One floating call button in the corner below 48rem (skeleton actions "float"), with a small directions button beside
 * it so both stay one tap away; lighter than the bar for businesses people visit or browse. `reveal`: waits for a hero
 * that offers call and directions itself (reveal.js). The page shell adds `has-call-float` to <body>.
 */
export function CallFloat({ ctx, reveal = false, waitCall = false }: { ctx: RenderCtx; reveal?: boolean; waitCall?: boolean }) {
  const call = ctx.href({ action: "call" });
  const directions = ctx.href({ action: "directions" });
  if (!call && !directions) return null;
  return (
    <nav className="call-float" aria-label={ctx.t("quickContact")} {...(reveal ? { "data-after-hero": "" } : {})}>
      {directions && (
        <a className="btn btn--secondary call-float__btn call-float__directions" href={directions} rel="noopener" target="_blank">
          <Icon name="map-pin" />
          <span className="visually-hidden">{ctx.t("directions")}</span>
        </a>
      )}
      {call && (
        <a className="btn btn--primary call-float__btn" href={call} {...(waitCall ? { "data-after-hero": "" } : {})}>
          <Icon name="phone" />
          {ctx.t("call")}
        </a>
      )}
    </nav>
  );
}
