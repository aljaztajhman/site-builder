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
