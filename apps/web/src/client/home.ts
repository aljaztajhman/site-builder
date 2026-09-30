/**
 * Landing page, progressive only: the page reads fine without it. Scales the desktop example to its
 * column, plays each section's drawing once in view, types the example description into the prompt,
 * and hands what the visitor typed to the intake form (dashboard.ts) across the login.
 */
import { INTAKE_DRAFT_KEY, type IntakeDraft } from "./intake-draft.ts";

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

// Play each section's vignette once, when it comes into view.
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
for (const s of document.querySelectorAll("#kaj, #kako")) io.observe(s);

const form = document.querySelector<HTMLFormElement>("form[data-home-intake]");
const ta = form?.querySelector("textarea");
if (form && ta) {
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

  // The form goes to /new with nothing in the URL; the text travels in this tab's sessionStorage.
  form.addEventListener("submit", (e) => {
    const attach = (e.submitter as HTMLElement | null)?.dataset.attach;
    const draft: IntakeDraft = { description: ta.value.trim(), attach: attach === "photos" || attach === "logo" ? attach : undefined };
    try {
      sessionStorage.setItem(INTAKE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage blocked: the intake form simply starts empty.
    }
  });
}
