const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/search', authenticate, (req, res) => {
  const { q, file_id } = req.query;
  if (!q || q.trim().length < 1) return res.json([]);
  // Limiter la longueur de la requête (anti abus / DoS)
  if (q.trim().length > 200) return res.status(400).json({ error: 'Requête trop longue (200 caractères max)' });

  // Split into words — chaque mot doit apparaître dans AU MOINS UN champ
  const words = q.trim().split(/\s+/).filter(Boolean);
  const cols = `(
    p.reference      LIKE ? OR
    p.designation    LIKE ? OR
    p.description    LIKE ? OR
    p.configuration  LIKE ? OR
    p.supplier       LIKE ? OR
    p.unit           LIKE ? OR
    p.extra_fields   LIKE ? OR
    CAST(p.price_ht  AS TEXT) LIKE ? OR
    CAST(p.price_ttc AS TEXT) LIKE ? OR
    CAST(p.pa        AS TEXT) LIKE ? OR
    pf.original_name LIKE ?
  )`;
  const whereClauses = words.map(() => cols).join(' AND ');
  const params = words.flatMap(w => { const s = `%${w}%`; return [s,s,s,s,s,s,s,s,s,s,s]; });

  const { supplier, sort, category, sheet_name } = req.query;
  let sql = `
    SELECT p.id, p.reference, p.designation, p.description,
           p.configuration, p.unit, p.price_ht, p.price_ttc, p.pa,
           p.margin_1_3, p.margin_4_9, p.margin_10, p.supplier,
           p.loc_base_sem, p.loc_base_mois, p.loc_part_sem, p.loc_part_mois,
           p.loc_gc_sem, p.loc_gc_mois, p.extra_fields, p.sheet_name,
           pf.id as file_id, pf.original_name as file_name, pf.upload_date, pf.category as file_category
    FROM products p JOIN price_files pf ON p.file_id = pf.id
    WHERE ${whereClauses}`;
  // Exclure les lignes sans données utiles (désignation seule, sans prix ni référence ni config)
  sql += ` AND (p.price_ht IS NOT NULL OR p.pa IS NOT NULL OR p.price_ttc IS NOT NULL
               OR (p.reference IS NOT NULL AND p.reference != '')
               OR (p.configuration IS NOT NULL AND p.configuration != ''))`;
  // Valider file_id comme entier positif
  if (file_id) {
    const fid = parseInt(file_id, 10);
    if (!isNaN(fid) && fid > 0) { sql += ' AND p.file_id = ?'; params.push(fid); }
  }
  if (sheet_name) { sql += ' AND p.sheet_name = ?';    params.push(String(sheet_name).substring(0, 100)); }
  // Supporte les catégories multiples stockées en "Cat1,Cat2"
  if (category)   { sql += " AND (',' || pf.category || ',') LIKE '%,' || ? || ',%'"; params.push(category); }
  if (supplier)   { sql += ' AND p.supplier = ?';      params.push(supplier); }
  const orderMap = { price_asc: 'p.price_ht ASC', price_desc: 'p.price_ht DESC', designation: 'p.designation', supplier: 'p.supplier, p.designation', file: 'pf.original_name, p.supplier, p.designation' };
  sql += ` ORDER BY ${orderMap[sort] || 'p.reference, p.designation'} LIMIT 200`;
  const results = getDb().prepare(sql).all(...params);

  // Logger la requête (debounce, Entrée, ou suggestion) — dédoublonnage 10s
  if (req.query.log === 'true') {
    try {
      const db = getDb();
      const recent = db.prepare(
        `SELECT id FROM search_logs
         WHERE user_id = ? AND query = ?
           AND created_at > datetime('now', '-10 seconds')`
      ).get(req.user.id, q.trim());
      if (!recent) {
        db.prepare('INSERT INTO search_logs (user_id, query, results_count) VALUES (?, ?, ?)').run(req.user.id, q.trim(), results.length);
      }
    } catch {}
  }

  res.json(results);
});

router.get('/suggest', authenticate, (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  const words = q.trim().split(/\s+/).filter(Boolean);
  const cols = '(p.designation LIKE ? OR p.reference LIKE ? OR p.description LIKE ? OR p.configuration LIKE ? OR p.supplier LIKE ? OR p.extra_fields LIKE ?)';
  const where = words.map(() => cols).join(' AND ');
  const params = words.flatMap(w => { const s = `%${w}%`; return [s,s,s,s,s,s]; });
  const sql = `
    SELECT DISTINCT p.designation, p.reference, p.supplier, p.configuration
    FROM products p
    WHERE ${where}
    ORDER BY p.designation
    LIMIT 10`;
  res.json(getDb().prepare(sql).all(...params));
});

router.get('/suppliers', authenticate, (req, res) => {
  const rows = getDb().prepare(
    "SELECT DISTINCT supplier FROM products WHERE supplier IS NOT NULL AND supplier != '' ORDER BY supplier"
  ).all();
  res.json(rows.map(r => r.supplier));
});

router.get('/stats', authenticate, (req, res) => {
  const db = getDb();
  const totalProducts  = db.prepare('SELECT COUNT(*) as count FROM products').get();
  const totalFiles     = db.prepare('SELECT COUNT(*) as count FROM price_files').get();
  const latestFile     = db.prepare('SELECT original_name, upload_date FROM price_files ORDER BY upload_date DESC LIMIT 1').get();
  const totalSearches  = db.prepare('SELECT COUNT(*) as count FROM search_logs').get();
  res.json({ totalProducts: totalProducts.count, totalFiles: totalFiles.count, latestFile: latestFile || null, totalSearches: totalSearches.count });
});

// Historique des 20 dernières recherches de l'utilisateur connecté
router.get('/search-history', authenticate, (req, res) => {
  const rows = getDb().prepare(`
    SELECT query, results_count, created_at
    FROM search_logs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(req.user.id);
  res.json(rows);
});

router.get('/search-stats', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const byUser = db.prepare(`
    SELECT u.email, u.display_name,
           COUNT(sl.id) as total,
           MAX(sl.created_at) as last_search,
           MAX(sl.query) as last_query
    FROM search_logs sl
    JOIN users u ON sl.user_id = u.id
    GROUP BY sl.user_id
    ORDER BY total DESC
  `).all();
  const total = db.prepare('SELECT COUNT(*) as count FROM search_logs').get();
  res.json({ total: total.count, byUser });
});

// Activité des recherches (14 derniers jours) + top requêtes + top chercheurs — admin
router.get('/search-activity', authenticate, requireAdmin, (req, res) => {
  const db = getDb();

  // Remplir les 14 derniers jours (zéro si aucune recherche ce jour-là)
  const rawDays = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM search_logs
    WHERE created_at >= date('now', '-13 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all();
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const dayMap = Object.fromEntries(rawDays.map(r => [r.day, r.count]));
  const days = last14.map(day => ({ day, count: dayMap[day] || 0 }));

  // Top 8 termes les plus recherchés
  const topQueries = db.prepare(`
    SELECT query, COUNT(*) as count
    FROM search_logs
    GROUP BY LOWER(query)
    ORDER BY count DESC
    LIMIT 8
  `).all();

  // Top 5 chercheurs
  const topSearchers = db.prepare(`
    SELECT u.display_name, u.email, COUNT(sl.id) as total
    FROM search_logs sl
    JOIN users u ON sl.user_id = u.id
    GROUP BY sl.user_id
    ORDER BY total DESC
    LIMIT 5
  `).all();

  res.json({ days, topQueries, topSearchers });
});

// ── Classement gamifié "Course des recherches" — accessible à tous ────────────
router.get('/leaderboard', authenticate, (req, res) => {
  const db = getDb();

  // Top 10 du jour (UTC)
  const today = db.prepare(`
    SELECT u.id as user_id, u.display_name, u.email,
           COUNT(sl.id) as points
    FROM users u
    INNER JOIN search_logs sl ON sl.user_id = u.id
    WHERE date(sl.created_at) = date('now')
    GROUP BY u.id
    ORDER BY points DESC
    LIMIT 10
  `).all();

  // Top 10 sur les 7 derniers jours
  const week = db.prepare(`
    SELECT u.id as user_id, u.display_name, u.email,
           COUNT(sl.id) as points
    FROM users u
    INNER JOIN search_logs sl ON sl.user_id = u.id
    WHERE sl.created_at >= date('now', '-6 days')
    GROUP BY u.id
    ORDER BY points DESC
    LIMIT 10
  `).all();

  // Points de l'utilisateur connecté
  const myToday = db.prepare(
    `SELECT COUNT(*) as count FROM search_logs WHERE user_id = ? AND date(created_at) = date('now')`
  ).get(req.user.id);

  const myWeek = db.prepare(
    `SELECT COUNT(*) as count FROM search_logs WHERE user_id = ? AND created_at >= date('now', '-6 days')`
  ).get(req.user.id);

  // Rang du jour : nombre d'utilisateurs ayant PLUS de points que moi + 1
  const rankToday = db.prepare(`
    SELECT COUNT(*) + 1 as rank FROM (
      SELECT user_id FROM search_logs
      WHERE date(created_at) = date('now')
      GROUP BY user_id
      HAVING COUNT(*) > ?
    )
  `).get(myToday.count);

  const rankWeek = db.prepare(`
    SELECT COUNT(*) + 1 as rank FROM (
      SELECT user_id FROM search_logs
      WHERE created_at >= date('now', '-6 days')
      GROUP BY user_id
      HAVING COUNT(*) > ?
    )
  `).get(myWeek.count);

  // Activité jour par jour sur 7 jours pour l'utilisateur connecté
  const rawMyDays = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM search_logs
    WHERE user_id = ? AND created_at >= date('now', '-6 days')
    GROUP BY date(created_at)
  `).all(req.user.id);

  const myDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = rawMyDays.find(r => r.day === key);
    myDays.push({ day: key, count: found ? found.count : 0 });
  }

  res.json({
    today,
    week,
    myStats: {
      user_id:      req.user.id,
      points_today: myToday.count,
      points_week:  myWeek.count,
      rank_today:   rankToday.rank,
      rank_week:    rankWeek.rank,
      days:         myDays,
    },
  });
});

module.exports = router;
