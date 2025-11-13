import { useState } from "react";
import { API_BASE, apiRequest } from "./lib/apiClient";

type PaymentConsentResponse = {
  redirect: string;
  consent_id: string;
  code_verifier: string;
};

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type PaymentResponse = {
  paymentId: string;
  status: string;
  amount: string;
  currency: string;
  jwt: string;
};

type FlowStage = "amount" | "authenticating" | "callback" | "processing" | "success" | "error";

export default function PaymentWizard() {
  // Current stage
  const [stage, setStage] = useState<FlowStage>("amount");

  // Payment data
  const [paymentAmount, setPaymentAmount] = useState("100.00");
  const [consentData, setConsentData] = useState<PaymentConsentResponse | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [paymentResult, setPaymentResult] = useState<PaymentResponse | null>(null);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidAmount = (value: string) =>
    /^(?:0|[1-9]\d*)(\.\d{2})$/.test(value.trim());

  // Handle the main flow: create consent and open redirect
  const handleProceed = async () => {
    if (!isValidAmount(paymentAmount)) {
      setError("Please enter a valid amount (e.g., 100.00)");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStage("authenticating");

    try {
      // Create payment consent
      const payload = await apiRequest<PaymentConsentResponse>(
        "/consent-create/single-payment",
        {
          method: "POST",
          body: JSON.stringify({
            payment_amount: paymentAmount,
          }),
        }
      );

      setConsentData(payload);
      
      // Auto-open the redirect URL
      window.open(payload.redirect, "_blank", "noopener,noreferrer");
      
      // Move to callback stage
      setStage("callback");
    } catch (err) {
      setError((err as Error).message);
      setStage("error");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle callback URL submission
  const handleCallbackSubmit = async () => {
    if (!callbackUrl.trim()) {
      setError("Please paste the callback URL");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStage("processing");

    try {
      // Parse the callback URL
      const url = new URL(callbackUrl);
      
      // Check if token is directly provided
      const directToken = url.searchParams.get("token");
      let accessToken = "";
      
      if (directToken) {
        accessToken = directToken;
      } else {
        // Standard OAuth flow
        const code = url.searchParams.get("code");
        if (!code) {
          throw new Error("No authorization code or token found in callback URL");
        }

        if (!consentData?.code_verifier) {
          throw new Error("No code verifier available");
        }

        // Exchange code for token
        const tokenPayload = await apiRequest<TokenResponse>(
          "/token/authorization-code",
          {
            method: "POST",
            body: JSON.stringify({
              code: code,
              code_verifier: consentData.code_verifier,
            }),
          }
        );
        accessToken = tokenPayload.access_token;
      }

      // Initiate payment
      const response = await apiRequest<any>(
        "/open-finance/payment/v1.2/payments",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            payment_amount: paymentAmount,
            consent_id: consentData!.consent_id,
          }),
        }
      );

      // Parse payment response
      let paymentId = "N/A";
      let status = "Pending";
      let responseText = "";
      
      if (typeof response === "string") {
        responseText = response;
        try {
          const parts = response.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            paymentId = payload.message?.Data?.PaymentId || paymentId;
            status = payload.message?.Data?.Status || status;
          }
        } catch {
          // Keep defaults
        }
      } else if (response.message?.Data) {
        paymentId = response.message.Data.PaymentId || paymentId;
        status = response.message.Data.Status || status;
        responseText = JSON.stringify(response, null, 2);
      } else if (response.Data) {
        paymentId = response.Data.PaymentId || paymentId;
        status = response.Data.Status || status;
        responseText = JSON.stringify(response, null, 2);
      } else {
        responseText = JSON.stringify(response, null, 2);
      }
      
      setPaymentResult({
        paymentId,
        status,
        amount: paymentAmount,
        currency: "AED",
        jwt: responseText,
      });
      
      setStage("success");
    } catch (err) {
      setError((err as Error).message);
      setStage("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStage("amount");
    setPaymentAmount("100.00");
    setConsentData(null);
    setCallbackUrl("");
    setPaymentResult(null);
    setError(null);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="raseed-brand">
          <span className="raseed-wordmark">💸 PAYMENT</span>
        </div>
      </header>

      {/* Amount Entry Stage */}
      {stage === "amount" && (
        <section className="panel">
          <div className="stage-head">
            <h2>Open Finance Payment</h2>
            <p>Send money securely through AlTareq Model Bank</p>
          </div>

          <div className="consent-preview">
            <label className="field">
              <span>Payment Amount (AED)</span>
              <input
                type="text"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="100.00"
                className="amount-input"
                autoFocus
              />
              <p className="info-text">
                Enter amount in format: 100.00 (two decimal places)
              </p>
            </label>

            <div className="info-box">
              <p><strong>What happens next:</strong></p>
              <ol style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
                <li>We'll create a payment consent</li>
                <li>You'll authenticate at AlTareq Model Bank</li>
                <li>Paste the callback URL to complete payment</li>
              </ol>
            </div>

            {error && <p className="error-text">{error}</p>}

            <button
              className="primary large consent-primary"
              onClick={handleProceed}
              disabled={!isValidAmount(paymentAmount) || isLoading}
            >
              {isLoading ? "Processing..." : `Continue with ${paymentAmount} AED →`}
            </button>
          </div>
        </section>
      )}

      {/* Authenticating Stage */}
      {stage === "authenticating" && (
        <section className="panel">
          <div className="redirect-step">
            <div className="redirect-overlay">
              <div className="redirect-spinner"></div>
              <h2 style={{ margin: 0 }}>Opening Model Bank...</h2>
              <p style={{ opacity: 0.9 }}>Please authenticate in the new window</p>
            </div>
          </div>
        </section>
      )}

      {/* Callback Entry Stage */}
      {stage === "callback" && (
        <section className="panel">
          <div className="stage-head">
            <h2>Paste Callback URL</h2>
            <p>After authenticating, paste the redirect URL from your browser</p>
          </div>

          <div className="consent-preview">
            <div className="payment-summary">
              <h3>Payment Details</h3>
              <div className="summary-row">
                <span>Amount:</span>
                <strong>{paymentAmount} AED</strong>
              </div>
              <div className="summary-row">
                <span>Type:</span>
                <strong>Single Instant Payment</strong>
              </div>
              {consentData && (
                <div className="summary-row">
                  <span>Consent ID:</span>
                  <code>{consentData.consent_id.substring(0, 20)}...</code>
                </div>
              )}
            </div>

            <div className="info-box">
              <p><strong>Expected callback URL format:</strong></p>
              <code className="url-example" style={{ fontSize: "0.85rem", display: "block", marginTop: "8px" }}>
                http://localhost:1411/client/sip-success?consent=xxxxx&token=xxxxx
              </code>
              <p style={{ margin: "8px 0 0", fontSize: "0.9em" }}>OR</p>
              <code className="url-example" style={{ fontSize: "0.85rem", display: "block", marginTop: "4px" }}>
                http://localhost:1411/hackathon-redirect?code=xxxxx&state=xxxxx
              </code>
            </div>

            <label className="field">
              <span>Callback URL</span>
              <textarea
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                placeholder="Paste the complete URL from your browser..."
                rows={3}
                style={{ fontFamily: "monospace", fontSize: "0.9rem" }}
              />
            </label>

            {error && <p className="error-text">{error}</p>}

            <div className="consent-actions">
              <button
                className="primary large"
                onClick={handleCallbackSubmit}
                disabled={!callbackUrl.trim() || isLoading}
              >
                {isLoading ? "Processing Payment..." : "Complete Payment →"}
              </button>
              <button className="ghost" onClick={handleReset}>
                Start Over
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Processing Stage */}
      {stage === "processing" && (
        <section className="panel">
          <div className="redirect-step">
            <div className="redirect-overlay">
              <div className="redirect-spinner"></div>
              <h2 style={{ margin: 0 }}>Initiating Payment...</h2>
              <p style={{ opacity: 0.9 }}>Please wait while we process your payment</p>
            </div>
          </div>
        </section>
      )}

      {/* Success Stage */}
      {stage === "success" && paymentResult && (
        <section className="panel">
          <div className="stage-head">
            <h2>Payment Successful!</h2>
            <p>Your payment has been initiated</p>
          </div>

          <div className="consent-preview">
            <div className="success-icon" style={{ margin: "0 auto 24px" }}>✓</div>
            
            <div className="consent-summary">
              <h3>Payment Confirmation</h3>
              <p className="consent-small">Your transaction is being processed</p>
              
              <div style={{ marginTop: "16px" }}>
                <div className="summary-row" style={{ borderColor: "rgba(255,255,255,0.2)" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>Amount:</span>
                  <strong>{paymentResult.amount} {paymentResult.currency}</strong>
                </div>
                <div className="summary-row" style={{ borderColor: "rgba(255,255,255,0.2)" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>Status:</span>
                  <strong className="status-pending">{paymentResult.status}</strong>
                </div>
                <div className="summary-row" style={{ borderColor: "rgba(255,255,255,0.2)", borderBottom: "none" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>Payment ID:</span>
                  <code style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}>
                    {paymentResult.paymentId}
                  </code>
                </div>
              </div>
            </div>

            {paymentResult.jwt && (
              <details className="technical-details">
                <summary>View payment response</summary>
                <pre className="payload" style={{ fontSize: "0.75rem", maxHeight: "200px", overflow: "auto" }}>
                  {paymentResult.jwt}
                </pre>
              </details>
            )}

            <button className="primary large consent-primary" onClick={handleReset}>
              Make Another Payment
            </button>
          </div>
        </section>
      )}

      {/* Error Stage */}
      {stage === "error" && (
        <section className="panel">
          <div className="stage-head">
            <h2>Payment Failed</h2>
            <p>There was an issue processing your payment</p>
          </div>

          <div className="consent-preview">
            <div className="error-icon" style={{ margin: "0 auto 24px" }}>✗</div>
            
            <div className="info-box" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
              <p><strong>Error:</strong></p>
              <p style={{ color: "#991b1b", marginTop: "8px" }}>{error}</p>
            </div>

            <div className="consent-actions">
              <button className="primary large" onClick={handleReset}>
                Try Again
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
