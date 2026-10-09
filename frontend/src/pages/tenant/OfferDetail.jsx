import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getOffer, getOfferHistory } from '../../api/tenant'
import { formatNumber, timeAgo } from '../../utils/pw'
import { SiteLogo, SingleLineChart, PriceChange, SITE_CONFIG } from '../../components/pw'
import {
  IcoArrowL, IcoExt, IcoDownload, IcoTag, IcoChevR,
} from '../../components/icons'

// ── Period config ─────────────────────────────────────────────────────────────

const PERIOD_LABELS = ['30j', '60j', '90j', 'Tout']
const PERIOD_API    = { '30j': '30d', '60j': '60d', '90j': '90d', 'Tout': 'all' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const d  = new Date(dateStr)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function stockClass(status) {
  if (!status) return null
  const s = status.toUpperCase()
  if (s.includes('RUPTURE') || s.includes('OUT') || s.includes('INDISPONIBLE')) return 'out'
  if (s.includes('LOW') || s.includes('FAIBLE') || s.includes('BAS'))           return 'low'
  return 'in'
}

function StockBadge({ status }) {
  const cls    = stockClass(status)
  const labels = { in: 'En stock', out: 'Rupture', low: 'Faible' }
  if (!cls) return <span style={{ color: 'var(--pw-slate-300)' }}>—</span>
  return <span className={`pw-stock ${cls}`}>{labels[cls]}</span>
}

function durationDays(start, end) {
  if (!start || !end) return null
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000))
}

// ── Skeleton rows for the table ───────────────────────────────────────────────

function SkTableRows() {
  return Array.from({ length: 7 }).map((_, i) => (
    <tr key={i}>
      {[70, 64, 72, 48, 56, 36].map((w, j) => (
        <td key={j}><div className="pw-sk" style={{ height: 11, width: w, borderRadius: 4 }} /></td>
      ))}
    </tr>
  ))
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OfferDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('60j')

  const offerQ = useQuery({
    queryKey: ['offer', id],
    queryFn:  () => getOffer(id),
  })

  const historyQ = useQuery({
    queryKey: ['offer-history', id, period],
    queryFn:  () => getOfferHistory(id, PERIOD_API[period]),
    placeholderData: keepPreviousData,
  })

  const offer = offerQ.data

  // ── Loading ────────────────────────────────────────────────────────────────
  if (offerQ.isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <div className="pw-sk" style={{ height: 14, width: 200, borderRadius: 6, marginBottom: 20 }} />
        <div className="pw-card" style={{ padding: 20, display: 'flex', gap: 20 }}>
          <div className="pw-sk" style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="pw-sk" style={{ height: 22, width: '50%', borderRadius: 6 }} />
            <div className="pw-sk" style={{ height: 11, width: 300, borderRadius: 4 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginTop: 6 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="pw-sk" style={{ height: 10, width: 70, borderRadius: 4 }} />
                  <div className="pw-sk" style={{ height: 24, width: '80%', borderRadius: 5 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Error / not found ──────────────────────────────────────────────────────
  if (offerQ.isError || !offer) {
    return (
      <div style={{ padding: 24 }}>
        <button className="pw-btn pw-btn-ghost pw-btn-sm" onClick={() => navigate(-1)}
                style={{ paddingLeft: 4, marginBottom: 14 }}>
          <IcoArrowL /> Retour
        </button>
        <div className="pw-card" style={{ padding: 40, textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 14 }}>
          Offre introuvable.
        </div>
      </div>
    )
  }

  const snap     = offer.snapshot_courant
  const siteColor = SITE_CONFIG[offer.site_slug]?.color ?? 'var(--pw-slate-400)'
  const scoreInt  = offer.score_qualite != null ? Math.round(offer.score_qualite * 5) : null

  const firstObsDate = historyQ.data?.snapshots?.length
    ? fmtDate(historyQ.data.snapshots[0].date_debut_observation)
    : offer.scrapper?.date_debut ? fmtDate(offer.scrapper.date_debut) : null

  const snapshots = [...(historyQ.data?.snapshots ?? [])].reverse()

  const lastObsDate = snap?.date_debut_observation
    ? new Date(snap.date_debut_observation).toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—'
  const lastObsTime = snap?.date_debut_observation
    ? new Date(snap.date_debut_observation).toLocaleTimeString('fr-FR', {
        hour: '2-digit', minute: '2-digit',
      })
    : ''

  return (
    <div style={{ padding: 24 }}>

      {/* Back */}
      <button
        className="pw-btn pw-btn-ghost pw-btn-sm"
        onClick={() => offer.produit_id ? navigate(`/tenant/products/${offer.produit_id}`) : navigate(-1)}
        style={{ marginBottom: 14, paddingLeft: 4 }}
      >
        <IcoArrowL /> {offer.nom || 'Retour'}
      </button>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--pw-slate-400)', marginBottom: 16, flexWrap: 'wrap' }}>
        {offer.produit_id && (
          <>
            <span style={{ cursor: 'pointer', color: 'var(--pw-indigo)' }}
                  onClick={() => navigate('/tenant/products')}>Catalogue</span>
            <IcoChevR size={12} />
            <span style={{ cursor: 'pointer', color: 'var(--pw-indigo)' }}
                  onClick={() => navigate(`/tenant/products/${offer.produit_id}`)}>
              {offer.nom}
            </span>
            <IcoChevR size={12} />
          </>
        )}
        <span style={{ color: 'var(--pw-slate-700)', fontWeight: 500 }}>
          Offre {offer.site_name || offer.site_slug || '—'}
        </span>
      </div>

      {/* ── Top info card ──────────────────────────────────────────────────── */}
      <div className="pw-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

          {/* Site logo */}
          <SiteLogo slug={offer.site_slug} size={36} />

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Name + badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-.015em', lineHeight: 1.2 }}>
                {offer.nom || '—'}
              </h1>
              <span className="pw-pill">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: siteColor, display: 'inline-block', flexShrink: 0 }} />
                {offer.site_name || offer.site_slug || '—'}
              </span>
            </div>

            {/* Sub line */}
            <div style={{ fontSize: 12.5, color: 'var(--pw-slate-500)', marginTop: 4 }}>
              {firstObsDate && (
                <>Listing observé pour la première fois le <strong>{firstObsDate}</strong> · </>
              )}
              ID offre <span className="pw-mono">{offer.id}</span>
            </div>

            {/* 4 stat columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 18 }}>

              {/* Prix actuel */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                  Prix actuel
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                  <span className="pw-mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--pw-slate-900)' }}>
                    {snap?.prix_original != null ? `${formatNumber(snap.prix_original)} TND` : '—'}
                  </span>
                </div>
                {offer.delta_pct != null && (
                  <div style={{ marginTop: 4 }}>
                    <PriceChange pct={offer.delta_pct} abs={Math.abs(offer.delta_absolu ?? 0)} />
                  </div>
                )}
                {snap?.prix_en_promotion != null && (
                  <div style={{ marginTop: 2 }}>
                    <span className="pw-pill amber" style={{ fontSize: 10 }}>
                      <IcoTag /> Promo {formatNumber(snap.prix_en_promotion)} TND
                    </span>
                  </div>
                )}
              </div>

              {/* Statut stock */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                  Statut stock
                </div>
                <div style={{ marginTop: 6 }}>
                  <StockBadge status={snap?.stock_status ?? offer.statut_stock} />
                </div>
                {snap?.nb_observations_identiques != null && snap.nb_observations_identiques > 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 4 }}>
                    Stable depuis {snap.nb_observations_identiques}j
                  </div>
                )}
              </div>

              {/* Dernière obs. */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                  Dernière obs.
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, color: 'var(--pw-slate-900)' }}>
                  {snap ? timeAgo(snap.date_debut_observation) : '—'}
                </div>
                {snap && (
                  <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 4 }}>
                    {lastObsDate}{lastObsTime ? ` · ${lastObsTime}` : ''}
                  </div>
                )}
              </div>

              {/* Score qualité */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                  Score qualité données
                </div>
                {scoreInt != null ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      {[1,2,3,4,5].map(i => (
                        <span key={i} style={{
                          width: 16, height: 6, borderRadius: 2,
                          background: i <= scoreInt ? 'var(--pw-indigo)' : 'var(--pw-slate-200)',
                        }} />
                      ))}
                      <span className="pw-mono" style={{ fontSize: 12, fontWeight: 600, marginLeft: 4 }}>
                        {scoreInt} / 5
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 4 }}>
                      {scoreInt >= 4 ? 'Données complètes, mise à jour régulière'
                       : scoreInt >= 3 ? 'Données partielles'
                       : 'Données incomplètes'}
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 6, color: 'var(--pw-slate-300)' }}>—</div>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            {offer.url_produit ? (
              <a
                href={offer.url_produit}
                target="_blank"
                rel="noopener noreferrer"
                className="pw-btn pw-btn-primary"
                style={{ textDecoration: 'none' }}
              >
                <IcoExt /> Voir sur {offer.site_name || offer.site_slug || 'le site'}
              </a>
            ) : (
              <button className="pw-btn pw-btn-primary" disabled title="URL non disponible">
                <IcoExt /> Voir sur {offer.site_name || 'le site'}
              </button>
            )}
            <button className="pw-btn" disabled title="Disponible prochainement"><IcoDownload /> Export CSV</button>
          </div>
        </div>
      </div>

      {/* ── Two-column grid ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

        {/* LEFT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Price history chart */}
          <div className="pw-card">
            <div className="pw-card-head">
              <div>
                <div className="title">Historique sur {offer.site_name || offer.site_slug || '—'}</div>
                <div className="sub">
                  {period === 'Tout'
                    ? 'Tout l\'historique · zones ambrées = promotions'
                    : `${period} derniers jours · zones ambrées = promotions`}
                </div>
              </div>
              <div className="right">
                <div style={{ display: 'flex', background: 'var(--pw-slate-100)', borderRadius: 7, padding: 3 }}>
                  {PERIOD_LABELS.map(p => (
                    <button key={p} className="pw-btn pw-btn-sm" onClick={() => setPeriod(p)} style={{
                      background:  period === p ? '#fff' : 'transparent',
                      border: 0,
                      boxShadow:   period === p ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                      fontWeight:  period === p ? 700 : 500,
                    }}>{p}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="pw-card-body">
              {historyQ.isLoading
                ? <div className="pw-sk" style={{ height: 220, borderRadius: 8 }} />
                : historyQ.isError
                ? (
                  <div style={{ height: 220, display: 'grid', placeItems: 'center', gap: 8, fontSize: 13, color: 'var(--pw-slate-500)' }}>
                    Erreur lors du chargement de l'historique.
                    <button className="pw-btn pw-btn-sm" onClick={() => historyQ.refetch()}>Réessayer</button>
                  </div>
                )
                : <SingleLineChart snapshots={historyQ.data?.snapshots} height={220} />
              }
            </div>
          </div>

          {/* Detailed evolution table */}
          <div className="pw-card">
            <div className="pw-card-head">
              <div>
                <div className="title">Évolution détaillée</div>
                <div className="sub">Chaque ligne = un état observé</div>
              </div>
              <div className="right">
                <button className="pw-btn pw-btn-sm" disabled><IcoDownload /> CSV</button>
              </div>
            </div>
            <table className="pw-table">
              <thead>
                <tr>
                  <th>Date début</th>
                  <th>Date fin</th>
                  <th style={{ textAlign: 'right' }}>Prix</th>
                  <th>Promo</th>
                  <th>Stock</th>
                  <th>Durée</th>
                </tr>
              </thead>
              <tbody>
                {historyQ.isLoading
                  ? <SkTableRows />
                  : historyQ.isError
                  ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13, padding: '32px 0' }}>
                        Erreur lors du chargement.{' '}
                        <button className="pw-btn pw-btn-sm" onClick={() => historyQ.refetch()}>Réessayer</button>
                      </td>
                    </tr>
                  )
                  : snapshots.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13, padding: '32px 0' }}>
                        Aucune donnée historique disponible
                      </td>
                    </tr>
                  )
                  : snapshots.map((s, i) => {
                      const isActive = s.date_fin_observation == null
                      const dur      = durationDays(s.date_debut_observation, s.date_fin_observation)

                      return (
                        <tr key={s.id} style={{ background: isActive ? 'rgba(99,102,241,.04)' : '#fff' }}>
                          <td>
                            <span className="pw-mono" style={{ fontSize: 12.5 }}>
                              {fmtDate(s.date_debut_observation)}
                            </span>
                          </td>
                          <td>
                            {isActive
                              ? <span className="pw-pill indigo" style={{ fontSize: 10 }}>Actuel</span>
                              : <span className="pw-mono" style={{ fontSize: 12.5 }}>{fmtDate(s.date_fin_observation)}</span>
                            }
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              {s.prix_en_promotion != null ? (
                                <>
                                  <span className="pw-mono" style={{ fontSize: 12, color: 'var(--pw-slate-400)', textDecoration: 'line-through' }}>
                                    {formatNumber(s.prix_original)} TND
                                  </span>
                                  <span className="pw-mono" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--pw-slate-900)' }}>
                                    {formatNumber(s.prix_en_promotion)} TND
                                  </span>
                                </>
                              ) : (
                                <span className="pw-mono" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--pw-slate-900)' }}>
                                  {s.prix_original != null ? `${formatNumber(s.prix_original)} TND` : '—'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            {s.prix_en_promotion != null
                              ? <span className="pw-pill amber"><IcoTag /> Soldes</span>
                              : <span style={{ color: 'var(--pw-slate-300)' }}>—</span>
                            }
                          </td>
                          <td>
                            <StockBadge status={s.stock_status} />
                          </td>
                          <td>
                            {isActive
                              ? <span style={{ fontSize: 12, color: 'var(--pw-slate-400)', fontStyle: 'italic' }}>En cours</span>
                              : dur != null
                              ? <span className="pw-mono" style={{ fontSize: 12.5 }}>{dur}j</span>
                              : <span style={{ color: 'var(--pw-slate-300)' }}>—</span>
                            }
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Normalized specs */}
          {offer.specs_normalises && Object.keys(offer.specs_normalises).length > 0 && (
            <div className="pw-card">
              <div className="pw-card-head" style={{ padding: '12px 16px' }}>
                <div className="title" style={{ fontSize: 13.5 }}>Spécifications normalisées</div>
              </div>
              <div style={{ padding: '4px 16px 16px' }}>
                {Object.entries(offer.specs_normalises).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', padding: '7px 0', fontSize: 12.5, borderBottom: '1px dashed var(--pw-border)' }}>
                    <span style={{ color: 'var(--pw-slate-500)', flex: '0 0 110px', textTransform: 'capitalize' }}>{k}</span>
                    <span style={{ color: 'var(--pw-slate-900)', fontWeight: 500 }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Offer metrics — volatilité dérivée du nombre de changements de prix observés */}
          {offer.metriques && (
            <div className="pw-card">
              <div className="pw-card-head" style={{ padding: '12px 16px' }}>
                <div className="title" style={{ fontSize: 13.5 }}>Métriques offre</div>
              </div>
              <div style={{ padding: '4px 16px 16px' }}>
                {[
                  ['Nombre de changements de prix', offer.metriques.nb_changements_prix ?? '—'],
                  ['Nombre de promotions',           offer.metriques.nb_promotions ?? '—'],
                  ['Jours en promotion',             offer.metriques.jours_en_promotion != null ? `${offer.metriques.jours_en_promotion} j` : '—'],
                  ['Jours en rupture',               offer.metriques.jours_en_rupture != null ? `${offer.metriques.jours_en_rupture} j` : '—'],
                  ['Prix moyen 90j',                 offer.metriques.prix_moyen_90j != null ? `${formatNumber(offer.metriques.prix_moyen_90j)} TND` : '—'],
                  ['Volatilité',                     offer.metriques.nb_changements_prix == null ? '—'
                                                      : offer.metriques.nb_changements_prix >= 5 ? 'Élevée'
                                                      : offer.metriques.nb_changements_prix >= 2 ? 'Moyenne'
                                                      : 'Faible'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', padding: '7px 0', fontSize: 12.5, borderBottom: '1px dashed var(--pw-border)' }}>
                    <span style={{ color: 'var(--pw-slate-500)', flex: 1 }}>{label}</span>
                    <span className="pw-mono" style={{ color: 'var(--pw-slate-900)', fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
