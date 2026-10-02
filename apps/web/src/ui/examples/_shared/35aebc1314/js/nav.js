// Mobile menu: toggle, focus trap while open, Escape/link/outside click/resize close. Progressive enhancement.
(() => {
  const d = document;
  d.documentElement.classList.add("js");
  const btn = d.querySelector("[data-nav-toggle]");
  const nav = btn && d.getElementById(btn.getAttribute("aria-controls"));
  if (!nav) return;
  const wide = matchMedia("(min-width: 48rem)");
  const isOpen = () => btn.getAttribute("aria-expanded") === "true";
  const onKey = (e) => {
    if (e.key === "Escape") return set(false, true);
    if (e.key !== "Tab") return;
    const f = [btn, ...nav.querySelectorAll("a[href],button")];
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && d.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && d.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!f.includes(d.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  };
  const onDown = (e) => {
    if (!nav.contains(e.target) && !btn.contains(e.target)) set(false);
  };
  function set(open, refocus) {
    btn.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    d[open ? "addEventListener" : "removeEventListener"]("keydown", onKey);
    d[open ? "addEventListener" : "removeEventListener"]("pointerdown", onDown);
    if (!open && refocus) btn.focus();
  }
  btn.addEventListener("click", () => set(!isOpen()));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a") && isOpen()) set(false);
  });
  wide.addEventListener("change", (e) => {
    if (e.matches && isOpen()) set(false);
  });
})();
