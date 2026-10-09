export function buildCategoryTree(categories) {
  const map = {}
  const roots = []
  categories.forEach(c => { map[c.id] = { ...c, children: [] } })
  categories.forEach(c => {
    if (c.id_parent && map[c.id_parent]) {
      map[c.id_parent].children.push(map[c.id])
    } else {
      roots.push(map[c.id])
    }
  })
  return roots.sort((a, b) => b.nb_produits - a.nb_produits)
}

export function timeAgo(dateString) {
  if (!dateString) return '—'
  const diff = Date.now() - new Date(dateString).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return "à l'instant"
  const m = Math.floor(s / 60)
  if (m < 60)  return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)  return `il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)   return `il y a ${d}j`
  return new Date(dateString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function formatNumber(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('fr-FR').format(n).replace(/ /g, ' ')
}

export const EVENT_CONFIG = {
  HAUSSE_PRIX: {
    type: 'rise',  label: 'Hausse de prix',
    color: 'var(--pw-red)',      bg: 'var(--pw-red-50)',
  },
  BAISSE_PRIX: {
    type: 'drop',  label: 'Baisse de prix',
    color: 'var(--pw-teal)',     bg: 'var(--pw-teal-50)',
  },
  DEBUT_PROMOTION: {
    type: 'promo', label: 'Promotion',
    color: 'var(--pw-amber)',    bg: 'var(--pw-amber-50)',
  },
  FIN_PROMOTION: {
    type: 'promo', label: 'Fin promotion',
    color: 'var(--pw-slate-600)', bg: 'var(--pw-slate-100)',
  },
  RUPTURE_STOCK: {
    type: 'stock', label: 'Rupture de stock',
    color: 'var(--pw-slate-700)', bg: 'var(--pw-slate-100)',
  },
  RETOUR_STOCK: {
    type: 'back',  label: 'Retour en stock',
    color: 'var(--pw-green)',    bg: 'var(--pw-green-50)',
  },
  NOUVELLE_OFFRE_DECOUVERTE: {
    type: 'new',   label: 'Nouveau produit',
    color: 'var(--pw-indigo)',   bg: 'var(--pw-indigo-50)',
  },
}

export function groupByCategory(produits) {
  const map = {}
  produits?.forEach(p => {
    const cat = p.categorie_nom || 'Autre'
    if (!map[cat]) map[cat] = { nom: cat, own_prices: [], market_avgs: [] }
    if (p.own_price)   map[cat].own_prices.push(p.own_price)
    if (p.market_avg)  map[cat].market_avgs.push(p.market_avg)
  })
  return Object.values(map)
    .map(c => ({
      nom:        c.nom,
      our_avg:    c.own_prices.length   ? c.own_prices.reduce((a, b) => a + b, 0)   / c.own_prices.length   : null,
      market_avg: c.market_avgs.length  ? c.market_avgs.reduce((a, b) => a + b, 0)  / c.market_avgs.length  : null,
    }))
    .filter(c => c.our_avg && c.market_avg)
    .sort((a, b) => b.our_avg - a.our_avg)
    .slice(0, 7)
}

export const EVENT_ICON_PATH = {
  rise:  'M12 19V5M5 12l7-7 7 7',
  drop:  'M12 5v14M19 12l-7 7-7-7',
  promo: 'M3 12 12 3h8v8l-9 9-8-8Zm12-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  stock: 'M21 8 12 3 3 8v8l9 5 9-5V8Zm0 0-9 5m0 0L3 8m9 5v9',
  back:  'M5 12.5 10 17l9-11',
  new:   'M4 21V4h13l-2 4 2 4H4',
}
