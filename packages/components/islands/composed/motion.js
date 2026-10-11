// Motion preset counter: a numeral fact counts up once on first view. Markup keeps the final value (no script, reduced motion: still).
(() => {
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const run = (el) => {
    const to = Number(el.dataset.to);
    el.style.minWidth = `${el.offsetWidth}px`;
    el.style.fontVariantNumeric = "tabular-nums";
    const t0 = window.performance.now();
    const step = (t) => {
      const k = Math.min((t - t0) / 1100, 1);
      el.textContent = k < 1 ? String(Math.round(to * (1 - (1 - k) ** 3))) : el.dataset.to;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const seen = new window.IntersectionObserver((list) => {
    for (const e of list) if (e.isIntersecting) { seen.unobserve(e.target); run(e.target); }
  }, { threshold: 0.4 });
  document.querySelectorAll(".cx-mo-counter .cx-fact__value").forEach((el) => {
    const v = el.textContent.trim(), n = Number(v), label = el.closest(".cx-el--fact")?.querySelector(".cx-fact__label")?.textContent ?? "";
    if (!/^[1-9]\d{0,3}$/.test(v) || (n >= 1900 && n <= 2100) || el.closest("a") || /€|eur|evr|cen[ae]/i.test(label)) return;
    el.dataset.to = v;
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", v);
    seen.observe(el);
  });
})();
