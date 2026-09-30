/**
 * Intake page, progressive only: the form works without it. Shows how many files each attach
 * button holds and keeps the form from being sent twice while photos upload.
 */

for (const input of document.querySelectorAll<HTMLInputElement>(".attach input[type=file]")) {
  input.addEventListener("change", () => {
    const label = input.closest("label")!;
    const n = input.files?.length ?? 0;
    if (n) label.dataset.count = String(n);
    else delete label.dataset.count;
  });
}

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-intake]")) {
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
