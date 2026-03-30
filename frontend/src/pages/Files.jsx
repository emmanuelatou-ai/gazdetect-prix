import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES } from './Upload';

function CategoryBadge({ category }) {
  const cat = CATEGORIES.find(c => c.id === category) || CATEGORIES[CATEGORIES.length - 1];
  return (
    <span style={{ background: cat.bg, color: cat.color, border: `1px solid ${cat.border}`, padding: '3px 9px', borderRadius: 10, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {cat.emoji} {cat.id}
    </span>
  );
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function ageMonths(d) { return d ? (Date.now() - new Date(d)) / (1000 * 60 * 60 * 24 * 30) : 0; }
function ageDays(d)   { return d ? Math.floor((Date.now() - new Date(d)) / (1000 * 60 * 60 * 24)) : 0; }

function AgeLabel({ date }) {
  const days = ageDays(date);
  if (days === 0) return 'Aujourd\'hui';
  if (days < 30)  return `Il y a ${days} j`;
  const m = Math.floor(days / 30);
  if (m < 12) return `Il y a ${m} mois`;
  return `Il y a ${Math.floor(m / 12)} an${Math.floor(m / 12) > 1 ? 's' : ''}`;
}

function StatusBadge({ date }) {
  const months = ageMonths(date);
  if (months > 6)  return <span style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: '3px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 600 }}>🔴 Obsolète &gt;6 mois</span>;
  if (months > 3)  return <span style={{ background: '#fff7ed', color: '#92400e', border: '1px solid #fed7aa', padding: '3px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 600 }}>🟠 3–6 mois</span>;
  return <span style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', padding: '3px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 600 }}>🟢 À jour</span>;
}

export default function Files() {
  const { user } = useAuth();
  const [files, setFiles]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting]   = useState(null);
  const [msg, setMsg]             = useState(null);
  const [renamingId, setRenamingId]       = useState(null);
  const [renameVal, setRenameVal]         = useState('');
  const [editCatId, setEditCatId]         = useState(null);
  const [sortKey, setSortKey]   = useState('upload_date');
  const [sortDir, setSortDir]   = useState('desc');
  const [filterName, setFilterName]     = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId]     = useState(null);
  const [details, setDetails]           = useState({});
  const [loadingDetails, setLoadingDetails] = useState(null);

  const toggleDetails = async (f) => {
    if (expandedId === f.id) { setExpandedId(null); return; }
    setExpandedId(f.id);
    if (details[f.id]) return;
    setLoadingDetails(f.id);
    try {
      const r = await api.get(`/files/${f.id}/details`);
      setDetails(prev => ({ ...prev, [f.id]: r.data }));
    } catch {}
    setLoadingDetails(null);
  };

  const fmt = (v) => v != null ? Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—';

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filteredFiles = files.filter(f => {
    if (filterName && !f.original_name?.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterCat && f.category !== filterCat) return false;
    if (filterStatus) {
      const m = ageMonths(f.upload_date);
      if (filterStatus === 'ok'      && m > 3)  return false;
      if (filterStatus === 'warning' && (m <= 3 || m > 6)) return false;
      if (filterStatus === 'old'     && m <= 6)  return false;
    }
    return true;
  });

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let va, vb;
    if (sortKey === 'original_name') { va = (a.original_name || '').toLowerCase(); vb = (b.original_name || '').toLowerCase(); }
    else if (sortKey === 'category')  { va = (a.category || '').toLowerCase(); vb = (b.category || '').toLowerCase(); }
    else if (sortKey === 'upload_date') { va = new Date(a.upload_date); vb = new Date(b.upload_date); }
    else if (sortKey === 'product_count') { va = a.product_count || 0; vb = b.product_count || 0; }
    else if (sortKey === 'uploaded_by_email') { va = (a.uploaded_by_email || '').toLowerCase(); vb = (b.uploaded_by_email || '').toLowerCase(); }
    else { va = a[sortKey]; vb = b[sortKey]; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const load = () => { setLoading(true); api.get('/files').then(r => setFiles(r.data)).catch(console.error).finally(() => setLoading(false)); };
  useEffect(load, []);

  const startRename = (f) => { setRenamingId(f.id); setRenameVal(f.original_name); };
  const cancelRename = () => { setRenamingId(null); setRenameVal(''); };
  const saveRename = async (f) => {
    if (!renameVal.trim() || renameVal.trim() === f.original_name) { cancelRename(); return; }
    try {
      await api.patch(`/files/${f.id}/rename`, { name: renameVal.trim() });
      setFiles(prev => prev.map(x => x.id === f.id ? { ...x, original_name: renameVal.trim() } : x));
      setMsg({ ok: true, text: `Fichier renommé en "${renameVal.trim()}"` });
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || 'Erreur lors du renommage' });
    }
    cancelRename();
  };

  const saveCategory = async (f, newCat) => {
    setEditCatId(null);
    if (newCat === f.category) return;
    try {
      await api.patch(`/files/${f.id}/category`, { category: newCat });
      setFiles(prev => prev.map(x => x.id === f.id ? { ...x, category: newCat } : x));
      setMsg({ ok: true, text: `Catégorie mise à jour → ${newCat}` });
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.error || 'Erreur' }); }
  };

  const del = async (f) => {
    if (!confirm(`Supprimer "${f.original_name}" et ses ${f.product_count} produits ?`)) return;
    setDeleting(f.id);
    try { await api.delete(`/files/${f.id}`); setMsg({ ok: true, text: `"${f.original_name}" supprimé.` }); load(); }
    catch (e) { setMsg({ ok: false, text: e.response?.data?.error || 'Erreur' }); }
    finally { setDeleting(null); }
  };

  const outdated = files.filter(f => ageMonths(f.upload_date) > 6).length;
  const thBase = { padding: '11px 14px', background: '#1a3a5c', color: 'rgba(255,255,255,0.85)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap', userSelect: 'none' };
  const td = { padding: '11px 14px', borderBottom: '1px solid #dde3ec', fontSize: 13.5, verticalAlign: 'middle' };

  const SortTh = ({ label, sKey, style = {} }) => {
    const active = sortKey === sKey;
    const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
    return (
      <th onClick={() => toggleSort(sKey)} style={{ ...thBase, cursor: 'pointer', ...style }}>
        <span style={{ opacity: active ? 1 : 0.85 }}>{label}</span>
        <span style={{ fontSize: 9, opacity: active ? 1 : 0.45, marginLeft: 3 }}>{arrow}</span>
      </th>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a3a5c', marginBottom: 4 }}>📁 Répertoire des fichiers prix</h1>
          <p style={{ color: '#64748b', fontSize: 13.5 }}>
            {filteredFiles.length !== files.length
              ? <><strong style={{ color: '#1a3a5c' }}>{filteredFiles.length}</strong> / {files.length} fichier(s) · <strong style={{ color: '#1a3a5c' }}>{filteredFiles.reduce((s, f) => s + (f.product_count || 0), 0).toLocaleString('fr-FR')}</strong> produits affichés</>
              : <>{files.length} fichier(s) · {files.reduce((s, f) => s + (f.product_count || 0), 0).toLocaleString('fr-FR')} produits</>
            }
          </p>
        </div>
        {user?.role === 'admin' && <Link to="/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: '#1d9e75', color: 'white', borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>📤 Importer</Link>}
      </div>

      {outdated > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '12px 18px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, color: '#9a3412', fontWeight: 500 }}>
          ⚠️ <span><strong>{outdated} fichier(s)</strong> datent de plus de 6 mois et peuvent être obsolètes.</span>
        </div>
      )}

      {msg && (
        <div style={{ background: msg.ok ? '#ecfdf5' : '#fee2e2', border: `1px solid ${msg.ok ? '#a7f3d0' : '#fecaca'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13.5, color: msg.ok ? '#065f46' : '#991b1b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setMsg(null)}>
          {msg.ok ? '✓' : '⚠️'} {msg.text}
        </div>
      )}

      {/* ── Barre de filtres ── */}
      {!loading && files.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {/* Recherche par nom */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
            <input
              type="text" value={filterName}
              onChange={e => setFilterName(e.target.value)}
              placeholder="Rechercher un fichier…"
              style={{ width: '100%', padding: '8px 12px 8px 34px', border: '1px solid #dde3ec', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#1e293b' }}
              onFocus={e => e.target.style.borderColor = '#1d9e75'}
              onBlur={e => e.target.style.borderColor = '#dde3ec'}
            />
          </div>
          {/* Filtre catégorie */}
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #dde3ec', borderRadius: 8, fontSize: 13, background: 'white', color: filterCat ? '#1a3a5c' : '#64748b', cursor: 'pointer', outline: 'none' }}>
            <option value="">📂 Toutes les catégories</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.id}</option>)}
          </select>
          {/* Filtre statut */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #dde3ec', borderRadius: 8, fontSize: 13, background: 'white', color: filterStatus ? '#1a3a5c' : '#64748b', cursor: 'pointer', outline: 'none' }}>
            <option value="">🔵 Tous les statuts</option>
            <option value="ok">🟢 À jour (&lt; 3 mois)</option>
            <option value="warning">🟠 3–6 mois</option>
            <option value="old">🔴 Obsolète (&gt; 6 mois)</option>
          </select>
          {/* Reset */}
          {(filterName || filterCat || filterStatus) && (
            <button onClick={() => { setFilterName(''); setFilterCat(''); setFilterStatus(''); }}
              style={{ padding: '8px 12px', border: '1px solid #fca5a5', borderRadius: 8, background: '#fff1f2', color: '#dc2626', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ✕ Réinitialiser
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>Chargement…</div>
      ) : !files.length ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
          <strong style={{ color: '#1e293b' }}>Aucun fichier importé</strong>
          {user?.role === 'admin' && <div style={{ marginTop: 12 }}><Link to="/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: '#1d9e75', color: 'white', borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>Importer un fichier</Link></div>}
        </div>
      ) : (
        <>
        {sortedFiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔎</div>
            <strong>Aucun fichier ne correspond aux filtres</strong>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => { setFilterName(''); setFilterCat(''); setFilterStatus(''); }}
                style={{ padding: '7px 14px', background: '#f1f5f9', border: '1px solid #dde3ec', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: '#475569' }}>
                Effacer les filtres
              </button>
            </div>
          </div>
        ) : (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #dde3ec', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortTh label="Fichier"      sKey="original_name" />
                <SortTh label="Catégorie"    sKey="category" />
                <SortTh label="Date d'import" sKey="upload_date" />
                <th style={thBase}>Ancienneté</th>
                <SortTh label="Produits"     sKey="product_count" />
                <SortTh label="Importé par"  sKey="uploaded_by_email" />
                <th style={thBase}>Statut</th>
                {user?.role === 'admin' && <th style={thBase}></th>}
                <th style={{ ...thBase, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((f, i) => (
                <>
                <tr key={f.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafd' }}>
                  <td style={td}>
                    {renamingId === f.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 18 }}>📄</span>
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveRename(f); if (e.key === 'Escape') cancelRename(); }}
                          style={{ padding: '4px 8px', border: '1.5px solid #1d9e75', borderRadius: 6, fontSize: 13.5, color: '#1a3a5c', outline: 'none', minWidth: 220 }}
                        />
                        <button onClick={() => saveRename(f)} title="Enregistrer" style={{ padding: '4px 9px', background: '#1d9e75', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✓</button>
                        <button onClick={cancelRename} title="Annuler" style={{ padding: '4px 9px', background: '#f1f5f9', color: '#64748b', border: '1px solid #dde3ec', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>📄</span>
                        <span style={{ fontWeight: 500, color: '#1a3a5c' }}>{f.original_name}</span>
                        {user?.role === 'admin' && (
                          <button onClick={() => startRename(f)} title="Renommer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
                            onMouseEnter={e => e.currentTarget.style.color = '#1d9e75'}
                            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                          >✏️</button>
                        )}
                      </div>
                    )}
                  </td>
                  {/* Catégorie */}
                  <td style={td}>
                    {editCatId === f.id ? (
                      <select autoFocus value={f.category || 'Général'}
                        onChange={e => saveCategory(f, e.target.value)}
                        onBlur={() => setEditCatId(null)}
                        style={{ padding: '4px 8px', border: '1.5px solid #1d9e75', borderRadius: 6, fontSize: 12.5, color: '#1a3a5c', outline: 'none', cursor: 'pointer' }}>
                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.id}</option>)}
                      </select>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CategoryBadge category={f.category || 'Général'} />
                        {user?.role === 'admin' && (
                          <button onClick={() => setEditCatId(f.id)} title="Changer la catégorie"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: '2px 4px', borderRadius: 4 }}
                            onMouseEnter={e => e.currentTarget.style.color = '#1d9e75'}
                            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
                            ✏️
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, color: '#64748b' }}>{fmtDate(f.upload_date)}</td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12.5 }}><AgeLabel date={f.upload_date} /></td>
                  <td style={td}><span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 600 }}>{f.product_count?.toLocaleString('fr-FR')} produits</span></td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12.5 }}>{f.uploaded_by_email || '—'}</td>
                  <td style={td}><StatusBadge date={f.upload_date} /></td>
                  {user?.role === 'admin' && (
                    <td style={td}>
                      <button onClick={() => del(f)} disabled={deleting === f.id} style={{ padding: '6px 12px', background: '#fee2e2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {deleting === f.id ? '…' : '🗑 Supprimer'}
                      </button>
                    </td>
                  )}
                  <td style={{ ...td, width: 40, textAlign: 'center' }}>
                    <button
                      onClick={() => toggleDetails(f)}
                      title="Informations complémentaires"
                      style={{ background: expandedId === f.id ? '#1a3a5c' : '#f1f5f9', border: '1px solid ' + (expandedId === f.id ? '#1a3a5c' : '#dde3ec'), color: expandedId === f.id ? 'white' : '#64748b', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >ℹ</button>
                  </td>
                </tr>
                {expandedId === f.id && (
                  <tr key={`detail-${f.id}`} style={{ background: '#f0f7ff' }}>
                    <td colSpan={user?.role === 'admin' ? 9 : 8} style={{ padding: '16px 20px', borderBottom: '2px solid #bfdbfe' }}>
                      {loadingDetails === f.id ? (
                        <span style={{ color: '#64748b', fontSize: 13 }}>Chargement…</span>
                      ) : details[f.id] ? (() => {
                        const { sheets, stats, lobs } = details[f.id];
                        return (
                          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                            {/* Feuilles */}
                            <div style={{ flex: '2 1 300px' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>📋 Feuilles ({sheets.length})</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {sheets.map(s => (
                                  <span key={s.name} style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: 8, padding: '3px 10px', fontSize: 12, color: '#1e40af', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    {s.name}
                                    <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 10, padding: '0 6px', fontSize: 10.5, fontWeight: 600 }}>{s.count.toLocaleString('fr-FR')}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                            {/* Stats prix */}
                            <div style={{ flex: '0 0 180px' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>💶 Fourchette de prix</div>
                              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.8 }}>
                                <div>Min : <strong style={{ color: '#059669' }}>{fmt(stats?.min_prix)}</strong></div>
                                <div>Max : <strong style={{ color: '#dc2626' }}>{fmt(stats?.max_prix)}</strong></div>
                              </div>
                            </div>
                            {/* LINE OF BUSINESS */}
                            {lobs.length > 0 && (
                              <div style={{ flex: '1 1 180px' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>🏭 Gammes</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                  {lobs.map(l => (
                                    <span key={l} style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '2px 9px', fontSize: 11.5, color: '#15803d', fontWeight: 500 }}>{l}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })() : null}
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
        </div>
        )}
        </>
      )}
    </div>
  );
}
