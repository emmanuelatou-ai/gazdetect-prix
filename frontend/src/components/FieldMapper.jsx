import { useState } from 'react';

const ALL_DB_FIELDS = [
  { key: 'reference',     label: 'Référence',             hint: 'Code article, SKU',           group: 'produit' },
  { key: 'designation',   label: 'Désignation',           hint: 'Nom du produit',              group: 'produit', required: true },
  { key: 'description',   label: 'Description',           hint: 'Détail, commentaire',         group: 'produit' },
  { key: 'configuration', label: 'Gamme / Produit',        hint: 'Gamme, famille, série, config', group: 'produit' },
  { key: 'unit',          label: 'Unité / Lot',           hint: 'Conditionnement, UOM',        group: 'produit' },
  { key: 'price_ht',      label: 'Prix HT',               hint: 'Tarif hors taxes',            group: 'prix' },
  { key: 'price_ttc',     label: 'Prix TTC',              hint: 'Tarif toutes taxes',          group: 'prix' },
  { key: 'pa',            label: 'Prix Achat (PA)',        hint: 'Coût achat fournisseur',      group: 'prix' },
  { key: 'margin_1_3',    label: 'Marge 1–3 unités',      hint: 'Palier 1-3 unités',           group: 'marges' },
  { key: 'margin_4_9',    label: 'Marge 4–9 unités',      hint: 'Palier 4-9 unités',           group: 'marges' },
  { key: 'margin_10',     label: 'Marge 10+ unités',      hint: 'Palier 10 et plus',           group: 'marges' },
  { key: 'loc_base_sem',  label: 'Location Base — Sem.',  hint: 'Tarif location hebdo',        group: 'location' },
  { key: 'loc_base_mois', label: 'Location Base — Mois',  hint: 'Tarif location mensuel',      group: 'location' },
  { key: 'loc_part_sem',  label: 'Location Part. — Sem.', hint: 'Partenaires hebdo',           group: 'location' },
  { key: 'loc_part_mois', label: 'Location Part. — Mois', hint: 'Partenaires mensuel',         group: 'location' },
  { key: 'loc_gc_sem',    label: 'Location GC — Sem.',    hint: 'Grands comptes hebdo',        group: 'location' },
  { key: 'loc_gc_mois',   label: 'Location GC — Mois',    hint: 'Grands comptes mensuel',      group: 'location' },
];

const GROUPS = [
  { key: 'produit',  label: 'Informations produit', icon: '📝', accent: '#1a3a5c', light: '#eef3f9' },
  { key: 'prix',     label: 'Prix',                  icon: '💶', accent: '#065f46', light: '#ecfdf5' },
  { key: 'marges',   label: 'Marges commerciales',   icon: '📊', accent: '#4c1d95', light: '#f5f3ff' },
  { key: 'location', label: 'Location',              icon: '🔄', accent: '#7c2d12', light: '#fff7ed' },
];

export default function FieldMapper({
  rawColumns, suggestedMapping, sampleRows, rowCount,
  originalName, sheetsInfo, fileType, onConfirm, onBack,
}) {
  // État : { db_key → col_excel | null }
  const [dbToCol, setDbToCol] = useState(() => {
    const init = {};
    ALL_DB_FIELDS.forEach(f => { init[f.key] = null; });
    Object.entries(suggestedMapping || {}).forEach(([dbKey, col]) => {
      if (col && rawColumns.includes(col)) init[dbKey] = col;
    });
    return init;
  });

  // Groupes ouverts par défaut si au moins un champ est mappé dedans
  const [openGroups, setOpenGroups] = useState(() => {
    const open = {};
    GROUPS.forEach(g => {
      const hasMapped = ALL_DB_FIELDS.filter(f => f.group === g.key).some(
        f => suggestedMapping && Object.keys(suggestedMapping).includes(f.key) && rawColumns.includes(suggestedMapping[f.key])
      );
      // produit et prix toujours ouverts, les autres seulement si mappés
      open[g.key] = g.key === 'produit' || g.key === 'prix' || hasMapped;
    });
    return open;
  });

  const mappedCount = Object.values(dbToCol).filter(Boolean).length;
  const usedCols = new Set(Object.values(dbToCol).filter(Boolean));
  const unusedCols = rawColumns.filter(c => !usedCols.has(c));

  const getSample = (col) => {
    if (!col) return null;
    for (const row of sampleRows) {
      const val = row[col];
      if (val != null && String(val).trim()) return String(val).trim().slice(0, 60);
    }
    return null;
  };

  const setField = (dbKey, col) => {
    setDbToCol(prev => {
      const next = { ...prev };
      // Libérer l'ancienne colonne si elle était déjà prise par une autre DB key
      if (col) {
        Object.keys(next).forEach(k => {
          if (next[k] === col && k !== dbKey) next[k] = null;
        });
      }
      next[dbKey] = col || null;
      return next;
    });
  };

  const handleConfirm = () => {
    const mapping = {};
    Object.entries(dbToCol).forEach(([dbKey, col]) => {
      if (col) mapping[dbKey] = col;
    });
    onConfirm(mapping);
  };

  const missingRequired = ALL_DB_FIELDS.filter(f => f.required && !dbToCol[f.key]);
  const isAutoDetected = (dbKey) => {
    const col = dbToCol[dbKey];
    return col && suggestedMapping?.[dbKey] === col;
  };

  const toggleGroup = (gKey) =>
    setOpenGroups(prev => ({ ...prev, [gKey]: !prev[gKey] }));

  return (
    <div>
      {/* En-tête fichier */}
      <div style={{ background: 'white', border: '1px solid #dde3ec', borderRadius: 10, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 28 }}>{fileType === 'pdf' ? '📕' : '📗'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: '#1a3a5c' }}>{originalName}</div>
          <div style={{ fontSize: 12.5, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 3 }}>
            <span>🔢 <strong>{rowCount.toLocaleString('fr')}</strong> lignes</span>
            <span>📋 <strong>{rawColumns.length}</strong> colonnes</span>
            {sheetsInfo?.length > 1 && (
              <span>📑 <strong>{sheetsInfo.length}</strong> onglets</span>
            )}
            <span style={{ color: mappedCount > 0 ? '#1d9e75' : '#94a3b8', fontWeight: 600 }}>
              ✓ {mappedCount} champ{mappedCount > 1 ? 's' : ''} mappé{mappedCount > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {sheetsInfo?.length > 1 && (
          <div style={{ fontSize: 11.5, color: '#92400e', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '4px 10px' }}>
            ⚠️ Mapping appliqué à tous les onglets
          </div>
        )}
      </div>

      {/* Instruction */}
      <div style={{ marginBottom: 16, fontSize: 13, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15 }}>💡</span>
        <span>Pour chaque champ de la base, indiquez <strong>quelle colonne de votre fichier</strong> contient cette information. Laissez vide pour les champs absents.</span>
      </div>

      {/* Groupes */}
      {GROUPS.map(g => {
        const fields = ALL_DB_FIELDS.filter(f => f.group === g.key);
        const mappedInGroup = fields.filter(f => dbToCol[f.key]).length;
        const isOpen = openGroups[g.key];

        return (
          <div key={g.key} style={{ marginBottom: 10, border: `1px solid #dde3ec`, borderRadius: 10, overflow: 'hidden', background: 'white' }}>
            {/* Header groupe */}
            <button
              onClick={() => toggleGroup(g.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 16px', background: isOpen ? g.light : 'white',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                borderBottom: isOpen ? `1px solid #dde3ec` : 'none',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{g.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: g.accent, flex: 1 }}>{g.label}</span>
              <span style={{
                fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                background: mappedInGroup > 0 ? g.accent : '#f1f5f9',
                color: mappedInGroup > 0 ? 'white' : '#94a3b8',
              }}>
                {mappedInGroup}/{fields.length}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Champs du groupe */}
            {isOpen && (
              <div>
                {fields.map((field, i) => {
                  const col = dbToCol[field.key];
                  const sample = getSample(col);
                  const isMapped = !!col;
                  const auto = isAutoDetected(field.key);
                  const isRequired = field.required;
                  const isMissing = isRequired && !isMapped;

                  return (
                    <div
                      key={field.key}
                      style={{
                        display: 'grid', gridTemplateColumns: '220px 1fr auto',
                        alignItems: 'center', gap: 12,
                        padding: '10px 16px',
                        background: i % 2 === 0 ? 'white' : '#fafbfd',
                        borderBottom: i < fields.length - 1 ? '1px solid #f0f4f8' : 'none',
                      }}
                    >
                      {/* Champ DB */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: isMissing ? '#dc2626' : '#1e293b' }}>
                            {field.label}
                          </span>
                          {isRequired && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'white', background: isMissing ? '#dc2626' : '#1d9e75', borderRadius: 4, padding: '1px 5px' }}>
                              requis
                            </span>
                          )}
                          {auto && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4, padding: '1px 5px' }}>
                              auto ✓
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{field.hint}</div>
                      </div>

                      {/* Sélecteur colonne fichier */}
                      <div>
                        <select
                          value={col || ''}
                          onChange={e => setField(field.key, e.target.value)}
                          style={{
                            width: '100%', padding: '7px 10px',
                            border: `1.5px solid ${isMissing ? '#fca5a5' : isMapped ? '#1d9e75' : '#dde3ec'}`,
                            borderRadius: 7, fontSize: 13,
                            color: isMapped ? '#1e293b' : '#94a3b8',
                            background: isMapped ? '#f0fdf4' : 'white',
                            cursor: 'pointer', outline: 'none',
                          }}
                        >
                          <option value="">— Absent du fichier —</option>
                          {rawColumns.map(rawCol => {
                            const s = getSample(rawCol);
                            const alreadyUsed = usedCols.has(rawCol) && rawCol !== col;
                            return (
                              <option key={rawCol} value={rawCol} style={{ color: alreadyUsed ? '#94a3b8' : 'inherit' }}>
                                {rawCol}{s ? ` — ex : ${s.slice(0, 35)}` : ''}
                                {alreadyUsed ? ' (déjà utilisé)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Aperçu */}
                      <div style={{ minWidth: 150, textAlign: 'right' }}>
                        {isMapped && sample ? (
                          <span style={{
                            fontFamily: 'monospace', fontSize: 12, color: '#1d9e75',
                            background: '#ecfdf5', padding: '3px 8px', borderRadius: 6,
                            display: 'inline-block', maxWidth: 180,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {sample}
                          </span>
                        ) : isMapped ? (
                          <span style={{ fontSize: 11.5, color: '#f59e0b', background: '#fffbeb', padding: '2px 7px', borderRadius: 6, border: '1px solid #fde68a' }}>
                            colonne vide ?
                          </span>
                        ) : (
                          <span style={{ color: '#e2e8f0', fontSize: 13 }}>—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Colonnes non utilisées */}
      {unusedCols.length > 0 && (
        <div style={{ marginBottom: 14, fontSize: 12, color: '#94a3b8', padding: '8px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <span style={{ color: '#64748b', fontWeight: 600, marginRight: 6 }}>Colonnes ignorées :</span>
          {unusedCols.map(c => (
            <span key={c} style={{ display: 'inline-block', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 7px', marginRight: 5, marginBottom: 3, fontFamily: 'monospace', fontSize: 11.5 }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Alerte champ requis manquant */}
      {missingRequired.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>Champ obligatoire non mappé : <strong>{missingRequired.map(f => f.label).join(', ')}</strong> — sélectionnez la colonne correspondante ci-dessus.</span>
        </div>
      )}

      {/* Boutons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 4, alignItems: 'center' }}>
        <button
          onClick={handleConfirm}
          disabled={mappedCount === 0 || missingRequired.length > 0}
          style={{
            minWidth: 200, padding: '10px 20px',
            background: mappedCount > 0 && missingRequired.length === 0 ? '#1d9e75' : '#94a3b8',
            color: 'white', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 700,
            cursor: mappedCount > 0 && missingRequired.length === 0 ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          📥 Confirmer et importer
        </button>
        <button
          onClick={onBack}
          style={{ padding: '10px 16px', background: 'white', border: '1.5px solid #dde3ec', color: '#64748b', borderRadius: 8, fontSize: 13.5, cursor: 'pointer' }}
        >
          ← Modifier les paramètres
        </button>
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
          {missingRequired.length > 0
            ? `⚠️ ${missingRequired.length} champ${missingRequired.length > 1 ? 's' : ''} obligatoire${missingRequired.length > 1 ? 's' : ''} manquant${missingRequired.length > 1 ? 's' : ''}`
            : mappedCount === 0
              ? 'Assignez au moins un champ pour importer'
              : `${mappedCount} champ${mappedCount > 1 ? 's' : ''} sera importé${mappedCount > 1 ? 's' : ''}`
          }
        </span>
      </div>
    </div>
  );
}
