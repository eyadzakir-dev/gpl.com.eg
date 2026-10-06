// Clearance line: scroll progress where CSS can't drive it (narrow screens, or browsers without scroll timelines)
// and the station rail (aria-current, click and arrow keys). On desktop Chrome the CSS view() timeline drives --p.

const root = document.documentElement;
const NARROW = matchMedia("(max-width: 899px)");
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");
const HAS_SCROLL_TIMELINE = CSS.supports("animation-timeline: view()");

const STATION_COUNT = 9;
// Narrow screens: station i owns t in [i - STATION_LEAD, i + 1 - STATION_LEAD).
const STATION_LEAD = 0.1;
// Where a station's drawing sequence is complete, before the track moves on (matches --a* in home.css).
const STATION_SETTLED = 0.74;
// The rail switches when the track is halfway to the next station (the track moves over t = i + 0.8 … i + 1).
const RAIL_SWITCH = 0.1;
const NARROW_READ_POINT = 0.7;
const NEAR_MARGIN = "50% 0px";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const hasMotion = () => root.classList.contains("motion");
const isPinned = () => hasMotion() && !NARROW.matches;

function railSteps() {
  const forward = root.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = root.dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  return { [forward]: 1, ArrowDown: 1, [back]: -1, ArrowUp: -1 };
}

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

export function initLine(line) {
  const links = [...line.querySelectorAll(".cl-rail a")];
  const stations = [...line.querySelectorAll(".cl-station")];
  const state = { layout: null, isQueued: false, current: -1, isNear: false };
  const usesScript = () => hasMotion() && (NARROW.matches || !HAS_SCROLL_TIMELINE);

  const getLayout = () => (state.layout ??= measureStations(line));

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

  function update() {
    state.isQueued = false;
    const progress = readProgress();
    const scripted = usesScript();
    line.classList.toggle("is-scripted", scripted);
    if (scripted) line.style.setProperty("--p", progress.toFixed(4));
    else line.style.removeProperty("--p");
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
    const steps = railSteps();
    const last = links.length - 1;
    let target = -1;
    if (event.key in steps) target = clamp(index + steps[event.key], 0, last);
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

  // Scroll work only runs while the line is near the viewport.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting === state.isNear) return;
    state.isNear = entry.isIntersecting;
    if (state.isNear) {
      addEventListener("scroll", requestUpdate, { passive: true });
      remeasure();
    } else {
      removeEventListener("scroll", requestUpdate);
    }
  }, { rootMargin: NEAR_MARGIN }).observe(line);

  addEventListener("resize", remeasure);
  new ResizeObserver(remeasure).observe(line);
  document.fonts?.ready.then(remeasure);
  NARROW.addEventListener("change", remeasure);
  REDUCED_MOTION.addEventListener("change", () => {
    root.classList.toggle("motion", !REDUCED_MOTION.matches);
    remeasure();
  });
  update();
}
