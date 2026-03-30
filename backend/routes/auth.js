const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { authenticate, requireAdmin, JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Identifiants invalides' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role }
  });
});

// GET /api/auth/users — admin only
router.get('/users', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, email, role, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// POST /api/auth/users — admin only
router.post('/users', authenticate, requireAdmin, (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  // Validation basique du format email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Format d\'email invalide' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  }
  if (!['admin', 'commercial'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }

  const db = getDb();
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)'
    ).run(email.trim().toLowerCase(), hash, role);
    res.json({ id: result.lastInsertRowid, email: email.trim().toLowerCase(), role });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Cet email est déjà utilisé' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// PATCH /api/auth/profile — mettre à jour avatar et display_name (tout utilisateur connecté)
router.patch('/profile', authenticate, (req, res) => {
  const { avatar, display_name } = req.body;
  const db = getDb();
  db.prepare('UPDATE users SET avatar = ?, display_name = ? WHERE id = ?')
    .run(avatar ?? null, display_name?.trim() || null, req.user.id);
  const updated = db.prepare('SELECT id, email, role, avatar, display_name FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

// PATCH /api/auth/password — changer son propre mot de passe
router.patch('/password', authenticate, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ success: true });
});

// GET /api/auth/me — récupérer ses infos à jour (avatar inclus)
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, role, avatar, display_name FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  res.json(user);
});

// DELETE /api/auth/users/:id — admin only
router.delete('/users/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
  }
  const db = getDb();
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  res.json({ success: true });
});

module.exports = router;
