// Shared design-system components used across all tenant screens.
// Matches the SiteLogo, SiteRow, PriceChange, Sparkline from _chrome.jsx.

import { IcoUp, IcoDown, IcoX } from './icons'

export const SITE_CONFIG = {
  mytek:      { mark: 'MT', color: 'var(--pw-site-mytek)' },
  spacenet:   { mark: 'SP', color: 'var(--pw-site-spacenet)' },
  tunisianet: { mark: 'TN', color: 'var(--pw-site-tunisianet)' },
  carrefour:  { mark: 'CR', color: 'var(--pw-site-carrefour)' },
  aziza:      { mark: 'AZ', color: 'var(--pw-site-aziza)' },
  geant:      { mark: 'GT', color: 'var(--pw-site-geant)' },
}

export function SiteLogo({ slug, size = 28 }) {
  const key = (slug ?? '').toLowerCase()
  const cfg = SITE_CONFIG[key] ?? { mark: (slug?.slice(0, 2) ?? '??').toUpperCase(), color: 'var(--pw-slate-400)' }
  return (
    <div
      className={`pw-site-logo ${key}`}
      style={{ width: size, height: size, borderRadius: size > 24 ? 7 : 5 }}
    >
      {cfg.mark}
    </div>
  )
}

export function SiteRow({ slug, name }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <SiteLogo slug={slug} size={22} />
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pw-slate-800)' }}>
        {name || slug || '—'}
      </span>
    </span>
  )
}

export function PriceChange({ pct, abs, ccy = 'TND' }) {
  if (pct === 0) return <span className="pw-change flat"><IcoX size={10} /> 0%</span>
  const dir = pct > 0 ? 'up' : 'down'
  return (
    <span className={`pw-change ${dir}`}>
      {pct > 0 ? <IcoUp size={11} /> : <IcoDown size={11} />}
      {abs != null && <span>{Math.abs(Math.round(abs))} {ccy}</span>}
      <span>({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
    </span>
  )
}

export function MultiLineChart({ labels = [], series = [], height = 240 }) {
  const W = 760, H = height
  const P = { l: 52, r: 20, t: 24, b: 30 }
  const innerW = W - P.l - P.r
  const innerH = H - P.t - P.b

  const allPrices = series.flatMap(s => (s.prix || []).filter(v => v != null))
  if (!allPrices.length || !labels.length) {
    return <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>Pas de données</div>
  }

  const rawMin = Math.min(...allPrices)
  const rawMax = Math.max(...allPrices)
  const pad    = Math.ceil((rawMax - rawMin) * 0.12 / 100) * 100 || 100
  const yMin   = Math.floor((rawMin - pad) / 100) * 100
  const yMax   = Math.ceil((rawMax  + pad) / 100) * 100
  const n      = labels.length

  const cx = i => P.l + (i / Math.max(n - 1, 1)) * innerW
  const cy = v => P.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH

  const yStep = Math.ceil((yMax - yMin) / 5 / 100) * 100 || 100
  const yTicks = []
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(v)

  const xStep = Math.max(1, Math.ceil(n / 6))
  const xIdxs = [...new Set([0, ...Array.from({ length: Math.ceil(n / xStep) }, (_, i) => i * xStep), n - 1])].filter(i => i < n)

  const cellW = n > 1 ? innerW / (n - 1) : innerW

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Y grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={cy(v)} y2={cy(v)} stroke="#E2E8F0" strokeDasharray="2 4" />
            <text x={P.l - 8} y={cy(v) + 4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="Inter">{v}</text>
          </g>
        ))}
        {/* X labels */}
        {xIdxs.map(i => {
          const d = new Date(labels[i])
          const fmt = isNaN(d) ? labels[i] : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
          return (
            <text key={i} x={cx(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94A3B8" fontFamily="Inter">{fmt}</text>
          )
        })}
        {/* Promo bands — one ambient band per promo day across all series */}
        {labels.map((_, i) => {
          const anyPromo = series.some(s => s.en_promo?.[i])
          if (!anyPromo) return null
          const x0 = Math.max(P.l, cx(i) - cellW / 2)
          const x1 = Math.min(W - P.r, cx(i) + cellW / 2)
          return <rect key={i} x={x0} y={P.t} width={x1 - x0} height={innerH} fill="rgba(245,158,11,.10)" />
        })}
        {/* Lines — skip null gaps with M/L */}
        {series.map(s => {
          const color = SITE_CONFIG[s.site_slug]?.color ?? '#94A3B8'
          let d = ''
          ;(s.prix || []).forEach((v, i) => {
            if (v == null) return
            const prev = i > 0 ? s.prix[i - 1] : null
            d += `${d === '' || prev == null ? 'M' : 'L'}${cx(i).toFixed(1)},${cy(v).toFixed(1)} `
          })
          return d ? (
            <path key={s.site_slug || s.site_name} d={d.trim()} fill="none" stroke={color}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          ) : null
        })}
        {/* End dots */}
        {series.map(s => {
          const color = SITE_CONFIG[s.site_slug]?.color ?? '#94A3B8'
          const arr   = s.prix || []
          let lastIdx = -1
          for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] != null) { lastIdx = i; break } }
          if (lastIdx === -1) return null
          return (
            <circle key={`dot-${s.site_slug || s.site_name}`}
                    cx={cx(lastIdx)} cy={cy(arr[lastIdx])} r="3.5"
                    fill="#fff" stroke={color} strokeWidth="2" />
          )
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 10 }}>
        {series.map(s => {
          const color = SITE_CONFIG[s.site_slug]?.color ?? '#94A3B8'
          return (
            <span key={s.site_slug || s.site_name} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 9px', borderRadius: 999,
              background: '#fff', border: '1px solid var(--pw-border)',
              fontSize: 12, fontWeight: 600,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
              {s.site_name || s.site_slug}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function SingleLineChart({ snapshots = [], height = 220 }) {
  const W = 760, H = height
  const P = { l: 50, r: 20, t: 20, b: 30 }
  const innerW = W - P.l - P.r
  const innerH = H - P.t - P.b

  const sorted = [...(snapshots ?? [])].sort(
    (a, b) => new Date(a.date_debut_observation) - new Date(b.date_debut_observation)
  )

  const withPrices = sorted.filter(s => s.prix_original != null)
  if (!withPrices.length) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
        Pas de données
      </div>
    )
  }

  const now = new Date()

  // Build chart points: one per snapshot start, plus "now" for the active one
  const pts = []
  for (const s of withPrices) {
    pts.push({ date: new Date(s.date_debut_observation), price: s.prix_original })
  }
  const lastSnap = withPrices[withPrices.length - 1]
  if (lastSnap.date_fin_observation == null) {
    pts.push({ date: now, price: lastSnap.prix_original })
  }

  const tMin = pts[0].date.getTime()
  const tMax = pts[pts.length - 1].date.getTime()
  const tRange = Math.max(tMax - tMin, 1)

  const prices = pts.map(p => p.price)
  const rawMin = Math.min(...prices)
  const rawMax = Math.max(...prices)
  const pad    = Math.max(Math.ceil((rawMax - rawMin) * 0.15 / 100) * 100, 100)
  const yMin   = Math.floor((rawMin - pad) / 100) * 100
  const yMax   = Math.ceil((rawMax + pad) / 100) * 100

  const cx = d => P.l + ((d.getTime() - tMin) / tRange) * innerW
  const cy = v => P.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH

  const yStep = Math.ceil((yMax - yMin) / 5 / 100) * 100 || 100
  const yTicks = []
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(v)

  // Evenly-spaced x-label indices
  const xIdxs = [...new Set([0, Math.floor(pts.length * .25), Math.floor(pts.length * .5), Math.floor(pts.length * .75), pts.length - 1])]
    .filter(i => i < pts.length)

  // Line path
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(p.date).toFixed(1)},${cy(p.price).toFixed(1)}`).join(' ')
  const fillD = `${pathD} L${cx(pts[pts.length - 1].date).toFixed(1)},${H - P.b} L${P.l},${H - P.b} Z`

  // Promo bands
  const bands = []
  for (const s of withPrices) {
    if (s.prix_en_promotion == null) continue
    const x0 = cx(new Date(s.date_debut_observation))
    const x1 = cx(s.date_fin_observation ? new Date(s.date_fin_observation) : now)
    if (x1 <= x0) continue
    const pct = s.prix_original > 0
      ? Math.round((1 - s.prix_en_promotion / s.prix_original) * 100)
      : null
    bands.push({ x0: Math.max(P.l, x0), x1: Math.min(W - P.r, x1), pct })
  }

  const last = pts[pts.length - 1]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="slc-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#6366F1" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0"    />
        </linearGradient>
      </defs>
      {yTicks.map(v => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={cy(v)} y2={cy(v)} stroke="#E2E8F0" strokeDasharray="2 4" />
          <text x={P.l - 8} y={cy(v) + 4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="Inter">{v}</text>
        </g>
      ))}
      {bands.map((b, i) => (
        <g key={i}>
          <rect x={b.x0} y={P.t} width={b.x1 - b.x0} height={innerH} fill="#FEF3C7" opacity=".5" />
          {b.pct != null && (
            <text x={(b.x0 + b.x1) / 2} y={P.t + 13} textAnchor="middle" fontSize="10"
                  fontWeight="600" fill="#92400E" fontFamily="Inter">
              Promo -{b.pct}%
            </text>
          )}
        </g>
      ))}
      <path d={fillD} fill="url(#slc-grad)" />
      <path d={pathD} fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {xIdxs.map(i => {
        const d   = pts[i].date
        const fmt = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        return (
          <text key={i} x={cx(d).toFixed(1)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94A3B8" fontFamily="Inter">{fmt}</text>
        )
      })}
      <circle cx={cx(last.date).toFixed(1)} cy={cy(last.price).toFixed(1)} r="4"
              fill="#fff" stroke="#6366F1" strokeWidth="2.5" />
    </svg>
  )
}

export function GaugeBig({ value = 64, size = 200 }) {
  const r = 80, cx = 100, cy = 100
  const start = Math.PI * 0.75
  const end   = Math.PI * 0.75 + Math.PI * 1.5
  const pt    = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const arc   = (from, to) => {
    const [x1, y1] = pt(from), [x2, y2] = pt(to)
    const large = to - from > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }
  const progEnd = start + (value / 100) * (end - start)
  const color   = value > 70 ? '#EF4444' : value > 40 ? '#F59E0B' : '#10B981'
  return (
    <svg width={size} height={Math.round(size * 0.85)} viewBox="0 0 200 200">
      <path d={arc(start, end)}   stroke="#F1F5F9" strokeWidth="16" fill="none" strokeLinecap="round" />
      <path d={arc(start, progEnd)} stroke={color} strokeWidth="16" fill="none" strokeLinecap="round" />
      <text x={cx} y={cy + 4}  textAnchor="middle" fontSize="44" fontWeight="800" fontFamily="Inter" fill="#0F172A" letterSpacing="-2">{value}</text>
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize="11" fill="#94A3B8" fontFamily="Inter">PRESSION CONCURRENTIELLE</text>
    </svg>
  )
}

export function CompetitiveBars({ categories }) {
  if (!categories?.length) {
    return (
      <div style={{ height: 280, display: 'grid', placeItems: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
        Données insuffisantes
      </div>
    )
  }
  const W = 600, H = 280, P = { l: 140, r: 60, t: 16, b: 24 }
  const iw = W - P.l - P.r
  const ih = (H - P.t - P.b) / categories.length
  const barH = 14
  const max = Math.max(...categories.flatMap(c => [c.our_avg ?? 0, c.market_avg ?? 0])) * 1.05 || 1
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {categories.map((c, i) => {
        const yBase   = P.t + i * ih
        const wOurs   = ((c.our_avg   ?? 0) / max) * iw
        const wMkt    = ((c.market_avg ?? 0) / max) * iw
        const cheaper = (c.our_avg ?? Infinity) <= (c.market_avg ?? 0)
        return (
          <g key={c.nom}>
            <text x={P.l - 10} y={yBase + ih / 2 + 4} textAnchor="end" fontSize="11.5" fill="#334155" fontFamily="Inter" fontWeight="600">{c.nom}</text>
            <rect x={P.l} y={yBase + ih / 2 - barH - 2} width={wOurs} height={barH} rx="3" fill="#6366F1" />
            <text x={P.l + wOurs + 6} y={yBase + ih / 2 - barH + 8} fontSize="10" fill="#0F172A" fontFamily="JetBrains Mono,monospace" fontWeight="700">
              {Math.round(c.our_avg ?? 0).toLocaleString('fr-FR')}
            </text>
            <rect x={P.l} y={yBase + ih / 2 + 2} width={wMkt} height={barH} rx="3" fill="#94A3B8" opacity=".5" />
            <text x={P.l + wMkt + 6} y={yBase + ih / 2 + barH - 1} fontSize="10" fill="#64748B" fontFamily="JetBrains Mono,monospace" fontWeight="600">
              {Math.round(c.market_avg ?? 0).toLocaleString('fr-FR')}
            </text>
            {cheaper && <circle cx={P.l - 80} cy={yBase + ih / 2} r="3" fill="#10B981" />}
          </g>
        )
      })}
      <g transform={`translate(${P.l}, ${H - 8})`}>
        <rect width="10" height="10" rx="2" fill="#6366F1" />
        <text x="14" y="9" fontSize="11" fill="#475569" fontFamily="Inter">Notre prix moyen</text>
        <rect x="140" width="10" height="10" rx="2" fill="#94A3B8" opacity=".5" />
        <text x="154" y="9" fontSize="11" fill="#475569" fontFamily="Inter">Prix moyen marché</text>
      </g>
    </svg>
  )
}

const _BUBBLE_COLOR = {
  moins_cher:   '#10B981',
  dans_moyenne: '#94A3B8',
  plus_cher:    '#EF4444',
}

export function BubbleChart({ produits }) {
  const W = 580, H = 320, P = { l: 50, r: 18, t: 18, b: 36 }
  const iw = W - P.l - P.r, ih = H - P.t - P.b

  if (!produits?.length) {
    return (
      <div style={{ height: H, display: 'grid', placeItems: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
        Aucune donnée de positionnement disponible
      </div>
    )
  }

  const allVals = produits.flatMap(p => [p.own_price, p.market_avg]).filter(v => v != null)
  const rawMin  = Math.min(...allVals)
  const rawMax  = Math.max(...allVals)
  const range   = rawMax - rawMin || 1000
  const pad     = range * 0.14
  const xMin    = Math.max(0, Math.floor((rawMin - pad) / 500) * 500)
  const xMax    = Math.ceil((rawMax + pad) / 500) * 500
  const yMin = xMin, yMax = xMax

  const sx = v => P.l + ((v - xMin) / (xMax - xMin)) * iw
  const sy = v => P.t + ih - ((v - yMin) / (yMax - yMin)) * ih

  const tickStep = Math.ceil((xMax - xMin) / 4 / 500) * 500 || 500
  const ticks = []
  for (let v = Math.ceil((xMin + 1) / tickStep) * tickStep; v <= xMax && ticks.length < 6; v += tickStep) {
    ticks.push(v)
  }

  const dLabelX = xMin + (xMax - xMin) * 0.78

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Diagonal reference line: notre prix = moyenne marché */}
      <line x1={sx(xMin)} y1={sy(yMin)} x2={sx(xMax)} y2={sy(yMax)} stroke="#CBD5E1" strokeDasharray="4 4" />
      <text x={sx(dLabelX)} y={sy(dLabelX) - 5} fontSize="10" fill="#94A3B8" fontFamily="Inter">Égal au marché</text>

      {/* Axes */}
      <line x1={P.l} y1={P.t + ih} x2={W - P.r} y2={P.t + ih} stroke="#E2E8F0" />
      <line x1={P.l} y1={P.t}      x2={P.l}      y2={P.t + ih} stroke="#E2E8F0" />

      {ticks.map(v => (
        <g key={v}>
          <text x={sx(v)} y={H - 18} textAnchor="middle" fontSize="10" fill="#94A3B8" fontFamily="Inter">{v.toLocaleString('fr-FR')}</text>
          <text x={P.l - 8} y={sy(v) + 4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="Inter">{v.toLocaleString('fr-FR')}</text>
        </g>
      ))}

      <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="#475569" fontFamily="Inter" fontWeight="600">Notre prix (TND)</text>
      <text x="12" y={P.t + ih / 2} fontSize="11" fill="#475569" fontFamily="Inter" fontWeight="600"
            transform={`rotate(-90, 12, ${P.t + ih / 2})`}>Prix moyen marché (TND)</text>

      {produits.map((p, i) => {
        if (p.own_price == null || p.market_avg == null) return null
        const color = _BUBBLE_COLOR[p.position] ?? '#94A3B8'
        const cx = sx(p.own_price), cy = sy(p.market_avg)
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={8} fill={color} opacity=".5" />
            <circle cx={cx} cy={cy} r={8} fill="none" stroke={color} strokeWidth="1.5" />
          </g>
        )
      })}
    </svg>
  )
}

export function Sparkline({ data, w = 80, h = 24, stroke = '#6366F1', fill = 'rgba(99,102,241,.12)' }) {
  if (!data?.length) return null
  const min   = Math.min(...data)
  const max   = Math.max(...data)
  const range = (max - min) || 1
  const pts   = data.map((v, i) => [
    (i / (data.length - 1)) * (w - 2) + 1,
    h - 2 - ((v - min) / range) * (h - 4),
  ])
  const d  = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ')
  const dF = `${d} L${w - 1},${h - 1} L1,${h - 1} Z`
  return (
    <svg className="pw-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={dF} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MarketAreaChart({ dates = [], hausses = [], baisses = [], promos = [] }) {
  const W = 760, H = 240, P = { l: 36, r: 16, t: 20, b: 30 }
  const iw = W - P.l - P.r, ih = H - P.t - P.b
  const days = dates.length

  if (!days) {
    return (
      <div style={{ height: H, display: 'grid', placeItems: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
        Pas de données
      </div>
    )
  }

  const b = baisses.map(v => v || 0)
  const h_ = hausses.map(v => v || 0)
  const p = promos.map(v => v || 0)

  const totals = b.map((_, i) => b[i] + h_[i] + p[i])
  const yMax = Math.max(...totals, 1) + 5

  const xf = i => P.l + (days > 1 ? (i / (days - 1)) * iw : iw / 2)
  const yf = v => P.t + ih - (v / yMax) * ih

  const layer1 = b
  const layer2 = b.map((v, i) => v + h_[i])
  const layer3 = layer2.map((v, i) => v + p[i])

  const area = (top, bottom = null) => {
    const up = top.map((v, i) => `${i === 0 ? 'M' : 'L'}${xf(i).toFixed(1)},${yf(v).toFixed(1)}`).join(' ')
    const dn = bottom
      ? bottom.slice().reverse().map((v, i) => `L${xf(days - 1 - i).toFixed(1)},${yf(v).toFixed(1)}`).join(' ')
      : `L${xf(days - 1).toFixed(1)},${yf(0).toFixed(1)} L${xf(0).toFixed(1)},${yf(0).toFixed(1)}`
    return `${up} ${dn} Z`
  }

  // ~6 evenly spaced x-axis ticks; matches J-29..J-0 pattern from design
  const step = Math.max(1, Math.floor(days / 5))
  const xIdxs = []
  for (let i = 0; i < days; i += step) xIdxs.push(i)
  if (xIdxs[xIdxs.length - 1] !== days - 1) xIdxs.push(days - 1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <path d={area(layer1)}          fill="#0D9488" opacity=".75" />
      <path d={area(layer2, layer1)}  fill="#EF4444" opacity=".75" />
      <path d={area(layer3, layer2)}  fill="#F59E0B" opacity=".75" />
      {[0, yMax / 2, yMax].map(t => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={yf(t)} y2={yf(t)} stroke="#E2E8F0" strokeDasharray="2 4" />
          <text x={P.l - 6} y={yf(t) + 4} fontSize="10" fill="#94A3B8" textAnchor="end" fontFamily="Inter">
            {Math.round(t)}
          </text>
        </g>
      ))}
      {xIdxs.map(i => (
        <text key={i} x={xf(i).toFixed(1)} y={H - 10} textAnchor="middle" fontSize="10" fill="#94A3B8" fontFamily="Inter">
          J-{days - 1 - i}
        </text>
      ))}
    </svg>
  )
}

function _heatColor(v) {
  if (v < 15) return '#F1F5F9'
  if (v < 35) return '#E0E7FF'
  if (v < 55) return '#A5B4FC'
  if (v < 75) return '#6366F1'
  return '#4338CA'
}

export function HeatMap({ categories = [], sites = [], data = [] }) {
  const allZero = !data.length || data.every(row => row.every(v => v === 0))

  if (!categories.length || !sites.length || allZero) {
    return (
      <div style={{ height: 160, display: 'grid', placeItems: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
        Données insuffisantes
      </div>
    )
  }

  const cols = sites.length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${cols}, 1fr)`, gap: 4 }}>
        {/* header row */}
        <div />
        {sites.map(s => (
          <div key={s.name} style={{ fontSize: 11, color: 'var(--pw-slate-500)', fontWeight: 600, textAlign: 'center' }}>
            {s.name}
          </div>
        ))}
        {/* data rows — flat map avoids keyed Fragment */}
        {categories.flatMap((cat, r) => [
          <div key={`lbl-${r}`} style={{ fontSize: 12, color: 'var(--pw-slate-700)', fontWeight: 500, alignSelf: 'center' }}>
            {cat}
          </div>,
          ...sites.map((_, c) => {
            const v = data[r]?.[c] ?? 0
            return (
              <div
                key={`cell-${r}-${c}`}
                style={{
                  aspectRatio: '1.4 / 1', borderRadius: 4,
                  background: _heatColor(v),
                  color: v > 55 ? '#fff' : 'var(--pw-slate-700)',
                  fontSize: 11.5, fontWeight: 600,
                  display: 'grid', placeItems: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {v}
              </div>
            )
          }),
        ])}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: 'var(--pw-slate-500)' }}>
        <span>0</span>
        <div style={{ display: 'flex' }}>
          {[8, 25, 45, 65, 85].map(v => (
            <div key={v} style={{ width: 30, height: 10, background: _heatColor(v) }} />
          ))}
        </div>
        <span>100+</span>
        <span style={{ marginLeft: 12 }}>changements de prix sur la période</span>
      </div>
    </div>
  )
}
