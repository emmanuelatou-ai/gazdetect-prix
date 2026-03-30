import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef();

  const fetchNotifs = async () => {
    try {
      const { data } = await api.get('/mentions/notifications');
      setNotifs(data.notifications);
      setUnread(data.unreadCount);
    } catch {}
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fermer en cliquant dehors
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    await api.put('/mentions/notifications/read-all');
    setNotifs(n => n.map(x => ({ ...x, is_read: 1 })));
    setUnread(0);
  };

  const markRead = async (id) => {
    await api.put(`/mentions/notifications/${id}/read`);
    setNotifs(n => n.map(x => x.id === id ? { ...x, is_read: 1 } : x));
    setUnread(u => Math.max(0, u - 1));
  };

  const fmtDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    return date.toLocaleDateString('fr-FR');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          position: 'relative', background: open ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          width: 36, height: 36, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 16,
          transition: 'background 0.15s',
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#ef4444', color: 'white', borderRadius: '50%',
            width: 18, height: 18, fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #1a3a5c',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: '100%', top: 0, marginLeft: 8,
          width: 340, background: 'white', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          border: '1px solid #dde3ec', zIndex: 1000, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
              Notifications {unread > 0 && <span style={{ background: '#ef4444', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{unread}</span>}
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Liste */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifs.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                Aucune notification
              </div>
            ) : notifs.map(n => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                style={{
                  padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
                  background: n.is_read ? 'white' : '#eff6ff',
                  cursor: n.is_read ? 'default' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', background: '#1a3a5c',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>
                    {(n.from_name || n.from_email).slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: '#1e293b', lineHeight: 1.4 }}>
                      <strong>{n.from_name || n.from_email}</strong> t'a tagué sur{' '}
                      <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>
                        {n.reference || n.designation}
                      </span>
                    </div>
                    {n.message && (
                      <div style={{ marginTop: 5, fontSize: 12, color: '#475569', background: '#f8fafc', padding: '6px 9px', borderRadius: 6, borderLeft: '3px solid #3b82f6', fontStyle: 'italic' }}>
                        "{n.message}"
                      </div>
                    )}
                    <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
                      {fmtDate(n.created_at)}
                      {!n.is_read && <span style={{ marginLeft: 8, background: '#3b82f6', color: 'white', borderRadius: 8, padding: '1px 6px', fontSize: 10 }}>Nouveau</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'GD';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <img src="/logo-gazdetect.svg" alt="GazDetect" className="sidebar-logo-img" />
        <div className="sidebar-logo-sub">Catalogue Prix</div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>

        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="nav-icon">📊</span>
          Tableau de bord
        </NavLink>

        <NavLink to="/search" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="nav-icon">🔍</span>
          Recherche
        </NavLink>

        <NavLink to="/files" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="nav-icon">📁</span>
          Fichiers prix
        </NavLink>

        {user?.role === 'admin' && (
          <>
            <div className="nav-section-label" style={{ marginTop: 8 }}>Administration</div>

            <NavLink to="/upload" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="nav-icon">📤</span>
              Importer un fichier
            </NavLink>

            <NavLink to="/users" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="nav-icon">👥</span>
              Utilisateurs
            </NavLink>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="sidebar-footer">
        {/* Cloche notifications */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <NotificationBell />
        </div>

        <div className="user-badge">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <span className="user-email">{user?.email}</span>
            <span className="user-role">
              <span className={`role-badge ${user?.role}`}>{user?.role}</span>
            </span>
          </div>
        </div>
        <button className="btn-logout" onClick={handleLogout}>
          <span>↩</span> Déconnexion
        </button>
      </div>
    </aside>
  );
}
