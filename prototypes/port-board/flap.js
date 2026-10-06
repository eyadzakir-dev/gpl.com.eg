// Split-flap engine: each cell has four clipped layers; the two leaves rotate with WAAPI.
// One shared ticker advances every flipping cell on the same beat, like a real Solari board.

export const FLAP_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·-/.";
const STEP_MS = 66;
const HALF_MS = STEP_MS / 2;
const MAX_STEPS = 8;
const EASE_IN = "cubic-bezier(.55,0,1,.45)";
const EASE_OUT = "cubic-bezier(0,.55,.45,1)";
const TOP_FRAMES = [{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }];
const BOT_FRAMES = [{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }];

const active = new Set();
const ticker = { raf: 0, last: 0, acc: 0 };

function createLayer(modifier, char) {
  const el = document.createElement("span");
  el.className = `flap__l flap__l--${modifier}`;
  el.textContent = char;
  return el;
}

function createCell(char) {
  const el = document.createElement("span");
  el.className = "flap";
  const [top, bot, leafTop, leafBot] = ["top", "bot", "leaf-top", "leaf-bot"].map((m) => createLayer(m, char));
  el.append(top, bot, leafTop, leafBot);
  return { el, top, bot, leafTop, leafBot, current: char, queue: [], wait: 0 };
}

function flipOnce(cell, next) {
  cell.top.textContent = next;
  cell.bot.textContent = cell.current;
  cell.leafTop.textContent = cell.current;
  cell.leafBot.textContent = next;
  cell.leafTop.animate(TOP_FRAMES, { duration: HALF_MS, easing: EASE_IN, fill: "forwards" });
  cell.leafBot.animate(BOT_FRAMES, { duration: HALF_MS, delay: HALF_MS, easing: EASE_OUT, fill: "both" });
  cell.current = next;
}

function showChar(cell, char) {
  [cell.leafTop, cell.leafBot].forEach((leaf) => leaf.getAnimations().forEach((anim) => anim.cancel()));
  cell.top.textContent = char;
  cell.bot.textContent = char;
  cell.leafTop.textContent = char;
  cell.leafBot.textContent = char;
  cell.current = char;
  cell.queue = [];
  active.delete(cell);
}

// The characters a cell shows on its way to the target, capped so long words settle quickly.
function getFlipPath(from, to) {
  const count = FLAP_CHARS.length;
  const start = Math.max(0, FLAP_CHARS.indexOf(from));
  const end = Math.max(0, FLAP_CHARS.indexOf(to));
  const distance = (end - start + count) % count;
  const steps = Math.min(distance, MAX_STEPS);
  return Array.from({ length: steps }, (_, i) => FLAP_CHARS[(end - steps + 1 + i + count) % count]);
}

function tick() {
  active.forEach((cell) => {
    if (cell.wait > 0) { cell.wait -= 1; return; }
    flipOnce(cell, cell.queue.shift());
    if (!cell.queue.length) active.delete(cell);
  });
}

function frame(now) {
  ticker.raf = 0;
  if (!active.size) return;
  ticker.acc += Math.min(now - (ticker.last || now), STEP_MS * 2);
  ticker.last = now;
  if (ticker.acc >= STEP_MS) {
    ticker.acc %= STEP_MS;
    tick();
  }
  ticker.raf = requestAnimationFrame(frame);
}

function startTicker() {
  if (ticker.raf) return;
  ticker.last = 0;
  ticker.raf = requestAnimationFrame(frame);
}

const toCells = (text, length) => text.toUpperCase().padEnd(length, " ").slice(0, length).split("");

// Replaces an element's text with flap cells; the original text stays as the first state.
export function createField(el, length = Number(el.dataset.len) || el.textContent.length) {
  const text = el.textContent.trim();
  const cells = toCells(text, length).map((char) => createCell(char));
  el.replaceChildren(...cells.map((cell) => cell.el));
  el.classList.add("is-flap");
  return { el, cells, text };
}

// Sets a field's text. animate: flip through the alphabet; direct: one flip straight to each character.
// Returns the time in ms until the last cell settles.
export function setField(field, text, { animate = true, direct = false, delay = 0, stagger = 0.5 } = {}) {
  field.text = text;
  const chars = toCells(text, field.cells.length);
  let longest = 0;
  field.cells.forEach((cell, i) => {
    const target = chars[i];
    if (!animate) { showChar(cell, target); return; }
    const path = direct ? (cell.current === target ? [] : [target]) : getFlipPath(cell.current, target);
    if (!path.length) {
      cell.queue = [];
      active.delete(cell);
      return;
    }
    cell.queue = path;
    cell.wait = delay + Math.floor(i * stagger);
    active.add(cell);
    longest = Math.max(longest, cell.wait + cell.queue.length);
  });
  if (active.size) startTicker();
  return (longest + 1) * STEP_MS;
}
