const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '../gazdetect.db');
let db;

function getDb() {
  if (!db) db = new DatabaseSync(DB_PATH);
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'commercial',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      uploaded_by INTEGER,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT,
      designation TEXT,
      description TEXT,
      configuration TEXT,
      unit TEXT,
      price_ht REAL,
      price_ttc REAL,
      file_id INTEGER NOT NULL,
      FOREIGN KEY (file_id) REFERENCES price_files(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_reference ON products(reference);
    CREATE INDEX IF NOT EXISTS idx_products_designation ON products(designation);
    CREATE INDEX IF NOT EXISTS idx_products_config ON products(configuration);
    CREATE INDEX IF NOT EXISTS idx_products_file_id ON products(file_id);
  `);

  // Migrations for existing DBs
  const migrations = [
    "ALTER TABLE products RENAME COLUMN price TO price_ht",
    "ALTER TABLE products ADD COLUMN description TEXT",
    "ALTER TABLE products ADD COLUMN unit TEXT",
    "ALTER TABLE products ADD COLUMN price_ttc REAL",
    "ALTER TABLE products ADD COLUMN margin_1_3 REAL",
    "ALTER TABLE products ADD COLUMN margin_4_9 REAL",
    "ALTER TABLE products ADD COLUMN margin_10 REAL",
    "ALTER TABLE products ADD COLUMN supplier TEXT",
    "ALTER TABLE products ADD COLUMN pa REAL",
    "ALTER TABLE products ADD COLUMN loc_base_sem REAL",
    "ALTER TABLE products ADD COLUMN loc_base_mois REAL",
    "ALTER TABLE products ADD COLUMN loc_part_sem REAL",
    "ALTER TABLE products ADD COLUMN loc_part_mois REAL",
    "ALTER TABLE products ADD COLUMN loc_gc_sem REAL",
    "ALTER TABLE products ADD COLUMN loc_gc_mois REAL",
    "ALTER TABLE users ADD COLUMN avatar TEXT",
    "ALTER TABLE users ADD COLUMN display_name TEXT",
    "ALTER TABLE price_files ADD COLUMN category TEXT DEFAULT 'Général'",
    "ALTER TABLE products ADD COLUMN extra_fields TEXT",
    "ALTER TABLE products ADD COLUMN sheet_name TEXT",
  ];

  // Table de logs de recherche
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      query TEXT NOT NULL,
      results_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_search_logs_user ON search_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_search_logs_created ON search_logs(created_at);
  `);

  // Table des favoris
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(user_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
  `);

  // Table des mentions produit (@tag)
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_mentions_to_user ON product_mentions(to_user_id);
    CREATE INDEX IF NOT EXISTS idx_mentions_product ON product_mentions(product_id);
  `);

  // Table de chat
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  `);
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* already applied */ }
  }

  // Comptes par défaut au premier démarrage — lus depuis .env
  // ⚠️  Changer DEFAULT_ADMIN_PASSWORD et DEFAULT_COMMERCIAL_PASSWORD dans .env AVANT de déployer !
  const defaults = [
    {
      email:    process.env.DEFAULT_ADMIN_EMAIL      || 'admin@gazdetect.com',
      password: process.env.DEFAULT_ADMIN_PASSWORD   || 'Admin2024!',
      role: 'admin',
    },
    {
      email:    process.env.DEFAULT_COMMERCIAL_EMAIL    || 'commercial@gazdetect.com',
      password: process.env.DEFAULT_COMMERCIAL_PASSWORD || 'Compta2024!',
      role: 'commercial',
    },
  ];
  for (const u of defaults) {
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (!exists) {
      const hash = bcrypt.hashSync(u.password, 10);
      db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run(u.email, hash, u.role);
      console.log(`Compte créé : ${u.email} (${u.role})`);
    }
  }
}

module.exports = { getDb, initDb };
