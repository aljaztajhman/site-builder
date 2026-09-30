import type { Page } from "playwright";

/**
 * What a visitor's first screen looks like, measured on the rendered page (no model): how much of it
 * is photo, how many buttons compete in it, how tall the headline runs and whether an empty band opens
 * up. The pass/fail checks can't see any of this; these numbers move when the design gets better or worse.
 */
export interface Composition {
  viewport: { width: number; height: number };
  /** Share of the first screen covered by visible photos in the page body (the header logo doesn't count), 0–1. */
  imageShare: number;
  /** Where the first visible image starts, in screen heights from the top (0.5 = half way down the first screen); null when the page has none. */
  firstImageAt: number | null;
  /** Buttons and button-styled links visible in the first screen, fixed bars included, the menu toggle not. */
  buttonsFirstScreen: number;
  /** Lines of the page's h1. */
  headlineLines: number;
  /** Tallest horizontal band (px) in the first two screens with no text, image or control in it. */
  largestGapPx: number;
}

/** Measures the page as loaded (scrolled to the top). Runs in the page as a string, so tsx helpers don't leak in. */
export async function measureComposition(page: Page): Promise<Composition> {
  return page.evaluate(`(() => {
    window.scrollTo(0, 0);
    const vw = window.innerWidth, vh = window.innerHeight;
    const shown = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };

    // Photo share of the first screen: a coarse grid, so overlapping images count once.
    const cell = 8, cols = Math.ceil(vw / cell), rows = Math.ceil(vh / cell);
    const grid = new Uint8Array(cols * rows);
    let firstImageTop = null;
    for (const img of document.querySelectorAll("main img")) {
      if (!shown(img)) continue;
      const r = img.getBoundingClientRect();
      const top = r.top + window.scrollY;
      if (firstImageTop === null || top < firstImageTop) firstImageTop = top;
      const x0 = Math.max(0, Math.floor(r.left / cell)), x1 = Math.min(cols, Math.ceil(r.right / cell));
      const y0 = Math.max(0, Math.floor(r.top / cell)), y1 = Math.min(rows, Math.ceil(r.bottom / cell));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[y * cols + x] = 1;
    }
    let covered = 0;
    for (const v of grid) covered += v;

    // Buttons in the first screen (fixed bars included, closed menus not).
    const buttons = new Set();
    for (const el of document.querySelectorAll("a.btn, button, .btn, [role=button], .action-bar a")) {
      // The menu toggle is navigation, not a call to action.
      if (!shown(el) || el.closest("[hidden], [aria-hidden=true]") || el.hasAttribute("aria-expanded")) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
      if (el.parentElement && buttons.has(el.parentElement.closest("a.btn, button, .btn"))) continue;
      buttons.add(el);
    }

    // Headline lines.
    let headlineLines = 0;
    const h1 = document.querySelector("h1");
    if (h1 && shown(h1)) {
      const cs = getComputedStyle(h1);
      const lh = cs.lineHeight === "normal" ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight);
      headlineLines = Math.max(1, Math.round(h1.getBoundingClientRect().height / lh));
    }

    // Largest empty band in the first two screens: y-intervals covered by content, then the widest gap.
    const limit = Math.min(2 * vh, document.documentElement.scrollHeight);
    const spans = [];
    const content = "img, svg, video, input, textarea, select, button, h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption, label, a, span, strong, b, em, small, td, th";
    for (const el of document.querySelectorAll(content)) {
      if (!shown(el)) continue;
      const leaf = ["IMG", "SVG", "VIDEO", "INPUT", "TEXTAREA", "SELECT"].includes(el.tagName.toUpperCase());
      if (!leaf && !Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect();
      const fixed = getComputedStyle(el).position === "fixed" || el.closest(".action-bar");
      const top = fixed ? r.top : r.top + window.scrollY, bottom = fixed ? r.bottom : r.bottom + window.scrollY;
      if (bottom <= 0 || top >= limit) continue;
      spans.push([Math.max(0, top), Math.min(limit, bottom)]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    let gap = 0, reach = 0;
    for (const [t, b] of spans) {
      if (t > reach) gap = Math.max(gap, t - reach);
      reach = Math.max(reach, b);
    }
    gap = Math.max(gap, limit - reach);

    return {
      viewport: { width: vw, height: vh },
      imageShare: Math.round((covered / grid.length) * 100) / 100,
      firstImageAt: firstImageTop === null ? null : Math.round((firstImageTop / vh) * 100) / 100,
      buttonsFirstScreen: buttons.size,
      headlineLines,
      largestGapPx: Math.round(gap),
    };
  })()`);
}
