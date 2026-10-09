'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, audit, persistUserToSeed } = require('../db');
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
  };
}

router.post('/register', (req, res, next) => {
  try {
    const body = validate(registerSchema, req.body);
    const safeTz = normalizeTimezone(body.timezone);
    const db = getDb();

    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = bcrypt.hashSync(body.password, 10);
    const info = db
      .prepare(
        `INSERT INTO users (email, password_hash, display_name, timezone, base_currency)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(body.email, hash, body.displayName, safeTz, body.baseCurrency);

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
                timezone, is_first_login AS isFirstLogin, created_at AS createdAt
         FROM users WHERE id = ?`
      )
      .get(userId);

    const rawUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
    const userCats = db.prepare(`SELECT * FROM categories WHERE user_id = ?`).all(userId);
    persistUserToSeed(rawUser, userCats);

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
                created_at AS createdAt
         FROM users WHERE email = ? AND deleted_at IS NULL`
      )
      .get(body.email);

    if (!user || !bcrypt.compareSync(body.password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/** PATCH /api/auth/profile — update displayName / timezone / baseCurrency. */
router.patch('/profile', requireAuth, (req, res, next) => {
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
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

/** Marks onboarding as complete (called by the tour's final step). */
router.post('/onboarding/complete', requireAuth, (req, res, next) => {
  try {
    getDb()
      .prepare(`UPDATE users SET is_first_login = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .run(req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
