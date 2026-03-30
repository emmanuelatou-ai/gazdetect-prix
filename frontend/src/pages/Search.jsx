import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../api/axios';
import { useToast, useIsMobile } from '../App';
import { CATEGORIES } from './Upload';
import MentionModal from '../components/MentionModal';

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const fmt = (v) => (v != null && v !== '' ? EUR.format(v) : null);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const PCT = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (v) => (v != null && v !== '') ? PCT.format(Number(v)) + ' %' : null;
const fmtFileName = (name) => name ? name.replace(/\.(xlsx|xls|pdf|docx|doc)$/i, '').replace(/_/g, ' ') : '—';

const th = {
  padding: '11px 14px', background: '#1a3a5c',
  color: 'rgba(255,255,255,0.85)', fontSize: 11.5, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  textAlign: 'left', whiteSpace: 'nowrap',
};

const thLoc = { ...th, background: '#701a75', textAlign: 'center' };

const SUPPLIER_COLORS = {
  'Dräger':              { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  'ISC':                 { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  'ATI':                 { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
  'CleanSpace':          { bg: '#f3e8ff', color: '#6b21a8', border: '#c4b5fd' },
  'Uniphos':             { bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
  'Scott & Spasciani':   { bg: '#fce7f3', color: '#9d174d', border: '#f9a8d4' },
  'Sundstrom':           { bg: '#cffafe', color: '#155e75', border: '#67e8f9' },
  'Tubes réactifs':      { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  'Masques bi':          { bg: '#ecfdf5', color: '#065f46', border: '#6ee7b7' },
  'Autres portables':    { bg: '#f8fafc', color: '#334155', border: '#e2e8f0' },
  'Location Portables':  { bg: '#fdf4ff', color: '#701a75', border: '#e879f9' },
  'Fixe':                { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  'Jetable':             { bg: '#fefce8', color: '#713f12', border: '#fde68a' },
  'ARI & Adduction dair':{ bg: '#fff1f2', color: '#9f1239', border: '#fda4af' },
  'Evacuation':          { bg: '#f0fdf4', color: '#14532d', border: '#86efac' },
};

function isLocationSupplier(supplier) {
  return supplier && supplier.toLowerCase().includes('location');
}

function isGazEtalon(product) {
  if (!product) return false;
  const sheet = (product.sheet_name || '').toLowerCase();
  const sup   = (product.supplier  || '').toLowerCase();
  if (sheet.includes('accessoire') || sheet.includes('transport')) return false;
  return sheet.includes('etalon') || sup.includes('etalon') || sup.includes('gazetalon');
}

function getGazName(configuration) {
  if (!configuration) return '—';
  const parts = configuration.split(' — ');
  return parts[parts.length - 1] || '—';
}

// ── Colonnes actives selon les données présentes ──────────────────────────
function computeActiveColumns(items) {
  if (!items || !items.length) return {};
  const has = (key) => items.some(r => r[key] != null && r[key] !== 0 && r[key] !== '');
  const suppliers = new Set(items.map(r => r.supplier).filter(Boolean));
  return {
    configuration: has('configuration'),
    unit:          has('unit'),
    price_ht:      has('price_ht'),
    pa:            has('pa'),
    margin_1_3:    has('margin_1_3'),
    margin_4_9:    has('margin_4_9'),
    margin_10:     has('margin_10'),
    supplier:      suppliers.size > 1,
    // Groupes location (masquer groupe si aucune valeur)
    loc_base:      has('loc_base_sem') || has('loc_base_mois'),
    loc_part:      has('loc_part_sem') || has('loc_part_mois'),
    loc_gc:        has('loc_gc_sem')  || has('loc_gc_mois'),
  };
}

function SupplierBadge({ supplier }) {
  if (!supplier) return <span style={{ color: '#94a3b8' }}>—</span>;
  const c = SUPPLIER_COLORS[supplier] || { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, padding: '2px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {supplier}
    </span>
  );
}

/* ── F5 : Copie rapide du tarif ─────────────────────────────────────────── */
function CopyablePrice({ value, color, showToast, unit }) {
  if (!fmt(value)) return <span style={{ color: '#94a3b8' }}>N/A</span>;
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(fmt(value) || '').then(() => {
      showToast?.(`📋 ${fmt(value)} copié`, 'success', 2000);
    });
  };
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <span
        onClick={copy} title="Cliquer pour copier"
        style={{ color, fontWeight: 600, cursor: 'copy', borderRadius: 4, padding: '1px 3px', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.07)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {fmt(value)}
      </span>
      {unit && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, letterSpacing: '0.02em' }}>{unit}</span>}
    </span>
  );
}

/* ── Tous les prix d'un produit (price_ht + extra_fields prix) ─────────── */
// Nettoyage des labels pour les clés gaz étalon
const ETALON_LABEL_MAP = {
  'PRIX 34L HT': '34 L', 'PRIX 34 L HT': '34 L',
  'PRIX 58L HT': '58 L', 'PRIX 58 L HT': '58 L',
  'PRIX 110L HT': '110 L', 'PRIX 110 L HT': '110 L',
};
function cleanEtalonLabel(k) {
  return ETALON_LABEL_MAP[k.toUpperCase().trim()] || null;
}

function AllPrices({ product, color = '#1a3a5c' }) {
  let ef = null;
  try { ef = product.extra_fields ? JSON.parse(product.extra_fields) : null; } catch {}

  // Détecter si c'est un gaz étalon (a des prix 58L ou 110L dans extra_fields)
  const isEtalon = ef && (ef['PRIX 58L HT'] || ef['PRIX 110L HT'] || ef['PRIX 34L HT']);

  const main = [];
  if (product.price_ht != null)  main.push({ label: isEtalon ? '34 L' : null, value: product.price_ht });
  if (product.price_ttc != null) main.push({ label: 'TTC',  value: product.price_ttc });
  if (product.pa != null)        main.push({ label: 'PA',   value: product.pa, pa: true });

  // Prix supplémentaires depuis extra_fields
  let extra = [];
  if (ef) {
    extra = Object.entries(ef)
      .filter(([k]) => /prix|tarif|price/i.test(k))
      .map(([k, v]) => ({
        label: cleanEtalonLabel(k) || k,
        isEtalonSize: !!cleanEtalonLabel(k),
        value: parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, '')),
      }))
      .filter(e => !isNaN(e.value) && e.value > 0);
  }

  if (!main.length && !extra.length) return <span style={{ color: '#94a3b8' }}>N/A</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
      {main.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {p.label && (
            <span style={{ fontSize: 10, color: isEtalon ? '#0369a1' : '#94a3b8', background: isEtalon ? '#e0f2fe' : '#f1f5f9', borderRadius: 3, padding: '0 4px', fontWeight: isEtalon ? 700 : 400 }}>
              {p.label}
            </span>
          )}
          <span style={{ fontWeight: 600, color: p.pa ? '#7c3aed' : color, fontSize: 13 }}>{fmt(p.value)}</span>
        </div>
      ))}
      {extra.map((p, i) => (
        <div key={`x${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 10, borderRadius: 3, padding: '0 4px', whiteSpace: 'nowrap',
            ...(p.isEtalonSize
              ? { color: '#0369a1', background: '#e0f2fe', fontWeight: 700 }
              : { color: '#94a3b8', background: '#fef9c3', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }
            )
          }} title={p.label}>{p.label}</span>
          <span style={{ fontWeight: 600, color: p.isEtalonSize ? '#1a5c2a' : '#854d0e', fontSize: 12.5 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Copie de texte générique ────────────────────────────────────────────── */
function CopyableText({ value, style, showToast, mono }) {
  if (!value) return <span style={{ color: '#94a3b8' }}>—</span>;
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(String(value)).then(() => {
      showToast?.(`📋 Copié`, 'success', 1800);
    });
  };
  return (
    <span
      onClick={copy} title="Cliquer pour copier"
      style={{
        cursor: 'copy', borderRadius: 4, padding: '1px 3px',
        transition: 'background 0.15s',
        fontFamily: mono ? 'monospace' : 'inherit',
        ...style,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {value}
    </span>
  );
}

/* ── F3 : Étoile favori ─────────────────────────────────────────────────── */
function FavStar({ productId, isFav, onToggle }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(productId); }}
      title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '1px 2px', color: isFav ? '#f59e0b' : '#d1d5db', transition: 'color 0.15s, transform 0.15s', display: 'block', margin: '0 auto' }}
      onMouseEnter={e => { e.currentTarget.style.color = isFav ? '#d97706' : '#9ca3af'; e.currentTarget.style.transform = 'scale(1.25)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = isFav ? '#f59e0b' : '#d1d5db'; e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {isFav ? '★' : '☆'}
    </button>
  );
}

/* ── F4 : Comparateur ───────────────────────────────────────────────────── */
const COMPARE_FIELDS = [
  { label: 'Référence',      key: 'reference',     fmt: v => v || '—' },
  { label: 'Désignation',    key: 'designation',   fmt: v => v || '—' },
  { label: 'Gamme/Produit',  key: 'configuration', fmt: v => v || '—' },
  { label: 'Unité',          key: 'unit',          fmt: v => v || '—' },
  { label: 'Prix HT',        key: 'price_ht',      fmt: v => fmt(v) || '—', highlight: true },
  { label: 'PA',             key: 'pa',            fmt: v => fmt(v) || '—' },
  { label: 'Marge 1 à 3',    key: 'margin_1_3',   fmt: v => fmtPct(v) || '—' },
  { label: 'Marge 4 à 9',    key: 'margin_4_9',   fmt: v => fmtPct(v) || '—' },
  { label: 'Marge 10+',      key: 'margin_10',    fmt: v => fmtPct(v) || '—' },
  { label: 'Loc. Base Sem.', key: 'loc_base_sem',  fmt: v => fmt(v) || '—' },
  { label: 'Loc. Base Mois', key: 'loc_base_mois', fmt: v => fmt(v) || '—' },
  { label: 'Loc. Part. Sem.',key: 'loc_part_sem',  fmt: v => fmt(v) || '—' },
  { label: 'Loc. Part. Mois',key: 'loc_part_mois', fmt: v => fmt(v) || '—' },
  { label: 'Loc. GC Sem.',   key: 'loc_gc_sem',   fmt: v => fmt(v) || '—' },
  { label: 'Loc. GC Mois',   key: 'loc_gc_mois',  fmt: v => fmt(v) || '—' },
  { label: 'Fournisseur',    key: 'supplier',     fmt: v => v || '—' },
  { label: 'Fichier source', key: 'file_name',    fmt: v => fmtFileName(v) },
];

function CompareModal({ products, onClose }) {
  // N'afficher que les champs où au moins un produit a une valeur
  const relevant = COMPARE_FIELDS.filter(f =>
    products.some(p => p[f.key] != null && p[f.key] !== '')
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: Math.min(260 + products.length * 240, 1100), maxHeight: '88vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #dde3ec', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 2 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1a3a5c' }}>⊞ Comparateur — {products.length} produits</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        <div style={{ padding: '16px 24px 24px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...th, background: '#f8fafc', color: '#64748b', width: 150, textTransform: 'none', letterSpacing: 0, position: 'sticky', left: 0, zIndex: 1 }}>Champ</th>
                {products.map((p, i) => (
                  <th key={p.id} style={{ ...th, background: i % 2 === 0 ? '#1a3a5c' : '#243f63', textAlign: 'center', minWidth: 200, textTransform: 'none', letterSpacing: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 10.5, opacity: 0.75, marginBottom: 3 }}>{p.reference || '—'}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.designation || '—'}</div>
                    {p.supplier && <div style={{ marginTop: 4 }}><SupplierBadge supplier={p.supplier} /></div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relevant.map((field, i) => {
                // Trouver le meilleur prix HT pour le surlignage
                const isBestPrice = field.highlight;
                const prices = isBestPrice ? products.map(p => p[field.key]).filter(v => v != null) : [];
                const bestPrice = prices.length > 1 ? Math.min(...prices) : null;
                return (
                  <tr key={field.key} style={{ background: i % 2 === 0 ? 'white' : '#f8fafd' }}>
                    <td style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #f1f5f9', position: 'sticky', left: 0, background: i % 2 === 0 ? 'white' : '#f8fafd', zIndex: 1 }}>
                      {field.label}
                    </td>
                    {products.map(p => {
                      const val = field.fmt(p[field.key]);
                      const isBest = isBestPrice && bestPrice != null && p[field.key] === bestPrice;
                      return (
                        <td key={p.id} style={{ padding: '9px 14px', fontSize: 13, textAlign: 'center', borderBottom: '1px solid #f1f5f9', color: isBest ? '#1d9e75' : '#1e293b', fontWeight: isBest ? 700 : 400, background: isBest ? 'rgba(29,158,117,0.06)' : 'transparent' }}>
                          {val}
                          {isBest && <div style={{ fontSize: 10, color: '#1d9e75', marginTop: 2 }}>✓ Meilleur prix</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function groupByReference(results) {
  const map = new Map();
  for (const p of results) {
    const key = p.reference?.trim() || `__nref_${p.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.entries()].map(([key, variants]) => ({ key, variants }));
}

// ── Panneau détail produit ─────────────────────────────────────────────────

function Row({ label, value, mono, unit, showToast }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <CopyableText value={String(value)} mono={mono} showToast={showToast} style={{ fontSize: 13, color: '#1e293b', fontWeight: 600, textAlign: 'right' }} />
        {unit && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, background: '#f1f5f9', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.02em' }}>{unit}</span>}
      </span>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 18, marginBottom: 6 }}>{children}</div>;
}

function ProductDetailPanel({ product, onClose, onMention }) {
  if (!product) return null;
  const isLoc = isLocationSupplier(product.supplier);
  const isMobile = useIsMobile();
  const { showToast } = useToast();
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', zIndex: 201,
        background: 'white', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        boxShadow: isMobile ? '0 -8px 40px rgba(0,0,0,0.2)' : '-8px 0 40px rgba(0,0,0,0.15)',
        // Mobile : panneau glissant depuis le bas (plein écran)
        ...(isMobile
          ? { top: '10%', right: 0, bottom: 0, left: 0, borderRadius: '16px 16px 0 0', animation: 'slideInUp 0.25s ease' }
          : { top: 0, right: 0, bottom: 0, width: 420 }
        ),
      }}>
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid #dde3ec', background: '#1a3a5c' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              {product.reference && (
                <div style={{ display: 'inline-block', marginBottom: 6 }}>
                  <CopyableText value={product.reference} mono showToast={showToast} style={{ fontSize: 12, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', padding: '2px 8px', borderRadius: 4 }} />
                </div>
              )}
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white', lineHeight: 1.4 }}>
                <CopyableText value={product.designation} showToast={showToast} style={{ fontSize: 16, fontWeight: 700, color: 'white' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => onMention?.(product)}
                title="Taguer un collègue sur ce produit"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
              >@</button>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          </div>
          {product.supplier && <div style={{ marginTop: 10 }}><SupplierBadge supplier={product.supplier} /></div>}
        </div>
        <div style={{ padding: '4px 22px 22px', flex: 1 }}>
          <SectionTitle>Informations</SectionTitle>
          {product.reference && (
            <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, flexShrink: 0 }}>{isGazEtalon(product) ? 'Réf. 34 L' : 'Code / Référence'}</span>
              <CopyableText value={product.reference} mono showToast={showToast} style={{ fontWeight: 700, fontSize: 13, background: '#f1f5f9', padding: '3px 10px', borderRadius: 5, color: '#1a3a5c', letterSpacing: '0.03em' }} />
            </div>
          )}
          {isGazEtalon(product) && (() => {
            let ef = {};
            try { ef = product.extra_fields ? JSON.parse(product.extra_fields) : {}; } catch {}
            const r58  = ef['Réf. 58 L']  || ef['RÉF. 58L']  || ef['REF. 58L']  || null;
            const r110 = ef['Réf. 110 L'] || ef['RÉF. 110L'] || ef['REF. 110L'] || null;
            return (
              <>
                {r58  && <Row label="Réf. 58 L"  value={r58}  showToast={showToast} />}
                {r110 && <Row label="Réf. 110 L" value={r110} showToast={showToast} />}
              </>
            );
          })()}
          <Row label="Désignation" value={product.designation} showToast={showToast} />
          {product.configuration && product.configuration !== product.designation && (
            <Row label="Gamme / Produit" value={product.configuration} showToast={showToast} />
          )}
          <Row label="Unité" value={product.unit} showToast={showToast} />
          {product.description && product.description !== product.designation && (
            <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>Description</div>
              <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.5 }}>{product.description}</div>
            </div>
          )}
          {/* Tarification — tous les prix disponibles, avec contexte unité */}
          {(product.price_ht != null || product.price_ttc != null || product.pa != null) && (() => {
            const etalonDetect = isGazEtalon(product);
            const htLabel = etalonDetect ? 'Prix 34 L' : 'Prix HT';
            return (
              <>
                <SectionTitle>Tarification</SectionTitle>
                <Row label={htLabel}         value={fmt(product.price_ht)}  unit={product.unit || null} showToast={showToast} />
                <Row label="Prix TTC"        value={fmt(product.price_ttc)} unit={product.unit || null} showToast={showToast} />
                <Row label="PA (Prix achat)" value={fmt(product.pa)}        unit={product.unit || null} showToast={showToast} />
              </>
            );
          })()}
          {/* Tarifs par contenance (Gaz Étalon) */}
          {isGazEtalon(product) && (product.margin_1_3 != null || product.margin_4_9 != null) && (() => {
            let efCheck = {};
            try { efCheck = product.extra_fields ? JSON.parse(product.extra_fields) : {}; } catch {}
            const p58  = product.margin_1_3 != null ? product.margin_1_3
                       : (efCheck['Prix 58 L']  ? parseFloat(String(efCheck['Prix 58 L']).replace(/[€\s]/g,'').replace(',','.'))  : null);
            const p110 = product.margin_4_9 != null ? product.margin_4_9
                       : (efCheck['Prix 110 L'] ? parseFloat(String(efCheck['Prix 110 L']).replace(/[€\s]/g,'').replace(',','.')) : null);
            return (
              <>
                <SectionTitle>Tarifs par contenance</SectionTitle>
                {p58  != null && <Row label="Prix 58 L"  value={fmt(p58)}  showToast={showToast} />}
                {p110 != null && <Row label="Prix 110 L" value={fmt(p110)} showToast={showToast} />}
              </>
            );
          })()}
          {/* Marges (produits non-étalon) */}
          {!isGazEtalon(product) && (product.margin_1_3 != null || product.margin_4_9 != null || product.margin_10 != null) && (
            <>
              <SectionTitle>Marges commerciales</SectionTitle>
              <Row label="1 à 3 unités" value={fmtPct(product.margin_1_3)} showToast={showToast} />
              <Row label="4 à 9 unités" value={fmtPct(product.margin_4_9)} showToast={showToast} />
              <Row label="10 et plus"   value={fmtPct(product.margin_10)}  showToast={showToast} />
            </>
          )}
          {/* Tarifs location — avec contexte temporel */}
          {(product.loc_base_sem != null || product.loc_base_mois != null) && (
            <>
              <SectionTitle>Tarifs Location — Base</SectionTitle>
              <Row label="Tarif semaine" value={fmt(product.loc_base_sem)}  unit="par semaine" showToast={showToast} />
              <Row label="Tarif mois"    value={fmt(product.loc_base_mois)} unit="par mois"    showToast={showToast} />
            </>
          )}
          {(product.loc_part_sem != null || product.loc_part_mois != null) && (
            <>
              <SectionTitle>Tarifs Location — Partenaires</SectionTitle>
              <Row label="Tarif semaine" value={fmt(product.loc_part_sem)}  unit="par semaine" showToast={showToast} />
              <Row label="Tarif mois"    value={fmt(product.loc_part_mois)} unit="par mois"    showToast={showToast} />
            </>
          )}
          {(product.loc_gc_sem != null || product.loc_gc_mois != null) && (
            <>
              <SectionTitle>Tarifs Location — Grands Comptes</SectionTitle>
              <Row label="Tarif semaine" value={fmt(product.loc_gc_sem)}  unit="par semaine" showToast={showToast} />
              <Row label="Tarif mois"    value={fmt(product.loc_gc_mois)} unit="par mois"    showToast={showToast} />
            </>
          )}
          {/* Informations complémentaires (colonnes extra du fichier) */}
          {(() => {
            try {
              const extra = product.extra_fields ? JSON.parse(product.extra_fields) : null;
              if (!extra || !Object.keys(extra).length) return null;

              // Séparer les clés "prix/tarif" des autres
              const isPriceKey   = (k) => /prix|tarif|price/i.test(k);
              const isMarginKey  = (k) => /marge|margin/i.test(k);
              // Exclure les clés gaz étalon déjà affichées dans "Informations" et "Tarifs par contenance"
              const isEtalonKey  = (k) => /PRIX\s*(34|58|110)\s*L/i.test(k) || (isGazEtalon(product) && /R[EÉeé][Ff]\.?\s*(58|110)\s*L/i.test(k));
              const priceEntries  = Object.entries(extra).filter(([k]) => isPriceKey(k) && !isEtalonKey(k));
              const marginEntries = Object.entries(extra).filter(([k]) => isMarginKey(k) && !isPriceKey(k));
              const otherEntries  = Object.entries(extra).filter(([k]) => !isPriceKey(k) && !isMarginKey(k) && !isEtalonKey(k));

              const fmtPriceVal = (v) => {
                const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
                return !isNaN(n) && n > 0 ? (fmt(n) || String(v)) : String(v);
              };
              const fmtMarginVal = (v) => {
                const n = parseFloat(String(v).replace(',', '.'));
                if (!isNaN(n)) { const pct = n < 1 ? Math.round(n * 1000) / 10 : n; return PCT.format(pct) + ' %'; }
                return String(v);
              };

              return (
                <>
                  {priceEntries.length > 0 && (
                    <>
                      <SectionTitle>Tarifs par contenance</SectionTitle>
                      {priceEntries.map(([k, v]) => (
                        <Row key={k} label={k} value={fmtPriceVal(v)} showToast={showToast} />
                      ))}
                    </>
                  )}
                  {marginEntries.length > 0 && (
                    <>
                      <SectionTitle>Marges complémentaires</SectionTitle>
                      {marginEntries.map(([k, v]) => (
                        <Row key={k} label={k} value={fmtMarginVal(v)} showToast={showToast} />
                      ))}
                    </>
                  )}
                  {otherEntries.length > 0 && (
                    <>
                      <SectionTitle>Informations complémentaires</SectionTitle>
                      {otherEntries.map(([k, v]) => (
                        <Row key={k} label={k} value={String(v)} showToast={showToast} />
                      ))}
                    </>
                  )}
                </>
              );
            } catch { return null; }
          })()}
          <SectionTitle>Source</SectionTitle>
          <Row label="Fichier"    value={fmtFileName(product.file_name)} />
          <Row label="Importé le" value={fmtDate(product.upload_date)} />
        </div>
      </div>
    </>
  );
}

// ── Tableau standard ─────────────────────────────────────────────────────────

function VariantRow({ p, isLast, onSelect, favIds, toggleFav, compareList, toggleCompare, showToast, activeCols }) {
  const tdBase = {
    padding: '8px 14px 8px 24px',
    borderBottom: isLast ? 'none' : '1px solid #e8edf4',
    fontSize: 12.5, verticalAlign: 'middle', background: '#f8fafd', cursor: 'pointer',
  };
  const inCompare = compareList.some(c => c.id === p.id);
  return (
    <tr onClick={() => onSelect(p)}
      onMouseEnter={e => [...e.currentTarget.cells].forEach(c => c.style.background = '#eef6f2')}
      onMouseLeave={e => [...e.currentTarget.cells].forEach(c => c.style.background = '#f8fafd')}
    >
      {/* Actions */}
      <td style={{ ...tdBase, padding: '6px 8px', textAlign: 'center', width: 50 }} onClick={e => e.stopPropagation()}>
        <FavStar productId={p.id} isFav={favIds.has(p.id)} onToggle={toggleFav} />
        <input type="checkbox" checked={inCompare} onChange={() => toggleCompare(p)} title="Comparer" style={{ marginTop: 3, cursor: 'pointer' }} />
      </td>
      {/* Référence (vide dans variant) */}
      <td style={{ ...tdBase, maxWidth: 200 }} />
      {/* Configuration — masquée si absent du jeu de données */}
      {activeCols.configuration && (
        <td style={{ ...tdBase, color: '#64748b' }}>
          {p.configuration && p.configuration !== p.designation
            ? <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#475569', border: '1px solid #dde3ec' }}>{p.configuration}</span>
            : p.description && p.description !== p.designation
              ? <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#475569', border: '1px solid #dde3ec' }}>{p.description}</span>
              : <span style={{ color: '#94a3b8' }}>—</span>}
        </td>
      )}
      {activeCols.unit && <td style={{ ...tdBase, color: '#64748b' }}>{p.unit || '—'}</td>}
      {(activeCols.price_ht || activeCols.pa) && (
        <td style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'right' }} colSpan={[activeCols.price_ht, activeCols.pa].filter(Boolean).length}>
          <AllPrices product={p} />
        </td>
      )}
      {activeCols.margin_1_3 && (
        <td style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'center' }}>
          {fmtPct(p.margin_1_3) ? <span style={{ color: '#7f1d1d', fontWeight: 600 }}>{fmtPct(p.margin_1_3)}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
        </td>
      )}
      {activeCols.margin_4_9 && (
        <td style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'center' }}>
          {fmtPct(p.margin_4_9) ? <span style={{ color: '#7f1d1d', fontWeight: 600 }}>{fmtPct(p.margin_4_9)}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
        </td>
      )}
      {activeCols.margin_10 && (
        <td style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'center' }}>
          {fmtPct(p.margin_10) ? <span style={{ color: '#7f1d1d', fontWeight: 600 }}>{fmtPct(p.margin_10)}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
        </td>
      )}
      {activeCols.supplier && <td style={tdBase}><SupplierBadge supplier={p.supplier} /></td>}
      <td style={{ ...tdBase, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
        <div>📄 {fmtFileName(p.file_name)}</div>
        <div>{fmtDate(p.upload_date)}</div>
      </td>
    </tr>
  );
}

function ProductGroup({ group, idx, onSelect, favIds, toggleFav, compareList, toggleCompare, showToast, activeCols, onMention }) {
  const { variants } = group;
  const first = variants[0];
  const multi = variants.length > 1;
  const [open, setOpen] = useState(multi);

  const rowBg = idx % 2 === 0 ? 'white' : '#fafcff';
  const hoverBg = idx % 2 === 0 ? '#f0faf6' : '#e8f7f2';
  const tdBase = {
    padding: '11px 14px', borderBottom: '1px solid #dde3ec',
    fontSize: 13.5, verticalAlign: 'middle', background: rowBg,
  };

  const inCompare = compareList.some(c => c.id === first.id);

  return (
    <>
      <tr
        style={{ background: rowBg, cursor: 'pointer' }}
        onClick={() => onSelect(first)}
        onMouseEnter={e => [...e.currentTarget.cells].forEach(c => c.style.background = hoverBg)}
        onMouseLeave={e => [...e.currentTarget.cells].forEach(c => c.style.background = rowBg)}
      >
        {/* Actions */}
        <td style={{ ...tdBase, padding: '8px', textAlign: 'center', width: 50 }} onClick={e => e.stopPropagation()}>
          <FavStar productId={first.id} isFav={favIds.has(first.id)} onToggle={toggleFav} />
          <input type="checkbox" checked={inCompare} onChange={() => toggleCompare(first)} title="Ajouter au comparateur" style={{ marginTop: 3, cursor: 'pointer' }} />
          <button
            onClick={() => onMention?.(first)}
            title="Taguer un collègue"
            style={{ display: 'block', margin: '3px auto 0', width: 18, height: 18, borderRadius: 4, border: '1px solid #dde3ec', background: 'white', color: '#1a3a5c', cursor: 'pointer', fontSize: 11, fontWeight: 700, lineHeight: 1, padding: 0 }}
          >@</button>
        </td>

        {/* Reference */}
        <td style={{ ...tdBase, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {multi && (
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                title={open ? 'Réduire' : 'Voir toutes les configurations'}
                style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #dde3ec', background: open ? '#1d9e75' : 'white', color: open ? 'white' : '#64748b', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                {open ? '−' : '+'}
              </button>
            )}
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, background: '#f1f5f9', padding: '2px 7px', borderRadius: 4, color: '#1a3a5c', whiteSpace: 'nowrap' }}>
              {first.reference || '—'}
            </span>
          </div>
        </td>

        {/* Designation */}
        <td style={{ ...tdBase, fontWeight: 600, maxWidth: 260 }}>
          <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }} title={first.designation}>
            {first.designation || '—'}
          </div>
          {multi && (
            <div style={{ marginTop: 4 }}>
              <span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                {variants.length} modèle{variants.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </td>

        {!multi ? (
          <>
            {activeCols.configuration && (
              <td style={tdBase}>
                {first.configuration && first.configuration !== first.designation
                  ? <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#475569', border: '1px solid #dde3ec' }}>{first.configuration}</span>
                  : first.description && first.description !== first.designation
                    ? <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#475569', border: '1px solid #dde3ec' }}>{first.description}</span>
                    : <span style={{ color: '#94a3b8' }}>—</span>}
              </td>
            )}
            {activeCols.unit && <td style={{ ...tdBase, color: '#64748b', fontSize: 12.5 }}>{first.unit || '—'}</td>}
            {(activeCols.price_ht || activeCols.pa) && (
              <td style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'right' }} colSpan={[activeCols.price_ht, activeCols.pa].filter(Boolean).length}>
                <AllPrices product={first} />
              </td>
            )}
            {activeCols.margin_1_3 && (
              <td style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'center' }}>
                {fmtPct(first.margin_1_3) ? <span style={{ color: '#7f1d1d', fontWeight: 600 }}>{fmtPct(first.margin_1_3)}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
              </td>
            )}
            {activeCols.margin_4_9 && (
              <td style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'center' }}>
                {fmtPct(first.margin_4_9) ? <span style={{ color: '#7f1d1d', fontWeight: 600 }}>{fmtPct(first.margin_4_9)}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
              </td>
            )}
            {activeCols.margin_10 && (
              <td style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'center' }}>
                {fmtPct(first.margin_10) ? <span style={{ color: '#7f1d1d', fontWeight: 600 }}>{fmtPct(first.margin_10)}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
              </td>
            )}
            {activeCols.supplier && <td style={tdBase}><SupplierBadge supplier={first.supplier} /></td>}
            <td style={{ ...tdBase, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
              <div>📄 {fmtFileName(first.file_name)}</div>
              <div>{fmtDate(first.upload_date)}</div>
            </td>
          </>
        ) : (
          <>
            {/* Cellule description couvre Config + Unité si présents */}
            {(() => {
              const span = (activeCols.configuration ? 1 : 0) + (activeCols.unit ? 1 : 0);
              return span > 0 ? (
                <td style={{ ...tdBase, color: '#64748b', fontSize: 12 }} colSpan={span}>
                  {open ? 'Toutes les configurations ci-dessous ↓' : `Cliquez + pour voir les ${variants.length} configurations`}
                </td>
              ) : null;
            })()}
            {(activeCols.price_ht || activeCols.pa) && (
              <td style={{ ...tdBase, whiteSpace: 'nowrap', fontSize: 12, textAlign: 'right' }}
                  colSpan={[activeCols.price_ht, activeCols.pa].filter(Boolean).length}>
                {(() => {
                  const prices = variants.map(v => v.price_ht).filter(v => v != null);
                  const pas    = variants.map(v => v.pa).filter(v => v != null);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
                      {prices.length > 0 && (() => { const mn = Math.min(...prices), mx = Math.max(...prices); return <span style={{ color: '#1a3a5c', fontWeight: 600 }}>{mn === mx ? fmt(mn) : `${fmt(mn)} – ${fmt(mx)}`}</span>; })()}
                      {pas.length   > 0 && (() => { const mn = Math.min(...pas),    mx = Math.max(...pas);    return <span style={{ color: '#7c3aed', fontWeight: 600, fontSize: 11 }}>{mn === mx ? fmt(mn) : `${fmt(mn)} – ${fmt(mx)}`} <span style={{ fontSize: 9, opacity: 0.7 }}>PA</span></span>; })()}
                    </div>
                  );
                })()}
              </td>
            )}
            {['margin_1_3', 'margin_4_9', 'margin_10'].filter(f => activeCols[f]).map((field, i) => (
              <td key={i} style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'center', fontSize: 12 }}>
                {(() => {
                  const vals = variants.map(v => v[field]).filter(v => v != null);
                  if (!vals.length) return <span style={{ color: '#94a3b8' }}>—</span>;
                  const min = Math.min(...vals), max = Math.max(...vals);
                  return <span style={{ color: '#7f1d1d', fontWeight: 600 }}>{min === max ? fmtPct(min) : `${fmtPct(min)} – ${fmtPct(max)}`}</span>;
                })()}
              </td>
            ))}
            {activeCols.supplier && <td style={tdBase}><SupplierBadge supplier={first.supplier} /></td>}
            <td style={{ ...tdBase, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
              <div>📄 {fmtFileName(first.file_name)}</div>
              <div>{fmtDate(first.upload_date)}</div>
            </td>
          </>
        )}
      </tr>

      {multi && open && variants.map((v, i) => (
        <VariantRow key={v.id} p={v} isLast={i === variants.length - 1} onSelect={onSelect}
          favIds={favIds} toggleFav={toggleFav} compareList={compareList} toggleCompare={toggleCompare} showToast={showToast} activeCols={activeCols} />
      ))}
    </>
  );
}

// ── Tableau Location ─────────────────────────────────────────────────────────

const LOC_FIELDS = [
  { key: 'loc_base_sem',  label: 'Sem.',  group: 'Base',          period: 'semaine' },
  { key: 'loc_base_mois', label: 'Mois',  group: 'Base',          period: 'mois' },
  { key: 'loc_part_sem',  label: 'Sem.',  group: 'Partenaires',   period: 'semaine' },
  { key: 'loc_part_mois', label: 'Mois',  group: 'Partenaires',   period: 'mois' },
  { key: 'loc_gc_sem',    label: 'Sem.',  group: 'Grands Comptes', period: 'semaine' },
  { key: 'loc_gc_mois',   label: 'Mois',  group: 'Grands Comptes', period: 'mois' },
];

function LocPriceCell({ value, style, showToast, period }) {
  return (
    <td style={{ ...style, whiteSpace: 'nowrap', textAlign: 'right' }}>
      {fmt(value)
        ? <CopyablePrice value={value} color="#701a75" showToast={showToast} unit={period ? `/ ${period}` : null} />
        : <span style={{ color: '#94a3b8' }}>—</span>}
    </td>
  );
}

function LocationVariantRow({ p, isLast, onSelect, favIds, toggleFav, compareList, toggleCompare, showToast, activeLoc }) {
  const tdBase = {
    padding: '8px 14px 8px 24px',
    borderBottom: isLast ? 'none' : '1px solid #e8edf4',
    fontSize: 12.5, verticalAlign: 'middle', background: '#fdf4ff', cursor: 'pointer',
  };
  const inCompare = compareList.some(c => c.id === p.id);
  const visibleLocFields = LOC_FIELDS.filter(f =>
    (f.group === 'Base'          && activeLoc.loc_base) ||
    (f.group === 'Partenaires'   && activeLoc.loc_part) ||
    (f.group === 'Grands Comptes' && activeLoc.loc_gc)
  );
  return (
    <tr onClick={() => onSelect(p)}
      onMouseEnter={e => [...e.currentTarget.cells].forEach(c => c.style.background = '#f3e0f7')}
      onMouseLeave={e => [...e.currentTarget.cells].forEach(c => c.style.background = '#fdf4ff')}
    >
      <td style={{ ...tdBase, padding: '6px 8px', textAlign: 'center', width: 50 }} onClick={e => e.stopPropagation()}>
        <FavStar productId={p.id} isFav={favIds.has(p.id)} onToggle={toggleFav} />
        <input type="checkbox" checked={inCompare} onChange={() => toggleCompare(p)} title="Comparer" style={{ marginTop: 3, cursor: 'pointer' }} />
      </td>
      <td style={tdBase} />
      {activeLoc.configuration !== false && (
        <td style={{ ...tdBase, color: '#64748b' }}>
          {p.configuration
            ? <span style={{ background: '#f5e6ff', padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#701a75', border: '1px solid #e879f9' }}>{p.configuration}</span>
            : <span style={{ color: '#94a3b8' }}>—</span>}
        </td>
      )}
      {activeLoc.unit !== false && <td style={{ ...tdBase, color: '#64748b' }}>{p.unit || '—'}</td>}
      {visibleLocFields.map(f => (
        <LocPriceCell key={f.key} value={p[f.key]} style={tdBase} showToast={showToast} period={f.period} />
      ))}
      <td style={{ ...tdBase, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
        <div>📄 {fmtFileName(p.file_name)}</div>
        <div>{fmtDate(p.upload_date)}</div>
      </td>
    </tr>
  );
}

function LocationGroup({ group, idx, onSelect, favIds, toggleFav, compareList, toggleCompare, showToast, activeLoc, onMention }) {
  const { variants } = group;
  const first = variants[0];
  const multi = variants.length > 1;
  const [open, setOpen] = useState(multi);

  const rowBg = idx % 2 === 0 ? 'white' : '#fdf4ff';
  const hoverBg = idx % 2 === 0 ? '#f5e0f9' : '#efd5f5';
  const tdBase = {
    padding: '11px 14px', borderBottom: '1px solid #dde3ec',
    fontSize: 13.5, verticalAlign: 'middle', background: rowBg,
  };

  const priceRange = (field) => {
    const vals = variants.map(v => v[field]).filter(v => v != null);
    if (!vals.length) return null;
    const min = Math.min(...vals), max = Math.max(...vals);
    return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  };

  const inCompare = compareList.some(c => c.id === first.id);

  return (
    <>
      <tr
        style={{ background: rowBg, cursor: 'pointer' }}
        onClick={() => onSelect(first)}
        onMouseEnter={e => [...e.currentTarget.cells].forEach(c => c.style.background = hoverBg)}
        onMouseLeave={e => [...e.currentTarget.cells].forEach(c => c.style.background = rowBg)}
      >
        {/* Actions */}
        <td style={{ ...tdBase, padding: '8px', textAlign: 'center', width: 50 }} onClick={e => e.stopPropagation()}>
          <FavStar productId={first.id} isFav={favIds.has(first.id)} onToggle={toggleFav} />
          <input type="checkbox" checked={inCompare} onChange={() => toggleCompare(first)} title="Ajouter au comparateur" style={{ marginTop: 3, cursor: 'pointer' }} />
          <button
            onClick={() => onMention?.(first)}
            title="Taguer un collègue"
            style={{ display: 'block', margin: '3px auto 0', width: 18, height: 18, borderRadius: 4, border: '1px solid #e879f9', background: 'white', color: '#701a75', cursor: 'pointer', fontSize: 11, fontWeight: 700, lineHeight: 1, padding: 0 }}
          >@</button>
        </td>

        {/* Code */}
        <td style={{ ...tdBase, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {multi && (
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                title={open ? 'Réduire' : 'Voir toutes les configurations'}
                style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #e879f9', background: open ? '#701a75' : 'white', color: open ? 'white' : '#701a75', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                {open ? '−' : '+'}
              </button>
            )}
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, background: '#f5e6ff', padding: '2px 7px', borderRadius: 4, color: '#701a75', whiteSpace: 'nowrap' }}>
              {first.reference || '—'}
            </span>
          </div>
        </td>

        {/* Produit */}
        <td style={{ ...tdBase, fontWeight: 600, maxWidth: 220 }}>
          <div>{first.designation || '—'}</div>
          {multi && (
            <div style={{ marginTop: 4 }}>
              <span style={{ background: '#fdf4ff', color: '#701a75', border: '1px solid #e879f9', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                {variants.length} modèle{variants.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </td>

        {(() => {
          const visibleLocFields = LOC_FIELDS.filter(f =>
            (f.group === 'Base'           && activeLoc.loc_base) ||
            (f.group === 'Partenaires'    && activeLoc.loc_part) ||
            (f.group === 'Grands Comptes' && activeLoc.loc_gc)
          );
          return !multi ? (
            <>
              {activeLoc.configuration !== false && (
                <td style={tdBase}>
                  {first.configuration && first.configuration !== first.designation
                    ? <span style={{ background: '#f5e6ff', padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#701a75', border: '1px solid #e879f9' }}>{first.configuration}</span>
                    : first.description && first.description !== first.designation
                      ? <span style={{ background: '#f5e6ff', padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#701a75', border: '1px solid #e879f9' }}>{first.description}</span>
                      : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
              )}
              {activeLoc.unit !== false && <td style={{ ...tdBase, color: '#64748b', fontSize: 12.5 }}>{first.unit || '—'}</td>}
              {visibleLocFields.map(f => (
                <LocPriceCell key={f.key} value={first[f.key]} style={tdBase} showToast={showToast} period={f.period} />
              ))}
            </>
          ) : (
            <>
              {(() => {
                const span = (activeLoc.configuration !== false ? 1 : 0) + (activeLoc.unit !== false ? 1 : 0);
                return span > 0 ? (
                  <td style={{ ...tdBase, color: '#94a3b8', fontSize: 12 }} colSpan={span}>
                    {open ? 'Configurations ci-dessous ↓' : `+ pour voir les ${variants.length} configurations`}
                  </td>
                ) : null;
              })()}
              {visibleLocFields.map(f => {
                const r = priceRange(f.key);
                return (
                  <td key={f.key} style={{ ...tdBase, whiteSpace: 'nowrap', textAlign: 'right', fontSize: 12 }}>
                    {r ? <span style={{ color: '#701a75', fontWeight: 600 }}>{r}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                );
              })}
            </>
          );
        })()}

        <td style={{ ...tdBase, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
          <div>📄 {fmtFileName(first.file_name)}</div>
          <div>{fmtDate(first.upload_date)}</div>
        </td>
      </tr>

      {multi && open && variants.map((v, i) => (
        <LocationVariantRow key={v.id} p={v} isLast={i === variants.length - 1} onSelect={onSelect}
          favIds={favIds} toggleFav={toggleFav} compareList={compareList} toggleCompare={toggleCompare} showToast={showToast} activeLoc={activeLoc} />
      ))}
    </>
  );
}

function LocationTable({ groups, onSelect, favIds, toggleFav, compareList, toggleCompare, showToast, activeLoc, onMention }) {
  const showConfig = activeLoc.configuration !== false;
  const showUnit   = activeLoc.unit !== false;
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e879f9', boxShadow: '0 1px 3px rgba(112,26,117,0.1)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: 'white' }}>
        <thead>
          <tr>
            <th style={{ ...thLoc, background: '#1a3a5c', width: 50 }} rowSpan={2}></th>
            <th style={{ ...thLoc, background: '#1a3a5c' }} rowSpan={2}>Code</th>
            <th style={{ ...thLoc, background: '#1a3a5c', textAlign: 'left' }} rowSpan={2}>Produits</th>
            {showConfig && <th style={{ ...thLoc, background: '#1a3a5c' }} rowSpan={2}>Gamme / Produit</th>}
            {showUnit   && <th style={{ ...thLoc, background: '#1a3a5c' }} rowSpan={2}>Unité</th>}
            {activeLoc.loc_base && <th style={{ ...thLoc, background: '#4a0150' }} colSpan={2}>Base</th>}
            {activeLoc.loc_part && <th style={{ ...thLoc, background: '#701a75' }} colSpan={2}>Partenaires</th>}
            {activeLoc.loc_gc   && <th style={{ ...thLoc, background: '#9d4ea0' }} colSpan={2}>Grands Comptes</th>}
            <th style={{ ...thLoc, background: '#1a3a5c' }} rowSpan={2}>Source</th>
          </tr>
          <tr>
            {activeLoc.loc_base && <><th style={{ ...thLoc, background: '#4a0150', fontSize: 11 }}>Sem.</th><th style={{ ...thLoc, background: '#4a0150', fontSize: 11 }}>Mois</th></>}
            {activeLoc.loc_part && <><th style={{ ...thLoc, background: '#701a75', fontSize: 11 }}>Sem.</th><th style={{ ...thLoc, background: '#701a75', fontSize: 11 }}>Mois</th></>}
            {activeLoc.loc_gc   && <><th style={{ ...thLoc, background: '#9d4ea0', fontSize: 11 }}>Sem.</th><th style={{ ...thLoc, background: '#9d4ea0', fontSize: 11 }}>Mois</th></>}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, idx) => (
            <LocationGroup key={group.key} group={group} idx={idx} onSelect={onSelect}
              favIds={favIds} toggleFav={toggleFav} compareList={compareList} toggleCompare={toggleCompare} showToast={showToast} activeLoc={activeLoc} onMention={onMention} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StandardTable({ groups, onSelect, favIds, toggleFav, compareList, toggleCompare, showToast, activeCols, onMention }) {
  const marginLabel = { margin_1_3: '1 à 3', margin_4_9: '4 à 9', margin_10: '10 et plus' };
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #dde3ec', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, background: 'white' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 50, textAlign: 'center' }}></th>
            <th style={{ ...th, verticalAlign: 'middle' }}>Code</th>
            <th style={{ ...th, verticalAlign: 'middle' }}>Désignation</th>
            {activeCols.configuration && <th style={{ ...th, verticalAlign: 'middle' }}>Gamme / Produit</th>}
            {activeCols.unit          && <th style={{ ...th, verticalAlign: 'middle' }}>Unité</th>}
            {(activeCols.price_ht || activeCols.pa) && (
              <th style={{ ...th, verticalAlign: 'middle', textAlign: 'right' }}
                  colSpan={[activeCols.price_ht, activeCols.pa].filter(Boolean).length}>
                Tarifs
              </th>
            )}
            {(['margin_1_3', 'margin_4_9', 'margin_10']).filter(f => activeCols[f]).map(f => (
              <th key={f} style={{ ...th, background: '#7f1d1d', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ fontSize: 9, opacity: 0.75, marginBottom: 2, letterSpacing: '0.08em' }}>MARGES</div>
                <div>{marginLabel[f]}</div>
              </th>
            ))}
            {activeCols.supplier && <th style={{ ...th, verticalAlign: 'middle' }}>Fournisseur</th>}
            <th style={{ ...th, verticalAlign: 'middle' }}>Source</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, idx) => (
            <ProductGroup key={group.key} group={group} idx={idx} onSelect={onSelect}
              favIds={favIds} toggleFav={toggleFav} compareList={compareList} toggleCompare={toggleCompare} showToast={showToast} activeCols={activeCols} onMention={onMention} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tableau Gaz Étalon ───────────────────────────────────────────────────────

const thEtalon = {
  padding: '10px 12px', background: '#0f4c75',
  color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  textAlign: 'center', whiteSpace: 'nowrap', border: '1px solid #1a6496',
};
const thEtalonRef  = { ...thEtalon, background: '#1a5276' };
const thEtalonPrix = { ...thEtalon, background: '#1e8449' };

function GazEtalonRow({ product, idx, onSelect, favIds, toggleFav, showToast }) {
  const rowBg    = idx % 2 === 0 ? 'white' : '#f0f7ff';
  const hoverBg  = '#dbeafe';
  const tdBase   = {
    padding: '9px 11px', borderBottom: '1px solid #dde3ec',
    fontSize: 12.5, verticalAlign: 'middle', background: rowBg,
    textAlign: 'center',
  };

  let ef = {};
  try { ef = product.extra_fields ? JSON.parse(product.extra_fields) : {}; } catch {}

  const ref58   = ef['Réf. 58 L']  || ef['RÉF. 58L']  || ef['REF. 58L']  || '—';
  const ref110  = ef['Réf. 110 L'] || ef['RÉF. 110L'] || ef['REF. 110L'] || '—';
  // Prix stockés dans les champs DB depuis la migration
  const prix58  = product.margin_1_3 != null ? product.margin_1_3 : (ef['Prix 58 L'] ? parseFloat(String(ef['Prix 58 L']).replace(/[€\s]/g, '').replace(',', '.')) : null);
  const prix110 = product.margin_4_9 != null ? product.margin_4_9 : (ef['Prix 110 L'] ? parseFloat(String(ef['Prix 110 L']).replace(/[€\s]/g, '').replace(',', '.')) : null);
  const cat     = ef['CAT.']  || '—';
  const tol     = ef['Tol.']  || ef['TOLÉRANCE'] || ef['TOLERANCE'] || '—';
  const valid   = ef['Valid. (mois)'] || ef['VALIDITÉ (mois)'] || ef['VALIDITE (mois)'] || '—';
  // Si configuration existe → c'est le nom du gaz (GAMME/PRODUIT), designation = mélange gazeux
  // Sinon → designation est le nom du gaz, mélange gazeux dans extra_fields
  const hasConfig = !!product.configuration;
  const gazName = hasConfig ? getGazName(product.configuration) : (product.designation || '—');
  const melange = ef['Mélange gazeux'] || ef['MÉLANGE GAZEUX']
               || (hasConfig ? product.designation : null)
               || product.description || '—';

  const ref34   = product.reference || 'W';
  const prix34  = product.price_ht;

  const copyRef = (ref, e) => {
    e.stopPropagation();
    if (ref && ref !== 'W' && ref !== '—') {
      navigator.clipboard?.writeText(String(ref)).then(() => showToast?.(`📋 ${ref} copié`, 'success', 1800));
    }
  };

  const RefCell = ({ val }) => (
    <td style={{ ...tdBase, fontFamily: 'monospace', fontWeight: 600, color: val === 'W' || val === '—' ? '#94a3b8' : '#1a5276', cursor: val !== 'W' && val !== '—' ? 'copy' : 'default' }}
      onClick={e => copyRef(val, e)} title={val !== 'W' && val !== '—' ? 'Cliquer pour copier' : ''}>
      {val}
    </td>
  );

  const PriceCell = ({ val }) => (
    <td style={{ ...tdBase, fontWeight: 700, color: val != null ? '#1a5c2a' : '#94a3b8', background: rowBg }}>
      {val != null ? fmt(val) : <span style={{ color: '#94a3b8' }}>—</span>}
    </td>
  );

  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(product)}
      onMouseEnter={e => [...e.currentTarget.cells].forEach(c => c.style.background = hoverBg)}
      onMouseLeave={e => [...e.currentTarget.cells].forEach(c => c.style.background = rowBg)}
    >
      {/* Actions */}
      <td style={{ ...tdBase, padding: '6px 8px', width: 40 }} onClick={e => e.stopPropagation()}>
        <FavStar productId={product.id} isFav={favIds.has(product.id)} onToggle={toggleFav} />
      </td>
      {/* Gaz */}
      <td style={{ ...tdBase, textAlign: 'left', fontWeight: 600, color: '#1a3a5c', whiteSpace: 'nowrap' }}>{gazName}</td>
      {/* Mélange gazeux */}
      <td style={{ ...tdBase, textAlign: 'left', color: '#334155', maxWidth: 220 }}>{melange}</td>
      {/* CAT. */}
      <td style={{ ...tdBase, fontSize: 11 }}>
        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{cat}</span>
      </td>
      {/* Réf. 34L */}
      <RefCell val={ref34} />
      {/* Réf. 58L */}
      <RefCell val={ref58} />
      {/* Réf. 110L */}
      <RefCell val={ref110} />
      {/* Tol. */}
      <td style={{ ...tdBase, fontSize: 11, color: '#64748b' }}>{tol}</td>
      {/* Validité */}
      <td style={{ ...tdBase, fontSize: 11, color: '#64748b' }}>{valid}</td>
      {/* Prix 34L */}
      <PriceCell val={prix34} />
      {/* Prix 58L */}
      <PriceCell val={prix58} />
      {/* Prix 110L */}
      <PriceCell val={prix110} />
    </tr>
  );
}

function GazEtalonTable({ products, onSelect, favIds, toggleFav, showToast }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #1a6496', boxShadow: '0 1px 4px rgba(15,76,117,0.15)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
        <thead>
          <tr>
            <th style={{ ...thEtalon, width: 40 }}></th>
            <th style={{ ...thEtalon, textAlign: 'left' }}>Gaz</th>
            <th style={{ ...thEtalon, textAlign: 'left' }}>Mélange gazeux</th>
            <th style={thEtalon}>CAT.</th>
            <th style={thEtalonRef}>Réf. 34 L</th>
            <th style={thEtalonRef}>Réf. 58 L</th>
            <th style={thEtalonRef}>Réf. 110 L</th>
            <th style={thEtalon}>Tol.</th>
            <th style={thEtalon}>Valid. (mois)</th>
            <th style={thEtalonPrix}>Prix 34 L</th>
            <th style={thEtalonPrix}>Prix 58 L</th>
            <th style={thEtalonPrix}>Prix 110 L</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, idx) => (
            <GazEtalonRow key={p.id} product={p} idx={idx} onSelect={onSelect}
              favIds={favIds} toggleFav={toggleFav} showToast={showToast} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function Search() {
  const showToast = useToast();

  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [searched, setSearched]   = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg]   = useState(false);
  const [suppliers, setSuppliers]     = useState([]);
  const [allFiles, setAllFiles]       = useState([]);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterFile, setFilterFile]   = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSheet, setFilterSheet] = useState('');
  const [availableSheets, setAvailableSheets] = useState([]);
  const [sort, setSort]               = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

  // F3 — Favoris
  const [favIds, setFavIds]         = useState(new Set());
  // F4 — Comparateur
  const [compareList, setCompareList] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  // F5 — Mention (@tag)
  const [mentionProduct, setMentionProduct] = useState(null);

  const timer = useRef(null);
  const suggTimer = useRef(null);

  useEffect(() => {
    api.get('/products/suppliers').then(r => setSuppliers(r.data)).catch(() => {});
    api.get('/favorites/ids').then(r => setFavIds(new Set(r.data))).catch(() => {});
    api.get('/files').then(r => setAllFiles(r.data)).catch(() => {});
  }, []);

  // F3 — Toggle favori
  const toggleFav = useCallback(async (productId) => {
    const wasFav = favIds.has(productId);
    // Optimistic update
    setFavIds(prev => {
      const next = new Set(prev);
      if (wasFav) next.delete(productId); else next.add(productId);
      return next;
    });
    try {
      if (wasFav) {
        await api.delete(`/favorites/${productId}`);
        showToast('Retiré des favoris', 'warning', 2000);
      } else {
        await api.post('/favorites', { product_id: productId });
        showToast('⭐ Ajouté aux favoris', 'success', 2000);
      }
    } catch {
      // Rollback
      setFavIds(prev => {
        const next = new Set(prev);
        if (wasFav) next.add(productId); else next.delete(productId);
        return next;
      });
      showToast('Erreur lors de la mise à jour des favoris', 'error');
    }
  }, [favIds, showToast]);

  // F4 — Toggle comparateur (max 4 produits)
  const toggleCompare = useCallback((product) => {
    setCompareList(prev => {
      const exists = prev.some(p => p.id === product.id);
      if (exists) return prev.filter(p => p.id !== product.id);
      if (prev.length >= 4) {
        showToast('Maximum 4 produits dans le comparateur', 'warning');
        return prev;
      }
      return [...prev, product];
    });
  }, [showToast]);

  const doSearch = useCallback(async (q, sup, srt, log = false, fid = '', cat = '', sht = '') => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true); setSearched(true); setShowSugg(false);
    try {
      const params = { q: q.trim() };
      if (sup) params.supplier   = sup;
      if (srt) params.sort       = srt;
      if (fid) params.file_id    = fid;
      if (cat) params.category   = cat;
      if (sht) params.sheet_name = sht;
      if (log) params.log = 'true';
      const { data } = await api.get('/products/search', { params });
      setResults(data);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const fetchSuggestions = useCallback(async (q) => {
    if (q.trim().length < 2) { setSuggestions([]); setShowSugg(false); return; }
    try {
      const { data } = await api.get('/products/suggest', { params: { q: q.trim() } });
      setSuggestions(data);
      setShowSugg(data.length > 0);
    } catch { setSuggestions([]); }
  }, []);

  const pickSuggestion = (s) => {
    const val = s.designation || s.reference;
    setQuery(val); setShowSugg(false); setSuggestions([]);
    doSearch(val, filterSupplier, sort, true, filterFile, filterCategory, filterSheet);
  };

  const onChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timer.current);
    clearTimeout(suggTimer.current);
    timer.current = setTimeout(() => doSearch(val, filterSupplier, sort, true, filterFile, filterCategory, filterSheet), 400);
    suggTimer.current = setTimeout(() => fetchSuggestions(val), 150);
  };

  const onSupplierChange = (e) => {
    const val = e.target.value;
    setFilterSupplier(val);
    if (query.trim()) doSearch(query, val, sort, false, filterFile, filterCategory, filterSheet);
  };

  const onSortChange = (e) => {
    const val = e.target.value;
    setSort(val);
    if (query.trim()) doSearch(query, filterSupplier, val, false, filterFile, filterCategory, filterSheet);
  };

  const onSheetChange = (e) => {
    const val = e.target.value;
    setFilterSheet(val);
    if (query.trim()) doSearch(query, filterSupplier, sort, false, filterFile, filterCategory, val);
  };

  const onBaseChange = (e) => {
    const val = e.target.value;
    setFilterSupplier('');
    setFilterSheet('');
    setAvailableSheets([]);
    if (val.startsWith('cat:')) {
      const cat = val.slice(4);
      setFilterCategory(cat);
      setFilterFile('');
      if (query.trim()) doSearch(query, '', sort, false, '', cat, '');
    } else {
      setFilterFile(val);
      setFilterCategory('');
      if (val) {
        // Charger les onglets disponibles pour ce fichier
        api.get(`/files/${val}/sheets`).then(r => setAvailableSheets(r.data)).catch(() => setAvailableSheets([]));
      }
      if (query.trim()) doSearch(query, '', sort, false, val, '', '');
    }
  };

  const filteredResults = results.filter(r =>
    (r.reference && r.reference.trim()) ||
    (r.price_ht != null && r.price_ht !== 0)
  );
  const groups = groupByReference(filteredResults);
  const locGroups    = groups.filter(g => isLocationSupplier(g.variants[0]?.supplier));
  const etalonProds  = filteredResults.filter(r => isGazEtalon(r));
  const etalonIds    = new Set(etalonProds.map(r => r.id));
  const stdGroups    = groups.filter(g => !isLocationSupplier(g.variants[0]?.supplier) && !isGazEtalon(g.variants[0]));
  const multiCount   = groups.filter(g => g.variants.length > 1).length;

  // Colonnes actives calculées à partir des données réelles (dynamique par fournisseur/fichier)
  const activeCols = computeActiveColumns(stdGroups.flatMap(g => g.variants));
  const activeLoc  = computeActiveColumns(locGroups.flatMap(g => g.variants));

  const selectStyle = {
    padding: '8px 12px', border: '1px solid #dde3ec', borderRadius: 8,
    fontSize: 13, background: 'white', cursor: 'pointer', outline: 'none', color: '#1e293b',
  };

  const tableProps = { favIds, toggleFav, compareList, toggleCompare, showToast, onMention: setMentionProduct };

  return (
    <div>
      {/* Panneau détail */}
      {selectedProduct && <ProductDetailPanel product={selectedProduct} onClose={() => setSelectedProduct(null)} onMention={setMentionProduct} />}

      {/* Comparateur modal */}
      {showCompare && compareList.length >= 2 && (
        <CompareModal products={compareList} onClose={() => setShowCompare(false)} />
      )}

      {/* Mention modal (@tag) */}
      {mentionProduct && (
        <MentionModal
          product={mentionProduct}
          onClose={() => setMentionProduct(null)}
          onSent={() => showToast('@ Mention envoyée !', 'success', 3000)}
        />
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a3a5c', marginBottom: 4 }}>🔍 Recherche produits</h1>
        <p style={{ color: '#64748b', fontSize: 13.5 }}>Référence, désignation, gamme, fournisseur, prix…</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); clearTimeout(timer.current); clearTimeout(suggTimer.current); setShowSugg(false); doSearch(query, filterSupplier, sort, true, filterFile, filterCategory, filterSheet); }}>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 16, pointerEvents: 'none', zIndex: 1 }}>🔍</span>
          <input
            type="text" value={query} onChange={onChange} autoFocus
            placeholder="Ex : DG-CO-100, détecteur H2S, ATEX portable…"
            style={{ width: '100%', padding: '12px 16px 12px 42px', border: '2px solid #dde3ec', borderRadius: showSugg ? '10px 10px 0 0' : 10, fontSize: 15, outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = '#1d9e75'; if (suggestions.length) setShowSugg(true); }}
            onBlur={e => { e.target.style.borderColor = '#dde3ec'; setTimeout(() => setShowSugg(false), 150); }}
          />
          {showSugg && suggestions.length > 0 && (
            <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '2px solid #1d9e75', borderTop: 'none', borderRadius: '0 0 10px 10px', margin: 0, padding: 0, listStyle: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 280, overflowY: 'auto' }}>
              {suggestions.map((s, i) => (
                <li key={i} onMouseDown={() => pickSuggestion(s)}
                  style={{ padding: '9px 16px', cursor: 'pointer', fontSize: 13.5, borderBottom: i < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafd'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>🔍</span>
                  <span style={{ flex: 1, fontWeight: 500, color: '#1e293b' }}>{s.designation || s.reference}</span>
                  {s.reference && s.designation && (
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{s.reference}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          {/* Filtre BASE DE DONNÉES : catégorie entière ou fichier précis */}
          <select
            value={filterCategory ? `cat:${filterCategory}` : filterFile}
            onChange={onBaseChange}
            style={{ ...selectStyle, maxWidth: 300 }}
          >
            <option value="">📂 Toutes les bases</option>
            {CATEGORIES.map(cat => {
              const filesInCat = allFiles.filter(f => (f.category || 'Général') === cat.id);
              if (!filesInCat.length) return null;
              const totalProds = filesInCat.reduce((s, f) => s + (f.product_count || 0), 0);
              return (
                <optgroup key={cat.id} label={`${cat.emoji} ${cat.id}`}>
                  {/* Option catégorie entière */}
                  <option value={`cat:${cat.id}`}>
                    {cat.emoji} Toute la catégorie ({filesInCat.length} fichier{filesInCat.length > 1 ? 's' : ''} · {totalProds.toLocaleString('fr-FR')} produits)
                  </option>
                  {/* Options fichiers individuels */}
                  {filesInCat.map(f => (
                    <option key={f.id} value={f.id}>
                      📄 {f.original_name} ({f.product_count?.toLocaleString('fr-FR')} produits)
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {/* Filtre fournisseur (masqué si filtre fichier ou catégorie actif) */}
          {!filterFile && !filterCategory && (
            <select value={filterSupplier} onChange={onSupplierChange} style={selectStyle}>
              <option value="">🏭 Tous les fournisseurs</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {/* Filtre onglet — visible seulement si un fichier précis est sélectionné et a plusieurs onglets */}
          {filterFile && availableSheets.length > 1 && (
            <select value={filterSheet} onChange={onSheetChange} style={{ ...selectStyle, borderColor: '#a855f7', color: '#701a75' }}>
              <option value="">📑 Tous les onglets ({availableSheets.length})</option>
              {availableSheets.map(s => (
                <option key={s} value={s}>📋 {s}</option>
              ))}
            </select>
          )}
          <select value={sort} onChange={onSortChange} style={selectStyle}>
            <option value="">↕ Tri par défaut</option>
            <option value="designation">A → Z (désignation)</option>
            <option value="price_asc">Prix croissant</option>
            <option value="price_desc">Prix décroissant</option>
            <option value="supplier">Par fournisseur</option>
            <option value="file">Par fichier source</option>
          </select>
          {(filterSupplier || filterFile || filterCategory || filterSheet || sort) && (
            <button type="button"
              onClick={() => { setFilterSupplier(''); setFilterFile(''); setFilterCategory(''); setFilterSheet(''); setAvailableSheets([]); setSort(''); if (query.trim()) doSearch(query, '', '', false, '', '', ''); }}
              style={{ padding: '8px 12px', border: '1px solid #fca5a5', borderRadius: 8, background: '#fff1f2', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}
            >
              ✕ Réinitialiser
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Résultats limités à 200 — produits à plusieurs modèles regroupés automatiquement</p>
      </form>

      {/* ── Barre comparateur ── */}
      {compareList.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 500, background: '#1a3a5c', color: 'white', borderRadius: 40, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', fontSize: 13.5, fontWeight: 500, animation: 'slideInRight 0.2s ease' }}>
          <span>⊞ {compareList.length} produit{compareList.length > 1 ? 's' : ''} sélectionné{compareList.length > 1 ? 's' : ''}</span>
          {compareList.length >= 2 && (
            <button onClick={() => setShowCompare(true)} style={{ background: '#1d9e75', border: 'none', color: 'white', borderRadius: 20, padding: '5px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Comparer →
            </button>
          )}
          <button onClick={() => setCompareList([])} title="Vider la sélection" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 20, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
            ✕ Vider
          </button>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        {loading && <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>Recherche en cours…</div>}

        {!loading && searched && !results.length && (
          <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔎</div>
            <strong>Aucun résultat pour « {query} »</strong>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                <strong style={{ color: '#1e293b' }}>{results.length}</strong> ligne(s) ·{' '}
                <strong style={{ color: '#1e293b' }}>{groups.length}</strong> produit(s)
              </p>
              {multiCount > 0 && (
                <span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>
                  {multiCount} produit{multiCount > 1 ? 's' : ''} multi-modèle
                </span>
              )}
              {filterSupplier && (
                <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '2px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>
                  🏭 {filterSupplier}
                </span>
              )}
              {filterCategory && (() => {
                const cat = CATEGORIES.find(c => c.id === filterCategory);
                return (
                  <span style={{ background: cat?.bg || '#f1f5f9', color: cat?.color || '#475569', border: `1px solid ${cat?.border || '#cbd5e1'}`, padding: '2px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>
                    {cat?.emoji} {filterCategory}
                  </span>
                );
              })()}
              {filterFile && (() => {
                const f = allFiles.find(f => String(f.id) === String(filterFile));
                return f ? (
                  <span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>
                    📄 {f.original_name}
                  </span>
                ) : null;
              })()}
              {filterSheet && (
                <span style={{ background: '#fdf4ff', color: '#701a75', border: '1px solid #e879f9', padding: '2px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>
                  📋 Onglet : {filterSheet}
                </span>
              )}
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>💡 Cliquez sur un produit pour ouvrir sa fiche et copier les valeurs · ⭐ favoriser · ☐ comparer · @ taguer</span>
            </div>

            {etalonProds.length > 0 && (
              <div style={{ marginBottom: (locGroups.length > 0 || stdGroups.length > 0) ? 28 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>🧪</span>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f4c75' }}>
                    Gaz Étalon — {etalonProds.length} mélange{etalonProds.length > 1 ? 's' : ''}
                  </h2>
                  <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', padding: '2px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>
                    Tarifs 34L / 58L / 110L
                  </span>
                </div>
                <GazEtalonTable
                  products={etalonProds}
                  onSelect={setSelectedProduct}
                  favIds={favIds}
                  toggleFav={toggleFav}
                  showToast={showToast}
                />
              </div>
            )}

            {locGroups.length > 0 && (
              <div style={{ marginBottom: stdGroups.length > 0 ? 28 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>📦</span>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#701a75' }}>
                    Location — {locGroups.length} produit{locGroups.length > 1 ? 's' : ''}
                  </h2>
                  <span style={{ background: '#fdf4ff', color: '#701a75', border: '1px solid #e879f9', padding: '2px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>Tarifs Sem. / Mois</span>
                </div>
                <LocationTable groups={locGroups} onSelect={setSelectedProduct} {...tableProps} activeLoc={activeLoc} />
              </div>
            )}

            {stdGroups.length > 0 && (
              <div>
                {locGroups.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>🏭</span>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a3a5c' }}>
                      Produits — {stdGroups.length} produit{stdGroups.length > 1 ? 's' : ''}
                    </h2>
                  </div>
                )}
                <StandardTable groups={stdGroups} onSelect={setSelectedProduct} {...tableProps} activeCols={activeCols} />
              </div>
            )}
          </>
        )}

        {!loading && !searched && (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <strong style={{ color: '#1e293b' }}>Commencez votre recherche</strong>
            <p style={{ marginTop: 6, fontSize: 13.5 }}>Référence, désignation, gamme, fournisseur, prix…</p>
          </div>
        )}
      </div>
    </div>
  );
}
