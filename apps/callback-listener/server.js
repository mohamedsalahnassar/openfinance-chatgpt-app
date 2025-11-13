import "../../loadEnv.js";
import { createServer } from "node:http";
import { URL } from "node:url";

import { logInfo, logError } from "../starter-kit/api/logger.js";
import { recordConsentCallback } from "../starter-kit/api/services/consentStore.js";

const CALLBACK_PATH = "/client/callback";
const CALLBACK_PORT = Number.parseInt(
  process.env.CALLBACK_LISTENER_PORT ?? "1411",
  10
);

const pickQueryValues = (searchParams) => {
  const map = {};
  searchParams.forEach((value, key) => {
    if (map[key]) {
      map[key] = Array.isArray(map[key])
        ? [...map[key], value]
        : [map[key], value];
    } else {
      map[key] = value;
    }
  });
  return map;
};

const escapeHtml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const responseTemplate = ({
  code,
  state,
  issuer,
  error,
  persisted,
}) => {
  const status = error
    ? "Callback received with an error"
    : "Authorization callback captured";
  const toneClass = error ? "status-error" : "status-ok";
  const autoCloseScript =
    !error && code
      ? `<script>
          setTimeout(() => {
            try { window.close(); } catch (_) {}
          }, 5000);
        </script>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Authorization callback</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #030712; color: #f9fafb; }
      .card { max-width: 560px; padding: 32px; border-radius: 18px; background: rgba(15,23,42,0.9); border: 1px solid rgba(148,163,184,0.3); box-shadow: 0 25px 80px rgba(15,23,42,0.6); }
      .status-ok { color: #34d399; }
      .status-error { color: #fb7185; }
      code { font-size: 0.95rem; background: rgba(148,163,184,0.18); padding: 4px 6px; border-radius: 6px; word-break: break-all; }
      .meta { margin-top: 18px; font-size: 0.9rem; opacity: 0.85; }
      a { color: #93c5fd; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 class="${toneClass}">${status}</h1>
      <p>
        You can close this tab and return to your Open Finance session.
        The authorization response has been ${persisted ? "recorded in Supabase" : "processed locally"}.
      </p>
      ${code ? `<p><strong>Code:</strong> <code>${escapeHtml(code)}</code></p>` : ""}
      ${error ? `<p><strong>Error:</strong> <code>${escapeHtml(error)}</code></p>` : ""}
      <p><strong>State:</strong> <code>${escapeHtml(state ?? "N/A")}</code></p>
      <div class="meta">
        <p>Issuer: <code>${escapeHtml(issuer ?? "unknown")}</code></p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      </div>
      <p class="meta">
        Need JSON instead? Re-send the request with <code>Accept: application/json</code>.
      </p>
      ${autoCloseScript}
    </div>
  </body>
</html>`;
};

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? `localhost:${CALLBACK_PORT}`}`);

  if (url.pathname !== CALLBACK_PATH || req.method !== "GET") {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }

  const code = url.searchParams.get("code") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const issuer = url.searchParams.get("iss") ?? undefined;
  const err = url.searchParams.get("error") ?? undefined;
  const errorDescription = url.searchParams.get("error_description") ?? undefined;

  const querySnapshot = pickQueryValues(url.searchParams);
  let persisted = false;

  try {
    await recordConsentCallback({
      code,
      state,
      issuer,
      error: err,
      errorDescription,
      query: querySnapshot,
    });
    persisted = true;
    logInfo("[callback-listener] OAuth redirect captured", {
      codePresent: Boolean(code),
      statePresent: Boolean(state),
      issuer,
    });
  } catch (error) {
    logError("[callback-listener] Failed to persist OAuth redirect", {
      message: error?.message,
    });
  }

  if ((req.headers.accept ?? "").includes("application/json")) {
    res
      .writeHead(err ? 400 : 200, { "content-type": "application/json" })
      .end(
        JSON.stringify({
          status: err ? "error" : "ok",
          persisted,
          code,
          state,
          issuer,
          error: err,
          error_description: errorDescription,
        })
      );
    return;
  }

  res
    .writeHead(err ? 400 : 200, { "content-type": "text/html; charset=utf-8" })
    .end(
      responseTemplate({
        code,
        state,
        issuer,
        error: err,
        persisted,
      })
    );
});

server.listen(CALLBACK_PORT, () => {
  logInfo("[callback-listener] Ready", {
    port: CALLBACK_PORT,
    path: CALLBACK_PATH,
  });
});

const shutdown = (signal) => {
  logInfo("[callback-listener] Shutting down", { signal });
  server.close(() => {
    logInfo("[callback-listener] Closed");
    process.exit(0);
  });
};

["SIGINT", "SIGTERM"].forEach((signal) =>
  process.on(signal, () => shutdown(signal))
);
