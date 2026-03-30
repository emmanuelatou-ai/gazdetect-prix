import { useState, useRef, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useDarkMode } from '../App';

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 24, marginBottom: 20, boxShadow: 'var(--shadow)' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)', marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>{title}</h2>
      {children}
    </div>
  );
}

function Alert({ type, text }) {
  if (!text) return null;
  const styles = {
    success: { bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46' },
    error:   { bg: '#fee2e2', border: '#fecaca', color: '#991b1b' },
  };
  const s = styles[type];
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13.5, color: s.color, fontWeight: 500 }}>
      {type === 'success' ? '✅' : '❌'} {text}
    </div>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { dark, setDark } = useDarkMode();
  const fileRef = useRef(null);

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || null);
  const [displayName, setDisplayName]     = useState(user?.display_name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileAlert, setProfileAlert]   = useState(null);

  // Mot de passe
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd]         = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd]   = useState(false);
  const [pwdAlert, setPwdAlert]     = useState(null);

  // Historique recherches
  const [history, setHistory]     = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);

  useEffect(() => {
    api.get('/products/search-history')
      .then(r => setHistory(r.data))
      .catch(() => {})
      .finally(() => setLoadingHist(false));
  }, []);

  const handleAvatarFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setProfileAlert({ type: 'error', text: 'Image trop grande (2 Mo max)' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileAlert(null);
    try {
      const { data } = await api.patch('/auth/profile', { avatar: avatarPreview, display_name: displayName });
      updateUser({ avatar: data.avatar, display_name: data.display_name });
      setProfileAlert({ type: 'success', text: 'Profil mis à jour !' });
    } catch (err) {
      setProfileAlert({ type: 'error', text: err.response?.data?.error || 'Erreur lors de la sauvegarde' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) { setPwdAlert({ type: 'error', text: 'Tous les champs sont requis' }); return; }
    if (newPwd !== confirmPwd) { setPwdAlert({ type: 'error', text: 'Les nouveaux mots de passe ne correspondent pas' }); return; }
    if (newPwd.length < 6) { setPwdAlert({ type: 'error', text: 'Le mot de passe doit faire au moins 6 caractères' }); return; }
    setSavingPwd(true); setPwdAlert(null);
    try {
      await api.patch('/auth/password', { current_password: currentPwd, new_password: newPwd });
      setPwdAlert({ type: 'success', text: 'Mot de passe modifié avec succès !' });
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      setPwdAlert({ type: 'error', text: err.response?.data?.error || 'Erreur lors du changement' });
    } finally {
      setSavingPwd(false);
    }
  };

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13.5, outline: 'none', boxSizing: 'border-box', color: 'var(--text)', background: 'var(--card)' };
  const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };
  const btnGreen   = { padding: '9px 20px', background: '#1d9e75', color: 'white', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
  const btnGray    = { padding: '9px 20px', background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 580 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>👤 Mon profil</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>{user?.email} · <span style={{ textTransform: 'capitalize' }}>{user?.role}</span></p>
      </div>

      {/* ── Apparence (dark mode) ── */}
      <Section title="🎨 Apparence">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>
              {dark ? '🌙 Mode sombre activé' : '☀️ Mode clair activé'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Préférence sauvegardée automatiquement</div>
          </div>
          {/* Toggle switch */}
          <button
            onClick={() => setDark(d => !d)}
            style={{
              position: 'relative', width: 52, height: 28, borderRadius: 14,
              background: dark ? '#1d9e75' : '#cbd5e1',
              border: 'none', cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: dark ? 27 : 3,
              width: 22, height: 22, borderRadius: '50%', background: 'white',
              transition: 'left 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
      </Section>

      {/* ── Avatar + Nom ── */}
      <Section title="🖼️ Photo de profil & nom affiché">
        <Alert type={profileAlert?.type} text={profileAlert?.text} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <div
            onClick={() => fileRef.current?.click()}
            title="Cliquer pour changer la photo"
            style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', background: '#1d9e75', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, border: '3px solid var(--border)' }}
          >
            {avatarPreview
              ? <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 28, fontWeight: 700, color: 'white' }}>{user?.email?.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div>
            <button onClick={() => fileRef.current?.click()} style={{ ...btnGray, display: 'block', marginBottom: 6 }}>
              📷 Choisir une photo
            </button>
            {avatarPreview && (
              <button onClick={() => setAvatarPreview(null)} style={{ ...btnGray, fontSize: 12, color: '#dc2626', borderColor: '#fecaca' }}>
                🗑 Supprimer la photo
              </button>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 4 }}>JPG, PNG — 2 Mo max</div>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={handleAvatarFile} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Nom affiché</label>
          <input
            type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder={`Ex : ${user?.email?.split('@')[0]}`}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = '#1d9e75'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 4 }}>Visible dans la barre de navigation</div>
        </div>
        <button onClick={handleSaveProfile} disabled={savingProfile} style={{ ...btnGreen, opacity: savingProfile ? 0.6 : 1 }}>
          {savingProfile ? 'Sauvegarde…' : '💾 Enregistrer'}
        </button>
      </Section>

      {/* ── Mot de passe ── */}
      <Section title="🔒 Changer le mot de passe">
        <Alert type={pwdAlert?.type} text={pwdAlert?.text} />
        {[
          ['Mot de passe actuel', currentPwd, setCurrentPwd],
          ['Nouveau mot de passe', newPwd, setNewPwd],
          ['Confirmer le nouveau mot de passe', confirmPwd, setConfirmPwd],
        ].map(([label, val, setter]) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{label}</label>
            <input
              type="password" value={val} onChange={e => setter(e.target.value)}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#1d9e75'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
        ))}
        <button onClick={handleChangePassword} disabled={savingPwd} style={{ ...btnGreen, opacity: savingPwd ? 0.6 : 1 }}>
          {savingPwd ? 'Modification…' : '🔑 Modifier le mot de passe'}
        </button>
      </Section>

      {/* ── Historique des recherches ── */}
      <Section title="🕐 Mes 20 dernières recherches">
        {loadingHist ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</div>
        ) : history.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            Aucune recherche enregistrée.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13 }}>🔍</span>
                  <span style={{ fontWeight: 500, fontSize: 13.5, color: 'var(--text)' }}>{h.query}</span>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>{h.results_count} résultat(s)</span>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-light)', whiteSpace: 'nowrap', marginLeft: 8 }}>{formatDate(h.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
