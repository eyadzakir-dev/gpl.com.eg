// FAQ page: client-side question filter and deep links to questions.
// Without JS the filter stays hidden and the topic index, anchors and <details> still work.

const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const LATIN_MARKS = /[\u0300-\u036f]/g;

// Case-, accent- and tashkeel-insensitive text, with Arabic letter variants folded together.
function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(LATIN_MARKS, "")
    .replace(ARABIC_MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[’'"“”«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fill(template, shown, total) {
  return template.replace("{n}", shown).replace("{total}", total);
}

function initFilter() {
  const box = document.querySelector("[data-faq-filter]");
  if (!box) return null;
  const input = box.querySelector("input");
  const status = box.querySelector("[data-faq-status]");
  const empty = document.querySelector("[data-faq-empty]");
  const groups = [...document.querySelectorAll("[data-faq-group]")];
  const topics = new Map([...document.querySelectorAll("[data-topic]")].map((li) => [li.dataset.topic, li]));
  const entries = groups.flatMap((group) =>
    [...group.querySelectorAll(".faq__item")].map((item) => ({ item, text: normalize(item.textContent) })));

  function render() {
    const terms = normalize(input.value).split(" ").filter(Boolean);
    let shown = 0;
    entries.forEach(({ item, text }) => {
      const isMatch = terms.every((term) => text.includes(term));
      item.hidden = !isMatch;
      if (isMatch) shown += 1;
    });
    groups.forEach((group) => {
      group.hidden = !group.querySelector(".faq__item:not([hidden])");
      const topic = topics.get(group.id);
      if (topic) topic.hidden = group.hidden;
    });
    if (empty) empty.hidden = shown > 0;
    const template = !terms.length ? box.dataset.all : shown ? box.dataset.some : box.dataset.none;
    status.textContent = fill(template, shown, entries.length);
  }

  function clear() {
    input.value = "";
    render();
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value) clear();
  });
  box.hidden = false;
  render();
  return { clear };
}

function initDeepLinks(filter) {
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    if (!(target instanceof HTMLDetailsElement)) return;
    if (target.hidden || target.closest("[hidden]")) filter?.clear();
    target.open = true;
    target.scrollIntoView({ block: "start" });
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
}

initDeepLinks(initFilter());
