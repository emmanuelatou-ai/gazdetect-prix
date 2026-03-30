const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { getDb } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo max (réduit de 50 Mo)
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.xlsx', '.xls', '.pdf', '.docx', '.doc'];
    if (!allowed.includes(ext)) {
      return cb(new Error('Formats acceptés : .xlsx, .xls, .pdf, .docx, .doc'));
    }
    // Sanitiser le nom du fichier original pour éviter les injections dans les logs
    file.originalname = file.originalname.replace(/[^a-zA-Z0-9._\- ()àâäéèêëîïôùûüçÀÂÄÉÈÊËÎÏÔÙÛÜÇ]/g, '_');
    cb(null, true);
  }
});

function normalize(str) {
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

const MATCHERS = {
  reference:     ['reference', 'ref', 'code article', 'code', 'article', 'sku', 'num', 'codification', 'cod'],
  designation:   ['designation', 'libelle', 'libel', 'nom produit', 'nom', 'gaz', 'produit', 'modele'],
  description:   ['description', 'descriptif', 'detail', 'note', 'commentaire'],
  configuration: ['configuration', 'config', 'serie', 'famille', 'gamme'],
  unit:          ['unite', 'unit', 'uom', 'par lot', 'conditionnement', 'lot'],
  price_ht:      ['prix ht', 'prix hors taxe', 'pv ht', 'pv gd', 'tarif ht', 'tarif gd', 'montant ht', 'price ht', 'tarif ati', 'tarif'],
  price_ttc:     ['prix ttc', 'ttc', 'toutes taxes', 'tarif ttc', 'montant ttc', 'price ttc'],
  pa:            ['pa', 'prix achat', 'prix d achat', 'achat', 'cout achat'],
  margin_1_3:    ['marges 1 a 3', 'marge 1 a 3', 'marges 1', 'margin 1', 'marge 1 3', 'marge1 3', 'marge 1-3', 'pv 1 3', 'pv 1-3', 'pv 1', 'prix 58 l', 'prix 58l', 'tarif 58 l', 'tarif 58l'],
  margin_4_9:    ['marges 4 a 9', 'marge 4 a 9', 'marges 4', 'margin 4', 'marge 4 9', 'marge4 9', 'marge 4-9', 'pv 4 9', 'pv 4-9', 'pv 4', 'prix 110 l', 'prix 110l', 'tarif 110 l', 'tarif 110l'],
  margin_10:     ['marges 10 et plus', 'marge 10 et plus', 'marges 10', 'margin 10', 'marge 10', 'marge10', 'pv 10', 'pv 10+'],
  loc_base_sem:  ['prix semaine', 'prix sem', 'tarif semaine', 'tarif sem', 'prix hebdo', 'tarif hebdo', 'prix hebdomadaire', 'tarif hebdomadaire', 'weekly', 'base sem', 'base semaine', 'tarif base sem', 'tarif base semaine'],
  loc_base_mois: ['prix mois', 'tarif mois', 'prix mensuel', 'tarif mensuel', 'monthly', 'base mois', 'tarif base mois'],
  loc_part_sem:  ['partenaires sem', 'partenaire sem', 'partenaires semaine', 'partenaire semaine', 'part sem'],
  loc_part_mois: ['partenaires mois', 'partenaire mois', 'part mois'],
  loc_gc_sem:    ['grands comptes sem', 'grands comptes semaine', 'grand comptes sem', 'gc sem'],
  loc_gc_mois:   ['grands comptes mois', 'grand comptes mois', 'gc mois'],
};
const PRICE_GENERIC = ['prix', 'price', 'tarif', 'montant', 'tarification'];

function buildColumnMap(headerRow) {
  const normKeys = Object.keys(headerRow).map(k => ({ original: k, norm: normalize(k) }));
  const map = {};
  for (const [field, keywords] of Object.entries(MATCHERS)) {
    for (const kw of keywords) {
      const hit = normKeys.find(k => k.norm.includes(kw));
      if (hit && !map[field]) { map[field] = hit.original; break; }
    }
  }
  if (!map.price_ht) {
    for (const kw of PRICE_GENERIC) {
      const hit = normKeys.find(k => k.norm.includes(kw) && k.original !== map.price_ttc);
      if (hit) { map.price_ht = hit.original; break; }
    }
  }
  return map;
}

function headerScore(row) {
  const normKeys = Object.keys(row).map(k => normalize(String(k)));
  const allKw = Object.values(MATCHERS).flat().concat(PRICE_GENERIC);
  return normKeys.reduce((s, nk) => s + (allKw.some(kw => nk.includes(kw)) ? 1 : 0), 0);
}

// Values that indicate a sub-header row (quantity tiers, not real data)
const SUBHEADER_PATTERNS = /^(\d+\s*[àa]\s*\d+|[<>]\s*\d+|\d+\s*et\s*plus|sem\.|mois|semaine|partenaire|grand|base)$/i;

function isSubHeaderRow(row) {
  const vals = Object.values(row).map(v => String(v).trim()).filter(Boolean);
  if (!vals.length) return true;
  const subCount = vals.filter(v => SUBHEADER_PATTERNS.test(v)).length;
  return subCount >= 2;
}

// Détecte si un tableau brut de cellules contient des sous-en-têtes (paliers qté OU Sem./Mois location)
function isQuantitySubHeaderArray(rowArr) {
  const vals = rowArr.map(v => String(v).trim()).filter(Boolean);
  if (!vals.length) return false;
  const subPattern = /^(\d+\s*[àa]\s*\d+|\d+\s*et\s*plus|sem\.?|mois|semaine)$/i;
  return vals.filter(v => subPattern.test(v)).length >= 2;
}

function findHeaderAndData(worksheet) {
  const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  let bestRow = 0, bestScore = 0;
  for (let i = 0; i < Math.min(raw.length, 12); i++) {
    const rowObj = {};
    raw[i].forEach((cell, j) => { rowObj[String(cell || `col${j}`)] = cell; });
    const score = headerScore(rowObj);
    if (score > bestScore) { bestScore = score; bestRow = i; }
  }

  const headerArr = raw[bestRow] || [];
  const nextArr = raw[bestRow + 1] || [];

  // Si la ligne suivante contient des paliers de quantité, construire des noms composites
  if (isQuantitySubHeaderArray(nextArr)) {
    let lastGroup = '';
    const colNames = headerArr.map((h, i) => {
      const hStr = String(h).trim();
      if (hStr) lastGroup = hStr;
      const subStr = String(nextArr[i] || '').trim();
      if (subStr) return (lastGroup + ' ' + subStr).trim();
      return hStr || `col${i}`;
    });

    const dataRows = [];
    for (let i = bestRow + 2; i < raw.length; i++) {
      const rowArr = raw[i];
      const rowObj = {};
      colNames.forEach((name, j) => { rowObj[name] = rowArr[j] !== undefined ? rowArr[j] : ''; });
      dataRows.push(rowObj);
    }
    return { data: dataRows.filter(r => !isSubHeaderRow(r)), headerRowIndex: bestRow };
  }

  // Cas standard : en-tête sur une seule ligne
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  range.s.r = bestRow;
  const data = XLSX.utils.sheet_to_json(worksheet, { defval: '', range: XLSX.utils.encode_range(range) });
  return { data: data.filter(r => !isSubHeaderRow(r)), headerRowIndex: bestRow };
}

/**
 * Parse ALL sheets of a workbook.
 * Each sheet may have its own column layout — buildColumnMap is applied per sheet.
 * Returns { rows: [...], sheetsSummary: [{name, count}] }
 */
// Only skip truly empty/system sheets with no data
const SKIP_SHEETS = /^(feuil\d*)$/i;

// Normalise le nom de feuille en nom de fournisseur lisible
function extractSupplier(sheetName) {
  return String(sheetName)
    .replace(/\s*\(\d+\)/g, '')   // retire "(1)", "(2)"
    .replace(/\s*old$/i, '')       // retire "old"
    .replace(/^VA\s+/i, '')        // retire préfixe "VA "
    .replace(/^Adduction air\s+/i, '')  // retire "Adduction air "
    .trim() || sheetName;
}

// Extract reference code from parentheses: "CO (8326321)" → "8326321"
function extractRefFromDesignation(des) {
  const m = String(des).match(/\(([A-Za-z0-9][A-Za-z0-9\-_.]{2,})\)/);
  return m ? m[1] : '';
}

// Find a "TARIF" or "PA" column that wasn't mapped by MATCHERS (fallback for price)
function findFallbackPriceCol(headerRow, colMap) {
  const used = new Set(Object.values(colMap));
  const keys = Object.keys(headerRow);
  // Prefer "TARIF" over "PA" (PA = purchase price, TARIF = public price)
  for (const kw of ['tarif', 'pv', 'prix']) {
    const hit = keys.find(k => !used.has(k) && normalize(k).includes(kw));
    if (hit) return hit;
  }
  return null;
}

// customColMap optionnel : si fourni, remplace la détection automatique par feuille
function parseAllSheets(workbook, customColMap = null) {
  const allRows = [];
  const sheetsSummary = [];

  for (const sheetName of workbook.SheetNames) {
    if (SKIP_SHEETS.test(sheetName)) continue;
    const ws = workbook.Sheets[sheetName];
    if (!ws['!ref']) continue;

    const { data } = findHeaderAndData(ws);
    if (!data.length) continue;

    let colMap;
    if (customColMap) {
      // Vérifier si les colonnes du mapping existent réellement dans cette feuille
      const sheetCols = new Set(Object.keys(data[0]));
      const hasDesig = customColMap.designation && sheetCols.has(customColMap.designation);
      const hasPrice = (customColMap.price_ht && sheetCols.has(customColMap.price_ht)) ||
                       (customColMap.price_ttc && sheetCols.has(customColMap.price_ttc));
      if (hasDesig || hasPrice) {
        // Le mapping s'applique à cette feuille
        colMap = customColMap;
      } else {
        // Fallback : détection automatique pour cette feuille
        colMap = buildColumnMap(data[0]);
        if (!colMap.price_ht) {
          const fb = findFallbackPriceCol(data[0], colMap);
          if (fb) colMap.price_ht = fb;
        }
        if (!colMap.designation) {
          const firstCol = Object.keys(data[0]).find(c => !String(c).startsWith('__EMPTY'));
          if (firstCol && !Object.values(colMap).includes(firstCol)) {
            colMap.designation = firstCol;
          }
        }
      }
    } else {
      colMap = buildColumnMap(data[0]);
      if (!colMap.price_ht) {
        const fb = findFallbackPriceCol(data[0], colMap);
        if (fb) colMap.price_ht = fb;
      }
      if (!colMap.designation && !colMap.price_ht) continue;
      if (!colMap.designation) {
        const firstCol = Object.keys(data[0])[0];
        if (firstCol && !Object.values(colMap).includes(firstCol)) {
          colMap.designation = firstCol;
        }
      }
    }

    if (!colMap.designation && !colMap.price_ht) continue;

    // Colonnes du fichier déjà capturées par le mapping standard
    const mappedCols = new Set(Object.values(colMap).filter(Boolean));

    let count = 0;
    for (const row of data) {
      const get = (field) => colMap[field] ? String(row[colMap[field]] ?? '').trim() : '';
      let des = get('designation');
      if (!des) des = get('description');
      let ref = get('reference');

      const priceVal = parsePrice(get('price_ht')) ?? parsePrice(get('price_ttc'));
      const paVal    = parsePrice(get('pa'));
      if (!des && !ref) continue;
      // Ignorer les lignes "nom seul" sans aucune donnée exploitable
      const hasUsefulData = priceVal != null || paVal != null || ref || get('configuration');
      if (!hasUsefulData) continue;
      // Filtres supplémentaires en détection automatique
      if (!customColMap) {
        if (!priceVal && !ref && des.length < 3) continue;
        if (!priceVal && SUBHEADER_PATTERNS.test(des)) continue;
      }

      if (!ref && des) ref = extractRefFromDesignation(des);

      // Capturer toutes les colonnes non mappées dans extra_fields
      const extra = {};
      for (const col of Object.keys(row)) {
        if (!mappedCols.has(col) && !String(col).startsWith('__EMPTY')) {
          const val = String(row[col] ?? '').trim();
          if (val && val !== '0') extra[col] = val;
        }
      }

      allRows.push({
        reference:     ref,
        designation:   des,
        description:   get('description'),
        configuration: get('configuration'),
        unit:          get('unit'),
        price_ht:      parsePrice(get('price_ht')),
        price_ttc:     parsePrice(get('price_ttc')),
        pa:            parsePrice(get('pa')),
        margin_1_3:    parseMargin(get('margin_1_3')),
        margin_4_9:    parseMargin(get('margin_4_9')),
        margin_10:     parseMargin(get('margin_10')),
        loc_base_sem:  parsePrice(get('loc_base_sem')),
        loc_base_mois: parsePrice(get('loc_base_mois')),
        loc_part_sem:  parsePrice(get('loc_part_sem')),
        loc_part_mois: parsePrice(get('loc_part_mois')),
        loc_gc_sem:    parsePrice(get('loc_gc_sem')),
        loc_gc_mois:   parsePrice(get('loc_gc_mois')),
        supplier:      extractSupplier(sheetName),
        sheet:         sheetName,
        extra_fields:  Object.keys(extra).length ? JSON.stringify(extra) : null,
      });
      count++;
    }
    if (count > 0) sheetsSummary.push({ name: sheetName, count });
  }

  return { rows: allRows, sheetsSummary };
}

function parsePrice(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

function parseMargin(v) {
  const n = parsePrice(v);
  if (n == null) return null;
  // Décimal Excel (ex: 0.352 → 35.2 %) ; déjà en % (ex: 35.2 → 35.2 %)
  return n < 1 ? Math.round(n * 1000) / 10 : n;
}

async function parsePdf(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const fn = typeof pdfParse === 'function' ? pdfParse : (pdfParse.default || pdfParse.PDFParse);
  const { text } = await fn(buffer);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const allKw = Object.values(MATCHERS).flat().concat(PRICE_GENERIC);

  let headerIdx = -1, bestScore = 0;
  lines.forEach((line, i) => {
    const words = normalize(line).split(/\s+/);
    const score = words.filter(w => allKw.some(kw => w.includes(kw) || kw.includes(w))).length;
    if (score > bestScore) { bestScore = score; headerIdx = i; }
  });

  const headerLine = lines[headerIdx] || '';
  let sep = '\t';
  if (headerLine.includes('|')) sep = '|';
  else if (headerLine.includes(';')) sep = ';';
  else if (/\s{3,}/.test(headerLine)) sep = /\s{3,}/;
  const splitLine = (l) => typeof sep === 'string' ? l.split(sep).map(s => s.trim()) : l.split(sep).map(s => s.trim());
  const headers = splitLine(headerLine);

  // Fallback si pas d'en-tête clair OU si la ligne d'en-tête n'a pas pu être divisée en 2+ colonnes
  // (cas fréquent : PDF avec colonnes collées "PartDescriptionPrice" + ref/desc sur lignes alternées)
  if (headerIdx === -1 || bestScore < 2 || headers.length < 2) {
    const rows = [];
    const priceRe = /(\d+[\.,]\d{1,2})\s*€/g;
    const refPattern = /^[A-Z][A-Z0-9\-_.]{2,}$/;
    let prevLine = '';
    for (const line of lines) {
      const m = line.match(/(\d+[\.,]\d{1,2})\s*€/);
      if (!m) { prevLine = line; continue; }
      const price = parsePrice(m[1]);
      const textPart = line.replace(new RegExp(priceRe.source, 'g'), '').replace(/€/g, '').trim();
      if (!textPart || !price) { prevLine = line; continue; }
      const ref = refPattern.test(prevLine.trim()) ? prevLine.trim() : '';
      rows.push({ reference: ref, designation: textPart, price_ht: price, price_ttc: null });
      prevLine = '';
    }
    return rows;
  }

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.length < 2) continue;
    const row = {};
    headers.forEach((h, idx) => { if (h) row[h] = cells[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

async function parseDocx(filePath) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  const text = result.value;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const allKw = Object.values(MATCHERS).flat().concat(PRICE_GENERIC);

  let headerIdx = -1, bestScore = 0;
  lines.forEach((line, i) => {
    const words = normalize(line).split(/\s+/);
    const score = words.filter(w => allKw.some(kw => w.includes(kw) || kw.includes(w))).length;
    if (score > bestScore) { bestScore = score; headerIdx = i; }
  });

  if (headerIdx === -1 || bestScore < 2) {
    const rows = [];
    const priceRe = /(\d[\d\s]*[,.]?\d*)\s*€?/g;
    for (const line of lines) {
      const prices = [...line.matchAll(priceRe)].map(m => parsePrice(m[1])).filter(Boolean);
      if (!prices.length) continue;
      const textPart = line.replace(priceRe, '').trim();
      if (!textPart) continue;
      rows.push({ designation: textPart, price_ht: prices[0] || null, price_ttc: prices[1] || null });
    }
    return rows;
  }

  const headerLine = lines[headerIdx];
  let sep = '\t';
  if (headerLine.includes('|')) sep = '|';
  else if (headerLine.includes(';')) sep = ';';
  else if (/\s{3,}/.test(headerLine)) sep = /\s{3,}/;
  const splitLine = (l) => typeof sep === 'string' ? l.split(sep).map(s => s.trim()) : l.split(sep).map(s => s.trim());
  const headers = splitLine(headerLine);
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.length < 2) continue;
    const row = {};
    headers.forEach((h, idx) => { if (h) row[h] = cells[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Analyse un fichier sans l'importer — retourne colonnes brutes + suggestions de mapping
router.post('/preview', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let rawColumns = [];
    let sampleRows  = [];
    let rowCount    = 0;
    let suggestedMapping = {};
    const sheetsInfo = [];

    if (ext === '.xlsx' || ext === '.xls') {
      const wb = XLSX.readFile(req.file.path);
      const allColsSet = new Set();   // union des colonnes de toutes les feuilles
      let firstSheetSample = null;    // aperçu depuis la 1ère feuille valide

      let bestSheetSample = null;
      let bestHeaderScore = -1;

      for (const sheetName of wb.SheetNames) {
        if (SKIP_SHEETS.test(sheetName)) continue;
        const ws = wb.Sheets[sheetName];
        if (!ws['!ref']) continue;
        const { data } = findHeaderAndData(ws);
        if (!data.length) continue;
        const cols = Object.keys(data[0]);
        // Ignorer les feuilles dont toutes les colonnes sont vides (__EMPTY*)
        const namedCols = cols.filter(c => !String(c).startsWith('__EMPTY'));
        if (!namedCols.length) continue;
        sheetsInfo.push({ name: sheetName, count: data.length, columns: cols });
        rowCount += data.length;
        // Collecter toutes les colonnes de toutes les feuilles
        namedCols.forEach(c => allColsSet.add(c));
        // Garder la feuille avec le meilleur score d'en-têtes pour le mapping
        if (!firstSheetSample) firstSheetSample = { cols, data };
        const score = headerScore(data[0]);
        if (score > bestHeaderScore) {
          bestHeaderScore = score;
          bestSheetSample = { cols, data };
        }
      }
      // rawColumns = union de toutes les colonnes nommées
      rawColumns = [...allColsSet];
      const sampleSheet = bestSheetSample || firstSheetSample;
      if (sampleSheet) {
        sampleRows = sampleSheet.data.slice(0, 5);
        suggestedMapping = buildColumnMap(sampleSheet.data[0]);
      }
    } else if (ext === '.pdf') {
      const rows = await parsePdf(req.file.path);
      if (rows.length) {
        rawColumns = Object.keys(rows[0]);
        sampleRows = rows.slice(0, 5);
        rowCount = rows.length;
        suggestedMapping = buildColumnMap(rows[0] || {});
      }
    } else if (ext === '.docx' || ext === '.doc') {
      const rows = await parseDocx(req.file.path);
      if (rows.length) {
        rawColumns = Object.keys(rows[0]);
        sampleRows = rows.slice(0, 5);
        rowCount = rows.length;
        suggestedMapping = buildColumnMap(rows[0] || {});
      }
    }

    // Vérifier si un fichier portant le même nom existe déjà
    const existing = getDb().prepare(`
      SELECT pf.id, pf.original_name, pf.upload_date, pf.category,
             COUNT(p.id) as product_count
      FROM price_files pf
      LEFT JOIN products p ON p.file_id = pf.id
      WHERE pf.original_name = ?
      GROUP BY pf.id
      ORDER BY pf.upload_date DESC
      LIMIT 1
    `).get(req.file.originalname);

    res.json({
      tempFile: req.file.filename,
      originalName: req.file.originalname,
      rawColumns,
      suggestedMapping,
      sampleRows,
      rowCount,
      sheetsInfo,
      fileType: ext.slice(1),
      duplicate: existing || null,
    });
  } catch (err) {
    console.error('[preview] Erreur :', err.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Erreur lors de l\'analyse du fichier. Vérifiez son format.' });
  }
});

// Confirme l'import depuis un fichier temporaire déjà analysé, avec mapping personnalisé
router.post('/confirm', authenticate, requireAdmin, async (req, res) => {
  const tempFilename = path.basename(req.body.tempFile || '');
  const tempFilePath = path.join(uploadsDir, tempFilename);
  if (!tempFilename || !fs.existsSync(tempFilePath)) {
    return res.status(400).json({ error: 'Fichier temporaire introuvable. Recommencez l\'analyse.' });
  }

  const db = getDb();
  try {
    const ext = path.extname(req.body.originalName || tempFilename).toLowerCase();
    const fieldMapping = req.body.fieldMapping ? JSON.parse(req.body.fieldMapping) : null;
    // Nettoyer les valeurs vides → null
    const colMap = fieldMapping
      ? Object.fromEntries(Object.entries(fieldMapping).map(([k, v]) => [k, v || null]))
      : null;

    let rows = [];
    let sheetsSummary = [];

    if (ext === '.xlsx' || ext === '.xls') {
      const wb = XLSX.readFile(tempFilePath);
      ({ rows, sheetsSummary } = parseAllSheets(wb, colMap));
    } else if (ext === '.pdf') {
      const pdfRows = await parsePdf(tempFilePath);
      const cm = colMap || buildColumnMap(pdfRows[0] || {});
      const pdfMappedCols = new Set(Object.values(cm).filter(Boolean));
      rows = pdfRows.map(row => {
        const get = (f) => cm[f] ? String(row[cm[f]] ?? '') : (row[f] ? String(row[f]) : '');
        const extra = {};
        for (const col of Object.keys(row)) {
          if (!pdfMappedCols.has(col) && !String(col).startsWith('__EMPTY')) {
            const val = String(row[col] ?? '').trim();
            if (val && val !== '0') extra[col] = val;
          }
        }
        return {
          reference: get('reference'), designation: get('designation') || row.designation || '',
          description: get('description'), configuration: get('configuration'),
          unit: get('unit'), price_ht: row.price_ht ?? parsePrice(get('price_ht')),
          price_ttc: row.price_ttc ?? parsePrice(get('price_ttc')),
          pa: parsePrice(get('pa')),
          margin_1_3: null, margin_4_9: null, margin_10: null,
          loc_base_sem: null, loc_base_mois: null, loc_part_sem: null,
          loc_part_mois: null, loc_gc_sem: null, loc_gc_mois: null,
          supplier: (req.body.originalName || tempFilename).replace(/\.[^.]+$/, ''), sheet: 'PDF',
          extra_fields: Object.keys(extra).length ? JSON.stringify(extra) : null,
        };
      });
      sheetsSummary = [{ name: 'PDF', count: rows.length }];
    } else if (ext === '.docx' || ext === '.doc') {
      const docxRows = await parseDocx(tempFilePath);
      const cm = colMap || buildColumnMap(docxRows[0] || {});
      const docxMappedCols = new Set(Object.values(cm).filter(Boolean));
      rows = docxRows.map(row => {
        const get = (f) => cm[f] ? String(row[cm[f]] ?? '') : (row[f] ? String(row[f]) : '');
        const extra = {};
        for (const col of Object.keys(row)) {
          if (!docxMappedCols.has(col) && !String(col).startsWith('__EMPTY')) {
            const val = String(row[col] ?? '').trim();
            if (val && val !== '0') extra[col] = val;
          }
        }
        return {
          reference: get('reference'), designation: get('designation') || row.designation || '',
          description: get('description'), configuration: get('configuration'),
          unit: get('unit'), price_ht: row.price_ht ?? parsePrice(get('price_ht')),
          price_ttc: row.price_ttc ?? parsePrice(get('price_ttc')),
          pa: parsePrice(get('pa')),
          margin_1_3: null, margin_4_9: null, margin_10: null,
          loc_base_sem: null, loc_base_mois: null, loc_part_sem: null,
          loc_part_mois: null, loc_gc_sem: null, loc_gc_mois: null,
          supplier: (req.body.originalName || tempFilename).replace(/\.[^.]+$/, ''), sheet: 'Word',
          extra_fields: Object.keys(extra).length ? JSON.stringify(extra) : null,
        };
      });
      sheetsSummary = [{ name: 'Word', count: rows.length }];
    }

    if (!rows.length) {
      fs.unlinkSync(tempFilePath);
      return res.status(400).json({ error: 'Aucune ligne exploitable avec ce mapping.' });
    }

    const supplierOverride = req.body.supplier?.trim() || null;
    if (supplierOverride) rows.forEach(r => { r.supplier = supplierOverride; });

    const category = req.body.category?.trim() || 'Général';
    const originalName = req.body.originalName || tempFilename;

    const fileResult = db.prepare(
      'INSERT INTO price_files (filename, original_name, uploaded_by, category) VALUES (?, ?, ?, ?)'
    ).run(tempFilename, originalName, req.user.id, category);
    const fileId = fileResult.lastInsertRowid;

    const ins = db.prepare(
      'INSERT INTO products (reference,designation,description,configuration,unit,price_ht,price_ttc,pa,margin_1_3,margin_4_9,margin_10,loc_base_sem,loc_base_mois,loc_part_sem,loc_part_mois,loc_gc_sem,loc_gc_mois,supplier,file_id,extra_fields,sheet_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );

    db.exec('BEGIN');
    try {
      for (const r of rows) {
        ins.run(r.reference, r.designation, r.description, r.configuration,
                r.unit, r.price_ht, r.price_ttc, r.pa ?? null,
                r.margin_1_3, r.margin_4_9, r.margin_10,
                r.loc_base_sem ?? null, r.loc_base_mois ?? null,
                r.loc_part_sem ?? null, r.loc_part_mois ?? null,
                r.loc_gc_sem ?? null, r.loc_gc_mois ?? null,
                r.supplier ?? null, fileId, r.extra_fields ?? null,
                r.sheet ?? null);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }

    res.json({
      success: true, fileId, productCount: rows.length, sheetsSummary,
      sheetsCount: sheetsSummary.length,
      message: `${rows.length} ligne(s) importée(s) depuis "${originalName}"` +
               (sheetsSummary.length > 1 ? ` (${sheetsSummary.length} onglets)` : ''),
    });
  } catch (err) {
    console.error('[confirm] Erreur :', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'import. Vérifiez le fichier et le mapping.' });
  }
});

// Onglets disponibles pour un fichier donné
router.get('/:id/sheets', authenticate, (req, res) => {
  const rows = getDb().prepare(
    "SELECT DISTINCT sheet_name FROM products WHERE file_id = ? AND sheet_name IS NOT NULL AND sheet_name != '' ORDER BY sheet_name"
  ).all(req.params.id);
  res.json(rows.map(r => r.sheet_name));
});

// Informations complémentaires d'un fichier (feuilles + stats prix)
router.get('/:id/details', authenticate, (req, res) => {
  const db = getDb();
  const sheets = db.prepare(
    "SELECT sheet_name as name, COUNT(*) as count FROM products WHERE file_id = ? AND sheet_name IS NOT NULL AND sheet_name != '' GROUP BY sheet_name ORDER BY count DESC"
  ).all(req.params.id);
  const stats = db.prepare(
    "SELECT MIN(price_ht) as min_prix, MAX(price_ht) as max_prix, COUNT(DISTINCT configuration) as nb_gammes FROM products WHERE file_id = ? AND price_ht IS NOT NULL AND price_ht > 0"
  ).get(req.params.id);
  const lobs = db.prepare(
    "SELECT DISTINCT json_extract(extra_fields, '$.\"LINE OF BUSINESS\"') as lob FROM products WHERE file_id = ? AND extra_fields IS NOT NULL"
  ).all(req.params.id).map(r => r.lob).filter(Boolean);
  res.json({ sheets, stats, lobs });
});

router.get('/', authenticate, (req, res) => {
  const files = getDb().prepare(`
    SELECT pf.id, pf.filename, pf.original_name, pf.upload_date,
           pf.category,
           u.email as uploaded_by_email, COUNT(p.id) as product_count
    FROM price_files pf
    LEFT JOIN users u ON pf.uploaded_by = u.id
    LEFT JOIN products p ON p.file_id = pf.id
    GROUP BY pf.id ORDER BY pf.category ASC, pf.upload_date DESC
  `).all();
  res.json(files);
});

router.post('/upload', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
  const db = getDb();
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let rows = [];
    let sheetsSummary = [];

    if (ext === '.pdf') {
      const pdfRows = await parsePdf(req.file.path);
      const colMap = buildColumnMap(pdfRows[0] || {});
      rows = pdfRows.map(row => {
        const get = (field) => colMap[field] ? String(row[colMap[field]] ?? '') : (row[field] ? String(row[field]) : '');
        return {
          reference: get('reference'), designation: get('designation') || row.designation || '',
          description: get('description'), configuration: get('configuration'),
          unit: get('unit'), price_ht: row.price_ht ?? parsePrice(get('price_ht')),
          price_ttc: row.price_ttc ?? parsePrice(get('price_ttc')),
          pa: parsePrice(get('pa')),
          margin_1_3: null, margin_4_9: null, margin_10: null,
          loc_base_sem: null, loc_base_mois: null, loc_part_sem: null,
          loc_part_mois: null, loc_gc_sem: null, loc_gc_mois: null,
          supplier: req.file.originalname.replace(/\.[^.]+$/, ''), sheet: 'PDF',
        };
      });
      sheetsSummary = [{ name: 'PDF', count: rows.length }];
    } else if (ext === '.docx' || ext === '.doc') {
      const docxRows = await parseDocx(req.file.path);
      const colMap = buildColumnMap(docxRows[0] || {});
      rows = docxRows.map(row => {
        const get = (field) => colMap[field] ? String(row[colMap[field]] ?? '') : (row[field] ? String(row[field]) : '');
        return {
          reference: get('reference'), designation: get('designation') || row.designation || '',
          description: get('description'), configuration: get('configuration'),
          unit: get('unit'), price_ht: row.price_ht ?? parsePrice(get('price_ht')),
          price_ttc: row.price_ttc ?? parsePrice(get('price_ttc')),
          pa: parsePrice(get('pa')),
          margin_1_3: null, margin_4_9: null, margin_10: null,
          loc_base_sem: null, loc_base_mois: null, loc_part_sem: null,
          loc_part_mois: null, loc_gc_sem: null, loc_gc_mois: null,
          supplier: req.file.originalname.replace(/\.[^.]+$/, ''), sheet: 'Word',
        };
      });
      sheetsSummary = [{ name: 'Word', count: rows.length }];
    } else {
      const wb = XLSX.readFile(req.file.path);
      ({ rows, sheetsSummary } = parseAllSheets(wb));
    }

    if (!rows.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Fichier vide ou aucune colonne reconnue' });
    }

    // Si un fournisseur est fourni manuellement, il remplace la détection automatique
    const supplierOverride = req.body.supplier?.trim() || null;
    if (supplierOverride) {
      rows.forEach(r => { r.supplier = supplierOverride; });
    }

    const category = req.body.category?.trim() || 'Général';
    const fileResult = db.prepare(
      'INSERT INTO price_files (filename, original_name, uploaded_by, category) VALUES (?, ?, ?, ?)'
    ).run(req.file.filename, req.file.originalname, req.user.id, category);
    const fileId = fileResult.lastInsertRowid;

    const ins = db.prepare(
      'INSERT INTO products (reference,designation,description,configuration,unit,price_ht,price_ttc,pa,margin_1_3,margin_4_9,margin_10,loc_base_sem,loc_base_mois,loc_part_sem,loc_part_mois,loc_gc_sem,loc_gc_mois,supplier,file_id,extra_fields,sheet_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );

    db.exec('BEGIN');
    try {
      for (const r of rows) {
        ins.run(r.reference, r.designation, r.description, r.configuration,
                r.unit, r.price_ht, r.price_ttc, r.pa ?? null,
                r.margin_1_3, r.margin_4_9, r.margin_10,
                r.loc_base_sem ?? null, r.loc_base_mois ?? null,
                r.loc_part_sem ?? null, r.loc_part_mois ?? null,
                r.loc_gc_sem ?? null, r.loc_gc_mois ?? null,
                r.supplier ?? null, fileId, r.extra_fields ?? null,
                r.sheet ?? null);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }

    res.json({
      success: true, fileId, productCount: rows.length,
      sheetsSummary,
      sheetsCount: sheetsSummary.length,
      message: `${rows.length} ligne(s) importée(s) depuis "${req.file.originalname}"` +
               (sheetsSummary.length > 1 ? ` (${sheetsSummary.length} onglets)` : ''),
    });
  } catch (err) {
    console.error('[upload] Erreur :', err.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Erreur lors du traitement du fichier. Vérifiez son format.' });
  }
});

router.patch('/:id/category', authenticate, requireAdmin, (req, res) => {
  const { category } = req.body;
  if (!category || !category.trim()) return res.status(400).json({ error: 'Catégorie invalide' });
  const db = getDb();
  const file = db.prepare('SELECT * FROM price_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Fichier non trouvé' });
  db.prepare('UPDATE price_files SET category = ? WHERE id = ?').run(category.trim(), req.params.id);
  res.json({ id: file.id, category: category.trim() });
});

router.patch('/:id/rename', authenticate, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom invalide' });
  const db = getDb();
  const file = db.prepare('SELECT * FROM price_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Fichier non trouvé' });
  db.prepare('UPDATE price_files SET original_name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ id: file.id, original_name: name.trim() });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const file = db.prepare('SELECT * FROM price_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Fichier non trouvé' });
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('DELETE FROM price_files WHERE id = ?').run(req.params.id);
  const fp = path.join(uploadsDir, file.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ success: true });
});

module.exports = router;
