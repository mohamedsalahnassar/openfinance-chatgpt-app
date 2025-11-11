import { Router } from 'express';
import {
  addAuthCodeRecord,
  getAuthCodeRecords,
  getLatestAuthCodeRecord,
} from '../services/authCodeStore.js';

const router = Router();

router.post('/debug/auth-code', (req, res) => {
  const { code, code_verifier, consent_id, state, redirect_query = {} } =
    req.body ?? {};

  if (!code || !code_verifier) {
    return res.status(400).json({
      description: 'code and code_verifier are required',
    });
  }

  const record = addAuthCodeRecord({
    code,
    code_verifier,
    consent_id,
    state,
    redirect_query,
  });

  res.status(201).json({ status: 'stored', record });
});

router.get('/debug/auth-code/latest', (_req, res) => {
  const latest = getLatestAuthCodeRecord();
  if (!latest) {
    return res.status(404).json({ description: 'No authorization codes stored yet.' });
  }
  res.json(latest);
});

router.get('/debug/auth-codes', (_req, res) => {
  res.json({ entries: getAuthCodeRecords() });
});

export default router;
