import { useCallback, useEffect, useState } from "react";
import AccountsDashboard from "./AccountsDashboard";
import { apiRequest, BalanceSummary } from "./lib/apiClient";
import {
  AutoDashboardPayload,
  DashboardAccount,
  TransactionsMap,
} from "./lib/dashboardTypes";

type LoadStatus = "loading" | "error" | "ready";

export default function DashboardAuto() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<BalanceSummary | null>(null);
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [transactions, setTransactions] = useState<TransactionsMap>({});
  const [partyName, setPartyName] = useState<string | null>(null);
  const [partyAvatar, setPartyAvatar] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const transactionsStatus: "loading" | "error" | "success" =
    status === "loading" ? "loading" : status === "error" ? "error" : "success";

  const loadDashboard = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const payload = await apiRequest<AutoDashboardPayload>(
        "/dashboard/auto-data?maxTransactions=20"
      );
      setBalances(payload.balances);
      setAccounts(payload.dashboardAccounts);
      setTransactions(payload.transactionsByAccount ?? {});
      setPartyName(payload.party?.name ?? null);
      setPartyAvatar(payload.party?.avatar ?? null);
      setSelectedAccountId(payload.dashboardAccounts[0]?.accountId ?? null);
      setStatus("ready");
    } catch (loadError) {
      setStatus("error");
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to fetch dashboard data."
      );
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="journey-root">
      <div className="journey-shell">
        <header className="journey-header">
          <span className="journey-brand">Raseed</span>
          <p className="journey-punchline">
            Instant account aggregation from your last consent.
          </p>
        </header>

        {status === "loading" && (
          <section className="journey-panel journey-panel-center">
            <div className="journey-wait-card">
              <div className="journey-spinner" />
              <p className="journey-helper">Gathering accounts and balances…</p>
            </div>
          </section>
        )}

        {status === "error" && (
          <section className="journey-panel journey-panel-center">
            <div className="journey-wait-card">
              <p className="journey-helper journey-helper-error">
                {error ?? "Unable to load dashboard data."}
              </p>
              <button className="journey-primary" onClick={loadDashboard}>
                Retry
              </button>
            </div>
          </section>
        )}

        {status === "ready" && balances && accounts.length > 0 && (
          <AccountsDashboard
            accounts={accounts}
            summary={balances}
            transactionsByAccount={transactions}
            transactionsStatus={transactionsStatus}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            onSync={loadDashboard}
            accountHolderName={partyName}
            accountHolderAvatar={partyAvatar}
            transactionsError={transactionsStatus === "error" ? error : null}
            isSyncing={status === "loading"}
            canSync={true}
            onAction={() => {}}
          />
        )}
      </div>
    </div>
  );
}
