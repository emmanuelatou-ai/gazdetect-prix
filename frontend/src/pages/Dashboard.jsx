import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

/* ── Helpers ──────────────────────────────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}
function monthsAgo(dateStr) {
  if (!dateStr) return 0;
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 30);
}

/* ── Graphique barres SVG (14 derniers jours) ─────────── */
function SearchBarChart({ days }) {
  const [hovered, setHovered] = useState(null);
  if (!days || days.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
        Aucune donnée disponible
      </div>
    );
  }

  const maxCount = Math.max(...days.map(d => d.count), 1);
  const W = 540, H = 120, barW = 30, gap = 8;
  const totalW = days.length * (barW + gap) - gap;
  const offsetX = (W - totalW) / 2;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H + 36}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {/* Lignes de grille horizontales */}
        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
          const y = H - ratio * H;
          const val = Math.round(ratio * maxCount);
          return (
            <g key={ratio}>
              <line x1={offsetX} y1={y} x2={offsetX + totalW} y2={y}
                stroke="var(--border)" strokeWidth={0.8} strokeDasharray={ratio === 0 ? 'none' : '3 3'} />
              {val > 0 && (
                <text x={offsetX - 6} y={y + 3.5} textAnchor="end"
                  fontSize={8} fill="var(--text-muted)" fontFamily="Inter,sans-serif">{val}</text>
              )}
            </g>
          );
        })}

        {/* Barres */}
        {days.map((d, i) => {
          const barH = maxCount > 0 ? (d.count / maxCount) * H : 0;
          const x = offsetX + i * (barW + gap);
          const y = H - barH;
          const label = new Date(d.day + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
          const isHovered = hovered === i;

          return (
            <g key={d.day}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}>
              {/* Barre */}
              <rect x={x} y={barH > 0 ? y : H - 2} width={barW}
                height={barH > 0 ? barH : 2} rx={4}
                fill={isHovered ? '#19896a' : '#1d9e75'}
                opacity={isHovered ? 1 : 0.82}
                style={{ transition: 'fill 0.1s, opacity 0.1s' }} />

              {/* Valeur au survol */}
              {isHovered && d.count > 0 && (
                <g>
                  <rect x={x + barW / 2 - 16} y={y - 22} width={32} height={16} rx={4}
                    fill="#1a3a5c" />
                  <text x={x + barW / 2} y={y - 10} textAnchor="middle"
                    fontSize={9} fill="white" fontWeight={700} fontFamily="Inter,sans-serif">
                    {d.count}
                  </text>
                </g>
              )}

              {/* Étiquette X */}
              <text x={x + barW / 2} y={H + 14} textAnchor="middle"
                fontSize={8.5} fill="var(--text-muted)" fontFamily="Inter,sans-serif">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Widget activité recherches (commercial) ─────────── */

function SearchCurve({ days }) {
  const W = 500, H = 80, pad = 12;
  const counts = days.map(d => d.count);
  const maxV   = Math.max(...counts, 1);

  // Points normalisés
  const pts = counts.map((v, i) => ({
    x: pad + (i / (counts.length - 1)) * (W - pad * 2),
    y: H - pad - (v / maxV) * (H - pad * 2),
  }));

  // Courbe smooth via bezier cubique
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * 0.5;
    const cp2x = pts[i].x     - (pts[i].x - pts[i - 1].x) * 0.5;
    path += ` C ${cp1x} ${pts[i - 1].y}, ${cp2x} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }

  // Zone remplie sous la courbe
  const area = `${path} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;

  const fmtDay = iso => {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d9e75" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#1d9e75" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Lignes grille horizontales */}
      {[0, 0.5, 1].map(r => (
        <line key={r} x1={pad} y1={H - pad - r * (H - pad * 2)} x2={W - pad} y2={H - pad - r * (H - pad * 2)}
          stroke="var(--border)" strokeWidth={0.8} strokeDasharray={r === 0 ? 'none' : '3 3'} />
      ))}
      {/* Zone sous courbe */}
      <path d={area} fill="url(#curve-fill)" />
      {/* Courbe principale */}
      <path d={path} fill="none" stroke="#1d9e75" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Points */}
      {pts.map((p, i) => (
        <g key={i}>
          {counts[i] > 0 && (
            <circle cx={p.x} cy={p.y} r={3.5} fill="white" stroke="#1d9e75" strokeWidth={2} />
          )}
          {/* Étiquette jour */}
          <text x={p.x} y={H + 14} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontFamily="Inter,sans-serif">
            {fmtDay(days[i].day)}
          </text>
        </g>
      ))}
      {/* Valeur max */}
      {maxV > 0 && (
        <text x={pad - 4} y={pad + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)" fontFamily="Inter,sans-serif">{maxV}</text>
      )}
    </svg>
  );
}

function MySearchStats() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/products/leaderboard').then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data?.myStats) return null;

  const today  = data.myStats.points_today ?? 0;
  const week   = data.myStats.points_week  ?? 0;
  const avg    = week > 0 ? week / 7 : 0;
  const above  = avg > 0 && today >= avg;
  const days   = data.myStats.days || [];

  return (
    <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
      <div className="card-header" style={{ padding: '14px 20px' }}>
        <span className="card-title">📊 Mes recherches — 7 jours</span>
        {above && (
          <span style={{ fontSize: 11.5, color: '#1d9e75', fontWeight: 600 }}>
            🔥 Au-dessus de ta moyenne !
          </span>
        )}
      </div>

      <div style={{ padding: '0 20px 16px' }}>
        {/* Courbe */}
        {days.length > 0 && (
          <div style={{ padding: '12px 0 4px' }}>
            <SearchCurve days={days} />
          </div>
        )}

        {/* Métriques sous la courbe */}
        <div className="dash-metrics">
          <div style={{ background: '#e6f7f2', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1d9e75', lineHeight: 1 }}>{today}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Aujourd'hui</div>
          </div>
          <div style={{ background: '#f0f4f9', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{week}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>7 derniers jours</div>
          </div>
          {avg > 0 && (
            <div style={{ background: '#f0f4f9', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{avg.toFixed(1)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Moy./jour</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Modal détail requêtes par utilisateur ────────────── */
function SearchStatsModal({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/products/search-stats').then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const fmtDt = d => d ? new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid var(--border)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>🔍 Requêtes par utilisateur</h2>
            {data && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '3px 0 0' }}>{data.total} requête(s) au total</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>
          ) : !data?.byUser?.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Aucune recherche enregistrée.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Utilisateur', 'Requêtes', 'Dernière recherche', 'Dernier terme'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.byUser.map((row, i) => (
                  <tr key={row.email} style={{ background: i % 2 === 0 ? 'var(--card)' : 'var(--bg)' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13.5, fontWeight: 500, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                      {row.display_name || row.email}
                      {row.display_name && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{row.email}</div>}
                    </td>
                    <td style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '2px 9px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{row.total}</span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{fmtDt(row.last_search)}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12.5, color: 'var(--text)', borderBottom: '1px solid var(--border)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{row.last_query}"</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard principal ──────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats]       = useState(null);
  const [files, setFiles]       = useState([]);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showSearchModal, setShowSearchModal] = useState(false);

  useEffect(() => {
    const calls = [api.get('/products/stats'), api.get('/files')];
    if (user?.role === 'admin') calls.push(api.get('/products/search-activity'));

    Promise.all(calls).then(([statsRes, filesRes, actRes]) => {
      setStats(statsRes.data);
      setFiles(filesRes.data);
      if (actRes) setActivity(actRes.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, [user]);

  const outdatedFiles = files.filter(f => monthsAgo(f.upload_date) > 6);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ borderTopColor: 'var(--accent)', borderColor: 'var(--border)', width: 32, height: 32, borderWidth: 3 }} />
          <div style={{ marginTop: 12 }}>Chargement…</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showSearchModal && <SearchStatsModal onClose={() => setShowSearchModal(false)} />}

      {/* En-tête */}
      <div className="page-header">
        <div>
          <div className="page-title">Bonjour 👋</div>
          <div className="page-subtitle">
            Connecté en tant que <strong>{user?.email}</strong> — Rôle : {user?.role}
          </div>
        </div>
        {user?.role === 'admin' && (
          <Link to="/upload" className="btn btn-primary"><span>📤</span> Importer un fichier</Link>
        )}
      </div>

      {/* Alerte fichiers anciens */}
      {outdatedFiles.length > 0 && (
        <div className="alert-banner warning">
          <span>⚠️</span>
          <span>
            <strong>{outdatedFiles.length} fichier(s) prix</strong> datent de plus de 6 mois.
            {user?.role === 'admin' && <> <Link to="/upload" style={{ color: 'inherit', fontWeight: 700 }}>Mettre à jour →</Link></>}
          </span>
        </div>
      )}

      {/* ── Cartes de stats ───────────────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">📦</div>
          <div className="stat-info">
            <div className="stat-value">{stats?.totalProducts?.toLocaleString('fr-FR') || 0}</div>
            <div className="stat-label">Produits indexés</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">📁</div>
          <div className="stat-info">
            <div className="stat-value">{stats?.totalFiles || 0}</div>
            <div className="stat-label">Fichiers prix</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f0fdf4' }}>📅</div>
          <div className="stat-info">
            <div className="stat-value" style={{ fontSize: 15, marginTop: 2 }}>
              {stats?.latestFile ? formatDate(stats.latestFile.upload_date) : '—'}
            </div>
            <div className="stat-label">Dernier import</div>
          </div>
        </div>

        {user?.role === 'admin' && (
          <div className="stat-card" onClick={() => setShowSearchModal(true)}
            style={{ cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
            title="Voir le détail par utilisateur">
            <div className="stat-icon" style={{ background: '#fdf4ff' }}>🔍</div>
            <div className="stat-info">
              <div className="stat-value">{stats?.totalSearches?.toLocaleString('fr-FR') || 0}</div>
              <div className="stat-label">Requêtes lancées ↗</div>
            </div>
          </div>
        )}

        {outdatedFiles.length > 0 && (
          <div className="stat-card" style={{ border: '1px solid #fcd34d' }}>
            <div className="stat-icon orange">🕐</div>
            <div className="stat-info">
              <div className="stat-value" style={{ color: '#92400e' }}>{outdatedFiles.length}</div>
              <div className="stat-label">Fichier(s) &gt; 6 mois</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Raccourcis rapides (commercial) ───────────────── */}
      {user?.role !== 'admin' && (
        <div className="dash-shortcuts">
          <Link to="/search" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'linear-gradient(135deg, #1d9e75 0%, #1a7a5e 100%)',
              borderRadius: 10, padding: '13px 16px', height: '100%', boxSizing: 'border-box',
              boxShadow: '0 3px 12px rgba(29,158,117,0.3)',
              cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.1s',
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 5px 20px rgba(29,158,117,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 3px 12px rgba(29,158,117,0.3)'; e.currentTarget.style.transform = ''; }}
            >
              <span style={{ fontSize: 17, flexShrink: 0 }}>🔍</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'white', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Rechercher un produit</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Réf., désignation, config…</div>
              </div>
              <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>→</span>
            </div>
          </Link>
          <Link to="/files" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '13px 16px', height: '100%', boxSizing: 'border-box',
              cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.1s',
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
            >
              <span style={{ fontSize: 17, flexShrink: 0 }}>📁</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Fichiers prix</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{files.length} fichier{files.length > 1 ? 's' : ''} disponible{files.length > 1 ? 's' : ''}</div>
              </div>
              <span style={{ fontSize: 15, color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
            </div>
          </Link>
        </div>
      )}

      {/* ── Stats recherches (commercial) ─────────────────── */}
      {user?.role !== 'admin' && <MySearchStats />}

      {/* ── Bouton support technique (commercial) ─────────── */}
      {user?.role !== 'admin' && (
        <div style={{ marginTop: 8, marginBottom: 4, textAlign: 'center' }}>
          <a
            href={`mailto:emmanuel.atou@gazdetect.com?subject=Bug%20%2F%20Probl%C3%A8me%20technique%20—%20GD%20Prix&body=Bonjour%20Emmanuel%2C%0A%0AJe%20rencontre%20un%20probl%C3%A8me%20sur%20l%27application%20:%0A%0A[D%C3%A9crivez%20le%20bug%20ici]%0A%0ACordialement%2C%0A${encodeURIComponent(user?.email || '')}`}
            style={{ textDecoration: 'none' }}
          >
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: 'var(--text-muted)', fontWeight: 500,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 20, padding: '5px 12px',
              cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              🐛 Signaler un bug à l'équipe technique
            </span>
          </a>
        </div>
      )}

      {/* ── Section admin : graphique + top chercheurs ────── */}
      {user?.role === 'admin' && activity && (
        <div className="dash-admin-grid">

          {/* Graphique activité 14 jours */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="card-header" style={{ padding: '14px 20px' }}>
              <span className="card-title">📈 Activité des recherches — 14 derniers jours</span>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <SearchBarChart days={activity.days} />
            </div>

            {/* Top requêtes */}
            {activity.topQueries?.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '14px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  🔥 Termes les plus recherchés
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {activity.topQueries.map((q, i) => (
                    <span key={q.query} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: i === 0 ? 'rgba(29,158,117,0.12)' : 'var(--bg)',
                      border: `1px solid ${i === 0 ? 'rgba(29,158,117,0.3)' : 'var(--border)'}`,
                      color: i === 0 ? '#1d9e75' : 'var(--text)',
                      borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 500,
                    }}>
                      "{q.query}"
                      <span style={{ background: i === 0 ? '#1d9e75' : '#64748b', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>{q.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top chercheurs */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="card-header" style={{ padding: '14px 20px' }}>
              <span className="card-title">🏆 Top chercheurs</span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {!activity.topSearchers?.length ? (
                <div style={{ padding: '24px 20px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  Aucune recherche enregistrée
                </div>
              ) : activity.topSearchers.map((s, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const barPct = (s.total / activity.topSearchers[0].total) * 100;
                return (
                  <div key={s.email} style={{ padding: '10px 20px', borderBottom: i < activity.topSearchers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{medals[i] || `#${i + 1}`}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>
                            {s.display_name || s.email.split('@')[0]}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{s.email}</div>
                        </div>
                      </div>
                      <span style={{
                        background: i === 0 ? 'rgba(29,158,117,0.12)' : 'var(--bg)',
                        color: i === 0 ? '#1d9e75' : 'var(--text-muted)',
                        border: `1px solid ${i === 0 ? 'rgba(29,158,117,0.3)' : 'var(--border)'}`,
                        borderRadius: 12, padding: '2px 9px', fontSize: 12, fontWeight: 700,
                      }}>{s.total}</span>
                    </div>
                    {/* Barre de progression */}
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: i === 0 ? '#1d9e75' : '#93c5fd', borderRadius: 2, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowSearchModal(true)}
                style={{ width: '100%', background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '7px', fontSize: 12.5, color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                Voir tous les détails →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Liste des fichiers importés (admin seulement) ─── */}
      {user?.role === 'admin' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">📁 Fichiers prix importés</span>
            <Link to="/files" className="btn btn-secondary btn-sm">Voir tout →</Link>
          </div>

          {files.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📂</div>
              <div className="empty-state-title">Aucun fichier importé</div>
              <div className="empty-state-text">
                <Link to="/upload" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Importer un fichier</Link>
              </div>
            </div>
          ) : (
            <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Fichier</th>
                    <th>Date d'import</th>
                    <th>Produits</th>
                    <th>Importé par</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {files.slice(0, 8).map(f => {
                    const isOld = monthsAgo(f.upload_date) > 6;
                    return (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 500 }}>📄 {f.original_name}</td>
                        <td className="td-muted">{formatDate(f.upload_date)}</td>
                        <td>
                          <span className="badge badge-info">{f.product_count?.toLocaleString('fr-FR')} produits</span>
                        </td>
                        <td className="td-muted">{f.uploaded_by_email || '—'}</td>
                        <td>
                          {isOld
                            ? <span className="badge badge-warning">⚠️ &gt; 6 mois</span>
                            : <span className="badge badge-success">✓ À jour</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
