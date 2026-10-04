// The site's own statistics, without cookies: a tap on a call or directions link sends one word
// ("call" or "directions") to the server, which adds it to that day's total. Nothing about the visitor.
// Only on a live address: /s/<slug>/ on the app, or the site's own hostname (its domain, or
// <slug>.<platform domain>), where the site sits at the root and the server finds the site from the
// hostname. The editor's preview, the landing page's examples and a downloaded copy send nothing.
(() => {
  if (!/^https?:$/.test(location.protocol) || !navigator.sendBeacon) return;
  const live = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(location.pathname);
  // At the root of its own hostname the shared files are at /_shared/… (the app's own pages load them
  // from /s/_shared/, the preview and the examples from deeper paths).
  const script = document.currentScript instanceof HTMLScriptElement ? new URL(document.currentScript.src, location.href) : null;
  const ownHost = !live && script !== null && script.origin === location.origin && script.pathname.startsWith("/_shared/");
  if (!live && !ownHost) return;
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
