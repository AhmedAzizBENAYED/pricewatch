import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'
import { getMarketActivity, getMarketHeatmap, getMarketTrends } from '../../api/tenant'
import { MarketAreaChart, HeatMap, GaugeBig } from '../../components/pw'
import PlanLocked from '../../components/ui/PlanLocked'

// ── TrendCard ─────────────────────────────────────────────────────────────────

function TrendCard({ title, items = [], accent = 'var(--pw-indigo)', loading = false }) {
  return (
    <div className="pw-card" style={{ padding: 16 }}>
      <div className="pw-h3" style={{ marginBottom: 12 }}>{title}</div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="pw-sk" style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="pw-sk" style={{ height: 13, width: '60%', borderRadius: 3, marginBottom: 4 }} />
                <div className="pw-sk" style={{ height: 11, width: '80%', borderRadius: 3 }} />
              </div>
              <div className="pw-sk" style={{ width: 36, height: 13, borderRadius: 3 }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: accent, color: '#fff',
                display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pw-slate-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.name}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)' }}>{it.sub}</div>
              </div>
              <span className="pw-mono" style={{ fontSize: 13, fontWeight: 700, color: accent, flexShrink: 0 }}>
                {it.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Analysis() {
  const user = useAuthStore(s => s.user)
  const plan = user?.plan_abonnement ?? 'BASIC'

  const [period, setPeriod]           = useState('30d')
  const [heatmapLimit, setHeatmapLimit] = useState(10)

  const activityQ = useQuery({ queryKey: ['market-activity', period],        queryFn: () => getMarketActivity(period) })
  const heatmapQ  = useQuery({ queryKey: ['market-heatmap', heatmapLimit],   queryFn: () => getMarketHeatmap(heatmapLimit) })
  const trendsQ   = useQuery({ queryKey: ['market-trends'],                  queryFn: getMarketTrends })

  if (plan !== 'PREMIUM') {
    return <PlanLocked requiredPlan="PREMIUM" featureName="Analyse marché" />
  }

  const total       = activityQ.data?.total || 0
  const gaugeValue  = Math.min(100, Math.round(total / 5))
  const periodLabel = period === '7d' ? '7' : '30'

  const sumArr = arr => (arr || []).reduce((a, b) => a + b, 0)
  const totalBaisses = sumArr(activityQ.data?.baisses)
  const totalHausses = sumArr(activityQ.data?.hausses)
  const domination   = totalBaisses >= totalHausses
    ? 'Les baisses dominent sur la période.'
    : 'Les hausses dominent sur la période.'

  const gaugeColor = gaugeValue > 70 ? 'var(--pw-red)' : gaugeValue > 40 ? 'var(--pw-amber)' : 'var(--pw-teal)'
  const gaugeLabel = gaugeValue > 70 ? 'Marché très actif' : gaugeValue > 40 ? 'Marché modéré' : 'Marché calme'

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="pw-h1">Analyse dynamique du marché</div>
            <span className="pw-pill" style={{
              background: 'linear-gradient(135deg, #EEF2FF, #FFFBEB)',
              borderColor: 'var(--pw-amber-100)',
            }}>
              <span style={{ color: 'var(--pw-amber)' }}>★</span> Premium
            </span>
          </div>
          <div className="pw-muted" style={{ fontSize: 13 }}>
            {periodLabel} derniers jours · {total.toLocaleString('fr-FR')} événements observés
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="pw-btn pw-btn-sm" disabled title="Disponible prochainement">Export Excel</button>
        </div>
      </div>

      {/* ── Section 1 : Activity chart + Gauge ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>

        {/* Activity chart */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div>
              <div className="title">Activité concurrentielle</div>
              <div className="sub">Nombre d'événements par jour</div>
            </div>
            <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: 'var(--pw-slate-600)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#EF4444', marginRight: 6 }} />Hausses</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#0D9488', marginRight: 6 }} />Baisses</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#F59E0B', marginRight: 6 }} />Promos</span>
              <div style={{ display: 'flex', background: 'var(--pw-slate-100)', borderRadius: 7, padding: 3, marginLeft: 4 }}>
                {[['7d', '7j'], ['30d', '30j']].map(([val, label]) => (
                  <button
                    key={val}
                    className="pw-btn pw-btn-sm"
                    style={{
                      background: period === val ? '#fff' : 'transparent',
                      border: 0,
                      boxShadow: period === val ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                      fontWeight: period === val ? 700 : 500,
                    }}
                    onClick={() => setPeriod(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="pw-card-body">
            {activityQ.isLoading ? (
              <div className="pw-sk" style={{ height: 240, width: '100%', borderRadius: 4 }} />
            ) : activityQ.isError ? (
              <div style={{ height: 240, display: 'grid', placeItems: 'center', gap: 8, fontSize: 13, color: 'var(--pw-slate-500)' }}>
                Erreur lors du chargement.
                <button className="pw-btn pw-btn-sm" onClick={() => activityQ.refetch()}>Réessayer</button>
              </div>
            ) : (
              <MarketAreaChart
                dates={activityQ.data?.dates || []}
                hausses={activityQ.data?.hausses || []}
                baisses={activityQ.data?.baisses || []}
                promos={activityQ.data?.promos || []}
              />
            )}
          </div>
        </div>

        {/* Intensity gauge */}
        <div className="pw-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="pw-card-head">
            <div>
              <div className="title">Indice d'intensité</div>
              <div className="sub">Pression concurrentielle</div>
            </div>
          </div>
          <div className="pw-card-body" style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          }}>
            {activityQ.isLoading ? (
              <div className="pw-sk" style={{ width: 180, height: 160, borderRadius: 8 }} />
            ) : (
              <>
                <GaugeBig value={gaugeValue} />
                <div style={{ fontSize: 13, fontWeight: 600, color: gaugeColor, marginTop: 8 }}>
                  {gaugeLabel}
                </div>
                <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 4, lineHeight: 1.5, maxWidth: 220 }}>
                  {domination}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 2 : Heatmap ── */}
      <div className="pw-card" style={{ marginBottom: 16 }}>
        <div className="pw-card-head">
          <div>
            <div className="title">Heatmap d'intensité concurrentielle</div>
            <div className="sub">Catégories × Sites — densité de changements de prix</div>
          </div>
          <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--pw-slate-500)' }}>Top</span>
            <div style={{ display: 'flex', background: 'var(--pw-slate-100)', borderRadius: 7, padding: 3 }}>
              {[5, 10, 15, 20].map(n => (
                <button
                  key={n}
                  className="pw-btn pw-btn-sm"
                  style={{
                    background: heatmapLimit === n ? '#fff' : 'transparent',
                    border: 0,
                    boxShadow: heatmapLimit === n ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                    fontWeight: heatmapLimit === n ? 700 : 500,
                    minWidth: 32,
                  }}
                  onClick={() => setHeatmapLimit(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'var(--pw-slate-500)' }}>catégories</span>
          </div>
        </div>
        <div className="pw-card-body">
          {heatmapQ.isLoading ? (
            <div className="pw-sk" style={{ height: 200, width: '100%', borderRadius: 4 }} />
          ) : heatmapQ.isError ? (
            <div style={{ height: 160, display: 'grid', placeItems: 'center', gap: 8, fontSize: 13, color: 'var(--pw-slate-500)' }}>
              Erreur lors du chargement.
              <button className="pw-btn pw-btn-sm" onClick={() => heatmapQ.refetch()}>Réessayer</button>
            </div>
          ) : (
            <HeatMap
              categories={heatmapQ.data?.categories || []}
              sites={heatmapQ.data?.sites || []}
              data={heatmapQ.data?.data || []}
            />
          )}
        </div>
      </div>

      {/* ── Section 3 : Trend cards ── */}
      {trendsQ.isError ? (
        <div className="pw-card" style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--pw-slate-500)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          Erreur lors du chargement des tendances.
          <button className="pw-btn pw-btn-sm" onClick={() => trendsQ.refetch()}>Réessayer</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <TrendCard
            title="Catégories les plus actives"
            accent="var(--pw-indigo)"
            loading={trendsQ.isLoading}
            items={(trendsQ.data?.top_categories || []).map(c => ({
              name:  c.nom,
              sub:   `${c.nb_evenements} événements`,
              value: c.nb_evenements,
            }))}
          />
          <TrendCard
            title="Concurrents les plus agressifs"
            accent="var(--pw-red)"
            loading={trendsQ.isLoading}
            items={(trendsQ.data?.top_competitors || []).map(c => ({
              name:  c.site_name,
              sub:   `${c.nb_baisses} baisses · ${c.nb_promos} promos`,
              value: c.nb_baisses,
            }))}
          />
          <TrendCard
            title="Produits les plus volatils"
            accent="var(--pw-amber)"
            loading={trendsQ.isLoading}
            items={(trendsQ.data?.top_volatils || []).map(p => ({
              name:  (p.nom_produit || '').slice(0, 30),
              sub:   `${p.nb_changements} changements en 30j`,
              value: `${p.nb_changements}×`,
            }))}
          />
        </div>
      )}
    </div>
  )
}
