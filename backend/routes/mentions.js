const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// POST /api/mentions — Créer une mention (@tag)
router.post('/', authenticate, (req, res) => {
  const { product_id, to_user_id, message } = req.body;
  if (!product_id || !to_user_id) return res.status(400).json({ error: 'product_id et to_user_id requis' });
  if (Number(to_user_id) === req.user.id) return res.status(400).json({ error: 'Impossible de se tagger soi-même' });

  const db = getDb();
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  const toUser = db.prepare('SELECT id FROM users WHERE id = ?').get(to_user_id);
  if (!toUser) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const result = db.prepare(
    'INSERT INTO product_mentions (product_id, from_user_id, to_user_id, message) VALUES (?, ?, ?, ?)'
  ).run(product_id, req.user.id, to_user_id, message?.trim() || null);

  res.json({ id: result.lastInsertRowid, ok: true });
});

// GET /api/mentions/users — Liste des utilisateurs pour le sélecteur
router.get('/users', authenticate, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, email, display_name, avatar, role FROM users WHERE id != ? ORDER BY display_name, email'
  ).all(req.user.id);
  res.json(users);
});

// GET /api/mentions/notifications — Notifications de l'utilisateur connecté
router.get('/notifications', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT pm.id, pm.message, pm.is_read, pm.created_at,
           p.id as product_id, p.reference, p.designation, p.supplier,
           u.display_name as from_name, u.email as from_email
    FROM product_mentions pm
    JOIN products p ON pm.product_id = p.id
    JOIN users u ON pm.from_user_id = u.id
    WHERE pm.to_user_id = ?
    ORDER BY pm.created_at DESC
    LIMIT 50
  `).all(req.user.id);

  const unreadCount = rows.filter(r => !r.is_read).length;
  res.json({ notifications: rows, unreadCount });
});

// GET /api/mentions/notifications/count — Nombre de notifications non lues
router.get('/notifications/count', authenticate, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM product_mentions WHERE to_user_id = ? AND is_read = 0').get(req.user.id);
  res.json({ count: row.count });
});

// PUT /api/mentions/notifications/:id/read — Marquer une notification lue
router.put('/notifications/:id/read', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE product_mentions SET is_read = 1 WHERE id = ? AND to_user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// PUT /api/mentions/notifications/read-all — Marquer tout comme lu
router.put('/notifications/read-all', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE product_mentions SET is_read = 1 WHERE to_user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
