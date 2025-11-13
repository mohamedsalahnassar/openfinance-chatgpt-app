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

1. **Copy the env template**:

   ```bash
   cp .env.example .env
   ```

   Update the values to match your tunnel (or localhost) and Supabase project. The repo currently ships with `.env` pre-populated for the provided ngrok + Supabase credentials—override them before sharing or committing elsewhere.

2. **Install dependencies** (installs all workspaces):

   ```bash
   cd openfinance-chatgpt-app
   npm install
   ```

3. **Build the widget bundle** (run whenever you edit `apps/widgets`):

   ```bash
   npm run build:widgets
   ```

4. **Run everything with a single command** – this starts the Express API (with the Vue client mounted under `/client`), the MCP + widget asset server, and the dedicated localhost callback listener. All runtime configuration now comes from `.env`, so you can just do:

   ```bash
   npm run dev
   ```

   - Backend + Vite client: http://localhost:1411 (configurable via `PORT`)
   - MCP server + widget assets: http://localhost:9035 (configurable via `MCP_PORT`)
   - Callback listener: http://localhost:1411/client/callback (always local via `CALLBACK_LISTENER_PORT`)

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `1411` | Express server port for the starter kit |
| `MCP_PORT` | `9035` | Port for the MCP SSE server and static widget assets |
| `STARTER_KIT_BASE_URL` | `http://localhost:1411` | URL the MCP server embeds inside the widget for API calls |
| `PUBLIC_BASE_URL` | `http://localhost:${MCP_PORT}` | Public base used for MCP logs & absolute URLs |
| `MCP_SERVER_URL` | `http://localhost:9035` | Target that the Express server proxies `/mcp`, `/widgets`, and `/assets` requests to (set this when the MCP server runs on a different host/port) |
| `SUPABASE_URL` | — | Supabase project URL used by the starter kit + MCP server when persisting consents |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Service-role key for inserts/updates (falls back to `SUPABASE_KEY` if only the anon key is available) |
| `SUPABASE_CONSENTS_TABLE` | `consent_sessions` | Table name for consent + callback snapshots |

> **Widget build target:** the React widget now follows the [OpenAI Apps Directory Kit](../OpenAI-Apps-Directory-Kit) pattern. `npm run build:widgets` outputs hashed bundles to `assets/openfinance-consent-flow/` and the MCP server inlines the CSS/JS when it responds to ChatGPT. To hit a hosted backend instead of `localhost`, pass `VITE_STARTER_KIT_BASE_URL` at build time:

```bash
VITE_STARTER_KIT_BASE_URL="https://<your-ngrok>.ngrok-free.app" npm run build:widgets
```

Export any of these before running `npm run dev` if you need non-default ports or are tunneling through `ngrok`.


### Supabase consent log

1. In Supabase → SQL editor, create the consent table:

```sql
create table if not exists public.consent_sessions (
  consent_id text primary key,
  consent_type text,
  bank_label text,
  redirect_url text,
  code_verifier text,
  status text,
  source text,
  metadata jsonb,
  auth_code text,
  issuer text,
  state_payload jsonb,
  callback_query jsonb,
  callback_error jsonb,
  callback_received_at timestamptz,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);
```

2. (Optional) Add a trigger to keep `updated_at` in sync, or manage it manually.
3. In Project Settings → API, copy the **Project URL** and the **service_role** key. Drop them into `.env` as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Start the stack with `npm run dev`. The starter kit backend, the MCP server, and the OAuth callback listener will automatically upsert rows into `consent_sessions`.

Every consent initiated via the Vue client or the MCP tools is logged when the redirect is generated, and enriched with the authorization code + issuer information as soon as the user returns to `http://localhost:1411/client/callback` (or whatever tunnel you expose).

### Dedicated localhost callback listener

If your main starter-kit instance is exposed via a tunnel (e.g., `https://<ngrok>`), but the bank sends users back to `http://localhost:1411/client/callback`, the lightweight listener keeps a localhost endpoint alive. It is started automatically when you run `npm run dev`, but you can launch it by itself for debugging:

```bash
npm run dev:callback
```

- Listens on `CALLBACK_LISTENER_PORT` (defaults to `1411`)
- Handles `GET /client/callback?code=...&state=...`
- Writes redirect metadata to Supabase via the shared consent store helper
- Returns either JSON (when `Accept: application/json`) or a confirmation HTML page

Keep this service running whenever you need a local callback endpoint in addition to the tunneled starter kit—`npm run dev` already takes care of it.


### Single ngrok endpoint (matching the OpenAI Apps Directory Kit flow)

1. Start everything locally with `npm run dev`. The Express app listens on port `1411`, proxies `/mcp`, `/mcp/messages`, `/widgets`, and `/assets` to the MCP server, and serves the starter-kit REST APIs.
2. Build the widget against the public URL that ngrok will expose (see the `VITE_STARTER_KIT_BASE_URL` example above) so the UI calls the HTTPS origin ChatGPT can reach.
3. Run `ngrok http 1411` and copy the HTTPS forwarding URL (for example, `https://<random>.ngrok-free.app`).
4. Add that URL to ChatGPT as both the API base and the MCP endpoint (`https://<ngrok>/mcp`). Because the widgets inline their JS/CSS (same approach as the Directory Kit), no additional static hosting is required.

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
| `npm run dev` | Runs the starter kit (`apps/starter-kit`), MCP server (`apps/mcp-server`), and the localhost callback listener together. |
| `npm run dev:kit` | Starts only the Express + Vite starter kit. |
| `npm run dev:mcp` | Starts only the MCP server (watches TypeScript files). |
| `npm run dev:callback` | Runs only the callback listener that serves `http://localhost:1411/client/callback`. |
| `npm run build:widgets` | Rebuilds the consent widget assets. |

## Notes & next steps

- The MCP server streams widget assets directly, so keep `npm run build:widgets` in sync with any UI changes.
- The starter kit is copied verbatim; update `apps/starter-kit/api/config.js` with your actual Open Finance credentials.
- Certificates under `apps/starter-kit/api/certificates` are the same ones from the official kit—replace with your own before going beyond sandbox testing.
