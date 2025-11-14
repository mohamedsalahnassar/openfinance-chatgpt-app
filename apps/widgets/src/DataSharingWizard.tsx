import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
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

      try {
        const partiesPayload = await apiRequest<any>(
          "/open-finance/account-information/v1.2/parties",
          {
            method: "GET",
            headers,
          }
        );
        const partyName = extractPartyName(partiesPayload);
        if (partyName) {
          setAccountHolderName(partyName);
        }
      } catch (partyError) {
        console.warn("[Widget] Failed to fetch party information", partyError);
      }

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
            {balances && dashboardAccounts.length > 0 ? (
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
                onAction={handleDashboardAction}
              />
            ) : balances ? (
              <p className="wizard-info">
                Accounts synced but there was no dashboard data to visualize.
              </p>
            ) : null}
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
