import config from "../config.js";
import { axiosOF } from "../utils.js";
import { CreateClientAssertion } from "./JWTCreator.js";
import {
  fetchLatestAuthorizedConsent,
  isConsentStoreEnabled,
  updateConsentMetadata,
} from "./consentStore.js";

const toUrlEncoded = (payload) =>
  Object.entries(payload)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value ?? "")}`
    )
    .join("&");

const coerceMetadata = (metadata) => {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    return {};
  }
  return { ...metadata };
};

const coerceTokenCache = (metadata) => {
  const raw = metadata?.token_cache;
  if (!raw || Array.isArray(raw) || typeof raw !== "object") {
    return null;
  }
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: raw.expires_at,
    obtained_at: raw.obtained_at,
  };
};

const usableAccessToken = (cache) => {
  if (!cache?.access_token || !cache?.expires_at) {
    return null;
  }
  const expiryMs = Date.parse(cache.expires_at);
  if (!Number.isFinite(expiryMs)) {
    return null;
  }
  const safetyWindowMs = 60_000;
  if (expiryMs - safetyWindowMs <= Date.now()) {
    return null;
  }
  return cache.access_token;
};

const computeExpiryTimestamp = (expiresIn) => {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return new Date(Date.now() + seconds * 1000).toISOString();
};

async function tokenRequest(data) {
  const signedClientAssertion = await CreateClientAssertion();
  const payload = {
    ...data,
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: signedClientAssertion,
  };
  const response = await axiosOF.request({
    method: "post",
    maxBodyLength: Infinity,
    url: config.TOKEN_ENDPOINT,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data: toUrlEncoded(payload),
  });
  return response.data;
}

async function exchangeAuthorizationCode(authCode, codeVerifier) {
  return tokenRequest({
    grant_type: "authorization_code",
    code: authCode,
    code_verifier: codeVerifier,
    redirect_uri: config.REDIRECT_URI,
  });
}

async function refreshAccessToken(refreshToken) {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function callResource(path, accessToken) {
  const url = `${config.RESOURCE_SERVER}${path}`;
  const response = await axiosOF.request({
    method: "get",
    url,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return response.data;
}

const pickDisplayBalance = (balances) => {
  if (!balances?.length) return null;
  return (
    balances.find((entry) => /available/i.test(entry.type ?? "")) ?? balances[0]
  );
};

const maskAccountIdentifier = (value) => {
  if (!value) return null;
  const trimmed = String(value).replace(/[^A-Za-z0-9]/g, "");
  if (trimmed.length <= 4) {
    return trimmed;
  }
  return `•••• ${trimmed.slice(-4)}`;
};

const extractPartyName = (payload) => {
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
};

const extractPartyAvatar = (payload) => {
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
    if (!candidate) continue;
    if (typeof candidate === "string") {
      if (candidate.startsWith("data:") || /^https?:\/\//i.test(candidate)) {
        return candidate;
      }
      continue;
    }
    if (typeof candidate === "object") {
      if (typeof candidate.url === "string") return candidate.url;
      if (typeof candidate.Url === "string") return candidate.Url;
      if (typeof candidate.URL === "string") return candidate.URL;
      if (typeof candidate.href === "string") return candidate.href;
      const base64 =
        candidate.Base64 ?? candidate.Data ?? candidate.Content ?? null;
      if (typeof base64 === "string" && base64.length) {
        const mime =
          candidate.MediaType ?? candidate.ContentType ?? "image/png";
        return `data:${mime};base64,${base64}`;
      }
    }
  }
  return null;
};

const normalizeTransactions = (entries, accountId) =>
  entries
    .map((entry, index) => {
      const rawAmount =
        entry?.Amount?.Amount ??
        entry?.TransactionAmount?.Amount ??
        entry?.MonetaryAmount ??
        null;
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount)) {
        return null;
      }
      const currency =
        entry?.Amount?.Currency ??
        entry?.TransactionAmount?.Currency ??
        "AED";
      const transactionId =
        entry?.TransactionId ??
        entry?.TransactionReference ??
        entry?.PaymentId ??
        `${accountId}-${index}`;
      return {
        transactionId: String(transactionId),
        amount,
        currency,
        creditDebitIndicator: entry?.CreditDebitIndicator ?? "Unknown",
        description:
          entry?.TransactionInformation ??
          entry?.MerchantDetails?.MerchantName ??
          entry?.BankTransactionCode?.Code ??
          entry?.ProprietaryBankTransactionCode?.Code ??
          null,
        bookingDateTime:
          entry?.BookingDateTime ??
          entry?.ValueDateTime ??
          entry?.TransactionDateTime ??
          null,
      };
    })
    .filter(Boolean);

async function fetchAccountsAndBalances(accessToken) {
  const accountsPayload = await callResource(
    "/open-finance/account-information/v1.2/accounts",
    accessToken
  );
  const accounts = accountsPayload?.Data?.Account ?? [];
  const totals = new Map();
  const summaryAccounts = [];
  const dashboardAccounts = [];

  await Promise.all(
    accounts.map(async (account) => {
      const accountId = account?.AccountId ?? account?.account_id;
      if (!accountId) return;
      const balancesPayload = await callResource(
        `/open-finance/account-information/v1.2/accounts/${accountId}/balances`,
        accessToken
      );
      const rows = [];
      const lines = balancesPayload?.Data?.Balance ?? [];
      lines.forEach((line) => {
        const amount = Number(line?.Amount?.Amount);
        if (!Number.isFinite(amount)) return;
        const currency = line?.Amount?.Currency ?? "AED";
        totals.set(currency, (totals.get(currency) ?? 0) + amount);
        rows.push({
          type: line?.Type ?? "Balance",
          amount,
          currency,
        });
      });
      if (!rows.length) return;
      const displayBalance = pickDisplayBalance(rows);
      const name =
        account?.Nickname ||
        account?.Account?.Name ||
        account?.ProductName ||
        accountId;
      summaryAccounts.push({
        accountId,
        name,
        balances: rows,
      });
      dashboardAccounts.push({
        accountId,
        name,
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
      });
    })
  );

  const totalsArray = Array.from(totals.entries()).map(
    ([currency, amount]) => ({
      currency,
      amount,
    })
  );

  return {
    summary: {
      totals: totalsArray,
      accounts: summaryAccounts,
    },
    dashboardAccounts,
  };
}

async function fetchTransactionsByAccount(
  summaryAccounts,
  accessToken,
  maxTransactionsPerAccount
) {
  const map = {};
  await Promise.all(
    summaryAccounts.map(async (account) => {
      const payload = await callResource(
        `/open-finance/account-information/v1.2/accounts/${account.accountId}/transactions`,
        accessToken
      );
      const entries = normalizeTransactions(
        payload?.Data?.Transaction ?? [],
        account.accountId
      );
      map[account.accountId] = entries.slice(0, maxTransactionsPerAccount);
    })
  );
  return map;
}

async function fetchParty(accessToken) {
  try {
    const payload = await callResource(
      "/open-finance/account-information/v1.2/parties",
      accessToken
    );
    return {
      name: extractPartyName(payload),
      avatar: extractPartyAvatar(payload),
    };
  } catch (error) {
    console.warn("[dashboard-auto] Failed to fetch party details", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { name: null, avatar: null };
  }
}

export async function fetchDashboardData(maxTransactionsPerAccount = 20) {
  if (!isConsentStoreEnabled) {
    throw new Error("Consent store disabled; cannot auto-fetch dashboard data.");
  }
  const consent = await fetchLatestAuthorizedConsent();
  if (
    !consent ||
    !consent.consent_id ||
    !consent.auth_code ||
    !consent.code_verifier
  ) {
    throw new Error("No authorized consent available for dashboard data.");
  }

  const metadata = coerceMetadata(consent.metadata);
  const tokenCache = coerceTokenCache(metadata);
  let accessToken = usableAccessToken(tokenCache);
  let refreshToken = tokenCache?.refresh_token ?? null;

  const persistCache = async (cache) => {
    const next = {
      ...metadata,
      token_cache: cache,
    };
    await updateConsentMetadata(consent.consent_id, next);
  };

  if (!accessToken) {
    if (refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed?.access_token ?? null;
      refreshToken = refreshed?.refresh_token ?? refreshToken;
      if (!accessToken) {
        throw new Error("Refresh token did not return an access token.");
      }
      await persistCache({
        access_token: accessToken,
        refresh_token: refreshToken ?? undefined,
        expires_at: computeExpiryTimestamp(refreshed?.expires_in) ?? undefined,
        obtained_at: new Date().toISOString(),
      });
    } else {
      const exchanged = await exchangeAuthorizationCode(
        consent.auth_code,
        consent.code_verifier
      );
      accessToken = exchanged?.access_token ?? null;
      refreshToken = exchanged?.refresh_token ?? null;
      if (!accessToken) {
        throw new Error("Authorization code exchange did not return an access token.");
      }
      await persistCache({
        access_token: accessToken,
        refresh_token: refreshToken ?? undefined,
        expires_at: computeExpiryTimestamp(exchanged?.expires_in) ?? undefined,
        obtained_at: new Date().toISOString(),
      });
    }
  }

  if (!accessToken) {
    throw new Error("Unable to obtain an access token for the active consent.");
  }

  const { summary, dashboardAccounts } = await fetchAccountsAndBalances(
    accessToken
  );
  const transactionsByAccount = await fetchTransactionsByAccount(
    summary.accounts,
    accessToken,
    maxTransactionsPerAccount
  );
  const party = await fetchParty(accessToken);

  return {
    consentId: consent.consent_id,
    balances: summary,
    dashboardAccounts,
    transactionsByAccount,
    party,
  };
}
