import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  apiRequest,
  API_BASE,
  ConsentResponse,
  TokenResponse,
  BalanceSummary,
} from "./lib/apiClient";

type StepStatus = "idle" | "loading" | "success" | "error";

const wizardSteps = [
  { id: 0, label: "Choose bank" },
  { id: 1, label: "Authorize consent" },
  { id: 2, label: "Account details" },
];

const bankOptions = [
  {
    id: "model",
    name: "Model Bank",
    subtitle: "Retail sandbox",
    logo: "🏦",
  },
  {
    id: "noor",
    name: "Noor Digital",
    subtitle: "Digital-only",
    logo: "💠",
  },
  {
    id: "etihad",
    name: "Al Etihad Test Bank",
    subtitle: "Premier sandbox",
    logo: "🛡️",
  },
  {
    id: "sandbox",
    name: "Sandbox Credit Union",
    subtitle: "Community lab",
    logo: "🌱",
  },
];

const permissionGroups = [
  {
    id: "accounts",
    label: "Account overview",
    description:
      "Share account names, currencies, balances, and identifiers so the experience can tailor insights to you.",
    permissions: [
      "ReadAccountsBasic",
      "ReadAccountsDetail",
      "ReadBalances",
      "ReadPartyUser",
    ],
  },
  {
    id: "payments",
    label: "Scheduled payments",
    description:
      "Allow access to standing orders, scheduled payments, and direct debits to surface upcoming commitments.",
    permissions: [
      "ReadScheduledPaymentsBasic",
      "ReadScheduledPaymentsDetail",
      "ReadStandingOrdersBasic",
      "ReadStandingOrdersDetail",
      "ReadDirectDebits",
    ],
  },
  {
    id: "transactions",
    label: "Transactions history",
    description:
      "Provide a detailed feed of credits, debits, and beneficiaries to categorize spending and detect patterns.",
    permissions: [
      "ReadTransactionsBasic",
      "ReadTransactionsDetail",
      "ReadTransactionsCredits",
      "ReadTransactionsDebits",
      "ReadBeneficiariesBasic",
      "ReadBeneficiariesDetail",
    ],
  },
];

const defaultPermissionGroups = permissionGroups.map((group) => group.id);

function useMessages() {
  const [messages, setMessages] = useState<string[]>([]);
  const record = (message: string) => {
    setMessages((prev) => [
      `${new Date().toLocaleTimeString()}: ${message}`,
      ...prev,
    ]);
  };
  return { messages, record };
}

export default function DataSharingWizard() {
  const [step, setStep] = useState(0);
  const [selectedBank, setSelectedBank] = useState(bankOptions[0]);
  const [selectedGroups] = useState<string[]>(defaultPermissionGroups);
  const [consentStatus, setConsentStatus] = useState<StepStatus>("idle");
  const [consentPayload, setConsentPayload] =
    useState<ConsentResponse | null>(null);
  const [authCode, setAuthCode] = useState("");
  const [tokenStatus, setTokenStatus] = useState<StepStatus>("idle");
  const [tokenPayload, setTokenPayload] = useState<TokenResponse | null>(null);
  const [accountsStatus, setAccountsStatus] = useState<StepStatus>("idle");
  const [balances, setBalances] = useState<BalanceSummary | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const { messages, record } = useMessages();
  const [logOpen, setLogOpen] = useState(false);

  const selectedPermissions = useMemo(() => {
    const unique = new Set<string>();
    selectedGroups.forEach((groupId) => {
      const group = permissionGroups.find((item) => item.id === groupId);
      group?.permissions.forEach((perm) => unique.add(perm));
    });
    return Array.from(unique);
  }, [selectedGroups]);

  const derivedToken = tokenPayload?.access_token ?? null;
  const advanceTo = (target: number) => {
    setStep((prev) => Math.min(Math.max(target, prev), wizardSteps.length - 1));
  };

  const handleCreateConsent = async () => {
    setConsentStatus("loading");
    try {
      const payload = await apiRequest<ConsentResponse>(
        "/consent-create/bank-data",
        {
          method: "POST",
          body: JSON.stringify({
            data_permissions: selectedPermissions,
          }),
        }
      );
      setConsentPayload(payload);
      setConsentStatus("success");
      record("Data sharing consent created. Launch the redirect to authorize.");
    } catch (error) {
      setConsentStatus("error");
      record(`Consent creation failed: ${(error as Error).message}`);
    }
  };

  const handleOpenRedirect = () => {
    if (!consentPayload?.redirect) return;
    window.open(consentPayload.redirect, "_blank", "noopener,noreferrer");
    record(`Opened redirect for ${selectedBank.name}.`);
  };

  const handleExchangeCode = async () => {
    if (!consentPayload?.code_verifier) {
      record("Consent has no PKCE verifier yet. Create consent first.");
      return;
    }
    if (!authCode.trim()) {
      record("Enter the authorization code before exchanging.");
      return;
    }
    setTokenStatus("loading");
    try {
      const payload = await apiRequest<TokenResponse>(
        "/token/authorization-code",
        {
          method: "POST",
          body: JSON.stringify({
            code: authCode.trim(),
            code_verifier: consentPayload.code_verifier,
          }),
        }
      );
      setTokenPayload(payload);
      setTokenStatus("success");
      record("Authorization code exchanged for access token.");
      advanceTo(2);
    } catch (error) {
      setTokenStatus("error");
      record(`Authorization code exchange failed: ${(error as Error).message}`);
    }
  };

  const fetchAccounts = async () => {
    if (!derivedToken) {
      setAccountsError("Missing access token. Complete the authorization step.");
      setAccountsStatus("error");
      return;
    }
    setAccountsError(null);
    setAccountsStatus("loading");
    try {
      const headers = {
        Authorization: `Bearer ${derivedToken}`,
      };
      const accountsData = await apiRequest<any>(
        "/open-finance/account-information/v1.2/accounts",
        {
          method: "GET",
          headers,
        }
      );
      const accounts = accountsData?.Data?.Account ?? [];
      const summary: BalanceSummary = {
        totals: [],
        accounts: [],
      };
      const totals = new Map<string, number>();

      const detailed = await Promise.all(
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
          const rows: BalanceSummary["accounts"][number]["balances"] = [];
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
          };
        })
      );

      summary.accounts = detailed.filter(
        (item): item is BalanceSummary["accounts"][number] => Boolean(item)
      );
      summary.totals = Array.from(totals.entries()).map(
        ([currency, amount]) => ({
          currency,
          amount,
        })
      );
      setBalances(summary);
      setAccountsStatus("success");
      record("Balances aggregated across accounts.");
    } catch (error) {
      const message = (error as Error).message;
      setAccountsStatus("error");
      setAccountsError(message);
      record(`Balance aggregation failed: ${message}`);
    }
  };

  useEffect(() => {
    if (step === 2 && derivedToken && accountsStatus === "idle") {
      fetchAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, derivedToken]);

  const stepContent = (() => {
    switch (step) {
      case 0:
        return (
          <section className="wizard-step">
            <h2>Select your bank</h2>
            <p className="wizard-lede">
              Raseed connects securely to your chosen provider. Pick the bank you want to authorize.
            </p>
            <div className="bank-grid">
              {bankOptions.map((bank) => (
                <button
                  key={bank.id}
                  className={clsx(
                    "bank-card",
                    selectedBank?.id === bank.id && "bank-card-active"
                  )}
                  onClick={() => {
                    setSelectedBank(bank);
                    if (step === 0) {
                      advanceTo(1);
                    }
                  }}
                >
                  <span className="bank-logo">{bank.logo}</span>
                  <div>
                    <strong>{bank.name}</strong>
                    <p>{bank.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      case 1:
        return (
          <section className="wizard-step">
            <h2>Authorize the consent</h2>
            <p className="wizard-lede">
              Raseed automatically requests all required data permissions so you can jump straight into the redirect.
            </p>
            <div className="wizard-panel">
              <div className="wizard-panel-head">
                <div>
                  <strong>Consent creation</strong>
                  <p>Generate the consent record and PKCE verifier.</p>
                </div>
                <StatusBadge status={consentStatus} />
              </div>
              <div className="wizard-panel-actions">
                <button
                  className="primary"
                  onClick={handleCreateConsent}
                  disabled={consentStatus === "loading"}
                >
                  Create consent
                </button>
                <button
                  className="ghost"
                  onClick={handleOpenRedirect}
                  disabled={!consentPayload?.redirect}
                >
                  Open redirect
                </button>
              </div>
              {consentPayload && (
                <div className="wizard-panel-meta">
                  <div>
                    <span className="meta-label">Consent ID</span>
                    <strong>{consentPayload.consent_id}</strong>
                  </div>
                  <div>
                    <span className="meta-label">Code verifier</span>
                    <code>{consentPayload.code_verifier}</code>
                  </div>
                </div>
              )}
            </div>
            <div className="wizard-panel">
              <div className="wizard-panel-head">
                <div>
                  <strong>Authorization code</strong>
                  <p>Paste the `code` returned by the redirect.</p>
                </div>
                <StatusBadge status={tokenStatus} />
              </div>
              <label className="field">
                <span>Code from redirect</span>
                <input
                  value={authCode}
                  onChange={(event) => setAuthCode(event.target.value)}
                  placeholder="e.g. 2eb8610d-..."
                />
              </label>
              <button
                className="primary"
                onClick={handleExchangeCode}
                disabled={tokenStatus === "loading"}
              >
                Exchange for token
              </button>
              {tokenPayload?.access_token && (
                <p className="wizard-info">
                  Token ready: {" "}
                  <code>
                    {tokenPayload.access_token.slice(0, 6)}…
                    {tokenPayload.access_token.slice(-4)}
                  </code>
                </p>
              )}
            </div>
          </section>
        );
      case 2:
        return (
          <section className="wizard-step">
            <h2>Accounts & balances</h2>
            <p className="wizard-lede">
              Pull live balances with the authorized consent. Visualize totals
              per currency and dive into each account.
            </p>
            <div className="wizard-panel">
              <div className="wizard-panel-head">
                <div>
                  <strong>Fetch balances</strong>
                  <p>Uses the starter kit account information APIs.</p>
                </div>
                <StatusBadge status={accountsStatus} />
              </div>
              <button
                className="primary"
                onClick={fetchAccounts}
                disabled={accountsStatus === "loading" || !derivedToken}
              >
                Sync accounts
              </button>
              {!derivedToken && (
                <p className="wizard-info">
                  Complete the authorization step to obtain an access token.
                </p>
              )}
              {accountsError && (
                <p className="wizard-error">Error: {accountsError}</p>
              )}
            </div>
            {balances && (
              <div className="accounts-grid">
                <div className="currency-panel">
                  <span className="meta-label">Per currency</span>
                  <CurrencyBars summary={balances} />
                </div>
                <div className="accounts-panel">
                  <span className="meta-label">Accounts</span>
                  <AccountList summary={balances} />
                </div>
              </div>
            )}
          </section>
        );
      default:
        return null;
    }
  })();;

  return (
    <div className="wizard-shell">
      <div className="raseed-brand">
        <span className="raseed-wordmark">Raseed</span>
      </div>

      <div className="wizard-progress">
        {wizardSteps.map((item, index) => (
          <div
            key={item.id}
            className={clsx(
              "wizard-progress-step",
              step === index && "wizard-progress-active",
              step > index && "wizard-progress-complete"
            )}
          >
            <span>{index + 1}</span>
            <p>{item.label}</p>
          </div>
        ))}
      </div>

      <div className="wizard-body">{stepContent}</div>

      <button
        className="log-toggle"
        onClick={() => setLogOpen((prev) => !prev)}
        aria-expanded={logOpen}
      >
        Activity log
      </button>
      {logOpen && (
        <section className="wizard-log-panel">
          <div className="panel-head">
            <div>
              <h3>Activity</h3>
              <p>Raseed actions this session.</p>
            </div>
          </div>
          {messages.length === 0 ? (
            <p className="wizard-info">
              Walk through the steps to see live activity updates.
            </p>
          ) : (
            <ul className="log">
              {messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

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
      {status === "idle"
        ? "Idle"
        : status === "loading"
          ? "Loading"
          : status === "success"
            ? "Done"
            : "Failed"}
    </span>
  );
}

function CurrencyBars({ summary }: { summary: BalanceSummary }) {
  if (!summary.totals.length) {
    return <p className="wizard-info">No balances returned yet.</p>;
  }
  const max = Math.max(
    ...summary.totals.map((item) => Math.abs(item.amount)),
    1
  );
  return (
    <ul className="currency-bars">
      {summary.totals.map((item) => (
        <li key={item.currency}>
          <div className="currency-bars-head">
            <strong>{item.currency}</strong>
            <span>{item.amount.toFixed(2)}</span>
          </div>
          <div className="currency-bar-track">
            <div
              className="currency-bar-fill"
              style={{ width: `${(Math.abs(item.amount) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AccountList({ summary }: { summary: BalanceSummary }) {
  if (!summary.accounts.length) {
    return <p className="wizard-info">No accounts returned yet.</p>;
  }
  return (
    <ul className="account-list wizard-account-list">
      {summary.accounts.map((account) => (
        <li key={account.accountId}>
          <p className="account-name">{account.name}</p>
          {account.balances.map((entry, index) => (
            <p className="account-balance" key={index}>
              {entry.type}: {entry.amount.toFixed(2)} {entry.currency}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}
