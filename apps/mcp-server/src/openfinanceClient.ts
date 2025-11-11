type JsonValue = string | number | boolean | null | JsonValue[] | JsonRecord;
type JsonRecord = { [key: string]: JsonValue };

export type BalanceLine = {
  type: string;
  amount: number;
  currency: string;
};

export type AccountBalances = {
  accountId: string;
  name: string;
  balances: BalanceLine[];
};

export type BalanceSummary = {
  totals: {
    currency: string;
    amount: number;
  }[];
  accounts: AccountBalances[];
};

const amountRegex = /^(?:0|[1-9]\d*)(?:\.\d{2})$/;

export class OpenFinanceClient {
  constructor(private readonly baseUrl: string) {}

  get base() {
    return this.baseUrl;
  }

  private buildUrl(path: string) {
    if (path.startsWith("http")) return path;
    return `${this.baseUrl}${path}`;
  }

  private normalizeHeaders(headers: HeadersInit | undefined): Headers {
    const merged = new Headers(headers ?? {});
    merged.set("accept", "application/json");
    return merged;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    expectJson = true
  ): Promise<T> {
    const url = this.buildUrl(path);
    const headers = this.normalizeHeaders(init.headers);

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
    const payload = expectJson
      ? raw
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch (_error) {
              return raw;
            }
          })()
        : null
      : raw;

    if (!response.ok) {
      const detail =
        typeof payload === "string"
          ? payload
          : payload?.description ||
            payload?.error ||
            response.statusText ||
            "Unexpected error";
      throw new Error(detail);
    }

    return payload as T;
  }

  async register(): Promise<JsonRecord> {
    return this.request<JsonRecord>("/register", { method: "GET" });
  }

  async clientCredentials(scope: string): Promise<JsonRecord> {
    return this.request<JsonRecord>("/token/client-credentials", {
      method: "POST",
      body: JSON.stringify({ scope }),
    });
  }

  async createConsent(maxPaymentAmount: string): Promise<JsonRecord> {
    if (!amountRegex.test(maxPaymentAmount)) {
      throw new Error("maxPaymentAmount must look like 250.00");
    }
    return this.request<JsonRecord>(
      "/consent-create/variable-on-demand-payments",
      {
        method: "POST",
        body: JSON.stringify({ max_payment_amount: maxPaymentAmount }),
      }
    );
  }

  async createDataConsent(params: {
    permissions: string[];
    validFrom?: string;
    validUntil?: string;
  }): Promise<JsonRecord> {
    if (!Array.isArray(params.permissions) || params.permissions.length === 0) {
      throw new Error("At least one permission is required for data consent.");
    }

    return this.request<JsonRecord>("/consent-create/bank-data", {
      method: "POST",
      body: JSON.stringify({
        data_permissions: params.permissions,
        valid_from: params.validFrom,
        valid_until: params.validUntil,
      }),
    });
  }

  async exchangeAuthorizationCode(
    code: string,
    codeVerifier: string
  ): Promise<JsonRecord> {
    return this.request<JsonRecord>("/token/authorization-code", {
      method: "POST",
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
    });
  }

  async aggregateBalances(accessToken: string): Promise<BalanceSummary> {
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
    };

    const accountsPayload = await this.request<any>(
      "/open-finance/account-information/v1.2/accounts",
      {
        method: "GET",
        headers: authHeaders,
      }
    );

    const accounts: any[] = accountsPayload?.Data?.Account ?? [];
    const totals = new Map<string, number>();
    const accountSummaries: AccountBalances[] = [];

    const entries = await Promise.all(
      accounts.map(async (account: any) => {
        const accountId = account?.AccountId ?? account?.account_id;
        if (!accountId) return null;
        const balancePayload = await this.request<any>(
          `/open-finance/account-information/v1.2/accounts/${accountId}/balances`,
          {
            method: "GET",
            headers: authHeaders,
          }
        );

        const balances: BalanceLine[] = [];
        const lines: any[] = balancePayload?.Data?.Balance ?? [];
        lines.forEach((line) => {
          const amount = Number(line?.Amount?.Amount);
          if (!Number.isFinite(amount)) return;
          const currency = line?.Amount?.Currency ?? "AED";
          totals.set(currency, (totals.get(currency) ?? 0) + amount);
          balances.push({
            type: line?.Type ?? "Balance",
            amount,
            currency,
          });
        });

        if (balances.length === 0) return null;

        const name =
          account?.Nickname ||
          account?.Account?.Name ||
          account?.ProductName ||
          accountId;

        return {
          accountId,
          name,
          balances,
        } as AccountBalances;
      })
    );

    entries.forEach((entry) => {
      if (entry) {
        accountSummaries.push(entry);
      }
    });

    return {
      totals: Array.from(totals.entries()).map(([currency, amount]) => ({
        currency,
        amount,
      })),
      accounts: accountSummaries,
    };
  }
}
