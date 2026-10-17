// Gallery island: opens gallery photos in a native modal <dialog>. Progressive enhancement:
// without JS (or without <dialog> support) every photo is a plain link to its large version.
// Labels come from data attributes rendered by the Gallery component (no strings in this file).
(function () {
  "use strict";
  if (typeof HTMLDialogElement !== "function" || !("showModal" in HTMLDialogElement.prototype)) return;

  /**
   * @param {string} tag
   * @param {string} className
   * @param {Record<string, string>} [attrs]
   * @returns {HTMLElement}
   */
  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k] || "");
    return node;
  }

  /**
   * @param {string} label
   * @param {string} extraClass
   * @param {string} attr
   */
  function button(label, extraClass, attr) {
    var b = el("button", "btn btn--secondary" + (extraClass ? " " + extraClass : ""), { type: "button" });
    b.setAttribute(attr, "");
    b.textContent = label;
    return b;
  }

  /** @param {HTMLElement} list */
  function setup(list) {
    /** @type {HTMLAnchorElement[]} */
    var links = Array.prototype.slice.call(list.querySelectorAll("a[data-gallery-item]"));
    if (!links.length) return;
    /** @type {HTMLDialogElement | null} */
    var dialog = null;
    /** @type {HTMLImageElement | null} */
    var img = null;
    /** @type {HTMLElement | null} */
    var caption = null;
    /** @type {HTMLElement | null} */
    var status = null;
    var current = 0;
    var previousOverflow = "";

    /** @returns {HTMLDialogElement} */
    function build() {
      var box = /** @type {HTMLDialogElement} */ (el("dialog", "lightbox tone-inverse", { "aria-label": list.getAttribute("data-label-dialog") || "" }));
      dialog = box;
      var top = el("div", "lightbox__top");
      var close = button(list.getAttribute("data-label-close") || "Close", "lightbox__close", "data-lightbox-close");
      top.appendChild(close);

      var figure = el("figure", "lightbox__figure");
      img = /** @type {HTMLImageElement} */ (el("img", "lightbox__img", { decoding: "async", alt: "" }));
      caption = el("figcaption", "lightbox__caption");
      figure.appendChild(img);
      figure.appendChild(caption);
      status = el("p", "visually-hidden", { "aria-live": "polite" });

      box.appendChild(top);
      box.appendChild(figure);
      if (links.length > 1) {
        var nav = el("div", "lightbox__nav");
        var prev = button(list.getAttribute("data-label-prev") || "Previous", "lightbox__prev", "data-lightbox-prev");
        var next = button(list.getAttribute("data-label-next") || "Next", "lightbox__next", "data-lightbox-next");
        prev.addEventListener("click", function () {
          show(current - 1, true);
        });
        next.addEventListener("click", function () {
          show(current + 1, true);
        });
        nav.appendChild(prev);
        nav.appendChild(next);
        box.appendChild(nav);
      }
      box.appendChild(status);

      close.addEventListener("click", function () {
        box.close();
      });
      // A click on the dialog's own box (outside the photo and buttons) closes it.
      box.addEventListener("click", function (e) {
        if (e.target === box) box.close();
      });
      box.addEventListener("keydown", function (e) {
        if (links.length < 2) return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          show(current - 1, true);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          show(current + 1, true);
        }
      });
      // Escape (native cancel) and every other close path end here: restore scroll and focus.
      box.addEventListener("close", function () {
        document.documentElement.style.overflow = previousOverflow;
        var link = links[current];
        if (link) link.focus();
      });
      document.body.appendChild(box);
      return box;
    }

    /**
     * @param {number} i
     * @param {boolean} announce
     */
    function show(i, announce) {
      current = (i + links.length) % links.length;
      var link = links[current];
      if (!link || !img || !caption || !status) return;
      var thumb = link.querySelector("img");
      var fig = link.closest("figure");
      var cap = fig ? fig.querySelector("figcaption") : null;
      var alt = thumb ? thumb.getAttribute("alt") || "" : "";
      img.src = link.getAttribute("href") || "";
      img.alt = alt;
      var w = thumb ? thumb.getAttribute("width") : null;
      var h = thumb ? thumb.getAttribute("height") : null;
      if (w && h) {
        img.setAttribute("width", w);
        img.setAttribute("height", h);
      }
      caption.textContent = cap ? cap.textContent : "";
      caption.hidden = !cap;
      if (announce) status.textContent = [alt, cap ? cap.textContent : ""].filter(Boolean).join(". ");
    }

    list.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var target = e.target;
      var link = target instanceof Element ? target.closest("a[data-gallery-item]") : null;
      var at = link instanceof HTMLAnchorElement ? links.indexOf(link) : -1;
      if (at < 0) return;
      e.preventDefault();
      var box = dialog || build();
      show(at, false);
      if (status) status.textContent = "";
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      box.showModal();
    });
  }

  function init() {
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-gallery]")).forEach(setup);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
