/**
 * The landing page's trade demo (docs/plans/landing-trade-demo.md): the first time it is on screen, the
 * first trade's description is typed and its page builds itself in the device; then the demo moves on
 * through the trades by itself, each site turning into the next piece by piece. Tabs pick a trade, the
 * view switch shows the phone or the computer, the pause button stops the moving on (WCAG 2.2.2).
 * With reduced motion it all still plays, in fades: nothing slides, scales or scrolls (owner, PR #51).
 * Without JavaScript the tabs are links (/?primer=<id>) and the device shows that trade's site.
 */
import { prepareBuild, runBuild, type Build } from "./demo-build.ts";
import { DEMO } from "./demo-timing.ts";
import { transformSite, within } from "./demo-transform.ts";

interface Trade {
  id: string;
  label: string;
  page: string;
  title: string;
  caption: string;
  intro: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';

export function startDemo(): void {
  const json = document.getElementById("trades-data")?.textContent;
  const devwrap = document.querySelector<HTMLElement>(".devwrap");
  if (!json || !devwrap) return;
  const trades = JSON.parse(json) as Trade[];
  const tabsEl = devwrap.querySelector<HTMLElement>(".tabs")!;
  const tabs = [...tabsEl.querySelectorAll<HTMLAnchorElement>(".tab")];
  const tools = devwrap.querySelector<HTMLElement>(".demo-tools")!;
  const pauseBtn = tools.querySelector<HTMLButtonElement>(".pause")!;
  const viewButtons = [...tools.querySelectorAll<HTMLButtonElement>(".views button")];
  const devbox = devwrap.querySelector<HTMLElement>(".devbox")!;
  const dev = devbox.querySelector<HTMLElement>(".dev")!;
  const main = dev.querySelector<HTMLIFrameElement>("iframe.main")!;
  const stage = dev.querySelector<HTMLIFrameElement>("iframe.stage")!;
  const cap = devwrap.querySelector<HTMLElement>(".cap")!;
  const status = devwrap.querySelector<HTMLElement>("[data-demo-status]")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const byId = (id: string | undefined) => trades.find((t) => t.id === id);
  tools.hidden = false;
  tabsEl.style.setProperty("--dwell", `${DEMO.dwell}ms`);

  // ---------- device ----------
  let mode: "phone" | "desk" = "desk";
  const size = () => {
    const col = devwrap.clientWidth;
    const phone = mode === "phone";
    const w = phone ? Math.min(DEMO.phone.width, col - 24) : col;
    const iw = phone ? DEMO.phone.site : DEMO.desk.site;
    const ch = phone ? 0 : DEMO.desk.chrome;
    const h = phone ? Math.round(w * DEMO.phone.ratio) : Math.round(w * DEMO.desk.ratio) + DEMO.desk.chrome;
    dev.dataset.mode = mode;
    for (const [k, v] of Object.entries({ "--w": `${w}px`, "--h": `${h}px`, "--ch": `${ch}px`, "--iw": `${iw}px`, "--s": String(w / iw) })) dev.style.setProperty(k, v);
  };
  size();
  addEventListener("resize", size);
  for (const b of viewButtons)
    b.addEventListener("click", () => {
      const m = b.dataset.mode === "phone" ? "phone" : "desk";
      if (mode === m) return;
      mode = m;
      for (const x of viewButtons) x.setAttribute("aria-checked", String(x === b));
      dev.classList.add("resize");
      size();
      setTimeout(() => dev.classList.remove("resize"), DEMO.resize + 100);
      setTimeout(() => placeCard(), DEMO.resize + 50);
    });

  // ---------- tabs and the moving on ----------
  /** The site in the frame is loaded (it may be before this script runs). */
  const mainReady = new Promise<void>((resolve) => {
    const doc = main.contentDocument;
    if (doc && doc.readyState === "complete" && doc.URL !== "about:blank") resolve();
    else main.addEventListener("load", () => resolve(), { once: true });
  });
  let current: Trade | null = null;
  let busy = false;
  let queued: Trade | null = null;
  let running: { skipTransition(): void } | null = null;

  const mark = (t: Trade) => {
    for (const b of tabs) {
      const on = b.dataset.id === t.id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      // Narrow screens: the list scrolls inside itself, with the shown tab kept in view (never the page).
      if (on && tabsEl.scrollWidth > tabsEl.clientWidth) {
        const l = b.offsetLeft - tabsEl.offsetLeft;
        if (l < tabsEl.scrollLeft || l + b.offsetWidth > tabsEl.scrollLeft + tabsEl.clientWidth)
          tabsEl.scrollTo({ left: l - (tabsEl.clientWidth - b.offsetWidth) / 2, behavior: reduced.matches ? "auto" : "smooth" });
      }
    }
    cap.textContent = t.caption;
    main.title = t.title;
  };

  async function switchTo(t: Trade): Promise<void> {
    if (busy) {
      queued = t;
      running?.skipTransition();
      return;
    }
    if (t === current) return startClock();
    busy = true;
    current = t;
    mark(t);
    stopClock();
    try {
      await mainReady;
      await transformSite(main, stage, t.page, { calm: reduced.matches, onTransition: (vt) => (running = vt) });
    } finally {
      busy = false;
    }
    if (queued) {
      const q = queued;
      queued = null;
      return switchTo(q);
    }
    startClock();
  }

  // The next trade after a while; the shown tab's underline fills up meanwhile. Only while on screen, in a
  // visible tab, not paused and not switching.
  let paused = false;
  let onScreen = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopClock = () => {
    clearTimeout(timer);
    tabsEl.classList.remove("auto");
  };
  const startClock = () => {
    stopClock();
    if (paused || !onScreen || document.hidden || busy || devbox.dataset.step !== "site" || !current) return;
    void tabsEl.offsetWidth; // restarts the fill
    tabsEl.classList.add("auto");
    const next = trades[(trades.indexOf(current) + 1) % trades.length]!;
    timer = setTimeout(() => void switchTo(next), DEMO.dwell);
  };
  const setPauseIcon = () => {
    const label = paused ? "Predvajaj" : "Ustavi";
    pauseBtn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    pauseBtn.setAttribute("aria-label", label);
    pauseBtn.title = label;
  };
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.setAttribute("aria-pressed", String(paused));
    setPauseIcon();
    if (paused) stopClock();
    else startClock();
  });

  // ---------- the intro ----------
  // The first trade's description is typed; on "Ustvari" its page builds itself in the device while the
  // steps tick. The page being built is the real page in the frame, only held back by a stylesheet.
  const ask = devbox.querySelector<HTMLElement>(".ask");
  const intro = devbox.dataset.intro !== undefined && ask ? ask : null;
  const askType = devbox.querySelector<HTMLElement>(".ask-type");
  const askList = devbox.querySelector<HTMLElement>(".ask-steps");
  const typedEl = devbox.querySelector<HTMLElement>(".ask-text .typed");
  const restEl = devbox.querySelector<HTMLElement>(".ask-text .rest");
  const goEl = devbox.querySelector<HTMLElement>(".ask-go");
  const askSteps = askList ? ([...askList.children] as HTMLElement[]) : [];
  const first = trades[0]!;
  const prompt = first.intro;

  let resizing = false;
  /** The card: over the device while typing, then the steps under it. */
  const placeCard = () => {
    if (!intro || !askType || !askList) return;
    const W = devbox.clientWidth;
    const H = devbox.clientHeight;
    const sw = Math.min(DEMO.phone.width, W);
    // The caption's place is the steps' place while building: kept at least that tall, so they cover nothing.
    cap.style.minHeight = `${askList.offsetHeight}px`;
    intro.style.setProperty("--tw", `${W}px`);
    intro.style.setProperty("--sw", `${sw}px`);
    const r =
      devbox.dataset.step === "type"
        ? { x: 0, y: Math.max(0, (H - askType.offsetHeight) / 2), w: W, h: askType.offsetHeight }
        : // Under the device, where the caption will be: the page being built stays in full view.
          { x: dev.offsetLeft + (dev.offsetWidth - sw) / 2, y: dev.offsetTop + dev.offsetHeight + 12, w: sw, h: askList.offsetHeight };
    // The first placing (and a window resize) jumps straight there; only the change of step moves.
    const jump = !intro.classList.contains("placed") || resizing;
    if (jump) intro.style.transition = "none";
    for (const [k, v] of Object.entries({ "--ax": r.x, "--ay": r.y, "--aw": r.w, "--ah": r.h })) intro.style.setProperty(k, `${v}px`);
    if (jump) {
      void intro.offsetWidth;
      intro.style.removeProperty("transition");
      intro.classList.add("placed");
    }
  };
  addEventListener("resize", () => {
    resizing = true;
    placeCard();
    resizing = false;
  });

  let introStarted = false;
  let introDone = !intro;
  let build: Build | null = null;
  const introTimers: ReturnType<typeof setTimeout>[] = [];
  const showSteps = (i: number) =>
    askSteps.forEach((li, j) => {
      li.classList.toggle("done", j < i);
      li.classList.toggle("now", j === i);
    });
  const finishIntro = () => {
    if (introDone) return;
    introDone = true;
    introTimers.forEach(clearTimeout);
    build?.finish();
    intro?.classList.remove("swap");
    if (typedEl) typedEl.textContent = prompt;
    if (restEl) restEl.textContent = "";
    showSteps(askSteps.length);
    devbox.dataset.step = "site";
    current = first;
    mark(first);
  };
  const playIntro = async () => {
    introStarted = true;
    // The card's text is laid out in full from the start (the untyped rest is transparent), in its final font.
    await within(document.fonts.ready, 1500);
    if (introDone || !typedEl || !restEl || !goEl) return;
    typedEl.textContent = "";
    restEl.textContent = prompt;
    devbox.dataset.step = "type";
    placeCard();
    const at = (ms: number, run: () => void) => introTimers.push(setTimeout(run, ms));
    const { chars, everyMs, pressAt, buildAt } = DEMO.typing;
    for (let i = chars; i <= prompt.length + chars - 1; i += chars)
      at((i / chars) * everyMs, () => {
        typedEl.textContent = prompt.slice(0, i);
        restEl.textContent = prompt.slice(i);
      });
    const typed = Math.round(prompt.length / chars) * everyMs;
    // Meanwhile the page waits in the hidden device, taken apart.
    const calm = reduced.matches;
    void mainReady.then(() => {
      if (!introDone && !build && main.contentDocument) build = prepareBuild(main.contentDocument, { calm });
    });
    at(typed + pressAt, () => goEl.classList.add("pressed"));
    at(typed + buildAt, () => {
      goEl.classList.remove("pressed");
      void (async () => {
        await within(mainReady, 3000);
        if (introDone || !main.contentDocument) return;
        build ??= prepareBuild(main.contentDocument, { calm });
        // Reduced motion: the card doesn't travel under the device; it fades out there and back in here.
        if (calm) {
          intro?.classList.add("swap");
          await sleep(DEMO.calm.card);
          if (introDone) return;
        }
        devbox.dataset.step = "build";
        placeCard();
        intro?.classList.remove("swap");
        mark(first);
        current = first;
        await sleep(DEMO.buildStart);
        if (introDone) return;
        await runBuild(build, showSteps);
        if (introDone) return;
        showSteps(askSteps.length);
        await sleep(DEMO.buildEnd);
        finishIntro();
        startClock();
      })();
    });
  };

  // The intro plays for everyone; with reduced motion it fades instead of moving (home.css, demo-build.ts).
  if (intro && restEl) {
    // Placed (and its caption filled) before anything shows, so nothing moves when the intro starts.
    devbox.dataset.step = "type";
    restEl.textContent = prompt;
    placeCard();
  } else {
    // A trade chosen in the address (/?primer=): the site at once, no intro.
    introDone = true;
    devbox.dataset.step = "site";
    const chosen = byId(tabs.find((b) => b.getAttribute("aria-selected") === "true")?.dataset.id) ?? first;
    current = chosen;
    mark(chosen);
  }

  new IntersectionObserver(
    (entries) => {
      for (const e of entries) onScreen = e.isIntersecting;
      if (onScreen && !introStarted && !introDone) void playIntro();
      if (onScreen) startClock();
      else stopClock();
    },
    { threshold: DEMO.onScreen },
  ).observe(devbox);
  document.addEventListener("visibilitychange", () => (document.hidden ? stopClock() : startClock()));

  // A click (or the arrow keys) shows that trade; the demo then moves on from there. Only these switches
  // are announced: an automatic one every few seconds would talk over the page.
  const choose = (t: Trade) => {
    finishIntro();
    // Selected at once, even while a switch runs (it then follows): focus and the roving tabindex agree.
    mark(t);
    status.textContent = t.caption;
    void switchTo(t);
  };
  for (const b of tabs) {
    const t = byId(b.dataset.id);
    if (!t) continue;
    b.addEventListener("click", (e) => {
      // A new tab or window keeps the link's own behaviour.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      choose(t);
    });
    b.addEventListener("pointerenter", () => void fetch(t.page).catch(() => undefined), { once: true });
  }
  tabsEl.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    const j = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[e.key];
    if (j === undefined) return;
    e.preventDefault();
    const k = (j + tabs.length) % tabs.length;
    tabs[k]!.focus();
    choose(byId(tabs[k]!.dataset.id)!);
  });
}
