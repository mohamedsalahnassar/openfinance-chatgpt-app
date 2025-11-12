const namespace = "starter-kit";

const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
};

const formatMeta = (meta) => {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }
  return ` | ${safeStringify(meta)}`;
};

const logEvent = (level, message, meta) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${namespace}] [${level}] ${message}${formatMeta(
    meta
  )}`;
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
};

export const summarizePayload = (payload, depth = 0) => {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === "string") {
    if (payload.length > 140) {
      return `${payload.slice(0, 120)}… (${payload.length} chars)`;
    }
    return payload;
  }
  if (typeof payload !== "object") {
    return payload;
  }
  if (depth > 2) {
    return Array.isArray(payload) ? `[array len=${payload.length}]` : "[object]";
  }
  if (Array.isArray(payload)) {
    return payload.slice(0, 5).map((item) => summarizePayload(item, depth + 1));
  }
  const result = {};
  for (const [key, value] of Object.entries(payload)) {
    result[key] = summarizePayload(value, depth + 1);
  }
  return result;
};

export const logInfo = (message, meta) => logEvent("INFO", message, meta);
export const logWarn = (message, meta) => logEvent("WARN", message, meta);
export const logError = (message, meta) => logEvent("ERROR", message, meta);
export const logDebug = (message, meta) =>
  logEvent("DEBUG", message, meta ?? {});
