import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import {
  apiRequest,
  ConsentResponse,
  TokenResponse,
  BalanceSummary,
} from "./lib/apiClient";
import AccountsDashboard from "./AccountsDashboard";
import {
  DashboardAccount,
  DashboardTransaction,
  TransactionsMap,
} from "./lib/dashboardTypes";

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
  const [dashboardAccounts, setDashboardAccounts] = useState<DashboardAccount[]>([]);
  const [transactionsByAccount, setTransactionsByAccount] = useState<TransactionsMap>({});
  const [transactionsStatus, setTransactionsStatus] = useState<StepStatus>("idle");
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountHolderName, setAccountHolderName] = useState<string | null>(null);
  const [accountHolderAvatar, setAccountHolderAvatar] = useState<string | null>(null);
  const [partyStatus, setPartyStatus] = useState<StepStatus>("idle");
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

  useEffect(() => {
    if (!dashboardAccounts.length) {
      if (selectedAccountId !== null) {
        setSelectedAccountId(null);
      }
      return;
    }
    const found = dashboardAccounts.some(
      (account) => account.accountId === selectedAccountId
    );
    if (!found) {
      setSelectedAccountId(dashboardAccounts[0]?.accountId ?? null);
    }
  }, [dashboardAccounts, selectedAccountId]);

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

  const fetchPartyDetails = useCallback(async () => {
    if (!derivedToken) return;
    setPartyStatus("loading");
    try {
      const headers = {
        Authorization: `Bearer ${derivedToken}`,
      };
      const partiesPayload = await apiRequest<any>(
        "/open-finance/account-information/v1.2/parties",
        {
          method: "GET",
          headers,
        }
      );
      const partyName = extractPartyName(partiesPayload);
      const avatar = extractPartyAvatar(partiesPayload);
      if (partyName) {
        setAccountHolderName(partyName);
      }
      if (avatar) {
        setAccountHolderAvatar(avatar);
      }
      setPartyStatus("success");
      record("Party details retrieved from the starter kit API.");
    } catch (error) {
      const message = (error as Error).message;
      setPartyStatus("error");
      record(`Party lookup failed: ${message}`);
    }
  }, [derivedToken, record]);

  useEffect(() => {
    if (!derivedToken || step < 2) {
      return;
    }
    if (partyStatus === "idle") {
      fetchPartyDetails();
    }
  }, [derivedToken, step, partyStatus, fetchPartyDetails]);

  const fetchTransactionsForAccounts = useCallback(
    async (
      accountList: DashboardAccount[],
      headers: Record<string, string>
    ) => {
      if (!accountList.length) {
        setTransactionsByAccount({});
        setTransactionsStatus("success");
        return;
      }
      setTransactionsStatus("loading");
      setTransactionsError(null);
      try {
        const responses = await Promise.allSettled(
          accountList.map(async (account) => {
            const payload = await apiRequest<any>(
              `/open-finance/account-information/v1.2/accounts/${account.accountId}/transactions`,
              {
                method: "GET",
                headers,
              }
            );
            const transactions = normalizeTransactions(
              payload?.Data?.Transaction ?? [],
              account
            );
            return {
              accountId: account.accountId,
              transactions,
            };
          })
        );
        const map: TransactionsMap = {};
        const failed: string[] = [];
        responses.forEach((result, index) => {
          if (result.status === "fulfilled") {
            map[result.value.accountId] = result.value.transactions;
          } else {
            failed.push(
              accountList[index]?.name ?? accountList[index]?.accountId
            );
          }
        });
        setTransactionsByAccount(map);
        if (failed.length) {
          const message = `Transactions unavailable for ${failed.join(", ")}.`;
          setTransactionsStatus("error");
          setTransactionsError(message);
          record(message);
        } else {
          setTransactionsStatus("success");
          record("Transactions fetched for each account.");
        }
      } catch (error) {
        const message = (error as Error).message;
        setTransactionsStatus("error");
        setTransactionsError(message);
        record(`Transactions fetch failed: ${message}`);
      }
    },
    [record]
  );

  const fetchAccounts = async () => {
    if (!derivedToken) {
      setAccountsError("Missing access token. Complete the authorization step.");
      setAccountsStatus("error");
      return;
    }
    setAccountsError(null);
    setTransactionsError(null);
    setTransactionsStatus("idle");
    setDashboardAccounts([]);
    setTransactionsByAccount({});
    setAccountsStatus("loading");
    if (partyStatus !== "success") {
      fetchPartyDetails();
    }
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

      const combined = await Promise.all(
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
          const displayBalance = pickDisplayBalance(rows);
          const card: DashboardAccount = {
            accountId,
            name:
              account?.Nickname ||
              account?.Account?.Name ||
              account?.ProductName ||
              accountId,
            type:
              account?.AccountType ||
              account?.AccountSubType ||
              account?.Account?.SchemeName ||
              null,
            productName: account?.ProductName || account?.Nickname || null,
            currency:
              displayBalance?.currency ||
              account?.Currency ||
              rows[0]?.currency ||
              "AED",
            availableBalance: displayBalance?.amount ?? rows[0]?.amount ?? 0,
            availableBalanceType: displayBalance?.type ?? null,
            accountNumber: maskAccountIdentifier(
              account?.Account?.Identification ??
                account?.Account?.SecondaryIdentification ??
                account?.Servicer?.Identification ??
                account?.MaskedIdentification
            ),
          };
          return {
            summaryEntry: {
              accountId,
              name: card.name,
              balances: rows,
            } as BalanceSummary["accounts"][number],
            card,
          };
        })
      );

      const prepared = combined.filter(
        (
          entry
        ): entry is {
          summaryEntry: BalanceSummary["accounts"][number];
          card: DashboardAccount;
        } => Boolean(entry)
      );

      summary.accounts = prepared.map((entry) => entry.summaryEntry);
      summary.totals = Array.from(totals.entries()).map(
        ([currency, amount]) => ({
          currency,
          amount,
        })
      );
      setBalances(summary);
      const cards = prepared.map((entry) => entry.card);
      setDashboardAccounts(cards);
      setAccountsStatus("success");
      record("Balances aggregated across accounts.");

      await fetchTransactionsForAccounts(cards, headers);
    } catch (error) {
      const message = (error as Error).message;
      setAccountsStatus("error");
      setAccountsError(message);
      setDashboardAccounts([]);
      setTransactionsByAccount({});
      setTransactionsStatus("idle");
      setTransactionsError(null);
      record(`Balance aggregation failed: ${message}`);
    }
  };

  const handleDashboardAction = (action: "pay" | "transfer" | "receive") => {
    record(`Dashboard quick action selected: ${action}`);
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
          <section className="journey-panel">
            <div className="journey-panel-head">
              <div>
                <p className="journey-eyebrow">Step 1 · Choose your institution</p>
                <h2>Select a bank to connect</h2>
                <p>Select one of the supported sandboxes to start sharing data.</p>
              </div>
            </div>
            <div className="journey-bank-grid">
              {bankOptions.map((bank) => (
                <button
                  key={bank.id}
                  className="journey-bank-card"
                  onClick={() => {
                    setSelectedBank(bank);
                    advanceTo(1);
                  }}
                >
                  <div className="journey-bank-icon">{bank.logo}</div>
                  <div>
                    <p className="journey-bank-name">{bank.name}</p>
                    <span>{bank.subtitle}</span>
                  </div>
                  <ChevronRight size={18} className="journey-bank-chevron" />
                </button>
              ))}
            </div>
          </section>
        );
      case 1:
        return (
          <section className="journey-panel">
            <div className="journey-panel-head">
              <div>
                <p className="journey-eyebrow">Step 2 · Review and confirm</p>
                <h2>Share data with {selectedBank?.name ?? "your bank"}</h2>
                <p>
                  Raseed will request access to balances, beneficiaries, and transactions to build your experience.
                </p>
              </div>
              <StatusBadge status={consentStatus} />
            </div>
            <div className="journey-consent-grid">
              <article className="journey-consent-card">
                <h3>Consent window</h3>
                <p className="journey-helper">
                  Data access begins immediately after authorization and expires automatically.
                </p>
                <div className="journey-consent-dates">
                  <div>
                    <span className="meta-label">Valid from</span>
                    <strong>{consentStartDate.toLocaleDateString()}</strong>
                  </div>
                  <div>
                    <span className="meta-label">Valid until</span>
                    <strong>{consentEndDate.toLocaleDateString()}</strong>
                  </div>
                </div>
                <ul className="journey-permission-list">
                  {permissionGroups.map((group) => (
                    <li key={group.id}>
                      <strong>{group.label}</strong>
                      <p>{group.description}</p>
                    </li>
                  ))}
                </ul>
              </article>
              <article className="journey-consent-card">
                <h3>Why we need this</h3>
                <div className="permission-highlight-grid">
                  {permissionHighlights.map((item) => (
                    <article key={item.title} className="permission-highlight">
                      <h4>{item.title}</h4>
                      <p>{item.body}</p>
                    </article>
                  ))}
                  <div className="permission-calendar">
                    <span>Data access automatically ends on {consentEndDate.toLocaleDateString()}.</span>
                  </div>
                </div>
              </article>
            </div>
            <div className="journey-panel-actions">
              <button
                className="journey-primary"
                onClick={handleConfirmConsent}
                disabled={consentStatus === "loading" || !selectedBank}
              >
                Continue to authorize
              </button>
              <p className="journey-helper">
                We'll open {selectedBank?.name ?? "your bank"} in a new tab so you can complete the consent.
              </p>
            </div>
          </section>
        );
      case 2:
        return (
          <section className="journey-panel journey-panel-center">
            <div className="journey-wait-card">
              <div className="journey-spinner" />
              <p>Waiting for {selectedBank?.name ?? "your bank"} to finish authorization.</p>
              <StatusBadge status={tokenStatus === "idle" ? "loading" : tokenStatus} />
              {tokenStatus === "error" ? (
                <p className="journey-helper journey-helper-error">
                  Something went wrong while exchanging the authorization code. Refresh to retry.
                </p>
              ) : (
                <p className="journey-helper">
                  Keep this tab open — we'll detect the authorization code automatically and continue.
                </p>
              )}
            </div>
          </section>
        );
      case 3:
        if (balances && dashboardAccounts.length > 0) {
          return (
            <AccountsDashboard
              accounts={dashboardAccounts}
              summary={balances}
              transactionsByAccount={transactionsByAccount}
              transactionsStatus={transactionsStatus}
              transactionsError={transactionsError}
              selectedAccountId={selectedAccountId}
              onSelectAccount={setSelectedAccountId}
              onSync={fetchAccounts}
              accountHolderName={accountHolderName}
              accountHolderAvatar={accountHolderAvatar}
              onAction={handleDashboardAction}
              isSyncing={accountsStatus === "loading"}
              canSync={Boolean(derivedToken)}
            />
          );
        }
        return (
          <section className="journey-panel">
            <div className="journey-panel-head">
              <div>
                <p className="journey-eyebrow">Step 4 · Accounts & balances</p>
                <h2>Sync your accounts</h2>
                <p>We aggregate balances and transactions for every linked account.</p>
              </div>
              <StatusBadge status={accountsStatus} />
            </div>
            <div className="journey-panel-actions">
              <button
                className="journey-primary"
                onClick={fetchAccounts}
                disabled={accountsStatus === "loading" || !derivedToken}
              >
                {accountsStatus === "loading" ? "Syncing…" : "Sync accounts"}
              </button>
              {!derivedToken && (
                <p className="journey-helper">Complete the authorization step to obtain an access token.</p>
              )}
              {accountsError && (
                <p className="journey-helper journey-helper-error">
                  Error while fetching accounts: {accountsError}
                </p>
              )}
            </div>
          </section>
        );
      default:
        return null;
    }
  })();

  const customerName = accountHolderName ?? "Awaiting profile";
  const customerAvatar = accountHolderAvatar ?? null;
  const customerInitials = initialsFromName(customerName);
  const institutionLabel = selectedBank?.name ?? "Select a bank to continue";
  const profileStateLabel =
    partyStatus === "success"
      ? "Profile synced"
      : partyStatus === "error"
        ? "Profile unavailable"
        : "Awaiting profile";

  const getStepBadgeStatus = (index: number): StepStatus | null => {
    if (index === 0) {
      return selectedBank ? "success" : null;
    }
    if (index === 1) {
      return consentStatus;
    }
    if (index === 2) {
      return step >= 2 ? (tokenStatus === "idle" ? "loading" : tokenStatus) : null;
    }
    if (index === 3) {
      return accountsStatus;
    }
    return null;
  };

  return (
    <div className="journey-root">
      <div className="journey-shell">
        <header className="journey-header">
          <div>
            <p className="journey-eyebrow">Raseed banking journey</p>
            <h1>Banking access orchestration</h1>
            <p>
              Walk through the same flows your customers complete: pick a bank,
              review consent, authorize, and explore aggregated insights.
            </p>
          </div>
          <div className="journey-header-user">
            <div className="journey-avatar">
              {customerAvatar ? (
                <img src={customerAvatar} alt={customerName} />
              ) : (
                customerInitials
              )}
            </div>
            <div>
              <p className="journey-user-label">{profileStateLabel}</p>
              <strong>{customerName}</strong>
              <p className="journey-user-meta">{institutionLabel}</p>
            </div>
          </div>
        </header>

        <div className="journey-main">
          <aside className="journey-aside">
            <ol className="journey-steps">
              {wizardSteps.map((item, index) => {
                const state =
                  index < step ? "done" : index === step ? "current" : "upcoming";
                const badge = getStepBadgeStatus(index);
                return (
                  <li
                    key={item.id}
                    className={clsx("journey-step", `journey-step-${state}`)}
                  >
                    <span className="journey-step-marker">{index + 1}</span>
                    <div>
                      <p className="journey-step-label">{item.label}</p>
                      {badge && <StatusBadge status={badge} />}
                    </div>
                  </li>
                );
              })}
            </ol>
            <button
              className="journey-log-toggle"
              onClick={() => setLogOpen((prev) => !prev)}
              aria-expanded={logOpen}
            >
              {logOpen ? "Hide activity log" : "Show activity log"}
            </button>
            {logOpen && (
              <section className="journey-log-panel">
                <div className="journey-panel-head">
                  <div>
                    <h3>Activity</h3>
                    <p>Raseed actions this session.</p>
                  </div>
                </div>
                {messages.length === 0 ? (
                  <p className="journey-helper">
                    Walk through the steps to see live updates here.
                  </p>
                ) : (
                  <ul className="journey-log">
                    {messages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </aside>

          <main className="journey-stage">{stepContent}</main>
        </div>

        <footer className="journey-footer">
          <div>
            <strong>Need help?</strong>
            <p>Use the starter-kit APIs exposed through this widget.</p>
          </div>
          <div>
            <p>Powered by OpenFinance sandbox + Raseed widgets</p>
          </div>
        </footer>
      </div>
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

function pickDisplayBalance(
  balances: BalanceSummary["accounts"][number]["balances"]
) {
  if (!balances.length) return null;
  const available = balances.find((entry) =>
    /available/i.test(entry.type ?? "")
  );
  return available ?? balances[0];
}

function maskAccountIdentifier(value?: string | null) {
  if (!value) return null;
  const trimmed = String(value).replace(/[^A-Za-z0-9]/g, "");
  if (trimmed.length <= 4) {
    return trimmed;
  }
  return `•••• ${trimmed.slice(-4)}`;
}

function extractPartyName(payload: any): string | null {
  const parties = payload?.Data?.Party ?? payload?.Data?.Parties;
  if (!Array.isArray(parties) || !parties.length) return null;
  const primary = parties[0];
  return (
    primary?.Name ||
    primary?.FullName ||
    primary?.Party?.Name ||
    primary?.PartyName ||
    null
  );
}

function extractPartyAvatar(payload: any): string | null {
  const parties = payload?.Data?.Party ?? payload?.Data?.Parties;
  if (!Array.isArray(parties) || !parties.length) return null;
  const primary = parties[0];
  const candidates = [
    primary?.Photo,
    primary?.Party?.Photo,
    primary?.Person?.Photo,
    primary?.ProfileImage,
    primary?.Avatar,
    primary?.Image,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeAvatarCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeAvatarCandidate(candidate: any): string | null {
  if (!candidate) return null;
  if (typeof candidate === "string") {
    if (candidate.startsWith("data:") || /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
    return null;
  }
  if (typeof candidate === "object") {
    if (typeof candidate.url === "string") return candidate.url;
    if (typeof candidate.Url === "string") return candidate.Url;
    if (typeof candidate.URL === "string") return candidate.URL;
    if (typeof candidate.href === "string") return candidate.href;
    const base64 = candidate.Base64 ?? candidate.Data ?? candidate.Content;
    if (typeof base64 === "string" && base64.length) {
      const mime =
        candidate.MediaType ??
        candidate.ContentType ??
        "image/png";
      return `data:${mime};base64,${base64}`;
    }
  }
  return null;
}

function normalizeTransactions(
  entries: any[],
  account: DashboardAccount
): DashboardTransaction[] {
  return entries
    .map((entry, index) => {
      const rawAmount =
        entry?.Amount?.Amount ??
        entry?.TransactionAmount?.Amount ??
        entry?.TransactionAmount ??
        entry?.Amount;
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount)) {
        return null;
      }
      const indicator = (entry?.CreditDebitIndicator ?? "")
        .toString()
        .toLowerCase();
      const direction = indicator === "credit" ? "credit" : "debit";
      const currency =
        entry?.Amount?.Currency ??
        entry?.TransactionAmount?.Currency ??
        account.currency;
      const timestamp =
        entry?.BookingDateTime ||
        entry?.ValueDateTime ||
        entry?.TransactionDateTime ||
        entry?.CreationDateTime ||
        null;
      const description =
        entry?.MerchantDetails?.MerchantName ||
        entry?.TransactionInformation ||
        entry?.ProprietaryBankTransactionCode?.Code ||
        entry?.BankTransactionCode?.Code ||
        (direction === "credit" ? "Incoming payment" : "Payment");
      const category =
        entry?.MerchantDetails?.MerchantCategoryCode ||
        entry?.BankTransactionCode?.SubCode ||
        entry?.ProprietaryBankTransactionCode?.SubCode ||
        entry?.StatementReference?.[0] ||
        entry?.TransactionInformation ||
        null;
      const merchant =
        entry?.MerchantDetails?.MerchantName ||
        entry?.CreditorAccount?.Name ||
        entry?.DebtorAccount?.Name ||
        null;
      const id =
        entry?.TransactionId ||
        entry?.TransactionReference ||
        `${account.accountId}-${index}`;
      return {
        id: String(id),
        accountId: account.accountId,
        description,
        category,
        amount,
        currency,
        direction,
        timestamp,
        merchant,
      };
    })
    .filter(
      (entry): entry is DashboardTransaction => Boolean(entry && entry.amount)
    )
    .sort((a, b) => {
      const dateA = a.timestamp ? Date.parse(a.timestamp) : 0;
      const dateB = b.timestamp ? Date.parse(b.timestamp) : 0;
      return dateB - dateA;
    });
}

function initialsFromName(name: string) {
  if (!name) return "PSU";
  const trimmed = name.trim();
  if (!trimmed) return "PSU";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
