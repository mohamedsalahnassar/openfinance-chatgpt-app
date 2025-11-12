import { useMemo, useState } from "react";
import clsx from "clsx";

declare global {
  interface Window {
    __OPENFINANCE_API_BASE__?: string;
  }
}

const DEFAULT_BASE = "http://localhost:1411";

const runtimeBase =
  typeof window !== "undefined" ? window.__OPENFINANCE_API_BASE__ : undefined;

const API_BASE = (
  import.meta.env.VITE_STARTER_KIT_BASE_URL ??
  runtimeBase ??
  DEFAULT_BASE
).replace(/\/$/, "");

type StepStatus = "idle" | "loading" | "success" | "error";

type ConsentResponse = {
  redirect: string;
  consent_id: string;
  code_verifier: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

type BalanceItem = {
  currency: string;
  amount: number;
};

type AccountBalance = {
  accountId: string;
  name: string;
  balances: {
    type: string;
    amount: number;
    currency: string;
  }[];
};

type BalanceSummary = {
  totals: BalanceItem[];
  accounts: AccountBalance[];
};

async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  const hasBody =
    typeof init.body !== "undefined" && init.body !== null ? true : false;
  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const raw = await response.text();
  let data: any = null;

  if (raw && raw.length) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      data = raw;
    }
  }

  if (!response.ok) {
    const reason =
      typeof data === "string"
        ? data
        : data?.description ||
          data?.error ||
          data?.message ||
          response.statusText;
    throw new Error(reason);
  }

  return data as T;
}

const statusLabel: Record<StepStatus, string> = {
  idle: "Idle",
  loading: "Running...",
  success: "Completed",
  error: "Failed",
};

const scopes = [
  { label: "Accounts", value: "openid accounts" },
  { label: "Payments", value: "openid payments" },
  { label: "Accounts + Payments", value: "openid accounts payments" },
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
];

const toLocalDateTimeInputValue = (date: Date) => {
  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - tzOffsetMs);
  return localDate.toISOString().slice(0, 16);
};

function StatusBadge({ status }: { status: StepStatus }) {
  return (
    <span
      className={clsx(
        "status-badge",
        status === "success" && "status-success",
        status === "loading" && "status-loading",
        status === "error" && "status-error"
      )}
    >
      {statusLabel[status]}
    </span>
  );
}

export default function App() {
  const [registerStatus, setRegisterStatus] = useState<StepStatus>("idle");
  const [registerPayload, setRegisterPayload] = useState<object | null>(null);

  const [scope, setScope] = useState(scopes[0].value);
  const [clientStatus, setClientStatus] = useState<StepStatus>("idle");
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [clientPayload, setClientPayload] = useState<object | null>(null);

  const [maxPayment, setMaxPayment] = useState("250.00");
  const [consentStatus, setConsentStatus] = useState<StepStatus>("idle");
  const [consentPayload, setConsentPayload] = useState<ConsentResponse | null>(
    null
  );

  const [codeInput, setCodeInput] = useState("");
  const [codeVerifierInput, setCodeVerifierInput] = useState("");
  const [tokenStatus, setTokenStatus] = useState<StepStatus>("idle");
  const [tokenPayload, setTokenPayload] = useState<TokenResponse | null>(null);

  const [balanceStatus, setBalanceStatus] = useState<StepStatus>("idle");
  const [balancePayload, setBalancePayload] = useState<BalanceSummary | null>(
    null
  );
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [messages, setMessages] = useState<string[]>([]);

  const [dataConsentStatus, setDataConsentStatus] =
    useState<StepStatus>("idle");
  const [dataConsentPayload, setDataConsentPayload] =
    useState<ConsentResponse | null>(null);
  const [dataPermissions, setDataPermissions] = useState<string[]>([
    "ReadAccountsBasic",
    "ReadBalances",
    "ReadTransactionsBasic",
  ]);
  const [dataValidFrom, setDataValidFrom] = useState(
    toLocalDateTimeInputValue(new Date())
  );
  const [dataValidUntil, setDataValidUntil] = useState(
    toLocalDateTimeInputValue(
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    )
  );
  const [manualAccessToken, setManualAccessToken] = useState("");

  const recordMessage = (message: string) => {
    setMessages((prev) => [
      `${new Date().toLocaleTimeString()}: ${message}`,
      ...prev,
    ]);
  };

  const toggleDataPermission = (permission: string) => {
    setDataPermissions((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission]
    );
  };

  const toIso = (value: string) =>
    value ? new Date(value).toISOString() : undefined;

  const derivedAccessToken = useMemo(() => {
    if (manualAccessToken.trim()) return manualAccessToken.trim();
    if (tokenPayload?.access_token) return tokenPayload.access_token;
    if (clientToken) return clientToken;
    return null;
  }, [manualAccessToken, tokenPayload?.access_token, clientToken]);

  const handleRegister = async () => {
    setRegisterStatus("loading");
    try {
      const payload = await apiRequest<object>("/register", { method: "GET" });
      setRegisterPayload(payload);
      setRegisterStatus("success");
      recordMessage("TPP registration succeeded.");
    } catch (error) {
      setRegisterStatus("error");
      recordMessage(`Registration failed: ${(error as Error).message}`);
    }
  };

  const handleClientToken = async () => {
    setClientStatus("loading");
    try {
      const payload = await apiRequest<TokenResponse>(
        "/token/client-credentials",
        {
          method: "POST",
          body: JSON.stringify({ scope }),
        }
      );
      setClientPayload(payload);
      setClientToken(payload.access_token);
      setClientStatus("success");
      recordMessage("Client credentials token issued.");
    } catch (error) {
      setClientStatus("error");
      recordMessage(`Client credentials failed: ${(error as Error).message}`);
    }
  };

  const handleConsent = async () => {
    setConsentStatus("loading");
    try {
      const payload = await apiRequest<ConsentResponse>(
        "/consent-create/variable-on-demand-payments",
        {
          method: "POST",
          body: JSON.stringify({ max_payment_amount: maxPayment }),
        }
      );
      setConsentPayload(payload);
      setCodeVerifierInput(payload.code_verifier);
      setConsentStatus("success");
      recordMessage("Consent created. Launch the redirect link to authorize.");
    } catch (error) {
      setConsentStatus("error");
      recordMessage(`Consent creation failed: ${(error as Error).message}`);
    }
  };

  const handleDataSharingConsent = async () => {
    if (!dataPermissions.length) {
      recordMessage("Select at least one permission before creating consent.");
      setDataConsentStatus("error");
      return;
    }
    setDataConsentStatus("loading");
    try {
      const isoFrom = toIso(dataValidFrom);
      const isoUntil = toIso(dataValidUntil);
      const payload = await apiRequest<ConsentResponse>(
        "/consent-create/bank-data",
        {
          method: "POST",
          body: JSON.stringify({
            data_permissions: dataPermissions,
            ...(isoFrom && { valid_from: isoFrom }),
            ...(isoUntil && { valid_until: isoUntil }),
          }),
        }
      );
      setDataConsentPayload(payload);
      setCodeVerifierInput(payload.code_verifier);
      setDataConsentStatus("success");
      recordMessage("Data sharing consent created.");
    } catch (error) {
      setDataConsentStatus("error");
      recordMessage(
        `Data sharing consent failed: ${(error as Error).message}`
      );
    }
  };

  const handleExchangeCode = async () => {
    setTokenStatus("loading");
    try {
      const payload = await apiRequest<TokenResponse>(
        "/token/authorization-code",
        {
          method: "POST",
          body: JSON.stringify({
            code: codeInput.trim(),
            code_verifier: codeVerifierInput.trim(),
          }),
        }
      );
      setTokenPayload(payload);
      setTokenStatus("success");
      recordMessage("Authorization code exchanged for access token.");
    } catch (error) {
      setTokenStatus("error");
      recordMessage(
        `Authorization code exchange failed: ${(error as Error).message}`
      );
    }
  };

  const handleBalances = async () => {
    if (!derivedAccessToken) {
      setBalanceError("No access token available. Complete the consent flow.");
      setBalanceStatus("error");
      return;
    }
    setBalanceError(null);
    setBalanceStatus("loading");
    try {
      const headers = {
        Authorization: `Bearer ${derivedAccessToken}`,
      };
      const accountsData = await apiRequest<any>(
        "/open-finance/account-information/v1.2/accounts",
        {
          method: "GET",
          headers,
        }
      );

      const accounts = accountsData?.Data?.Account ?? [];
      const balances: BalanceSummary = {
        totals: [],
        accounts: [],
      };

      const totals = new Map<string, number>();

      const perAccount = await Promise.all(
        accounts.map(async (account: any) => {
          const accountId = account?.AccountId ?? account?.account_id;
          if (!accountId) return null;
          const balancePayload = await apiRequest<any>(
            `/open-finance/account-information/v1.2/accounts/${accountId}/balances`,
            {
              method: "GET",
              headers,
            }
          );
          const rows: AccountBalance["balances"] = [];
          const lines = balancePayload?.Data?.Balance ?? [];
          lines.forEach((line: any) => {
            const amount = Number(line?.Amount?.Amount);
            const currency = line?.Amount?.Currency ?? "AED";
            if (Number.isFinite(amount)) {
              totals.set(currency, (totals.get(currency) ?? 0) + amount);
              rows.push({
                type: line?.Type ?? "Balance",
                amount,
                currency,
              });
            }
          });

          return {
            accountId,
            name:
              account?.Nickname ||
              account?.Account?.Name ||
              account?.ProductName ||
              accountId,
            balances: rows,
          } as AccountBalance;
        })
      );

      balances.accounts = perAccount.filter(
        (acc): acc is AccountBalance => Boolean(acc)
      );
      balances.totals = Array.from(totals.entries()).map(
        ([currency, amount]) => ({
          currency,
          amount,
        })
      );

      setBalancePayload(balances);
      setBalanceStatus("success");
      recordMessage("Balances aggregated across accounts.");
    } catch (error) {
      setBalanceStatus("error");
      const message = (error as Error).message;
      setBalanceError(message);
      recordMessage(`Balance aggregation failed: ${message}`);
    }
  };

  const manualTokenActive = manualAccessToken.trim().length > 0;

  const primaryBalanceToken = derivedAccessToken
    ? `${derivedAccessToken.slice(0, 8)}…${derivedAccessToken.slice(-4)}`
    : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Open Finance Hackathon</p>
          <h1>Consent + Balance Orchestrator</h1>
          <p className="lede">
            Use the starter kit APIs inside ChatGPT. Each card mirrors an API
            surface exposed through the MCP server so you can walk through the
            consent and aggregation experience without leaving the thread.
          </p>
        </div>
        <div className="header-meta">
          <span className="meta-label">API base</span>
          <strong>{API_BASE}</strong>
        </div>
      </header>

      <section className="grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>1. Register your TPP profile</h2>
              <p>Calls the `/register` endpoint to bootstrap credentials.</p>
            </div>
            <StatusBadge status={registerStatus} />
          </div>
          <button
            className="primary"
            onClick={handleRegister}
            disabled={registerStatus === "loading"}
          >
            Request registration
          </button>
          {registerPayload && (
            <pre className="payload">
              {JSON.stringify(registerPayload, null, 2)}
            </pre>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>2. Request a client credentials token</h2>
              <p>Select the OAuth scope and mint a TPP token.</p>
            </div>
            <StatusBadge status={clientStatus} />
          </div>
          <label className="field">
            <span>Scope</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              {scopes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} ({item.value})
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            onClick={handleClientToken}
            disabled={clientStatus === "loading"}
          >
            Exchange credentials
          </button>
          {clientPayload && (
            <pre className="payload">
              {JSON.stringify(clientPayload, null, 2)}
            </pre>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>3A. Create payment consent + redirect</h2>
              <p>Generate a consent record and PKCE verifier.</p>
            </div>
            <StatusBadge status={consentStatus} />
          </div>
          <label className="field">
            <span>Maximum per payment (AED)</span>
            <input
              value={maxPayment}
              onChange={(event) => setMaxPayment(event.target.value)}
              placeholder="250.00"
            />
          </label>
          <div className="actions">
            <button
              className="primary"
              onClick={handleConsent}
              disabled={consentStatus === "loading"}
            >
              Build consent
            </button>
            <button
              className="ghost"
              disabled={!consentPayload?.redirect}
              onClick={() => {
                if (consentPayload?.redirect) {
                  window.open(consentPayload.redirect, "_blank");
                }
              }}
            >
              Open redirect
            </button>
          </div>
          {consentPayload && (
            <div className="consent-details">
              <div>
                <span className="meta-label">Consent</span>
                <strong>{consentPayload.consent_id}</strong>
              </div>
              <div>
                <span className="meta-label">Code verifier</span>
                <code>{consentPayload.code_verifier}</code>
              </div>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>3B. Create data sharing consent</h2>
              <p>
                Select data scopes and a validity window for account access
                sharing.
              </p>
            </div>
            <StatusBadge status={dataConsentStatus} />
          </div>
          <div className="permission-grid">
            {dataPermissionOptions.map((permission) => {
              const selected = dataPermissions.includes(permission);
              return (
                <label
                  key={permission}
                  className={clsx(
                    "permission-chip",
                    selected && "permission-chip-selected"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleDataPermission(permission)}
                  />
                  <span>{permission}</span>
                </label>
              );
            })}
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Valid from</span>
              <input
                type="datetime-local"
                value={dataValidFrom}
                onChange={(event) => setDataValidFrom(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Valid until</span>
              <input
                type="datetime-local"
                value={dataValidUntil}
                onChange={(event) => setDataValidUntil(event.target.value)}
              />
            </label>
          </div>
          <div className="actions">
            <button
              className="primary"
              onClick={handleDataSharingConsent}
              disabled={dataConsentStatus === "loading"}
            >
              Create data consent
            </button>
            <button
              className="ghost"
              disabled={!dataConsentPayload?.redirect}
              onClick={() => {
                if (dataConsentPayload?.redirect) {
                  window.open(dataConsentPayload.redirect, "_blank");
                }
              }}
            >
              Open redirect
            </button>
          </div>
          {dataConsentPayload && (
            <div className="consent-details">
              <div>
                <span className="meta-label">Consent</span>
                <strong>{dataConsentPayload.consent_id}</strong>
              </div>
              <div>
                <span className="meta-label">Code verifier</span>
                <code>{dataConsentPayload.code_verifier}</code>
              </div>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>4. Exchange authorization code</h2>
              <p>Paste the `code` returned by the redirect.</p>
            </div>
            <StatusBadge status={tokenStatus} />
          </div>
          <label className="field">
            <span>Authorization code</span>
            <input
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder="code from callback"
            />
          </label>
          <label className="field">
            <span>Code verifier</span>
            <input
              value={codeVerifierInput}
              onChange={(event) => setCodeVerifierInput(event.target.value)}
              placeholder="auto-filled once consent is created"
            />
          </label>
          <button
            className="primary"
            onClick={handleExchangeCode}
            disabled={tokenStatus === "loading"}
          >
            Exchange for access token
          </button>
          {tokenPayload && (
            <pre className="payload">
              {JSON.stringify(tokenPayload, null, 2)}
            </pre>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>5. Aggregate balances</h2>
              <p>Uses the starter kit account information APIs.</p>
            </div>
            <StatusBadge status={balanceStatus} />
          </div>
          <label className="field">
            <span>Manual access token (optional override)</span>
            <input
              value={manualAccessToken}
              onChange={(event) => setManualAccessToken(event.target.value)}
              placeholder="Paste token captured from redirect"
            />
          </label>
          {manualTokenActive && (
            <p className="info-text">
              Manual token override active — steps 2 and 4 can be skipped.
            </p>
          )}
          <button
            className="primary"
            onClick={handleBalances}
            disabled={balanceStatus === "loading"}
          >
            Fetch balances
          </button>

          {primaryBalanceToken && (
            <p className="token-chip">
              Using token <code>{primaryBalanceToken}</code>
            </p>
          )}

          {balanceError && (
            <p className="error-text">Error: {balanceError}</p>
          )}

          {balancePayload && (
            <div className="balance-grid">
              <div>
                <span className="meta-label">Per currency</span>
                <ul>
                  {balancePayload.totals.map((item) => (
                    <li key={item.currency}>
                      <strong>
                        {item.amount.toFixed(2)} {item.currency}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="meta-label">Accounts</span>
                <ul className="account-list">
                  {balancePayload.accounts.map((account) => (
                    <li key={account.accountId}>
                      <p className="account-name">{account.name}</p>
                      {account.balances.map((entry, index) => (
                        <p className="account-balance" key={index}>
                          {entry.type}: {entry.amount.toFixed(2)}{" "}
                          {entry.currency}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>Activity log</h2>
            <p>Everything the widget has done in this session.</p>
          </div>
        </div>
        {messages.length === 0 ? (
          <p className="lede muted">No activity yet.</p>
        ) : (
          <ul className="log">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
