// Shipment brief controller. The form is the only state: every change re-reads it, derives the plan and
// rewrites the plan card, the map and the send links.
import {
  readBrief, computePlan, buildQuoteUrl, buildWhatsAppUrl, buildWhatsAppText, describeEnds,
  isRegionAllowed, foreignName, MODES, PORTS, cargoLabel,
} from "./plan.js";
import { createRouteMap, buildRoute } from "./route-map.js";

const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOBILE = matchMedia("(max-width: 899px)");
const READY_LEAD_DAYS = 7;
const STATUS_DELAY_MS = 700;
const PORT_LEGEND = { sea: "Port in Egypt", air: "Airport in Egypt" };

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function isoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function setDateDefaults(form) {
  const input = form.elements.ready_date;
  const today = new Date();
  input.min = isoDate(today);
  if (input.value) return;
  const ready = new Date(today);
  ready.setDate(today.getDate() + READY_LEAD_DAYS);
  input.value = isoDate(ready);
}

/* ---------- Keeping the form valid for the chosen mode ---------- */

function toggleOptions(form, name, isAllowed) {
  const inputs = [...form.querySelectorAll(`input[name="${name}"]`)];
  inputs.forEach((input) => {
    const allowed = isAllowed(input.value);
    input.disabled = !allowed;
    input.closest("label").hidden = !allowed;
  });
  if (inputs.some((input) => input.checked && !input.disabled)) return;
  const first = inputs.find((input) => !input.disabled);
  if (first) first.checked = true;
}

function syncControls(form) {
  const mode = form.elements.mode.value;
  const { portKind, cargo } = MODES[mode] ?? MODES["sea-fcl"];
  toggleOptions(form, "port", (value) => PORTS[value].kind === portKind);
  toggleOptions(form, "region", (value) => isRegionAllowed(value, mode));
  form.querySelectorAll("[data-cargo]").forEach((group) => {
    const isOn = group.dataset.cargo === cargo;
    group.hidden = !isOn;
    group.querySelectorAll("input, select, button").forEach((el) => { el.disabled = !isOn; });
  });
  const isImport = form.elements.direction.value === "import";
  const isDomestic = form.elements.region.value === "egypt";
  form.querySelector("[data-port-legend]").textContent = mode === "land" ? "Port in Egypt (start or end)" : PORT_LEGEND[portKind];
  form.querySelector("[data-region-legend]").textContent = isDomestic ? (isImport ? "Delivering to" : "Collecting from") : isImport ? "Coming from" : "Going to";
  form.elements.place.placeholder = isDomestic ? "e.g. 10th of Ramadan" : `e.g. ${foreignName({ mode, region: form.elements.region.value, place: "" })}`;
}

/* ---------- Rendering ---------- */

function bindUi(root) {
  const q = (name) => root.querySelector(`[data-${name}]`);
  return {
    title: q("plan-title"), route: q("plan-route"), codes: q("plan-codes"), chips: q("plan-chips"),
    steps: q("plan-steps"), timeline: q("plan-time"), window: q("plan-window"), docs: q("plan-docs"),
    redSea: q("plan-redsea"), docket: q("docket"), mapAlt: q("map-alt"), canvas: q("map"),
    status: q("plan-status"), sendbarSummary: q("sendbar-sum"),
    send: root.querySelectorAll("[data-send]"), whatsapp: root.querySelectorAll("[data-wa]"),
  };
}

function renderSteps(list, steps, previousIds) {
  list.innerHTML = steps.map((s, i) => `
    <li class="pstep${previousIds.length && !previousIds.includes(s.id) ? " is-new" : ""}" data-id="${esc(s.id)}">
      <span class="pstep__n mono" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
      <div class="pstep__body">
        <p class="pstep__title">${esc(s.title)}</p>
        <p class="pstep__text">${esc(s.text)}</p>
      </div>
      <p class="pstep__when mono">${esc(s.when)}</p>
    </li>`).join("");
}

function gaugeMarkup(w) {
  const pct = (days) => `${(Math.min(days, w.scale) / w.scale) * 100}%`;
  const ticks = Array.from({ length: w.scale + 1 }, (_, d) => `<li style="--at:${pct(d)}">${d}</li>`).join("");
  const avgLabel = w.avg ? `2024 avg ${w.avgLabel} · ${w.avg.toFixed(1)} d` : "";
  const label = `${w.title}: ${w.min} to ${w.max} free days ${w.from}.${w.avg ? ` 2024 average release at ${w.avgLabel}: ${w.avg.toFixed(1)} days.` : ""}`;
  return `
    <div class="gauge" role="img" aria-label="${esc(label)}">
      <div class="gauge__track">
        <span class="gauge__seg gauge__seg--free" style="--a:0%;--b:${pct(w.min)}"></span>
        <span class="gauge__seg gauge__seg--edge" style="--a:${pct(w.min)};--b:${pct(w.max)}"></span>
        ${w.avg ? `<span class="gauge__seg gauge__seg--risk" style="--a:${pct(w.max)};--b:${pct(w.avg)}"></span>
        <span class="gauge__avg" style="--at:${pct(w.avg)}"><span class="mono">${esc(avgLabel)}</span></span>` : ""}
      </div>
      <ol class="gauge__ticks mono" aria-hidden="true">${ticks}</ol>
      <p class="gauge__key mono" aria-hidden="true">
        <span class="gauge__k gauge__k--free">Free ${w.min}–${w.max} days</span>
        ${w.avg ? `<span class="gauge__k gauge__k--risk">Demurrage risk</span>` : ""}
        <span class="gauge__unit">Days ${esc(w.from)}</span>
      </p>
    </div>`;
}

function renderWindow(box, w) {
  box.innerHTML = `
    <h4 class="plan__h mono">${esc(w.title)} <span class="plan__tag">Typical</span></h4>
    ${w.kind === "gauge" ? gaugeMarkup(w) : ""}
    ${w.text.map((t) => `<p class="plan__p">${esc(t)}</p>`).join("")}`;
}

function renderDocket(dl, brief) {
  const ends = describeEnds(brief);
  const rows = [
    ["Direction", brief.direction === "import" ? "Import into Egypt" : "Export from Egypt"],
    ["Mode", MODES[brief.mode].long],
    ["From", ends.origin],
    ["To", ends.destination],
    ["Cargo", cargoLabel(brief)],
    ["Ready", brief.readyDate || "To follow"],
    ["Clearance", brief.customs ? "Yes" : "No"],
    ["Trucking", brief.trucking ? "Yes" : "No"],
  ];
  dl.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
}

function renderPlan(ui, brief, plan, previousIds) {
  ui.title.textContent = plan.title;
  ui.route.innerHTML = `<span>${esc(plan.route[0])}</span> <span class="arr" aria-hidden="true">→</span><span class="sr-only"> to </span> <span>${esc(plan.route[1])}</span>`;
  ui.codes.textContent = plan.routeCodes.join("  →  ");
  ui.chips.innerHTML = plan.chips.map((c) => `<li>${esc(c)}</li>`).join("");
  renderSteps(ui.steps, plan.steps, previousIds);
  ui.timeline.innerHTML = plan.timeline.map((r) => `<div><dt class="mono">${esc(r.k)}</dt><dd><b>${esc(r.v)}</b> <span>${esc(r.note)}</span></dd></div>`).join("");
  renderWindow(ui.window, plan.window);
  ui.docs.innerHTML = plan.docs.map((d) => `<li><span class="plan__docl">${esc(d.label)}</span>${d.note ? ` <span class="plan__docn">${esc(d.note)}</span>` : ""}</li>`).join("");
  ui.redSea.hidden = !plan.redSea;
  ui.mapAlt.textContent = `Illustrative ${MODES[brief.mode].leg} route from ${plan.route[0]} to ${plan.route[1]}.`;
  renderDocket(ui.docket, brief);
}

function renderLinks(ui, brief, plan) {
  const quote = buildQuoteUrl(brief);
  const whatsapp = buildWhatsAppUrl(brief);
  ui.send.forEach((a) => { a.href = quote; });
  ui.whatsapp.forEach((a) => { a.href = whatsapp; a.dataset.text = buildWhatsAppText(brief); });
  ui.sendbarSummary.textContent = `${plan.title} · ${plan.route.join(" → ")}`;
}

/* ---------- Behaviour ---------- */

function initStepper(form) {
  form.querySelectorAll("[data-count-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = form.elements.container_count;
      const next = Math.min(Math.max((Number(input.value) || 1) + Number(button.dataset.countStep), Number(input.min)), Number(input.max));
      input.value = String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

/** Mobile: a sticky "Send this brief" bar once the builder is in view, hidden while an inline send button shows. */
function initSendbar(bar, zones) {
  const inline = [...document.querySelectorAll("[data-send]")].filter((a) => !bar.contains(a));
  const seen = new Map();
  const update = () => {
    const deskOn = zones.some((zone) => seen.get(zone));
    const inlineOn = inline.some((a) => seen.get(a));
    bar.classList.toggle("is-on", Boolean(MOBILE.matches && deskOn && !inlineOn));
    bar.inert = !bar.classList.contains("is-on");
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((e) => seen.set(e.target, e.isIntersecting));
    update();
  });
  inline.forEach((el) => observer.observe(el));
  // The builder only counts once its top reaches the upper part of the screen.
  const zoneObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => seen.set(e.target, e.isIntersecting));
    update();
  }, { rootMargin: "0px 0px -45% 0px" });
  zones.forEach((zone) => zoneObserver.observe(zone));
  MOBILE.addEventListener("change", update);
  update();
}

function initBrief(form) {
  const ui = bindUi(document);
  const map = ui.canvas ? createRouteMap(ui.canvas, { reducedMotion: REDUCED_MOTION }) : null;
  let previousIds = [];
  let statusTimer = 0;

  const update = () => {
    syncControls(form);
    const brief = readBrief(new FormData(form));
    const plan = computePlan(brief);
    renderPlan(ui, brief, plan, previousIds);
    renderLinks(ui, brief, plan);
    previousIds = plan.steps.map((s) => s.id);
    map?.setRoute(buildRoute(brief), { start: plan.route[0].toUpperCase(), end: plan.route[1].toUpperCase() });
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { ui.status.textContent = `Plan updated: ${plan.summary}`; }, STATUS_DELAY_MS);
  };

  setDateDefaults(form);
  initStepper(form);
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.location.assign(buildQuoteUrl(readBrief(new FormData(form))));
  });
  document.documentElement.classList.add("has-brief");
  update();

  const bar = document.querySelector("[data-sendbar]");
  const plan = document.querySelector(".plan");
  if (bar) initSendbar(bar, [form, plan].filter(Boolean));
}

const form = document.querySelector("[data-brief]");
if (form) initBrief(form);

