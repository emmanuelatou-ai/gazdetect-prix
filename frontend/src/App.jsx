import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AlertBanner from './components/AlertBanner';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Search from './pages/Search';
import Files from './pages/Files';
import Upload from './pages/Upload';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Favorites from './pages/Favorites';
import api from './api/axios';

/* ══════════════════════════════════════════════════════════
   TOAST CONTEXT
══════════════════════════════════════════════════════════ */
export const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const colorMap = {
    success: { bg: '#1d9e75', icon: '✓' },
    error:   { bg: '#ef4444', icon: '✕' },
    info:    { bg: '#3b82f6', icon: 'ℹ' },
    warning: { bg: '#f59e0b', icon: '⚠' },
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {/* Toast container — coin bas-droit */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const c = colorMap[t.type] || colorMap.success;
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: c.bg, color: 'white',
              padding: '10px 16px', borderRadius: 10,
              fontSize: 13.5, fontWeight: 500,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              animation: 'slideInRight 0.2s ease',
              minWidth: 200, maxWidth: 320,
              pointerEvents: 'all',
            }}>
              <span style={{ fontSize: 15 }}>{c.icon}</span>
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ══════════════════════════════════════════════════════════
   HOOK MOBILE
══════════════════════════════════════════════════════════ */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return isMobile;
}

/* ══════════════════════════════════════════════════════════
   DARK MODE CONTEXT
══════════════════════════════════════════════════════════ */
export const DarkModeContext = createContext(null);

function DarkModeProvider({ children }) {
  const [dark, setDark] = useState(() => localStorage.getItem('gd_dark') === '1');

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('gd_dark', dark ? '1' : '0');
  }, [dark]);

  return (
    <DarkModeContext.Provider value={{ dark, setDark }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  return useContext(DarkModeContext);
}

/* ══════════════════════════════════════════════════════════
   HORLOGE + MÉTÉO
══════════════════════════════════════════════════════════ */
function ClockWeather() {
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState(null);
  const [city, setCity] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const [wRes, gRes] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true&timezone=auto`),
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=fr`)
          ]);
          const wData = await wRes.json();
          const gData = await gRes.json();
          setWeather(wData.current_weather);
          setCity(gData.address?.city || gData.address?.town || gData.address?.village || null);
        } catch { /* silencieux */ }
      },
      () => { /* permission refusée */ }
    );
  }, []);

  const wmoIcon = (code) => {
    if (code === 0)   return '☀️';
    if (code <= 2)    return '🌤️';
    if (code <= 3)    return '☁️';
    if (code <= 48)   return '🌫️';
    if (code <= 55)   return '🌦️';
    if (code <= 67)   return '🌧️';
    if (code <= 77)   return '❄️';
    if (code <= 82)   return '🌦️';
    return '⛈️';
  };

  const hh = time.getHours().toString().padStart(2, '0');
  const mm = time.getMinutes().toString().padStart(2, '0');
  const ss = time.getSeconds().toString().padStart(2, '0');

  return (
    <div style={{
      margin: '0 12px 4px', padding: '8px 12px',
      background: 'rgba(255,255,255,0.07)', borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      <div style={{ fontFamily: '"SF Mono","Fira Code","Consolas",monospace', fontSize: 20, fontWeight: 700, color: 'white', letterSpacing: '0.05em', lineHeight: 1.2 }}>
        {hh}<span style={{ opacity: 0.5, animation: 'blink 1s step-end infinite' }}>:</span>{mm}
        <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.45)', marginLeft: 4 }}>{ss}</span>
      </div>
      {weather ? (
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 15 }}>{wmoIcon(weather.weathercode)}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{Math.round(weather.temperature)}°C</span>
          {city && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>· {city}</span>}
        </div>
      ) : (
        <div style={{ marginTop: 4, fontSize: 10.5, color: 'rgba(255,255,255,0.25)' }}>météo indisponible</div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATION IMPORT (polling 60s)
══════════════════════════════════════════════════════════ */
function ImportNotifWatcher() {
  const showToast = useToast();
  const lastFileIdRef = useRef(null);

  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await api.get('/products/stats');
        const currentId = data?.latestFile?.id;
        if (currentId && lastFileIdRef.current !== null && currentId !== lastFileIdRef.current) {
          showToast(`📤 Nouveau fichier importé : ${data.latestFile.original_name || ''}`, 'info', 6000);
        }
        lastFileIdRef.current = currentId ?? null;
      } catch { /* silencieux */ }
    };
    check(); // vérification initiale (stocke le dernier ID sans notifier)
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [showToast]);

  return null;
}

/* ══════════════════════════════════════════════════════════
   ROUTE PROTÉGÉE
══════════════════════════════════════════════════════════ */
function ProtectedRoute({ children, adminOnly = false }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

/* ══════════════════════════════════════════════════════════
   CLOCHE NOTIFICATIONS (@mentions)
══════════════════════════════════════════════════════════ */
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef();

  const fetchNotifs = useCallback(async () => {
    try {
      const { data } = await api.get('/mentions/notifications');
      setNotifs(data.notifications);
      setUnread(data.unreadCount);
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifs]);

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

  const fmtAgo = (d) => {
    if (!d) return '';
    const diff = Math.floor((Date.now() - new Date(d)) / 1000);
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    return new Date(d).toLocaleDateString('fr-FR');
  };

  return (
    <div ref={ref} style={{ position: 'relative', padding: '6px 16px 2px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '7px 10px', cursor: 'pointer', transition: 'background 0.15s',
          position: 'relative',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.11)'}
        onMouseLeave={e => e.currentTarget.style.background = open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
          <span style={{ fontSize: 14 }}>🔔</span>
          Notifications
        </span>
        {unread > 0 && (
          <span style={{
            background: '#ef4444', color: 'white', borderRadius: 10,
            padding: '1px 7px', fontSize: 11, fontWeight: 700,
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: '100%', bottom: 0, marginLeft: 8,
          width: 340, background: 'white', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          border: '1px solid #dde3ec', zIndex: 1000, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
              Notifications {unread > 0 && <span style={{ background: '#ef4444', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{unread}</span>}
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Tout marquer lu
              </button>
            )}
          </div>
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
                  padding: '11px 16px', borderBottom: '1px solid #f1f5f9',
                  background: n.is_read ? 'white' : '#eff6ff',
                  cursor: n.is_read ? 'default' : 'pointer',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a3a5c', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
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
                      <div style={{ marginTop: 4, fontSize: 12, color: '#475569', background: '#f8fafc', padding: '5px 8px', borderRadius: 6, borderLeft: '3px solid #3b82f6', fontStyle: 'italic' }}>
                        "{n.message}"
                      </div>
                    )}
                    <div style={{ marginTop: 3, fontSize: 11, color: '#94a3b8' }}>
                      {fmtAgo(n.created_at)}
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

/* ══════════════════════════════════════════════════════════
   DARK MODE TOGGLE (sidebar)
══════════════════════════════════════════════════════════ */
function DarkModeToggle() {
  const { dark, setDark } = useDarkMode();
  return (
    <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <button
        onClick={() => setDark(!dark)}
        title={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '7px 10px', cursor: 'pointer', transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.11)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
          <span style={{ fontSize: 14 }}>{dark ? '☀️' : '🌙'}</span>
          {dark ? 'Mode clair' : 'Mode sombre'}
        </span>
        {/* Toggle pill */}
        <span style={{
          width: 34, height: 18, borderRadius: 9, position: 'relative', flexShrink: 0,
          background: dark ? '#1d9e75' : 'rgba(255,255,255,0.18)',
          border: '1px solid rgba(255,255,255,0.15)', transition: 'background 0.2s',
          display: 'inline-block',
        }}>
          <span style={{
            position: 'absolute', top: 2, left: dark ? 16 : 2,
            width: 12, height: 12, borderRadius: '50%',
            background: 'white', transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        </span>
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   NAVBAR
══════════════════════════════════════════════════════════ */
function Navbar({ sidebarOpen, setSidebarOpen, isMobile }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = user?.email?.slice(0, 2).toUpperCase() || 'GD';
  const link = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px',
    color: isActive ? 'white' : 'rgba(255,255,255,0.68)', textDecoration: 'none',
    fontSize: 13.5, fontWeight: 500,
    background: isActive ? 'rgba(29,158,117,0.2)' : 'transparent',
    borderLeft: isActive ? '3px solid #1d9e75' : '3px solid transparent',
    transition: 'all 0.15s',
  });

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, width: 240, height: '100vh',
      background: '#1a3a5c', display: 'flex', flexDirection: 'column',
      zIndex: isMobile ? 200 : 100,
      transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-240px)') : 'translateX(0)',
      transition: 'transform 0.25s ease',
    }}>
      {/* Logo — clic → tableau de bord */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Link to="/" onClick={() => isMobile && setSidebarOpen(false)} title="Retour au tableau de bord" style={{ display: 'block', textDecoration: 'none' }}>
          <img
            src="/logo-gazdetect.svg" alt="GazDetect"
            style={{ width: 148, filter: 'brightness(0) invert(1)', display: 'block', transition: 'opacity 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          />
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>Catalogue Prix</div>
        </Link>
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>✕</button>
        )}
      </div>

      {/* Horloge & Météo */}
      <div style={{ paddingTop: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <ClockWeather />
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
        {[
          ['/', '📊', 'Tableau de bord', true],
          ['/search', '🔍', 'Recherche', false],
          ['/favorites', '⭐', 'Mes favoris', false],
          ['/files', '📁', 'Fichiers prix', false],
        ].map(([to, icon, label, end]) => (
          <NavLink key={to} to={to} end={end} onClick={() => isMobile && setSidebarOpen(false)} style={({ isActive }) => link(isActive)}>
            <span style={{ width: 20, textAlign: 'center' }}>{icon}</span>{label}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '14px 20px 4px' }}>Admin</div>
            {[['/upload', '📤', 'Importer'], ['/users', '👥', 'Utilisateurs']].map(([to, icon, label]) => (
              <NavLink key={to} to={to} onClick={() => isMobile && setSidebarOpen(false)} style={({ isActive }) => link(isActive)}>
                <span style={{ width: 20, textAlign: 'center' }}>{icon}</span>{label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Toggle mode sombre */}
      <DarkModeToggle />

      {/* Cloche notifications */}
      <NotificationBell />

      {/* Pied — profil + déconnexion */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div
          onClick={() => { navigate('/profile'); if (isMobile) setSidebarOpen(false); }} title="Modifier mon profil"
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 8, cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        >
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1d9e75', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0, overflow: 'hidden' }}>
            {user?.avatar
              ? <img src={user.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ color: 'white', fontSize: 11.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.display_name || user?.email}</div>
            <div style={{ fontSize: 10, background: user?.role === 'admin' ? 'rgba(29,158,117,0.3)' : 'rgba(255,255,255,0.1)', color: user?.role === 'admin' ? '#4ade80' : 'rgba(255,255,255,0.6)', padding: '1px 6px', borderRadius: 10, display: 'inline-block', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{user?.role}</div>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>✏️</span>
        </div>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          style={{ width: '100%', padding: '7px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          ↩ Déconnexion
        </button>
      </div>
    </aside>
  );
}

/* ══════════════════════════════════════════════════════════
   LAYOUT
══════════════════════════════════════════════════════════ */
function Layout({ children }) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fermer la sidebar au changement de taille
  useEffect(() => { if (!isMobile) setSidebarOpen(false); }, [isMobile]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Overlay mobile (clic extérieur ferme la sidebar) */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199, backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* Barre du haut mobile (hamburger + logo) */}
      {isMobile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: '#1a3a5c', zIndex: 201, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', padding: '4px 6px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
            aria-label="Menu"
          >☰</button>
          <img src="/logo-gazdetect.svg" alt="GazDetect" style={{ height: 22, filter: 'brightness(0) invert(1)' }} />
        </div>
      )}

      <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} isMobile={isMobile} />

      <main style={{
        flex: 1,
        marginLeft: isMobile ? 0 : 240,
        padding: isMobile ? '68px 16px 32px' : '28px 32px',
        background: 'var(--bg)',
        minHeight: '100vh',
        maxWidth: isMobile ? '100vw' : `calc(100vw - 240px)`,
        overflowX: 'hidden',
      }}>
        <AlertBanner />
        {children}
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   APP ROOT
══════════════════════════════════════════════════════════ */
export default function App() {
  return (
    <AuthProvider>
      <DarkModeProvider>
        <ToastProvider>
          <BrowserRouter>
            <ImportNotifWatcher />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
              <Route path="/search" element={<ProtectedRoute><Layout><Search /></Layout></ProtectedRoute>} />
              <Route path="/favorites" element={<ProtectedRoute><Layout><Favorites /></Layout></ProtectedRoute>} />
              <Route path="/files" element={<ProtectedRoute><Layout><Files /></Layout></ProtectedRoute>} />
              <Route path="/upload" element={<ProtectedRoute adminOnly><Layout><Upload /></Layout></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute adminOnly><Layout><Users /></Layout></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </DarkModeProvider>
    </AuthProvider>
  );
}
