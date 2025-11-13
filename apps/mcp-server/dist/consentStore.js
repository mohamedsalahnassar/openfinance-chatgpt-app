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
