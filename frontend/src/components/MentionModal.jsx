import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function MentionModal({ product, onClose, onSent }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/mentions/users').then(r => setUsers(r.data)).catch(() => {});
  }, []);

  const filtered = users.filter(u =>
    (u.display_name || u.email).toLowerCase().includes(search.toLowerCase())
  );

  const initials = (u) => (u.display_name || u.email).slice(0, 2).toUpperCase();

  const handleSend = async () => {
    if (!selectedUser) return;
    setSending(true);
    try {
      await api.post('/mentions', {
        product_id: product.id,
        to_user_id: selectedUser.id,
        message: message.trim() || null,
      });
      onSent?.();
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500 }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', zIndex: 501,
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: 'var(--card, white)',
        borderRadius: 16,
        width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        border: '1px solid var(--border, #dde3ec)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ background: '#1a3a5c', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 }}>Taguer un collègue sur</div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>
              {product.reference && (
                <span style={{ fontFamily: 'monospace', fontSize: 12, background: 'rgba(255,255,255,0.15)', padding: '1px 7px', borderRadius: 4, marginRight: 8 }}>
                  {product.reference}
                </span>
              )}
              {product.designation}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px' }}>
          {/* Sélection utilisateur */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
              Taguer
            </label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un utilisateur..."
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #dde3ec', borderRadius: 8, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box', background: 'var(--bg, #f8fafc)' }}
            />
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #dde3ec', borderRadius: 8, background: 'var(--card, white)' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Aucun utilisateur</div>
              ) : filtered.map(u => (
                <div
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer',
                    background: selectedUser?.id === u.id ? '#eff6ff' : 'transparent',
                    borderLeft: selectedUser?.id === u.id ? '3px solid #3b82f6' : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (selectedUser?.id !== u.id) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (selectedUser?.id !== u.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: u.role === 'admin' ? '#1a3a5c' : '#1d9e75',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>
                    {initials(u)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{u.display_name || u.email}</div>
                    {u.display_name && <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email}</div>}
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: u.role === 'admin' ? '#dbeafe' : '#dcfce7', color: u.role === 'admin' ? '#1e40af' : '#15803d' }}>
                      {u.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message optionnel */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
              Message <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(optionnel)</span>
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Ex : Voici le prix que tu cherchais..."
              rows={3}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #dde3ec', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--bg, #f8fafc)' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #dde3ec', background: 'transparent', color: '#64748b', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
            >
              Annuler
            </button>
            <button
              onClick={handleSend}
              disabled={!selectedUser || sending}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: selectedUser && !sending ? '#1a3a5c' : '#94a3b8',
                color: 'white', fontSize: 13, cursor: selectedUser && !sending ? 'pointer' : 'not-allowed',
                fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {sending ? '⏳ Envoi...' : '@ Envoyer la mention'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
