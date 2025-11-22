import "../../../loadEnv.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ConsentCreationEvent = {
  consentId?: string;
  consentType?: string;
  redirectUrl?: string;
  codeVerifier?: string;
  metadata?: Record<string, unknown>;
  status?: string;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
const SUPABASE_CONSENTS_TABLE =
  process.env.SUPABASE_CONSENTS_TABLE ?? "consent_sessions";

const supabaseHost = (() => {
  if (!SUPABASE_URL) return undefined;
  try {
    return new URL(SUPABASE_URL).host;
  } catch {
    return SUPABASE_URL;
  }
})();

const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            "x-openfinance-app": "mcp-server",
          },
        },
      })
    : null;

if (!supabase) {
  console.warn(
    "[MCP consent-store] Supabase variables missing; MCP persistence disabled."
  );
} else {
  console.info("[MCP consent-store] Supabase client configured", {
    host: supabaseHost,
    table: SUPABASE_CONSENTS_TABLE,
  });
}

const nowIso = () => new Date().toISOString();

const compact = (record: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );

const safeJson = (value?: Record<string, unknown>) =>
  value && Object.keys(value).length ? value : null;

export const isMcpConsentStoreEnabled = Boolean(supabase);

export type ConsentTokenCache = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  obtained_at?: string;
};

export type StoredConsentRecord = {
  consent_id: string;
  auth_code: string | null;
  code_verifier: string | null;
  status: string | null;
  callback_received_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function recordConsentCreationFromMcp(
  event: ConsentCreationEvent
): Promise<boolean> {
  if (!supabase || !event.consentId) {
    return false;
  }

  try {
    const payload = compact({
      consent_id: event.consentId,
      consent_type: event.consentType,
      redirect_url: event.redirectUrl,
      code_verifier: event.codeVerifier,
      metadata: safeJson(event.metadata),
      status: event.status,
      source: "mcp-server",
      updated_at: nowIso(),
    });

    const { error } = await supabase
      .from(SUPABASE_CONSENTS_TABLE)
      .upsert(payload, { onConflict: "consent_id" });

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error("[MCP consent-store] Failed to persist consent", {
      consentId: event.consentId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function fetchLatestAuthorizedConsent(): Promise<StoredConsentRecord | null> {
  if (!supabase) {
    return null;
  }
  try {
    const { data, error } = await supabase
      .from(SUPABASE_CONSENTS_TABLE)
      .select(
        "consent_id, auth_code, code_verifier, status, callback_received_at, updated_at, metadata"
      )
      .not("auth_code", "is", null)
      .order("callback_received_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data as StoredConsentRecord | null;
  } catch (error) {
    console.error("[MCP consent-store] Failed to fetch latest authorized consent", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function updateConsentMetadata(
  consentId: string,
  metadata: Record<string, unknown> | null
): Promise<void> {
  if (!supabase || !consentId) {
    return;
  }
  try {
    const { error } = await supabase
      .from(SUPABASE_CONSENTS_TABLE)
      .update({ metadata, updated_at: nowIso() })
      .eq("consent_id", consentId);
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("[MCP consent-store] Failed to update consent metadata", {
      consentId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
