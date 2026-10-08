// Sites with a skeleton (spec v15): the phone bar, the floating call button or the header's call waits until the
// page's first section, which offers the call itself, has scrolled away, so a screen never shows two call buttons.
// Without JS (or IntersectionObserver) they are simply always there.
(() => {
  const els = document.querySelectorAll("[data-after-hero]");
  const hero = document.querySelector("main > :first-child");
  if (!els.length) return;
  /** @param {boolean} on */
  const show = (on) => els.forEach((el) => el.classList.toggle("is-shown", on));
  const Observer = window.IntersectionObserver;
  if (!hero || !Observer) return show(true);
  new Observer((entries) => {
    for (const e of entries) show(!e.isIntersecting);
  }).observe(hero);
})();
