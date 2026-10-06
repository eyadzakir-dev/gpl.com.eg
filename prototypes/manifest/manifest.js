// Manifest prototype: presses the clearance stamps in sequence as each step crosses the reading line.
// Documents are dealt by CSS scroll-driven animations; browsers without scroll timelines get .mf-nosda,
// which drives the same choreography from the step classes set here.

const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");
// A step counts as reached once its top passes 55% of the viewport height.
const READING_LINE = "0px 0px -45% 0px";
const STAMP_TOTAL = 5;

function supportsScrollTimelines() {
  return CSS.supports("animation-timeline: view()") && CSS.supports("timeline-scope: --a");
}

function thump(stamp) {
  const sheet = stamp.closest(".mf-sheet");
  if (!sheet) return;
  sheet.classList.remove("is-thump");
  void sheet.offsetWidth;
  sheet.classList.add("is-thump");
}

function createStamper(section) {
  const steps = [...section.querySelectorAll(".mf-step")];
  const stamps = [...section.querySelectorAll("[data-s]")];
  const counter = section.querySelector("[data-stamp-count]");
  let reached = -1;

  return function applyReached(count) {
    if (count === reached) return;
    reached = count;
    stamps.forEach((stamp) => {
      const isOn = Number(stamp.dataset.s) <= count;
      if (isOn && !stamp.classList.contains("is-on")) thump(stamp);
      stamp.classList.toggle("is-on", isOn);
    });
    steps.forEach((step, i) => {
      step.classList.toggle("is-on", i < count);
      step.classList.toggle("is-current", i === Math.max(count - 1, 0));
    });
    for (let n = 1; n <= STAMP_TOTAL; n += 1) section.classList.toggle(`is-s${n}`, n <= count);
    if (counter) counter.textContent = String(count);
  };
}

function initClearance() {
  const section = document.querySelector(".mf-clr");
  if (!section || REDUCED_MOTION.matches) return;
  const steps = [...section.querySelectorAll(".mf-step")];
  const passed = new Set();
  const applyReached = createStamper(section);

  if (!supportsScrollTimelines()) section.classList.add("mf-nosda");
  section.classList.add("is-armed");
  applyReached(0);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const index = steps.indexOf(entry.target);
      const isPassed = entry.isIntersecting || entry.boundingClientRect.top < 0;
      if (isPassed) passed.add(index);
      else passed.delete(index);
    });
    applyReached(passed.size ? Math.max(...passed) + 1 : 0);
  }, { rootMargin: READING_LINE });
  steps.forEach((step) => observer.observe(step));
}

document.addEventListener("animationend", (event) => {
  if (event.animationName === "mf-thump") event.target.classList.remove("is-thump");
});

initClearance();
