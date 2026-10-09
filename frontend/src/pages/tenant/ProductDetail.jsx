import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  getProduct, getProductComparison, getProductHistory, getProductEvents,
} from '../../api/tenant'
import { formatNumber, timeAgo, EVENT_CONFIG } from '../../utils/pw'
import { SiteLogo, SiteRow, PriceChange, MultiLineChart } from '../../components/pw'
import {
  IcoArrowL, IcoArrow, IcoBell, IcoDownload, IcoEye,
  IcoTag, IcoBox, IcoFlag, IcoUp, IcoDown, IcoSparkles, IcoChevR,
} from '../../components/icons'

// ── Event helpers ─────────────────────────────────────────────────────────────

const EVT_DOT = {
  drop:  { c: 'var(--pw-teal)',      bg: 'var(--pw-teal-50)' },
  rise:  { c: 'var(--pw-red)',       bg: 'var(--pw-red-50)' },
  promo: { c: 'var(--pw-amber)',     bg: 'var(--pw-amber-50)' },
  stock: { c: 'var(--pw-slate-600)', bg: 'var(--pw-slate-100)' },
  back:  { c: 'var(--pw-green)',     bg: 'var(--pw-green-50)' },
  new:   { c: 'var(--pw-indigo)',    bg: 'var(--pw-indigo-50)' },
}
const FALLBACK_DOT = { c: 'var(--pw-slate-600)', bg: 'var(--pw-slate-100)' }

function EvtIcon({ type, size = 14 }) {
  if (type === 'drop')  return <IcoDown size={size} />
  if (type === 'rise')  return <IcoUp   size={size} />
  if (type === 'promo') return <IcoTag />
  if (type === 'stock' || type === 'back') return <IcoBox />
  return <IcoFlag />
}

function renderChange(evt) {
  const type = EVENT_CONFIG[evt.type_evenement]?.type
  if ((type === 'drop' || type === 'rise') && evt.valeur_avant != null && evt.valeur_apres != null) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span className="pw-mono" style={{ fontSize: 12 }}>
          {formatNumber(evt.valeur_avant)} → {formatNumber(evt.valeur_apres)}
        </span>
        {evt.delta_pct != null && (
          <PriceChange pct={evt.delta_pct} abs={Math.abs(evt.delta_absolu ?? 0)} />
        )}
      </span>
    )
  }
  if (type === 'promo') return (
    <span className="pw-pill amber">
      <IcoTag />{evt.delta_pct != null ? `${Math.round(evt.delta_pct)}%` : 'Promo'}
    </span>
  )
  if (type === 'stock') return <span className="pw-stock out">Rupture</span>
  if (type === 'back')  return <span className="pw-stock in">En stock</span>
  if (type === 'new')   return <span className="pw-pill indigo">Nouveau</span>
  return null
}

function EventRow({ event }) {
  const type = EVENT_CONFIG[event.type_evenement]?.type ?? 'new'
  const dot  = EVT_DOT[type] ?? FALLBACK_DOT
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--pw-border)' }}>
      <span style={{ width: 28, height: 28, borderRadius: 7, background: dot.bg, color: dot.c, display: 'grid', placeItems: 'center', flex: '0 0 28px' }}>
        <EvtIcon type={type} size={13} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pw-slate-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {event.offre_nom || '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <SiteRow slug={event.site_slug} name={event.site_name} />
          <span style={{ color: 'var(--pw-slate-400)' }}>·</span>
          <span style={{ fontSize: 11.5, color: 'var(--pw-slate-500)' }}>{timeAgo(event.date_detection)}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 12.5, flexShrink: 0 }}>{renderChange(event)}</div>
    </div>
  )
}

// ── Stock badge ───────────────────────────────────────────────────────────────

function StockBadge({ status }) {
  if (!status) return <span style={{ color: 'var(--pw-slate-300)' }}>—</span>
  const s = (status || '').toUpperCase()
  if (s.includes('RUPTURE') || s.includes('OUT')) return <span className="pw-stock out">Rupture</span>
  if (s.includes('LOW') || s.includes('FAIBLE'))  return <span className="pw-stock low">Faible</span>
  return <span className="pw-stock in">En stock</span>
}

// ── Market indicator ──────────────────────────────────────────────────────────

function MarketIndicator({ label, value, sub, accent }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--pw-border)' }}>
      <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <span className="pw-mono" style={{ fontSize: 18, fontWeight: 700, color: accent || 'var(--pw-slate-900)' }}>{value}</span>
        {sub && <span style={{ fontSize: 11.5, color: 'var(--pw-slate-500)' }}>{sub}</span>}
      </div>
    </div>
  )
}

// ── Skeleton rows for comparison table ───────────────────────────────────────

function SkTableRows() {
  return Array.from({ length: 5 }).map((_, i) => (
    <tr key={i}>
      <td>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="pw-sk" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="pw-sk" style={{ height: 12, width: 80, borderRadius: 4 }} />
            <div className="pw-sk" style={{ height: 10, width: 48, borderRadius: 4 }} />
          </div>
        </div>
      </td>
      {[64, 44, 52, 80, 40].map((w, j) => (
        <td key={j}><div className="pw-sk" style={{ height: 12, width: w, borderRadius: 4 }} /></td>
      ))}
    </tr>
  ))
}

// ── Period map ────────────────────────────────────────────────────────────────

const PERIOD_MAP = { '7j': '7d', '30j': '30d', '90j': '90d' }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProductDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const [period, setPeriod] = useState('30j')

  const productQ = useQuery({
    queryKey: ['product', id],
    queryFn:  () => getProduct(id),
  })
  const compQ = useQuery({
    queryKey: ['comparison', id],
    queryFn:  () => getProductComparison(id),
  })
  const historyQ = useQuery({
    queryKey: ['history', id, period],
    queryFn:  () => getProductHistory(id, PERIOD_MAP[period]),
  })
  const eventsQ = useQuery({
    queryKey: ['product-events', id],
    queryFn:  () => getProductEvents(id, 10),
  })

  const ref    = productQ.data?.referentiel
  const sites  = compQ.data?.sites ?? []
  const hist   = historyQ.data
  const events = eventsQ.data?.data ?? []

  // Derived
  const sortedSites     = [...sites].sort((a, b) => (a.prix_courant ?? Infinity) - (b.prix_courant ?? Infinity))
  const bestSite        = sortedSites[0]
  const mostExpensive   = sortedSites[sortedSites.length - 1]
  const hasPromo        = sites.some(s => s.est_en_promotion)
  const lastObs         = (productQ.data?.offres_par_site ?? [])
                            .map(o => o.date_derniere_observation)
                            .filter(Boolean)
                            .sort()
                            .at(-1)

  // ── Loading state ──────────────────────────────────────────────────────────
  if (productQ.isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <div className="pw-sk" style={{ height: 14, width: 160, borderRadius: 6, marginBottom: 20 }} />
        <div className="pw-card" style={{ padding: 20, display: 'flex', gap: 24 }}>
          <div className="pw-sk" style={{ width: 180, height: 180, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="pw-sk" style={{ height: 11, width: 120, borderRadius: 4 }} />
            <div className="pw-sk" style={{ height: 26, width: '55%', borderRadius: 6 }} />
            <div className="pw-sk" style={{ height: 11, width: 80,  borderRadius: 4 }} />
            <div className="pw-sk" style={{ height: 36, width: 200, borderRadius: 8, marginTop: 8 }} />
          </div>
        </div>
      </div>
    )
  }

  // ── Error / not found ──────────────────────────────────────────────────────
  if (productQ.isError || !ref) {
    return (
      <div style={{ padding: 24 }}>
        <button className="pw-btn pw-btn-ghost pw-btn-sm" onClick={() => navigate('/tenant/products')}
                style={{ paddingLeft: 4, marginBottom: 14 }}>
          <IcoArrowL /> Retour au catalogue
        </button>
        <div className="pw-card" style={{ padding: 40, textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 14 }}>
          Produit introuvable.
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24 }}>
      {/* Back */}
      <button className="pw-btn pw-btn-ghost pw-btn-sm" onClick={() => navigate('/tenant/products')}
              style={{ paddingLeft: 4, marginBottom: 14 }}>
        <IcoArrowL /> Retour au catalogue
      </button>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--pw-slate-400)', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ cursor: 'pointer', color: 'var(--pw-indigo)' }} onClick={() => navigate('/tenant/products')}>Catalogue</span>
        {ref.categorie_nom && (
          <><IcoChevR size={12} /><span>{ref.categorie_nom}</span></>
        )}
        <IcoChevR size={12} />
        <span style={{ color: 'var(--pw-slate-700)', fontWeight: 500, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ref.nom_produit}
        </span>
      </div>

      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <div className="pw-card" style={{ padding: 20, marginBottom: 16, display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* Product image */}
        <div style={{
          width: 180, height: 180, flexShrink: 0, borderRadius: 10,
          background: 'var(--pw-slate-50)', border: '1px solid var(--pw-border)',
          display: 'grid', placeItems: 'center', overflow: 'hidden',
        }}>
          {ref.image
            ? <img src={ref.image} alt={ref.nom_produit}
                   style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
                   onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'grid' }} />
            : null
          }
          <span style={{ fontSize: 11, color: 'var(--pw-slate-400)', fontWeight: 500, display: ref.image ? 'none' : 'block' }}>
            {ref.categorie_nom || 'Image'}
          </span>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Brand / category path */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--pw-slate-500)', marginBottom: 4 }}>
            {ref.marque && <span style={{ fontWeight: 700 }}>{ref.marque}</span>}
            {ref.marque && ref.categorie_nom && <IcoChevR size={11} />}
            {ref.categorie_nom && <span>{ref.categorie_nom}</span>}
          </div>

          {/* Name */}
          <h1 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.2, color: 'var(--pw-slate-900)' }}>
            {ref.nom_produit}
          </h1>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <span className="pw-pill slate" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
              SKU {id}
            </span>
            {sites.length > 0 && (
              <span className="pw-pill">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pw-green)', display: 'inline-block', marginRight: 4 }} />
                {sites.length} site{sites.length !== 1 ? 's' : ''} surveillent ce produit
              </span>
            )}
            {hasPromo && <span className="pw-pill amber"><IcoTag /> Promo active</span>}
          </div>

          {/* Price stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, max-content)', columnGap: 32, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Meilleur prix</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span className="pw-mono" style={{ fontSize: 26, fontWeight: 700, color: 'var(--pw-slate-900)' }}>
                  {productQ.data?.prix_min != null ? formatNumber(productQ.data.prix_min) : '—'} TND
                </span>
              </div>
              {bestSite && (
                <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2 }}>
                  Sur <strong>{bestSite.site_name}</strong>
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Écart marché</div>
              <div className="pw-mono" style={{
                fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', marginTop: 4,
                color: productQ.data?.ecart_pct > 0 ? 'var(--pw-red)' : 'var(--pw-slate-900)',
              }}>
                {productQ.data?.ecart_pct != null ? `${productQ.data.ecart_pct.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2 }}>
                Min {productQ.data?.prix_min != null ? formatNumber(productQ.data.prix_min) : '—'} — Max {productQ.data?.prix_max != null ? formatNumber(productQ.data.prix_max) : '—'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Dernière obs.</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: 'var(--pw-slate-900)' }}>
                {lastObs ? timeAgo(lastObs) : '—'}
              </div>
              {lastObs && (
                <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2 }}>
                  {new Date(lastObs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button className="pw-btn pw-btn-primary" onClick={() => navigate('/tenant/settings/alerts')}>
            <IcoBell /> Créer une alerte
          </button>
          <button className="pw-btn" disabled title="Disponible prochainement"><IcoDownload /> Exporter</button>
          <button className="pw-btn pw-btn-ghost" disabled title="Disponible prochainement"><IcoEye /> Suivre</button>
        </div>
      </div>

      {/* ── Two-column grid ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

        {/* LEFT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Comparison table */}
          <div className="pw-card">
            <div className="pw-card-head">
              <div>
                <div className="title">Comparaison concurrentielle</div>
                <div className="sub">
                  Sur {sites.length} site{sites.length !== 1 ? 's' : ''} qui surveillent ce produit
                </div>
              </div>
              <div className="right">
                <button className="pw-btn pw-btn-sm" disabled><IcoDownload /> CSV</button>
              </div>
            </div>
            <table className="pw-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Prix actuel</th>
                  <th>Promo</th>
                  <th>Stock</th>
                  <th>Écart vs min</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {compQ.isLoading
                  ? <SkTableRows />
                  : compQ.isError
                  ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13, padding: '28px 0' }}>
                        Erreur lors du chargement.{' '}
                        <button className="pw-btn pw-btn-sm" onClick={() => compQ.refetch()}>Réessayer</button>
                      </td>
                    </tr>
                  )
                  : sortedSites.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13, padding: '28px 0' }}>
                        Aucune offre comparable disponible
                      </td>
                    </tr>
                  )
                  : sortedSites.map(site => {
                      const isBest   = site.is_best_price ?? site.ecart_vs_min_absolu === 0
                      const isOut    = (site.statut_stock || '').toUpperCase().includes('RUPTURE') ||
                                       (site.statut_stock || '').toUpperCase().includes('OUT')
                      const hasPromoPrice = site.est_en_promotion && site.prix_promotion != null
                      const promoPct      = hasPromoPrice && site.prix_courant
                        ? Math.round((1 - site.prix_promotion / site.prix_courant) * 100)
                        : null

                      const rowBg = isBest ? 'rgba(13,148,136,.06)'
                                  : isOut  ? 'var(--pw-slate-50)'
                                  : site.est_en_promotion ? 'rgba(245,158,11,.04)'
                                  : '#fff'

                      const displayPrice = hasPromoPrice ? site.prix_promotion : site.prix_courant
                      const wasPrice     = hasPromoPrice ? site.prix_courant : null

                      return (
                        <tr key={site.offre_id} style={{ background: rowBg, opacity: isOut ? 0.65 : 1 }}>
                          <td style={{ position: 'relative' }}>
                            {isBest && (
                              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--pw-teal)', borderRadius: '2px 0 0 2px' }} />
                            )}
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingLeft: isBest ? 8 : 2 }}>
                              <SiteLogo slug={site.site_slug} size={28} />
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--pw-slate-900)' }}>{site.site_name || site.site_slug}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                              <span className="pw-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--pw-slate-900)' }}>
                                {displayPrice != null ? formatNumber(displayPrice) : '—'} TND
                              </span>
                              {isBest && (
                                <span className="pw-pill green" style={{ fontSize: 10, padding: '2px 6px' }}>Meilleur prix</span>
                              )}
                            </div>
                            {wasPrice != null && (
                              <div style={{ fontSize: 11, color: 'var(--pw-slate-400)', marginTop: 2, textDecoration: 'line-through' }}>
                                {formatNumber(wasPrice)} TND
                              </div>
                            )}
                          </td>
                          <td>
                            {site.est_en_promotion
                              ? <span className="pw-pill amber" style={{ fontWeight: 700 }}>
                                  <IcoTag />
                                  {promoPct != null && promoPct > 0 ? ` -${promoPct}%` : ' Promo'}
                                </span>
                              : <span style={{ color: 'var(--pw-slate-300)' }}>—</span>
                            }
                          </td>
                          <td><StockBadge status={site.statut_stock} /></td>
                          <td>
                            {isBest
                              ? <span className="pw-mono" style={{ color: 'var(--pw-slate-400)', fontSize: 12 }}>— référence</span>
                              : <span style={{ color: 'var(--pw-red)', fontWeight: 600, fontSize: 12 }}>
                                  +{site.ecart_vs_min_absolu != null ? formatNumber(site.ecart_vs_min_absolu) : '—'} TND
                                  {site.ecart_vs_min_pct != null && <span style={{ fontWeight: 400 }}> (+{site.ecart_vs_min_pct.toFixed(1)}%)</span>}
                                </span>
                            }
                          </td>
                          <td>
                            <button className="pw-btn pw-btn-sm pw-btn-ghost"
                                    onClick={() => navigate(`/tenant/offers/${site.offre_id}`)}>
                              Détail <IcoChevR />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>

          {/* Price history chart */}
          <div className="pw-card">
            <div className="pw-card-head">
              <div>
                <div className="title">Historique des prix</div>
                <div className="sub">Une ligne par site · annotations sur événements clés</div>
              </div>
              <div className="right">
                <div style={{ display: 'flex', background: 'var(--pw-slate-100)', borderRadius: 7, padding: 3 }}>
                  {['7j', '30j', '90j'].map(p => (
                    <button key={p} className="pw-btn pw-btn-sm" onClick={() => setPeriod(p)} style={{
                      background: period === p ? '#fff' : 'transparent',
                      border: 0,
                      boxShadow: period === p ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                      fontWeight: period === p ? 700 : 500,
                    }}>{p}</button>
                  ))}
                </div>
                <button className="pw-btn pw-btn-sm" disabled><IcoDownload /> PNG</button>
              </div>
            </div>
            <div className="pw-card-body">
              {historyQ.isLoading
                ? <div className="pw-sk" style={{ height: 240, borderRadius: 8 }} />
                : historyQ.isError
                ? (
                  <div style={{ height: 240, display: 'grid', placeItems: 'center', gap: 8, fontSize: 13, color: 'var(--pw-slate-500)' }}>
                    Erreur lors du chargement de l'historique.
                    <button className="pw-btn pw-btn-sm" onClick={() => historyQ.refetch()}>Réessayer</button>
                  </div>
                )
                : <MultiLineChart labels={hist?.labels} series={hist?.series} height={240} />
              }
            </div>
          </div>

          {/* Recent events */}
          <div className="pw-card">
            <div className="pw-card-head">
              <div>
                <div className="title">Événements récents sur ce produit</div>
                <div className="sub">10 derniers</div>
              </div>
              <div className="right">
                <button className="pw-btn pw-btn-sm pw-btn-ghost"
                        onClick={() => navigate(`/tenant/events?referentiel_id=${id}`)}>
                  Voir tous <IcoArrow />
                </button>
              </div>
            </div>
            <div className="pw-card-body" style={{ padding: '0 16px' }}>
              {eventsQ.isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--pw-border)' }}>
                      <div className="pw-sk" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="pw-sk" style={{ height: 12, width: '55%', borderRadius: 4 }} />
                        <div className="pw-sk" style={{ height: 10, width: '35%', borderRadius: 4 }} />
                      </div>
                    </div>
                  ))
                : eventsQ.isError
                  ? <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13 }}>
                      Erreur lors du chargement.{' '}
                      <button className="pw-btn pw-btn-sm" onClick={() => eventsQ.refetch()}>Réessayer</button>
                    </div>
                  : events.length === 0
                  ? <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
                      Aucun événement récent
                    </div>
                  : events.slice(0, 5).map(evt => <EventRow key={evt.id} event={evt} />)
              }
            </div>
          </div>
        </div>

        {/* RIGHT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Market indicators */}
          <div className="pw-card">
            <div className="pw-card-head" style={{ padding: '12px 16px' }}>
              <div className="title" style={{ fontSize: 13.5 }}>Indicateurs marché</div>
            </div>
            <div>
              <MarketIndicator
                label="Prix le plus bas"
                value={productQ.data?.prix_min != null ? `${formatNumber(productQ.data.prix_min)} TND` : '—'}
                sub={bestSite?.site_name}
                accent="var(--pw-teal)"
              />
              <MarketIndicator
                label="Prix le plus haut"
                value={productQ.data?.prix_max != null ? `${formatNumber(productQ.data.prix_max)} TND` : '—'}
                sub={mostExpensive?.site_name}
                accent="var(--pw-red)"
              />
              <MarketIndicator
                label="Prix moyen marché"
                value={productQ.data?.prix_moyen != null ? `${formatNumber(Math.round(productQ.data.prix_moyen))} TND` : '—'}
                sub={`${sites.length} site${sites.length !== 1 ? 's' : ''}`}
              />
              <MarketIndicator
                label="Écart max"
                value={productQ.data?.ecart_absolu != null ? `${formatNumber(Math.round(productQ.data.ecart_absolu))} TND` : '—'}
                sub={productQ.data?.ecart_pct != null ? `+${productQ.data.ecart_pct.toFixed(1)}%` : undefined}
              />
              {/* Volatility — static */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Indice de volatilité</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <div style={{ position: 'relative', flex: 1, height: 8, background: 'linear-gradient(90deg, #10B981 0%, #F59E0B 50%, #EF4444 100%)', borderRadius: 4, opacity: .25 }}>
                    <div style={{ position: 'absolute', top: -3, left: 'calc(58% - 7px)', width: 14, height: 14, borderRadius: '50%', background: '#fff', border: '2px solid var(--pw-amber)', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                  </div>
                  <span className="pw-pill amber">Moyenne</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--pw-slate-400)', marginTop: 6, fontStyle: 'italic' }}>Proposed feature</div>
              </div>
            </div>
          </div>

          {/* AI insight */}
          <div style={{ background: 'linear-gradient(160deg, #EEF2FF 0%, #FFFBEB 100%)', borderRadius: 12, padding: 16, border: '1px solid #E0E7FF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: 'linear-gradient(135deg, #6366F1, #0D9488)', display: 'grid', placeItems: 'center', color: '#fff' }}>
                <IcoSparkles />
              </div>
              <span style={{ fontSize: 11, color: '#4338CA', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>Synthèse IA</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--pw-slate-700)', lineHeight: 1.55 }}>
              Analysez les tendances de prix entre les sites pour optimiser votre positionnement concurrentiel sur ce produit.
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--pw-slate-400)', marginTop: 8, fontStyle: 'italic' }}>Proposed feature</div>
          </div>

          {/* Specs — shown only if available in first offer */}
          {(() => {
            const specs = productQ.data?.offres_par_site?.[0]?.specs_normalises
            if (!specs || Object.keys(specs).length === 0) return null
            return (
              <div className="pw-card">
                <div className="pw-card-head" style={{ padding: '12px 16px' }}>
                  <div className="title" style={{ fontSize: 13.5 }}>Spécifications</div>
                </div>
                <div style={{ padding: '4px 16px 12px' }}>
                  {Object.entries(specs).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', padding: '6px 0', fontSize: 12.5, borderBottom: '1px dashed var(--pw-border)' }}>
                      <span style={{ color: 'var(--pw-slate-500)', flex: '0 0 90px', textTransform: 'capitalize' }}>{k}</span>
                      <span style={{ color: 'var(--pw-slate-900)', fontWeight: 500 }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
