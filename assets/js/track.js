// Track Shipment: checks the reference (ISO 6346 check digit for container numbers), then builds a WhatsApp link and
// a mailto to the chosen desk. There is no live tracking; a person replies. Strings come from the page's JSON block.

const MIN_REF_LENGTH = 6;
const CONTAINER_SHAPE = /^[A-Z]{3}[UJZ]\d{7}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)*\.[^@\s.]{2,}$/;
const ISO_LETTER_START = 10;
const ISO_SKIP_MULTIPLE = 11;
const ISO_MODULUS = 11;
const ISO_OWNER_AND_SERIAL_LENGTH = 10;

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

// Letter values run from 10 upwards, skipping multiples of 11 (A=10, B=12 … K=21, L=23 … U=32, V=34 …).
const LETTER_VALUES = (() => {
  const values = {};
  let next = ISO_LETTER_START;
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (next % ISO_SKIP_MULTIPLE === 0) next += 1;
    values[letter] = next;
    next += 1;
  }
  return values;
})();

function getCheckDigit(code) {
  const sum = [...code.slice(0, ISO_OWNER_AND_SERIAL_LENGTH)].reduce((total, char, index) => {
    const value = LETTER_VALUES[char] ?? Number(char);
    return total + value * 2 ** index;
  }, 0);
  return (sum % ISO_MODULUS) % 10;
}

const normalizeRef = (value) => value.toUpperCase().replace(/[\s-]/g, "");

function getRefError(ctx, raw) {
  const t = ctx.strings.errors;
  const code = normalizeRef(raw);
  if (!code) return { message: t.empty };
  if (code.length < MIN_REF_LENGTH) return { message: t.short };
  if (!CONTAINER_SHAPE.test(code) || ctx.allowAnyRef) return null;
  if (getCheckDigit(code) === Number(code[ISO_OWNER_AND_SERIAL_LENGTH])) return null;
  return { message: t.checkDigit, canOverride: true };
}

function getEmailError(ctx, value) {
  return value && !EMAIL_PATTERN.test(value) ? ctx.strings.errors.email : "";
}

function setError(field, errEl, message) {
  errEl.textContent = message;
  if (message) field.setAttribute("aria-invalid", "true");
  else field.removeAttribute("aria-invalid");
}

/* ---------- Links ---------- */

function getDetails(ctx) {
  const { form } = ctx.ui;
  const checked = form.querySelector('input[name="desk"]:checked');
  return {
    ref: form.elements.ref.value.trim().toUpperCase().replace(/\s+/g, " "),
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    desk: checked?.dataset.email || ctx.strings.defaultEmail,
  };
}

function getWhatsAppHref(ctx, details) {
  const t = ctx.strings;
  const text = fill(details.name ? t.waText : t.waTextNoName, details);
  return `https://wa.me/${t.whatsapp}?text=${encodeURIComponent(text)}`;
}

function getMailtoHref(ctx, details) {
  const t = ctx.strings;
  const lines = [fill(t.mailIntro, details), "", details.name && fill(t.mailName, details), details.email && fill(t.mailEmail, details)];
  const body = lines.filter((line) => line !== "" && line !== undefined).join("\r\n");
  const subject = fill(t.mailSubject, details);
  return `mailto:${details.desk}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}\r\n`)}`;
}

function showResult(ctx) {
  const { result } = ctx.ui;
  const details = getDetails(ctx);
  result.ref.textContent = details.ref;
  result.desk.textContent = details.desk;
  result.wa.href = getWhatsAppHref(ctx, details);
  result.mail.href = getMailtoHref(ctx, details);
  result.root.hidden = false;
  result.title.focus();
}

/* ---------- Submit ---------- */

function validate(ctx) {
  const { form, refErr, emailErr, override } = ctx.ui;
  const refError = getRefError(ctx, form.elements.ref.value);
  const emailError = getEmailError(ctx, form.elements.email.value.trim());
  setError(form.elements.ref, refErr, refError?.message || "");
  setError(form.elements.email, emailErr, emailError);
  override.hidden = !refError?.canOverride;
  ctx.isFlagged = Boolean(refError || emailError);
  return refError ? form.elements.ref : emailError ? form.elements.email : null;
}

function handleSubmit(event, ctx) {
  event.preventDefault();
  const invalid = validate(ctx);
  if (invalid) {
    ctx.ui.result.root.hidden = true;
    invalid.focus();
    return;
  }
  showResult(ctx);
}

function handleOverride(ctx) {
  ctx.allowAnyRef = true;
  ctx.ui.form.requestSubmit();
}

function getUi(form) {
  const result = document.querySelector("[data-track-result]");
  return {
    form,
    refErr: form.querySelector("#t-ref-err"),
    emailErr: form.querySelector("#t-email-err"),
    override: form.querySelector("[data-track-override]"),
    result: {
      root: result,
      title: result.querySelector("[data-track-title]"),
      ref: result.querySelector("[data-track-ref]"),
      desk: result.querySelector("[data-track-desk]"),
      wa: result.querySelector("[data-track-wa]"),
      mail: result.querySelector("[data-track-mail]"),
    },
  };
}

function initTrackForm() {
  const form = document.querySelector("[data-track-form]");
  if (!form) return;
  const strings = JSON.parse(document.getElementById(form.dataset.strings).textContent);
  const ctx = { strings, ui: getUi(form), allowAnyRef: false, isFlagged: false };
  form.addEventListener("submit", (event) => handleSubmit(event, ctx));
  ctx.ui.override.addEventListener("click", () => handleOverride(ctx));
  form.elements.ref.addEventListener("input", () => {
    ctx.allowAnyRef = false;
    ctx.ui.result.root.hidden = true;
    if (ctx.isFlagged) validate(ctx);
  });
  form.addEventListener("change", () => {
    if (!ctx.ui.result.root.hidden) showResult(ctx);
  });
}

initTrackForm();
