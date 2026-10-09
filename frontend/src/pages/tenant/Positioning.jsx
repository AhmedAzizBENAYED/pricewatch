import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  getPositioning,
  getPositioningCategories,
  getPositioningCompetitors,
} from '../../api/tenant'
import { useAuthStore } from '../../store/auth'
import { formatNumber } from '../../utils/pw'
import { SiteLogo, SiteRow, Sparkline } from '../../components/pw'
import { IcoSearch, IcoFilter, IcoChevD, IcoArrow } from '../../components/icons'
import PlanLocked from '../../components/ui/PlanLocked'

// ── Skeletons ─────────────────────────────────────────────────────────────────

function SkRow({ cols }) {
  return (
    <tr>
      {Array(cols).fill(0).map((_, i) => (
        <td key={i}><div className="pw-sk" style={{ height: 14, width: i === 0 ? '70%' : '50%', borderRadius: 4 }} /></td>
      ))}
    </tr>
  )
}

function SkBar() {
  return (
    <div>
      <div style={{ display: 'flex', marginBottom: 6, gap: 8 }}>
        <div className="pw-sk" style={{ height: 14, width: 140, borderRadius: 4 }} />
        <div className="pw-sk" style={{ height: 14, width: 60, borderRadius: 4 }} />
      </div>
      <div className="pw-sk" style={{ height: 18, width: '100%', borderRadius: 4 }} />
    </div>
  )
}

// ── Tab 1 — Par produit ────────────────────────────────────────────────────────

function TabProduct({ positioningQ, debouncedQ, catFilter, navigate }) {
  if (positioningQ.isError) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13 }}>
        Erreur lors du chargement.{' '}
        <button className="pw-btn pw-btn-sm" onClick={() => positioningQ.refetch()}>Réessayer</button>
      </div>
    )
  }

  if (positioningQ.isLoading) {
    return (
      <table className="pw-table">
        <thead>
          <tr>
            <th style={{ width: '32%' }}>Produit</th>
            <th>Catégorie</th>
            <th style={{ textAlign: 'right' }}>Notre prix</th>
            <th style={{ textAlign: 'right' }}>Prix min marché</th>
            <th>Site moins cher</th>
            <th style={{ textAlign: 'right' }}>Écart</th>
            <th style={{ textAlign: 'right' }}>Évolution 30j</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>{Array(8).fill(0).map((_, i) => <SkRow key={i} cols={8} />)}</tbody>
      </table>
    )
  }

  const produits = positioningQ.data?.produits ?? []

  const filtered = produits.filter(p => {
    if (debouncedQ && !p.nom_produit?.toLowerCase().includes(debouncedQ.toLowerCase())) return false
    if (catFilter && p.categorie_nom !== catFilter) return false
    return true
  })

  if (!filtered.length) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
        Aucun produit ne correspond à vos filtres.
      </div>
    )
  }

  return (
    <table className="pw-table">
      <thead>
        <tr>
          <th style={{ width: '32%' }}>Produit</th>
          <th>Catégorie</th>
          <th style={{ textAlign: 'right' }}>Notre prix</th>
          <th style={{ textAlign: 'right' }}>Prix min marché</th>
          <th>Site moins cher</th>
          <th style={{ textAlign: 'right' }}>Écart</th>
          <th style={{ textAlign: 'right' }}>Évolution 30j</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((p) => {
          const isBest = p.position === 'moins_cher'
          const isSame = p.position === 'dans_moyenne'
          const isOver = p.position === 'plus_cher'
          const refPrice = p.market_min ?? p.market_avg
          const ecart = refPrice
            ? ((p.own_price - refPrice) / refPrice * 100)
            : null

          return (
            <tr
              key={p.produit_id}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/tenant/products/${p.produit_id}`)}
            >
              <td>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {p.image
                    ? <img
                        src={p.image}
                        alt=""
                        style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, objectFit: 'contain', background: 'var(--pw-slate-50)', border: '1px solid var(--pw-border)' }}
                        onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
                      />
                    : null
                  }
                  <div
                    className="pw-placeholder"
                    style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, fontSize: 8, display: p.image ? 'none' : 'flex' }}
                  />
                  <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35 }}>
                    {p.nom_produit}
                  </span>
                </div>
              </td>
              <td><span className="pw-pill slate">{p.categorie_nom}</span></td>
              <td style={{ textAlign: 'right' }}>
                <span className="pw-mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {formatNumber(p.own_price)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--pw-slate-400)' }}>TND</span>
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <span className="pw-mono" style={{ fontSize: 13, color: 'var(--pw-slate-500)' }}>
                  {refPrice != null ? formatNumber(refPrice) : '—'} <span style={{ fontSize: 11, color: 'var(--pw-slate-400)' }}>TND</span>
                </span>
              </td>
              <td>
                {isBest
                  ? <span className="pw-mono" style={{ fontSize: 12, color: 'var(--pw-slate-400)' }}>— référence</span>
                  : p.cheapest_site_slug
                    ? <SiteRow slug={p.cheapest_site_slug} name={p.cheapest_site_name} />
                    : <span style={{ color: 'var(--pw-slate-400)' }}>—</span>
                }
              </td>
              <td style={{ textAlign: 'right' }}>
                {ecart == null
                  ? <span className="pw-mono" style={{ fontSize: 12, color: 'var(--pw-slate-400)' }}>—</span>
                  : Math.abs(ecart) < 0.05
                  ? <span className="pw-mono" style={{ fontSize: 12, color: 'var(--pw-slate-500)' }}>0%</span>
                  : ecart > 0
                  ? <span className="pw-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--pw-red)' }}>+{ecart.toFixed(1)}%</span>
                  : <span className="pw-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--pw-teal)' }}>{ecart.toFixed(1)}%</span>
                }
              </td>
              <td style={{ textAlign: 'right' }}>
                {(() => {
                  const stroke = isBest ? 'var(--pw-teal)' : isOver ? 'var(--pw-red)' : 'var(--pw-slate-300)'
                  const fill   = isBest ? 'rgba(13,148,136,.1)' : isOver ? 'rgba(239,68,68,.1)' : 'rgba(0,0,0,.04)'
                  const mapped = (p.history ?? [])
                    .filter(v => v !== null)
                    .map(v => v === 1 ? 80 : v === 0 ? 50 : 20)
                  return mapped.length > 1
                    ? <Sparkline data={mapped} w={70} h={20} stroke={stroke} fill={fill} />
                    : <span style={{ color: 'var(--pw-slate-300)', fontSize: 12 }}>—</span>
                })()}
              </td>
              <td>
                {isBest && <span className="pw-pill green">Moins cher</span>}
                {isSame && <span className="pw-pill slate">Au marché</span>}
                {isOver && <span className="pw-pill red">Plus cher</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Tab 2 — Par catégorie ─────────────────────────────────────────────────────

function TabCategory({ categoriesQ, onCategoryClick }) {
  if (categoriesQ.isError) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13 }}>
        Erreur lors du chargement.{' '}
        <button className="pw-btn pw-btn-sm" onClick={() => categoriesQ.refetch()}>Réessayer</button>
      </div>
    )
  }

  if (categoriesQ.isLoading) {
    return (
      <div style={{ padding: 18 }}>
        <div className="pw-h3" style={{ marginBottom: 12 }}>Répartition par catégorie</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array(5).fill(0).map((_, i) => <SkBar key={i} />)}
        </div>
      </div>
    )
  }

  const cats = categoriesQ.data ?? []

  if (!cats.length) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
        Aucune donnée de positionnement.
      </div>
    )
  }

  return (
    <div style={{ padding: 18 }}>
      <div className="pw-h3" style={{ marginBottom: 12 }}>Répartition par catégorie</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cats.map(c => (
          <div
            key={c.categorie_nom}
            style={{ cursor: 'pointer' }}
            onClick={() => onCategoryClick(c.categorie_nom)}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.categorie_nom}</span>
              <span style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginLeft: 8 }}>
                {c.total} produits
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--pw-slate-500)' }}>
                <span style={{ color: 'var(--pw-teal)', fontWeight: 600 }}>{c.pct_moins_cher}%</span>
                {' · '}
                <span style={{ color: 'var(--pw-slate-600)', fontWeight: 600 }}>{c.pct_dans_moyenne}%</span>
                {' · '}
                <span style={{ color: 'var(--pw-red)', fontWeight: 600 }}>{c.pct_plus_cher}%</span>
              </span>
            </div>
            <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${c.pct_moins_cher}%`, background: 'var(--pw-teal)', minWidth: c.moins_cher > 0 ? 1 : 0 }} />
              <div style={{ width: `${c.pct_dans_moyenne}%`, background: 'var(--pw-slate-300)', minWidth: c.dans_moyenne > 0 ? 1 : 0 }} />
              <div style={{ width: `${c.pct_plus_cher}%`, background: 'var(--pw-red)', minWidth: c.plus_cher > 0 ? 1 : 0 }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18, fontSize: 12, color: 'var(--pw-slate-500)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--pw-teal)', marginRight: 6 }} />
          Nous sommes les moins chers
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--pw-slate-300)', marginRight: 6 }} />
          Égal au marché
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--pw-red)', marginRight: 6 }} />
          Nous sommes les plus chers
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--pw-indigo-700)', fontWeight: 600 }}>
          Cliquer une catégorie pour filtrer les produits ↑
        </span>
      </div>
    </div>
  )
}

// ── Tab 3 — Par concurrent ────────────────────────────────────────────────────

function TabCompetitor({ competitorsQ, totalProduits, isMarque, onSwitchToCat, navigate }) {
  if (isMarque) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', background: 'var(--pw-slate-100)',
          display: 'grid', placeItems: 'center', margin: '0 auto 16px',
          color: 'var(--pw-slate-400)',
        }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--pw-slate-800)', marginBottom: 8 }}>
          Vue par concurrent non disponible pour les marques.
        </div>
        <div style={{ fontSize: 13, color: 'var(--pw-slate-500)', lineHeight: 1.6, marginBottom: 20 }}>
          Les marques surveillent leurs produits sur tous les distributeurs. Consultez l'onglet <strong>Par catégorie</strong> pour comparer vos gammes aux concurrents.
        </div>
        <button className="pw-btn pw-btn-sm" onClick={onSwitchToCat}>
          Voir par catégorie
        </button>
      </div>
    )
  }

  if (competitorsQ.isError) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--pw-slate-500)', fontSize: 13 }}>
        Erreur lors du chargement.{' '}
        <button className="pw-btn pw-btn-sm" onClick={() => competitorsQ.refetch()}>Réessayer</button>
      </div>
    )
  }

  if (competitorsQ.isLoading) {
    return (
      <table className="pw-table">
        <thead>
          <tr>
            <th>Concurrent</th>
            <th style={{ textAlign: 'right' }}>Produits moins chers que nous</th>
            <th>Intensité concurrentielle</th>
            <th style={{ textAlign: 'right' }}>Promotions actives</th>
            <th></th>
          </tr>
        </thead>
        <tbody>{Array(4).fill(0).map((_, i) => <SkRow key={i} cols={5} />)}</tbody>
      </table>
    )
  }

  const rows = competitorsQ.data ?? []
  const total = totalProduits || 1

  return (
    <table className="pw-table">
      <thead>
        <tr>
          <th>Concurrent</th>
          <th style={{ textAlign: 'right' }}>Produits moins chers que nous</th>
          <th>Intensité concurrentielle</th>
          <th style={{ textAlign: 'right' }}>Promotions actives</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const nb = r.nb_moins_chers
          const numColor = nb > total * 0.35
            ? 'var(--pw-red)'
            : nb > total * 0.15
              ? 'var(--pw-amber)'
              : 'var(--pw-slate-700)'
          const barColor = r.intensite > 7
            ? 'var(--pw-red)'
            : r.intensite > 4
              ? 'var(--pw-amber)'
              : 'var(--pw-teal)'

          return (
            <tr key={r.site_slug} style={{ background: i === 0 ? 'rgba(239,68,68,.04)' : '#fff' }}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SiteLogo slug={r.site_slug} size={32} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.site_name}</div>
                    {i === 0 && (
                      <span className="pw-pill red" style={{ fontSize: 10 }}>Concurrent le plus agressif</span>
                    )}
                  </div>
                </div>
              </td>
              <td style={{ textAlign: 'right' }}>
                <span className="pw-mono" style={{ fontSize: 16, fontWeight: 700, color: numColor }}>
                  {nb}
                </span>
                <span className="pw-mono" style={{ fontSize: 11, color: 'var(--pw-slate-500)' }}>
                  {' / '}{total}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  {Array(10).fill(0).map((_, k) => (
                    <span
                      key={k}
                      style={{
                        width: 8, height: 14, borderRadius: 2,
                        background: k < r.intensite ? barColor : 'var(--pw-slate-100)',
                      }}
                    />
                  ))}
                  <span className="pw-mono" style={{ marginLeft: 8, fontSize: 12, fontWeight: 600 }}>
                    {r.intensite}/10
                  </span>
                </div>
              </td>
              <td style={{ textAlign: 'right' }} className="pw-mono">
                <span style={{ fontWeight: 600 }}>{r.nb_promos_actives}</span>
              </td>
              <td>
                <button
                  className="pw-btn pw-btn-sm pw-btn-ghost"
                  onClick={() => navigate(`/tenant/events?site_slug=${r.site_slug}`)}
                >
                  Détail <IcoArrow />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Positioning() {
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)
  const isMarque = useAuthStore(s => s.isMarque)()

  const [tab, setTab]       = useState('product')
  const [q, setQ]           = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [catFilter, setCatFilter]   = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 400)
    return () => clearTimeout(t)
  }, [q])

  const plan = user?.plan_abonnement ?? 'BASIC'

  const positioningQ  = useQuery({
    queryKey: ['positioning', { include_history: true }],
    queryFn:  () => getPositioning({ include_history: true }),
  })
  const categoriesQ   = useQuery({ queryKey: ['pos-categories'],   queryFn: getPositioningCategories })
  const competitorsQ  = useQuery({ queryKey: ['pos-competitors'],  queryFn: getPositioningCompetitors })

  const catOptions = useMemo(() => {
    const data = categoriesQ.data ?? []
    return data.map(c => c.categorie_nom)
  }, [categoriesQ.data])

  const totalProduits = positioningQ.data?.total_produits ?? 0

  if (plan === 'BASIC') {
    return <PlanLocked requiredPlan="MEDIUM" featureName="Positionnement" />
  }

  function handleCategoryClick(nom) {
    setCatFilter(nom)
    setTab('product')
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="pw-h1">Analyse de positionnement</div>
          <div className="pw-muted" style={{ fontSize: 13 }}>
            Comment vos prix se comparent au marché — par produit, catégorie ou concurrent.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="pw-pill slate">Position actuelle</span>
          <button className="pw-btn pw-btn-sm" disabled title="Disponible prochainement">Export</button>
        </div>
      </div>

      {/* Card */}
      <div className="pw-card" style={{ overflow: 'hidden' }}>

        {/* Tabs */}
        <div className="pw-tabs" style={{ padding: '0 16px' }}>
          <div
            className={`tab${tab === 'product' ? ' is-active' : ''}`}
            onClick={() => setTab('product')}
          >
            Par produit
          </div>
          <div
            className={`tab${tab === 'cat' ? ' is-active' : ''}`}
            onClick={() => setTab('cat')}
          >
            Par catégorie
          </div>
          <div
            className={`tab${tab === 'comp' ? ' is-active' : ''}`}
            onClick={() => setTab('comp')}
          >
            Par concurrent
          </div>
        </div>

        {/* Filters bar */}
        <div style={{
          display: 'flex', gap: 8, padding: '12px 16px',
          borderBottom: '1px solid var(--pw-border)', alignItems: 'center',
        }}>
          <div className="pw-input" style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', fontSize: 12, flex: 1, maxWidth: 320, gap: 6 }}>
            <IcoSearch />
            <input
              placeholder="Filtrer les produits..."
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ border: 0, outline: 0, background: 'transparent', fontSize: 12, flex: 1 }}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <select
              className="pw-btn pw-btn-sm"
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              style={{ paddingRight: 28, appearance: 'none', cursor: 'pointer' }}
            >
              <option value="">Catégorie</option>
              {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <IcoChevD size={12} />
            </span>
          </div>
          <button className="pw-btn pw-btn-sm" disabled title="Disponible prochainement">
            Site <IcoChevD size={12} />
          </button>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--pw-slate-500)' }}>
            <span className="pw-mono" style={{ color: 'var(--pw-slate-900)', fontWeight: 600 }}>
              {totalProduits}
            </span>{' '}
            produits suivis
          </div>
        </div>

        {/* Tab content */}
        {tab === 'product' && (
          <TabProduct
            positioningQ={positioningQ}
            debouncedQ={debouncedQ}
            catFilter={catFilter}
            navigate={navigate}
          />
        )}
        {tab === 'cat' && (
          <TabCategory
            categoriesQ={categoriesQ}
            onCategoryClick={handleCategoryClick}
          />
        )}
        {tab === 'comp' && (
          <TabCompetitor
            competitorsQ={competitorsQ}
            totalProduits={totalProduits}
            isMarque={isMarque}
            onSwitchToCat={() => setTab('cat')}
            navigate={navigate}
          />
        )}
      </div>
    </div>
  )
}
