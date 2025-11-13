declare global {
  interface Window {
    __OPENFINANCE_API_BASE__?: string;
    __OPENFINANCE_WIDGET_VARIANT__?: string;
  }
}

const DEFAULT_BASE = "http://localhost:1411";

const runtimeBase =
  typeof window !== "undefined" ? window.__OPENFINANCE_API_BASE__ : undefined;

export const API_BASE = (
  import.meta.env.VITE_STARTER_KIT_BASE_URL ??
  runtimeBase ??
  DEFAULT_BASE
).replace(/\/$/, "");

export type ConsentResponse = {
  redirect: string;
  consent_id: string;
  code_verifier: string;
};

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type BalanceItem = {
  currency: string;
  amount: number;
};

export type AccountBalance = {
  accountId: string;
  name: string;
  balances: {
    type: string;
    amount: number;
    currency: string;
  }[];
};

export type BalanceSummary = {
  totals: BalanceItem[];
  accounts: AccountBalance[];
};

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("ngrok-skip-browser-warning", "true");
  const hasBody =
    typeof init.body !== "undefined" && init.body !== null ? true : false;
  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch (networkError) {
    const detail =
      networkError instanceof Error
        ? `${networkError.name}: ${networkError.message}`
        : String(networkError);
    console.error("[Widget] Network request failed", {
      url,
      path,
      method: init.method ?? "GET",
      detail,
    });
    throw new Error(
      `Network error calling ${path} at ${API_BASE}: ${detail}. ` +
        "ChatGPT must be able to reach your Starter Kit server (e.g. via port forwarding or a tunnel)."
    );
  }

  const raw = await response.text();
  let data: any = null;

  if (raw && raw.length) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      data = raw;
    }
  }

  if (!response.ok) {
    const reason =
      typeof data === "string"
        ? data
        : data?.description ||
          data?.error ||
          data?.message ||
          response.statusText;
    console.error("[Widget] API returned an error", {
      url,
      path,
      method: init.method ?? "GET",
      status: response.status,
      reason,
      payload: data,
    });
    throw new Error(
      `HTTP ${response.status} ${response.statusText} on ${path}: ${reason}`
    );
  }

  return data as T;
}
