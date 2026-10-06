// Quote and contact forms: inline validation with an error summary, attachments, URL prefill and a multipart submit
// with honest fallbacks. Every visible string comes from the page's JSON strings block, so EN and AR share this file.

const MAX_FILES = 10;
const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * BYTES_PER_MB;
const ALLOWED_EXTENSIONS = new Set(["pdf", "xlsx", "xls", "csv", "jpg", "jpeg", "png", "webp"]);
const REQUEST_TIMEOUT_MS = 120000;
const PREVIEW_DELAY_MS = 800;
const PREVIEW_HOSTS = new Set(["localhost", "127.0.0.1"]);
const PREVIEW_SERIAL = "00042";
const MAILTO_TEXT_LIMIT = 1200;
const STATUS_RATE_LIMITED = 429;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)*\.[^@\s.]{2,}$/;
const PHONE_PATTERN = /^\+?[\d\s().-]+$/;
const PHONE_DIGITS = { min: 7, max: 15 };
const HS_PATTERN = /^\d{6,10}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UNSAFE_CHARS = /[\u0000-\u001F\u007F<>]/g;
const SIZE_FREE_MODES = new Set(["", "not-sure"]);

const PREFILL_CHOICES = { direction: ["import", "export"], mode: ["sea-fcl", "sea-lcl", "air", "land"] };
const PREFILL_TEXT = { origin: "origin_place", destination: "destination" };
const PREFILL_NUMBERS = ["container_count", "weight_kg", "volume_cbm"];
const PREFILL_FLAGS = { customs: "needs_clearance", trucking: "needs_trucking" };
const PORT_ALIASES = { "ain-sokhna": "sokhna", "east-port-said": "port-said", portsaid: "port-said", alex: "alexandria" };
const CONTAINER_ALIASES = { "20dv": "20gp", "20dc": "20gp", "40dv": "40gp", "40dc": "40gp", "40hq": "40hc", "45hq": "45hc", "40rh": "40rf" };

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => (key in values ? values[key] : ""));

function createText(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

// Splits a template around {reference}-style slots so codes can sit in their own <bdi> (bidi-safe in Arabic).
function fillNodes(template, values) {
  return template.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const key = part.slice(1, -1);
    if (!(part.startsWith("{") && key in values)) return part;
    return createText("bdi", "", values[key]);
  });
}

/* ---------- Validation ---------- */

function isTodayOrLater(value) {
  if (!value) return true;
  if (!DATE_PATTERN.test(value)) return false;
  const now = new Date();
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  return value >= today;
}

function isPhone(value) {
  const text = value.trim();
  if (!text) return true;
  const digits = text.replace(/\D/g, "").length;
  return PHONE_PATTERN.test(text) && digits >= PHONE_DIGITS.min && digits <= PHONE_DIGITS.max;
}

const RULES = {
  required: (c) => c.value.trim() !== "",
  email: (c) => !c.value.trim() || EMAIL_PATTERN.test(c.value.trim()),
  phone: (c) => isPhone(c.value),
  hs: (c) => !c.value.trim() || HS_PATTERN.test(c.value.replace(/[\s.]/g, "")),
  date: (c) => isTodayOrLater(c.value),
  number: (c) => !c.validity.badInput && (c.value === "" || c.checkValidity()),
};

const isInactive = (el) => el.disabled || Boolean(el.closest("[hidden]"));
const getMessage = (ctx, name, rule) => ctx.strings.errors[name]?.[rule] || ctx.strings.errors._?.[rule] || "";
const getChecked = (form, name) => form.querySelector(`input[name="${name}"]:checked`);

function getFieldError(ctx, control) {
  const failed = control.dataset.validate.split(/\s+/).find((rule) => RULES[rule] && !RULES[rule](control));
  return failed ? getMessage(ctx, control.name, failed) : "";
}

function getGroupError(ctx, group) {
  return getChecked(ctx.ui.form, group.dataset.group) ? "" : getMessage(ctx, group.dataset.group, "required");
}

// FCL needs container type and count; the other modes need weight or volume. "Not sure" leaves the group optional.
function getSizeError(ctx) {
  const form = ctx.ui.form;
  if (SIZE_FREE_MODES.has(getChecked(form, "mode")?.value || "")) return "";
  const filled = (name) => !isInactive(form.elements[name]) && form.elements[name].value.trim() !== "";
  const hasContainers = filled("container_type") && filled("container_count");
  return hasContainers || filled("weight_kg") || filled("volume_cbm") ? "" : getMessage(ctx, "size", "required");
}

function getCheckError(ctx, check) {
  if (isInactive(check.el)) return "";
  if (check.kind === "group") return getGroupError(ctx, check.el);
  if (check.kind === "size") return getSizeError(ctx);
  return getFieldError(ctx, check.el);
}

function setCheckError(check, message) {
  check.errEl.textContent = message;
  check.marked.forEach((el) => {
    if (message) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  });
}

function runCheck(ctx, check) {
  const message = getCheckError(ctx, check);
  setCheckError(check, message);
  check.flagged = check.flagged || Boolean(message);
  return message;
}

function buildCheck(form, el) {
  const kind = el.matches("[data-group]") ? "group" : el.matches("[data-size-group]") ? "size" : "field";
  const marked = kind === "group" ? [...el.querySelectorAll("input")] : kind === "size" ? [] : [el];
  return { kind, el, marked, errEl: form.querySelector(`#${el.dataset.err || `${el.id}-err`}`), flagged: false };
}

// The size group's first control depends on the mode, so the target is resolved when the summary is built.
function getFocusTarget(check) {
  if (check.kind === "field") return check.el;
  return [...check.el.querySelectorAll("input, select")].find((control) => !isInactive(control));
}

function bindRevalidation(ctx) {
  const recheck = () => ctx.checks.filter((check) => check.flagged).forEach((check) => runCheck(ctx, check));
  ctx.ui.form.addEventListener("input", recheck);
  ctx.ui.form.addEventListener("change", recheck);
  ctx.ui.form.addEventListener("focusout", recheck);
}

/* ---------- Error summary ---------- */

function focusControl(control) {
  control.focus({ preventScroll: true });
  (control.closest(".iform__field, .iform__group") || control).scrollIntoView({ block: "center" });
}

function createSummaryLink(failure) {
  const target = getFocusTarget(failure.check);
  const link = createText("a", "", failure.message);
  link.href = `#${target.id}`;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    focusControl(target);
  });
  const item = document.createElement("li");
  item.append(link);
  return item;
}

function showSummary(ctx, failures) {
  const { summary } = ctx.ui;
  summary.list.replaceChildren(...failures.map(createSummaryLink));
  summary.root.hidden = false;
  summary.root.scrollIntoView({ block: "start" });
  summary.root.focus({ preventScroll: true });
}

function hideSummary(ctx) {
  ctx.ui.summary.root.hidden = true;
  ctx.ui.summary.list.replaceChildren();
}

function validateAll(ctx) {
  return ctx.checks.map((check) => ({ check, message: runCheck(ctx, check) })).filter((failure) => failure.message);
}

/* ---------- Mode-dependent fields ---------- */

function syncMode(ctx) {
  const mode = getChecked(ctx.ui.form, "mode")?.value || "";
  ctx.ui.form.querySelectorAll("[data-show-for]").forEach((block) => {
    const isShown = SIZE_FREE_MODES.has(mode) || block.dataset.showFor.split(/\s+/).includes(mode);
    block.hidden = !isShown;
    block.querySelectorAll("input, select, textarea").forEach((control) => { control.disabled = !isShown; });
  });
  ctx.checks.filter((check) => isInactive(check.el)).forEach((check) => setCheckError(check, ""));
}

/* ---------- Attachments ---------- */

function getExtension(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

const getFileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;
const getTotalBytes = (files) => files.reduce((sum, file) => sum + file.size, 0);

function formatSize(ctx, bytes) {
  const { mb, kb } = ctx.strings.files;
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} ${mb}`;
  return `${Math.max(1, Math.round(bytes / BYTES_PER_KB))} ${kb}`;
}

function getFileError(ctx, file) {
  const t = ctx.strings.files;
  const values = { name: file.name };
  if (ctx.files.some((added) => getFileKey(added) === getFileKey(file))) return fill(t.dup, values);
  if (!ALLOWED_EXTENSIONS.has(getExtension(file.name))) return fill(t.type, values);
  if (file.size === 0) return fill(t.empty, values);
  if (ctx.files.length >= MAX_FILES) return fill(t.count, values);
  if (getTotalBytes(ctx.files) + file.size > MAX_TOTAL_BYTES) return fill(t.big, values);
  return "";
}

function createFileRow(ctx, file, index) {
  const row = document.createElement("li");
  const name = createText("span", "iform__pill-name", file.name);
  const remove = createText("button", "iform__pill-x", "×");
  row.className = "iform__pill";
  name.title = file.name;
  name.dir = "auto";
  remove.type = "button";
  remove.dataset.index = String(index);
  remove.setAttribute("aria-label", fill(ctx.strings.files.remove, { name: file.name }));
  row.append(createText("span", "iform__pill-no mono", `F/${String(index + 1).padStart(2, "0")}`), name,
    createText("span", "iform__pill-size mono", formatSize(ctx, file.size)), remove);
  return row;
}

function renderFiles(ctx, prefix = "") {
  const t = ctx.strings.files;
  ctx.ui.fileList.replaceChildren(...ctx.files.map((file, index) => createFileRow(ctx, file, index)));
  const summary = ctx.files.length
    ? fill(t.selected, { n: ctx.files.length, size: formatSize(ctx, getTotalBytes(ctx.files)) })
    : t.none;
  ctx.ui.fileLive.textContent = `${prefix}${summary}`;
}

function addFiles(ctx, incoming) {
  const errors = [];
  [...incoming].forEach((file) => {
    const error = getFileError(ctx, file);
    if (error) errors.push(error);
    else ctx.files = [...ctx.files, file];
  });
  ctx.ui.fileError.textContent = errors.join(" ");
  renderFiles(ctx);
}

function removeFile(ctx, index) {
  const removed = ctx.files[index];
  ctx.files = ctx.files.filter((_, i) => i !== index);
  ctx.ui.fileError.textContent = "";
  renderFiles(ctx, `${fill(ctx.strings.files.removed, { name: removed.name })} `);
  const buttons = ctx.ui.fileList.querySelectorAll("[data-index]");
  (buttons[Math.min(index, buttons.length - 1)] || ctx.ui.picker).focus();
}

const hasDraggedFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");

function bindDropzone(ctx) {
  const { zone, form } = ctx.ui;
  const over = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    zone.classList.add("is-over");
  };
  zone.addEventListener("dragenter", over);
  zone.addEventListener("dragover", over);
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    zone.classList.remove("is-over");
    addFiles(ctx, event.dataTransfer.files);
  });
  // Stops the browser from opening a file dropped on the form outside the dropzone.
  const blockStray = (event) => {
    if (!hasDraggedFiles(event) || event.defaultPrevented) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "none";
  };
  form.addEventListener("dragover", blockStray);
  form.addEventListener("drop", blockStray);
}

function bindFiles(ctx) {
  if (!ctx.ui.picker) return;
  ctx.ui.picker.addEventListener("change", () => {
    addFiles(ctx, ctx.ui.picker.files);
    ctx.ui.picker.value = "";
  });
  ctx.ui.fileList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-index]");
    if (button) removeFile(ctx, Number(button.dataset.index));
  });
  bindDropzone(ctx);
}

/* ---------- URL prefill (homepage shipment builder contract) ---------- */

const cleanParam = (value, max = 160) => value.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
const toSlug = (value) => cleanParam(value, 40).toLowerCase().replace(/[\s_]+/g, "-");

function setRadio(form, name, value) {
  const radio = [...form.querySelectorAll(`input[name="${name}"]`)].find((input) => input.value === value);
  if (radio) radio.checked = true;
  return Boolean(radio);
}

function setSelect(select, value) {
  if (!select || ![...select.options].some((option) => option.value === value)) return false;
  select.value = value;
  return true;
}

function setText(control, value) {
  if (!control || !value) return false;
  control.value = cleanParam(value, control.maxLength > 0 ? control.maxLength : undefined);
  return true;
}

function prefillPort(form, params) {
  const select = form.elements.egypt_port;
  const raw = toSlug(params.get("port") || "");
  const value = PORT_ALIASES[raw] || raw;
  if (!value || !setSelect(select, value)) return false;
  if (value === "not-sure") return true;
  const direction = getChecked(form, "direction")?.value;
  const target = direction === "import" ? form.elements.destination : direction === "export" ? form.elements.origin_place : null;
  if (target && !target.value) target.value = select.selectedOptions[0].textContent.trim();
  return true;
}

function prefillMisc(form, params) {
  const applied = [];
  Object.entries(PREFILL_TEXT).forEach(([param, name]) => applied.push(setText(form.elements[name], params.get(param))));
  PREFILL_NUMBERS.forEach((name) => {
    const value = Number(params.get(name));
    if (params.has(name) && Number.isFinite(value) && value > 0) applied.push(setText(form.elements[name], String(value)));
  });
  const type = toSlug(params.get("container_type") || "");
  applied.push(setSelect(form.elements.container_type, CONTAINER_ALIASES[type] || type));
  const date = cleanParam(params.get("ready_date") || "", 10);
  if (DATE_PATTERN.test(date) && !Number.isNaN(Date.parse(date))) applied.push(setText(form.elements.ready_date, date));
  Object.entries(PREFILL_FLAGS).forEach(([param, name]) => {
    const box = form.elements[name];
    if (!box || !["0", "1"].includes(params.get(param))) return;
    box.checked = params.get(param) === "1";
    applied.push(true);
  });
  return applied.some(Boolean);
}

function prefillFromUrl(ctx) {
  const { form, prefillNote } = ctx.ui;
  const params = new URLSearchParams(location.search);
  if (!form.elements.mode || ![...params.keys()].length) return;
  const choices = Object.entries(PREFILL_CHOICES).map(([name, allowed]) => {
    const value = toSlug(params.get(name) || "");
    return allowed.includes(value) && setRadio(form, name, value);
  });
  const misc = prefillMisc(form, params);
  const port = prefillPort(form, params);
  if (prefillNote && (choices.some(Boolean) || misc || port)) {
    prefillNote.textContent = ctx.strings.prefill;
    prefillNote.hidden = false;
  }
}

/* ---------- Readable summary (mailto / WhatsApp fallback) ---------- */

function getCleanText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll(".iform__req, .iform__opt, .sr-only, [data-summary-skip]").forEach((el) => el.remove());
  return clone.textContent.replace(/\s+/g, " ").trim();
}

function getControlLabel(form, control) {
  if (control.type === "radio") return getCleanText(control.closest("fieldset").querySelector("legend"));
  const label = form.querySelector(`label[for="${control.id}"]`);
  return label ? getCleanText(label) : control.name;
}

function getControlValue(ctx, control) {
  const { strings } = ctx;
  if (control.type === "checkbox") return control.checked ? strings.yes : strings.no;
  if (control.type === "radio") return control.checked ? getCleanText(control.closest("label")) : "";
  if (control.tagName === "SELECT") return control.value ? control.selectedOptions[0].textContent.trim() : "";
  return control.value.trim().slice(0, MAILTO_TEXT_LIMIT);
}

function getSummaryLines(ctx) {
  const { form, honeypot } = ctx.ui;
  const lines = [];
  [...form.elements].forEach((control) => {
    const skip = !control.name || control.disabled || control === honeypot || ["hidden", "file", "submit", "button"].includes(control.type);
    const value = skip ? "" : getControlValue(ctx, control);
    if (value) lines.push(`${getControlLabel(form, control)}: ${value}`);
  });
  if (ctx.files.length) lines.push(fill(ctx.strings.filesLine, { names: ctx.files.map((file) => file.name).join(", ") }));
  return lines;
}

function getMailtoHref(ctx) {
  const { strings, ui } = ctx;
  const company = ui.form.elements.company?.value.trim() || ui.form.elements.name?.value.trim() || "";
  const subject = company ? fill(strings.subject, { company }) : strings.subjectFallback;
  const body = [strings.summaryIntro, "", ...getSummaryLines(ctx)].join("\r\n");
  return `mailto:${strings.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function getWhatsAppHref(ctx) {
  const text = [ctx.strings.summaryIntro, ...getSummaryLines(ctx)].join("\n");
  return `https://wa.me/${ctx.strings.whatsapp}?text=${encodeURIComponent(text)}`;
}

/* ---------- Submit ---------- */

class RequestError extends Error {
  constructor(kind, detail) {
    super(detail);
    this.kind = kind;
  }
}

function buildBody(ctx) {
  const body = new FormData(ctx.ui.form);
  body.delete("files");
  [...body.entries()].forEach(([key, value]) => {
    if (typeof value === "string") body.set(key, value.trim());
  });
  ctx.files.forEach((file) => body.append("files", file, file.name));
  return body;
}

async function readReference(response) {
  if (!response.headers.get("content-type")?.includes("json")) return "";
  // A 2xx already means success; the JSON body is optional.
  const data = await response.json().catch(() => null);
  return typeof data?.reference === "string" ? cleanParam(data.reference, 60) : "";
}

async function postForm(endpoint, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { method: "POST", body, headers: { Accept: "application/json" }, signal: controller.signal });
    if (response.status === STATUS_RATE_LIMITED) throw new RequestError("rate", "Rate limited (429).");
    if (!response.ok) throw new RequestError("server", `Endpoint responded with ${response.status}.`);
    return { reference: await readReference(response), simulated: false };
  } catch (error) {
    if (error.name === "AbortError") throw new RequestError("timeout", "Request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function simulateSuccess() {
  const reference = `GPL-Q-${new Date().getFullYear()}-${PREVIEW_SERIAL}`;
  return new Promise((resolve) => {
    setTimeout(() => resolve({ reference, simulated: true }), PREVIEW_DELAY_MS);
  });
}

function setSending(ctx, isSending) {
  const { form, submit, submitLabel } = ctx.ui;
  ctx.isSending = isSending;
  submit.disabled = isSending;
  submitLabel.textContent = isSending ? ctx.strings.sending : ctx.strings.submit;
  if (isSending) form.setAttribute("aria-busy", "true");
  else form.removeAttribute("aria-busy");
}

function createAction(className, text, href) {
  const link = createText("a", className, text);
  link.href = href;
  if (href.startsWith("https:")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return link;
}

function showNotice(ctx, { title, body, withRetry }) {
  const { strings, ui } = ctx;
  const heading = createText("p", "iform__notice-title", title);
  const actions = createText("div", "iform__notice-acts", "");
  heading.tabIndex = -1;
  if (withRetry) {
    const retry = createText("button", "btn btn--ink", strings.retry);
    retry.type = "button";
    retry.addEventListener("click", () => ui.form.requestSubmit());
    actions.append(retry);
  }
  actions.append(createAction("btn btn--line", strings.emailInstead, getMailtoHref(ctx)),
    createAction("btn btn--line", strings.whatsappInstead, getWhatsAppHref(ctx)));
  ui.status.replaceChildren(heading, createText("p", "iform__notice-body", body), actions);
  ui.status.hidden = false;
  heading.focus();
}

function showFailure(ctx, kind) {
  const t = ctx.strings.error;
  const body = kind === "timeout" ? t.timeout : kind === "rate" ? t.rate : t.body;
  showNotice(ctx, { title: t.title, body, withRetry: true });
}

// A live site without an endpoint must not pretend to send: hand the answers to the visitor's mail app instead.
function openOfflineFallback(ctx) {
  const t = ctx.strings.offline;
  showNotice(ctx, { title: t.title, body: ctx.files.length ? `${t.body} ${t.files}` : t.body, withRetry: false });
  window.location.href = getMailtoHref(ctx);
}

function hideNotice(ctx) {
  ctx.ui.status.hidden = true;
  ctx.ui.status.replaceChildren();
}

function showSuccess(ctx, reference, isSimulated) {
  const { done, form } = ctx.ui;
  const t = ctx.strings.success;
  const shown = isSimulated ? `${reference} ${t.simulatedTag}` : reference;
  done.body.replaceChildren(...(reference ? fillNodes(t.body, { reference: shown }) : [t.bodyNoRef]));
  done.note.textContent = isSimulated ? t.simulated : "";
  done.note.hidden = !isSimulated;
  form.hidden = true;
  done.root.hidden = false;
  done.root.scrollIntoView({ block: "nearest" });
  done.title.focus({ preventScroll: true });
}

async function sendForm(ctx) {
  const endpoint = (ctx.ui.form.dataset.endpoint || "").trim();
  if (!endpoint && !PREVIEW_HOSTS.has(location.hostname)) {
    openOfflineFallback(ctx);
    return;
  }
  setSending(ctx, true);
  let outcome = null;
  try {
    outcome = endpoint ? await postForm(endpoint, buildBody(ctx)) : await simulateSuccess();
  } catch (error) {
    console.warn("Quote form submission failed.", error);
    outcome = { failure: error.kind || "server" };
  }
  setSending(ctx, false);
  if (outcome.failure) showFailure(ctx, outcome.failure);
  else showSuccess(ctx, outcome.reference, outcome.simulated);
}

function handleSubmit(event, ctx) {
  event.preventDefault();
  if (ctx.isSending) return;
  hideNotice(ctx);
  const failures = validateAll(ctx);
  if (failures.length) {
    showSummary(ctx, failures);
    return;
  }
  hideSummary(ctx);
  // Bots fill the hidden "website" field: show the normal success and send nothing.
  if (ctx.ui.honeypot.value) showSuccess(ctx, "", false);
  else sendForm(ctx);
}

function resetForm(ctx) {
  const { form, done } = ctx.ui;
  form.reset();
  ctx.files = [];
  if (ctx.ui.picker) {
    renderFiles(ctx);
    ctx.ui.fileLive.textContent = "";
  }
  ctx.checks.forEach((check) => {
    setCheckError(check, "");
    check.flagged = false;
  });
  syncMode(ctx);
  hideSummary(ctx);
  hideNotice(ctx);
  done.root.hidden = true;
  form.hidden = false;
  form.querySelector("input:not([type=hidden]):not([tabindex='-1'])").focus();
}

/* ---------- Init ---------- */

function getUi(form) {
  const panel = form.closest("[data-form-panel]");
  const done = panel.querySelector("[data-form-done]");
  const summary = form.querySelector("[data-error-summary]");
  return {
    form,
    honeypot: form.elements.website,
    summary: { root: summary, list: summary.querySelector("ul") },
    zone: form.querySelector("[data-dropzone]"),
    picker: form.querySelector("[data-file-picker]"),
    fileList: form.querySelector("[data-file-list]"),
    fileError: form.querySelector("[data-file-error]"),
    fileLive: form.querySelector("[data-file-live]"),
    prefillNote: form.querySelector("[data-prefill-note]"),
    submit: form.querySelector("[data-form-submit]"),
    submitLabel: form.querySelector("[data-submit-label]"),
    status: panel.querySelector("[data-form-status]"),
    done: {
      root: done,
      title: done.querySelector("[data-done-title]"),
      body: done.querySelector("[data-done-body]"),
      note: done.querySelector("[data-done-note]"),
      again: done.querySelector("[data-form-again]"),
    },
  };
}

function initForm(form) {
  const strings = JSON.parse(document.getElementById(form.dataset.strings).textContent);
  const ctx = { strings, ui: getUi(form), files: [], isSending: false, checks: [] };
  ctx.checks = [...form.querySelectorAll("[data-validate], [data-group], [data-size-group]")].map((el) => buildCheck(form, el));
  prefillFromUrl(ctx);
  syncMode(ctx);
  form.querySelectorAll('input[name="mode"]').forEach((radio) => radio.addEventListener("change", () => syncMode(ctx)));
  bindRevalidation(ctx);
  bindFiles(ctx);
  form.addEventListener("submit", (event) => handleSubmit(event, ctx));
  ctx.ui.done.again.addEventListener("click", () => resetForm(ctx));
}

document.querySelectorAll("[data-quote-form]").forEach(initForm);
