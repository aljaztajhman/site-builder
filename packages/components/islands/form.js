// Contact form: submits in place and announces the result in the form's live region.
// Without this script the form still posts normally and the server answers with a thank-you page.
// Contract: <form data-contact-form data-msg-*> ... <p data-form-status role="status"> ... </form>
// In the dashboard preview (/preview/<site id>/…) and in an offline export (file://) nothing is sent.
// The preview test is anchored to the path start: a published site with the slug "preview" lives at /s/preview/….
(() => {
  const forms = /** @type {NodeListOf<HTMLFormElement>} */ (document.querySelectorAll("form[data-contact-form]"));
  forms.forEach((form) => {
    const status = form.querySelector("[data-form-status]");
    const button = /** @type {HTMLButtonElement | null} */ (form.querySelector("button[type=submit]"));
    /**
     * @param {string} key
     * @param {string} [kind]
     */
    const say = (key, kind) => {
      if (!status) return;
      status.textContent = form.getAttribute("data-msg-" + key) || "";
      status.setAttribute("data-kind", kind || "");
    };
    form.addEventListener("submit", async (e) => {
      if (location.protocol === "file:") {
        e.preventDefault();
        return say("offline", "info");
      }
      if (/^\/preview\//.test(location.pathname)) {
        e.preventDefault();
        return say("preview", "info");
      }
      if (!window.fetch || !window.FormData) return; // plain post
      e.preventDefault();
      if (button) button.disabled = true;
      say("sending", "info");
      try {
        const res = await fetch(form.action, {
          method: "POST",
          // A contact form has text fields only; TypeScript's DOM types don't take FormData here.
          body: new URLSearchParams(/** @type {any} */ (new FormData(form))),
          headers: { accept: "application/json" },
          credentials: "omit",
        });
        if (res.ok) {
          form.reset();
          say("sent", "ok");
        } else {
          say(res.status === 429 ? "too-many" : "error", "error");
        }
      } catch {
        say("error", "error");
      } finally {
        if (button) button.disabled = false;
      }
    });
  });
})();
