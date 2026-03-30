import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useToast } from '../App';

function fmt(v) {
  if (v == null || v === '') return '—';
  return typeof v === 'number'
    ? v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    : v;
}

function isLocationSupplier(supplier) {
  return typeof supplier === 'string' && supplier.toLowerCase().includes('location');
}

export default function Favorites() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading]     = useState(true);
  const showToast = useToast();

  useEffect(() => {
    api.get('/favorites')
      .then(r => setFavorites(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const removeFav = async (productId) => {
    try {
      await api.delete(`/favorites/${productId}`);
      setFavorites(prev => prev.filter(p => p.id !== productId));
      showToast('Retiré des favoris', 'warning');
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  const stdFavs = favorites.filter(p => !isLocationSupplier(p.supplier));
  const locFavs = favorites.filter(p => isLocationSupplier(p.supplier));

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
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">⭐ Mes favoris</div>
          <div className="page-subtitle">
            {favorites.length} produit(s) sauvegardé(s)
          </div>
        </div>
        <Link to="/search" className="btn btn-secondary">
          🔍 Nouvelle recherche
        </Link>
      </div>

      {favorites.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '48px 0' }}>
            <div className="empty-state-icon">⭐</div>
            <div className="empty-state-title">Aucun favori</div>
            <div className="empty-state-text">
              Ajoutez des produits en favoris depuis la page de recherche en cliquant sur l'étoile.
            </div>
            <Link to="/search" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>
              Rechercher un produit
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Produits standards */}
          {stdFavs.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <span className="card-title">📦 Produits standards ({stdFavs.length})</span>
              </div>
              <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Désignation</th>
                      <th>Config.</th>
                      <th>Unité</th>
                      <th>Tarif HT</th>
                      <th>PA</th>
                      <th>Fournisseur</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stdFavs.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--primary)' }}>
                          <code style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 5, fontSize: 11.5 }}>{p.reference || '—'}</code>
                        </td>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.designation || '—'}</td>
                        <td className="td-muted" style={{ fontSize: 12 }}>{p.configuration || '—'}</td>
                        <td className="td-muted">{p.unit || '—'}</td>
                        <td style={{ fontWeight: 600, color: '#1a3a5c' }}>{fmt(p.price_ht)}</td>
                        <td style={{ color: '#64748b' }}>{fmt(p.pa)}</td>
                        <td>
                          {p.supplier && (
                            <span className="badge badge-info" style={{ fontSize: 11 }}>{p.supplier}</span>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => removeFav(p.id)}
                            title="Retirer des favoris"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.6, transition: 'opacity 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                          >
                            ★
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Produits location */}
          {locFavs.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">🔑 Location ({locFavs.length})</span>
              </div>
              <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Désignation</th>
                      <th>Config.</th>
                      <th>Base Sem.</th>
                      <th>Base Mois</th>
                      <th>Part. Sem.</th>
                      <th>Part. Mois</th>
                      <th>GC Sem.</th>
                      <th>GC Mois</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {locFavs.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>
                          <code style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 5, fontSize: 11.5 }}>{p.reference || '—'}</code>
                        </td>
                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.designation || '—'}</td>
                        <td className="td-muted" style={{ fontSize: 12 }}>{p.configuration || '—'}</td>
                        <td>{fmt(p.loc_base_sem)}</td>
                        <td>{fmt(p.loc_base_mois)}</td>
                        <td>{fmt(p.loc_part_sem)}</td>
                        <td>{fmt(p.loc_part_mois)}</td>
                        <td>{fmt(p.loc_gc_sem)}</td>
                        <td>{fmt(p.loc_gc_mois)}</td>
                        <td>
                          <button
                            onClick={() => removeFav(p.id)}
                            title="Retirer des favoris"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.6, transition: 'opacity 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                          >
                            ★
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
