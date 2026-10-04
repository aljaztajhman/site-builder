// Events: the published page lists every event and doesn't change by date, so the visitor's browser hides
// those whose last day (data-ends, YYYY-MM-DD) is before today, keeps a list's limit (data-limit) over the
// ones left, says so when none are left, and marks an event's own page once it has passed. Without
// JavaScript every event stays visible.
(() => {
  const d = document;
  const now = new Date();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const past = (/** @type {Element} */ el) => (el.getAttribute("data-ends") ?? "9999-12-31") < today;
  for (const list of /** @type {NodeListOf<HTMLElement>} */ (d.querySelectorAll("[data-upcoming]"))) {
    const limit = Number(list.getAttribute("data-limit")) || Infinity;
    let shown = 0;
    for (const item of /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll(":scope > [data-ends]"))) {
      const show = !past(item) && shown < limit;
      item.hidden = !show;
      if (show) shown++;
    }
    const empty = list.parentElement?.querySelector(".coll__empty");
    if (empty instanceof HTMLElement) empty.hidden = shown > 0;
  }
  const article = d.querySelector("article[data-ends]");
  const note = article?.querySelector(".entry__past");
  if (article && note instanceof HTMLElement && past(article)) note.hidden = false;
})();
