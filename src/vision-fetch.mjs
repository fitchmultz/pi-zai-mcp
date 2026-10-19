const originalFetch = globalThis.fetch.bind(globalThis);
const supportedModels = new Set(["glm-5.3-flash", "glm-5.3-flashx"]);
const completionsUrl = process.env.Z_AI_VISION_CHAT_COMPLETIONS_URL;
const configuredEffort = process.env.Z_AI_VISION_REASONING_EFFORT;

// ponytail: This isolated-child adapter depends on the vendor's JSON-string fetch request shape; remove it when the vendor exposes reasoning effort as configuration.
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function shouldSetEffort(value) {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.model !== "string" || !supportedModels.has(value.model)) {
    return false;
  }
  if (!isRecord(value.thinking) || value.thinking.type !== "enabled") {
    return false;
  }
  return value.reasoning_effort === undefined;
}

/** @param {Parameters<typeof globalThis.fetch>[0]} input @returns {string} */
function requestUrl(input) {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

/**
 * @param {Parameters<typeof globalThis.fetch>[0]} input
 * @param {Parameters<typeof globalThis.fetch>[1]} init
 * @returns {ReturnType<typeof globalThis.fetch>}
 */
function visionFetch(input, init) {
  if (completionsUrl === undefined || init?.method !== "POST" || typeof init.body !== "string") {
    return originalFetch(input, init);
  }

  if (requestUrl(input) !== completionsUrl) {
    return originalFetch(input, init);
  }

  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(init.body);
  } catch {
    return originalFetch(input, init);
  }
  if (!shouldSetEffort(body)) {
    return originalFetch(input, init);
  }

  return originalFetch(input, {
    ...init,
    body: JSON.stringify({ ...body, reasoning_effort: configuredEffort ?? "high" }),
  });
}

globalThis.fetch = visionFetch;
