import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  apiRequest,
  ConsentResponse,
  TokenResponse,
  BalanceSummary,
} from "./lib/apiClient";

type StepStatus = "idle" | "loading" | "success" | "error";

type ConsentSnapshot = {
  consent_id: string;
  auth_code?: string | null;
  status?: string | null;
  updated_at?: string | null;
};

const wizardSteps = [
  { id: 0, label: "Choose bank" },
  { id: 1, label: "Review consent" },
  { id: 2, label: "Redirect" },
  { id: 3, label: "Account details" },
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

const permissionHighlights = [
  {
    title: "Your account details",
    body:
      "We need account names, currencies, and identifiers so the experience can tailor insights to you.",
  },
  {
    title: "Regular payments",
    body:
      "Scheduled payments, direct debits, and standing orders help us flag upcoming commitments.",
  },
  {
    title: "Account activity",
    body:
      "Transactions, beneficiaries, and balances ensure categorization and spending analysis stay accurate.",
  },
  {
    title: "Contact & party info",
    body:
      "Basic party information is used to personalize the Raseed experience inside ChatGPT.",
  },
];

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
  const [selectedBank, setSelectedBank] = useState<(typeof bankOptions)[number] | null>(null);
  const [selectedGroups] = useState<string[]>(defaultPermissionGroups);
  const [consentStatus, setConsentStatus] = useState<StepStatus>("idle");
  const [consentPayload, setConsentPayload] =
    useState<ConsentResponse | null>(null);
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

  const consentStartDate = useMemo(() => new Date(), []);
  const consentEndDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 90);
    return date;
  }, []);

  const derivedToken = tokenPayload?.access_token ?? null;
  const advanceTo = useCallback((target: number) => {
    setStep((prev) => Math.min(Math.max(target, prev), wizardSteps.length - 1));
  }, []);

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
      return payload;
    } catch (error) {
      setConsentStatus("error");
      record(`Consent creation failed: ${(error as Error).message}`);
      return null;
    }
  };

  const handleConfirmConsent = async () => {
    if (!selectedBank) {
      record("Select a bank before continuing.");
      return;
    }
    const payload = await handleCreateConsent();
    if (payload?.redirect) {
      window.open(payload.redirect, "_blank", "noopener,noreferrer");
      record(`Opened redirect${selectedBank ? " for " + selectedBank.name : ""}.`);
      advanceTo(2);
    }
  };

  const exchangeAuthorizationCode = useCallback(
    async (incomingCode: string, origin: "auto" | "manual" = "auto") => {
      if (!consentPayload?.code_verifier) {
        record("Consent has no PKCE verifier yet. Create consent first.");
        return;
      }
      const trimmed = incomingCode?.trim();
      if (!trimmed) {
        record("Waiting for the bank to provide an authorization code.");
        return;
      }
      setTokenStatus("loading");
      try {
        const payload = await apiRequest<TokenResponse>(
          "/token/authorization-code",
          {
            method: "POST",
            body: JSON.stringify({
              code: trimmed,
              code_verifier: consentPayload.code_verifier,
            }),
          }
        );
        setTokenPayload(payload);
        setTokenStatus("success");
        record(
          origin === "auto"
            ? "Authorization code detected automatically. Token issued."
            : "Authorization code exchanged for access token."
        );
        setTimeout(() => advanceTo(3), 1200);
      } catch (error) {
        setTokenStatus("error");
        record(`Authorization code exchange failed: ${(error as Error).message}`);
      }
    },
    [advanceTo, consentPayload?.code_verifier, record]
  );

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
    if (
      step !== 2 ||
      !consentPayload?.consent_id ||
      !consentPayload?.code_verifier ||
      tokenStatus === "success"
    ) {
      return;
    }
    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const response = await apiRequest<{ consent: ConsentSnapshot }>(
          `/consents/${consentPayload.consent_id}`,
          {
            method: "GET",
          }
        );
        const authCodeFromDb = response?.consent?.auth_code;
        if (authCodeFromDb && !cancelled) {
          await exchangeAuthorizationCode(authCodeFromDb, "auto");
        }
      } catch (error) {
        console.warn("Consent polling failed", error);
      } finally {
        inFlight = false;
      }
    };

    poll();
    const intervalId = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    consentPayload?.code_verifier,
    consentPayload?.consent_id,
    exchangeAuthorizationCode,
    step,
    tokenStatus,
  ]);

  useEffect(() => {
    if (step === 3 && derivedToken && accountsStatus === "idle") {
      fetchAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, derivedToken]);

  const stepContent = (() => {
    switch (step) {
      case 0:
        return (
          <section className="wizard-step">
            <div className="stage-head">
              <h2>Select your bank</h2>
              <p>Tap a bank to continue the flow.</p>
            </div>
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
                    advanceTo(1);
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
            <div className="consent-review-grid">
              <div className="consent-summary">
                <h3>Connect your account(s)</h3>
                <p>
                  For you to use this service <strong>Raseed</strong> needs to
                  access information from your accounts at{" "}
                  <strong>{selectedBank?.name ?? "your bank"}</strong>.
                </p>
                <p className="consent-small">
                  This is a demo environment. The data you share is used only to
                  simulate functionality — nothing is kept longer than 24 hours.
                </p>
                <div className="consent-dates">
                  <div>
                    <span className="meta-label">Start date</span>
                    <strong>{consentStartDate.toLocaleDateString()}</strong>
                  </div>
                  <div>
                    <span className="meta-label">End date</span>
                    <strong>{consentEndDate.toLocaleDateString()}</strong>
                  </div>
                </div>
              </div>
              <div className="permission-highlight-grid">
                {permissionHighlights.map((item) => (
                  <article key={item.title} className="permission-highlight">
                    <h4>{item.title}</h4>
                    <p>{item.body}</p>
                  </article>
                ))}
                <div className="permission-calendar">
                  <span>We will access your data until {consentEndDate.toLocaleDateString()}.</span>
                </div>
              </div>
            </div>
            <div className="consent-actions">
              <button
                className="primary consent-primary"
                onClick={handleConfirmConsent}
                disabled={consentStatus === "loading" || !selectedBank}
              >
                Continue to authorize
              </button>
              <div className="consent-suptext">
                Continue to{" "}
                <strong>{selectedBank?.name ?? "your bank"}</strong> to share
                your account information under these terms.
              </div>
              <StatusBadge status={consentStatus} />
            </div>
          </section>
        );
      case 2:
        return (
          <section className="wizard-step redirect-step">
            <div className="redirect-overlay">
              <div className="redirect-spinner" />
              <p>
                You'll be redirected to {selectedBank?.name || "your bank"}, don't close this window.
              </p>
            </div>
            <div className="redirect-form auto-mode">
              <StatusBadge status={tokenStatus === "idle" ? "loading" : tokenStatus} />
              <p className="wizard-info">
                Waiting for{" "}
                <strong>{selectedBank?.name || "your bank"}</strong> to finish
                authentication. We’ll automatically exchange the authorization code
                once it appears.
              </p>
              {tokenStatus === "error" && (
                <p className="wizard-info error">
                  Something went wrong while exchanging the authorization code. Refresh the page to retry.
                </p>
              )}
            </div>
          </section>
        );
      case 3:
        return (
          <section className="wizard-step">
            <div className="stage-head">
              <h2>Accounts & balances</h2>
              <p>Sync accounts and visualize balances across currencies.</p>
            </div>
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
                <p className="wizard-info">Complete the authorization step to obtain an access token.</p>
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
