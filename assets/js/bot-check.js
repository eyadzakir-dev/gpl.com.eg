// Bot check for the forms that post to Fabrik: an ALTCHA-style proof of work (open protocol, altcha.org).
// Fabrik hands out a signed challenge (GET /api/website/challenge on the form's endpoint host); the browser finds the
// number whose SHA-256 matches it and posts the answer as the "altcha" field. Nothing to click and no third party.
// Solving starts the first time the visitor touches the form, so it is done long before Submit.
// If Fabrik has no challenge to give (bot check off) or cannot be reached, the form posts without one and Fabrik decides.
// The same file lives in threestarsfashion.com and gpl.com.eg; keep them identical.

const CHALLENGE_PATH = "/api/website/challenge";
export const BOT_CHECK_FIELD = "altcha";
// Fabrik accepts a challenge for an hour; solve a fresh one after 45 minutes.
const REUSE_MS = 45 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
// Hashes started together. Parallel digests finish several times faster than one at a time.
const BATCH = 500;

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function findNumber(challenge) {
  for (let start = 0; start <= challenge.maxnumber; start += BATCH) {
    const end = Math.min(start + BATCH - 1, challenge.maxnumber);
    const numbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const hashes = await Promise.all(
      numbers.map((n) => crypto.subtle.digest("SHA-256", encoder.encode(`${challenge.salt}${n}`))),
    );
    const hit = hashes.findIndex((hash) => toHex(hash) === challenge.challenge);
    if (hit !== -1) return numbers[hit];
  }
  return null;
}

async function fetchChallenge(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(new URL(CHALLENGE_PATH, endpoint), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    return response.ok ? await response.json() : null;
  } finally {
    clearTimeout(timer);
  }
}

async function solve(endpoint) {
  if (!endpoint || !globalThis.crypto?.subtle) return "";
  const challenge = await fetchChallenge(endpoint);
  if (!challenge || typeof challenge.salt !== "string" || !Number.isInteger(challenge.maxnumber)) return "";
  const number = await findNumber(challenge);
  if (number === null) return "";
  const { algorithm, salt, signature } = challenge;
  return btoa(JSON.stringify({ algorithm, challenge: challenge.challenge, number, salt, signature }));
}

// getEndpoint returns the Fabrik URL the form posts to (empty on a local preview with none).
export function createBotCheck(form, getEndpoint) {
  let pending = null;
  let startedAt = 0;

  function start() {
    if (!pending || Date.now() - startedAt > REUSE_MS) {
      startedAt = Date.now();
      pending = solve(getEndpoint()).catch(() => "");
    }
    return pending;
  }

  form.addEventListener("focusin", start, { once: true });

  return {
    // The answer for this submit. Each answer is accepted once, so the next submit solves a new one.
    async take() {
      let answer = await start();
      // An early attempt that failed (offline for a moment) gets one fresh try at Submit.
      if (!answer) {
        pending = null;
        answer = await start();
      }
      pending = null;
      return answer;
    },
  };
}
