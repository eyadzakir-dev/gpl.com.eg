// Home prototype 1 ("The Clearance Line"): line scroll progress, station rail (click + arrow keys),
// key-figure count-ups and the hero scroll fallback. Ported from the Three Stars home.js line code.

const root = document.documentElement;
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");
const NARROW = matchMedia("(max-width: 899px)");
const HAS_SCROLL_TIMELINE = CSS.supports("animation-timeline: view()");

const STATION_COUNT = 9;
// Narrow screens: station i owns t in [i - STATION_LEAD, i + 1 - STATION_LEAD).
const STATION_LEAD = 0.1;
// Where a station's drawing sequence is complete, before the track moves on (matches --a* in style.css).
const STATION_SETTLED = 0.74;
// The rail switches when the track is halfway to the next station (track moves over t = i + 0.8 … i + 1).
const RAIL_SWITCH = 0.1;
const NARROW_READ_POINT = 0.7;
const HERO_RANGE = 0.8;
const COUNT_MS = 1100;
const COUNT_THRESHOLD = 0.3;
const RAIL_STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const hasMotion = () => root.classList.contains("motion");
const isPinned = () => hasMotion() && !NARROW.matches;

function syncMotionClass() {
  root.classList.toggle("motion", !REDUCED_MOTION.matches);
}

/* ---------- Line progress ---------- */

function measureStations(line) {
  const stage = line.querySelector(".cl-stage");
  const stageBottom = parseFloat(getComputedStyle(stage).top) + stage.offsetHeight;
  const readOffset = (stageBottom + innerHeight) / 2;
  return {
    readOffset,
    tailInset: innerHeight - readOffset,
    spans: [...line.querySelectorAll(".cl-station")].map((el) => ({
      top: el.getBoundingClientRect().top + scrollY,
      height: el.offsetHeight,
    })),
  };
}

function getPiecewiseProgress(layout) {
  const readY = scrollY + layout.readOffset;
  const { spans } = layout;
  const index = spans.findLastIndex((span) => span.top <= readY);
  if (index < 0) return 0;
  const span = spans[index];
  const isLast = index === spans.length - 1;
  const height = Math.max(1, isLast ? span.height - layout.tailInset : span.height);
  const t = index - STATION_LEAD + (readY - span.top) / height;
  return clamp(t / STATION_COUNT, 0, 1);
}

function getLinearProgress(line) {
  const rect = line.getBoundingClientRect();
  const range = rect.height - innerHeight;
  return range > 0 ? clamp(-rect.top / range, 0, 1) : 0;
}

function createLine(line) {
  const hero = document.querySelector(".hero");
  const links = [...line.querySelectorAll(".cl-rail a")];
  const stations = [...line.querySelectorAll(".cl-station")];
  const state = { layout: null, isQueued: false, current: -1 };
  const usesScript = () => hasMotion() && (NARROW.matches || !HAS_SCROLL_TIMELINE);

  function getLayout() {
    state.layout ??= measureStations(line);
    return state.layout;
  }

  function readProgress() {
    if (!hasMotion()) return null;
    return NARROW.matches ? getPiecewiseProgress(getLayout()) : getLinearProgress(line);
  }

  function markCurrent(progress) {
    const index = progress === null ? -1 : clamp(Math.floor(progress * STATION_COUNT + RAIL_SWITCH), 0, STATION_COUNT - 1);
    if (index === state.current) return;
    state.current = index;
    links.forEach((link, i) => {
      if (i === index) link.setAttribute("aria-current", "step");
      else link.removeAttribute("aria-current");
    });
  }

  function syncHero() {
    if (!hero) return;
    if (hasMotion() && !HAS_SCROLL_TIMELINE) {
      hero.style.setProperty("--hp", clamp(scrollY / (innerHeight * HERO_RANGE), 0, 1).toFixed(4));
    } else {
      hero.style.removeProperty("--hp");
    }
  }

  function update() {
    state.isQueued = false;
    const progress = readProgress();
    const scripted = usesScript();
    line.classList.toggle("is-scripted", scripted);
    if (scripted) line.style.setProperty("--p", progress.toFixed(4));
    else line.style.removeProperty("--p");
    syncHero();
    markCurrent(progress);
  }

  function requestUpdate() {
    if (state.isQueued) return;
    state.isQueued = true;
    requestAnimationFrame(update);
  }

  function remeasure() {
    state.layout = null;
    requestUpdate();
  }

  function getStationScrollTop(index) {
    if (isPinned()) {
      const top = line.getBoundingClientRect().top + scrollY;
      const range = line.offsetHeight - innerHeight;
      return top + ((index + STATION_SETTLED) / STATION_COUNT) * range;
    }
    if (hasMotion()) {
      const span = getLayout().spans[index];
      return span.top + span.height * NARROW_READ_POINT - getLayout().readOffset;
    }
    return stations[index].getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(root).scrollPaddingTop || "0");
  }

  function goTo(index, { focusStation }) {
    const station = stations[index];
    if (!station) return;
    scrollTo({ top: getStationScrollTop(index), behavior: hasMotion() ? "smooth" : "auto" });
    history.replaceState(null, "", `#${station.id}`);
    if (focusStation) station.focus({ preventScroll: true });
  }

  function handleRailKey(event, index) {
    const last = links.length - 1;
    let target = -1;
    if (event.key in RAIL_STEP) target = clamp(index + RAIL_STEP[event.key], 0, last);
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = last;
    if (target < 0) return;
    event.preventDefault();
    links[target].focus();
    goTo(target, { focusStation: false });
  }

  stations.forEach((el) => el.setAttribute("tabindex", "-1"));
  links.forEach((link, i) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      goTo(i, { focusStation: true });
    });
    link.addEventListener("keydown", (event) => handleRailKey(event, i));
  });

  addEventListener("scroll", requestUpdate, { passive: true });
  addEventListener("resize", remeasure);
  new ResizeObserver(remeasure).observe(line);
  document.fonts?.ready.then(remeasure);
  NARROW.addEventListener("change", remeasure);
  REDUCED_MOTION.addEventListener("change", () => {
    syncMotionClass();
    remeasure();
  });
  update();
}

/* ---------- Key figures count up as the cells rise in ---------- */

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

function countUp(el) {
  const target = Number(el.dataset.countTo);
  const start = performance.now();
  const step = (now) => {
    const t = clamp((now - start) / COUNT_MS, 0, 1);
    el.textContent = String(Math.round(target * easeOutCubic(t)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initCountUps() {
  const box = document.querySelector(".cl-nums");
  if (!box || !hasMotion()) return;
  const counters = [...box.querySelectorAll("[data-count-to]")];
  counters.forEach((el) => { el.textContent = "0"; });
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    counters.forEach(countUp);
  }, { threshold: COUNT_THRESHOLD });
  observer.observe(box);
}

const line = document.querySelector(".cl");
if (line) createLine(line);
initCountUps();
