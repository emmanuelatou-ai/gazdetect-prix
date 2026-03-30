#!/usr/bin/env node
/**
 * CLI — Ajouter un utilisateur GazDetect
 * Usage : node scripts/add-user.js <email> <password> [role]
 * Exemple : node scripts/add-user.js jean.dupont@gazdetect.com MonPass123 commercial
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const readline = require('readline');
const bcrypt   = require('bcryptjs');
const { getDb, initDb } = require('../db/database');

const [,, emailArg, passwordArg, roleArg] = process.argv;

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function main() {
  initDb(); // ensure schema + default admin exist
  const db = getDb();

  let email    = emailArg;
  let password = passwordArg;
  let role     = roleArg;

  // Interactive mode if args missing
  if (!email)    email    = await prompt('Email         : ');
  if (!password) password = await prompt('Mot de passe  : ');
  if (!role) {
    const r = await prompt('Rôle [admin/commercial] (défaut: commercial) : ');
    role = ['admin', 'commercial'].includes(r) ? r : 'commercial';
  }

  if (!email || !password) {
    console.error('❌  Email et mot de passe sont obligatoires.');
    process.exit(1);
  }

  if (!['admin', 'commercial'].includes(role)) {
    console.error('❌  Rôle invalide. Valeurs acceptées : admin, commercial');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('❌  Le mot de passe doit contenir au moins 6 caractères.');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 10);

  try {
    const result = db.prepare(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)'
    ).run(email.trim().toLowerCase(), hash, role);

    console.log(`✅  Utilisateur créé avec succès.`);
    console.log(`   ID    : ${result.lastInsertRowid}`);
    console.log(`   Email : ${email.trim().toLowerCase()}`);
    console.log(`   Rôle  : ${role}`);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      console.error(`❌  L'email "${email}" est déjà utilisé.`);
    } else {
      console.error('❌  Erreur :', e.message);
    }
    process.exit(1);
  }
}

main();
