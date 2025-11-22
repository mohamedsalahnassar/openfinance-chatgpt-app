import { Router } from "express";
import { fetchDashboardData } from "../services/dashboardAuto.js";
import { isConsentStoreEnabled } from "../services/consentStore.js";
import { logError } from "../logger.js";

const router = Router();

router.get("/dashboard/auto-data", async (req, res) => {
  if (!isConsentStoreEnabled) {
    return res
      .status(503)
      .json({ error: "Consent store unavailable; dashboard auto-data disabled." });
  }
  const maxParam = Number(req.query.maxTransactions ?? "20");
  const maxTransactionsPerAccount = Number.isFinite(maxParam)
    ? Math.min(100, Math.max(1, maxParam))
    : 20;
  try {
    const payload = await fetchDashboardData(maxTransactionsPerAccount);
    return res.json(payload);
  } catch (error) {
    logError("[dashboard-auto] Failed to fetch dashboard data", {
      message: error.message,
    });
    return res.status(500).json({
      error: "Unable to fetch dashboard data automatically.",
      detail: error.message,
    });
  }
});

export default router;
