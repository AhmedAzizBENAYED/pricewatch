import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  getAlerts, getUnreadCount, markAlertRead, markAllRead,
} from '../../api/tenant'
import { EVENT_CONFIG, formatNumber, timeAgo } from '../../utils/pw'
import { SiteRow } from '../../components/pw'
import {
  IcoBell, IcoCheck, IcoArrow, IcoSearch, IcoX,
  IcoDown, IcoUp, IcoTag, IcoBox, IcoFlag,
} from '../../components/icons'
import { useToast } from '../../components/ui/Toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function TypeIcon({ type, size = 16 }) {
  if (type === 'BAISSE_PRIX')              return <IcoDown size={size} />
  if (type === 'HAUSSE_PRIX')              return <IcoUp size={size} />
  if (type === 'DEBUT_PROMOTION' || type === 'FIN_PROMOTION') return <IcoTag />
  if (type === 'RUPTURE_STOCK')            return <IcoBox />
  if (type === 'RETOUR_STOCK')             return <IcoCheck size={size} />
  if (type === 'NOUVELLE_OFFRE_DECOUVERTE') return <IcoFlag />
  return <IcoBell />
}

function dividerLabel(dateString) {
  const d = new Date(dateString)
  const today     = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  if (d.toDateString() === today)     return "Aujourd'hui"
  if (d.toDateString() === yesterday) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

function groupAlerts(alerts, tab) {
  const result = []
  const seen   = {}

  alerts.forEach(alert => {
    const key = tab === 'bytype'
      ? (EVENT_CONFIG[alert.type_evenement]?.label || alert.type_evenement)
      : dividerLabel(alert.date_creation)

    if (seen[key] === undefined) {
      seen[key] = result.length
      result.push({ label: key, items: [] })
    }
    result[seen[key]].items.push(alert)
  })
  return result
}

// ── AlertItem ─────────────────────────────────────────────────────────────────

function AlertItem({ alert, active, onClick }) {
  const cfg = EVENT_CONFIG[alert.type_evenement] || {
    color: 'var(--pw-slate-600)',
    bg:    'var(--pw-slate-100)',
  }
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 12, padding: '14px 16px',
        borderBottom: '1px solid var(--pw-border)',
        background:  active ? 'var(--pw-indigo-50)' : '#fff',
        borderLeft: `3px solid ${active ? 'var(--pw-indigo)' : 'transparent'}`,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: cfg.bg, color: cfg.color,
        display: 'grid', placeItems: 'center', flex: '0 0 32px',
      }}>
        <TypeIcon type={alert.type_evenement} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: alert.lu ? 500 : 700, color: 'var(--pw-slate-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {alert.message}
          </span>
          {!alert.lu && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pw-indigo)', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 11, color: 'var(--pw-slate-400)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {timeAgo(alert.date_creation)}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--pw-slate-600)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {alert.offre_nom}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <SiteRow slug={alert.site_slug} name={alert.site_name} />
        </div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyInbox({ navigate }) {
  return (
    <div style={{ padding: 60, textAlign: 'center', display: 'grid', placeItems: 'center', minHeight: 300 }}>
      <div style={{ maxWidth: 380 }}>
        <svg width="160" height="120" viewBox="0 0 160 120" style={{ margin: '0 auto 24px', display: 'block' }}>
          <rect x="20" y="30" width="120" height="76" rx="10" fill="#F1F5F9" />
          <rect x="20" y="30" width="120" height="20" rx="10" fill="#E0E7FF" />
          <circle cx="35" cy="40" r="3" fill="#6366F1" />
          <circle cx="48" cy="40" r="3" fill="#94A3B8" />
          <circle cx="61" cy="40" r="3" fill="#94A3B8" />
          <rect x="30" y="60" width="90" height="6" rx="3" fill="#CBD5E1" />
          <rect x="30" y="72" width="60" height="6" rx="3" fill="#CBD5E1" />
          <rect x="30" y="84" width="80" height="6" rx="3" fill="#CBD5E1" />
          <circle cx="125" cy="25" r="14" fill="#6366F1" />
          <path d="M119 25l4 4 8-9" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="pw-h2" style={{ marginBottom: 8 }}>Aucune alerte pour le moment</div>
        <div className="pw-muted" style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 20 }}>
          Toutes les alertes générées par vos règles apparaissent ici. Configurez vos premières règles pour être notifié des baisses de prix, ruptures de stock et promotions chez vos concurrents.
        </div>
        <button className="pw-btn pw-btn-primary" onClick={() => navigate('/tenant/settings/alerts')}>
          Créer une règle d&apos;alerte <IcoArrow />
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Alerts() {
  const [activeId, setActiveId] = useState(null)
  const [tab,      setTab]      = useState('all')
  const [search,   setSearch]   = useState('')

  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const { showToast } = useToast()

  const alertsQ = useQuery({
    queryKey: ['alerts-all'],
    queryFn:  () => getAlerts({ limit: 50 }),
    refetchInterval: 30000,
  })

  const unreadCountQ = useQuery({
    queryKey: ['unread-count'],
    queryFn:  getUnreadCount,
  })

  const allAlerts  = alertsQ.data?.data ?? []
  const unreadCount = unreadCountQ.data?.count ?? 0
  const active      = allAlerts.find(a => a.id === activeId) ?? null

  // Client-side filter
  const filtered = allAlerts.filter(a => {
    if (tab === 'unread' && a.lu) return false
    if (search) {
      const q = search.toLowerCase()
      const inMessage = (a.message ?? '').toLowerCase().includes(q)
      const inOffre   = (a.offre_nom ?? '').toLowerCase().includes(q)
      if (!inMessage && !inOffre) return false
    }
    return true
  })

  const groups = groupAlerts(filtered, tab)

  async function handleMarkAllRead() {
    try {
      await markAllRead()
      queryClient.invalidateQueries({ queryKey: ['alerts-all'] })
      queryClient.invalidateQueries({ queryKey: ['unread-count'] })
      showToast('Toutes les alertes marquées comme lues', 'success')
    } catch {
      showToast('Erreur lors de la mise à jour', 'danger')
    }
  }

  async function handleClickAlert(alert) {
    setActiveId(alert.id)
    if (!alert.lu) {
      // Optimistic update in cache
      queryClient.setQueryData(['alerts-all'], old => {
        if (!old?.data) return old
        return { ...old, data: old.data.map(a => a.id === alert.id ? { ...a, lu: true } : a) }
      })
      try {
        await markAlertRead(alert.id)
        queryClient.invalidateQueries({ queryKey: ['unread-count'] })
      } catch {
        // Revert on failure
        queryClient.invalidateQueries({ queryKey: ['alerts-all'] })
      }
    }
  }

  // Detail panel colors derived from event type
  const activeCfg  = active ? EVENT_CONFIG[active.type_evenement] || {} : {}
  const priceColor =
    active?.type_evenement === 'BAISSE_PRIX' ? 'var(--pw-teal)' :
    active?.type_evenement === 'HAUSSE_PRIX' ? 'var(--pw-red)'  :
    'var(--pw-slate-700)'
  const priceBg =
    active?.type_evenement === 'BAISSE_PRIX' ? 'var(--pw-teal-50)' :
    active?.type_evenement === 'HAUSSE_PRIX' ? 'var(--pw-red-50)'  :
    'transparent'
  const priceBorder =
    active?.type_evenement === 'BAISSE_PRIX' ? 'var(--pw-teal-100)' :
    active?.type_evenement === 'HAUSSE_PRIX' ? 'var(--pw-red-100)'  :
    'var(--pw-border)'
  const varColor = active?.delta_pct != null
    ? active.delta_pct < 0 ? 'var(--pw-teal)' : 'var(--pw-red)'
    : 'var(--pw-slate-700)'

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 16 }}>
        <div className="pw-h1">
          Alertes
          {unreadCount > 0 && (
            <span className="pw-pill indigo" style={{ marginLeft: 8, fontSize: 12 }}>
              {unreadCount} non lues
            </span>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            className="pw-btn pw-btn-sm"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
          >
            <IcoCheck size={12} /> Tout marquer comme lu
          </button>
          <button className="pw-btn pw-btn-sm" onClick={() => navigate('/tenant/settings/alerts')}>
            Paramètres
          </button>
        </div>
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 16 }}>

        {/* LEFT — list ─────────────────────────────────────────────────────── */}
        <div className="pw-card" style={{ overflow: 'hidden' }}>

          {/* Tabs */}
          <div className="pw-tabs" style={{ padding: '0 12px' }}>
            <div className={`tab${tab === 'all' ? ' is-active' : ''}`} onClick={() => setTab('all')}>
              Toutes
              <span className="pw-pill slate" style={{ marginLeft: 6, fontSize: 10 }}>{allAlerts.length}</span>
            </div>
            <div className={`tab${tab === 'unread' ? ' is-active' : ''}`} onClick={() => setTab('unread')}>
              Non lues
              {unreadCount > 0 && (
                <span className="pw-pill indigo" style={{ marginLeft: 6, fontSize: 10 }}>{unreadCount}</span>
              )}
            </div>
            <div className={`tab${tab === 'bytype' ? ' is-active' : ''}`} onClick={() => setTab('bytype')}>
              Par type
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--pw-border)' }}>
            <div className="pw-input" style={{ padding: '6px 10px', fontSize: 12 }}>
              <IcoSearch />
              <input
                placeholder="Filtrer les alertes..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* List body */}
          <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
            {alertsQ.isLoading ? (
              [0,1,2,3,4].map(i => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--pw-border)' }}>
                  <div className="pw-sk" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="pw-sk" style={{ height: 13, width: '70%', borderRadius: 3, marginBottom: 6 }} />
                    <div className="pw-sk" style={{ height: 11, width: '50%', borderRadius: 3, marginBottom: 6 }} />
                    <div className="pw-sk" style={{ height: 11, width: '30%', borderRadius: 3 }} />
                  </div>
                </div>
              ))
            ) : alertsQ.isError ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--pw-red)' }}>
                Erreur de chargement.{' '}
                <button className="pw-btn pw-btn-sm" onClick={() => alertsQ.refetch()}>
                  Réessayer
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyInbox navigate={navigate} />
            ) : (
              groups.map(group => (
                <div key={group.label}>
                  <div style={{
                    background: 'var(--pw-slate-50)', padding: '6px 16px',
                    fontSize: 11, fontWeight: 700, color: 'var(--pw-slate-500)',
                    textTransform: 'uppercase', letterSpacing: '.06em',
                  }}>
                    {group.label}
                  </div>
                  {group.items.map(alert => (
                    <AlertItem
                      key={alert.id}
                      alert={alert}
                      active={activeId === alert.id}
                      onClick={() => handleClickAlert(alert)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT — detail panel ────────────────────────────────────────────── */}
        <div className="pw-card" style={{ minWidth: 0, overflow: 'hidden' }}>
          {!active ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', minHeight: 400,
              gap: 12, color: 'var(--pw-slate-400)', padding: 40,
            }}>
              <IcoBell />
              <span style={{ fontSize: 14 }}>Sélectionnez une alerte pour voir les détails</span>
            </div>
          ) : (
            <>
              <div className="pw-card-head">
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: activeCfg.bg || 'var(--pw-slate-100)',
                  color:      activeCfg.color || 'var(--pw-slate-600)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <TypeIcon type={active.type_evenement} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{active.message}</div>
                  <div className="sub">
                    {timeAgo(active.date_creation)} · {activeCfg.label || active.type_evenement}
                  </div>
                </div>
                <div className="right">
                  <button
                    className="pw-icon-btn"
                    style={{ width: 30, height: 30 }}
                    onClick={() => setActiveId(null)}
                  >
                    <IcoX size={14} />
                  </button>
                </div>
              </div>

              <div className="pw-card-body">
                {/* KPI tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
                  <div className="pw-kpi" style={{ padding: 12 }}>
                    <div className="label" style={{ fontSize: 10 }}>Prix avant</div>
                    <div className="pw-mono" style={{ fontSize: 18, color: 'var(--pw-slate-500)', textDecoration: 'line-through' }}>
                      {active.valeur_avant != null ? formatNumber(active.valeur_avant) : '—'}
                    </div>
                  </div>
                  <div className="pw-kpi" style={{ padding: 12, borderColor: priceBorder, background: priceBg }}>
                    <div className="label" style={{ fontSize: 10 }}>Prix actuel</div>
                    <div className="pw-mono" style={{ fontSize: 22, color: priceColor, fontWeight: 700 }}>
                      {active.valeur_apres != null ? `${formatNumber(active.valeur_apres)} TND` : '—'}
                    </div>
                  </div>
                  <div className="pw-kpi" style={{ padding: 12 }}>
                    <div className="label" style={{ fontSize: 10 }}>Variation</div>
                    <div className="pw-mono" style={{ fontSize: 18, color: varColor, fontWeight: 700 }}>
                      {active.delta_pct != null
                        ? `${active.delta_pct > 0 ? '+' : ''}${active.delta_pct.toFixed(1)}%`
                        : '—'}
                    </div>
                  </div>
                </div>

                {/* Produit concerné */}
                <div className="pw-h3" style={{ marginBottom: 8 }}>Produit concerné</div>
                <div style={{
                  display: 'flex', gap: 12, alignItems: 'center',
                  padding: 12, border: '1px solid var(--pw-border)',
                  borderRadius: 10, marginBottom: 18,
                }}>
                  {active.image
                    ? <img src={active.image} alt="" style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 8, flexShrink: 0, background: 'var(--pw-slate-50)' }} />
                    : <div className="pw-placeholder" style={{ width: 60, height: 60, fontSize: 9, flexShrink: 0 }}>img</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {active.offre_nom}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2 }}>
                      {active.site_name}
                    </div>
                  </div>
                  <button
                    className="pw-btn pw-btn-primary pw-btn-sm"
                    onClick={() => active.offre_id
                      ? navigate('/tenant/offers/' + active.offre_id)
                      : navigate('/tenant/events')
                    }
                  >
                    Voir la fiche <IcoArrow />
                  </button>
                </div>

                {/* Comparaison marché — placeholder until alert endpoint exposes comparison data */}
                <div className="pw-h3" style={{ marginBottom: 8 }}>Comparaison marché</div>
                <div style={{
                  padding: 16, color: 'var(--pw-slate-400)', fontSize: 13,
                  textAlign: 'center', border: '1px solid var(--pw-border)', borderRadius: 8,
                }}>
                  Ouvrez la fiche produit pour voir la comparaison complète
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
