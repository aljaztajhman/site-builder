/**
 * Landing page, progressive only: the page reads fine without it. Scales the desktop example to its
 * column, plays each section's drawing once in view, types the example description into the prompt,
 * and runs the prompt box, which is the intake: signed out it keeps what was typed across the login,
 * signed in it restores that text, counts attached files and blocks a second submit while photos upload.
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
 * view. Without JavaScript, or with reduced motion, the phone view stays (no data-step).
 */
const demo = document.querySelector<HTMLElement>("[data-demo]");
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
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let timers: number[] = [];
    const at = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
    const scrollSite = (top: number) => {
      try {
        frame.contentWindow?.scrollTo({ top, behavior: "smooth" });
      } catch {
        // Not loaded yet: the demo goes on without the scroll.
      }
    };
    const play = () => {
      timers.forEach(clearTimeout);
      timers = [];
      demo.dataset.step = "type";
      text.textContent = "";
      scrollSite(0);
      const typing = Math.round(full.length / 3) * 40;
      for (let i = 3; i <= full.length + 2; i += 3) at((i / 3) * 40, () => (text.textContent = full.slice(0, i)));
      at(typing + 500, () => (demo.dataset.step = "build"));
      at(typing + 3100, () => (demo.dataset.step = "phone"));
      at(typing + 5600, () => scrollSite(320));
      at(typing + 8000, () => {
        scrollSite(0);
        demo.dataset.step = "desk";
      });
      at(typing + 14500, play);
    };
    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    // Only while the hero is on screen.
    new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) play();
        else stop();
      }
    }, { threshold: 0.3 }).observe(demo);
  }
}

const form = document.querySelector<HTMLFormElement>("form[data-home-intake]");
const ta = form?.querySelector("textarea");
const signedIn = !!form?.hasAttribute("data-intake");
// Back from the login with what was typed before it: fill it in and open the control that was asked for.
const draft = form && ta && signedIn ? takeIntakeDraft() : null;
if (form && ta && draft) {
  if (draft.description && !ta.value) ta.value = draft.description;
  if (draft.scope) form.querySelector<HTMLInputElement>(`input[name=scope][value=${draft.scope}]`)?.click();
  const target = draft.attach && form.querySelector<HTMLInputElement>(`input[type=file][name=${draft.attach}]`);
  ta.scrollIntoView({ block: "center" });
  (target || ta).focus();
}
if (form && ta && !draft && !ta.value) {
  // Type the example description into the placeholder; stops as soon as the field is used.
  const full = ta.placeholder;
  let i = 0;
  let stop = false;
  ta.addEventListener(
    "focus",
    () => {
      stop = true;
      ta.placeholder = full;
    },
    { once: true },
  );
  if (matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    ta.placeholder = "";
    const tick = () => {
      if (stop) return;
      ta.placeholder = full.slice(0, ++i);
      if (i < full.length) setTimeout(tick, full[i - 1] === "." ? 260 : 28);
    };
    tick();
  }

}

if (form && ta && !signedIn) {
  // Signed out the form goes to the login with nothing but next=/ in the URL; the text travels in this tab's sessionStorage.
  form.addEventListener("submit", (e) => {
    const attach = (e.submitter as HTMLElement | null)?.dataset.attach;
    const scope = form.querySelector<HTMLInputElement>("input[name=scope]:checked")?.value;
    const saved: IntakeDraft = {
      description: ta.value.trim(),
      attach: attach === "photos" || attach === "logo" ? attach : undefined,
      scope: scope === "full" ? "full" : "home",
    };
    try {
      sessionStorage.setItem(INTAKE_DRAFT_KEY, JSON.stringify(saved));
    } catch {
      // Storage blocked: the prompt simply starts empty after the login.
    }
  });
}

if (form && signedIn) {
  for (const input of form.querySelectorAll<HTMLInputElement>(".attach input[type=file]")) {
    input.addEventListener("change", () => {
      const label = input.closest("label")!;
      const n = input.files?.length ?? 0;
      if (n) label.dataset.count = String(n);
      else delete label.dataset.count;
    });
  }
  form.addEventListener("submit", () => {
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (!button) return;
    // Disabled after the submit event has been handled, so the button's value still counts.
    window.setTimeout(() => {
      button.disabled = true;
      button.textContent = "Nalagam …";
    });
  });
}
