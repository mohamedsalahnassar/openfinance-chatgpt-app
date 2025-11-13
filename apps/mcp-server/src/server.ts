import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type ListResourceTemplatesRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  OpenFinanceClient,
  type BalanceSummary,
} from "./openfinanceClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const assetsRoot = path.resolve(projectRoot, "assets/openfinance-consent-flow");
const assetBundleDir = path.join(assetsRoot, "assets");

const port = Number.parseInt(process.env.MCP_PORT ?? "9035", 10);
const starterKitPort = Number.parseInt(
  process.env.STARTER_KIT_PORT ?? process.env.PORT ?? "1411",
  10
);
const starterKitBase = (process.env.STARTER_KIT_BASE_URL ??
  `http://localhost:${starterKitPort}`) as string;
const normalizedStarterKitBase = starterKitBase.replace(/\/+$/, "");
const publicBase = (process.env.PUBLIC_BASE_URL ??
  `http://localhost:${port}`) as string;
const normalizedPublicBase = publicBase.replace(/\/+$/, "");

const openFinanceClient = new OpenFinanceClient(starterKitBase);

function extractAssetRevision(fileName: string): string | null {
  const match = fileName.match(/-([a-z0-9]+)\.[^.]+$/i);
  return match?.[1] ?? null;
}

function ensureAssetDirectory() {
  if (!existsSync(assetBundleDir)) {
    throw new Error(
      `Widget assets not found in ${assetBundleDir}. Run "npm run build:widgets" from the project root.`
    );
  }
}

function findAssetFile(extension: string): string {
  ensureAssetDirectory();
  const entries = readdirSync(assetBundleDir);
  const match = entries.find(
    (entry) =>
      entry.startsWith("index-") &&
      entry.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
  );
  if (!match) {
    throw new Error(
      `Unable to locate ${extension} bundle in ${assetBundleDir}.`
    );
  }
  return match;
}

function escapeScriptContents(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

type WidgetAssetState = {
  revision: string;
  cssText: string;
  jsText: string;
};

function loadWidgetAssets(): WidgetAssetState {
  const cssFile = findAssetFile("css");
  const jsFile = findAssetFile("js");
  const cssPath = path.join(assetBundleDir, cssFile);
  const jsPath = path.join(assetBundleDir, jsFile);
  const cssText = readFileSync(cssPath, "utf8");
  const jsText = readFileSync(jsPath, "utf8");
  const revision =
    extractAssetRevision(jsFile) ??
    extractAssetRevision(cssFile) ??
    Date.now().toString(36);

  return {
    revision,
    cssText,
    jsText,
  };
}

const widgetAssets = loadWidgetAssets();

function buildWidgetHtml(variant?: string, apiBaseOverride?: string) {
  const apiBase = apiBaseOverride ?? normalizedStarterKitBase;
  return `
<div id="root"></div>
<style>${widgetAssets.cssText}</style>
<script>
window.__OPENFINANCE_API_BASE__ = ${JSON.stringify(apiBase)};
window.__OPENFINANCE_WIDGET_VARIANT__ = ${JSON.stringify(
    variant ?? "orchestrator"
  )};
</script>
<script type="module">
${escapeScriptContents(widgetAssets.jsText)}
</script>
`.trim();
}

type WidgetDescriptor = {
  id: string;
  title: string;
  templateUri: string;
  description: string;
  invoking: string;
  invoked: string;
  html: string;
};

const consentWidget: WidgetDescriptor = {
  id: "openfinance-consent-flow",
  title: "Consent + balance orchestrator",
  description:
    "Guided UI that walks through consent authorization and balance aggregation using the Open Finance starter kit.",
  templateUri: `ui://widget/openfinance/consent-flow?rev=${widgetAssets.revision}`,
  invoking: "Preparing consent orchestrator",
  invoked: "Consent orchestrator ready",
  html: buildWidgetHtml("consent-orchestrator"), // Fallback for static contexts
};

const dataWizardWidget: WidgetDescriptor = {
  id: "openfinance-data-wizard",
  title: "Data sharing wizard",
  description:
    "Step-by-step experience for bank selection, grouped permissions, consent redirect, and account aggregation.",
  templateUri: `ui://widget/openfinance/data-wizard?rev=${widgetAssets.revision}`,
  invoking: "Preparing data wizard",
  invoked: "Data wizard ready",
  html: buildWidgetHtml("data-wizard"), // Fallback for static contexts
};

const paymentWidget: WidgetDescriptor = {
  id: "openfinance-payment-wizard",
  title: "Open Finance Payment",
  description:
    "User-friendly payment flow that guides through amount entry, consent creation, bank authentication, and payment initiation with automatic data pre-filling.",
  templateUri: `ui://widget/openfinance/payment?rev=${widgetAssets.revision}`,
  invoking: "Preparing payment wizard",
  invoked: "Payment wizard ready",
  html: buildWidgetHtml("payment"), // Fallback for static contexts
};

const widgets = [consentWidget, dataWizardWidget, paymentWidget];
const widgetsByUri = new Map(widgets.map((widget) => [widget.templateUri, widget]));

function widgetDescriptorMeta(widget: WidgetDescriptor) {
  return {
    "openai/outputTemplate": widget.templateUri,
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
  } as const;
}

function widgetInvocationMeta(widget: WidgetDescriptor) {
  return {
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
  } as const;
}

const resources: Resource[] = widgets.map((widget) => ({
  uri: widget.templateUri,
  name: widget.title,
  description: widget.description,
  mimeType: "text/html+skybridge",
  _meta: widgetDescriptorMeta(widget),
}));

const resourceTemplates: ResourceTemplate[] = widgets.map((widget) => ({
  uriTemplate: widget.templateUri,
  name: widget.title,
  description: widget.description,
  mimeType: "text/html+skybridge",
  _meta: widgetDescriptorMeta(widget),
}));

const scopeOptions = [
  "confirmation-of-payee",
  "openid accounts",
  "openid payments",
  "openid accounts payments",
  "openid payments accounts",
  "openid products",
];

const dataPermissionOptions = [
  "ReadAccountsBasic",
  "ReadAccountsDetail",
  "ReadBalances",
  "ReadBeneficiariesBasic",
  "ReadBeneficiariesDetail",
  "ReadTransactionsBasic",
  "ReadTransactionsDetail",
  "ReadTransactionsCredits",
  "ReadTransactionsDebits",
  "ReadScheduledPaymentsBasic",
  "ReadScheduledPaymentsDetail",
  "ReadDirectDebits",
  "ReadStandingOrdersBasic",
  "ReadStandingOrdersDetail",
  "ReadConsents",
  "ReadPartyUser",
  "ReadPartyUserIdentity",
  "ReadParty",
] as const;
const dataPermissionEnum = z.enum(dataPermissionOptions);

const registerSchema = z.object({});
const clientCredentialsSchema = z.object({
  scope: z
    .string()
    .trim()
    .refine(
      (value) => scopeOptions.includes(value),
      "Scope must match an allowed Open Finance combination."
    )
    .default("openid accounts"),
});

const consentSchema = z.object({
  maxPaymentAmount: z
    .string()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{2})$/, "Use a value like 250.00")
    .default("250.00"),
});

const dataConsentSchema = z
  .object({
    permissions: z.array(dataPermissionEnum).nonempty("Select at least one permission"),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
  })
  .refine(
    (value) =>
      !value.validFrom ||
      !value.validUntil ||
      new Date(value.validFrom) < new Date(value.validUntil),
    {
      message: "validUntil must be later than validFrom",
      path: ["validUntil"],
    }
  );

const exchangeSchema = z.object({
  code: z.string().min(1, "code is required"),
  codeVerifier: z.string().min(1, "codeVerifier is required"),
});

const aggregateSchema = z.object({
  accessToken: z
    .string()
    .min(10, "Provide a valid access token")
    .describe("Access token returned by the authorization-code exchange"),
});

const widgetSchema = z.object({
  scope: z.string().optional(),
  maxPaymentAmount: z.string().optional(),
});

type ToolDefinition = {
  spec: Tool;
  schema: z.ZodTypeAny;
  invoke: (args: unknown) => Promise<CallToolResult>;
};

function describeSummary(summary: BalanceSummary): string {
  if (summary.totals.length === 0) {
    return "No balances were returned by the API.";
  }

  const totals = summary.totals
    .map(
      (item) => `${item.amount.toFixed(2)} ${item.currency.toUpperCase()}`
    )
    .join(", ");
  return `Aggregated balances across ${summary.accounts.length} account(s): ${totals}.`;
}

function asToolResult(message: string, payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    structuredContent: payload,
  };
}

const toolDefinitions = new Map<string, ToolDefinition>();

function registerTool(definition: ToolDefinition) {
  toolDefinitions.set(definition.spec.name, definition);
  return definition.spec;
}

const tools: Tool[] = [
  registerTool({
    spec: {
      name: "openfinance.launchConsentFlow",
      title: "Launch consent wizard",
      description:
        "Opens the new multi-step consent wizard: bank selection, grouped permissions, redirect launch, and balance aggregation.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      _meta: widgetDescriptorMeta(dataWizardWidget),
    },
    schema: z.object({}).passthrough(),
    invoke: async () => ({
      content: [
        {
          type: "text",
          text: "Data sharing wizard ready. Walk through the bank + consent steps below.",
        },
      ],
      structuredContent: {},
      _meta: widgetInvocationMeta(dataWizardWidget),
    }),
  }),
  registerTool({
    spec: {
      name: "openfinance.launchPaymentFlow",
      title: "Launch payment wizard",
      description:
        "Opens an intuitive payment flow for single instant payments through the AlTareq Model Bank. User enters payment amount, authorizes through the bank, and completes the payment with automatic data pre-filling between steps.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      _meta: widgetDescriptorMeta(paymentWidget),
    },
    schema: z.object({}).passthrough(),
    invoke: async () => ({
      content: [
        {
          type: "text",
          text: "Payment wizard ready. Let's initiate your Open Finance payment step by step.",
        },
      ],
      structuredContent: {},
      _meta: widgetInvocationMeta(paymentWidget),
    }),
  }),
];

function createMcpServer(): Server {
  const server = new Server(
    {
      name: "openfinance-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => ({
      tools,
    })
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      const handler = toolDefinitions.get(request.params.name);
      if (!handler) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }
      const args = handler.schema.parse(request.params.arguments ?? {});
      return handler.invoke(args);
    }
  );

  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => ({
      resources,
    })
  );

  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_request: ListResourceTemplatesRequest) => ({
      resourceTemplates,
    })
  );

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      const widget = widgetsByUri.get(request.params.uri);
      if (!widget) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }
      return {
        contents: [
          {
            uri: widget.templateUri,
            mimeType: "text/html+skybridge",
            text: widget.html,
            _meta: widgetDescriptorMeta(widget),
          },
        ],
      };
    }
  );

  return server;
}

type SessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();
const ssePath = "/mcp";
const postPath = "/mcp/messages";

async function handleSse(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const server = createMcpServer();
  const transport = new SSEServerTransport(postPath, res);
  sessions.set(transport.sessionId, { server, transport });

  transport.onclose = async () => {
    sessions.delete(transport.sessionId);
    await server.close();
  };

  transport.onerror = (error) => {
    console.error("SSE transport error", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sessions.delete(transport.sessionId);
    console.error("Failed to start SSE session", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    res.writeHead(400).end("Missing sessionId query parameter");
    return;
  }
  const session = sessions.get(sessionId);
  if (!session) {
    res.writeHead(404).end("Unknown session");
    return;
  }
  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Failed to process message", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to process message");
    }
  }
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath);
  switch (ext) {
    case ".js":
      return "text/javascript";
    case ".css":
      return "text/css";
    case ".html":
      return "text/html";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function serveInlinedWidget(res: ServerResponse, req: IncomingMessage, variant?: string | null) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
  // Dynamically inject the correct API base URL based on the request host
  let apiBaseUrl = normalizedStarterKitBase;
  
  // Check X-Forwarded-Host first (set by proxy), then fall back to Host header
  const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
  const host = forwardedHost || req.headers.host;
  
  // If accessed via a remote host (not localhost), use that host as the API base
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    const protocol = req.headers["x-forwarded-proto"] || "https";
    apiBaseUrl = `${protocol}://${host}`;
    console.log(`[MCP Server] Serving widget with remote API base: ${apiBaseUrl} (from ${forwardedHost ? 'X-Forwarded-Host' : 'Host'} header)`);
  }
  
  // Build the widget HTML with the dynamic API base
  // Support multiple widget variants: data-wizard, payment, or default to consent-orchestrator
  let variantName = "consent-orchestrator";
  if (variant === "data-wizard") {
    variantName = "data-wizard";
  } else if (variant === "payment") {
    variantName = "payment";
  }
  const dynamicHtml = buildWidgetHtml(variantName, apiBaseUrl);
  
  res.writeHead(200).end(dynamicHtml);
}

function serveBundledAsset(pathname: string, res: ServerResponse) {
  const relative = pathname.replace(/^\/assets\/?/, "");
  if (!relative) {
    res.writeHead(404).end("Not found");
    return;
  }
  const safeRelative = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(assetBundleDir, safeRelative);
  if (!filePath.startsWith(assetBundleDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", contentTypeFor(filePath));
  const stream = createReadStream(filePath);
  stream.on("error", (error) => {
    console.error("Failed to stream asset", filePath, error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to read asset");
    } else {
      res.destroy(error);
    }
  });
  stream.pipe(res);
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (
    req.method === "OPTIONS" &&
    (url.pathname === ssePath || url.pathname === postPath)
  ) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === ssePath) {
    await handleSse(res);
    return;
  }

  if (req.method === "POST" && url.pathname === postPath) {
    await handlePostMessage(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/widgets")) {
    serveInlinedWidget(res, req, url.searchParams.get("variant"));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
    serveBundledAsset(url.pathname, res);
    return;
  }

  res.writeHead(404).end("Not found");
});

httpServer.on("clientError", (err, socket) => {
  console.error("HTTP client error", err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

httpServer.listen(port, () => {
  console.log("Open Finance MCP server ready.");
  console.log(`HTTP base: ${normalizedPublicBase}`);
  console.log(`SSE stream: GET ${normalizedPublicBase}${ssePath}`);
  console.log(
    `Messages endpoint: POST ${normalizedPublicBase}${postPath}?sessionId=<id>`
  );
  console.log(`Widget assets directory: ${assetsRoot}`);
  console.log(`Starter kit base: ${normalizedStarterKitBase}`);
});
