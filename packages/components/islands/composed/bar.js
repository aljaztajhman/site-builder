// reveal.js for pages with a composed fact that calls (a plate linked to the phone; spec v20). The same mechanism, on
// the same marks: the elements marked data-after-hero (the bar, the floating call button, or only their call and the
// header's) get is-shown once the page's first section has scrolled away, and lose it while another call object is on
// screen. Its list of call objects adds the composed facts that call (a.cx-fact__a[href^="tel:"]). site.tsx loads this
// in place of reveal.js on such a page, so one script runs the marks; reveal.js stays as it is in the shared bundle
// (the bundle hash and every page without composed sections keep their bytes). Without JS (or IntersectionObserver)
// they are simply always there.
(() => {
  const els = document.querySelectorAll("[data-after-hero]");
  if (!els.length) return;
  const hero = document.querySelector("main > :first-child");
  const calls = [...document.querySelectorAll('main a.plate, main a.callblock, main a.bignum, main a.cx-fact__a[href^="tel:"]')].filter((a) => !hero || !hero.contains(a));
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
