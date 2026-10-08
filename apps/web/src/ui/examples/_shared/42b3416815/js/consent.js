// Consent-gated embeds (maps). Nothing loads before a click or a stored "granted" choice.
// Contract: <div class="embed" data-embed-src data-embed-title> ... <button data-embed-load> ... </div>
// Notice: [data-consent-notice] with [data-consent="granted|denied"] buttons; [data-consent-open] reopens it.
// With [data-consent-on-request] (a page with nothing to gate) the notice opens only from [data-consent-open].
// The choice is kept in localStorage ("sb-consent"), not in a cookie.
(() => {
  const KEY = "sb-consent";
  const d = document;
  const get = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  /** @param {string} v */
  const store = (v) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* storage blocked: the choice lasts for this page view */
    }
  };
  /**
   * @param {Element | null} box
   * @param {boolean} [focus]
   */
  const load = (box, focus) => {
    const src = box && box.getAttribute("data-embed-src");
    if (!src || !/^https:\/\//.test(src) || box.querySelector("iframe")) return;
    const f = d.createElement("iframe");
    f.src = src;
    f.title = box.getAttribute("data-embed-title") || "";
    f.loading = "lazy";
    f.referrerPolicy = "no-referrer-when-downgrade";
    f.width = "100%";
    f.height = "320";
    f.style.cssText = "display:block;width:100%;height:320px;border:0";
    box.replaceChildren(f);
    box.classList.add("is-loaded");
    if (focus) f.focus();
  };
  const loadAll = () => d.querySelectorAll("[data-embed-src]").forEach((b) => load(b));
  const notice = /** @type {HTMLElement | null} */ (d.querySelector("[data-consent-notice]"));

  d.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const one = t.closest("[data-embed-load]");
    if (one) return load(one.closest("[data-embed-src]"), true);
    const choice = t.closest("[data-consent]");
    if (choice) {
      const v = choice.getAttribute("data-consent") === "granted" ? "granted" : "denied";
      const had = d.querySelector("[data-embed-src] iframe");
      store(v);
      if (notice) notice.hidden = true;
      if (v === "granted") loadAll();
      else if (had) location.reload();
      return;
    }
    if (t.closest("[data-consent-open]") && notice) {
      notice.hidden = false;
      const first = notice.querySelector("button");
      if (first) first.focus();
    }
  });

  d.querySelectorAll("[data-consent-open]").forEach((b) => {
    if (b instanceof HTMLElement) b.hidden = false;
  });
  const c = get();
  if (c === "granted") loadAll();
  else if (!c && notice && !notice.hasAttribute("data-consent-on-request")) notice.hidden = false;
})();
