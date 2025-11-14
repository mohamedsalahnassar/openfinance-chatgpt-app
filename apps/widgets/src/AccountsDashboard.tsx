import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  X,
} from "lucide-react";
import { BalanceSummary } from "./lib/apiClient";
import {
  DashboardAccount,
  DashboardTransaction,
  TransactionsMap,
} from "./lib/dashboardTypes";

type StepStatus = "idle" | "loading" | "success" | "error";

type AccountsDashboardProps = {
  accounts: DashboardAccount[];
  summary: BalanceSummary | null;
  transactionsByAccount: TransactionsMap;
  transactionsStatus: StepStatus;
  transactionsError?: string | null;
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  onSync: () => void;
  accountHolderName?: string | null;
  onAction?: (action: "pay" | "transfer" | "receive") => void;
  accountHolderAvatar?: string | null;
  isSyncing?: boolean;
  canSync?: boolean;
};

const quickActions: { id: "pay" | "transfer" | "receive"; label: string }[] = [
  { id: "pay", label: "Pay" },
  { id: "transfer", label: "Transfer" },
  { id: "receive", label: "Receive" },
];

const gradientPalette = [
  "linear-gradient(135deg, #e8f466, #d4e654)",
  "linear-gradient(135deg, #a8e6cf, #7ed8b5)",
  "linear-gradient(135deg, #ffd4a3, #ffbc7a)",
  "linear-gradient(135deg, #d2d8ff, #a8b4ff)",
];

const emojiMatchers = [
  { pattern: /(coffee|cafe|espresso)/i, emoji: "☕️" },
  { pattern: /(shop|store|mall|amazon|nike)/i, emoji: "🛍️" },
  { pattern: /(salary|payroll|deposit|income)/i, emoji: "💰" },
  { pattern: /(subscription|spotify|music)/i, emoji: "🎵" },
  { pattern: /(movie|cinema|video|megogo)/i, emoji: "🎬" },
  { pattern: /(gym|fitness|membership)/i, emoji: "🏋️" },
  { pattern: /(transfer|wire|payment)/i, emoji: "💸" },
];

export default function AccountsDashboard({
  accounts,
  summary,
  transactionsByAccount,
  transactionsStatus,
  transactionsError,
  selectedAccountId,
  onSelectAccount,
  onSync,
  accountHolderName,
  onAction,
  accountHolderAvatar,
  isSyncing = false,
  canSync = true,
}: AccountsDashboardProps) {
  const [obscureBalance, setObscureBalance] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const activeIndex = Math.max(
    0,
    accounts.findIndex((account) => account.accountId === selectedAccountId)
  );
  const [carouselIndex, setCarouselIndex] = useState(
    activeIndex >= 0 ? activeIndex : 0
  );

  useEffect(() => {
    if (activeIndex >= 0) {
      setCarouselIndex(activeIndex);
    } else if (accounts.length) {
      setCarouselIndex(0);
    }
  }, [activeIndex, accounts.length]);

  const activeAccount = accounts[carouselIndex] ?? accounts[0] ?? null;

  useEffect(() => {
    if (activeAccount && activeAccount.accountId !== selectedAccountId) {
      onSelectAccount(activeAccount.accountId);
    }
  }, [activeAccount, onSelectAccount, selectedAccountId]);

  if (!accounts.length || !activeAccount) {
    return <p className="journey-helper">No accounts returned yet.</p>;
  }

  const greetingName = accountHolderName?.split(" ")[0] ?? "there";

  const totalBalanceLabel = useMemo(() => {
    const totals = summary?.totals ?? [];
    if (!totals.length) return "—";
    if (totals.length === 1) {
      return formatCurrency(totals[0].amount, totals[0].currency);
    }
    return totals
      .map((item) => formatCurrency(item.amount, item.currency))
      .join(" · ");
  }, [summary?.totals]);

  const activeTransactions =
    transactionsByAccount[activeAccount.accountId] ?? [];
  const previewTransactions = activeTransactions.slice(0, 5);
  const transactionsMessage =
    transactionsStatus === "loading"
      ? "Fetching latest activity…"
      : transactionsStatus === "error"
        ? transactionsError ?? "Transactions unavailable."
        : "";

  const handleCarouselChange = (nextIndex: number) => {
    if (!accounts.length) return;
    const normalized =
      (nextIndex + accounts.length) % Math.max(accounts.length, 1);
    setCarouselIndex(normalized);
    const target = accounts[normalized];
    if (target) {
      onSelectAccount(target.accountId);
    }
  };

  const handleAction = (action: "pay" | "transfer" | "receive") => {
    onAction?.(action);
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-card-accounts">
          <div className="dashboard-head">
            <div className="dashboard-avatar">
              {accountHolderAvatar ? (
                <img
                  src={accountHolderAvatar}
                  alt={accountHolderName ?? "Customer avatar"}
                />
              ) : (
                initialsFor(accountHolderName ?? activeAccount.name)
              )}
            </div>
            <div>
              <p className="dashboard-eyebrow">Welcome back</p>
              <h3 className="dashboard-title">Hi, {greetingName}!</h3>
            </div>
            <div className="dashboard-head-actions">
              <button
                className="dashboard-icon-button"
                type="button"
                onClick={() => onSync()}
                aria-label="Refresh balances"
                disabled={!canSync || isSyncing}
                title={
                  !canSync
                    ? "Complete consent before syncing"
                    : isSyncing
                      ? "Sync in progress"
                      : "Refresh balances"
                }
              >
                <RefreshCw size={16} />
              </button>
              <button
                className={clsx(
                  "dashboard-icon-button",
                  obscureBalance && "dashboard-icon-button-active"
                )}
                type="button"
                onClick={() => setObscureBalance((prev) => !prev)}
                aria-label="Toggle balance visibility"
              >
                <Eye size={16} />
              </button>
            </div>
          </div>

          <div className="dashboard-balance-panel">
            <span className="meta-label">Total balance</span>
            <p className="dashboard-balance-value">
              {obscureBalance ? "••••••" : totalBalanceLabel}
            </p>
            {summary?.totals && summary.totals.length > 1 && (
              <p className="dashboard-balance-subtext">
                Multiple currencies detected
              </p>
            )}
          </div>

          <div className="dashboard-carousel">
            <div
              className="dashboard-carousel-track"
              style={{
                transform: `translateX(-${carouselIndex * 100}%)`,
              }}
            >
              {accounts.map((account, index) => (
                <article
                  key={account.accountId}
                  className="dashboard-carousel-card"
                  style={{
                    backgroundImage:
                      gradientPalette[index % gradientPalette.length],
                  }}
                >
                  <div className="dashboard-card-body">
                    <div className="dashboard-card-row">
                      <div>
                        <span className="dashboard-card-label">
                          {account.type || "Account"}
                        </span>
                        <p className="dashboard-card-title">{account.name}</p>
                      </div>
                      <span className="dashboard-card-label">
                        {account.currency}
                      </span>
                    </div>
                    <div className="dashboard-card-row">
                      <div>
                        <span className="dashboard-card-label">
                          Available balance
                        </span>
                        <p className="dashboard-card-value">
                          {obscureBalance
                            ? "•••••"
                            : formatCurrency(
                                account.availableBalance,
                                account.currency
                              )}
                        </p>
                      </div>
                    </div>
                    <div>
                      <span className="dashboard-card-label">
                        Account number
                      </span>
                      <p className="dashboard-card-number">
                        {account.accountNumber ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="dashboard-card-decoration" />
                </article>
              ))}
            </div>
            {accounts.length > 1 && (
              <>
                <button
                  className="dashboard-carousel-nav dashboard-carousel-prev"
                  type="button"
                  onClick={() => handleCarouselChange(carouselIndex - 1)}
                  aria-label="Previous account"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="dashboard-carousel-nav dashboard-carousel-next"
                  type="button"
                  onClick={() => handleCarouselChange(carouselIndex + 1)}
                  aria-label="Next account"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
            {accounts.length > 1 && (
              <div className="dashboard-carousel-dots">
                {accounts.map((account, index) => (
                  <button
                    key={account.accountId}
                    className={clsx(
                      "dashboard-dot",
                      index === carouselIndex && "dashboard-dot-active"
                    )}
                    aria-label={`Show ${account.name}`}
                    onClick={() => handleCarouselChange(index)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="dashboard-quick-actions">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="dashboard-quick-action"
                onClick={() => handleAction(action.id)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>

        <section className="dashboard-card dashboard-card-transactions">
          <header className="dashboard-transactions-head">
            <div>
              <p className="dashboard-eyebrow">Recent activity</p>
              <h3 className="dashboard-title">
                {activeAccount.name} activity
              </h3>
              {transactionsMessage && (
                <p className="dashboard-helper">{transactionsMessage}</p>
              )}
            </div>
            <button
              type="button"
              className="dashboard-link-button"
              disabled={!activeTransactions.length}
              onClick={() => setShowAllTransactions(true)}
            >
              View all
            </button>
          </header>
          {transactionsStatus === "loading" && !activeTransactions.length ? (
            <div className="dashboard-empty-state">
              <p>Fetching transactions…</p>
            </div>
          ) : !activeTransactions.length ? (
            <div className="dashboard-empty-state">
              <p>No transactions returned for this account.</p>
            </div>
          ) : (
            <ul className="dashboard-transaction-list">
              {previewTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {showAllTransactions && (
        <div className="dashboard-overlay" role="dialog" aria-modal="true">
          <div className="dashboard-overlay-panel">
            <header className="dashboard-overlay-head">
              <div>
                <p className="dashboard-eyebrow">All transactions</p>
                <h3 className="dashboard-title">{activeAccount.name}</h3>
              </div>
              <button
                type="button"
                className="dashboard-icon-button"
                onClick={() => setShowAllTransactions(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>
            <div className="dashboard-overlay-scroll">
              {!activeTransactions.length ? (
                <div className="dashboard-empty-state">
                  <p>No transactions to show.</p>
                </div>
              ) : (
                <ul className="dashboard-transaction-list expanded">
                  {activeTransactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: DashboardTransaction }) {
  const amountLabel = formatCurrency(transaction.amount, transaction.currency);
  const sign = transaction.direction === "credit" ? "+" : "-";
  const when = formatTimestamp(transaction.timestamp);
  return (
    <li className="dashboard-transaction-row">
      <div className="dashboard-transaction-icon">
        {pickEmoji(transaction)}
      </div>
      <div className="dashboard-transaction-body">
        <p className="dashboard-transaction-title">
          {transaction.description}
        </p>
        <p className="dashboard-transaction-meta">
          {transaction.category ?? "Activity"}
          {when ? ` • ${when}` : ""}
        </p>
      </div>
      <p
        className={clsx(
          "dashboard-transaction-amount",
          transaction.direction === "credit"
            ? "dashboard-transaction-credit"
            : "dashboard-transaction-debit"
        )}
      >
        {sign}
        {amountLabel}
      </p>
    </li>
  );
}

function formatCurrency(value: number, currency: string) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(Math.abs(value));
}

function formatTimestamp(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${sameDay ? "Today" : dayFormatter.format(date)} • ${timeFormatter.format(date)}`;
}

function initialsFor(name: string) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function pickEmoji(transaction: DashboardTransaction) {
  const haystack = `${transaction.description} ${transaction.category ?? ""}`;
  for (const matcher of emojiMatchers) {
    if (matcher.pattern.test(haystack)) {
      return matcher.emoji;
    }
  }
  return transaction.direction === "credit" ? "⬆️" : "⬇️";
}
