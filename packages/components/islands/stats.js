// The site's own statistics, without cookies: a tap on a call or directions link sends one word
// ("call" or "directions") to the server, which adds it to that day's total. Nothing about the visitor.
// Only on the live address (/s/<slug>/): the editor's preview and a downloaded copy send nothing.
(() => {
  const live = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(location.pathname);
  if (!live || !/^https?:$/.test(location.protocol) || !navigator.sendBeacon) return;
  const url = `/s/${live[1]}/_hit`;
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
