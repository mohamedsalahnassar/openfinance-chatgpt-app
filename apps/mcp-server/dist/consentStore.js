import "../../../loadEnv.js";
import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
const SUPABASE_CONSENTS_TABLE = process.env.SUPABASE_CONSENTS_TABLE ?? "consent_sessions";
const supabaseHost = (() => {
    if (!SUPABASE_URL)
        return undefined;
    try {
        return new URL(SUPABASE_URL).host;
    }
    catch {
        return SUPABASE_URL;
    }
})();
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
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
    console.warn("[MCP consent-store] Supabase variables missing; MCP persistence disabled.");
}
else {
    console.info("[MCP consent-store] Supabase client configured", {
        host: supabaseHost,
        table: SUPABASE_CONSENTS_TABLE,
    });
}
const nowIso = () => new Date().toISOString();
const compact = (record) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
const safeJson = (value) => value && Object.keys(value).length ? value : null;
export const isMcpConsentStoreEnabled = Boolean(supabase);
export async function recordConsentCreationFromMcp(event) {
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
    }
    catch (error) {
        console.error("[MCP consent-store] Failed to persist consent", {
            consentId: event.consentId,
            message: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}
export async function fetchLatestAuthorizedConsent() {
    if (!supabase) {
        return null;
    }
    try {
        const { data, error } = await supabase
            .from(SUPABASE_CONSENTS_TABLE)
            .select("consent_id, auth_code, code_verifier, status, callback_received_at, updated_at, metadata")
            .not("auth_code", "is", null)
            .order("callback_received_at", { ascending: false, nullsFirst: false })
            .order("updated_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
        if (error) {
            throw error;
        }
        return data;
    }
    catch (error) {
        console.error("[MCP consent-store] Failed to fetch latest authorized consent", {
            message: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
export async function updateConsentMetadata(consentId, metadata) {
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
    }
    catch (error) {
        console.error("[MCP consent-store] Failed to update consent metadata", {
            consentId,
            message: error instanceof Error ? error.message : String(error),
        });
    }
}
