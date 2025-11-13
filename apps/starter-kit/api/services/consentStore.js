import "../../../../loadEnv.js";
import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { logDebug, logError, logInfo, logWarn } from "../logger.js";

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

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            "x-openfinance-app": "starter-kit",
          },
        },
      })
    : null;

if (!supabase) {
  logWarn("[consent-store] Supabase credentials missing; persistence disabled.");
} else {
  logInfo("[consent-store] Supabase persistence enabled", {
    host: supabaseHost,
    table: SUPABASE_CONSENTS_TABLE,
  });
}

const nowIso = () => new Date().toISOString();

const dropUndefined = (record) =>
  Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );

const safeJson = (value) => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "object" && Object.keys(value).length === 0)
  ) {
    return null;
  }
  return value;
};

const noop = async () => false;

const withSupabase = supabase
  ? async (record, context) => {
      try {
        const payload = dropUndefined({
          ...record,
          updated_at: nowIso(),
        });

        const { error } = await supabase
          .from(SUPABASE_CONSENTS_TABLE)
          .upsert(payload, {
            onConflict: "consent_id",
          });

        if (error) {
          throw error;
        }

        logDebug("[consent-store] Event persisted", {
          context,
          consentId: record.consent_id,
          status: record.status,
        });
        return true;
      } catch (error) {
        logError("[consent-store] Failed to persist event", {
          context,
          consentId: record.consent_id,
          message: error.message,
        });
        return false;
      }
    }
  : noop;

export const isConsentStoreEnabled = Boolean(supabase);

export const recordConsentCreation = async ({
  consentId,
  consentType,
  redirectUrl,
  codeVerifier,
  bankLabel,
  metadata,
  status,
}) => {
  if (!consentId) {
    return false;
  }
  return withSupabase(
    {
      consent_id: consentId,
      consent_type: consentType,
      redirect_url: redirectUrl,
      code_verifier: codeVerifier,
      bank_label: bankLabel,
      metadata: safeJson(metadata),
      status: status ?? "redirect_ready",
      source: "starter-kit",
    },
    "consent_creation"
  );
};

const decodeBase64Json = (value) => {
  if (typeof value !== "string" || !value.length) {
    return null;
  }
  try {
    const padded = value.padEnd(
      value.length + ((4 - (value.length % 4)) % 4),
      "="
    );
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (error) {
    logWarn("[consent-store] Unable to decode state payload", {
      message: error.message,
    });
    return null;
  }
};

const flattenQuery = (query) => {
  if (!query || typeof query !== "object") {
    return null;
  }
  const result = {};
  for (const [key, raw] of Object.entries(query)) {
    if (Array.isArray(raw)) {
      result[key] = raw.join(",");
    } else if (raw !== undefined) {
      result[key] = raw;
    }
  }
  return Object.keys(result).length ? result : null;
};

export const recordConsentCallback = async ({
  code,
  state,
  issuer,
  error,
  errorDescription,
  query,
}) => {
  const statePayload = decodeBase64Json(state);
  const consentId =
    statePayload?.consent_id ||
    statePayload?.consentId ||
    statePayload?.ConsentId;

  if (!consentId) {
    logWarn(
      "[consent-store] Skipping callback persistence – consent_id missing in state."
    );
    return false;
  }

  const callbackStatus = error
    ? "callback_error"
    : code
    ? "authorization_code_received"
    : "callback_received";

  return withSupabase(
    {
      consent_id: consentId,
      auth_code: code ?? null,
      issuer: issuer ?? null,
      state_payload: safeJson(statePayload),
      callback_query: safeJson(flattenQuery(query)),
      callback_error:
        error || errorDescription
          ? safeJson({
              error,
              error_description: errorDescription,
            })
          : null,
      callback_received_at: nowIso(),
      status: callbackStatus,
    },
    "consent_callback"
  );
};
