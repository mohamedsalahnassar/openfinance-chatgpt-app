import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  API_BASE,
  apiRequest,
  BalanceSummary,
  ConsentResponse,
  TokenResponse,
} from "./lib/apiClient";

type StepStatus = "idle" | "loading" | "success" | "error";

type ConsentFlowType = "data" | "sip" | "vrp";

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

const consentFlowLabels: Record<ConsentFlowType, string> = {
  data: "Bank data sharing",
  sip: "Single instant payment",
  vrp: "Variable recurring payment",
};

const consentFlowSummaries: Record<ConsentFlowType, string[]> = {
  data: [
    "Share account balances, beneficiaries, transactions, and party data with the TPP.",
    "Use ISO 8601 timestamps to constrain how long data access remains active.",
    "Launch a redirect so the PSU can confirm the data sharing scope.",
  ],
  sip: [
    "Collect an authorization for one immediate payment to a predefined beneficiary.",
    "The amount must be provided in AED with two decimal places (e.g. 125.00).",
    "Redirect the PSU to confirm and release the payment.",
  ],
  vrp: [
    "Set controls for recurring 'variable on demand' payments for the same beneficiary.",
    "Use Maximum Individual Amount to cap each pull inside the consent window.",
    "Share balances scope automatically so you can run funds checks before initiating.",
  ],
};

const consentFlowOrder: ConsentFlowType[] = ["data", "sip", "vrp"];

const bankOptions = [
  "Model Bank (Demo)",
  "Noor Digital Sandbox",
  "Al Etihad Test Bank",
  "Sandbox Credit Union",
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

  const [selectedFlow, setSelectedFlow] = useState<ConsentFlowType>("data");
  const [selectedBank, setSelectedBank] = useState("");
  const [flowStatus, setFlowStatus] = useState<
    Record<ConsentFlowType, StepStatus>
  >({
    data: "idle",
    sip: "idle",
    vrp: "idle",
  });
  const [flowPayloads, setFlowPayloads] = useState<
    Record<ConsentFlowType, ConsentResponse | null>
  >({
    data: null,
    sip: null,
    vrp: null,
  });
  const [singlePaymentAmount, setSinglePaymentAmount] = useState("250.00");
  const [vrpMaxPayment, setVrpMaxPayment] = useState("250.00");

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

  const isValidCurrencyAmount = (value: string) =>
    /^(?:0|[1-9]\d*)(\.\d{2})$/.test(value.trim());

  const toIso = (value: string) => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString();
  };

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

  type PreparedConsentRequest =
    | {
        endpoint: string;
        body: Record<string, unknown>;
        logContext: Record<string, unknown>;
      }
    | { error: string };

  const prepareConsentRequest = (
    flow: ConsentFlowType
  ): PreparedConsentRequest => {
    const bankLabel = selectedBank.trim();
    if (!bankLabel) {
      return { error: "Select a bank/provider to continue." };
    }
    const baseContext = {
      bank: bankLabel,
      flow,
    };
    switch (flow) {
      case "data": {
        if (!dataPermissions.length) {
          return { error: "Choose at least one data permission." };
        }
        const isoFrom = toIso(dataValidFrom);
        const isoUntil = toIso(dataValidUntil);
        if (dataValidFrom && !isoFrom) {
          return { error: "Provide a valid start date/time." };
        }
        if (dataValidUntil && !isoUntil) {
          return { error: "Provide a valid end date/time." };
        }
        if (isoFrom && isoUntil && isoFrom >= isoUntil) {
          return {
            error: "`Valid until` must be later than `Valid from`.",
          };
        }
        return {
          endpoint: "/consent-create/bank-data",
          body: {
            bank_label: bankLabel,
            data_permissions: dataPermissions,
            ...(isoFrom && { valid_from: isoFrom }),
            ...(isoUntil && { valid_until: isoUntil }),
          },
          logContext: {
            ...baseContext,
            valid_from: isoFrom ?? null,
            valid_until: isoUntil ?? null,
            permissions: dataPermissions,
          },
        };
      }
      case "sip": {
        const amount = singlePaymentAmount.trim();
        if (!isValidCurrencyAmount(amount)) {
          return {
            error:
              "Payment amount must be a positive AED value with two decimals.",
          };
        }
        return {
          endpoint: "/consent-create/single-payment",
          body: { payment_amount: amount, bank_label: bankLabel },
          logContext: {
            ...baseContext,
            payment_amount: amount,
          },
        };
      }
      case "vrp": {
        const amount = vrpMaxPayment.trim();
        if (!isValidCurrencyAmount(amount)) {
          return {
            error:
              "Maximum individual amount must be a positive AED value with two decimals.",
          };
        }
        return {
          endpoint: "/consent-create/variable-on-demand-payments",
          body: { max_payment_amount: amount, bank_label: bankLabel },
          logContext: {
            ...baseContext,
            max_payment_amount: amount,
          },
        };
      }
      default:
        return { error: "Unsupported flow." };
    }
  };

  const handleConsentFlow = async (flow: ConsentFlowType) => {
    const flowLabel = consentFlowLabels[flow];
    const prepared = prepareConsentRequest(flow);
    if ("error" in prepared) {
      setFlowStatus((prev) => ({ ...prev, [flow]: "error" }));
      recordMessage(`${flowLabel} consent blocked: ${prepared.error}`);
      console.warn(
        `[Widget] ${flowLabel} consent validation failed`,
        prepared.error
      );
      return;
    }

    setFlowStatus((prev) => ({ ...prev, [flow]: "loading" }));
    setFlowPayloads((prev) => ({ ...prev, [flow]: null }));

    const { endpoint, body, logContext } = prepared;
    const bankFromContext = (logContext as { bank?: string }).bank;
    const bankLabel =
      bankFromContext && bankFromContext.trim().length
        ? bankFromContext
        : "the selected bank";

    try {
      console.info(
        `[Widget] Starting ${flowLabel} consent request`,
        logContext
      );
      const payload = await apiRequest<ConsentResponse>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setFlowPayloads((prev) => ({ ...prev, [flow]: payload }));
      setCodeVerifierInput(payload.code_verifier);
      setFlowStatus((prev) => ({ ...prev, [flow]: "success" }));
      recordMessage(
        `${flowLabel} consent created for ${bankLabel}. Launch the redirect link to authorize.`
      );
      console.info(
        `[Widget] ${flowLabel} consent created`,
        JSON.stringify(payload)
      );
    } catch (error) {
      const message = (error as Error).message;
      setFlowStatus((prev) => ({ ...prev, [flow]: "error" }));
      recordMessage(`${flowLabel} consent failed for ${bankLabel}: ${message}`);
      console.error(
        `[Widget] ${flowLabel} consent failed`,
        message,
        logContext
      );
    }
  };

  const handleOpenFlowRedirect = (flow: ConsentFlowType) => {
    const url = flowPayloads[flow]?.redirect;
    if (!url) {
      recordMessage(`No redirect URL available for ${consentFlowLabels[flow]}.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    recordMessage(`Opened ${consentFlowLabels[flow]} redirect in a new tab.`);
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
      recordMessage(
        "Balance fetch blocked: no derived access token (complete the consent + token steps)."
      );
      console.warn("[Widget] Balance fetch aborted — missing access token", {
        apiBase: API_BASE,
      });
      return;
    }
    console.info("[Widget] Balance fetch triggered", {
      apiBase: API_BASE,
      tokenPreview: `${derivedAccessToken.slice(0, 6)}…${derivedAccessToken.slice(-4)}`,
    });
    recordMessage("Fetching balances from starter kit APIs…");
    setBalanceError(null);
    setBalanceStatus("loading");
    try {
      const headers = {
        Authorization: `Bearer ${derivedAccessToken}`,
      };
      console.info("[Widget] Requesting accounts list", {
        endpoint: "/open-finance/account-information/v1.2/accounts",
      });
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
          console.info("[Widget] Requesting account balances", {
            endpoint: `/open-finance/account-information/v1.2/accounts/${accountId}/balances`,
          });
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

        <article className="panel consent-panel">
          <div className="panel-head">
            <div>
              <h2>3. Configure consent flows</h2>
              <p>
                Mirror the starter-kit UI: pick a flow, select a bank, review
                the steps, and launch the redirect.
              </p>
            </div>
            <StatusBadge status={flowStatus[selectedFlow]} />
          </div>

          <div className="flow-selector">
            {consentFlowOrder.map((flow) => (
              <button
                type="button"
                key={flow}
                className={clsx(
                  "flow-chip",
                  selectedFlow === flow && "flow-chip-active"
                )}
                onClick={() => setSelectedFlow(flow)}
              >
                <span className="flow-chip-label">
                  {consentFlowLabels[flow]}
                </span>
                <span className="flow-chip-status">
                  {statusLabel[flowStatus[flow]]}
                </span>
              </button>
            ))}
          </div>

          <div className="flow-fields">
            <label className="field">
              <span>Bank or provider</span>
              <select
                value={selectedBank}
                onChange={(event) => setSelectedBank(event.target.value)}
              >
                <option value="">Select one</option>
                {bankOptions.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
            </label>

            <div className="flow-overview">
              <span className="meta-label">What this flow covers</span>
              <ul>
                {consentFlowSummaries[selectedFlow].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            {selectedFlow === "data" && (
              <>
                <p className="lede">
                  Toggle the same permission chips exposed in the hackathon
                  starter kit.
                </p>
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
                    <span>Valid from (optional)</span>
                    <input
                      type="datetime-local"
                      value={dataValidFrom}
                      onChange={(event) => setDataValidFrom(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Valid until (optional)</span>
                    <input
                      type="datetime-local"
                      value={dataValidUntil}
                      onChange={(event) =>
                        setDataValidUntil(event.target.value)
                      }
                    />
                  </label>
                </div>
              </>
            )}

            {selectedFlow === "sip" && (
              <div className="field">
                <span>Payment amount (AED)</span>
                <input
                  value={singlePaymentAmount}
                  onChange={(event) =>
                    setSinglePaymentAmount(event.target.value)
                  }
                  placeholder="125.00"
                />
                <p className="info-text">
                  Uses the starter-kit beneficiary, reference, and control
                  parameters for the Single Instant Payment journey.
                </p>
              </div>
            )}

            {selectedFlow === "vrp" && (
              <div className="field">
                <span>Maximum individual amount (AED)</span>
                <input
                  value={vrpMaxPayment}
                  onChange={(event) => setVrpMaxPayment(event.target.value)}
                  placeholder="250.00"
                />
                <p className="info-text">
                  Sets the Variable On Demand control parameter to mirror the
                  original VRP screen.
                </p>
              </div>
            )}
          </div>

          <div className="flow-steps">
            <div>
              <span className="meta-label">Flow checklist</span>
              <ol>
                <li>Select the consent type and bank.</li>
                <li>Confirm the inputs match the starter-kit screen.</li>
                <li>Launch the consent and follow the redirect.</li>
              </ol>
            </div>
            <div className="flow-status-list">
              {consentFlowOrder.map((flow) => (
                <div key={flow} className="flow-status-row">
                  <span>{consentFlowLabels[flow]}</span>
                  <StatusBadge status={flowStatus[flow]} />
                </div>
              ))}
            </div>
          </div>

          <button
            className="primary"
            onClick={() => handleConsentFlow(selectedFlow)}
            disabled={flowStatus[selectedFlow] === "loading"}
          >
            Launch {consentFlowLabels[selectedFlow]} consent
          </button>
          <button
            className="ghost"
            onClick={() => handleOpenFlowRedirect(selectedFlow)}
            disabled={!flowPayloads[selectedFlow]?.redirect}
          >
            Open authorization redirect
          </button>

          {flowPayloads[selectedFlow] && (
            <>
              {flowPayloads[selectedFlow]?.redirect && (
                <p className="info-text">
                  Redirect ready for{" "}
                  <strong>{selectedBank || "the selected bank"}</strong>:{" "}
                  <code>{flowPayloads[selectedFlow]?.redirect}</code>
                </p>
              )}
              <pre className="payload">
                {JSON.stringify(flowPayloads[selectedFlow], null, 2)}
              </pre>
            </>
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
