import type { Page } from "playwright";

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: number;
  targets: string[];
}

export async function runAxe(page: Page): Promise<AxeViolation[]> {
  const { AxeBuilder } = await import("@axe-core/playwright");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  return r.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
}

export interface MobileReport {
  width: number;
  scrollWidth: number;
  horizontalScroll: boolean;
  /** Interactive elements smaller than the absolute minimum (24×24), excluding inline text links. */
  tinyTargets: string[];
  /** Primary targets (buttons, nav, action bar) smaller than 44×44. */
  smallPrimaryTargets: string[];
  /** Pairs of primary targets closer than the minimum gap. */
  crowdedTargets: string[];
  /** Body text elements computed below 16 px. */
  smallText: string[];
  /** A tel: link and a directions link visible in the first viewport (without scrolling). */
  callInViewport: boolean;
  directionsInViewport: boolean;
  lang: string | null;
  lcpPreload: boolean;
  /** Average characters per line of body paragraphs with ≥ 3 lines. */
  lineLengths: number[];
  /** Visual banned patterns found in computed styles. */
  banned: string[];
}

/**
 * Mobile checklist and banned visual patterns, measured in the browser on computed styles.
 * Runs in the page; keep the function self-contained.
 */
export async function measurePage(page: Page, opts: { primaryMin: number; primaryGap: number; absoluteMin: number }): Promise<MobileReport> {
  // tsx/esbuild wrap named functions with a __name() helper that doesn't exist in the page.
  await page.evaluate("globalThis.__name = globalThis.__name || ((f) => f)");
  return page.evaluate((o) => {
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : "";
      const cls = el.classList.length ? `.${[...el.classList].slice(0, 2).join(".")}` : "";
      const txt = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
      return `${el.tagName.toLowerCase()}${id}${cls} "${txt}"`;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const interactive = [...document.querySelectorAll("a[href], button, summary, input, select, textarea, [role=button]")].filter(visible);
    const isInline = (el: Element) => el.tagName === "A" && !!el.closest("p, li, dd, td, address") && getComputedStyle(el).display === "inline" && !el.classList.contains("btn");
    const tinyTargets: string[] = [];
    const smallPrimaryTargets: string[] = [];
    const primary: { el: Element; r: DOMRect }[] = [];
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      if (el.classList.contains("skip-link")) continue;
      if (!isInline(el) && (r.width < o.absoluteMin || r.height < o.absoluteMin)) tinyTargets.push(describe(el));
      const isPrimary = el.matches(".btn, nav a, header a, header button, .action-bar a, summary, [data-primary-target]");
      if (isPrimary) {
        primary.push({ el, r });
        if (r.width < o.primaryMin || r.height < o.primaryMin) smallPrimaryTargets.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    const crowdedTargets: string[] = [];
    // Fixed/sticky bars (mobile action bar, consent notice) float over the page; spacing is only
    // meaningful between targets in the same layer.
    const layerOf = (el: Element): Element | null => {
      for (let a: Element | null = el; a; a = a.parentElement) {
        const pos = getComputedStyle(a).position;
        if (pos === "fixed" || pos === "sticky") return a;
      }
      return null;
    };
    const layers = primary.map((p) => layerOf(p.el));
    for (let i = 0; i < primary.length; i++) {
      for (let j = i + 1; j < primary.length; j++) {
        if (layers[i] !== layers[j]) continue;
        const a = primary[i]!.r;
        const b = primary[j]!.r;
        if (primary[i]!.el.contains(primary[j]!.el) || primary[j]!.el.contains(primary[i]!.el)) continue;
        const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
        const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
        const overlapX = a.left < b.right && b.left < a.right;
        const overlapY = a.top < b.bottom && b.top < a.bottom;
        const gap = overlapX ? dy : overlapY ? dx : Math.hypot(dx, dy);
        if (gap < o.primaryGap && (overlapX || overlapY)) crowdedTargets.push(`${describe(primary[i]!.el)} ↔ ${describe(primary[j]!.el)} (${Math.round(gap)}px)`);
      }
    }
    const smallText: string[] = [];
    for (const el of document.querySelectorAll("main p, main li, main dd, main td")) {
      if (!visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16 && !el.closest(".eyebrow, .hours__note, small, figcaption, .price-note, .fine-print")) smallText.push(`${describe(el)} ${fs}px`);
    }
    const inViewport = (sel: string) =>
      [...document.querySelectorAll(sel)].some((el) => {
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw;
      });
    const lineLengths: number[] = [];
    for (const p of document.querySelectorAll("main p")) {
      if (!visible(p)) continue;
      const range = document.createRange();
      range.selectNodeContents(p);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const chars = (p.textContent ?? "").trim().length;
      if (lines >= 3) lineLengths.push(Math.round(chars / lines));
    }
    const banned: string[] = [];
    // Accent colours as computed rgb() strings, for the single-side border check.
    const probe = document.createElement("i");
    document.body.appendChild(probe);
    const accents = new Set(
      ["--c-primary", "--c-accent"].flatMap((v) => {
        const value = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
        if (!value) return [];
        probe.style.color = value;
        return [getComputedStyle(probe).color];
      }),
    );
    probe.remove();
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (visible(el)) {
        const sides = (["Top", "Right", "Bottom", "Left"] as const).map((s) => ({
          width: cs.getPropertyValue(`border-${s.toLowerCase()}-style`) === "none" ? 0 : parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) || 0,
          color: cs.getPropertyValue(`border-${s.toLowerCase()}-color`),
        }));
        const widest = Math.max(...sides.map((s) => s.width));
        const stripes = sides.filter((s) => s.width === widest);
        // One side drawn (or one side clearly heavier than the rest), in the primary or accent colour that
        // isn't simply the element's own text colour: the "coloured left border on cards" tell.
        if (widest >= 2 && stripes.length === 1 && sides.filter((s) => s.width > widest / 2).length === 1) {
          const c = stripes[0]!.color;
          if (accents.has(c) && c !== cs.color) banned.push(`accent single-side border: ${describe(el)}`);
        }
      }
      if (el.matches(".eyebrow") && visible(el)) {
        if (cs.textTransform === "uppercase") banned.push(`uppercase eyebrow: ${describe(el)}`);
        const ls = parseFloat(cs.letterSpacing);
        if (ls > 0.04 * parseFloat(cs.fontSize) + 0.01) banned.push(`tracked-out eyebrow: ${describe(el)}`);
      }
      if (/gradient\(/.test(cs.backgroundImage)) banned.push(`gradient: ${describe(el)}`);
      if (cs.backdropFilter && cs.backdropFilter !== "none") banned.push(`backdrop-filter: ${describe(el)}`);
      if (/mono/i.test(cs.fontFamily) && visible(el) && (el.textContent ?? "").trim()) banned.push(`monospace: ${describe(el)}`);
      if (/^H[1-3]$/.test(el.tagName) && (cs.fontStyle === "italic" || el.querySelector("em, i"))) banned.push(`italic heading: ${describe(el)}`);
      if (el.matches(".btn, button") && visible(el)) {
        const r = el.getBoundingClientRect();
        if (parseFloat(cs.borderTopLeftRadius) >= r.height / 2 - 1) banned.push(`pill button: ${describe(el)}`);
      }
      if (cs.boxShadow !== "none") {
        const blur = Math.max(...[...cs.boxShadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) => Math.abs(Number(m[1]))));
        if (blur > 12) banned.push(`heavy shadow: ${describe(el)}`);
      }
    }
    const emoji = /(?![©®™])\p{Extended_Pictographic}/u.exec(document.body.innerText);
    if (emoji) banned.push(`emoji in text: ${emoji[0]}`);
    const emDash = /.{0,20}—.{0,20}/.exec(document.body.innerText);
    if (emDash) banned.push(`em dash in text: "${emDash[0]}"`);
    // One primary action per hero: a second action is a text link, never a second button.
    const hero = document.querySelector("main > section");
    const heroButtons = hero ? [...hero.querySelectorAll(".btn")].filter(visible) : [];
    if (heroButtons.length > 1) banned.push(`${heroButtons.length} buttons in the hero: ${heroButtons.map(describe).join(", ")}`);
    const sections = [...document.querySelectorAll("main > section")];
    const centred = sections.filter((s) => {
      const heads = [...s.querySelectorAll("h1, h2, p")].filter(visible);
      return heads.length > 0 && heads.every((h) => getComputedStyle(h).textAlign === "center");
    });
    if (sections.length >= 3 && centred.length > 1) banned.push(`${centred.length} centred sections`);
    return {
      width: vw,
      scrollWidth: doc.scrollWidth,
      horizontalScroll: doc.scrollWidth > vw,
      tinyTargets,
      smallPrimaryTargets,
      crowdedTargets,
      smallText,
      callInViewport: inViewport('a[href^="tel:"]'),
      directionsInViewport: inViewport('a[href*="google.com/maps"]'),
      lang: doc.getAttribute("lang"),
      lcpPreload: !!document.querySelector('link[rel="preload"][as="image"]'),
      lineLengths,
      banned: [...new Set(banned)].slice(0, 30),
    };
  }, opts);
}

export interface CallButtons {
  /** Most call buttons seen together on one screen. */
  max: number;
  /** Where that screen starts (px from the top), and what was on it. */
  at: number;
  buttons: string[];
}

/**
 * Call buttons per screen (banned: more than one; docs/PRODUCT.md). Walks the page a half screen at a time and counts
 * the visible tel: links on each screen that read as a button: on a box of their own (a background or a border all
 * round, like a button, the plate or the bar's call) or on a fixed or sticky layer that stays on screen (the bar, the
 * floating button, a sticky header's call). A phone number in text, a fact list or the footer is a link, not a button.
 * Ends back at the top. Runs in the page as a string, so tsx helpers don't leak in.
 */
export async function callButtonsPerScreen(page: Page): Promise<CallButtons> {
  return page.evaluate(`(async () => {
    const vh = window.innerHeight, vw = window.innerWidth;
    const shown = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const onLayer = (el) => {
      for (let a = el; a; a = a.parentElement) {
        const p = getComputedStyle(a).position;
        if (p === "fixed" || p === "sticky") return true;
      }
      return false;
    };
    const opaque = (c) => c !== "transparent" && !/rgba\\([^)]*,\\s*0\\)$/.test(c);
    const boxed = (el) => {
      const cs = getComputedStyle(el);
      if (opaque(cs.backgroundColor)) return true;
      return ["top", "right", "bottom", "left"].every((s) => cs.getPropertyValue("border-" + s + "-style") !== "none" && parseFloat(cs.getPropertyValue("border-" + s + "-width")) >= 1 && opaque(cs.getPropertyValue("border-" + s + "-color")));
    };
    const describe = (el) => el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().split(/\\s+/).slice(0, 2).join(".") : "") + ' "' + (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24) + '"';
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
    const height = document.documentElement.scrollHeight;
    let best = { max: 0, at: 0, buttons: [] };
    for (let y = 0; ; y += Math.round(vh / 2)) {
      window.scrollTo({ top: y, behavior: "instant" });
      await settle();
      const on = [...document.querySelectorAll('a[href^="tel:"]')].filter((el) => {
        if (!shown(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return false;
        return boxed(el) || onLayer(el);
      });
      if (on.length > best.max) best = { max: on.length, at: window.scrollY, buttons: on.map(describe) };
      if (y + vh >= height) break;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    await settle();
    return best;
  })()`);
}

/** Scrolls through the page so lazy images load, then back to the top (for full-page screenshots). */
export async function loadLazyImages(page: Page): Promise<void> {
  await page.evaluate("globalThis.__name = globalThis.__name || ((f) => f)");
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += Math.round(window.innerHeight * 0.8)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    await Promise.all(
      [...document.images]
        .filter((i) => !i.complete)
        .map(
          (i) =>
            new Promise((r) => {
              i.addEventListener("load", r, { once: true });
              setTimeout(r, 2000);
            }),
        ),
    );
    window.scrollTo(0, 0);
  });
}

/**
 * Hides position:fixed elements (mobile action bar, desktop consent box) before a full-page
 * screenshot. Chromium draws them once, at their place in the first viewport, so on a long page
 * they seem to cover content in the middle; the critique read that as a layout bug. Only the
 * screenshot changes, never the page files.
 */
export async function hideFixedForFullPage(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    for (const el of document.querySelectorAll("body *")) {
      if (getComputedStyle(el).position === "fixed") el.style.setProperty("visibility", "hidden", "important");
    }
  })()`);
}
