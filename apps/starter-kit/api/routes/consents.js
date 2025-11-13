import { Router } from "express";
import {
  getConsentSnapshot,
  isConsentStoreEnabled,
} from "../services/consentStore.js";
import { logError } from "../logger.js";

const router = Router();

router.get("/:consentId", async (req, res) => {
  const consentId = req.params.consentId;
  if (!consentId) {
    return res.status(400).json({ error: "consentId is required" });
  }
  if (!isConsentStoreEnabled) {
    return res.status(503).json({ error: "Consent store unavailable" });
  }
  try {
    const snapshot = await getConsentSnapshot(consentId);
    if (!snapshot) {
      return res.status(404).json({ error: "Consent not found" });
    }
    return res.json({ consent: snapshot });
  } catch (error) {
    logError("[consents] Failed to fetch consent snapshot", {
      consentId,
      message: error.message,
    });
    return res.status(500).json({ error: "Failed to fetch consent snapshot" });
  }
});

export default router;
