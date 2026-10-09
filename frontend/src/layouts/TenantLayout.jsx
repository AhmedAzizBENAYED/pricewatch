import { Fragment, useState, useEffect } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'
import {
  IcoHome, IcoSearch, IcoCalendar, IcoBell,
  IcoChart, IcoTrend, IcoReport, IcoBot, IcoUser, IcoLock, Ico,
} from '../components/icons'

const IcoLogout = () => <Ico d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />

function useUnreadCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const fetch = () =>
      client.get('/api/v1/alerts/unread-count')
        .then((r) => setCount(r.data?.count ?? 0))
        .catch(() => {})
    fetch()
    const id = setInterval(fetch, 60_000)
    return () => clearInterval(id)
  }, [])
  return count
}

const PLAN_ORDER = { BASIC: 0, MEDIUM: 1, PREMIUM: 2 }
function planLocked(minPlan, userPlan) {
  return (PLAN_ORDER[userPlan] ?? 0) < (PLAN_ORDER[minPlan] ?? 0)
}

const CRUMBS = {
  '/tenant/dashboard':       ['Tableau de bord'],
  '/tenant/products':        ['Catalogue'],
  '/tenant/events':          ['Événements'],
  '/tenant/alerts':          ['Alertes'],
  '/tenant/positioning':     ['Positionnement'],
  '/tenant/analysis':        ['Analyse marché'],
  '/tenant/reports':         ['Rapports'],
  '/tenant/assistant':       ['Assistant IA'],
  '/tenant/settings/alerts': ['Configuration', 'Alertes'],
  '/tenant/settings/scope':  ['Configuration', 'Périmètre'],
  '/tenant/profile':         ['Mon profil'],
}

const ROLE_LABEL = {
  MANAGER:          'Manager',
  RESP_MARKETING:   'Responsable',
  EQUIPE_MARKETING: 'Équipe Marketing',
}

const ROLE_CLASS = {
  MANAGER:          'mg',
  RESP_MARKETING:   'rm',
  EQUIPE_MARKETING: '',
}

function NavItem({ icon, label, to, locked, badge, sub, end: endProp }) {
  const location = useLocation()
  const isActive = endProp
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(to + '/')
  const cls = [isActive ? 'is-active' : null, sub ? 'pw-nav-sub' : null]
    .filter(Boolean).join(' ') || undefined

  return (
    <Link to={to} className={cls}>
      {!sub && <span className="pw-nav-ico">{icon}</span>}
      <span>{label}</span>
      {badge > 0 && !locked && (
        <span className="pw-pill indigo" style={{ marginLeft: 'auto' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {locked && <span className="pw-nav-lock"><IcoLock /></span>}
    </Link>
  )
}

export default function TenantLayout() {
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }
  const navigate = useNavigate()
  const location = useLocation()
  const unreadCount = useUnreadCount()

  const role    = user?.role ?? 'EQUIPE_MARKETING'
  const plan    = user?.plan_abonnement ?? 'BASIC'
  const orgName = user?.nom_organisation ?? '—'
  const userName = user?.nom ?? ''
  const initials  = userName.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  const tenantMark = orgName.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '??'

  const crumbs = CRUMBS[location.pathname] ?? ['PriceWatch']

  // ⌘K / Ctrl+K → catalogue (recherche produits)
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        navigate('/tenant/products')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  const emItems = [
    { id: 'dash', label: 'Tableau de bord',   icon: <IcoHome />,     to: '/tenant/dashboard', end: true },
    { id: 'cat',  label: 'Catalogue produits', icon: <IcoSearch />,   to: '/tenant/products' },
    { id: 'evt',  label: 'Événements',         icon: <IcoCalendar />, to: '/tenant/events' },
    { id: 'alr',  label: 'Alertes',            icon: <IcoBell />,     to: '/tenant/alerts', badge: unreadCount },
  ]

  const rmExtras = [
    { id: 'pos', label: 'Positionnement', icon: <IcoChart />,  to: '/tenant/positioning', locked: planLocked('MEDIUM', plan) },
    { id: 'mkt', label: 'Analyse marché', icon: <IcoTrend />,  to: '/tenant/analysis',   locked: planLocked('PREMIUM', plan) },
    { id: 'rpt', label: 'Rapports',       icon: <IcoReport />, to: '/tenant/reports',    locked: planLocked('MEDIUM', plan) },
    { id: 'ai',  label: 'Assistant IA',   icon: <IcoBot />,    to: '/tenant/assistant',  locked: planLocked('PREMIUM', plan) },
  ]

  const mgItems = [
    { id: 'dash', label: 'Tableau de bord', icon: <IcoHome />,   to: '/tenant/dashboard', end: true },
    { id: 'pos',  label: 'Positionnement',  icon: <IcoChart />,  to: '/tenant/positioning', locked: planLocked('MEDIUM', plan) },
    { id: 'mkt',  label: 'Analyse marché',  icon: <IcoTrend />,  to: '/tenant/analysis',   locked: planLocked('PREMIUM', plan) },
    { id: 'rpt',  label: 'Rapports',        icon: <IcoReport />, to: '/tenant/reports',    locked: planLocked('MEDIUM', plan) },
    { id: 'ai',   label: 'Assistant IA',    icon: <IcoBot />,    to: '/tenant/assistant',  locked: planLocked('PREMIUM', plan) },
  ]

  const cfgItems = [
    { id: 'cfg-a', label: 'Alertes',   to: '/tenant/settings/alerts', sub: true },
    { id: 'cfg-p', label: 'Périmètre', to: '/tenant/settings/scope',  sub: true },
  ]

  const navSets =
    role === 'MANAGER'
      ? [{ items: mgItems }]
      : role === 'RESP_MARKETING'
      ? [
          { items: emItems },
          { items: rmExtras },
          { heading: 'Configuration', items: cfgItems },
        ]
      : [{ items: emItems }]

  return (
    <div className="pw pw-frame" style={{ height: '100vh', width: '100%' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="pw-sidebar">
        <div className="pw-logo">
          <div className="pw-logo-mark">PW</div>
          <div>
            <div className="pw-logo-name">PriceWatch</div>
            <div className="pw-logo-tag">Compétitive Intelligence</div>
          </div>
        </div>

        <nav className="pw-nav">
          {navSets.map((set, i) => (
            <Fragment key={i}>
              {set.heading && <div className="pw-nav-section">{set.heading}</div>}
              {i > 0 && !set.heading && <div className="pw-nav-divider" />}
              {set.items.map((item) => (
                <NavItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  to={item.to}
                  locked={item.locked}
                  badge={item.badge}
                  sub={item.sub}
                  end={item.end}
                />
              ))}
            </Fragment>
          ))}
          <div className="pw-nav-divider" />
          <Link
            to="/tenant/profile"
            className={location.pathname === '/tenant/profile' ? 'is-active' : undefined}
          >
            <span className="pw-nav-ico"><IcoUser /></span>
            <span>Mon profil</span>
          </Link>
        </nav>

        <div className="pw-sidebar-foot">
          <div className="pw-avatar">{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="who" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userName || '—'}
            </div>
            <div className="role">{ROLE_LABEL[role] ?? role}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Se déconnecter"
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              padding: 6, borderRadius: 6, color: 'var(--pw-slate-400)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--pw-slate-200)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--pw-slate-400)'}
          >
            <IcoLogout />
          </button>
        </div>
      </aside>

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header className="pw-topbar">
        <div className="pw-crumbs">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="sep">/</span>}
              <span className={i === crumbs.length - 1 ? 'now' : ''}>{c}</span>
            </Fragment>
          ))}
        </div>

        <div
          className="pw-topbar-search"
          onClick={() => navigate('/tenant/products')}
          style={{ cursor: 'pointer' }}
          title="Ouvrir le catalogue (Ctrl+K)"
        >
          <IcoSearch />
          <span>Rechercher un produit, une marque, une catégorie…</span>
          <kbd>⌘ K</kbd>
        </div>

        <div className="pw-topbar-actions">
          <div className="pw-tenant">
            <div className="org-mark">{tenantMark}</div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--pw-slate-900)', fontSize: 12, lineHeight: 1.1 }}>
                {orgName}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--pw-slate-500)' }}>Plan {plan}</div>
            </div>
          </div>
          <span className={`pw-role-badge ${ROLE_CLASS[role] ?? ''}`}>
            {ROLE_LABEL[role] ?? role}
          </span>
          <button
            className="pw-icon-btn"
            onClick={() => navigate('/tenant/alerts')}
            title="Alertes"
          >
            <IcoBell />
            {unreadCount > 0 && <span className="dot" />}
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="pw-main" style={{ overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
