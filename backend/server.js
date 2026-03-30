require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const { initDb } = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1); // Nécessaire derrière nginx/CloudPanel

// ── Sécurité : en-têtes HTTP (CSP, X-Frame-Options, HSTS, etc.) ──────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: false, // désactivé car frontend React séparé
}));

// ── CORS : restreint à l'origine du frontend uniquement ──────────────────────
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

app.use(express.json({ limit: '10mb' })); // Limite la taille du body JSON

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Limite globale : 200 req/min par IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, veuillez patienter.' },
});

// Limite stricte sur le login : 10 tentatives/15 min par IP (anti brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  skipSuccessfulRequests: true, // ne compte pas les connexions réussies
});

// Limite sur les uploads : 20 fichiers/heure par IP
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite d\'upload atteinte. Réessayez dans 1 heure.' },
});

app.use(globalLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/files/upload', uploadLimiter);
app.use('/api/files/preview', uploadLimiter);

// ── Fichiers uploadés : servis en accès restreint via API, pas en static public
// NE PAS exposer le dossier uploads/ directement (PDF/XLSX téléchargeables)
// app.use('/uploads', express.static(...));  ← supprimé volontairement

// Init DB (crée tables + admin par défaut)
initDb();

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/files',    require('./routes/files'));
app.use('/api/chat',     require('./routes/chat'));
app.use('/api/favorites',require('./routes/favorites'));
app.use('/api/mentions', require('./routes/mentions'));

// ── Frontend React (production) ───────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, 'public');
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// ── Gestion globale des erreurs (ne pas exposer les détails en prod) ──────────
app.use((err, req, res, next) => {
  console.error('[Erreur]', err.message);
  res.status(err.status || 500).json({ error: 'Erreur interne du serveur' });
});

app.listen(PORT, () => {
  console.log(`GazDetect API démarrée sur http://localhost:${PORT}`);
  console.log(`CORS autorisé pour : ${allowedOrigin}`);
  if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET non défini — utilisation d\'une valeur par défaut DANGEREUSE en production !');
  }
});
