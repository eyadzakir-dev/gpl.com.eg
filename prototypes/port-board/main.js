// Port-board home prototype: hero departures board, port map, free-days meter and the wordmark rise.
import { initBoard } from "./board.js";
import { initPortMap } from "./port-map.js";
import { initMeter } from "./meter.js";

const motion = document.documentElement.classList.contains("motion");

// Splits the wordmark into letters that rise out of a clip, 38 ms apart.
function splitWordmark(word) {
  if (!word || !motion) return;
  let index = 0;
  const wrapChars = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.append(" "); return; }
        const word = document.createElement("span");
        word.className = "w";
        [...part].forEach((char) => {
          const span = document.createElement("span");
          span.className = "ch";
          span.style.setProperty("--i", index);
          index += 1;
          span.textContent = char;
          word.append(span);
        });
        frag.append(word);
      });
      node.replaceWith(frag);
      return;
    }
    [...node.childNodes].forEach(wrapChars);
  };
  [...word.childNodes].forEach(wrapChars);
  word.classList.add("is-split");
}

splitWordmark(document.querySelector("[data-word]"));
initBoard(document.querySelector("[data-board]"), { motion });
initMeter(document.querySelector("[data-fdm]"), { motion });
initPortMap(document.querySelector("[data-pmap]"), { motion });
