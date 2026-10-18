// Cookieless site statistics: a tap on a call or directions link sends one word ("call" or "directions"),
// added to that day's total. Nothing about the visitor. Only from a live address: /s/<slug>/ on the app,
// or the site's own hostname (shared files at /_shared/, the server finds the site by hostname). The
// editor's preview, the landing examples and a downloaded copy send nothing.
(() => {
  if (!/^https?:$/.test(location.protocol) || !navigator.sendBeacon) return;
  const live = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(location.pathname);
  const s = document.currentScript instanceof HTMLScriptElement ? new URL(document.currentScript.src, location.href) : null;
  const own = !live && s !== null && s.origin === location.origin && s.pathname.startsWith("/_shared/");
  if (!live && !own) return;
  const url = live ? `/s/${live[1]}/_hit` : "/_hit";
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const href = a ? a.getAttribute("href") ?? "" : "";
      const kind = href.startsWith("tel:") ? "call" : /^https:\/\/www\.google\.com\/maps\//.test(href) ? "directions" : null;
      if (kind) navigator.sendBeacon(url, kind);
    },
    { capture: true, passive: true },
  );
})();
