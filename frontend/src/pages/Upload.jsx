import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import FieldMapper from '../components/FieldMapper';

const ACCEPTED = ['.xlsx', '.xls', '.pdf', '.docx', '.doc'];

export const CATEGORIES = [
  { id: 'Détecteurs portables',    emoji: '📱', color: '#1e40af', bg: '#eff6ff',  border: '#bfdbfe' },
  { id: 'Détecteurs fixes',        emoji: '🏭', color: '#15803d', bg: '#f0fdf4',  border: '#86efac' },
  { id: 'Location',                emoji: '📦', color: '#701a75', bg: '#fdf4ff',  border: '#e879f9' },
  { id: 'Accessoires',             emoji: '🔧', color: '#9a3412', bg: '#fff7ed',  border: '#fed7aa' },
  { id: 'EPI / Protection',        emoji: '🦺', color: '#854d0e', bg: '#fef9c3',  border: '#fde047' },
  { id: 'Antichute',               emoji: '🪝', color: '#0369a1', bg: '#e0f2fe',  border: '#7dd3fc' },
  { id: 'Appareil respiratoire',   emoji: '😷', color: '#065f46', bg: '#d1fae5',  border: '#6ee7b7' },
  { id: 'Bouteille Gaz Etalon',    emoji: '🧴', color: '#b45309', bg: '#fef3c7',  border: '#fcd34d' },
  { id: 'Tubes réactifs',          emoji: '🧪', color: '#475569', bg: '#f1f5f9',  border: '#cbd5e1' },
  { id: 'Masques respiratoires',   emoji: '🫁', color: '#0f766e', bg: '#f0fdfa',  border: '#99f6e4' },
  { id: 'Filtres respiratoires',   emoji: '🔩', color: '#7c3aed', bg: '#f5f3ff',  border: '#c4b5fd' },
  { id: 'Gants',                   emoji: '🧤', color: '#b91c1c', bg: '#fff1f2',  border: '#fda4af' },
  { id: 'Général',                 emoji: '📁', color: '#64748b', bg: '#f8fafc',  border: '#e2e8f0' },
];

function FileIcon({ name }) {
  if (!name) return '📂';
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📕';
  if (ext === 'docx' || ext === 'doc') return '📘';
  return '📗';
}

// Indicateur d'étape
function StepBar({ step }) {
  const steps = ['Paramètres', 'Import automatique', 'Résultat'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24 }}>
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = idx < step;
        const active = idx === step;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13,
                background: done ? '#1d9e75' : active ? '#1a3a5c' : '#e2e8f0',
                color: done || active ? 'white' : '#94a3b8',
                border: active ? '2px solid #1a3a5c' : 'none',
              }}>
                {done ? '✓' : idx}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 500, color: active ? '#1a3a5c' : done ? '#1d9e75' : '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#1d9e75' : '#e2e8f0', margin: '0 8px', marginBottom: 20 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Upload() {
  const [step, setStep]                   = useState(1);
  const [file, setFile]                   = useState(null);
  const [dragOver, setDragOver]           = useState(false);
  const [analyzing, setAnalyzing]         = useState(false);
  const [importing, setImporting]         = useState(false);
  const [progress, setProgress]           = useState(0);
  const [result, setResult]               = useState(null);
  const [supplierOverride, setSupplierOverride] = useState('');
  const [category, setCategory]           = useState([]); // multi-sélection
  const [previewData, setPreviewData]     = useState(null);
  const [showMapper, setShowMapper]       = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null); // { id, original_name, upload_date, product_count }
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const selectFile = (f) => {
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setResult({ type: 'error', text: `Format non supporté. Formats acceptés : ${ACCEPTED.join(', ')}` });
      return;
    }
    setFile(f);
    setResult(null);
    setSupplierOverride('');
    setCategory([]);
    setPreviewData(null);
    setStep(1);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) selectFile(f);
  };

  // Analyse + import automatique (avec fallback mapper si détection insuffisante)
  const handleAnalyze = async () => {
    if (!file || !category.length) return;
    setAnalyzing(true);
    setResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      // 1. Analyse et détection automatique des colonnes
      const { data: preview } = await api.post('/files/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreviewData(preview);
      setAnalyzing(false);

      // Avertissement doublon — bloquer et demander confirmation
      if (preview.duplicate) {
        setDuplicateWarning(preview.duplicate);
        return;
      }

      const detectedCount = Object.values(preview.suggestedMapping || {}).filter(Boolean).length;

      // Si aucun champ détecté → fallback vers le mapper manuel
      if (detectedCount === 0) {
        setShowMapper(true);
        setStep(2);
        return;
      }

      // 2. Import immédiat avec le mapping auto-détecté
      setStep(2);
      setImporting(true);
      const { data } = await api.post('/files/confirm', {
        tempFile: preview.tempFile,
        originalName: preview.originalName,
        fieldMapping: JSON.stringify(preview.suggestedMapping),
        category: category.join(','),
        supplier: supplierOverride.trim() || undefined,
      });
      setResult({ type: 'success', data });
      setStep(3);
      setFile(null);
      setPreviewData(null);
    } catch (err) {
      setResult({ type: 'error', text: err.response?.data?.error || "Erreur lors de l'import" });
      setStep(1);
    } finally {
      setAnalyzing(false);
      setImporting(false);
      setProgress(0);
    }
  };

  // Utilisé par le FieldMapper en fallback
  const handleConfirmImport = async (fieldMapping) => {
    if (!previewData) return;
    setImporting(true);
    setResult(null);
    try {
      const { data } = await api.post('/files/confirm', {
        tempFile: previewData.tempFile,
        originalName: previewData.originalName,
        fieldMapping: JSON.stringify(fieldMapping),
        category: category.join(','),
        supplier: supplierOverride.trim() || undefined,
      });
      setResult({ type: 'success', data });
      setStep(3);
      setFile(null);
      setPreviewData(null);
      setShowMapper(false);
    } catch (err) {
      setResult({ type: 'error', text: err.response?.data?.error || "Erreur lors de l'import" });
    } finally {
      setImporting(false);
    }
  };

  // Continuer l'import malgré le doublon détecté
  const handleIgnoreDuplicate = async () => {
    setDuplicateWarning(null);
    if (!previewData) return;
    const detectedCount = Object.values(previewData.suggestedMapping || {}).filter(Boolean).length;
    if (detectedCount === 0) {
      setShowMapper(true);
      setStep(2);
      return;
    }
    setStep(2);
    setImporting(true);
    try {
      const { data } = await api.post('/files/confirm', {
        tempFile: previewData.tempFile,
        originalName: previewData.originalName,
        fieldMapping: JSON.stringify(previewData.suggestedMapping),
        category: category.join(','),
        supplier: supplierOverride.trim() || undefined,
      });
      setResult({ type: 'success', data });
      setStep(3);
      setFile(null);
      setPreviewData(null);
    } catch (err) {
      setResult({ type: 'error', text: err.response?.data?.error || "Erreur lors de l'import" });
      setStep(1);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setSupplierOverride('');
    setCategory([]);
    setPreviewData(null);
    setShowMapper(false);
    setDuplicateWarning(null);
    setStep(1);
  };

  const isPdf  = file?.name?.toLowerCase().endsWith('.pdf');
  const isDocx = file?.name?.toLowerCase().match(/\.(docx|doc)$/);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a3a5c', marginBottom: 4 }}>📤 Importer un fichier prix</h1>
        <p style={{ color: '#64748b', fontSize: 13.5 }}>Excel, PDF, Word — détection automatique avec validation du mapping</p>
      </div>

      <StepBar step={step} />

      {/* ── Avertissement doublon ── */}
      {duplicateWarning && (
        <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#92400e', marginBottom: 4 }}>
                Ce fichier existe déjà dans le répertoire
              </div>
              <div style={{ fontSize: 13, color: '#78350f', marginBottom: 10, lineHeight: 1.6 }}>
                <strong>{duplicateWarning.original_name}</strong> a déjà été importé le{' '}
                <strong>{new Date(duplicateWarning.upload_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
                {' '}({duplicateWarning.product_count} produit{duplicateWarning.product_count > 1 ? 's' : ''}).
                <br />
                Importer à nouveau créera un <strong>second exemplaire</strong> sans supprimer l'existant.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={handleIgnoreDuplicate}
                  style={{ padding: '8px 16px', background: '#f59e0b', border: 'none', color: 'white', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Importer quand même →
                </button>
                <button
                  onClick={handleReset}
                  style={{ padding: '8px 16px', background: 'white', border: '1.5px solid #d97706', color: '#92400e', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Étape 3 : résultat ── */}
      {step === 3 && result?.type === 'success' && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '20px', marginBottom: 16, fontSize: 13.5, color: '#065f46' }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>✅ {result.data.message}</div>
          {result.data.sheetsSummary?.length > 1 && (
            <div style={{ marginBottom: 10 }}>
              <strong>Onglets importés :</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                {result.data.sheetsSummary.map(s => (
                  <span key={s.name} style={{ background: 'rgba(29,158,117,0.15)', border: '1px solid rgba(29,158,117,0.3)', borderRadius: 12, padding: '2px 10px', fontSize: 12 }}>
                    {s.name} — {s.count} produits
                  </span>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => navigate('/files')} style={{ padding: '8px 14px', background: 'white', border: '1px solid #d1fae5', color: '#065f46', borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Voir le répertoire</button>
            <button onClick={() => navigate('/search')} style={{ padding: '8px 14px', background: '#1d9e75', border: 'none', color: 'white', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Rechercher un produit →</button>
            <button onClick={handleReset} style={{ padding: '8px 14px', background: 'white', border: '1.5px solid #dde3ec', color: '#64748b', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }}>Importer un autre fichier</button>
          </div>
        </div>
      )}

      {/* ── Erreur ── */}
      {result?.type === 'error' && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13.5, color: '#991b1b', fontWeight: 500 }}>
          ❌ {result.text}
        </div>
      )}

      {/* ── Étape 2 : FieldMapper (fallback quand détection insuffisante) ── */}
      {step === 2 && showMapper && previewData && (
        <>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠️</span>
            <span>Colonnes non reconnues automatiquement — indiquez manuellement la correspondance ci-dessous.</span>
          </div>
          <FieldMapper
            rawColumns={previewData.rawColumns}
            suggestedMapping={previewData.suggestedMapping}
            sampleRows={previewData.sampleRows}
            rowCount={previewData.rowCount}
            originalName={previewData.originalName}
            sheetsInfo={previewData.sheetsInfo}
            fileType={previewData.fileType}
            onConfirm={handleConfirmImport}
            onBack={() => { setStep(1); setPreviewData(null); setShowMapper(false); }}
          />
        </>
      )}

      {/* Analyse / import en cours */}
      {(analyzing || importing) && (
        <div style={{ background: 'white', border: '1px solid #dde3ec', borderRadius: 10, padding: 24, textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>{analyzing ? '🔍' : '📥'}</div>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: '#1a3a5c', marginBottom: 4 }}>
            {analyzing ? 'Analyse du fichier en cours…' : 'Import automatique en cours…'}
          </div>
          <div style={{ fontSize: 12.5, marginBottom: 14 }}>
            {analyzing ? 'Détection automatique des colonnes' : 'Enregistrement des produits dans la base'}
          </div>
          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', maxWidth: 300, margin: '0 auto' }}>
            <div style={{ height: '100%', width: importing ? '70%' : '35%', background: 'linear-gradient(90deg, #1d9e75, #19896a)', borderRadius: 4, transition: 'width 0.4s', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      )}

      {/* ── Étape 1 : sélection fichier + paramètres ── */}
      {step === 1 && (
        <>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2.5px dashed ${dragOver ? '#1d9e75' : '#dde3ec'}`,
              borderRadius: 12, padding: '48px 32px', textAlign: 'center',
              background: dragOver ? '#e6f7f2' : '#fafbfe',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {file ? <FileIcon name={file.name} /> : '📂'}
            </div>
            {file ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1d9e75', marginBottom: 4 }}>{file.name}</div>
                <div style={{ fontSize: 12.5, color: '#64748b' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} Mo
                  {isPdf && <span style={{ marginLeft: 8, background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 8, fontSize: 11 }}>PDF — résultats variables selon la mise en page</span>}
                  {isDocx && <span style={{ marginLeft: 8, background: '#eff6ff', color: '#1e40af', padding: '1px 6px', borderRadius: 8, fontSize: 11 }}>Word</span>}
                  {' '}— Cliquez pour changer
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Glissez votre fichier ici</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  ou <strong>cliquez pour sélectionner</strong>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {[['📗 Excel .xlsx/.xls', '#ecfdf5', '#065f46'], ['📕 PDF', '#fff7ed', '#92400e'], ['📘 Word .docx', '#eff6ff', '#1e40af']].map(([label, bg, fg]) => (
                      <span key={label} style={{ background: bg, color: fg, padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{label}</span>
                    ))}
                  </div>
                </div>
              </>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.pdf,.docx,.doc" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files[0]) selectFile(e.target.files[0]); }} />
          </div>

          {/* Catégories (multi-sélection) */}
          {file && !analyzing && (
            <div style={{ marginTop: 16, background: 'white', border: `2px solid ${category.length ? '#1d9e75' : '#ef4444'}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 13, color: '#1a3a5c' }}>
                  📂 Catégories du fichier <span style={{ color: '#ef4444' }}>*</span>
                  <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}> — plusieurs catégories possibles</span>
                </label>
                {category.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 10, padding: '2px 10px' }}>
                    {category.length} sélectionnée{category.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {CATEGORIES.map(cat => {
                  const selected = category.includes(cat.id);
                  const toggle = () => setCategory(prev =>
                    prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id]
                  );
                  return (
                    <button key={cat.id} type="button" onClick={toggle}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                        borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: selected ? 700 : 500,
                        border: selected ? `2px solid ${cat.color}` : '1.5px solid #dde3ec',
                        background: selected ? cat.bg : 'white', color: selected ? cat.color : '#64748b',
                        transition: 'all 0.15s',
                      }}>
                      <span style={{ fontSize: 18 }}>{cat.emoji}</span>
                      <span style={{ lineHeight: 1.3, flex: 1, textAlign: 'left' }}>{cat.id}</span>
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: selected ? `2px solid ${cat.color}` : '1.5px solid #cbd5e1',
                        background: selected ? cat.color : 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: 'white',
                      }}>{selected ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
              {!category.length && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', fontWeight: 500 }}>⚠️ Sélectionnez au moins une catégorie</div>
              )}
            </div>
          )}

          {/* Fournisseur */}
          {file && !analyzing && (
            <div style={{ marginTop: 12, background: 'white', border: '1px solid #dde3ec', borderRadius: 10, padding: '14px 16px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#1a3a5c', marginBottom: 6 }}>
                🏭 Nom du fournisseur <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>(optionnel — laissez vide pour détection automatique)</span>
              </label>
              <input
                type="text" value={supplierOverride}
                onChange={e => setSupplierOverride(e.target.value)}
                placeholder={isPdf ? 'Ex : Senko, Dräger, ISC…' : 'Ex : Dräger — remplace les noms d\'onglets'}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #dde3ec', borderRadius: 8, fontSize: 13.5, outline: 'none', boxSizing: 'border-box', color: '#1e293b' }}
                onFocus={e => e.target.style.borderColor = '#1d9e75'}
                onBlur={e => e.target.style.borderColor = '#dde3ec'}
              />
            </div>
          )}

          {/* Boutons étape 1 */}
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button
              onClick={handleAnalyze}
              disabled={!file || analyzing || !category}
              title={!category ? 'Choisissez une catégorie avant d\'analyser' : ''}
              style={{
                minWidth: 200, padding: '10px 20px',
                background: file && !analyzing && category ? '#1a3a5c' : '#94a3b8',
                color: 'white', border: 'none', borderRadius: 8,
                fontSize: 13.5, fontWeight: 600,
                cursor: file && !analyzing && category ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              {analyzing ? '🔍 Analyse…' : importing ? '📥 Import…' : '📥 Importer le fichier →'}
            </button>
            {file && !analyzing && (
              <button onClick={handleReset}
                style={{ padding: '10px 16px', background: 'white', border: '1.5px solid #dde3ec', color: '#64748b', borderRadius: 8, fontSize: 13.5, cursor: 'pointer' }}>
                Annuler
              </button>
            )}
          </div>

          {/* Info */}
          <div style={{ marginTop: 28, background: 'white', borderRadius: 10, border: '1px solid #dde3ec', padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: 600, color: '#1a3a5c', marginBottom: 8, fontSize: 14 }}>ℹ️ Comment ça fonctionne ?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['1️⃣', 'Déposez votre fichier et choisissez la catégorie'],
                ['2️⃣', 'Le système détecte automatiquement toutes les colonnes'],
                ['3️⃣', 'Les produits sont importés directement — aucune validation requise'],
              ].map(([num, text]) => (
                <div key={num} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#475569' }}>
                  <span style={{ minWidth: 24 }}>{num}</span><span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
