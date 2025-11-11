import { createServer, } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListResourceTemplatesRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { OpenFinanceClient, } from "./openfinanceClient.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const widgetsDistDir = path.resolve(projectRoot, "apps/widgets/dist");
const port = Number.parseInt(process.env.MCP_PORT ?? "9035", 10);
const starterKitBase = process.env.STARTER_KIT_BASE_URL ?? "http://localhost:1411";
const publicBase = (process.env.PUBLIC_BASE_URL ??
    `http://localhost:${port}`);
const normalizedPublicBase = publicBase.replace(/\/+$/, "");
const widgetBaseUrl = `${normalizedPublicBase}/widgets`;
const openFinanceClient = new OpenFinanceClient(starterKitBase);
function normalizeAssetReference(reference) {
    const withoutProtocol = reference.replace(/^https?:\/\/[^/]+/, "");
    const [pathPart] = withoutProtocol.split("?");
    const trimmed = pathPart.replace(/^\/+/, "");
    const safe = path.normalize(trimmed).replace(/^(\.\.(\/|\\|$))+/, "");
    return safe;
}
function resolveAssetFile(reference) {
    const relative = normalizeAssetReference(reference);
    const absolute = path.join(widgetsDistDir, relative);
    if (!absolute.startsWith(widgetsDistDir)) {
        throw new Error(`Asset reference "${reference}" resolves outside widget dist.`);
    }
    if (!existsSync(absolute)) {
        throw new Error(`Widget asset "${reference}" not found under ${widgetsDistDir}.`);
    }
    return absolute;
}
function rewriteCssAssetRefs(css, assetBase) {
    const normalized = assetBase.replace(/\/+$/, "");
    return css.replace(/url\((['"]?)(\/assets\/[^'")]+)\1\)/g, (_match, quote = "", assetPath) => `url(${quote}${normalized}${assetPath}${quote})`);
}
function rewriteJsAssetRefs(js, assetBase) {
    const normalized = assetBase.replace(/\/+$/, "");
    return js.replace(/(["'`])\/assets\//g, (_match, quote) => `${quote}${normalized}/assets/`);
}
async function inlineWidgetHtml(originalHtml, assetBase) {
    let html = originalHtml;
    const cssMatch = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/i);
    if (cssMatch) {
        const cssPath = resolveAssetFile(cssMatch[1]);
        let css = await readFile(cssPath, "utf8");
        css = rewriteCssAssetRefs(css, assetBase);
        html = html.replace(cssMatch[0], `<style data-inline="true">\n${css}\n</style>`);
    }
    const scriptMatch = html.match(/<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/i);
    if (scriptMatch) {
        const scriptPath = resolveAssetFile(scriptMatch[1]);
        let js = await readFile(scriptPath, "utf8");
        js = rewriteJsAssetRefs(js, assetBase);
        html = html.replace(scriptMatch[0], `<script type="module">\n${js}\n</script>`);
    }
    return html;
}
async function loadWidgetDescriptor() {
    const htmlPath = path.join(widgetsDistDir, "index.html");
    if (!existsSync(htmlPath)) {
        throw new Error(`Widget bundle not found at ${htmlPath}. Run "npm run build:widgets" from the project root.`);
    }
    const rawHtml = await readFile(htmlPath, "utf8");
    const html = await inlineWidgetHtml(rawHtml, widgetBaseUrl);
    return {
        id: "openfinance-consent-flow",
        title: "Consent + balance orchestrator",
        description: "Guided UI that walks through consent authorization and balance aggregation using the Open Finance starter kit.",
        templateUri: "ui://widget/openfinance/consent-flow",
        invoking: "Preparing consent orchestrator",
        invoked: "Consent orchestrator ready",
        html,
    };
}
const consentWidget = await loadWidgetDescriptor();
const widgets = [consentWidget];
const widgetsByUri = new Map(widgets.map((widget) => [widget.templateUri, widget]));
function widgetDescriptorMeta(widget) {
    return {
        "openai/outputTemplate": widget.templateUri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": true,
        "openai/resultCanProduceWidget": true,
    };
}
function widgetInvocationMeta(widget) {
    return {
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
    };
}
const resources = widgets.map((widget) => ({
    uri: widget.templateUri,
    name: widget.title,
    description: widget.description,
    mimeType: "text/html+skybridge",
    _meta: widgetDescriptorMeta(widget),
}));
const resourceTemplates = widgets.map((widget) => ({
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
const registerSchema = z.object({});
const clientCredentialsSchema = z.object({
    scope: z
        .string()
        .trim()
        .refine((value) => scopeOptions.includes(value), "Scope must match an allowed Open Finance combination.")
        .default("openid accounts"),
});
const consentSchema = z.object({
    maxPaymentAmount: z
        .string()
        .regex(/^(?:0|[1-9]\d*)(?:\.\d{2})$/, "Use a value like 250.00")
        .default("250.00"),
});
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
function describeSummary(summary) {
    if (summary.totals.length === 0) {
        return "No balances were returned by the API.";
    }
    const totals = summary.totals
        .map((item) => `${item.amount.toFixed(2)} ${item.currency.toUpperCase()}`)
        .join(", ");
    return `Aggregated balances across ${summary.accounts.length} account(s): ${totals}.`;
}
function asToolResult(message, payload) {
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
const toolDefinitions = new Map();
function registerTool(definition) {
    toolDefinitions.set(definition.spec.name, definition);
    return definition.spec;
}
const tools = [
    registerTool({
        spec: {
            name: "openfinance.register",
            title: "Register TPP",
            description: "Calls the /register endpoint from the starter kit to initiate or refresh your TPP registration.",
            inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
            annotations: {
                destructiveHint: false,
                openWorldHint: false,
                readOnlyHint: true,
            },
        },
        schema: registerSchema,
        invoke: async () => {
            const payload = await openFinanceClient.register();
            return asToolResult("Starter kit registration payload retrieved.", payload);
        },
    }),
    registerTool({
        spec: {
            name: "openfinance.clientCredentials",
            title: "Client credentials token",
            description: "Exchange client credentials for a scoped access token.",
            inputSchema: {
                type: "object",
                properties: {
                    scope: {
                        type: "string",
                        enum: scopeOptions,
                        description: "OAuth scope to request.",
                    },
                },
                required: ["scope"],
                additionalProperties: false,
            },
        },
        schema: clientCredentialsSchema,
        invoke: async (raw) => {
            const args = clientCredentialsSchema.parse(raw);
            const payload = await openFinanceClient.clientCredentials(args.scope);
            return asToolResult(`Issued client-credential token for scope "${args.scope}".`, payload);
        },
    }),
    registerTool({
        spec: {
            name: "openfinance.createConsent",
            title: "Create consent",
            description: "Build a variable-on-demand consent and receive the redirect link + PKCE verifier.",
            inputSchema: {
                type: "object",
                properties: {
                    maxPaymentAmount: {
                        type: "string",
                        description: "Maximum amount per payment in AED (e.g. 250.00).",
                    },
                },
                required: ["maxPaymentAmount"],
                additionalProperties: false,
            },
        },
        schema: consentSchema,
        invoke: async (raw) => {
            const args = consentSchema.parse(raw);
            const payload = await openFinanceClient.createConsent(args.maxPaymentAmount);
            return asToolResult("Consent created. Redirect URL and verifier returned.", payload);
        },
    }),
    registerTool({
        spec: {
            name: "openfinance.exchangeAuthorizationCode",
            title: "Exchange authorization code",
            description: "Call the /token/authorization-code endpoint with a code + verifier to produce an access token.",
            inputSchema: {
                type: "object",
                properties: {
                    code: {
                        type: "string",
                        description: "Authorization code returned by the redirect.",
                    },
                    codeVerifier: {
                        type: "string",
                        description: "PKCE verifier that was issued during consent.",
                    },
                },
                required: ["code", "codeVerifier"],
                additionalProperties: false,
            },
        },
        schema: exchangeSchema,
        invoke: async (raw) => {
            const args = exchangeSchema.parse(raw);
            const payload = await openFinanceClient.exchangeAuthorizationCode(args.code, args.codeVerifier);
            return asToolResult("Authorization code exchanged for account access.", payload);
        },
    }),
    registerTool({
        spec: {
            name: "openfinance.aggregateBalances",
            title: "Aggregate balances",
            description: "Fetches accounts + balances from the starter kit APIs and returns an aggregated summary.",
            inputSchema: {
                type: "object",
                properties: {
                    accessToken: {
                        type: "string",
                        description: "Access token with accounts scope.",
                    },
                },
                required: ["accessToken"],
                additionalProperties: false,
            },
        },
        schema: aggregateSchema,
        invoke: async (raw) => {
            const args = aggregateSchema.parse(raw);
            const summary = await openFinanceClient.aggregateBalances(args.accessToken);
            return {
                content: [
                    {
                        type: "text",
                        text: describeSummary(summary),
                    },
                ],
                structuredContent: summary,
            };
        },
    }),
    registerTool({
        spec: {
            name: "openfinance.launchConsentFlow",
            title: "Launch guided consent flow",
            description: "Returns the consent + balance widget so you can run the entire flow inside ChatGPT.",
            inputSchema: {
                type: "object",
                properties: {
                    scope: {
                        type: "string",
                        description: "Optional OAuth scope to prefill inside the widget.",
                    },
                    maxPaymentAmount: {
                        type: "string",
                        description: "Optional amount to seed the widget with.",
                    },
                },
                additionalProperties: false,
            },
            _meta: widgetDescriptorMeta(consentWidget),
        },
        schema: widgetSchema,
        invoke: async (raw) => {
            const args = widgetSchema.parse(raw ?? {});
            return {
                content: [
                    {
                        type: "text",
                        text: "Embedded consent + balance UI ready.",
                    },
                ],
                structuredContent: {
                    starterKitBaseUrl: starterKitBase,
                    scope: args.scope ?? "openid accounts",
                    maxPaymentAmount: args.maxPaymentAmount ?? "250.00",
                },
                _meta: widgetInvocationMeta(consentWidget),
            };
        },
    }),
];
function createMcpServer() {
    const server = new Server({
        name: "openfinance-mcp",
        version: "0.1.0",
    }, {
        capabilities: {
            tools: {},
            resources: {},
        },
    });
    server.setRequestHandler(ListToolsRequestSchema, async (_request) => ({
        tools,
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const handler = toolDefinitions.get(request.params.name);
        if (!handler) {
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
        const args = handler.schema.parse(request.params.arguments ?? {});
        return handler.invoke(args);
    });
    server.setRequestHandler(ListResourcesRequestSchema, async (_request) => ({
        resources,
    }));
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async (_request) => ({
        resourceTemplates,
    }));
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
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
    });
    return server;
}
const sessions = new Map();
const ssePath = "/mcp";
const postPath = "/mcp/messages";
async function handleSse(res) {
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
    }
    catch (error) {
        sessions.delete(transport.sessionId);
        console.error("Failed to start SSE session", error);
        if (!res.headersSent) {
            res.writeHead(500).end("Failed to establish SSE connection");
        }
    }
}
async function handlePostMessage(req, res, url) {
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
    }
    catch (error) {
        console.error("Failed to process message", error);
        if (!res.headersSent) {
            res.writeHead(500).end("Failed to process message");
        }
    }
}
function contentTypeFor(filePath) {
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
function serveStaticAsset(pathname, res) {
    const relative = pathname.replace(/^\/widgets\/?/, "");
    if (!relative) {
        res.writeHead(404).end("Not found");
        return;
    }
    const safeRelative = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.join(widgetsDistDir, safeRelative);
    if (!filePath.startsWith(widgetsDistDir)) {
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
        }
        else {
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
    if (req.method === "OPTIONS" &&
        (url.pathname === ssePath || url.pathname === postPath)) {
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
    if (req.method === "GET" && url.pathname.startsWith("/widgets/")) {
        serveStaticAsset(url.pathname, res);
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
    console.log(`Messages endpoint: POST ${normalizedPublicBase}${postPath}?sessionId=<id>`);
    console.log(`Widget assets served from ${widgetBaseUrl}`);
    console.log(`Starter kit base: ${starterKitBase}`);
});
