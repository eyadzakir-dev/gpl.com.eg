// Free-days meter: a playhead runs from "at sea" through the free window while clearance steps fill in,
// the flap counter counts free days down, then the 2024 average release overshoots into demurrage.
import { createField, setField } from "./flap.js";

const FREE_DAYS = 5;
const START_DAY = -1.6;
const END_DAY = 4.6;
const RUN_MS = 4600;
const AVG_DELAY_MS = 350;
const THRESHOLD = 0.45;

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const pad2 = (n) => String(n).padStart(2, "0");

function getDaysLeft(day) {
  if (day < 0) return FREE_DAYS;
  return Math.max(0, FREE_DAYS - Math.floor(day));
}

function describeDay(day) {
  if (day < 0) return "At sea · clock not started";
  if (day >= END_DAY) return `Empty returned · day ${Math.ceil(day)} of ${FREE_DAYS}`;
  return `Day ${Math.floor(day) + 1} of ${FREE_DAYS} free days`;
}

function render(ui, day) {
  ui.chart.style.setProperty("--p", day.toFixed(3));
  const left = getDaysLeft(day);
  if (left !== ui.left) {
    ui.left = left;
    const digits = pad2(left);
    ui.digits.forEach((field, i) => setField(field, digits[i], { direct: true }));
    ui.unit.textContent = day < 0 ? "free days. The clock has not started." : `free day${left === 1 ? "" : "s"} left${day >= END_DAY ? " when the empty container is back." : "."}`;
  }
  ui.day.textContent = describeDay(day);
  ui.bar.style.transform = `scaleX(${Math.min(1, Math.max(0, day / FREE_DAYS)).toFixed(3)})`;
}

function play(ui) {
  ui.root.classList.remove("is-avg");
  ui.left = null;
  const start = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = Math.min(1, (now - start) / RUN_MS);
      render(ui, START_DAY + (END_DAY - START_DAY) * easeInOut(t));
      if (t < 1) { requestAnimationFrame(frame); return; }
      setTimeout(() => { ui.root.classList.add("is-avg"); resolve(); }, AVG_DELAY_MS);
    };
    requestAnimationFrame(frame);
  });
}

export function initMeter(root, { motion }) {
  if (!root) return;
  const ui = {
    root,
    chart: root.querySelector("[data-fdm-chart]"),
    digits: [...root.querySelectorAll("[data-fdm-digit]")].map((d) => createField(d, 1)),
    unit: root.querySelector("[data-fdm-unit]"),
    day: root.querySelector("[data-fdm-day]"),
    bar: root.querySelector("[data-fdm-bar]"),
    left: null,
  };
  root.classList.add("is-live");
  if (!motion) {
    root.classList.add("is-avg");
    render(ui, END_DAY);
    return;
  }
  const replay = root.querySelector("[data-fdm-replay]");
  render(ui, START_DAY);
  root.classList.add("is-armed");
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    replay.disabled = true;
    play(ui).then(() => { running = false; replay.disabled = false; });
  };
  replay.hidden = false;
  replay.addEventListener("click", run);
  new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    run();
  }, { threshold: THRESHOLD }).observe(root);
}
