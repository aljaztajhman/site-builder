import type { RenderCtx } from "../types.ts";

/**
 * Fixed call / directions bar below 48rem. Each button needs its fact; with neither, nothing renders.
 * The page shell adds `has-action-bar` to <body> so content is padded clear of the bar.
 * `afterHero`: the page's first section already offers call and directions, so the bar slides in only once it
 * has scrolled away (CSS scroll timeline; without support, or with reduced motion, it is always there).
 */
export function MobileActionBar({ ctx, afterHero = false }: { ctx: RenderCtx; afterHero?: boolean }) {
  const call = ctx.href({ action: "call" });
  const directions = ctx.href({ action: "directions" });
  if (!call && !directions) return null;
  return (
    <nav className={afterHero ? "action-bar action-bar--after-hero" : "action-bar"} aria-label={ctx.t("quickContact")}>
      {call && (
        <a className="btn btn--primary action-bar__btn" href={call}>
          {ctx.t("call")}
        </a>
      )}
      {directions && (
        <a className="btn btn--secondary action-bar__btn" href={directions} rel="noopener" target="_blank">
          {ctx.t("directions")}
        </a>
      )}
    </nav>
  );
}
