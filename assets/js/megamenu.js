// Services mega menu (desktop, hover screens). site.js imports this after megamenu.css has loaded.
// Hover opens after a short intent delay and closes after a grace period; the chevron toggle opens it for keyboard and
// touch ("pinned": only Escape, an outside click, focus leaving or the toggle close it).

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 250;
// Opening another nav item closes the menu once the pointer rests there this long.
const SIBLING_DWELL_MS = 120;
// A toggle click this soon after a hover open keeps the menu open instead of closing it.
const HOVER_CLICK_GRACE_MS = 500;
// Matches the close transition in megamenu.css.
const HIDE_AFTER_MS = 200;
const DEFAULT_KEY = "gpl";
const STAGGER_ITEMS = ".mm__glabel, .mm__item, .mm__note";

const hasMotion = () => document.documentElement.classList.contains("motion");
const isTouch = (event) => event.pointerType === "touch";

function setStagger(panel) {
  const number = (els, start) => els.forEach((el, n) => el.style.setProperty("--i", start + n));
  number([...panel.querySelectorAll(".mm__intro > *")], 0);
  const groups = [...panel.querySelectorAll(".mm__group")];
  const half = Math.ceil(groups.length / 2);
  [groups.slice(0, half), groups.slice(half)].forEach((column) => {
    number(column.flatMap((group) => [...group.querySelectorAll(STAGGER_ITEMS)]), 1);
  });
  number([...panel.querySelectorAll(".mm__side > *")], 2);
  number([...panel.querySelectorAll(".mm__row")], 6);
}

function createScrim() {
  const scrim = document.createElement("div");
  scrim.className = "mm-scrim";
  scrim.setAttribute("aria-hidden", "true");
  scrim.hidden = true;
  document.body.append(scrim);
  return scrim;
}

function createPreview(panel) {
  const arts = [...panel.querySelectorAll("[data-mm-art]")];
  const block = panel.querySelector(".mm__tb");
  const slots = ["fig", "name", "detail"].map((name) => block.querySelector(`[data-mm-${name}]`));
  const defaults = slots.map((slot) => slot.innerHTML);
  let current = DEFAULT_KEY;

  function show(key, texts) {
    if (key === current) return;
    current = key;
    arts.forEach((art) => art.classList.toggle("is-on", art.dataset.mmArt === key));
    slots.forEach((slot, n) => {
      if (texts) slot.textContent = texts[n];
      else slot.innerHTML = defaults[n];
    });
    block.classList.remove("is-swap");
    void block.offsetWidth;
    block.classList.add("is-swap");
  }

  return {
    showLink(link) {
      const key = link.dataset.mmKey;
      if (key === DEFAULT_KEY) return show(DEFAULT_KEY);
      const nameEl = link.querySelector(".mm__name");
      const name = nameEl.textContent.replace(nameEl.querySelector(".mm__go")?.textContent ?? "", "").trim();
      show(key, [link.dataset.mmFig, name, link.dataset.mmDetail]);
    },
    reset: () => show(DEFAULT_KEY),
    loadImages() {
      panel.querySelectorAll("img[data-src]").forEach((img) => {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
      });
    },
  };
}

export function initMegamenu(item) {
  const toggle = item.querySelector(".hdr__mm-btn");
  const panel = item.querySelector(".mm");
  const nav = item.closest("nav");
  const siblings = [...nav.children].filter((el) => el !== item);
  const scrim = createScrim();
  const preview = createPreview(panel);
  const state = { isOpen: false, mode: null, openedAt: 0, openTimer: 0, closeTimer: 0, hideTimer: 0 };
  setStagger(panel);

  function clearTimers() {
    clearTimeout(state.openTimer);
    clearTimeout(state.closeTimer);
  }

  function hide() {
    panel.hidden = true;
    scrim.hidden = true;
    preview.reset();
  }

  function open(mode) {
    clearTimers();
    if (state.isOpen) {
      if (mode === "pinned") state.mode = "pinned";
      return;
    }
    clearTimeout(state.hideTimer);
    preview.loadImages();
    Object.assign(state, { isOpen: true, mode, openedAt: performance.now() });
    panel.hidden = false;
    scrim.hidden = false;
    void panel.offsetWidth;
    [item, panel, scrim].forEach((el) => el.classList.add("is-open"));
    toggle.setAttribute("aria-expanded", "true");
  }

  // focusToggle: true or false forces it; by default focus returns to the toggle only if it was inside the panel,
  // so it never stays on a link that is about to be hidden.
  function close({ focusToggle, animate = true } = {}) {
    clearTimers();
    if (!state.isOpen) return;
    const shouldFocus = focusToggle ?? panel.contains(document.activeElement);
    Object.assign(state, { isOpen: false, mode: null });
    [item, panel, scrim].forEach((el) => el.classList.remove("is-open"));
    toggle.setAttribute("aria-expanded", "false");
    if (shouldFocus) toggle.focus({ preventScroll: true });
    if (animate && hasMotion()) state.hideTimer = setTimeout(hide, HIDE_AFTER_MS);
    else hide();
  }

  function scheduleClose(delay) {
    clearTimeout(state.closeTimer);
    state.closeTimer = setTimeout(() => close(), delay);
  }

  function handleToggleClick() {
    const isFreshHover = state.mode === "hover" && performance.now() - state.openedAt < HOVER_CLICK_GRACE_MS;
    if (!state.isOpen || isFreshHover) open("pinned");
    else close({ focusToggle: true });
  }

  function handlePointerEnter(event) {
    if (isTouch(event)) return;
    clearTimeout(state.closeTimer);
    if (state.isOpen) return;
    clearTimeout(state.openTimer);
    state.openTimer = setTimeout(() => open("hover"), OPEN_DELAY_MS);
  }

  function handlePointerLeave(event) {
    if (isTouch(event)) return;
    clearTimeout(state.openTimer);
    if (state.isOpen && state.mode === "hover") scheduleClose(CLOSE_DELAY_MS);
  }

  function handleFocusIn(event) {
    if (!state.isOpen || !panel.contains(event.target)) return;
    clearTimers();
    // Keyboard focus inside the panel keeps it open even if the pointer wanders off.
    if (event.target.matches(":focus-visible")) state.mode = "pinned";
  }

  function handleFocusOut(event) {
    const next = event.relatedTarget;
    if (state.isOpen && next && !item.contains(next)) close();
  }

  function handlePreview(event) {
    const link = event.target.closest?.("[data-mm-key]");
    if (link && panel.contains(link)) preview.showLink(link);
  }

  toggle.addEventListener("click", handleToggleClick);
  item.addEventListener("pointerenter", handlePointerEnter);
  item.addEventListener("pointerleave", handlePointerLeave);
  item.addEventListener("focusin", handleFocusIn);
  item.addEventListener("focusout", handleFocusOut);
  panel.addEventListener("pointerover", handlePreview);
  panel.addEventListener("focusin", handlePreview);
  // A same-page link (an industry or #qiz anchor) should reveal its target, so close without moving focus.
  panel.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) close({ focusToggle: false, animate: false });
  });
  siblings.forEach((sibling) => sibling.addEventListener("pointerenter", (event) => {
    if (state.isOpen && !isTouch(event)) scheduleClose(SIBLING_DWELL_MS);
  }));
  document.addEventListener("pointerdown", (event) => {
    if (state.isOpen && !item.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.isOpen) return;
    close({ focusToggle: item.contains(document.activeElement) });
  });
  matchMedia("(min-width: 1181px)").addEventListener("change", (event) => {
    if (!event.matches) close({ animate: false });
  });
  // The pointer may already rest on the item when the module arrives.
  if (item.matches(":hover")) state.openTimer = setTimeout(() => open("hover"), OPEN_DELAY_MS);

  return { open, close };
}
