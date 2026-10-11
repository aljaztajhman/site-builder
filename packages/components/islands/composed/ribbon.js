// Composed ribbons that loop (spec v20 ribbon move "loop", owner decision D2; WCAG 2.2.2): the marquee runs only once
// this has run and only where motion is welcome. It shows the pause button, pauses the marquee while it is off screen,
// and the button stops and restarts it (aria-pressed: true while stopped). Hover and keyboard focus pause it in CSS
// (composed-v2.css, region kinds). Without JS, with reduced motion, or in a browser without scroll-driven animations
// (the loop and the room for the button are inside `@supports (animation-timeline: scroll())`, e.g. Firefox today), the
// ribbon stays still and has no button: a button there would cover the still row and stop nothing.
(() => {
  const ribbons = document.querySelectorAll("[data-cx-loop]");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!ribbons.length || still.matches || !window.CSS?.supports?.("animation-timeline: scroll()")) return;
  const Observer = window.IntersectionObserver;
  const watch = Observer
    ? new Observer((entries) => {
        for (const e of entries) e.target.classList.toggle("is-off", !e.isIntersecting);
      })
    : null;
  ribbons.forEach((ribbon) => {
    const button = ribbon.querySelector("button.cx-rb__btn");
    if (!(button instanceof window.HTMLButtonElement)) return;
    // A toggle button with a fixed label ("Ustavi premikanje"): only aria-pressed changes (WAI-ARIA button pattern).
    button.addEventListener("click", () => {
      const stopped = ribbon.classList.toggle("is-paused");
      button.setAttribute("aria-pressed", String(stopped));
    });
    button.hidden = false;
    ribbon.classList.add("is-live");
    watch?.observe(ribbon);
  });
  // Reduced motion switched on later: CSS stops the marquee at once; the button has nothing left to do.
  still.addEventListener("change", (e) => {
    if (e.matches) ribbons.forEach((r) => r.querySelector("button.cx-rb__btn")?.setAttribute("hidden", ""));
  });
})();
