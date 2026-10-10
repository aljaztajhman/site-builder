// fact.count: counts up once on first view (not with data-still, reduced motion or no JS: markup value).
(() => {
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const run = (el) => {
    const to = Number(el.getAttribute("data-count"));
    if (!Number.isInteger(to) || to < 1) return;
    el.style.minWidth = `${el.offsetWidth}px`;
    const t0 = window.performance.now();
    const step = (t) => {
      const k = Math.min((t - t0) / 1100, 1);
      el.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
      else el.style.minWidth = "";
    };
    requestAnimationFrame(step);
  };
  const seen = new window.IntersectionObserver((list) => {
    for (const e of list) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      run(e.target);
    }
  }, { threshold: 0.4 });
  document.querySelectorAll("[data-count]:not([data-still])").forEach((el) => seen.observe(el));
})();
