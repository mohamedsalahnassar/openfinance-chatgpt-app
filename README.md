# Open Finance ChatGPT App

This nested project packages the original Open Finance starter kit together with a Model Context Protocol (MCP) server and an Apps SDK-compatible widget so you can run the full consent → authorization → balance aggregation experience directly inside ChatGPT.

## Repository layout

```
openfinance-chatgpt-app/
├── package.json            # Workspace scripts (`npm run dev`, `npm run build:widgets`, …)
├── apps/
│   ├── starter-kit/        # Unmodified Open Finance starter kit (Express API + Vue/Vite client)
│   ├── widgets/            # Vite/React widget that drives the consent/balance UI
│   └── mcp-server/         # TypeScript MCP server exposing the starter-kit APIs + widget
└── README.md               # This file
```

## Requirements

- Node.js 20+ (the starter kit’s `engines` block lists 22.20.0/10.9.3 but works on Node 20 in practice)
- npm 10+
- macOS/Linux (the starter kit includes `.pem` certificates that the backend reads directly)

## Getting started

1. **Install dependencies** (installs all workspaces):

   ```bash
   cd openfinance-chatgpt-app
   npm install
   ```

2. **Build the widget bundle** (run whenever you edit `apps/widgets`):

   ```bash
   npm run build:widgets
   ```

3. **Run everything with a single command** – this starts the Express API (with the Vue client mounted under `/client`) and the MCP + widget asset server:

   ```bash
   npm run dev
   ```

   - Backend + Vite client: http://localhost:1411 (configurable via `PORT`)
   - MCP server + widget assets: http://localhost:9035 (configurable via `MCP_PORT`)

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `1411` | Express server port for the starter kit |
| `MCP_PORT` | `9035` | Port for the MCP SSE server and static widget assets |
| `STARTER_KIT_BASE_URL` | `http://localhost:1411` | URL the MCP server/wigdet uses when calling the backend APIs |
| `PUBLIC_BASE_URL` | `http://localhost:${MCP_PORT}` | The publicly reachable base URL for the MCP server (used to form widget asset URLs) |

Export any of these before running `npm run dev` if you need non-default ports or are tunneling through `ngrok`.

## MCP tooling

- **Tools exposed**: register TPP, mint client-credential tokens, create consent, exchange authorization codes, aggregate balances, and launch the embedded widget (`openfinance.launchConsentFlow`).
- **Widget metadata**: `ui://widget/openfinance/consent-flow` is returned via MCP resources so ChatGPT can fetch and render the Vite-built UI alongside assistant messages.
- **Static assets**: served from `http://localhost:9035/widgets/...` by the MCP server itself—no extra static server is required.

To add the connector in ChatGPT:

1. Build the widgets (`npm run build:widgets`) and start the stack (`npm run dev`).
2. Expose `http://localhost:9035` via a tunnel if ChatGPT cannot reach your local network (e.g., `ngrok http 9035`).
3. In ChatGPT developer mode, add a connector that points to `https://<your-tunnel>/mcp`.

## Widget flow overview

The React widget inside `apps/widgets` replicates the consent journey:

1. Register the TPP (`/register`).
2. Request a client-credential token with selectable scopes.
3. Create a variable-on-demand consent (returns redirect URL + PKCE verifier).
4. Exchange the authorization code for an access token.
5. Aggregate balances by calling the account-information APIs per account.

Each step persists responses, exposes helpers (open redirect link, copy verifier, etc.), and logs actions so you can keep context within the ChatGPT thread.

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Runs the starter kit (`apps/starter-kit`) and MCP server (`apps/mcp-server`) concurrently. |
| `npm run dev:kit` | Starts only the Express + Vite starter kit. |
| `npm run dev:mcp` | Starts only the MCP server (watches TypeScript files). |
| `npm run build:widgets` | Rebuilds the consent widget assets. |

## Notes & next steps

- The MCP server streams widget assets directly, so keep `npm run build:widgets` in sync with any UI changes.
- The starter kit is copied verbatim; update `apps/starter-kit/api/config.js` with your actual Open Finance credentials.
- Certificates under `apps/starter-kit/api/certificates` are the same ones from the official kit—replace with your own before going beyond sandbox testing.
