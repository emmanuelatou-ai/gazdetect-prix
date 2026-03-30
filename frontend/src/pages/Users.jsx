import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

const emptyForm = { email: '', password: '', role: 'commercial' };

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchUsers = () => {
    api.get('/auth/users')
      .then(r => setUsers(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (form.password.length < 6) {
      setFormError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/users', form);
      setMessage({ type: 'success', text: `Utilisateur "${form.email}" créé avec succès.` });
      setShowModal(false);
      setForm(emptyForm);
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Supprimer l'utilisateur "${u.email}" ?`)) return;
    try {
      await api.delete(`/auth/users/${u.id}`);
      setMessage({ type: 'success', text: `"${u.email}" supprimé.` });
      fetchUsers();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Erreur lors de la suppression' });
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">👥 Gestion des utilisateurs</div>
          <div className="page-subtitle">{users.length} utilisateur(s) enregistré(s)</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowModal(true); setFormError(''); setForm(emptyForm); }}>
          <span>➕</span> Nouvel utilisateur
        </button>
      </div>

      {message && (
        <div className={`message ${message.type}`} onClick={() => setMessage(null)} style={{ cursor: 'pointer' }}>
          <span>{message.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ borderTopColor: 'var(--accent)', borderColor: 'var(--border)', width: 28, height: 28, borderWidth: 3, margin: '0 auto 10px' }} />
          Chargement…
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Rôle</th>
                <th>Créé le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>
                    {u.email}
                    {u.id === currentUser?.id && (
                      <span className="badge badge-info" style={{ marginLeft: 8 }}>Vous</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-success' : 'badge-neutral'}`}>
                      {u.role === 'admin' ? '🔑 Admin' : '👁 Commercial'}
                    </span>
                  </td>
                  <td className="td-muted">{formatDate(u.created_at)}</td>
                  <td>
                    {u.id !== currentUser?.id ? (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(u)}
                      >
                        🗑 Supprimer
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-light)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: create user */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Créer un utilisateur</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {formError && (
                  <div className="message error" style={{ marginBottom: 16 }}>
                    <span>⚠️</span> {formError}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Adresse email *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    required
                    placeholder="prenom.nom@gazdetect.com"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mot de passe * (min. 6 caractères)</label>
                  <input
                    type="password"
                    className="form-input"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    required
                    placeholder="••••••••"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Rôle *</label>
                  <select
                    className="form-select"
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="commercial">Commercial (lecture seule)</option>
                    <option value="admin">Admin (accès complet)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" /> Création…</> : '✓ Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
