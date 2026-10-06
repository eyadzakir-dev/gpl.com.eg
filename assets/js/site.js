// Shared behaviour for every page: header clock, mobile menu, one-shot reveals, image lightbox, lazy route globe.

const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");
const DESKTOP_NAV = matchMedia("(min-width: 1181px)");
const CLOCK_TICK_MS = 15000;
const REVEAL_THRESHOLD = 0.3;
const GLOBE_PRELOAD_MARGIN = "150% 0px";
// .sweep is the GPL mark tile sweep; [data-reveal] lets a page arm its own is-armed/is-in animation.
const REVEAL_SELECTOR = ".routes, .steps, .sweep, .figs, [data-reveal]";

const IS_RTL = document.documentElement.dir === "rtl";
const LIGHTBOX_TEXT = document.documentElement.lang.startsWith("ar")
  ? { viewer: "عارض الصور", close: "إغلاق", prev: "الصورة السابقة", next: "الصورة التالية" }
  : { viewer: "Image viewer", close: "Close", prev: "Previous image", next: "Next image" };

const cairoTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function initHeaderClock() {
  const clock = document.querySelector("[data-cairo-clock]");
  if (!clock) return;
  const render = () => { clock.textContent = cairoTime.format(new Date()); };
  render();
  setInterval(render, CLOCK_TICK_MS);
}

function initMenu() {
  const menu = document.querySelector(".menu");
  if (!menu) return;
  const summary = menu.querySelector("summary");
  const close = () => { menu.open = false; };

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    close();
    summary.focus();
  });
  menu.querySelectorAll(".menu__panel a").forEach((link) => link.addEventListener("click", close));
  DESKTOP_NAV.addEventListener("change", (event) => { if (event.matches) close(); });
}

function initReveal(selector) {
  if (REDUCED_MOTION.matches) return;
  const targets = document.querySelectorAll(selector);
  if (!targets.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      observer.unobserve(entry.target);
    });
  }, { threshold: REVEAL_THRESHOLD });
  targets.forEach((el) => {
    el.classList.add("is-armed");
    observer.observe(el);
  });
}

/* ---------- Route globe: loaded as the route diagram approaches the viewport ---------- */

function initGlobes() {
  const figures = document.querySelectorAll("[data-globe]");
  if (!figures.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      import("./globe/globe.js")
        .then(({ initGlobe }) => initGlobe(entry.target))
        .catch((error) => console.warn("Route globe unavailable; keeping the flat diagram.", error));
    });
  }, { rootMargin: GLOBE_PRELOAD_MARGIN });
  figures.forEach((figure) => observer.observe(figure));
}

/* ---------- Lightbox: any [data-gallery] whose links point at full-size images ---------- */

function buildLightbox() {
  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.setAttribute("aria-label", LIGHTBOX_TEXT.viewer);
  dialog.innerHTML = `
    <div class="lightbox__in">
      <div class="lightbox__bar">
        <p class="mono" data-lb-count dir="ltr"></p>
        <button class="lightbox__btn mono" type="button" data-lb-close>${LIGHTBOX_TEXT.close} <span aria-hidden="true">×</span></button>
      </div>
      <button class="lightbox__btn lightbox__prev mono" type="button" data-lb-step="-1" aria-label="${LIGHTBOX_TEXT.prev}">←</button>
      <img class="lightbox__img" alt="">
      <button class="lightbox__btn lightbox__next mono" type="button" data-lb-step="1" aria-label="${LIGHTBOX_TEXT.next}">→</button>
      <p class="lightbox__cap mono" data-lb-caption></p>
    </div>`;
  document.body.append(dialog);
  return {
    dialog,
    img: dialog.querySelector(".lightbox__img"),
    count: dialog.querySelector("[data-lb-count]"),
    caption: dialog.querySelector("[data-lb-caption]"),
    steppers: dialog.querySelectorAll("[data-lb-step]"),
  };
}

function initLightbox() {
  const galleries = document.querySelectorAll("[data-gallery]");
  if (!galleries.length || typeof HTMLDialogElement !== "function") return;
  const ui = buildLightbox();
  const state = { items: [], index: 0, trigger: null };

  function show(index) {
    state.index = (index + state.items.length) % state.items.length;
    const link = state.items[state.index];
    const thumb = link.querySelector("img");
    ui.img.src = link.href;
    ui.img.alt = thumb?.alt ?? "";
    ui.caption.textContent = link.dataset.caption || thumb?.alt || "";
    ui.count.textContent = `${state.index + 1} / ${state.items.length}`;
  }

  function open(link) {
    const gallery = link.closest("[data-gallery]");
    state.items = [...gallery.querySelectorAll("a[href]")];
    state.trigger = link;
    ui.steppers.forEach((btn) => { btn.hidden = state.items.length < 2; });
    show(state.items.indexOf(link));
    ui.dialog.showModal();
  }

  galleries.forEach((gallery) => gallery.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    event.preventDefault();
    open(link);
  }));

  ui.dialog.addEventListener("click", (event) => {
    const step = event.target.closest("[data-lb-step]");
    if (step) return show(state.index + Number(step.dataset.lbStep));
    const isBackdrop = event.target === ui.dialog || event.target.classList.contains("lightbox__in");
    if (isBackdrop || event.target.closest("[data-lb-close]")) ui.dialog.close();
  });
  // In RTL the previous image sits on the right, so the arrow keys swap.
  const forward = IS_RTL ? "ArrowLeft" : "ArrowRight";
  const back = IS_RTL ? "ArrowRight" : "ArrowLeft";
  ui.dialog.addEventListener("keydown", (event) => {
    if (event.key === back) show(state.index - 1);
    if (event.key === forward) show(state.index + 1);
  });
  ui.dialog.addEventListener("close", () => state.trigger?.focus());
}

initHeaderClock();
initMenu();
initReveal(REVEAL_SELECTOR);
initLightbox();
initGlobes();
