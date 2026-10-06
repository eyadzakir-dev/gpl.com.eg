// Hero departures board: example jobs flip through GPL's five stages, one row at a time.
// Illustration only: rows are invented combinations of real gateways, services and stages.
import { createField, setField } from "./flap.js";

const STAGES = ["BOOKED", "ACI REGISTERED", "CLEARED", "RELEASED", "DELIVERED"];
// Queue of example jobs [gateway, service]; the first five match the rows in the HTML.
const JOBS = [
  ["ALEXANDRIA", "FCL"], ["CAIRO AIR", "AIR"], ["DAMIETTA", "LCL"], ["PORT SAID", "CUSTOMS"], ["SOKHNA", "TRUCKING"],
  ["DEKHEILA", "FCL"], ["PORT SAID", "RORO"], ["ALEXANDRIA", "LCL"], ["SOKHNA", "FCL"], ["DAMIETTA", "CUSTOMS"],
  ["DEKHEILA", "TRUCKING"], ["CAIRO AIR", "CUSTOMS"], ["PORT SAID", "FCL"], ["ALEXANDRIA", "CUSTOMS"], ["SOKHNA", "LCL"],
  ["DAMIETTA", "FCL"], ["DEKHEILA", "LCL"], ["ALEXANDRIA", "TRUCKING"], ["SOKHNA", "CUSTOMS"], ["CAIRO AIR", "AIR"],
];
const INTRO_DELAY_MS = 450;
const HOLD_MS = 2600;
const ROW_INTERVAL_MS = 1900;
const ROW_STAGGER_TICKS = 3;
const ROW_FLASH_MS = 1400;
const PAUSE_LABEL = { run: "Pause board", paused: "Play board" };

const cairoTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function readRow(el) {
  const fields = Object.fromEntries([...el.querySelectorAll("[data-field]")].map((f) => [f.dataset.field, createField(f)]));
  return { el, fields, stage: Number(el.dataset.stage), pips: [...el.querySelectorAll(".pb-row__pips i")] };
}

function paintStage(row) {
  row.el.dataset.stage = row.stage;
  row.pips.forEach((pip, i) => pip.classList.toggle("is-on", i <= row.stage));
  row.el.classList.toggle("is-done", row.stage === STAGES.length - 1);
}

function startClock(el) {
  if (!el) return;
  const render = () => { el.textContent = cairoTime.format(new Date()); };
  render();
  setInterval(render, 15000);
}

function blankRows(rows) {
  rows.forEach((row) => Object.values(row.fields).forEach((field) => setField(field, "", { animate: false })));
}

// First flip: every row rolls in from blank, top to bottom.
function introduce(rows) {
  let longest = 0;
  rows.forEach((row, r) => {
    Object.values(row.fields).forEach((field) => {
      const ms = setField(field, field.el.dataset.initial, { delay: r * ROW_STAGGER_TICKS });
      longest = Math.max(longest, ms);
    });
  });
  return longest;
}

function flashRow(row) {
  row.el.classList.add("is-updating");
  clearTimeout(row.flash);
  row.flash = setTimeout(() => row.el.classList.remove("is-updating"), ROW_FLASH_MS);
}

function advance(row, state) {
  flashRow(row);
  row.stage += 1;
  if (row.stage >= STAGES.length) {
    const [gate, svc] = JOBS[state.next % JOBS.length];
    state.next += 1;
    row.stage = 0;
    setField(row.fields.gate, gate);
    setField(row.fields.svc, svc, { delay: 2 });
  }
  setField(row.fields.stat, STAGES[row.stage], { delay: row.stage === 0 ? 4 : 0 });
  paintStage(row);
}

function bindPause(button, state) {
  if (!button) return;
  button.hidden = false;
  const label = button.querySelector("[data-board-pause-label]");
  button.addEventListener("click", () => {
    state.paused = !state.paused;
    button.setAttribute("aria-pressed", String(state.paused));
    label.textContent = state.paused ? PAUSE_LABEL.paused : PAUSE_LABEL.run;
  });
}

function startRolling(rows, state) {
  setInterval(() => {
    if (state.paused || !state.visible || document.hidden) return;
    advance(rows[state.cursor], state);
    state.cursor = (state.cursor + 1) % rows.length;
  }, ROW_INTERVAL_MS);
}

export function initBoard(board, { motion }) {
  if (!board) return;
  startClock(board.querySelector("[data-board-clock]"));
  const rowEls = [...board.querySelectorAll("[data-row]")];
  rowEls.forEach((el) => el.querySelectorAll("[data-field]").forEach((f) => { f.dataset.initial = f.textContent.trim(); }));
  const rows = rowEls.map(readRow);
  rows.forEach(paintStage);
  board.classList.add("is-live");
  if (!motion) return;

  const state = { paused: false, visible: true, cursor: 0, next: rows.length };
  new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; }).observe(board);
  bindPause(board.querySelector("[data-board-pause]"), state);
  blankRows(rows);
  board.classList.add("is-intro");
  wait(INTRO_DELAY_MS)
    .then(() => wait(introduce(rows)))
    .then(() => { board.classList.remove("is-intro"); return wait(HOLD_MS); })
    .then(() => startRolling(rows, state));
}
