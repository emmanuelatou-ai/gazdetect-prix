const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// GET /api/chat/messages — 60 derniers messages avec infos utilisateur
router.get('/messages', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 60, 200);
  const since = req.query.since || null; // timestamp ISO pour le polling

  let sql = `
    SELECT m.id, m.content, m.created_at,
           u.id as user_id, u.email, u.display_name, u.avatar
    FROM messages m JOIN users u ON m.user_id = u.id
  `;
  const params = [];
  if (since) {
    sql += ' WHERE m.created_at > ?';
    params.push(since);
  }
  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(limit);

  const rows = getDb().prepare(sql).all(...params);
  // Retourner dans l'ordre chronologique
  res.json(rows.reverse());
});

// POST /api/chat/messages — envoyer un message
router.post('/messages', authenticate, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Message vide' });
  }
  if (content.trim().length > 500) {
    return res.status(400).json({ error: 'Message trop long (500 caractères max)' });
  }
  const db = getDb();
  const result = db.prepare('INSERT INTO messages (user_id, content) VALUES (?, ?)').run(req.user.id, content.trim());
  const msg = db.prepare(`
    SELECT m.id, m.content, m.created_at,
           u.id as user_id, u.email, u.display_name, u.avatar
    FROM messages m JOIN users u ON m.user_id = u.id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);
  res.json(msg);
});

module.exports = router;
