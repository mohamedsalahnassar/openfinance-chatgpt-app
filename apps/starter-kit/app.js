// app.js
import "../../loadEnv.js";
import express from 'express';
import cors from 'cors'
import { createServer as createViteServer } from "vite";
import swaggerUi from 'swagger-ui-express'
import fs from 'fs'
import YAML from "yaml";
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { logInfo, logError, summarizePayload } from './api/logger.js';
import { recordConsentCallback } from './api/services/consentStore.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔹 Import APIs
// register
import register from './api/routes/register.js'
// consent creation (oauth)
import consentCreate from './api/routes/consentCreate.js'
// token 
import tokens from './api/routes/tokens.js'
// resources
import bankData from './api/routes/bankData.js'
import paymentInitiation from './api/routes/paymentInitiation.js'
import productsAndLeads from './api/routes/productsAndLeads.js'
import confirmationOfPayee from './api/routes/confirmationOfPayee.js'
import authDebug from './api/routes/authDebug.js'
import consents from './api/routes/consents.js'
import dashboardAuto from './api/routes/dashboardAuto.js'




const starterKitPort =
  Number.parseInt(
    process.env.STARTER_KIT_PORT ?? process.env.PORT ?? "1411",
    10
  ) || 1411;
const mcpPortForProxy = process.env.MCP_PORT ?? "9035";
const MCP_TARGET =
  process.env.MCP_SERVER_URL || `http://localhost:${mcpPortForProxy}`;

const app = express();

app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

app.use(
  ['/mcp', '/mcp/messages', '/widgets', '/assets'],
  createProxyMiddleware({
    target: MCP_TARGET,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    pathRewrite: (_path, req) => req.originalUrl,
  })
);

const corsOptions = {
  origin: true,
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "authorization",
    "content-type",
    "x-requested-with",
    "accept",
    "ngrok-skip-browser-warning",
  ],
  maxAge: 600,
};

app.use(express.json());
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

const shouldLogRequest = (url = '') =>
  url.startsWith('/consent-create') ||
  url.startsWith('/token') ||
  url.startsWith('/register') ||
  url.startsWith('/open-finance');

app.use((req, res, next) => {
  if (!shouldLogRequest(req.originalUrl)) {
    return next();
  }
  const start = Date.now();
  logInfo(`→ ${req.method} ${req.originalUrl}`, {
    query: req.query,
    body: summarizePayload(req.body),
  });
  res.on('finish', () => {
    logInfo(`← ${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});


// API routes
app.use('', register);

app.use('/consent-create', consentCreate);
app.use('/token', tokens);

app.use('/open-finance/account-information/v1.2', bankData);
app.use('/open-finance/payment/v1.2', paymentInitiation);
app.use('/open-finance/product/v1.2', productsAndLeads);
app.use('/open-finance/confirmation-of-payee/v1.2', confirmationOfPayee);
app.use('', authDebug);
app.use('/consents', consents);
app.use('', dashboardAuto);

// Swagger UI
const file = fs.readFileSync("./api/swagger.yaml", "utf8");
const swaggerSpec = YAML.parse(file);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const pickFirstString = (value) => {
  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === "string");
  }
  return typeof value === "string" ? value : undefined;
};

const escapeHtml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

app.get("/client/callback", async (req, res, next) => {
  const code = pickFirstString(req.query.code);
  const state = pickFirstString(req.query.state);
  const err = pickFirstString(req.query.error);

  if (!code && !state && !err) {
    return next();
  }

  const normalizedQuery = {};
  for (const [key, rawValue] of Object.entries(req.query)) {
    if (Array.isArray(rawValue)) {
      normalizedQuery[key] = rawValue.join(",");
    } else if (rawValue !== undefined) {
      normalizedQuery[key] = rawValue;
    }
  }

  let persisted = false;
  try {
    await recordConsentCallback({
      code,
      state,
      issuer: pickFirstString(req.query.iss),
      error: err,
      errorDescription: pickFirstString(req.query.error_description),
      query: normalizedQuery,
    });
    persisted = true;
    logInfo("[callback] OAuth redirect captured", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
  } catch (error) {
    logError("[callback] Failed to persist OAuth redirect", {
      message: error.message,
    });
  }

  const acceptsJson = req.accepts(["json", "html"]) === "json";
  const responsePayload = {
    status: err ? "error" : "ok",
    persisted,
    code,
    state,
    error: err,
    issuer: pickFirstString(req.query.iss),
  };
  const shouldAutoClose = !err && Boolean(code);
  const autoCloseScript = shouldAutoClose
    ? `<script>
        setTimeout(() => {
          try { window.close(); } catch (_) {}
        }, 5000);
      </script>`
    : "";

  if (acceptsJson) {
    return res.status(err ? 400 : 200).json(responsePayload);
  }

  const codeBlock = code
    ? `<p><strong>Code:</strong> <code>${escapeHtml(code)}</code></p>`
    : "";
  const errorBlock = err
    ? `<p><strong>Error:</strong> <code>${escapeHtml(err)}</code></p>`
    : "";
  const stateValue = escapeHtml(state ?? "N/A");
  const issuerValue = escapeHtml(pickFirstString(req.query.iss) ?? "unknown");

  const template = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Authorization callback</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #0b1220; color: #f4f6fb; }
      .card { max-width: 540px; padding: 32px; border-radius: 18px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
      .status-ok { color: #4ade80; }
      .status-error { color: #f87171; }
      code { font-size: 0.95rem; background: rgba(255,255,255,0.08); padding: 4px 6px; border-radius: 6px; word-break: break-all; }
      .meta { margin-top: 18px; font-size: 0.9rem; opacity: 0.85; }
      a { color: #93c5fd; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 class="${err ? "status-error" : "status-ok"}">
        ${err ? "Callback received with an error" : "Authorization callback captured"}
      </h1>
      <p>
        You can close this tab and return to your Open Finance session.
        The authorization response has been ${persisted ? "stored in Supabase." : "processed locally."}
      </p>
      ${codeBlock}
      ${errorBlock}
      <p><strong>State:</strong> <code>${stateValue}</code></p>
      <div class="meta">
        <p>Issuer: <code>${issuerValue}</code></p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      </div>
      <p class="meta">
        Need to inspect the raw payload? Append <code>Accept: application/json</code> to this request for a JSON response.
      </p>
      ${autoCloseScript}
    </div>
  </body>
</html>
  `.trim();

  res.status(err ? 400 : 200).setHeader("Content-Type", "text/html").send(template);
});

// client
// Vite middleware setup (dev mode)
const vite = await createViteServer({
  server: { middlewareMode: true },
  root: path.join(__dirname, "./client"),
  appType: "custom", // don't serve index.html automatically
});

app.use(vite.middlewares);


// Let Vite handle /client routes
app.use(async (req, res, next) => {
  try {
    // Serve index.html for any route under /client (including deep links)
    if (!req.originalUrl.startsWith("/client")) return next();

    const templatePath = path.join(vite.config.root, "index.html");
    let template = await fs.promises.readFile(templatePath, "utf-8");

    // Let Vite transform index.html (for dev mode, HMR, env vars, etc.)
    template = await vite.transformIndexHtml(req.originalUrl, template);

    res.status(200).set({ "Content-Type": "text/html" }).end(template);
  } catch (err) {
    vite.ssrFixStacktrace(err);
    next(err);
  }
});

// Start server
const PORT = starterKitPort;
app.use((err, req, res, next) => {
  logError(`Unhandled error on ${req.method} ${req.originalUrl}`, {
    message: err.message,
    stack: err.stack,
  });
  res
    .status(err.status || 500)
    .json({ error: err.message || 'Internal server error' });
});

const server = app.listen(PORT, () =>
  logInfo(`Starter kit listening`, {
    port: PORT,
    proxyingMcpTarget: MCP_TARGET,
  })
);

let shuttingDown = false;
const terminate = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo(`Starter kit shutting down`, { signal });
  const timeout = setTimeout(() => {
    logError(`Force exiting after shutdown timeout`, { signal });
    process.exit(1);
  }, 5000);
  timeout.unref();

  server.close((error) => {
    if (error) {
      logError(`Error closing starter kit server`, { message: error.message });
      process.exit(1);
    }
    clearTimeout(timeout);
    logInfo(`Starter kit server closed`);
    process.exit(0);
  });
};

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => terminate(signal));
});
