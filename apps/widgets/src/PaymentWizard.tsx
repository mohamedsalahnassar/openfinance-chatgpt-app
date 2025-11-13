import { useState } from "react";
import clsx from "clsx";
import { API_BASE, apiRequest } from "./lib/apiClient";

type StepStatus = "idle" | "loading" | "success" | "error" | "ready";

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

const statusLabel: Record<StepStatus, string> = {
  idle: "Not Started",
  loading: "Processing...",
  success: "✓ Complete",
  error: "✗ Failed",
  ready: "Ready",
};

function StatusBadge({ status }: { status: StepStatus }) {
  return (
    <span
      className={clsx(
        "status-badge",
        status === "success" && "status-success",
        status === "loading" && "status-loading",
        status === "error" && "status-error",
        status === "ready" && "status-ready"
      )}
    >
      {statusLabel[status]}
    </span>
  );
}

export default function PaymentWizard() {
  // Current step (1-4)
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Payment Amount
  const [paymentAmount, setPaymentAmount] = useState("100.00");
  const [step1Status, setStep1Status] = useState<StepStatus>("idle");

  // Step 2: Consent Creation (background)
  const [consentData, setConsentData] = useState<PaymentConsentResponse | null>(null);
  const [step2Status, setStep2Status] = useState<StepStatus>("idle");

  // Step 3: Bank Authentication
  const [step3Status, setStep3Status] = useState<StepStatus>("idle");

  // Step 4: Token Exchange
  const [callbackUrl, setCallbackUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [step4Status, setStep4Status] = useState<StepStatus>("idle");

  // Step 5: Payment Initiation
  const [paymentResult, setPaymentResult] = useState<PaymentResponse | null>(null);
  const [step5Status, setStep5Status] = useState<StepStatus>("idle");

  // Messages
  const [messages, setMessages] = useState<string[]>([]);

  const recordMessage = (message: string) => {
    setMessages((prev) => [
      `${new Date().toLocaleTimeString()}: ${message}`,
      ...prev,
    ]);
  };

  const isValidAmount = (value: string) =>
    /^(?:0|[1-9]\d*)(\.\d{2})$/.test(value.trim());

  // Step 1: Confirm payment amount
  const handleConfirmAmount = () => {
    if (!isValidAmount(paymentAmount)) {
      recordMessage("Please enter a valid amount (e.g., 100.00)");
      return;
    }
    setStep1Status("success");
    setCurrentStep(2);
    recordMessage(`Payment amount confirmed: ${paymentAmount} AED`);
    // Automatically proceed to Step 2
    handleCreateConsent();
  };

  // Step 2: Create payment consent (background)
  const handleCreateConsent = async () => {
    setStep2Status("loading");
    recordMessage("Creating payment consent...");

    try {
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
      setStep2Status("success");
      setStep3Status("ready");
      setCurrentStep(3);
      recordMessage("Payment consent created! Redirect URL ready.");
    } catch (error) {
      setStep2Status("error");
      recordMessage(`Consent creation failed: ${(error as Error).message}`);
    }
  };

  // Step 3: Open bank authentication
  const handleOpenBank = () => {
    if (!consentData?.redirect) {
      recordMessage("No redirect URL available");
      return;
    }
    window.open(consentData.redirect, "_blank", "noopener,noreferrer");
    setStep3Status("success");
    setStep4Status("ready");
    setCurrentStep(4);
    recordMessage("Opened bank authentication in new tab");
  };

  // Step 4: Parse callback URL and exchange for token
  const handleExchangeToken = async () => {
    if (!callbackUrl.trim()) {
      recordMessage("Please paste the callback URL");
      return;
    }

    setStep4Status("loading");
    recordMessage("Parsing callback URL...");

    try {
      // Parse the callback URL
      const url = new URL(callbackUrl);
      
      // Check if token is directly provided (direct token flow)
      const directToken = url.searchParams.get("token");
      
      if (directToken) {
        recordMessage("Direct access token found in URL!");
        setAccessToken(directToken);
        setStep4Status("success");
        setCurrentStep(5);
        recordMessage(`Access token obtained: ${directToken.substring(0, 10)}...`);
        
        // Automatically initiate payment
        handleInitiatePayment(directToken);
        return;
      }
      
      // Otherwise, look for authorization code (standard OAuth flow)
      const code = url.searchParams.get("code");

      if (!code) {
        throw new Error("No authorization code or token found in callback URL. Expected either 'code' or 'token' parameter.");
      }

      if (!consentData?.code_verifier) {
        throw new Error("No code verifier available");
      }

      recordMessage(`Authorization code extracted: ${code.substring(0, 10)}...`);

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

      setAccessToken(tokenPayload.access_token);
      setStep4Status("success");
      setCurrentStep(5);
      recordMessage("Access token obtained successfully!");
      
      // Automatically initiate payment
      handleInitiatePayment(tokenPayload.access_token);
    } catch (error) {
      setStep4Status("error");
      recordMessage(`Token exchange failed: ${(error as Error).message}`);
    }
  };

  // Step 5: Initiate payment
  const handleInitiatePayment = async (token: string) => {
    setStep5Status("loading");
    recordMessage("Initiating payment...");

    try {
      if (!consentData?.consent_id) {
        throw new Error("No consent ID available");
      }

      const response = await apiRequest<any>(
        "/open-finance/payment/v1.2/payments",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            payment_amount: paymentAmount,
            consent_id: consentData.consent_id,
          }),
        }
      );

      // The starter-kit returns the JWT response from the bank
      // Try to extract payment details from the response
      let paymentId = "N/A";
      let status = "Pending";
      let responseText = "";
      
      if (typeof response === "string") {
        // It's a JWT string
        responseText = response;
        // Try to decode the JWT payload to get payment details
        try {
          const parts = response.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            paymentId = payload.message?.Data?.PaymentId || paymentId;
            status = payload.message?.Data?.Status || status;
          }
        } catch {
          // If decoding fails, keep defaults
        }
      } else if (response.message?.Data) {
        // Parsed response object
        paymentId = response.message.Data.PaymentId || paymentId;
        status = response.message.Data.Status || status;
        responseText = JSON.stringify(response, null, 2);
      } else if (response.Data) {
        // Alternative response format
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
      
      setStep5Status("success");
      recordMessage(`Payment initiated successfully! Payment ID: ${paymentId}`);
    } catch (error) {
      setStep5Status("error");
      recordMessage(`Payment initiation failed: ${(error as Error).message}`);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header compact">
        <div>
          <h1>💸 Open Finance Payment</h1>
          <p className="lede">
            Send a secure payment through the AlTareq Model Bank
          </p>
        </div>
        <div className="step-indicator">
          Step {currentStep} of 5
        </div>
      </header>

      {/* Progress Tracker */}
      <div className="progress-tracker">
        <div className={clsx("progress-step", currentStep >= 1 && "active")}>
          <div className="step-number">1</div>
          <div className="step-label">
            <strong>Amount</strong>
            <StatusBadge status={step1Status} />
          </div>
        </div>
        <div className={clsx("progress-step", currentStep >= 2 && "active")}>
          <div className="step-number">2</div>
          <div className="step-label">
            <strong>Consent</strong>
            <StatusBadge status={step2Status} />
          </div>
        </div>
        <div className={clsx("progress-step", currentStep >= 3 && "active")}>
          <div className="step-number">3</div>
          <div className="step-label">
            <strong>Authenticate</strong>
            <StatusBadge status={step3Status} />
          </div>
        </div>
        <div className={clsx("progress-step", currentStep >= 4 && "active")}>
          <div className="step-number">4</div>
          <div className="step-label">
            <strong>Authorize</strong>
            <StatusBadge status={step4Status} />
          </div>
        </div>
        <div className={clsx("progress-step", currentStep >= 5 && "active")}>
          <div className="step-number">5</div>
          <div className="step-label">
            <strong>Payment</strong>
            <StatusBadge status={step5Status} />
          </div>
        </div>
      </div>

      {/* Step 1: Payment Amount */}
      {currentStep === 1 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Step 1: Enter Payment Amount</h2>
            <p>Specify the amount you want to send in AED</p>
          </div>

          <div className="info-box">
            <p>
              <strong>💡 What you're creating:</strong>
            </p>
            <ul>
              <li>A single instant payment to a predefined creditor</li>
              <li>Amount must be in AED with two decimal places</li>
              <li>The payment will be processed immediately upon authorization</li>
            </ul>
          </div>

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
              Enter amount in format: 100.00 (two decimal places required)
            </p>
          </label>

          <button
            className="primary large"
            onClick={handleConfirmAmount}
            disabled={!isValidAmount(paymentAmount)}
          >
            Continue with {paymentAmount} AED →
          </button>
        </section>
      )}

      {/* Step 2: Consent Creation (shown briefly) */}
      {currentStep === 2 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Step 2: Creating Payment Consent</h2>
            <p>
              Processing PAR request for {paymentAmount} AED payment
            </p>
          </div>
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Creating payment consent...</p>
            {step2Status === "error" && (
              <button className="ghost" onClick={handleCreateConsent}>
                Retry
              </button>
            )}
          </div>
        </section>
      )}

      {/* Step 3: Authenticate at Bank */}
      {currentStep === 3 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Step 3: Authenticate at AlTareq Model Bank</h2>
            <p>Click below to authorize the {paymentAmount} AED payment</p>
          </div>

          {consentData?.redirect && (
            <>
              <div className="info-box">
                <p>
                  <strong>What happens next:</strong>
                </p>
                <ol>
                  <li>You'll be redirected to AlTareq Model Bank</li>
                  <li>Sign in with your test credentials</li>
                  <li>Select the account to debit</li>
                  <li>Review and authorize the {paymentAmount} AED payment</li>
                  <li>Copy the callback URL from your browser</li>
                </ol>
              </div>

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
                <div className="summary-row">
                  <span>Consent ID:</span>
                  <code>{consentData.consent_id.substring(0, 20)}...</code>
                </div>
              </div>

              <button className="primary large" onClick={handleOpenBank}>
                Open Bank Authentication →
              </button>

              <details className="technical-details">
                <summary>Show redirect URL</summary>
                <code className="url-display">{consentData.redirect}</code>
              </details>
            </>
          )}
        </section>
      )}

      {/* Step 4: Paste Callback URL */}
      {currentStep === 4 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Step 4: Paste Callback URL</h2>
            <p>
              After authorizing the payment, copy the callback URL from your browser
            </p>
          </div>

          <div className="info-box">
            <p>
              <strong>Where to find the callback URL:</strong>
            </p>
            <p>
              After authorizing at the Model Bank, you'll be redirected to one of these formats:
            </p>
            <code className="url-example">
              http://localhost:1411/hackathon-redirect?code=xxxxx&state=xxxxx...
            </code>
            <p style={{ margin: "8px 0", fontSize: "0.9em" }}>OR</p>
            <code className="url-example">
              http://localhost:1411/client/sip-success?consent=xxxxx&token=xxxxx
            </code>
            <p style={{ marginTop: "8px" }}>Copy the entire URL from your browser's address bar and paste it below.</p>
          </div>

          <label className="field">
            <span>Callback URL</span>
            <input
              type="text"
              value={callbackUrl}
              onChange={(e) => setCallbackUrl(e.target.value)}
              placeholder="http://localhost:1411/hackathon-redirect?code=..."
              className="url-input"
            />
          </label>

          <button
            className="primary large"
            onClick={handleExchangeToken}
            disabled={step4Status === "loading" || !callbackUrl.trim()}
          >
            {step4Status === "loading" ? "Processing..." : "Authorize Payment →"}
          </button>

          {step4Status === "error" && (
            <p className="error-text">
              Failed to exchange token. Make sure you pasted the complete callback URL.
            </p>
          )}
        </section>
      )}

      {/* Step 5: Payment Success */}
      {currentStep === 5 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Step 5: Payment Initiated</h2>
            <p>Your payment has been processed</p>
          </div>

          {step5Status === "loading" && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Initiating payment...</p>
            </div>
          )}

          {step5Status === "success" && paymentResult && (
            <div className="success-card">
              <div className="success-icon">✓</div>
              <h3>Payment Successful!</h3>
              
              <div className="payment-details">
                <div className="detail-row">
                  <span>Amount:</span>
                  <strong>{paymentResult.amount} {paymentResult.currency}</strong>
                </div>
                <div className="detail-row">
                  <span>Status:</span>
                  <strong className="status-pending">{paymentResult.status}</strong>
                </div>
                <div className="detail-row">
                  <span>Payment ID:</span>
                  <code>{paymentResult.paymentId}</code>
                </div>
              </div>

              <div className="info-box success">
                <p>
                  ✓ Your payment of <strong>{paymentResult.amount} AED</strong> has been initiated successfully!
                </p>
                <p>
                  The payment is now <strong>Pending</strong> and will be processed by the bank.
                </p>
              </div>

              {paymentResult.jwt && (
                <details className="technical-details">
                  <summary>Show payment response</summary>
                  <pre className="payload">{paymentResult.jwt}</pre>
                </details>
              )}

              <button
                className="primary large"
                onClick={() => {
                  setCurrentStep(1);
                  setPaymentAmount("100.00");
                  setConsentData(null);
                  setCallbackUrl("");
                  setAccessToken("");
                  setPaymentResult(null);
                  setStep1Status("idle");
                  setStep2Status("idle");
                  setStep3Status("idle");
                  setStep4Status("idle");
                  setStep5Status("idle");
                  recordMessage("Starting new payment flow");
                }}
              >
                Make Another Payment
              </button>
            </div>
          )}

          {step5Status === "error" && (
            <div className="error-card">
              <div className="error-icon">✗</div>
              <h3>Payment Failed</h3>
              <p className="error-text">
                The payment could not be initiated. Please try again or contact support.
              </p>
              <button
                className="ghost"
                onClick={() => {
                  setCurrentStep(1);
                  recordMessage("Restarting payment flow");
                }}
              >
                Start Over
              </button>
            </div>
          )}
        </section>
      )}

      {/* Activity Log */}
      <section className="panel wide">
        <div className="panel-head">
          <h3>Activity Log</h3>
        </div>
        {messages.length === 0 ? (
          <p className="lede muted">No activity yet.</p>
        ) : (
          <ul className="log">
            {messages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

