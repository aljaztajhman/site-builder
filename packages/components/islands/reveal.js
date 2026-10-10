// Sites with a skeleton (spec v15): the phone bar, the floating call button or the header's call waits until the
// page's first section, which offers the call itself, has scrolled away, and steps aside again while another call
// object of the page (the plate, call block or big number of a closing call) is on screen, so a screen never shows
// two call buttons. Without JS (or IntersectionObserver) they are simply always there.
(() => {
  const els = document.querySelectorAll("[data-after-hero]");
  if (!els.length) return;
  const hero = document.querySelector("main > :first-child");
  const calls = [...document.querySelectorAll("main a.plate, main a.callblock, main a.bignum")].filter((a) => !hero || !hero.contains(a));
  /** @param {boolean} on */
  const show = (on) => els.forEach((el) => el.classList.toggle("is-shown", on));
  const Observer = window.IntersectionObserver;
  if (!hero || !Observer) return show(true);
  const seen = new Set();
  const watch = new Observer((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) seen.add(e.target);
      else seen.delete(e.target);
    }
    show(seen.size === 0);
  });
  [hero, ...calls].forEach((el) => watch.observe(el));
})();
