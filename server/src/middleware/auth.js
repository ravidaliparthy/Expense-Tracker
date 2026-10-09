'use strict';
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { normalizeTimezone } = require('../lib/time');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getDb()
      .prepare(
        `SELECT id, email, display_name AS displayName, base_currency AS baseCurrency,
                timezone AS timezone, is_first_login AS isFirstLogin,
                recovery_pin_hash AS recoveryPinHash, created_at AS createdAt
         FROM users WHERE id = ? AND deleted_at IS NULL`
      )
      .get(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });
    user.hasRecoveryPin = Boolean(user.recoveryPinHash);
    user.timezone = normalizeTimezone(user.timezone);
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth, signToken, JWT_SECRET };
