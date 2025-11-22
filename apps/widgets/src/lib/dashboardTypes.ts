export type DashboardAccount = {
  accountId: string;
  name: string;
  type?: string | null;
  productName?: string | null;
  currency: string;
  availableBalance: number;
  availableBalanceType?: string | null;
  accountNumber?: string | null;
};

export type DashboardTransaction = {
  id: string;
  accountId: string;
  description: string;
  category?: string | null;
  amount: number;
  currency: string;
  direction: "credit" | "debit";
  timestamp?: string | null;
  merchant?: string | null;
};

export type TransactionsMap = Record<string, DashboardTransaction[]>;

export type AutoDashboardPayload = {
  consentId: string;
  balances: import("./apiClient").BalanceSummary;
  dashboardAccounts: DashboardAccount[];
  transactionsByAccount: TransactionsMap;
  party?: {
    name?: string | null;
    avatar?: string | null;
  } | null;
};
