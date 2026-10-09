'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, audit, persistUserToSeed, pushToTurso } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { validate, registerSchema, loginSchema, profileSchema } = require('../lib/validate');
const { normalizeTimezone } = require('../lib/time');

const router = express.Router();

const SYSTEM_CATEGORIES = [
  ['Food', '#F97316', '🍔'], ['Travel', '#3B82F6', '✈️'], ['Shopping', '#EC4899', '🛍️'],
  ['Utilities', '#F59E0B', '💡'], ['Health', '#10B981', '💊'], ['Entertainment', '#8B5CF6', '🎬'],
  ['Salary', '#22C55E', '💰'], ['Freelance', '#06B6D4', '🧑‍💻'], ['Bonus', '#EAB308', '🎉'],
];

function publicUser(u) {
  return {
    id: u.id, email: u.email, displayName: u.displayName,
    baseCurrency: u.baseCurrency, timezone: normalizeTimezone(u.timezone),
    isFirstLogin: !!u.isFirstLogin, createdAt: u.createdAt,
    hasRecoveryPin: Boolean(u.recovery_pin_hash || u.recoveryPinHash),
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const body = validate(registerSchema, req.body);
    const safeTz = normalizeTimezone(body.timezone);
    const db = getDb();

    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = bcrypt.hashSync(body.password, 10);
    const pinHash = body.recoveryPin && body.recoveryPin.trim()
      ? bcrypt.hashSync(body.recoveryPin.trim(), 10)
      : null;
    const info = db
      .prepare(
        `INSERT INTO users (email, password_hash, display_name, timezone, base_currency, recovery_pin_hash)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(body.email, hash, body.displayName, safeTz, body.baseCurrency, pinHash);

    const userId = info.lastInsertRowid;
    const insertCat = db.prepare(
      `INSERT INTO categories (user_id, name, color_hex, icon, is_system) VALUES (?, ?, ?, ?, 1)`
    );
    const seedAll = db.transaction(() => {
      for (const [name, color, icon] of SYSTEM_CATEGORIES) insertCat.run(userId, name, color, icon);
    });
    seedAll();
    audit(userId, 'category', userId, 'create', { systemSeeded: true });

    const user = db
      .prepare(
        `SELECT id, email, display_name AS displayName, base_currency AS baseCurrency,
                timezone, is_first_login AS isFirstLogin, recovery_pin_hash AS recoveryPinHash,
                created_at AS createdAt
         FROM users WHERE id = ?`
      )
      .get(userId);

    const rawUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
    const userCats = db.prepare(`SELECT * FROM categories WHERE user_id = ?`).all(userId);
    persistUserToSeed(rawUser, userCats);

    await pushToTurso(
      `INSERT OR REPLACE INTO users (id, email, password_hash, display_name, base_currency, timezone, is_first_login, recovery_pin_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rawUser.id, rawUser.email, rawUser.password_hash, rawUser.display_name, rawUser.base_currency, rawUser.timezone, rawUser.is_first_login, rawUser.recovery_pin_hash || null, rawUser.created_at, rawUser.updated_at],
      db
    );
    for (const cat of userCats) {
      await pushToTurso(
        `INSERT OR REPLACE INTO categories (id, user_id, name, color_hex, icon, is_system, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cat.id, cat.user_id, cat.name, cat.color_hex, cat.icon, cat.is_system, cat.is_archived, cat.created_at, cat.updated_at],
        db
      );
    }

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) { next(err); }
});

router.post('/login', (req, res, next) => {
  try {
    const body = validate(loginSchema, req.body);
    const db = getDb();
    const user = db
      .prepare(
        `SELECT id, email, password_hash AS passwordHash, display_name AS displayName,
                base_currency AS baseCurrency, timezone, is_first_login AS isFirstLogin,
                recovery_pin_hash AS recoveryPinHash, created_at AS createdAt
         FROM users WHERE email = ? AND deleted_at IS NULL`
      )
      .get(body.email);

    if (!user || !bcrypt.compareSync(body.password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/change-password
 * Authenticated endpoint: allows logged-in user to update their password from Settings.
 * Requires verifying the existing password for security.
 */
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Current password and new password (min 8 characters) required' });
    }
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(req.user.id);
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect current password' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(hash, req.user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    persistUserToSeed(updated);
    await pushToTurso(`UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, [hash, req.user.id], db);
    res.json({ ok: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/set-pin
 * Authenticated endpoint: allows logged-in user to configure or update their Secret Recovery PIN in Settings.
 */
router.post('/set-pin', requireAuth, async (req, res, next) => {
  try {
    const { pin } = req.body || {};
    if (!pin || typeof pin !== 'string' || pin.trim().length < 4 || pin.trim().length > 16) {
      return res.status(400).json({ error: 'Recovery PIN must be between 4 and 16 characters' });
    }
    const db = getDb();
    const pinHash = bcrypt.hashSync(pin.trim(), 10);
    db.prepare(`UPDATE users SET recovery_pin_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(pinHash, req.user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    persistUserToSeed(updated);
    await pushToTurso(`UPDATE users SET recovery_pin_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, [pinHash, req.user.id], db);
    res.json({ ok: true, message: 'Secret recovery PIN saved successfully' });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/reset-password
 * Public recovery endpoint: strictly requires the Secret Recovery PIN set in Settings.
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, recoveryPin, newPassword } = req.body || {};
    if (!email || !recoveryPin || !newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Email, Secret Recovery PIN, and new password (min 8 characters) required' });
    }
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').get(email);
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email' });
    }
    if (!user.recovery_pin_hash || !bcrypt.compareSync(String(recoveryPin).trim(), user.recovery_pin_hash)) {
      return res.status(401).json({ error: 'Invalid Secret Recovery PIN. Enter the PIN configured in Settings.' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(hash, user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    persistUserToSeed(updated);
    await pushToTurso(`UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, [hash, user.id], db);
    res.json({ token: signToken(updated), user: publicUser(updated), message: 'Password reset successful' });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/** PATCH /api/auth/profile — update displayName / timezone / baseCurrency. */
router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const body = validate(profileSchema, req.body);
    const db = getDb();
    const sets = [];
    const args = [];
    if (body.displayName !== undefined) { sets.push('display_name = ?'); args.push(body.displayName); }
    if (body.timezone !== undefined) { sets.push('timezone = ?'); args.push(normalizeTimezone(body.timezone)); }
    if (body.baseCurrency !== undefined) { sets.push('base_currency = ?'); args.push(body.baseCurrency); }
    sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...args, req.user.id);

    const user = db.prepare(
      `SELECT id, email, display_name AS displayName, base_currency AS baseCurrency,
              timezone, is_first_login AS isFirstLogin, created_at AS createdAt
       FROM users WHERE id = ?`
    ).get(req.user.id);
    const rawUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    if (rawUser) persistUserToSeed(rawUser);
    await pushToTurso(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...args, req.user.id], db);
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

/** Marks onboarding as complete (called by the tour's final step). */
router.post('/onboarding/complete', requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    db.prepare(`UPDATE users SET is_first_login = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .run(req.user.id);
    await pushToTurso(
      `UPDATE users SET is_first_login = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      [req.user.id],
      db
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
