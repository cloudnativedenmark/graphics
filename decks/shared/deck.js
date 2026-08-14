/* Cloud Native Denmark — deck runtime.
 *
 * Scales the fixed 1920×1080 stage to the viewport, moves between slides, and
 * gets out of the way for printing.
 *
 *   → ← space         next / previous
 *   Home End          first / last
 *   f                 fullscreen
 *   p                 print (same output as --print-to-pdf)
 *   #7 in the URL     jump to slide 7, and the hash tracks as you move
 *
 * No build step and no dependencies — a deck is one HTML file plus this.
 */

(() => {
  const deck = document.querySelector(".deck");
  const slides = [...document.querySelectorAll(".slide")];
  if (!deck || slides.length === 0) return;

  const progress = document.createElement("div");
  progress.className = "deck-progress";
  document.body.append(progress);

  /* ── chrome ─────────────────────────────────────────────────────────────
   * Lockup bottom-left, edition and page number bottom-right, on every slide
   * that does not opt out with data-chrome="none" — the cover and the closing
   * slides. This is injected rather than written into each slide because it was
   * hand-copied onto 17 of 48 slides before, and a footer you have to remember
   * is a footer that drifts.
   *
   * The footer carries the *mark*, not the wordmark. The lockup is a three-line
   * stacked block: at the 44px the footer allows, its strokes go sub-pixel and
   * it renders as grey mush. The mark is one glyph and stays legible — and the
   * footer text already spells the name, so the wordmark would only repeat it.
   * The cover still carries the full lockup at size.
   *
   * Red grounds get no mark. The mark is a red flag with a white cross, so on
   * red its field merges with the slide and all that survives is a floating
   * white plus — the same knockout gap already open with the designer. The
   * footer text carries the brand on those slides. */
  const LOGO_DIR = new URL("../../brand/logo/", document.currentScript.src);
  const footerMeta =
    document.body.dataset.footer ?? "Edition N° 04 · cloudnativedenmark.dk";

  slides.forEach((slide, i) => {
    if (slide.dataset.chrome === "none") return;
    slide.querySelector(".slide-footer")?.remove();

    const footer = document.createElement("footer");
    footer.className = "slide-footer";
    if (slide.dataset.ground !== "red") {
      footer.append(
        Object.assign(document.createElement("img"), {
          className: "slide-mark",
          alt: "Cloud Native Denmark",
          src: new URL("cnd-mark.svg", LOGO_DIR).href,
        }),
      );
    }
    footer.append(
      Object.assign(document.createElement("span"), {
        className: "slide-meta",
        textContent: footerMeta,
      }),
      Object.assign(document.createElement("span"), {
        className: "slide-page",
        textContent: String(i + 1).padStart(2, "0"),
      }),
    );
    slide.append(footer);
  });

  let index = 0;

  /* The stage is a fixed 1920×1080 so every measurement in the CSS is a real
   * pixel. Fitting is one transform on the slide, which keeps text crisp and
   * avoids reflow between screen sizes — a slide can never lay out differently
   * on the projector than it did here. */
  function fit() {
    const w = window.innerWidth / 1920;
    const h = window.innerHeight / 1080;
    deck.style.setProperty("--fit", String(Math.min(w, h)));
  }

  function show(next, { pushHash = true } = {}) {
    index = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach((s, i) =>
      i === index ? s.setAttribute("data-active", "") : s.removeAttribute("data-active"),
    );
    progress.style.width = `${((index + 1) / slides.length) * 100}%`;
    if (pushHash) history.replaceState(null, "", `#${index + 1}`);
    document.title = `${index + 1}/${slides.length} · ${
      document.body.dataset.deckTitle ?? "Cloud Native Denmark"
    }`;
  }

  const fromHash = () => {
    const n = parseInt(location.hash.slice(1), 10);
    return Number.isFinite(n) ? n - 1 : 0;
  };

  addEventListener("resize", fit);
  addEventListener("hashchange", () => show(fromHash(), { pushHash: false }));

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        e.preventDefault();
        show(index + 1);
        break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault();
        show(index - 1);
        break;
      case "Home":
        show(0);
        break;
      case "End":
        show(slides.length - 1);
        break;
      case "f":
        document.fullscreenElement
          ? document.exitFullscreen()
          : deck.requestFullscreen?.();
        break;
      case "p":
        print();
        break;
    }
  });

  /* Advance on click, but never when the click was a text selection or a link. */
  addEventListener("click", (e) => {
    if (e.target.closest("a") || getSelection()?.toString()) return;
    show(index + 1);
  });

  fit();
  show(fromHash(), { pushHash: false });
})();
