import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DataSharingWizard from "./DataSharingWizard";
import "./styles.css";

const DEBUG_CONTAINER_ID = "openfinance-widget-debug";

function renderDebugOverlay(title: string, error: unknown) {
  let overlay = document.getElementById(DEBUG_CONTAINER_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = DEBUG_CONTAINER_ID;
    overlay.style.position = "fixed";
    overlay.style.zIndex = "9999";
    overlay.style.top = "16px";
    overlay.style.right = "16px";
    overlay.style.maxWidth = "320px";
    overlay.style.background = "rgba(23, 23, 23, 0.95)";
    overlay.style.color = "#fff";
    overlay.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco";
    overlay.style.fontSize = "12px";
    overlay.style.padding = "12px";
    overlay.style.borderRadius = "12px";
    overlay.style.boxShadow = "0 20px 50px rgba(0,0,0,0.4)";
    overlay.style.whiteSpace = "pre-wrap";
    overlay.style.wordBreak = "break-word";
    document.body.appendChild(overlay);
  }

  const formatted =
    error instanceof Error
      ? `${error.message}\n${error.stack ?? ""}`
      : typeof error === "string"
        ? error
        : JSON.stringify(error, null, 2);

  overlay.textContent = `[${title}] ${formatted}`;
}

function attachGlobalDebugHandlers() {
  if ((window as any).__openfinanceDebugAttached) return;
  (window as any).__openfinanceDebugAttached = true;

  window.addEventListener("error", (event) => {
    renderDebugOverlay("window.onerror", event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    renderDebugOverlay("unhandledrejection", event.reason);
  });
}

attachGlobalDebugHandlers();

try {
  const variant = window.__OPENFINANCE_WIDGET_VARIANT__ ?? "orchestrator";
  const RootComponent =
    variant === "data-wizard" ? DataSharingWizard : App;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <RootComponent />
    </React.StrictMode>
  );
} catch (error) {
  renderDebugOverlay("render failure", error);
  throw error;
}
