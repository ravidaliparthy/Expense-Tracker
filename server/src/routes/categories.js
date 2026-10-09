'use strict';
const express = require('express');
const { getDb, audit, pushToTurso } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate, categoryCreateSchema, categoryPatchSchema } = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

/** SELECT — archived/soft-deleted categories hidden by default, history intact. */
router.get('/', (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const rows = getDb().prepare(
      `SELECT id, name, color_hex AS colorHex, icon, is_system AS isSystem,
              is_archived AS isArchived, created_at AS createdAt
       FROM categories
       WHERE user_id = ? AND deleted_at IS NULL
         ${includeArchived ? '' : 'AND is_archived = 0'}
       ORDER BY is_system DESC, name COLLATE NOCASE ASC`
    ).all(req.user.id);
    res.json(rows.map((r) => ({ ...r, isSystem: !!r.isSystem, isArchived: !!r.isArchived })));
  } catch (err) { next(err); }
});

/** POST — dynamic custom category creation (e.g. "Vacation 2023"). */
router.post('/', async (req, res, next) => {
  try {
    const body = validate(categoryCreateSchema, req.body);
    const db = getDb();
    const dup = db.prepare(
      `SELECT id FROM categories WHERE user_id = ? AND name = ? AND deleted_at IS NULL`
    ).get(req.user.id, body.name);
    if (dup) return res.status(409).json({ error: `Category "${body.name}" already exists` });

    const info = db.prepare(
      `INSERT INTO categories (user_id, name, color_hex, icon) VALUES (?, ?, ?, ?)`
    ).run(req.user.id, body.name, body.colorHex, body.icon ?? null);

    audit(req.user.id, 'category', info.lastInsertRowid, 'create', body);
    const catRow = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(info.lastInsertRowid);
    if (catRow) {
      await pushToTurso(
        `INSERT OR REPLACE INTO categories (id, user_id, name, color_hex, icon, is_system, is_archived, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [catRow.id, catRow.user_id, catRow.name, catRow.color_hex, catRow.icon, catRow.is_system, catRow.is_archived, catRow.created_at, catRow.updated_at, catRow.deleted_at],
        db
      );
    }
    res.status(201).json({
      id: info.lastInsertRowid, name: body.name, colorHex: body.colorHex,
      icon: body.icon ?? null, isSystem: false, isArchived: false,
    });
  } catch (err) { next(err); }
});

/** PATCH — rename / recolor / archive toggle. */
router.patch('/:id', async (req, res, next) => {
  try {
    const body = validate(categoryPatchSchema, req.body);
    const db = getDb();
    const cat = db.prepare(
      `SELECT * FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    ).get(req.params.id, req.user.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    if (cat.is_system && body.isArchived !== undefined) {
      return res.status(400).json({ error: 'System categories cannot be archived' });
    }
    if (cat.is_system && body.name !== undefined && body.name.trim() !== cat.name) {
      return res.status(400).json({ error: 'System category names cannot be changed' });
    }

    const sets = []; const args = [];
    if (body.name !== undefined)      { sets.push('name = ?');      args.push(body.name); }
    if (body.colorHex !== undefined)  { sets.push('color_hex = ?'); args.push(body.colorHex); }
    if (body.icon !== undefined)      { sets.push('icon = ?');      args.push(body.icon); }
    if (body.isArchived !== undefined){ sets.push('is_archived = ?'); args.push(body.isArchived ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...args, cat.id);
    await pushToTurso(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, [...args, cat.id], db);

    audit(req.user.id, 'category', cat.id, body.isArchived !== undefined ? 'archive' : 'update', body);
    const updated = db.prepare(
      `SELECT id, name, color_hex AS colorHex, icon, is_system AS isSystem,
              is_archived AS isArchived FROM categories WHERE id = ?`
    ).get(cat.id);
    res.json({ ...updated, isSystem: !!updated.isSystem, isArchived: !!updated.isArchived });
  } catch (err) { next(err); }
});

/**
 * DELETE — SOFT DELETE. Past expenses keep working because:
 *  1) expenses.category_id still points at the row (it's only hidden from pickers), and
 *  2) expenses carry category_name_snapshot, so even a hard purge can't blank history.
 * Idempotent: an already-deleted category returns 204 again.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const cat = db.prepare(
      `SELECT * FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
    ).get(req.params.id, req.user.id);
    if (!cat) return res.status(204).end();
    if (cat.is_system) return res.status(400).json({ error: 'System categories cannot be deleted' });

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE categories SET deleted_at = ?, is_archived = 1,
              updated_at = ? WHERE id = ?`
    ).run(now, now, cat.id);
    await pushToTurso(
      `UPDATE categories SET deleted_at = ?, is_archived = 1, updated_at = ? WHERE id = ?`,
      [now, now, cat.id],
      db
    );

    audit(req.user.id, 'category', cat.id, 'soft_delete', { name: cat.name });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
