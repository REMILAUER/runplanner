// ── Auth Screen ───────────────────────────────────────────────────
// Magic Link login page. Email input → sends OTP link → confirmation.
// Uses existing style system for visual consistency.

import { useState } from 'react';
import { s } from '../styles/styles';
import { FONT, colors } from '../styles/tokens';
import { useAuth } from '../context/AuthContext';

const STATUS = { idle: 'idle', sending: 'sending', sent: 'sent', error: 'error' };

export default function AuthScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(STATUS.idle);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus(STATUS.sending);
    setErrorMsg('');
    try {
      await signIn(email.trim());
      setStatus(STATUS.sent);
    } catch (err) {
      setStatus(STATUS.error);
      setErrorMsg(err.message || 'Une erreur est survenue.');
    }
  };

  return (
    <div style={s.app}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      <div style={{ marginTop: 60, textAlign: 'center' }}>
        <div style={s.title}>RunPlanner</div>
        <div style={s.subtitle}>Planification d'entraînement course à pied</div>
      </div>

      {status === STATUS.sent ? (
        <div style={{
          marginTop: 32, padding: 16,
          border: `2px solid ${colors.success}`, borderRadius: 2,
          background: '#f0f8f0', textAlign: 'center',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, fontFamily: FONT }}>
            Lien envoyé !
          </div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6, fontFamily: FONT }}>
            Un lien de connexion a été envoyé à <strong>{email}</strong>.<br />
            Vérifiez votre boîte de réception (et vos spams).
          </div>
          <button
            style={{ ...s.btn, marginTop: 16, fontSize: 11 }}
            onClick={() => { setStatus(STATUS.idle); setEmail(''); }}
          >
            Renvoyer un lien
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ marginTop: 32 }}>
          <label style={s.label}>Adresse email</label>
          <input
            style={s.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            disabled={status === STATUS.sending}
            autoFocus
            required
          />
          {status === STATUS.error && (
            <div style={{ fontSize: 12, color: colors.error, marginBottom: 8, fontFamily: FONT }}>
              {errorMsg}
            </div>
          )}
          <button
            type="submit"
            style={{
              ...s.btnPrimary,
              width: '100%',
              padding: '10px 14px',
              fontSize: 13,
              opacity: status === STATUS.sending ? 0.6 : 1,
              cursor: status === STATUS.sending ? 'wait' : 'pointer',
            }}
            disabled={status === STATUS.sending}
          >
            {status === STATUS.sending ? 'Envoi en cours...' : 'Recevoir le lien de connexion →'}
          </button>
        </form>
      )}

      <div style={{ marginTop: 40, textAlign: 'center', fontSize: 11, color: colors.mutedLight, lineHeight: 1.6 }}>
        Pas de mot de passe nécessaire.<br />
        Un lien de connexion vous sera envoyé par email.
      </div>
    </div>
  );
}
