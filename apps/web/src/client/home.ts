/**
 * Landing page, progressive only: the page reads fine without it. Scales the desktop example to its
 * column, plays each section's drawing once in view, plays the hero demo,
 * and runs the prompt box, which is the intake for everyone: it keeps what was typed across the login
 * and restores it, counts attached files, loads the bot check (no account) when the visitor starts on
 * the form, and blocks a second submit while photos upload.
 */
import { INTAKE_DRAFT_KEY, takeIntakeDraft, type IntakeDraft } from "./intake-draft.ts";

// Vignettes start hidden only once this has run (home.css), so without JavaScript they show finished.
document.documentElement.classList.add("js");

// Fit the 1280 px desktop example to its container.
const fit = () => {
  for (const wrap of document.querySelectorAll<HTMLElement>(".deskwrap")) {
    const frame = wrap.querySelector("iframe");
    if (!frame) continue;
    const s = wrap.clientWidth / 1280;
    frame.style.transform = `scale(${s})`;
    wrap.style.height = `${1500 * s}px`;
  }
};
fit();
addEventListener("resize", fit);

// Play each outcome row and the "Kako deluje" timeline once, when it comes into view.
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      io.unobserve(e.target);
    }
  },
  { threshold: 0.25 },
);
for (const s of document.querySelectorAll("#kako, .win")) io.observe(s);

/**
 * The hero demo: the description is typed, "Ustvari" pressed, the build steps tick, the example site
 * appears on a phone, then the frame widens to a computer and the same page re-flows. Loops while in
 * view, with a pause button. Without JavaScript the phone view stays (no data-step).
 * A trade's showcase (data-showcase) is not made from a typed description, so it starts on the phone.
 */
const demo = document.querySelector<HTMLElement>("[data-demo]");
/** Restarts the demo from its first step (after a trade switch). */
let restartDemo = () => {};
/** Stops the demo on the finished site (a trade switch shows its site at once). */
let showSite = () => {};
if (demo) {
  const stage = demo.querySelector<HTMLElement>(".demo-stage")!;
  const frame = demo.querySelector<HTMLIFrameElement>(".demo-screen iframe")!;
  const text = demo.querySelector<HTMLElement>(".demo-text")!;
  const full = text.dataset.text ?? text.textContent ?? "";
  // Phone and computer sizes from the column width: the site is shown at 360 and at 1280 px, scaled.
  const size = () => {
    const w = stage.clientWidth;
    const pw = Math.min(280, w - 24);
    const ph = Math.round(pw * 1.95);
    const dh = Math.round(w * 0.62) + 24;
    const vars: Record<string, string> = { "--pw": `${pw}px`, "--ph": `${ph}px`, "--ps": String(pw / 360), "--dw": `${w}px`, "--dh": `${dh}px`, "--ds": String(w / 1280), "--stage-h": `${Math.max(ph, dh) + 24}px` };
    for (const [k, v] of Object.entries(vars)) demo.style.setProperty(k, v);
  };
  size();
  addEventListener("resize", size);
  // Reduced motion (e.g. Windows with animation effects off): the same story in cuts and fades, no sliding or resizing.
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const setCalm = () => demo.classList.toggle("calm", calm.matches);
  setCalm();
  calm.addEventListener("change", setCalm);
  let timers: number[] = [];
  let paused = false;
  let onScreen = false;
  const at = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
  const scrollSite = (top: number) => {
    try {
      frame.contentWindow?.scrollTo({ top, behavior: calm.matches ? "auto" : "smooth" });
    } catch {
      // Not loaded yet: the demo goes on without the scroll.
    }
  };
  const stop = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const play = () => {
    stop();
    if (demo.dataset.showcase !== undefined) {
      text.textContent = full;
      demo.dataset.step = "phone";
      scrollSite(0);
      at(3300, () => scrollSite(320));
      at(6500, () => {
        scrollSite(0);
        demo.dataset.step = "desk";
      });
      at(14700, play);
      return;
    }
    demo.dataset.step = "type";
    text.textContent = "";
    scrollSite(0);
    // Tempo: about a third slower than the first version (owner, 2026-10-01).
    const typing = Math.round(full.length / 3) * 55;
    for (let i = 3; i <= full.length + 2; i += 3) at((i / 3) * 55, () => (text.textContent = full.slice(0, i)));
    at(typing + 800, () => (demo.dataset.step = "build"));
    at(typing + 4300, () => (demo.dataset.step = "phone"));
    at(typing + 7600, () => scrollSite(320));
    at(typing + 10800, () => {
      scrollSite(0);
      demo.dataset.step = "desk";
    });
    at(typing + 19000, play);
  };
  const update = () => {
    if (onScreen && !paused && !document.hidden) {
      if (!timers.length) play();
    } else stop();
  };
  // A loop that runs on its own needs a way to stop it (WCAG 2.2.2).
  const pause = demo.querySelector<HTMLButtonElement>(".demo-pause");
  if (pause) {
    pause.hidden = false;
    pause.addEventListener("click", () => {
      paused = !paused;
      pause.setAttribute("aria-pressed", String(paused));
      pause.textContent = paused ? "Predvajaj" : "Ustavi";
      if (paused) {
        stop();
        // Paused shows the finished site, not a half-typed description.
        text.textContent = full;
        demo.dataset.step = "phone";
      }
      update();
    });
  }
  // Only while the hero is on screen and the tab is visible.
  new IntersectionObserver((entries) => {
    for (const e of entries) onScreen = e.isIntersecting;
    update();
  }, { threshold: 0.3 }).observe(demo);
  document.addEventListener("visibilitychange", update);
  showSite = () => {
    stop();
    text.textContent = full;
    demo.dataset.step = "phone";
  };
  restartDemo = () => {
    stop();
    if (paused) {
      text.textContent = full;
      demo.dataset.step = "phone";
    } else update();
  };
}

/**
 * Trade chips: the page takes the chosen trade's colours, heading face and corners, and the demo shows
 * its showcase site. A view transition reveals the new look in a circle from the chip (about 0.6 s);
 * with reduced motion, or without view transitions, the look changes at once. The address follows
 * (/?primer=<id>), so it can be shared and the back button is not filled with switches.
 */
interface Trade {
  id: string;
  label: string;
  page: string;
  title: string;
  caption: string;
  font: { family: string; url: string; weights: string };
  vars: Record<string, string>;
}
const tradesNav = document.querySelector<HTMLElement>(".trades");
const tradesJson = document.getElementById("trades-data")?.textContent;
if (tradesNav && tradesJson && demo) {
  const trades = JSON.parse(tradesJson) as Trade[];
  const root = document.documentElement;
  const frame = demo.querySelector<HTMLIFrameElement>(".demo-screen iframe")!;
  const caption = demo.querySelector<HTMLElement>(".phone-cap")!;
  const status = tradesNav.querySelector<HTMLElement>("[data-trade-status]")!;
  const reset = tradesNav.querySelector<HTMLAnchorElement>(".trades-reset")!;
  const chips = [...tradesNav.querySelectorAll<HTMLAnchorElement>("a.chip[data-trade-id]")];
  // The product's own look, whichever look the server rendered (/?primer= renders a trade's).
  const original = { page: frame.dataset.defaultSrc ?? frame.getAttribute("src")!, title: frame.dataset.defaultTitle ?? frame.title, caption: caption.dataset.default ?? "" };
  const varNames = [...new Set(trades.flatMap((t) => Object.keys(t.vars)))];
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = matchMedia("(max-width: 47.99rem)");
  const loadedFonts = new Map<string, Promise<unknown>>();
  const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise((r) => window.setTimeout(r, ms))]);

  const fontFor = (t: Trade): Promise<unknown> => {
    let p = loadedFonts.get(t.id);
    if (!p) {
      const face = new FontFace(t.font.family, `url("${t.font.url}") format("woff2")`, { weight: t.font.weights, display: "swap" });
      document.fonts.add(face);
      p = face.load().catch(() => undefined);
      loadedFonts.set(t.id, p);
    }
    return p;
  };
  const frameLoaded = (src: string): Promise<unknown> => {
    if (frame.getAttribute("src") === src) return Promise.resolve();
    const done = new Promise((r) => frame.addEventListener("load", r, { once: true }));
    // A lazy frame waits for layout, which a view transition holds back: load it now.
    frame.loading = "eager";
    frame.src = src;
    return done;
  };

  /** Puts the page in `t`'s look (null: the product's own). Waits for the font and the site, briefly. */
  const apply = async (t: Trade | null) => {
    if (t) await within(fontFor(t), 800);
    for (const name of varNames) root.style.removeProperty(name);
    if (t) for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
    if (t) root.dataset.trade = t.id;
    else delete root.dataset.trade;
    for (const c of chips) {
      if (c.dataset.tradeId === t?.id) c.setAttribute("aria-current", "true");
      else c.removeAttribute("aria-current");
    }
    reset.hidden = !t;
    caption.textContent = t ? t.caption : original.caption;
    frame.title = t ? t.title : original.title;
    if (t) demo.dataset.showcase = "";
    else delete demo.dataset.showcase;
    showSite();
    status.textContent = t ? `Prikazan primer: ${t.label}` : "Prikazan izvirni videz";
    await within(frameLoaded(t ? t.page : original.page), 1200);
  };

  let busy = false;
  const switchTo = async (t: Trade | null, from: { x: number; y: number }) => {
    if (busy || (root.dataset.trade ?? null) === (t?.id ?? null)) return;
    busy = true;
    const url = new URL(location.href);
    if (t) url.searchParams.set("primer", t.id);
    else url.searchParams.delete("primer");
    history.replaceState(null, "", url);
    const vt = (document as Document & { startViewTransition?: (cb: () => Promise<void>) => { ready: Promise<void>; finished: Promise<void> } }).startViewTransition;
    try {
      if (!vt || calm.matches) await apply(t);
      else {
        root.classList.add("trade-switch");
        const transition = vt.call(document, () => apply(t));
        await transition.ready;
        const r = Math.hypot(Math.max(from.x, innerWidth - from.x), Math.max(from.y, innerHeight - from.y));
        root.animate({ clipPath: [`circle(0px at ${from.x}px ${from.y}px)`, `circle(${r}px at ${from.x}px ${from.y}px)`] }, { duration: 600, easing: "cubic-bezier(.2,.7,.2,1)", pseudoElement: "::view-transition-new(root)" });
        await transition.finished;
      }
    } catch {
      // A skipped transition still applied the look.
    } finally {
      root.classList.remove("trade-switch");
      busy = false;
      restartDemo();
      // On a phone the site is below the chips: bring it into view.
      if (narrow.matches && t) demo.scrollIntoView({ behavior: calm.matches ? "auto" : "smooth", block: "center" });
    }
  };

  const point = (e: MouseEvent, el: HTMLElement) => {
    if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  for (const chip of chips) {
    const t = trades.find((x) => x.id === chip.dataset.tradeId);
    if (!t) continue;
    chip.addEventListener("click", (e) => {
      // A new tab or window keeps its own behaviour.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      void switchTo(t, point(e, chip));
    });
    // Font and page are small and cached for good: fetch them when the pointer or focus arrives.
    const warm = () => {
      void fontFor(t);
      void fetch(t.page).catch(() => undefined);
    };
    chip.addEventListener("pointerenter", warm, { once: true });
    chip.addEventListener("focus", warm, { once: true });
  }
  reset.addEventListener("click", (e) => {
    e.preventDefault();
    void switchTo(null, point(e, reset));
  });

  // Phones: five chips, the rest behind "Več dejavnosti".
  const list = tradesNav.querySelector<HTMLElement>(".chips")!;
  const more = tradesNav.querySelector<HTMLButtonElement>(".chip.more")!;
  const fold = () => {
    const folded = narrow.matches && more.getAttribute("aria-expanded") !== "true";
    list.classList.toggle("collapsed", folded);
    more.hidden = !narrow.matches || more.getAttribute("aria-expanded") === "true" || chips.length <= 5;
  };
  more.addEventListener("click", () => {
    more.setAttribute("aria-expanded", "true");
    fold();
    chips[5]?.focus();
  });
  narrow.addEventListener("change", fold);
  fold();
}

const form = document.querySelector<HTMLFormElement>("form[data-home-intake]");
const ta = form?.querySelector("textarea");
// Back from the login with what was typed before it: fill it in and open the control that was asked for.
const draft = form && ta ? takeIntakeDraft() : null;
if (form && ta && draft) {
  if (draft.description && !ta.value) ta.value = draft.description;
  if (draft.scope) form.querySelector<HTMLInputElement>(`input[name=scope][value=${draft.scope}]`)?.click();
  const target = draft.attach && form.querySelector<HTMLInputElement>(`input[type=file][name=${draft.attach}]`);
  ta.scrollIntoView({ block: "center" });
  (target || ta).focus();
}
// The prompt's placeholder stays still: the hero demo beside it does the typing, two at once compete.

if (ta) {
  // Going to the login from here with something typed: the text waits in this tab's sessionStorage (never the URL).
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="/login"]')) {
    a.addEventListener("click", () => {
      if (!ta.value.trim()) return;
      const saved: IntakeDraft = { description: ta.value.trim(), scope: "home" };
      try {
        sessionStorage.setItem(INTAKE_DRAFT_KEY, JSON.stringify(saved));
      } catch {
        // Storage blocked: the prompt simply starts empty after the login.
      }
    });
  }
}

// Turnstile, on the form without an account: Cloudflare's script loads only once the visitor starts on
// the form (not on every visit to the page). It puts its token in the form as cf-turnstile-response.
const bot = form?.querySelector<HTMLElement>("[data-turnstile-src]");
let botLoading = false;
const loadBot = () => {
  if (!bot || botLoading) return;
  botLoading = true;
  const s = document.createElement("script");
  s.src = bot.dataset.turnstileSrc!;
  s.async = true;
  document.head.append(s);
};
const botToken = () => form?.querySelector<HTMLInputElement>("input[name=cf-turnstile-response]")?.value ?? "";
if (form && bot) for (const ev of ["focusin", "pointerdown", "input"]) form.addEventListener(ev, loadBot, { once: true });

if (form) {
  for (const input of form.querySelectorAll<HTMLInputElement>(".attach input[type=file]")) {
    input.addEventListener("change", () => {
      const label = input.closest("label")!;
      const n = input.files?.length ?? 0;
      if (n) label.dataset.count = String(n);
      else delete label.dataset.count;
    });
  }
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
  // The button's own label (home.tsx), put back after a refused or failed send.
  const idle = button?.textContent ?? "";
  const busy = (label: string | null) => {
    if (!button) return;
    button.disabled = label !== null;
    button.textContent = label ?? idle;
  };
  /** A refusal above the form; the text stays in it. */
  const say = (text: string) => {
    let note = document.querySelector<HTMLElement>(".hero .note.bad");
    if (!note) {
      note = document.createElement("p");
      note.className = "note bad";
      note.setAttribute("role", "alert");
      form.before(note);
    }
    note.textContent = text;
  };
  const waitForBot = async () => {
    const started = Date.now();
    while (!botToken() && Date.now() - started < 15_000) await new Promise((r) => window.setTimeout(r, 200));
  };
  // Without an account (data-ticket): the caps first, then the text alone for a ticket (bot check and
  // limits on the server, before any file is sent), then the form with its files, carrying the ticket.
  const ticketUrl = form.dataset.ticket;
  let sending = false;
  form.addEventListener("submit", (e) => {
    if (!ticketUrl) {
      // Signed in: the form goes as it is. Disabled after the submit event, so the button's value still counts.
      window.setTimeout(() => busy("Nalagam …"));
      return;
    }
    e.preventDefault();
    if (sending) return;
    const maxPhotos = Number(form.dataset.maxPhotos);
    const maxBytes = Number(form.dataset.maxBytes);
    const photos = form.querySelector<HTMLInputElement>("input[name=photos]")?.files?.length ?? 0;
    const bytes = [...form.querySelectorAll<HTMLInputElement>("input[type=file]")].reduce((n, i) => n + [...(i.files ?? [])].reduce((m, f) => m + f.size, 0), 0);
    if (photos > maxPhotos || bytes > maxBytes) return say(`Brez prijave lahko pošljete največ ${maxPhotos} fotografij, skupaj do ${Math.floor(maxBytes / 1e6)} MB. Izberite manj ali manjše.`);
    sending = true;
    busy("Preverjam …");
    void (async () => {
      try {
        if (bot) {
          loadBot();
          await waitForBot();
        }
        const fields = new URLSearchParams({
          _csrf: form.querySelector<HTMLInputElement>("input[name=_csrf]")?.value ?? "",
          description: ta?.value ?? "",
          "cf-turnstile-response": botToken(),
        });
        const res = await fetch(ticketUrl, { method: "POST", body: fields, headers: { accept: "application/json" } });
        const r = (await res.json().catch(() => ({}))) as { ticket?: string; message?: string };
        if (!res.ok || !r.ticket) {
          say(r.message ?? "Pošiljanje ni uspelo. Poskusite znova.");
          // A Turnstile token works once: a fresh one for the next try.
          (window as { turnstile?: { reset(): void } }).turnstile?.reset();
          busy(null);
          sending = false;
          return;
        }
        busy("Nalagam …");
        form.action = `/api/sites?ticket=${encodeURIComponent(r.ticket)}`;
        // The native submit: no submit event again, the files go as multipart.
        form.submit();
      } catch {
        say("Pošiljanje ni uspelo. Preverite povezavo in poskusite znova.");
        busy(null);
        sending = false;
      }
    })();
  });
}
