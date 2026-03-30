const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// GET /api/favorites — liste des favoris de l'utilisateur connecté
router.get('/', authenticate, (req, res) => {
  const rows = getDb().prepare(`
    SELECT p.id, p.reference, p.designation, p.description, p.configuration, p.unit,
           p.price_ht, p.price_ttc, p.pa,
           p.margin_1_3, p.margin_4_9, p.margin_10, p.supplier,
           p.loc_base_sem, p.loc_base_mois, p.loc_part_sem, p.loc_part_mois,
           p.loc_gc_sem, p.loc_gc_mois,
           pf.id as file_id, pf.original_name as file_name, pf.upload_date
    FROM favorites f
    JOIN products p ON f.product_id = p.id
    JOIN price_files pf ON p.file_id = pf.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

// GET /api/favorites/ids — IDs des produits favoris (pour coloration dans Search)
router.get('/ids', authenticate, (req, res) => {
  const rows = getDb().prepare(
    'SELECT product_id FROM favorites WHERE user_id = ?'
  ).all(req.user.id);
  res.json(rows.map(r => r.product_id));
});

// POST /api/favorites — ajouter un favori
router.post('/', authenticate, (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id requis' });
  try {
    getDb().prepare(
      'INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)'
    ).run(req.user.id, product_id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/favorites/:productId — retirer un favori
router.delete('/:productId', authenticate, (req, res) => {
  getDb().prepare(
    'DELETE FROM favorites WHERE user_id = ? AND product_id = ?'
  ).run(req.user.id, req.params.productId);
  res.json({ ok: true });
});

module.exports = router;
