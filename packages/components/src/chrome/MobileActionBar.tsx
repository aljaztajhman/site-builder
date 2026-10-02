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
export function MobileActionBar({ ctx, afterHero = false }: { ctx: RenderCtx; afterHero?: boolean }) {
  const actions = barActions(ctx);
  if (actions.length === 0) return null;
  return (
    <nav className={afterHero ? "action-bar action-bar--after-hero" : "action-bar"} aria-label={ctx.t("quickContact")}>
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
          >
            <Icon name={icon} />
            {ctx.t(label)}
          </a>
        );
      })}
    </nav>
  );
}
