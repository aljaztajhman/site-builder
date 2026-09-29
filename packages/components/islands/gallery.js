// Gallery island: opens gallery photos in a native modal <dialog>. Progressive enhancement:
// without JS (or without <dialog> support) every photo is a plain link to its large version.
// Labels come from data attributes rendered by the Gallery component (no strings in this file).
(function () {
  "use strict";
  if (typeof HTMLDialogElement !== "function" || !("showModal" in HTMLDialogElement.prototype)) return;

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function button(label, extraClass, attr) {
    var b = el("button", "btn btn--secondary" + (extraClass ? " " + extraClass : ""), { type: "button" });
    b.setAttribute(attr, "");
    b.textContent = label;
    return b;
  }

  function setup(list) {
    var links = Array.prototype.slice.call(list.querySelectorAll("a[data-gallery-item]"));
    if (!links.length) return;
    var dialog = null;
    var img = null;
    var caption = null;
    var status = null;
    var current = 0;
    var previousOverflow = "";

    function build() {
      dialog = el("dialog", "lightbox tone-inverse", { "aria-label": list.getAttribute("data-label-dialog") || "" });
      var top = el("div", "lightbox__top");
      var close = button(list.getAttribute("data-label-close") || "Close", "lightbox__close", "data-lightbox-close");
      top.appendChild(close);

      var figure = el("figure", "lightbox__figure");
      img = el("img", "lightbox__img", { decoding: "async", alt: "" });
      caption = el("figcaption", "lightbox__caption");
      figure.appendChild(img);
      figure.appendChild(caption);
      status = el("p", "visually-hidden", { "aria-live": "polite" });

      dialog.appendChild(top);
      dialog.appendChild(figure);
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
        dialog.appendChild(nav);
      }
      dialog.appendChild(status);

      close.addEventListener("click", function () {
        dialog.close();
      });
      // A click on the dialog's own box (outside the photo and buttons) closes it.
      dialog.addEventListener("click", function (e) {
        if (e.target === dialog) dialog.close();
      });
      dialog.addEventListener("keydown", function (e) {
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
      dialog.addEventListener("close", function () {
        document.documentElement.style.overflow = previousOverflow;
        var link = links[current];
        if (link) link.focus();
      });
      document.body.appendChild(dialog);
    }

    function show(i, announce) {
      current = (i + links.length) % links.length;
      var link = links[current];
      var thumb = link.querySelector("img");
      var fig = link.closest("figure");
      var cap = fig ? fig.querySelector("figcaption") : null;
      var alt = thumb ? thumb.getAttribute("alt") || "" : "";
      img.src = link.getAttribute("href");
      img.alt = alt;
      if (thumb && thumb.getAttribute("width") && thumb.getAttribute("height")) {
        img.setAttribute("width", thumb.getAttribute("width"));
        img.setAttribute("height", thumb.getAttribute("height"));
      }
      caption.textContent = cap ? cap.textContent : "";
      caption.hidden = !cap;
      if (announce) status.textContent = [alt, cap ? cap.textContent : ""].filter(Boolean).join(". ");
    }

    list.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var target = e.target;
      var link = target && target.closest ? target.closest("a[data-gallery-item]") : null;
      if (!link || links.indexOf(link) < 0) return;
      e.preventDefault();
      if (!dialog) build();
      show(links.indexOf(link), false);
      status.textContent = "";
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      dialog.showModal();
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-gallery]"), setup);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
