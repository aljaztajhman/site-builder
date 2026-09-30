/**
 * Intake page, progressive only: the form works without it. Takes over what was typed on the landing
 * page, shows how many files each attach button holds and keeps the form from being sent twice while
 * photos upload.
 */
import { takeIntakeDraft } from "./intake-draft.ts";

const description = document.querySelector<HTMLTextAreaElement>("form[data-intake] textarea[name=description]");
const draft = description ? takeIntakeDraft() : null;
if (description && draft) {
  if (draft.description && !description.value) description.value = draft.description;
  const target = draft.attach && document.querySelector<HTMLInputElement>(`form[data-intake] input[type=file][name=${draft.attach}]`);
  (target || description).focus();
}

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
