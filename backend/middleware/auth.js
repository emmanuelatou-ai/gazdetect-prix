const jwt = require('jsonwebtoken');

// ⚠️  Le JWT_SECRET DOIT être défini dans .env avec une valeur forte (min. 32 chars)
//     Ne jamais utiliser la valeur par défaut en production !
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL : JWT_SECRET manquant ou trop court en production. Arrêt.');
    process.exit(1);
  } else {
    console.warn('⚠️  JWT_SECRET non sécurisé — acceptable uniquement en développement local.');
  }
}
const SECRET = JWT_SECRET || 'dev-only-secret-not-for-production-gazdetect';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, JWT_SECRET: SECRET };
