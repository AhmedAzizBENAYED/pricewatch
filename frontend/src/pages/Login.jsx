import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { login as loginApi, getMe } from '../api/auth'

const Spinner = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    style={{ animation: 'pw-login-spin .7s linear infinite', flexShrink: 0 }}
    aria-hidden="true">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const { token, user, login: storeLogin } = useAuthStore()
  const navigate = useNavigate()

  if (token) {
    return <Navigate to={user?.role === 'ADMIN' ? '/admin' : '/tenant/dashboard'} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const data = await loginApi(email, password)
      localStorage.setItem('pfe_token', data.access_token)
      const fullUser = await getMe()
      storeLogin(data.access_token, fullUser)
      navigate(fullUser?.role === 'ADMIN' ? '/admin' : '/tenant/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Email ou mot de passe incorrect')
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes pw-login-spin { to { transform: rotate(360deg); } }

        .pw-login-field {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 12px 14px;
          border-radius: 11px;
          border: 1.5px solid var(--pw-border);
          background: #FCFCFD;
          font-size: 14px;
          transition: border-color .15s, box-shadow .15s, background .15s;
        }
        .pw-login-field:focus-within {
          border-color: var(--pw-indigo);
          box-shadow: 0 0 0 4px rgba(99,102,241,.10);
          background: #fff;
        }
        .pw-login-field input {
          border: none;
          outline: none;
          flex: 1;
          font-family: var(--pw-font-sans);
          font-size: 14px;
          color: var(--pw-slate-900);
          background: transparent;
          min-width: 0;
        }
        .pw-login-field input::placeholder { color: var(--pw-slate-400); }

        .pw-login-submit { transition: background .15s; }
        .pw-login-submit:hover:not(:disabled) { background: var(--pw-indigo-600) !important; }

        .pw-login-sso { transition: background .15s; }
        .pw-login-sso:hover { background: var(--pw-slate-50) !important; }

        @media (max-width: 480px) {
          .pw-login-card { width: calc(100vw - 32px) !important; }
        }
      `}</style>

      <div style={{
        width: '100%', minHeight: '100vh',
        fontFamily: 'var(--pw-font-sans)',
        background: '#FBFCFE',
        position: 'relative', overflow: 'hidden',
        display: 'grid', placeItems: 'center',
        WebkitFontSmoothing: 'antialiased',
      }}>
        {/* Indigo bloom — top-center */}
        <div style={{
          position: 'absolute', top: -160, left: '50%', transform: 'translateX(-50%)',
          width: 900, height: 480, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,.10) 0%, transparent 65%)',
          filter: 'blur(20px)', pointerEvents: 'none',
        }} />
        {/* Teal bloom — bottom right */}
        <div style={{
          position: 'absolute', bottom: -180, right: -60,
          width: 460, height: 460, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(13,148,136,.08) 0%, transparent 64%)',
          filter: 'blur(20px)', pointerEvents: 'none',
        }} />
        {/* Dotted grid */}
        <div style={{
          position: 'absolute', inset: 0, opacity: .55, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at center, rgba(148,163,184,.16) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'radial-gradient(circle at 50% 38%, #000 0%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 38%, #000 0%, transparent 70%)',
        }} />

        {/* Brand — top left */}
        <div style={{ position: 'absolute', top: 32, left: 40, zIndex: 2, display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366F1 0%, #0D9488 100%)',
            display: 'grid', placeItems: 'center',
            fontWeight: 800, fontSize: 15, color: '#fff',
            boxShadow: '0 6px 18px rgba(99,102,241,.32)',
          }}>PW</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em' }}>PriceWatch</div>
            <div style={{ fontSize: 9.5, color: 'var(--pw-slate-400)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
              Competitive Intelligence
            </div>
          </div>
        </div>

        {/* Helper — top right */}
        <div style={{ position: 'absolute', top: 36, right: 40, zIndex: 2, fontSize: 12.5, color: 'var(--pw-slate-500)' }}>
          Pas encore client ?{' '}
          <span style={{ color: 'var(--pw-indigo)', fontWeight: 600, cursor: 'pointer' }}>Demander un accès</span>
        </div>

        {/* ── Card ── */}
        <div className="pw-login-card" style={{ position: 'relative', zIndex: 1, width: 420 }}>

          {/* Gradient accent bar */}
          <div style={{
            height: 4, borderRadius: '14px 14px 0 0',
            background: 'linear-gradient(90deg, #6366F1 0%, #0D9488 100%)',
            margin: '0 18px',
          }} />

          <div style={{
            background: '#fff', borderRadius: 18,
            border: '1px solid var(--pw-border)',
            boxShadow: '0 30px 70px -24px rgba(15,23,42,.22), 0 2px 6px rgba(15,23,42,.04)',
            padding: '36px 40px 32px',
            marginTop: -2,
          }}>
            {/* Error banner */}
            {error && (
              <div style={{
                marginBottom: 20, padding: '12px 16px',
                background: 'var(--pw-red-50)', border: '1px solid var(--pw-red-100)',
                borderRadius: 10, fontSize: 13.5, color: '#991B1B', lineHeight: 1.4,
              }}>
                {error}
              </div>
            )}

            {/* Heading */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h2 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: '-.025em', color: 'var(--pw-slate-900)' }}>
                Bon retour 👋
              </h2>
              <p style={{ margin: '7px 0 0', fontSize: 13.5, color: 'var(--pw-slate-500)', lineHeight: 1.5 }}>
                Connectez-vous à votre espace de veille concurrentielle.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Email */}
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--pw-slate-700)', marginBottom: 7 }}>
                    Email professionnel
                  </label>
                  <div className="pw-login-field">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2 8 5 8-5"/>
                    </svg>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="yasmine.khelifa@tunisie-telecom.tn"
                      required
                      autoFocus
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 7 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--pw-slate-700)' }}>Mot de passe</label>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--pw-indigo)', fontWeight: 600, cursor: 'pointer' }}>
                      Oublié ?
                    </span>
                  </div>
                  <div className="pw-login-field">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pw-indigo)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M6 11h12v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9ZM9 11V8a3 3 0 0 1 6 0v3"/>
                    </svg>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />
                    <span
                      onClick={() => setShowPwd(v => !v)}
                      style={{ color: 'var(--pw-slate-400)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                    >
                      {showPwd ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.08 10.08 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
                        </svg>
                      )}
                    </span>
                  </div>
                </div>

                {/* Remember me — custom checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    onClick={() => setRemember(v => !v)}
                    style={{
                      width: 18, height: 18, borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                      background: remember ? 'var(--pw-indigo)' : '#fff',
                      border: `1px solid ${remember ? 'var(--pw-indigo)' : 'var(--pw-border)'}`,
                      display: 'grid', placeItems: 'center',
                      transition: 'background .15s, border-color .15s',
                    }}
                  >
                    {remember && (
                      <svg width="11" height="11" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span
                    onClick={() => setRemember(v => !v)}
                    style={{ fontSize: 13, color: 'var(--pw-slate-600)', cursor: 'pointer', userSelect: 'none' }}
                  >
                    Rester connecté sur cet appareil
                  </span>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="pw-login-submit"
                  style={{
                    width: '100%', padding: '14px 20px',
                    background: 'var(--pw-indigo)', color: '#fff',
                    border: 0, borderRadius: 11, fontSize: 14.5, fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 8px 22px rgba(67,56,202,.28)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    letterSpacing: '-.01em', marginTop: 2,
                    opacity: loading ? .7 : 1,
                  }}
                >
                  {loading ? (
                    <>
                      <Spinner />
                      Connexion en cours…
                    </>
                  ) : (
                    <>
                      Se connecter
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6"/>
                      </svg>
                    </>
                  )}
                </button>

                {/* OR divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '2px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--pw-border)' }} />
                  <span style={{ fontSize: 11, color: 'var(--pw-slate-400)', textTransform: 'uppercase', letterSpacing: '.08em' }}>ou</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--pw-border)' }} />
                </div>

                {/* SSO */}
                <button
                  type="button"
                  className="pw-login-sso"
                  style={{
                    width: '100%', padding: '12px 20px',
                    background: '#fff', color: 'var(--pw-slate-700)',
                    border: '1.5px solid var(--pw-border)', borderRadius: 11,
                    fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pw-slate-500)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8.5 3a8.5 8.5 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a8.4 8.4 0 0 0-2.3-1.3L15.5 3h-4l-.3 2.4a8.4 8.4 0 0 0-2.3 1.3l-2.3-.9-2 3.4 2 1.5a8.5 8.5 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9c.7.5 1.5 1 2.3 1.3l.3 2.4h4l.3-2.4c.8-.3 1.6-.8 2.3-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3Z"/>
                  </svg>
                  Connexion SSO / SAML entreprise
                </button>

              </div>
            </form>
          </div>

          {/* Trust footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 11, color: 'var(--pw-slate-400)', marginTop: 18,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>
            </svg>
            Connexion chiffrée · Conforme RGPD · © 2026 PriceWatch
          </div>
        </div>
      </div>
    </>
  )
}
