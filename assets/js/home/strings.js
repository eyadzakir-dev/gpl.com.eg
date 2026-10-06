// Reads the page's #home-strings JSON once and fills {name} placeholders (contract: top of assets/js/home.js).

let cache = null;

export function getStrings() {
  if (cache) return cache;
  const el = document.getElementById("home-strings");
  try {
    cache = el ? JSON.parse(el.textContent) : {};
  } catch (error) {
    console.error("Home: #home-strings is not valid JSON.", error);
    cache = {};
  }
  return cache;
}

export const getLocale = () => getStrings().locale || document.documentElement.lang || "en";

export function fill(template, values = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

/** Picks a plural form ({ one, other, … } keyed by Intl.PluralRules categories) for n. */
export function plural(forms, n) {
  const category = new Intl.PluralRules(getLocale()).select(n);
  return forms?.[category] ?? forms?.other ?? "";
}
