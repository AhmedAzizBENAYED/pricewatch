import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import { getOverview, getEvents, getAlerts, getProducts, getPositioning, getRuptures, getRiskCategories, getDashboardTrends } from '../../api/tenant/index'
import { timeAgo, formatNumber, groupByCategory, EVENT_CONFIG } from '../../utils/pw'
import { SiteRow, PriceChange, Sparkline, BubbleChart, GaugeBig, CompetitiveBars } from '../../components/pw'
import {
  IcoSearch, IcoArrow, IcoChevR, IcoClock,
  IcoUp, IcoDown, IcoTag, IcoBox, IcoFlag, IcoBell, IcoLightning, IcoSparkles,
} from '../../components/icons'

// ── Event type icon ───────────────────────────────────────────────────────────

function EvtIcon({ type, size = 14 }) {
  if (type === 'drop')  return <IcoDown size={size} />
  if (type === 'rise')  return <IcoUp   size={size} />
  if (type === 'promo') return <IcoTag />
  if (type === 'stock') return <IcoBox />
  if (type === 'back')  return <IcoBox />
  if (type === 'new')   return <IcoFlag />
  return null
}

// ── Dot config per event type ─────────────────────────────────────────────────

const EVT_DOT = {
  drop:  { c: 'var(--pw-teal)',      bg: 'var(--pw-teal-50)' },
  rise:  { c: 'var(--pw-red)',       bg: 'var(--pw-red-50)' },
  promo: { c: 'var(--pw-amber)',     bg: 'var(--pw-amber-50)' },
  stock: { c: 'var(--pw-slate-600)', bg: 'var(--pw-slate-100)' },
  back:  { c: 'var(--pw-green)',     bg: 'var(--pw-green-50)' },
  new:   { c: 'var(--pw-indigo)',    bg: 'var(--pw-indigo-50)' },
}
const FALLBACK_DOT = { c: 'var(--pw-slate-600)', bg: 'var(--pw-slate-100)' }

// ── KPI tile ──────────────────────────────────────────────────────────────────

const TONE_MAP = {
  indigo: { bg: 'var(--pw-indigo-50)', c: 'var(--pw-indigo)' },
  teal:   { bg: 'var(--pw-teal-50)',   c: 'var(--pw-teal)' },
  amber:  { bg: 'var(--pw-amber-50)',  c: 'var(--pw-amber)' },
  red:    { bg: 'var(--pw-red-50)',    c: 'var(--pw-red)' },
  slate:  { bg: 'var(--pw-slate-100)', c: 'var(--pw-slate-600)' },
}

function ActivityTile({ icon, label, value, delta, tone = 'slate' }) {
  const t = TONE_MAP[tone]
  return (
    <div className="pw-kpi">
      <div className="label">
        <span style={{ width: 26, height: 26, borderRadius: 7, background: t.bg, color: t.c, display: 'grid', placeItems: 'center' }}>
          {icon}
        </span>
        {label}
      </div>
      <div className="value">{value ?? '—'}</div>
      <div className="delta" style={{ color: 'var(--pw-slate-500)' }}>{delta}</div>
    </div>
  )
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function SkRow({ wide = false }) {
  const sz = wide ? 32 : 28
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid var(--pw-border)' }}>
      <div className="pw-sk" style={{ width: sz, height: sz, borderRadius: wide ? 8 : 7, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="pw-sk" style={{ height: 13, width: '60%', borderRadius: 4 }} />
        <div className="pw-sk" style={{ height: 11, width: '38%', borderRadius: 4 }} />
      </div>
      <div className="pw-sk" style={{ height: 12, width: 56, borderRadius: 4 }} />
    </div>
  )
}

// ── Change cell for event row ─────────────────────────────────────────────────

function renderChange(evt) {
  const type = EVENT_CONFIG[evt.type_evenement]?.type

  if ((type === 'drop' || type === 'rise') && evt.valeur_avant != null && evt.valeur_apres != null) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span className="pw-mono">
          {formatNumber(evt.valeur_avant)} → {formatNumber(evt.valeur_apres)}
        </span>
        {evt.delta_pct != null && (
          <PriceChange pct={evt.delta_pct} abs={Math.abs(evt.delta_absolu ?? (evt.valeur_apres - evt.valeur_avant))} />
        )}
      </span>
    )
  }
  if (type === 'promo') {
    return (
      <span className="pw-pill amber">
        <IcoTag />
        {evt.delta_pct != null ? `${Math.round(evt.delta_pct)}%` : 'Promo'}
      </span>
    )
  }
  if (type === 'stock') return <span className="pw-stock out">Rupture</span>
  if (type === 'back')  return <span className="pw-stock in">En stock</span>
  if (type === 'new')   return <span className="pw-pill indigo">Nouveau</span>
  return null
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event }) {
  const type = EVENT_CONFIG[event.type_evenement]?.type ?? 'new'
  const dot  = EVT_DOT[type] ?? FALLBACK_DOT

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid var(--pw-border)' }}>
      <span style={{ width: 32, height: 32, borderRadius: 8, background: dot.bg, color: dot.c, display: 'grid', placeItems: 'center', flex: '0 0 32px' }}>
        <EvtIcon type={type} size={14} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--pw-slate-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {event.offre_nom || '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
          <SiteRow slug={event.site_slug} name={event.site_name} />
          <span style={{ color: 'var(--pw-slate-400)' }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--pw-slate-500)' }}>
            {timeAgo(event.date_detection)}
          </span>
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 12.5, flexShrink: 0 }}>
        {renderChange(event)}
      </div>
    </div>
  )
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert }) {
  const type   = EVENT_CONFIG[alert.type_evenement]?.type ?? 'new'
  const dot    = EVT_DOT[type] ?? FALLBACK_DOT
  const unread = !alert.lu

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--pw-border)' }}>
      <span style={{ width: 28, height: 28, borderRadius: 7, background: dot.bg, color: dot.c, display: 'grid', placeItems: 'center', flex: '0 0 28px' }}>
        <EvtIcon type={type} size={14} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--pw-slate-900)', fontWeight: unread ? 600 : 500 }}>
          {alert.message || 'Alerte'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
            {alert.offre_nom || '—'}
          </span>
          <span style={{ color: 'var(--pw-slate-300)' }}>·</span>
          <SiteRow slug={alert.site_slug} name={alert.site_name} />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--pw-slate-400)' }}>
          {timeAgo(alert.date_creation)}
        </div>
        {unread && (
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--pw-indigo)', marginTop: 6 }} />
        )}
      </div>
    </div>
  )
}

// ── Quick search ──────────────────────────────────────────────────────────────

function QuickSearch() {
  const navigate        = useNavigate()
  const [input, setInput] = useState('')
  const [q, setQ]         = useState('')
  const [open, setOpen]   = useState(false)
  const blurRef           = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(input), 400)
    return () => clearTimeout(t)
  }, [input])

  const searchQ = useQuery({
    queryKey: ['products-search', q],
    queryFn:  () => getProducts({ q, limit: 5 }),
    enabled:  q.length >= 2,
  })

  const results  = searchQ.data?.data ?? []
  const showDrop = open && q.length >= 2 && (searchQ.isFetching || results.length > 0)

  const pick = (id) => {
    clearTimeout(blurRef.current)
    setOpen(false)
    navigate(`/tenant/products/${id}`)
  }

  return (
    <div style={{ marginBottom: showDrop ? 0 : 18, position: 'relative' }}>
      <div className="pw-input lg" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.04)' }}>
        <IcoSearch />
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurRef.current = setTimeout(() => setOpen(false), 200) }}
          placeholder="Rechercher un produit, une marque, une référence…"
        />
        {!searchQ.isFetching && results.length > 0 && q.length >= 2 && (
          <span style={{ color: 'var(--pw-slate-400)', fontSize: 12, whiteSpace: 'nowrap' }}>
            {results.length} résultat{results.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {showDrop && (
        <div className="pw-card" style={{ marginTop: -1, marginBottom: 18, position: 'absolute', left: 0, right: 0, zIndex: 10, boxShadow: 'var(--pw-shadow-lg)' }}>
          {searchQ.isFetching
            ? [0, 1, 2].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--pw-border)' : 0 }}>
                  <div className="pw-sk" style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div className="pw-sk" style={{ height: 12, width: '55%', borderRadius: 4 }} />
                    <div className="pw-sk" style={{ height: 10, width: '35%', borderRadius: 4 }} />
                  </div>
                </div>
              ))
            : results.map((p, i) => (
                <div
                  key={p.id ?? i}
                  onClick={() => pick(p.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--pw-border)' : 0, cursor: 'pointer', background: i === 0 ? 'var(--pw-indigo-50)' : '#fff' }}
                  onMouseEnter={e => { if (i > 0) e.currentTarget.style.background = 'var(--pw-slate-50)' }}
                  onMouseLeave={e => { if (i > 0) e.currentTarget.style.background = '#fff' }}
                >
                  {p.image
                    ? <img src={p.image} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
                    : <div className="pw-placeholder" style={{ width: 36, height: 36, fontSize: 9, flexShrink: 0 }}>img</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.nom_produit}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--pw-slate-500)' }}>
                      {[p.marque, p.categorie_nom, p.nb_sites != null ? `Sur ${p.nb_sites} site${p.nb_sites > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {(p.prix_min != null || p.prix_max != null) && (
                    <div className="pw-mono" style={{ fontSize: 13, flexShrink: 0 }}>
                      {formatNumber(p.prix_min)} – {formatNumber(p.prix_max)} TND
                    </div>
                  )}
                  <IcoChevR />
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}

// ── DashboardEM ───────────────────────────────────────────────────────────────

function deltaTxt(delta, total7j) {
  if (!delta) return 'Stable vs hier'
  if (delta > 0) {
    const hier = Math.max(1, total7j - delta)
    const pct  = Math.round(delta / hier * 100)
    return `↑ ${delta} vs hier (+${pct}%)`
  }
  return `↓ ${Math.abs(delta)} vs hier`
}

function DashboardEM() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const firstName = user?.nom?.split(' ')[0] ?? user?.nom ?? ''

  const overviewQ = useQuery({
    queryKey: ['overview'],
    queryFn:  getOverview,
    refetchInterval: 60000,
  })

  const eventsQ = useQuery({
    queryKey: ['events', { limit: 8 }],
    queryFn:  () => getEvents({ limit: 8 }),
  })

  const alertsQ = useQuery({
    queryKey: ['alerts-inbox'],
    queryFn:  () => getAlerts({ limit: 5, lu: false }),
  })

  const ov         = overviewQ.data
  const eventsList = eventsQ.data?.data   ?? []
  const alertsList = alertsQ.data?.data   ?? []
  const totalEvts  = eventsQ.data?.meta?.total

  return (
    <>
      {/* ── Welcome header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 18 }}>
        <div>
          <div className="pw-h1">Bonjour {firstName} 👋</div>
          <div className="pw-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Voici l'activité concurrentielle de{' '}
            <strong style={{ color: 'var(--pw-slate-700)' }}>
              {user?.nom_organisation ?? '—'}
            </strong>{' '}
            depuis hier.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="pw-pill">
            <span className="dot" style={{ background: 'var(--pw-green)' }} />
            {ov
              ? `Données mises à jour ${timeAgo(ov.derniere_collecte)}`
              : 'Données mises à jour …'
            }
          </span>
          <span className="pw-pill slate">
            <IcoClock />
            {ov?.prochaine_collecte
              ? `Prochaine collecte ${ov.prochaine_collecte}`
              : 'Prochaine collecte programmée'
            }
          </span>
        </div>
      </div>

      {/* ── Quick search ── */}
      <QuickSearch />

      {/* ── Activity strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        {overviewQ.isLoading
          ? [0, 1, 2, 3].map(i => (
              <div key={i} className="pw-kpi">
                <div className="pw-sk" style={{ height: 11, width: '70%', borderRadius: 4 }} />
                <div className="pw-sk" style={{ height: 28, width: '45%', borderRadius: 4, marginTop: 10 }} />
                <div className="pw-sk" style={{ height: 10, width: '55%', borderRadius: 4 }} />
              </div>
            ))
          : overviewQ.isError
          ? (
            <div className="pw-card" style={{ gridColumn: '1 / -1', padding: 18, textAlign: 'center', fontSize: 13, color: 'var(--pw-slate-500)' }}>
              Erreur lors du chargement de l'activité.{' '}
              <button className="pw-btn pw-btn-sm" onClick={() => overviewQ.refetch()}>Réessayer</button>
            </div>
          )
          : <>
              <ActivityTile
                icon={<IcoUp size={14} />}
                tone="red"
                label="Variations de prix"
                value={formatNumber(ov?.variations_de_prix_7j)}
                delta={deltaTxt(ov?.variations_delta_vs_hier, ov?.variations_de_prix_7j)}
              />
              <ActivityTile
                icon={<IcoTag />}
                tone="amber"
                label="Nouvelles promos"
                value={formatNumber(ov?.nouvelles_promos_7j)}
                delta={deltaTxt(ov?.promos_delta_vs_hier, ov?.nouvelles_promos_7j)}
              />
              <ActivityTile
                icon={<IcoBox />}
                tone="slate"
                label="Ruptures de stock"
                value={formatNumber(ov?.ruptures_stock_7j)}
                delta={deltaTxt(ov?.ruptures_delta_vs_hier, ov?.ruptures_stock_7j)}
              />
              <ActivityTile
                icon={<IcoFlag />}
                tone="indigo"
                label="Nouveaux produits"
                value={formatNumber(ov?.nouveaux_produits_7j)}
                delta="Plage 7 derniers j."
              />
            </>
        }
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>

        {/* Event feed */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div className="title">Flux d'événements récents</div>
            <div className="sub">Aujourd'hui</div>
            <div className="right">
              <button className="pw-btn pw-btn-sm" onClick={() => navigate('/tenant/events')}>
                Filtrer
              </button>
              <button className="pw-btn pw-btn-sm pw-btn-ghost" onClick={() => navigate('/tenant/events')}>
                Tout voir <IcoArrow />
              </button>
            </div>
          </div>
          <div className="pw-card-body tight">
            {eventsQ.isLoading
              ? [0, 1, 2, 3, 4].map(i => <SkRow key={i} wide />)
              : eventsQ.isError
                ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13 }}>
                    Erreur lors du chargement.{' '}
                    <button className="pw-btn pw-btn-sm" onClick={() => eventsQ.refetch()}>Réessayer</button>
                  </div>
                )
                : eventsList.length === 0
                ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13 }}>
                    Aucun événement récent
                  </div>
                )
                : eventsList.map(evt => <EventRow key={evt.id} event={evt} />)
            }
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--pw-border)', textAlign: 'center' }}>
            <button className="pw-btn pw-btn-ghost pw-btn-sm" onClick={() => navigate('/tenant/events')}>
              Voir les {totalEvts != null ? formatNumber(totalEvts) : '…'} événements <IcoArrow />
            </button>
          </div>
        </div>

        {/* Alert panel */}
        <div className="pw-card" style={{ height: 'fit-content' }}>
          <div className="pw-card-head">
            <div className="title">Alertes</div>
            {(ov?.notifications_non_lues ?? 0) > 0 && (
              <span className="pw-pill indigo">
                {ov.notifications_non_lues} non lue{ov.notifications_non_lues > 1 ? 's' : ''}
              </span>
            )}
            <div className="right">
              <button className="pw-btn pw-btn-sm pw-btn-ghost" onClick={() => navigate('/tenant/alerts')}>
                Tout voir <IcoArrow />
              </button>
            </div>
          </div>
          <div className="pw-card-body tight">
            {alertsQ.isLoading
              ? [0, 1, 2].map(i => <SkRow key={i} />)
              : alertsQ.isError
                ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13 }}>
                    Erreur lors du chargement.{' '}
                    <button className="pw-btn pw-btn-sm" onClick={() => alertsQ.refetch()}>Réessayer</button>
                  </div>
                )
                : alertsList.length === 0
                ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13 }}>
                    <IcoBell style={{ marginBottom: 6 }} />
                    <div>Aucune alerte</div>
                  </div>
                )
                : alertsList.map(alrt => <AlertRow key={alrt.id} alert={alrt} />)
            }
          </div>
        </div>

      </div>
    </>
  )
}

// ── PosKPI ────────────────────────────────────────────────────────────────────

function PosKPI({ label, value, color, sub, delta }) {
  return (
    <div className="pw-card" style={{ padding: 16, position: 'relative', overflow: 'hidden' }}>
      <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.025em', color }} className="pw-mono">{value}</span>
        <span style={{ fontSize: 20, color: 'var(--pw-slate-400)' }} className="pw-mono">%</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--pw-slate-500)', marginTop: 2 }}>{sub}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12 }}>{delta}</div>
    </div>
  )
}

// ── OppRow ────────────────────────────────────────────────────────────────────

function OppRow({ event }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--pw-border)' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--pw-amber-50)', color: 'var(--pw-amber)', display: 'grid', placeItems: 'center', flex: '0 0 28px' }}>
        <IcoLightning />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {event.offre_nom || '—'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
          <SiteRow slug={event.site_slug} name={event.site_name} />
          <span style={{ color: 'var(--pw-slate-300)' }}>·</span>
          <span>{timeAgo(event.date_detection)}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <span className="pw-stock out">Rupture</span>
      </div>
    </div>
  )
}

// ── AlertKpiCard ──────────────────────────────────────────────────────────────

function AlertKpiCard({ dotColor, label, value, sub, sparkData, sparkStroke, sparkFill }) {
  return (
    <div className="pw-card" style={{ padding: 14 }}>
      <div className="pw-h3" style={{ marginBottom: 8 }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: dotColor, marginRight: 6 }} />
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: value > 0 ? undefined : 'var(--pw-slate-400)' }} className="pw-mono">
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)' }}>{sub}</div>
      {sparkData?.length > 1 && (
        <Sparkline data={sparkData} w={200} h={28} stroke={sparkStroke} fill={sparkFill} />
      )}
    </div>
  )
}

// ── DashboardRM ───────────────────────────────────────────────────────────────

function DashboardRM() {
  const { user }   = useAuthStore()
  const navigate   = useNavigate()
  const firstName  = user?.nom?.split(' ')[0] ?? user?.nom ?? ''

  const overviewQ    = useQuery({ queryKey: ['overview'],         queryFn: getOverview,        refetchInterval: 60000 })
  const positioningQ = useQuery({ queryKey: ['positioning'],      queryFn: getPositioning })
  const rupturesQ    = useQuery({ queryKey: ['ruptures'],         queryFn: getRuptures })
  const trendsQ      = useQuery({ queryKey: ['dashboard-trends'], queryFn: getDashboardTrends })

  const ov             = overviewQ.data
  const pos            = positioningQ.data
  const trends         = trendsQ.data
  const rupturesList   = rupturesQ.data ?? []
  const rupturesTotal  = rupturesList.length

  return (
    <>
      {/* ── Welcome header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="pw-h1">Bonjour {firstName} 👋</div>
          <div className="pw-muted" style={{ fontSize: 13, marginTop: 4 }}>
            Voici votre position concurrentielle sur les 7 derniers jours.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pw-pill">
            <span className="dot" style={{ background: 'var(--pw-green)' }} />
            {ov ? `Données fraîches · ${timeAgo(ov.derniere_collecte)}` : 'Données fraîches…'}
          </span>
          <button className="pw-btn pw-btn-sm" onClick={() => navigate('/tenant/reports')}>
            Rapport PDF
          </button>
        </div>
      </div>

      {/* ── Section 1 — Position concurrentielle ── */}
      {positioningQ.isLoading ? (
        <div className="pw-card pw-sk" style={{ height: 220, marginBottom: 16 }} />
      ) : pos?.error ? (
        <div className="pw-card" style={{ padding: 20, marginBottom: 16, color: 'var(--pw-slate-500)', fontSize: 13 }}>
          {pos.error}
        </div>
      ) : pos ? (
        <div className="pw-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
            <div>
              <div className="pw-h2">Position concurrentielle</div>
              <div className="pw-muted" style={{ fontSize: 12.5 }}>
                Calculée sur {pos.total_produits} produit{pos.total_produits !== 1 ? 's' : ''} suivis sur {ov?.sites_actifs ?? '…'} sites
              </div>
            </div>
            <span className="pw-pill slate" style={{ marginLeft: 'auto' }}>7 derniers jours</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <PosKPI
              label="Nous sommes les moins chers"
              value={pos.pct_moins_cher}
              color="var(--pw-teal)"
              sub={`${pos.moins_cher} produit${pos.moins_cher !== 1 ? 's' : ''} sur ${pos.total_produits}`}
              delta={pos.pct_moins_cher > 0
                ? <span style={{ color: 'var(--pw-teal)' }}><IcoUp size={11} /> +{pos.moins_cher} produits</span>
                : <span style={{ color: 'var(--pw-slate-400)' }}>—</span>}
            />
            <PosKPI
              label="Dans la moyenne du marché"
              value={pos.pct_dans_moyenne}
              color="var(--pw-slate-700)"
              sub={`${pos.dans_moyenne} produit${pos.dans_moyenne !== 1 ? 's' : ''} sur ${pos.total_produits}`}
              delta={<span style={{ color: 'var(--pw-slate-500)' }}>—</span>}
            />
            <PosKPI
              label="Nous sommes les plus chers"
              value={pos.pct_plus_cher}
              color="var(--pw-red)"
              sub={`${pos.plus_cher} produit${pos.plus_cher !== 1 ? 's' : ''} sur ${pos.total_produits}`}
              delta={pos.pct_plus_cher > 0
                ? <span style={{ color: 'var(--pw-red)' }}><IcoDown size={11} /> {pos.plus_cher} à revoir</span>
                : <span style={{ color: 'var(--pw-slate-400)' }}>—</span>}
            />
          </div>

          {/* Stacked bar */}
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginTop: 16, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.04)' }}>
            <div style={{ width: `${pos.pct_moins_cher}%`, background: 'var(--pw-teal)', display: 'grid', placeItems: 'center', fontSize: 10, color: '#fff', fontWeight: 700 }}>
              {pos.pct_moins_cher >= 8 ? `${pos.pct_moins_cher}%` : ''}
            </div>
            <div style={{ width: `${pos.pct_dans_moyenne}%`, background: 'var(--pw-slate-300)', display: 'grid', placeItems: 'center', fontSize: 10, color: 'var(--pw-slate-700)', fontWeight: 700 }}>
              {pos.pct_dans_moyenne >= 8 ? `${pos.pct_dans_moyenne}%` : ''}
            </div>
            <div style={{ width: `${pos.pct_plus_cher}%`, background: 'var(--pw-red)', display: 'grid', placeItems: 'center', fontSize: 10, color: '#fff', fontWeight: 700 }}>
              {pos.pct_plus_cher >= 8 ? `${pos.pct_plus_cher}%` : ''}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Section 2 — 4 alert KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <AlertKpiCard
          dotColor="var(--pw-red)"
          label="Concurrents moins chers"
          value={pos?.plus_cher ?? '—'}
          sub="produits où un concurrent vous bat"
        />
        <AlertKpiCard
          dotColor="var(--pw-amber)"
          label="Ruptures concurrents"
          value={rupturesTotal}
          sub="opportunités identifiées"
          sparkData={trends?.ruptures}
          sparkStroke="#F59E0B"
          sparkFill="rgba(245,158,11,.1)"
        />
        <AlertKpiCard
          dotColor="var(--pw-amber)"
          label="Promos actives"
          value={ov?.nouvelles_promos_7j ?? '—'}
          sub="chez les concurrents (7j)"
          sparkData={trends?.promos}
          sparkStroke="#F59E0B"
          sparkFill="rgba(245,158,11,.1)"
        />
        <AlertKpiCard
          dotColor="var(--pw-indigo)"
          label="Variations de prix (24h)"
          value={ov?.variations_delta_vs_hier ?? 0}
          sub="détectées depuis hier"
          sparkData={trends?.variations}
          sparkStroke="#6366F1"
          sparkFill="rgba(99,102,241,.1)"
        />
      </div>

      {/* ── Section 3 — Bubble chart + Opportunities ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>

        {/* Mapping concurrentiel */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div>
              <div className="title">Mapping concurrentiel</div>
              <div className="sub">Notre prix vs prix moyen marché — chaque bulle = 1 produit</div>
            </div>
            <div className="right">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--pw-slate-500)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />Moins cher
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#94A3B8' }} />Égal
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />Plus cher
                </span>
              </div>
            </div>
          </div>
          <div className="pw-card-body" style={{ position: 'relative' }}>
            {positioningQ.isLoading
              ? <div className="pw-sk" style={{ height: 320 }} />
              : <BubbleChart produits={pos?.produits} />
            }
          </div>
        </div>

        {/* Opportunités à saisir */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div>
              <div className="title">Opportunités à saisir</div>
              <div className="sub">Concurrents en rupture sur des produits clés</div>
            </div>
            <div className="right">
              {rupturesTotal > 0 && (
                <span className="pw-pill amber" style={{ fontSize: 10 }}>{rupturesTotal}</span>
              )}
            </div>
          </div>
          <div style={{ padding: '4px 16px 14px' }}>
            {rupturesQ.isLoading
              ? [0,1,2,3].map(i => <SkRow key={i} />)
              : rupturesList.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13 }}>
                    Aucune rupture concurrente détectée
                  </div>
                : rupturesList.slice(0, 5).map(evt => <OppRow key={evt.offre_id} event={evt} />)
            }
            {rupturesTotal > 0 && (
              <div style={{ textAlign: 'center', paddingTop: 6 }}>
                <button className="pw-btn pw-btn-ghost pw-btn-sm"
                  onClick={() => navigate('/tenant/events?type_evenement=RUPTURE_STOCK')}>
                  Voir les {rupturesTotal} opportunités <IcoArrow />
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  )
}

// ── InsightRow ────────────────────────────────────────────────────────────────

function InsightRow({ icon, text, action, accent = 'var(--pw-indigo)', onClick }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--pw-border)' }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: `${accent}22`, color: accent, display: 'grid', placeItems: 'center', flex: '0 0 28px' }}>
        {icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--pw-slate-800)', lineHeight: 1.5 }}>{text}</div>
        <span
          onClick={onClick}
          style={{ fontSize: 12, color: accent, fontWeight: 600, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
        >
          {action} <IcoArrow />
        </span>
      </div>
    </div>
  )
}

// ── DashboardMG ───────────────────────────────────────────────────────────────

function DashboardMG() {
  const { user }   = useAuthStore()
  const navigate   = useNavigate()

  const overviewQ      = useQuery({ queryKey: ['overview'],         queryFn: getOverview,       refetchInterval: 60000 })
  const positioningQ   = useQuery({ queryKey: ['positioning'],      queryFn: getPositioning })
  const rupturesQ      = useQuery({ queryKey: ['ruptures'],         queryFn: getRuptures })
  const riskQ          = useQuery({ queryKey: ['risk-categories'],  queryFn: getRiskCategories })
  const trendsQ        = useQuery({ queryKey: ['dashboard-trends'], queryFn: getDashboardTrends })

  const ov     = overviewQ.data
  const pos    = positioningQ.data
  const trends = trendsQ.data
  const nom    = user?.nom_organisation ?? '—'
  const rupturesList  = rupturesQ.data ?? []
  const rupturesTotal = rupturesList.length

  const categories = groupByCategory(pos?.produits)

  // Indice de pression dérivé du volume d'événements réel (7 derniers jours)
  const totalEvents7j = ov?.evenements_7j ?? 0
  const gaugeValue    = Math.min(100, Math.round(totalEvents7j / 5))
  const gaugeLabel    = gaugeValue > 70 ? 'Élevée' : gaugeValue > 40 ? 'Modérée' : 'Faible'
  const gaugeColor    = gaugeValue > 70 ? 'var(--pw-red)' : gaugeValue > 40 ? 'var(--pw-amber)' : 'var(--pw-teal)'
  const marcheLabel   = gaugeValue > 70 ? 'très actif' : gaugeValue > 40 ? 'modérément actif' : 'calme'

  return (
    <>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="pw-h1">Tableau de bord exécutif</div>
          <div className="pw-muted" style={{ fontSize: 13 }}>
            Vue stratégique · 7 derniers jours
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="pw-btn pw-btn-sm" onClick={() => navigate('/tenant/reports')}>
            Rapport mensuel
          </button>
        </div>
      </div>

      {/* ── AI Synthesis card ── */}
      <div className="pw-card" style={{ marginBottom: 16, padding: 22, background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', color: '#fff', borderColor: 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #6366F1, #0D9488)', display: 'grid', placeItems: 'center', boxShadow: '0 4px 12px rgba(99,102,241,.4)' }}>
            <IcoSparkles />
          </div>
          <span style={{ fontSize: 11.5, color: '#A5B4FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Synthèse IA de la situation concurrentielle
          </span>
          <span className="pw-pill" style={{ background: 'rgba(255,255,255,.08)', color: '#94A3B8', border: '1px solid rgba(255,255,255,.1)', fontSize: 10, marginLeft: 'auto' }}>
            Proposed feature
          </span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.5, maxWidth: 900 }}>
          Le marché est{' '}
          <strong style={{ color: '#FCA5A5' }}>{ov ? marcheLabel : '…'}</strong>
          {' '}avec{' '}
          <strong>{ov ? formatNumber(ov.evenements_7j) : '…'} événements</strong>
          {' '}détectés sur 7 jours.{' '}
          <strong style={{ color: '#FCA5A5' }}>{nom}</strong>
          {' '}surveille{' '}
          <strong>{ov ? formatNumber(ov.offres_total) : '…'} offres</strong>.
          {' '}Notre position :{' '}
          <strong style={{ color: '#86EFAC' }}>
            {pos ? `${pos.pct_moins_cher}% des produits au prix le plus bas` : '…'}
          </strong>
          {pos && pos.pct_plus_cher > 0
            ? `, mais ${pos.pct_plus_cher}% restent surévalués.`
            : '.'}
        </div>
      </div>

      {/* ── 4 Executive KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>

        {/* Card 1 — Gauge */}
        <div className="pw-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <GaugeBig value={gaugeValue} />
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Indice de pression</div>
            <div style={{ fontSize: 12.5, color: gaugeColor, fontWeight: 600, marginTop: 6 }}>{ov ? gaugeLabel : '…'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 2 }}>
              {ov ? `${formatNumber(totalEvents7j)} événements (7j)` : ''}
            </div>
          </div>
        </div>

        {/* Card 2 — Produits sous-cotés */}
        <div className="pw-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Produits sous-cotés par concurrents</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.025em', color: 'var(--pw-red)', lineHeight: 1.1, marginTop: 10 }} className="pw-mono">
            {pos?.plus_cher ?? '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2 }}>
            sur {pos?.total_produits ?? '…'} produits suivis
          </div>
        </div>

        {/* Card 3 — Catégories à risque */}
        <div className="pw-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Catégories à risque</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.025em', color: 'var(--pw-amber)', lineHeight: 1.1, marginTop: 10 }} className="pw-mono">
            {riskQ.isLoading ? '…' : (riskQ.data?.length ?? 0)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2 }}>
            {riskQ.data?.length > 0
              ? riskQ.data.map(c => c.categorie_nom).join(' · ')
              : '—'}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--pw-slate-500)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pw-amber)' }} />
              &gt; 25% produits surévalués
            </span>
          </div>
        </div>

        {/* Card 4 — Opportunités */}
        <div className="pw-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Opportunités identifiées</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.025em', color: 'var(--pw-teal)', lineHeight: 1.1, marginTop: 10 }} className="pw-mono">
            {rupturesTotal}
          </div>
          <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2 }}>
            concurrents en rupture
          </div>
          {trends?.ruptures?.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <Sparkline data={trends.ruptures} w={200} h={30} stroke="#0D9488" fill="rgba(13,148,136,.1)" />
            </div>
          )}
        </div>

      </div>

      {/* ── Two-column section ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, marginBottom: 16 }}>

        {/* Bar chart */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div>
              <div className="title">Notre prix moyen vs marché par catégorie</div>
              <div className="sub">30 derniers jours · indicateur de compétitivité</div>
            </div>
            <div className="right" style={{ fontSize: 12, color: 'var(--pw-slate-500)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pw-green)' }} />
                Compétitifs
              </span>
            </div>
          </div>
          <div className="pw-card-body">
            {positioningQ.isLoading
              ? <div className="pw-sk" style={{ height: 280 }} />
              : <CompetitiveBars categories={categories} />
            }
          </div>
        </div>

        {/* Top 5 insights */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div>
              <div className="title">Top 5 insights</div>
              <div className="sub">Curated AI · Proposed feature</div>
            </div>
            <div className="right">
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'linear-gradient(135deg, #6366F1, #0D9488)', color: '#fff', display: 'grid', placeItems: 'center' }}>
                <IcoSparkles />
              </span>
            </div>
          </div>
          <div style={{ padding: '4px 16px 12px' }}>
            <InsightRow
              accent="var(--pw-red)"
              icon={<IcoDown size={13} />}
              text={<>{nom} enregistre <strong>{formatNumber(ov?.variations_de_prix_7j ?? 0)} variations</strong> de prix cette semaine.</>}
              action="Voir les événements"
              onClick={() => navigate('/tenant/events')}
            />
            <InsightRow
              accent="var(--pw-amber)"
              icon={<IcoLightning />}
              text={<><strong>{rupturesTotal} opportunité{rupturesTotal !== 1 ? 's' : ''}</strong> de rupture identifiée{rupturesTotal !== 1 ? 's' : ''} chez les concurrents.</>}
              action="Voir les opportunités"
              onClick={() => navigate('/tenant/events?type_evenement=RUPTURE_STOCK')}
            />
            <InsightRow
              accent="var(--pw-teal)"
              icon={<IcoUp size={13} />}
              text={<>Position compétitive : <strong>{pos?.pct_moins_cher ?? '…'}% des produits</strong> au meilleur prix marché.</>}
              action="Voir le positionnement"
              onClick={() => navigate('/tenant/positioning')}
            />
            <InsightRow
              accent="var(--pw-amber)"
              icon={<IcoTag />}
              text={<><strong>{formatNumber(ov?.nouvelles_promos_7j ?? 0)} nouvelles promotions</strong> détectées cette semaine.</>}
              action="Voir les promotions"
              onClick={() => navigate('/tenant/events?type_evenement=DEBUT_PROMOTION')}
            />
            <InsightRow
              accent="var(--pw-indigo)"
              icon={<IcoSparkles />}
              text={<>Analyse complète disponible dans le <strong>rapport mensuel</strong>.</>}
              action="Générer un rapport"
              onClick={() => navigate('/tenant/reports')}
            />
          </div>
        </div>

      </div>

      {/* ── Trend cards (3 columns) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[
          { label: 'Variations de prix', value: ov?.variations_de_prix_7j, delta: ov?.variations_delta_vs_hier, series: trends?.variations, stroke: '#6366F1', fill: 'rgba(99,102,241,.12)' },
          { label: 'Promotions',         value: ov?.nouvelles_promos_7j,   delta: ov?.promos_delta_vs_hier,     series: trends?.promos,     stroke: '#F59E0B', fill: 'rgba(245,158,11,.12)' },
          { label: 'Ruptures détectées', value: ov?.ruptures_stock_7j,     delta: ov?.ruptures_delta_vs_hier,   series: trends?.ruptures,   stroke: '#0D9488', fill: 'rgba(13,148,136,.12)' },
        ].map(card => {
          const delta = card.delta ?? 0
          const deltaColor = delta > 0 ? 'var(--pw-red)' : delta < 0 ? 'var(--pw-teal)' : 'var(--pw-slate-400)'
          return (
            <div key={card.label} className="pw-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>{card.label}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.025em' }} className="pw-mono">
                    {formatNumber(card.value ?? 0)}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: deltaColor, fontWeight: 700 }}>
                    {delta > 0 ? <IcoUp size={12} /> : delta < 0 ? <IcoDown size={12} /> : null}
                    {' '}{delta > 0 ? `+${delta}` : delta} vs hier
                  </div>
                </div>
                {card.series?.length > 1 && (
                  <Sparkline data={card.series} w={100} h={36} stroke={card.stroke} fill={card.fill} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────

export default function TenantDashboard() {
  const { user } = useAuthStore()
  const role = {
    'EQUIPE_MARKETING': 'em',
    'RESP_MARKETING':   'rm',
    'MANAGER':          'mg',
  }[user?.role] || 'em'

  if (role === 'rm') return <DashboardRM />
  if (role === 'mg') return <DashboardMG />
  return <DashboardEM />
}
