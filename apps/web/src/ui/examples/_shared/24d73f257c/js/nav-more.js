// The wide header's "More" (only on pages that have it): a native disclosure that Escape, a tap outside it or focus
// leaving it closes. Without JS it still opens and closes with its own button.
(() => {
  const d = document;
  const m = /** @type {HTMLDetailsElement | null} */ (d.querySelector(".site-nav__more details"));
  if (!m) return;
  /** @param {EventTarget | null} t */
  const off = (t) => {
    if (!(t instanceof Node && m.contains(t))) m.open = false;
  };
  m.addEventListener("focusout", (e) => off(e.relatedTarget));
  d.addEventListener("pointerdown", (e) => off(e.target));
  m.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && m.open) {
      m.open = false;
      m.querySelector("summary")?.focus();
    }
  });
})();
