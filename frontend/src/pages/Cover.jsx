import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

const sites = [
  { mark: 'MT', name: 'Mytek',      price: '3 499', color: '#6366F1', best: true },
  { mark: 'SP', name: 'Spacenet',   price: '3 599', color: '#0D9488' },
  { mark: 'TN', name: 'Tunisianet', price: '3 699', color: '#F59E0B', promo: true },
  { mark: 'CR', name: 'Carrefour',  price: '3 799', color: '#EF4444' },
  { mark: 'AZ', name: 'Aziza',      price: '3 899', color: '#8B5CF6', out: true },
]

const spark = [3760,3740,3755,3720,3700,3710,3680,3650,3660,3620,3590,3560,3540,3520,3499]
const sparkPath = (() => {
  const w = 300, h = 46, min = 3480, max = 3780
  return spark.map((v, i) => {
    const x = (i / (spark.length - 1)) * w
    const y = h - ((v - min) / (max - min)) * h
    return (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ')
})()

export default function Cover() {
  const { token, user } = useAuthStore()
  const navigate = useNavigate()

  if (token) {
    return <Navigate to={user?.role === 'ADMIN' ? '/admin' : '/tenant/dashboard'} replace />
  }

  return (
    <>
      <style>{`
        @keyframes pw-ping {
          75%, 100% { transform: scale(2.4); opacity: 0; }
        }
        .pw-ping-dot { animation: pw-ping 2s cubic-bezier(0,0,.2,1) infinite; }
        @media (prefers-reduced-motion: reduce) { .pw-ping-dot { animation: none; } }
        .pw-cover-navlink { cursor: pointer; transition: color .15s; }
        .pw-cover-navlink:hover { color: var(--pw-slate-900) !important; }
        .pw-cover-cta:hover { background: var(--pw-indigo-600) !important; }
      `}</style>

      <div style={{
        width: '100%', minHeight: '100vh',
        background: '#FBFCFE', color: 'var(--pw-slate-900)',
        fontFamily: 'var(--pw-font-sans)',
        position: 'relative', overflow: 'hidden',
        WebkitFontSmoothing: 'antialiased',
      }}>
        {/* Indigo bloom — top right */}
        <div style={{
          position: 'absolute', top: -180, right: -120,
          width: 620, height: 620, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,.10) 0%, transparent 62%)',
          filter: 'blur(20px)', pointerEvents: 'none',
        }} />
        {/* Teal bloom — bottom left */}
        <div style={{
          position: 'absolute', bottom: -200, left: -140,
          width: 520, height: 520, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(13,148,136,.09) 0%, transparent 62%)',
          filter: 'blur(20px)', pointerEvents: 'none',
        }} />
        {/* Dotted grid */}
        <div style={{
          position: 'absolute', inset: 0, opacity: .5, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle at center, rgba(148,163,184,.18) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'radial-gradient(circle at 70% 45%, #000 0%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle at 70% 45%, #000 0%, transparent 72%)',
        }} />

        {/* ── Top nav ── */}
        <div style={{
          position: 'relative', zIndex: 2,
          display: 'flex', alignItems: 'center', gap: 13,
          padding: '34px 60px 0',
        }}>
          {/* Logo */}
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366F1 0%, #0D9488 100%)',
            display: 'grid', placeItems: 'center',
            fontWeight: 800, fontSize: 17, color: '#fff',
            boxShadow: '0 8px 22px rgba(99,102,241,.35)',
          }}>PW</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>PriceWatch</div>
            <div style={{ fontSize: 10, color: 'var(--pw-slate-400)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
              Competitive Intelligence
            </div>
          </div>

          {/* Right nav */}
          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 22,
            fontSize: 13, color: 'var(--pw-slate-500)', fontWeight: 500,
          }}>
            <span className="pw-cover-navlink" style={{ color: 'var(--pw-slate-500)' }}>Plateforme</span>
            <span className="pw-cover-navlink" style={{ color: 'var(--pw-slate-500)' }}>Tarifs</span>
            <span className="pw-cover-navlink" style={{ color: 'var(--pw-slate-500)' }}>Documentation</span>
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '9px 18px', borderRadius: 9,
                background: 'var(--pw-slate-900)', color: '#fff',
                fontWeight: 600, fontSize: 12.5, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'opacity .15s',
              }}
            >Se connecter</button>
          </div>
        </div>

        {/* ── Body: two-column grid ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'grid', gridTemplateColumns: '1fr 1.02fr',
          alignItems: 'center', gap: 40,
          padding: '0 60px',
          height: 'calc(100vh - 122px)',
          minHeight: 520,
        }}>

          {/* Left: editorial */}
          <div>
            {/* Live status chip */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              padding: '6px 13px', borderRadius: 999,
              background: '#fff', border: '1px solid var(--pw-border)',
              boxShadow: '0 1px 2px rgba(15,23,42,.04)',
              marginBottom: 26,
            }}>
              <span style={{ position: 'relative', width: 7, height: 7, display: 'inline-block', flexShrink: 0 }}>
                <span className="pw-ping-dot" style={{
                  position: 'absolute', inset: 0, borderRadius: '50%', background: '#34D399',
                }} />
                <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#10B981' }} />
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--pw-slate-600)', fontWeight: 600, letterSpacing: '.03em' }}>
                Collecte en direct · 6 sites tunisiens
              </span>
            </div>

            {/* Headline */}
            <h1 style={{ margin: 0, fontSize: 58, fontWeight: 800, letterSpacing: '-.045em', lineHeight: 0.98, color: 'var(--pw-slate-900)' }}>
              Le marché,<br />
              <span style={{ fontStyle: 'italic', fontWeight: 700, color: 'var(--pw-indigo)' }}>en direct.</span>
            </h1>

            {/* Sub-paragraph */}
            <p style={{ fontSize: 16.5, color: 'var(--pw-slate-500)', maxWidth: 430, lineHeight: 1.55, marginTop: 22 }}>
              PriceWatch suit les prix, promotions et ruptures de vos concurrents en continu.
              Vous savez à la seconde où agir — et vous reprenez l'avantage.
            </p>

            {/* CTA row */}
            <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 18 }}>
              <button
                onClick={() => navigate('/login')}
                className="pw-cover-cta"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 9,
                  padding: '14px 26px', borderRadius: 11,
                  background: 'var(--pw-indigo)', color: '#fff',
                  fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit',
                  border: 'none', cursor: 'pointer',
                  letterSpacing: '-.01em', boxShadow: '0 8px 22px rgba(67,56,202,.28)',
                }}
              >
                Se connecter
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6"/>
                </svg>
              </button>
              <button style={{
                display: 'inline-flex', alignItems: 'center', gap: 9,
                fontSize: 14, fontWeight: 600, color: 'var(--pw-slate-700)',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <span style={{
                  width: 34, height: 34, borderRadius: '50%',
                  border: '1px solid var(--pw-border)', background: '#fff',
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--pw-slate-700)"><path d="M8 5v14l11-7z"/></svg>
                </span>
                Voir la démo
              </button>
            </div>

            {/* Sites cluster */}
            <div style={{ marginTop: 40 }}>
              <div style={{ fontSize: 10.5, color: 'var(--pw-slate-400)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>
                Sites surveillés
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  ['MT','Mytek','#6366F1'],
                  ['SP','Spacenet','#0D9488'],
                  ['TN','Tunisianet','#F59E0B'],
                  ['CR','Carrefour','#EF4444'],
                  ['AZ','Aziza','#8B5CF6'],
                  ['GT','Géant','#06B6D4'],
                ].map(([mark, name, color]) => (
                  <div key={name} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 12px 6px 6px', borderRadius: 999,
                    background: '#fff', border: '1px solid var(--pw-border)',
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 6, background: color,
                      color: '#fff', display: 'grid', placeItems: 'center',
                      fontSize: 7.5, fontWeight: 700, fontFamily: 'var(--pw-font-mono)',
                    }}>{mark}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--pw-slate-700)' }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: market board */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 460, borderRadius: 20,
              background: '#fff', border: '1px solid var(--pw-border)',
              boxShadow: '0 40px 80px -28px rgba(15,23,42,.28), 0 0 0 1px rgba(15,23,42,.02)',
              overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--pw-border)', display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 11,
                  background: 'var(--pw-slate-100)',
                  display: 'grid', placeItems: 'center',
                  fontSize: 9, color: 'var(--pw-slate-400)', fontFamily: 'var(--pw-font-mono)',
                }}>IMG</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>Apple iPhone 15 128 Go</div>
                  <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)' }}>Smartphones · 5 sites surveillés</div>
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 9.5, fontWeight: 700, padding: '4px 8px',
                  borderRadius: 6, background: 'var(--pw-green-50)', color: '#047857',
                  letterSpacing: '.05em',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981' }} />
                  LIVE
                </span>
              </div>

              {/* Sparkline */}
              <div style={{ padding: '14px 20px 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 10.5, color: 'var(--pw-slate-400)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
                    Meilleur prix · 15 j
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--pw-teal)', fontWeight: 700, fontFamily: 'var(--pw-font-mono)' }}>−6.9%</span>
                </div>
                <svg width="100%" height="46" viewBox="0 0 300 46" preserveAspectRatio="none" style={{ display: 'block' }}>
                  <defs>
                    <linearGradient id="cov-spark-g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity=".18" />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={sparkPath + ' L300,46 L0,46 Z'} fill="url(#cov-spark-g)" />
                  <path d={sparkPath} fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {/* Site rows */}
              <div style={{ padding: '8px 12px 14px' }}>
                {sites.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px',
                    borderRadius: 11,
                    background: s.best ? 'var(--pw-green-50)' : 'transparent',
                    border: s.best ? '1px solid var(--pw-green-100)' : '1px solid transparent',
                    marginTop: i ? 3 : 0,
                    opacity: s.out ? .5 : 1,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, background: s.color,
                      display: 'grid', placeItems: 'center',
                      fontSize: 9, fontWeight: 700, fontFamily: 'var(--pw-font-mono)', color: '#fff',
                    }}>{s.mark}</div>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--pw-slate-800)', flex: 1 }}>{s.name}</span>
                    {s.best  && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: '#D1FAE5', color: '#047857' }}>Meilleur</span>}
                    {s.promo && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: 'var(--pw-amber-50)', color: '#92400E' }}>Promo</span>}
                    {s.out   && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: 'var(--pw-slate-100)', color: 'var(--pw-slate-500)' }}>Rupture</span>}
                    <span style={{
                      fontFamily: 'var(--pw-font-mono)', fontSize: 14, fontWeight: 700,
                      color: s.best ? '#047857' : 'var(--pw-slate-900)',
                      width: 78, textAlign: 'right',
                    }}>
                      {s.price}
                      <span style={{ fontSize: 9, color: 'var(--pw-slate-400)', marginLeft: 3 }}>TND</span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Card footer */}
              <div style={{
                padding: '12px 20px', borderTop: '1px solid var(--pw-border)',
                display: 'flex', alignItems: 'center', gap: 18,
                background: 'var(--pw-slate-50)',
              }}>
                <div>
                  <div style={{ fontSize: 9.5, color: 'var(--pw-slate-400)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Écart marché</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--pw-font-mono)', color: 'var(--pw-red)' }}>11.4%</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: 'var(--pw-slate-400)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Prix moyen</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--pw-font-mono)' }}>3 699 TND</div>
                </div>
                <button style={{
                  marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--pw-indigo)',
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  Ouvrir la fiche
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                </button>
              </div>
            </div>

            {/* Floating alert toast */}
            <div style={{
              position: 'absolute', top: 8, right: -8,
              width: 224, borderRadius: 13, padding: '12px 14px',
              background: '#fff', border: '1px solid var(--pw-border)',
              boxShadow: '0 20px 40px -14px rgba(15,23,42,.22)',
              display: 'flex', gap: 11, alignItems: 'center',
              transform: 'rotate(2deg)',
              zIndex: 2,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: 'var(--pw-teal-50)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M19 12l-7 7-7-7"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--pw-slate-900)' }}>Baisse détectée — Mytek</div>
                <div style={{ fontSize: 10.5, color: 'var(--pw-slate-500)', fontFamily: 'var(--pw-font-mono)', marginTop: 1 }}>3 699 → 3 499 · −5.4%</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom stat strip ── */}
        <div style={{
          position: 'absolute', left: 60, right: 60, bottom: 24, zIndex: 2,
          display: 'flex', alignItems: 'center', gap: 28,
          paddingTop: 16, borderTop: '1px solid var(--pw-border)',
        }}>
          {[
            ['6','Sites e-commerce'],
            ['+ 20 000','Produits suivis'],
          ].map(([num, label], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', fontFamily: 'var(--pw-font-mono)', color: 'var(--pw-slate-900)' }}>{num}</span>
              <span style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', letterSpacing: '.03em', textTransform: 'uppercase' }}>{label}</span>
              {i < 3 && <span style={{ width: 1, height: 15, background: 'var(--pw-border)', marginLeft: 20 }} />}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
