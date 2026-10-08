/**
 * Text that shuffles into its words, left to right: every character not yet "decoded" shows a random
 * letter from the same text. Works on the real, live text nodes (layout is that of the final text, so
 * nothing reflows), and always puts the exact text back. Returns the undo.
 */
export function decode(el: HTMLElement, start: number, dur: number): () => void {
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: { n: Text; text: string }[] = [];
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    nodes.push({ n, text: n.nodeValue ?? "" });
  }
  const pool = nodes.map((x) => x.text).join("").replace(/\s/g, "") || "abc";
  const total = nodes.reduce((s, x) => s + x.text.length, 0);
  let raf = 0;
  let t0 = 0;
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / dur);
    let i = 0;
    for (const x of nodes) {
      let s = "";
      for (const ch of x.text) {
        s += /\s/.test(ch) || i / total < p ? ch : pool[Math.floor(Math.random() * pool.length)];
        i++;
      }
      x.n.nodeValue = s;
    }
    if (p < 1) raf = win.requestAnimationFrame(frame);
  };
  const timer = win.setTimeout(() => (raf = win.requestAnimationFrame(frame)), start);
  return () => {
    win.clearTimeout(timer);
    win.cancelAnimationFrame(raf);
    for (const x of nodes) x.n.nodeValue = x.text;
  };
}
