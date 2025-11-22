import { recordConsentCreationFromMcp } from "./consentStore.js";
const asString = (value) => typeof value === "string" ? value : undefined;
const amountRegex = /^(?:0|[1-9]\d*)(?:\.\d{2})$/;
export class OpenFinanceClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    get base() {
        return this.baseUrl;
    }
    buildUrl(path) {
        if (path.startsWith("http"))
            return path;
        return `${this.baseUrl}${path}`;
    }
    normalizeHeaders(headers) {
        const merged = new Headers(headers ?? {});
        merged.set("accept", "application/json");
        return merged;
    }
    async request(path, init = {}, expectJson = true) {
        const url = this.buildUrl(path);
        const headers = this.normalizeHeaders(init.headers);
        const hasBody = typeof init.body !== "undefined" && init.body !== null ? true : false;
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
                    }
                    catch (_error) {
                        return raw;
                    }
                })()
                : null
            : raw;
        if (!response.ok) {
            const detail = typeof payload === "string"
                ? payload
                : payload?.description ||
                    payload?.error ||
                    response.statusText ||
                    "Unexpected error";
            throw new Error(detail);
        }
        return payload;
    }
    async register() {
        return this.request("/register", { method: "GET" });
    }
    async clientCredentials(scope) {
        return this.request("/token/client-credentials", {
            method: "POST",
            body: JSON.stringify({ scope }),
        });
    }
    async createConsent(maxPaymentAmount) {
        if (!amountRegex.test(maxPaymentAmount)) {
            throw new Error("maxPaymentAmount must look like 250.00");
        }
        const result = await this.request("/consent-create/variable-on-demand-payments", {
            method: "POST",
            body: JSON.stringify({ max_payment_amount: maxPaymentAmount }),
        });
        await recordConsentCreationFromMcp({
            consentId: asString(result?.["consent_id"]) ?? asString(result?.["consentId"]),
            consentType: "variable_on_demand_payments",
            redirectUrl: asString(result?.["redirect"]),
            codeVerifier: asString(result?.["code_verifier"]) ??
                asString(result?.["codeVerifier"]),
            metadata: {
                max_payment_amount: maxPaymentAmount,
                base_url: this.baseUrl,
            },
            status: "mcp_recorded",
        });
        return result;
    }
    async createDataConsent(params) {
        if (!Array.isArray(params.permissions) || params.permissions.length === 0) {
            throw new Error("At least one permission is required for data consent.");
        }
        const result = await this.request("/consent-create/bank-data", {
            method: "POST",
            body: JSON.stringify({
                data_permissions: params.permissions,
                valid_from: params.validFrom,
                valid_until: params.validUntil,
            }),
        });
        await recordConsentCreationFromMcp({
            consentId: asString(result?.["consent_id"]) ?? asString(result?.["consentId"]),
            consentType: "bank_data",
            redirectUrl: asString(result?.["redirect"]),
            codeVerifier: asString(result?.["code_verifier"]) ??
                asString(result?.["codeVerifier"]),
            metadata: {
                permissions: params.permissions,
                valid_from: params.validFrom,
                valid_until: params.validUntil,
                base_url: this.baseUrl,
            },
            status: "mcp_recorded",
        });
        return result;
    }
    async exchangeAuthorizationCode(code, codeVerifier) {
        return this.request("/token/authorization-code", {
            method: "POST",
            body: JSON.stringify({ code, code_verifier: codeVerifier }),
        });
    }
    async refreshAccessToken(refreshToken) {
        if (!refreshToken || typeof refreshToken !== "string") {
            throw new Error("refreshToken is required to refresh access.");
        }
        return this.request("/token/refresh-token", {
            method: "POST",
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
    }
    async aggregateBalances(accessToken) {
        const authHeaders = {
            Authorization: `Bearer ${accessToken}`,
        };
        const accountsPayload = await this.request("/open-finance/account-information/v1.2/accounts", {
            method: "GET",
            headers: authHeaders,
        });
        const accounts = accountsPayload?.Data?.Account ?? [];
        const totals = new Map();
        const accountSummaries = [];
        const entries = await Promise.all(accounts.map(async (account) => {
            const accountId = account?.AccountId ?? account?.account_id;
            if (!accountId)
                return null;
            const balancePayload = await this.request(`/open-finance/account-information/v1.2/accounts/${accountId}/balances`, {
                method: "GET",
                headers: authHeaders,
            });
            const balances = [];
            const lines = balancePayload?.Data?.Balance ?? [];
            lines.forEach((line) => {
                const amount = Number(line?.Amount?.Amount);
                if (!Number.isFinite(amount))
                    return;
                const currency = line?.Amount?.Currency ?? "AED";
                totals.set(currency, (totals.get(currency) ?? 0) + amount);
                balances.push({
                    type: line?.Type ?? "Balance",
                    amount,
                    currency,
                });
            });
            if (balances.length === 0)
                return null;
            const name = account?.Nickname ||
                account?.Account?.Name ||
                account?.ProductName ||
                accountId;
            return {
                accountId,
                name,
                balances,
            };
        }));
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
    async fetchTransactionsForAccount(accessToken, accountId) {
        if (!accountId) {
            return [];
        }
        const authHeaders = {
            Authorization: `Bearer ${accessToken}`,
        };
        const payload = await this.request(`/open-finance/account-information/v1.2/accounts/${accountId}/transactions`, {
            method: "GET",
            headers: authHeaders,
        });
        const lines = payload?.Data?.Transaction ?? [];
        return lines
            .map((line, index) => {
            const rawAmount = line?.Amount?.Amount ??
                line?.TransactionAmount?.Amount ??
                line?.MonetaryAmount ??
                null;
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount)) {
                return null;
            }
            const currency = line?.Amount?.Currency ??
                line?.TransactionAmount?.Currency ??
                "AED";
            const transactionId = line?.TransactionId ??
                line?.TransactionReference ??
                line?.PaymentId ??
                `${accountId}-${index}`;
            return {
                transactionId: String(transactionId),
                amount,
                currency,
                creditDebitIndicator: line?.CreditDebitIndicator ?? "Unknown",
                description: line?.TransactionInformation ??
                    line?.MerchantDetails?.MerchantName ??
                    line?.BankTransactionCode?.Code ??
                    line?.ProprietaryBankTransactionCode?.Code ??
                    null,
                bookingDateTime: line?.BookingDateTime ??
                    line?.ValueDateTime ??
                    line?.TransactionDateTime ??
                    null,
            };
        })
            .filter((entry) => entry !== null);
    }
}
