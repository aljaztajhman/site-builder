/**
 * Landing page, progressive only: the page reads fine without it. Scales the desktop example to its
 * column, plays each section's drawing once in view, types the example description into the prompt,
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
// Back from the login with what was typed before it: fill it in and open the control that was asked for.
const draft = form && ta ? takeIntakeDraft() : null;
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
  const busy = (label: string | null) => {
    if (!button) return;
    button.disabled = label !== null;
    button.textContent = label ?? "Ustvari";
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
