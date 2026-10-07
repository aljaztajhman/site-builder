// Mobile menu: toggle, focus trap while open, Escape/link/outside click/resize close. Progressive enhancement.
(() => {
  const d = document;
  d.documentElement.classList.add("js");
  const btn = /** @type {HTMLElement | null} */ (d.querySelector("[data-nav-toggle]"));
  const id = btn && btn.getAttribute("aria-controls");
  const nav = id ? d.getElementById(id) : null;
  if (!btn || !nav) return;
  const wide = matchMedia("(min-width: 48rem)");
  const isOpen = () => btn.getAttribute("aria-expanded") === "true";
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === "Escape") return set(false, true);
    if (e.key !== "Tab") return;
    const f = [btn, .../** @type {NodeListOf<HTMLElement>} */ (nav.querySelectorAll("a[href],button"))];
    const first = btn;
    const last = f[f.length - 1] ?? btn;
    if (e.shiftKey && d.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && d.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!f.some((el) => el === d.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  };
  /** @param {PointerEvent} e */
  const onDown = (e) => {
    const t = e.target instanceof Node ? e.target : null;
    if (!nav.contains(t) && !btn.contains(t)) set(false);
  };
  /** @type {(open: boolean, refocus?: boolean) => void} */
  const set = (open, refocus) => {
    btn.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    const on = open ? "addEventListener" : "removeEventListener";
    d[on]("keydown", /** @type {EventListener} */ (onKey));
    d[on]("pointerdown", /** @type {EventListener} */ (onDown));
    if (!open && refocus) btn.focus();
  };
  btn.addEventListener("click", () => set(!isOpen()));
  nav.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest("a") && isOpen()) set(false);
  });
  wide.addEventListener("change", (e) => {
    if (e.matches && isOpen()) set(false);
  });
})();
