/** Small DOM helpers the morph and its iframe flavour share. */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Whichever comes first: the promise, or `ms` passing. */
export const within = <T>(p: Promise<T>, ms: number): Promise<T | void> => Promise.race([p, sleep(ms)]);

/** Fonts and the images in view decoded (both time-capped), so the layout read from the document is final. */
export async function settle(doc: Document, caps: { waitFonts: number; waitImages: number }): Promise<void> {
  void doc.body.offsetHeight;
  await within(doc.fonts.ready, caps.waitFonts);
  const vh = doc.defaultView?.innerHeight ?? 0;
  const imgs = [...doc.images].filter((i) => {
    const r = i.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh;
  });
  await within(Promise.all(imgs.map((i) => i.decode().catch(() => undefined))), caps.waitImages);
}

/** Loads `src` into a frame and waits for it. */
export const loadInto = (frame: HTMLIFrameElement, src: string): Promise<void> =>
  new Promise((resolve) => {
    frame.addEventListener("load", () => resolve(), { once: true });
    frame.src = src;
  });

/**
 * Turns `doc` into the page `html` in place: <html> attributes copied, identical head nodes kept (shared
 * stylesheets stay loaded), the rest of the head replaced, the body replaced, inline and external scripts
 * re-created so they run (imported scripts don't). Waits (capped) for new stylesheets. Elements listed in
 * `keep` stay at the end of the head (the morph's own stylesheet).
 */
export async function swapDocument(doc: Document, html: string, opts: { waitStyles: number; keep?: readonly Element[] }): Promise<void> {
  const keep = new Set(opts.keep ?? []);
  const nd = new DOMParser().parseFromString(html, "text/html");
  const de = doc.documentElement;
  for (const a of [...de.attributes]) de.removeAttribute(a.name);
  for (const a of nd.documentElement.attributes) de.setAttribute(a.name, a.value);
  const want = new Set([...nd.head.children].map((n) => n.outerHTML));
  const have = new Set<string>();
  for (const n of [...doc.head.children]) {
    if (keep.has(n)) continue;
    if (want.has(n.outerHTML)) have.add(n.outerHTML);
    else n.remove();
  }
  const added: Element[] = [];
  for (const n of nd.head.children) if (!have.has(n.outerHTML)) added.push(doc.head.appendChild(doc.importNode(n, true)));
  for (const n of keep) doc.head.append(n);
  doc.body.replaceWith(doc.importNode(nd.body, true));
  // The new scripts (the body's, and the head's that weren't there before); kept head scripts already ran.
  const fresh = [...doc.body.querySelectorAll("script"), ...added.filter((n) => n.matches("script"))];
  for (const old of fresh.filter((s) => s.getAttribute("type") !== "application/ld+json")) {
    const s = doc.createElement("script");
    for (const a of old.attributes) s.setAttribute(a.name, a.value);
    s.textContent = old.textContent;
    old.replaceWith(s);
  }
  const sheets = added.filter((n): n is HTMLLinkElement => n.matches("link[rel=stylesheet]"));
  await within(Promise.all(sheets.map((n) => new Promise<void>((r) => ((n.onload = () => r()), (n.onerror = () => r()))))), opts.waitStyles);
}

/** True when the user asked for reduced motion. */
export const prefersCalm = (win: Window = window): boolean => win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
