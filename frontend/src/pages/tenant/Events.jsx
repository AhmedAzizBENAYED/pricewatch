import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getEvents, getEventsSummary, getEventSites, getAlertRules } from '../../api/tenant'
import { useAuthStore } from '../../store/auth'
import { formatNumber, timeAgo, EVENT_CONFIG } from '../../utils/pw'
import { SiteRow, PriceChange } from '../../components/pw'
import {
  IcoUp, IcoDown, IcoTag, IcoBox, IcoFlag, IcoCheck,
  IcoFilter, IcoSearch, IcoArrow,
} from '../../components/icons'

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_EVENT_TYPES = [
  { value: 'HAUSSE_PRIX',               label: 'Hausse de prix',   color: 'var(--pw-red)' },
  { value: 'BAISSE_PRIX',               label: 'Baisse de prix',   color: 'var(--pw-teal)' },
  { value: 'DEBUT_PROMOTION',           label: 'Promotion',        color: 'var(--pw-amber)' },
  { value: 'RUPTURE_STOCK',             label: 'Rupture stock',    color: 'var(--pw-slate-600)' },
  { value: 'RETOUR_STOCK',              label: 'Retour stock',     color: 'var(--pw-green)' },
  { value: 'NOUVELLE_OFFRE_DECOUVERTE', label: 'Nouveau produit',  color: 'var(--pw-indigo)' },
]

const SUMMARY_ITEMS = [
  { key: 'HAUSSE_PRIX',               tone: 'red',    label: 'Hausses' },
  { key: 'BAISSE_PRIX',               tone: 'teal',   label: 'Baisses' },
  { key: 'DEBUT_PROMOTION',           tone: 'amber',  label: 'Promotions' },
  { key: 'RUPTURE_STOCK',             tone: 'slate',  label: 'Ruptures' },
  { key: 'RETOUR_STOCK',              tone: 'green',  label: 'Retours stock' },
  { key: 'NOUVELLE_OFFRE_DECOUVERTE', tone: 'indigo', label: 'Nouveautés' },
]

const TONE_COLORS = {
  red:    { bg: 'var(--pw-red-50)',    c: 'var(--pw-red)' },
  teal:   { bg: 'var(--pw-teal-50)',   c: 'var(--pw-teal)' },
  amber:  { bg: 'var(--pw-amber-50)',  c: 'var(--pw-amber)' },
  slate:  { bg: 'var(--pw-slate-100)', c: 'var(--pw-slate-600)' },
  green:  { bg: 'var(--pw-green-50)',  c: 'var(--pw-green)' },
  indigo: { bg: 'var(--pw-indigo-50)', c: 'var(--pw-indigo)' },
}

const PERIOD_OPTIONS = [
  { value: '1d',     label: "Aujourd'hui",         summaryPeriod: '7d' },
  { value: '7d',     label: '7 derniers jours',    summaryPeriod: '7d' },
  { value: '30d',    label: '30 derniers jours',   summaryPeriod: '30d' },
  { value: 'custom', label: 'Plage personnalisée', summaryPeriod: '30d' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeIcon(typeKey, size = 16) {
  const t = EVENT_CONFIG[typeKey]?.type
  if (t === 'rise')  return <IcoUp size={size} />
  if (t === 'drop')  return <IcoDown size={size} />
  if (t === 'promo') return <IcoTag />
  if (t === 'stock') return <IcoBox />
  if (t === 'back')  return <IcoCheck size={size} />
  return <IcoFlag />
}

function localDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function groupEventsByDate(events) {
  const groups = {}
  const now = new Date()
  const todayStr = localDateKey(now)
  const yest = new Date(now)
  yest.setDate(yest.getDate() - 1)
  const yesterdayStr = localDateKey(yest)

  events.forEach(evt => {
    const d = new Date(evt.date_detection)
    const dateStr = localDateKey(d)
    if (!groups[dateStr]) {
      const fullDate = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      let label
      if (dateStr === todayStr) {
        label = `Aujourd'hui · ${fullDate}`
      } else if (dateStr === yesterdayStr) {
        label = `Hier · ${fullDate}`
      } else {
        label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      }
      groups[dateStr] = {
        label: label.charAt(0).toUpperCase() + label.slice(1),
        events: [],
      }
    }
    groups[dateStr].events.push(evt)
  })

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, g]) => g)
}

function groupEventsByProduct(events) {
  const groups = {}
  const order = []
  events.forEach(evt => {
    const key = evt.referentiel_id != null ? `ref-${evt.referentiel_id}` : `offre-${evt.offre_id}`
    if (!groups[key]) {
      groups[key] = { label: evt.offre_nom || 'Produit inconnu', events: [] }
      order.push(key)
    }
    groups[key].events.push(evt)
  })
  return order.map(k => {
    const g = groups[k]
    return {
      label: `${g.label} · ${g.events.length} événement${g.events.length > 1 ? 's' : ''}`,
      events: g.events,
    }
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ item, count, loading, periodLabel }) {
  const tc = TONE_COLORS[item.tone]
  return (
    <div className="pw-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
      {loading ? (
        <>
          <div className="pw-sk" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="pw-sk" style={{ height: 10, width: 60, borderRadius: 3, marginBottom: 6 }} />
            <div className="pw-sk" style={{ height: 18, width: 40, borderRadius: 3 }} />
          </div>
        </>
      ) : (
        <>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: tc.bg, color: tc.c,
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            {typeIcon(item.key, 16)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
              {item.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="pw-mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>{count ?? 0}</span>
              <span style={{ fontSize: 11, color: 'var(--pw-slate-500)' }}>{periodLabel}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function DateDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 10px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--pw-border)' }} />
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--pw-border)' }} />
    </div>
  )
}

function EventRight({ evt }) {
  const cfg = EVENT_CONFIG[evt.type_evenement] ?? {}
  const t = cfg.type
  if ((t === 'drop' || t === 'rise') && evt.valeur_avant != null && evt.valeur_apres != null) {
    return (
      <div style={{ textAlign: 'right' }}>
        <div className="pw-mono" style={{ fontSize: 14 }}>
          {formatNumber(evt.valeur_avant)} → {formatNumber(evt.valeur_apres)} TND
        </div>
        {evt.delta_pct != null && (
          <div style={{ marginTop: 3 }}>
            <PriceChange pct={evt.delta_pct} abs={Math.abs(evt.delta_absolu ?? 0)} />
          </div>
        )}
      </div>
    )
  }
  if (t === 'promo') {
    return (
      <span className="pw-pill amber">
        <IcoTag />
        {evt.delta_pct != null ? `-${Math.abs(Math.round(evt.delta_pct))}%` : 'Promo'}
      </span>
    )
  }
  if (t === 'stock') return <span className="pw-stock out">Rupture</span>
  if (t === 'back')  return <span className="pw-stock in">En stock</span>
  if (t === 'new')   return <span className="pw-pill indigo">Nouveau référentiel</span>
  return null
}

function EventCard({ evt, isWatched, onNavigate }) {
  const cfg = EVENT_CONFIG[evt.type_evenement] ?? {
    color: 'var(--pw-slate-600)', bg: 'var(--pw-slate-100)', label: evt.type_evenement,
  }
  return (
    <div className="pw-card" style={{ display: 'flex', gap: 14, padding: 14, alignItems: 'center' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 10,
        background: cfg.bg, color: cfg.color,
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        {typeIcon(evt.type_evenement, 20)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {cfg.label}
          </span>
          {isWatched && (
            <span className="pw-pill indigo" style={{ fontSize: 10 }}>Surveillé</span>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {evt.offre_nom || '—'}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, fontSize: 12, color: 'var(--pw-slate-500)', flexWrap: 'wrap' }}>
          <SiteRow slug={evt.site_slug} name={evt.site_name} />
          {evt.categorie_nom && (
            <>
              <span style={{ color: 'var(--pw-slate-300)' }}>·</span>
              <span>{evt.categorie_nom}</span>
            </>
          )}
          <span style={{ color: 'var(--pw-slate-300)' }}>·</span>
          <span>{timeAgo(evt.date_detection)}</span>
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <EventRight evt={evt} />
        <button
          className="pw-btn pw-btn-sm pw-btn-ghost"
          style={{ marginTop: 6 }}
          onClick={() => onNavigate(evt.offre_id)}
        >
          Voir le produit <IcoArrow />
        </button>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  const pages = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }
  return (
    <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <button className="pw-btn pw-btn-sm" disabled={page === 1} onClick={() => onChange(page - 1)}
              style={{ opacity: page === 1 ? .4 : 1 }}>‹</button>
      {pages.map((p, i) => (
        <button key={i} className="pw-btn pw-btn-sm"
                disabled={p === '…'}
                onClick={() => typeof p === 'number' && onChange(p)}
                style={{
                  minWidth: 32, justifyContent: 'center',
                  background: p === page ? 'var(--pw-indigo)' : '#fff',
                  color: p === page ? '#fff' : 'inherit',
                  borderColor: p === page ? 'var(--pw-indigo)' : 'var(--pw-border)',
                  opacity: p === '…' ? .5 : 1,
                }}>
          {p}
        </button>
      ))}
      <button className="pw-btn pw-btn-sm" disabled={page === totalPages} onClick={() => onChange(page + 1)}
              style={{ opacity: page === totalPages ? .4 : 1 }}>›</button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Events() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [groupBy, setGroupBy] = useState('chrono')
  const [categorySearch, setCategorySearch] = useState('')
  const [debouncedCategory, setDebouncedCategory] = useState('')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCategory(categorySearch), 400)
    return () => clearTimeout(t)
  }, [categorySearch])

  const selectedTypes = searchParams.getAll('type_evenement')
  const period = searchParams.get('period') ?? '7d'
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const selectedSites = searchParams.getAll('site_slug')
  const referentielIdRaw = searchParams.get('referentiel_id')
  const referentielId = referentielIdRaw ? Number(referentielIdRaw) : null

  const sitesQ = useQuery({
    queryKey: ['event-sites'],
    queryFn: getEventSites,
    staleTime: 5 * 60_000,
  })
  const sites = sitesQ.data ?? []

  const isSiteChecked = (slug) => selectedSites.length === 0 || selectedSites.includes(slug)

  const toggleSite = (slug) => {
    const current = selectedSites.length === 0
      ? sites.map(s => s.slug)
      : [...selectedSites]
    const next = current.includes(slug)
      ? current.filter(s => s !== slug)
      : [...current, slug]
    setSearchParams(prev => {
      const n = new URLSearchParams(prev)
      n.delete('site_slug')
      n.delete('page')
      if (next.length > 0 && next.length < sites.length) {
        next.forEach(s => n.append('site_slug', s))
      }
      return n
    }, { replace: true })
  }

  const isTypeChecked = (type) => selectedTypes.length === 0 || selectedTypes.includes(type)

  const toggleType = (type) => {
    const current = selectedTypes.length === 0
      ? ALL_EVENT_TYPES.map(t => t.value)
      : [...selectedTypes]
    const next = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type]

    setSearchParams(prev => {
      const n = new URLSearchParams(prev)
      n.delete('type_evenement')
      n.delete('page')
      if (next.length > 0 && next.length < ALL_EVENT_TYPES.length) {
        next.forEach(t => n.append('type_evenement', t))
      }
      return n
    }, { replace: true })
  }

  const setPeriod = (p) => {
    setSearchParams(prev => {
      const n = new URLSearchParams(prev)
      p === '7d' ? n.delete('period') : n.set('period', p)
      n.delete('page')
      return n
    }, { replace: true })
    if (p !== 'custom') {
      setCustomDateFrom('')
      setCustomDateTo('')
    }
  }

  const setPage = (p) => setSearchParams(prev => {
    const n = new URLSearchParams(prev)
    p > 1 ? n.set('page', String(p)) : n.delete('page')
    return n
  })

  const clearFilters = () => {
    setSearchParams({}, { replace: true })
    setCategorySearch('')
    setCustomDateFrom('')
    setCustomDateTo('')
  }

  const clearReferentielFilter = () => setSearchParams(prev => {
    const n = new URLSearchParams(prev)
    n.delete('referentiel_id')
    n.delete('page')
    return n
  }, { replace: true })

  const periodDateFrom = period === '1d'
    ? new Date(Date.now() - 86400000).toISOString().split('T')[0]
    : period === '7d'
    ? new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    : period === '30d'
    ? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
    : null

  const summaryPeriod = period === '30d' ? '30d' : '7d'
  const summaryLabel  = summaryPeriod === '30d' ? '30j' : '7j'

  const summaryQ = useQuery({
    queryKey: ['events-summary', summaryPeriod],
    queryFn: () => getEventsSummary(summaryPeriod),
  })

  const eventsQ = useQuery({
    queryKey: ['events', {
      type: selectedTypes, sites: selectedSites, cat: debouncedCategory,
      referentielId, period, page, customDateFrom, customDateTo,
    }],
    queryFn: () => getEvents({
      ...(selectedTypes.length > 0 && { type_evenement: selectedTypes }),
      ...(selectedSites.length > 0 && { site_slug: selectedSites }),
      ...(debouncedCategory && { categorie_q: debouncedCategory }),
      ...(referentielId && { referentiel_id: referentielId }),
      ...(period === 'custom' && customDateFrom && { date_from: customDateFrom }),
      ...(period === 'custom' && customDateTo && { date_to: customDateTo }),
      ...(period !== 'custom' && periodDateFrom && { date_from: periodDateFrom }),
      page,
      limit: 20,
    }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })

  const userRole = useAuthStore(s => s.user?.role)
  const rulesQ = useQuery({
    queryKey: ['alert-rules'],
    queryFn: getAlertRules,
    enabled: userRole === 'RESP_MARKETING' || userRole === 'MANAGER',
  })

  const watchedTypes = new Set((rulesQ.data ?? []).map(r => r.type_evenement))
  const events = eventsQ.data?.data ?? []
  const meta = eventsQ.data?.meta ?? {}
  const total = meta.total ?? 0
  const totalPages = meta.pages ?? 1
  const dateGroups = groupBy === 'product'
    ? groupEventsByProduct(events)
    : groupEventsByDate(events)
  const referentielNom = referentielId && events.length > 0
    ? events.find(e => e.referentiel_id === referentielId)?.offre_nom
    : null

  return (
    <div style={{ padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div className="pw-h1">Événements concurrentiels</div>
          <div className="pw-muted" style={{ fontSize: 13 }}>Flux temps réel des mouvements détectés sur le marché</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="pw-pill">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pw-green)', display: 'inline-block', marginRight: 6 }} />
            Live
          </span>
          <button className="pw-btn pw-btn-sm" disabled title="Disponible prochainement">Export CSV</button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 18 }}>
        {SUMMARY_ITEMS.map(item => (
          <SummaryCard
            key={item.key}
            item={item}
            count={summaryQ.data?.by_type?.[item.key]}
            loading={summaryQ.isLoading}
            periodLabel={summaryLabel}
          />
        ))}
      </div>

      {summaryQ.isError && (
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--pw-slate-500)', display: 'flex', gap: 8, alignItems: 'center' }}>
          Impossible de charger le résumé.
          <button className="pw-btn pw-btn-sm" onClick={() => summaryQ.refetch()}>Réessayer</button>
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 18, alignItems: 'start' }}>

        {/* Left: Filters panel */}
        <div className="pw-card" style={{ position: 'sticky', top: 0 }}>
          <div className="pw-card-head" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <IcoFilter />
            <div className="title" style={{ fontSize: 13 }}>Filtres</div>
          </div>

          {/* Type d'événement */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--pw-border)' }}>
            <div className="pw-h3" style={{ fontSize: 11, marginBottom: 8 }}>Type d'événement</div>
            {ALL_EVENT_TYPES.map(type => (
              <label
                key={type.value}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, cursor: 'pointer' }}
                onClick={() => toggleType(type.value)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: isTypeChecked(type.value) ? type.color : '#fff',
                  border: `1.5px solid ${type.color}`,
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  {isTypeChecked(type.value) && (
                    <svg width="10" height="10" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span style={{ flex: 1, color: 'var(--pw-slate-700)' }}>{type.label}</span>
                <span className="pw-mono" style={{ fontSize: 11, color: 'var(--pw-slate-400)' }}>
                  {summaryQ.data?.by_type?.[type.value] ?? 0}
                </span>
              </label>
            ))}
          </div>

          {/* Site */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--pw-border)' }}>
            <div className="pw-h3" style={{ fontSize: 11, marginBottom: 8 }}>Site</div>
            {sitesQ.isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[70, 55, 65].map((w, i) => (
                  <div key={i} className="pw-sk" style={{ height: 12, width: `${w}%`, borderRadius: 4 }} />
                ))}
              </div>
            )}
            {sites.map(site => (
              <label
                key={site.slug}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}
                onClick={() => toggleSite(site.slug)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: isSiteChecked(site.slug) ? 'var(--pw-indigo)' : '#fff',
                  border: '1.5px solid var(--pw-indigo)',
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  {isSiteChecked(site.slug) && (
                    <svg width="10" height="10" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <SiteRow slug={site.slug} name={site.name} />
              </label>
            ))}
          </div>

          {/* Catégorie */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--pw-border)' }}>
            <div className="pw-h3" style={{ fontSize: 11, marginBottom: 8 }}>Catégorie</div>
            <div className="pw-input" style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcoSearch />
              <input
                placeholder="Toutes catégories"
                value={categorySearch}
                onChange={e => setCategorySearch(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 12 }}
              />
            </div>
          </div>

          {/* Période */}
          <div style={{ padding: '14px 16px' }}>
            <div className="pw-h3" style={{ fontSize: 11, marginBottom: 8 }}>Période</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PERIOD_OPTIONS.map(opt => {
                const active = period === opt.value
                return (
                  <button
                    key={opt.value}
                    className="pw-btn pw-btn-sm"
                    onClick={() => setPeriod(opt.value)}
                    style={{
                      justifyContent: 'flex-start',
                      background: active ? 'var(--pw-indigo-50)' : '#fff',
                      color: active ? 'var(--pw-indigo)' : 'var(--pw-slate-700)',
                      borderColor: active ? 'var(--pw-indigo)' : 'var(--pw-border)',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
              {period === 'custom' && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={e => setCustomDateFrom(e.target.value)}
                    placeholder="Date début"
                    style={{ padding: '5px 8px', border: '1px solid var(--pw-border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
                  />
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={e => setCustomDateTo(e.target.value)}
                    placeholder="Date fin"
                    style={{ padding: '5px 8px', border: '1px solid var(--pw-border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Event feed */}
        <div>
          {/* Top bar */}
          <div className="pw-card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--pw-slate-500)' }}>Regroupement</span>
            <div style={{ display: 'flex', background: 'var(--pw-slate-100)', borderRadius: 7, padding: 3 }}>
              <button
                className="pw-btn pw-btn-sm"
                onClick={() => setGroupBy('chrono')}
                style={{
                  background: groupBy === 'chrono' ? '#fff' : 'transparent',
                  border: 0,
                  boxShadow: groupBy === 'chrono' ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                  fontWeight: groupBy === 'chrono' ? 700 : 400,
                }}
              >
                Chronologique
              </button>
              <button
                className="pw-btn pw-btn-sm"
                onClick={() => setGroupBy('product')}
                style={{
                  background: groupBy === 'product' ? '#fff' : 'transparent',
                  border: 0,
                  boxShadow: groupBy === 'product' ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                  fontWeight: groupBy === 'product' ? 700 : 400,
                }}
              >
                Par produit
              </button>
            </div>
            {referentielId && (
              <span
                className="pw-pill indigo"
                style={{ cursor: 'pointer', gap: 6 }}
                onClick={clearReferentielFilter}
                title="Retirer le filtre produit"
              >
                {referentielNom || `Produit #${referentielId}`} ✕
              </span>
            )}
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--pw-slate-500)' }}>
              <strong className="pw-mono" style={{ color: 'var(--pw-slate-900)' }}>{total}</strong> événements correspondent
            </div>
          </div>

          {/* Feed content */}
          {eventsQ.isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="pw-sk" style={{ height: 80, borderRadius: 10 }} />
              ))}
            </div>
          ) : eventsQ.isError ? (
            <div className="pw-card" style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--pw-red)', marginBottom: 10 }}>
                Erreur lors du chargement des événements.
              </div>
              <button className="pw-btn pw-btn-sm" onClick={() => eventsQ.refetch()}>Réessayer</button>
            </div>
          ) : events.length === 0 ? (
            <div className="pw-card" style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 32, color: 'var(--pw-slate-300)', marginBottom: 12 }}>○</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--pw-slate-600)', marginBottom: 6 }}>
                Aucun événement ne correspond à vos filtres
              </div>
              <button className="pw-btn pw-btn-sm" onClick={clearFilters}>Modifier les filtres</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {dateGroups.map((group, gi) => (
                <div key={gi}>
                  <DateDivider label={group.label} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 6 }}>
                    {group.events.map(evt => (
                      <EventCard
                        key={evt.id}
                        evt={evt}
                        isWatched={watchedTypes.has(evt.type_evenement)}
                        onNavigate={(offre_id) => navigate(`/tenant/offers/${offre_id}`)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>
    </div>
  )
}
