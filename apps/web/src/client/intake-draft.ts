/** What the landing page's prompt hands to the intake form, in sessionStorage (same tab, survives the login). */
export const INTAKE_DRAFT_KEY = "sb-intake-draft";

export interface IntakeDraft {
  description: string;
  /** The visitor pressed "+ Fotografije" or "+ Logotip": focus that control on the intake form. */
  attach?: "photos" | "logo";
}

/** Reads and removes the draft; null when there is none or storage is unavailable. */
export function takeIntakeDraft(): IntakeDraft | null {
  try {
    const raw = sessionStorage.getItem(INTAKE_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(INTAKE_DRAFT_KEY);
    const v = JSON.parse(raw) as Partial<IntakeDraft>;
    return {
      description: typeof v.description === "string" ? v.description : "",
      attach: v.attach === "photos" || v.attach === "logo" ? v.attach : undefined,
    };
  } catch {
    return null;
  }
}
