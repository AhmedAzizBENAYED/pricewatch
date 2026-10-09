import { useState, useEffect, useRef } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getProducts, getCategories, getBrands, getEventSites } from '../../api/tenant'
import { formatNumber, timeAgo, buildCategoryTree } from '../../utils/pw'
import { SITE_CONFIG } from '../../components/pw'
import {
  IcoSearch, IcoGrid, IcoList, IcoFilter, IcoArrow, IcoX,
  IcoChevR, IcoChevD, IcoTag,
} from '../../components/icons'

// ── Site color dots ────────────────────────────────────────────────────────────

function SiteDots({ slugs }) {
  if (!slugs?.length) return null
  const visible = slugs.slice(0, 6)
  const extra = slugs.length - 6
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
      {visible.map(slug => (
        <span
          key={slug}
          title={slug}
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: SITE_CONFIG[slug]?.color ?? 'var(--pw-slate-400)',
            display: 'inline-block', flexShrink: 0,
          }}
        />
      ))}
      {extra > 0 && <span style={{ fontSize: 10, color: 'var(--pw-slate-400)', lineHeight: '8px' }}>+{extra}</span>}
    </div>
  )
}

// ── FilterGroup ────────────────────────────────────────────────────────────────

function FilterGroup({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--pw-border)', padding: '14px 16px' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--pw-slate-700)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {title}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--pw-slate-400)' }}>
          {open ? <IcoChevD size={14} /> : <IcoChevR size={14} />}
        </span>
      </div>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}

// ── Checkbox ───────────────────────────────────────────────────────────────────

function Checkbox({ label, count, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 13 }}>
      <span
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          background: checked ? 'var(--pw-indigo)' : '#fff',
          border: `1px solid ${checked ? 'var(--pw-indigo)' : 'var(--pw-slate-300)'}`,
          display: 'grid', placeItems: 'center', color: '#fff',
        }}
        onClick={e => { e.preventDefault(); onChange() }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ flex: 1, color: 'var(--pw-slate-700)' }}>{label}</span>
      {count != null && (
        <span className="pw-mono" style={{ fontSize: 11.5, color: 'var(--pw-slate-400)' }}>{count}</span>
      )}
    </label>
  )
}

// ── Category tree node ─────────────────────────────────────────────────────────

function CatTreeNode({ cat, level = 0, activeCatId, onSelect }) {
  const hasChildren = cat.children?.length > 0
  const isActive    = cat.id === activeCatId
  // Auto-expand when a direct child is the active category
  const hasChildActive = hasChildren && cat.children.some(c => c.id === activeCatId)
  const [open, setOpen] = useState(hasChildActive)

  useEffect(() => {
    if (hasChildActive) setOpen(true)
  }, [hasChildActive])

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 0 4px ' + (level * 14) + 'px',
          cursor: 'pointer', fontSize: 13,
          color: isActive ? 'var(--pw-indigo-700)' : 'var(--pw-slate-700)',
          fontWeight: isActive ? 600 : 500,
        }}
        onClick={() => {
          if (hasChildren && level < 1) setOpen(o => !o)
          onSelect(isActive ? null : cat.id)
        }}
      >
        <span style={{ color: 'var(--pw-slate-400)', display: 'inline-flex', width: 12, flexShrink: 0 }}>
          {hasChildren && level < 1 ? (open ? <IcoChevD size={12} /> : <IcoChevR size={12} />) : ''}
        </span>
        <span style={{ flex: 1 }}>{cat.nom}</span>
        <span className="pw-mono" style={{ fontSize: 11, color: 'var(--pw-slate-400)', flexShrink: 0 }}>
          {cat.nb_produits}
        </span>
      </div>
      {open && hasChildren && level < 1 && cat.children.map(child => (
        <CatTreeNode key={child.id} cat={child} level={level + 1} activeCatId={activeCatId} onSelect={onSelect} />
      ))}
    </div>
  )
}

// ── Full category path helper ──────────────────────────────────────────────────

function getCatPath(categories, id) {
  const parts = []
  let cur = categories.find(c => c.id === id)
  while (cur) {
    parts.unshift(cur.nom)
    cur = cur.id_parent ? categories.find(c => c.id === cur.id_parent) : null
  }
  return parts.join(' › ')
}

// ── Toggle ─────────────────────────────────────────────────────────────────────

function Toggle({ label, on, onChange }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--pw-slate-700)', cursor: 'pointer' }}
      onClick={onChange}
    >
      <span style={{
        width: 32, height: 18, flexShrink: 0,
        background: on ? 'var(--pw-indigo)' : 'var(--pw-slate-200)',
        borderRadius: 999, position: 'relative', transition: '.15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 16 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
          transition: 'left .15s',
        }} />
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </div>
  )
}

// ── Filters panel ──────────────────────────────────────────────────────────────

function FiltersPanel({
  categories, categoriesLoading,
  brands, brandsLoading,
  brandSearch, setBrandSearch,
  showAllBrands, setShowAllBrands,
  categorieId, marques, minSites, enPromo,
  prixMinLocal, prixMaxLocal, setPrixMinLocal, setPrixMaxLocal,
  setCategorieId, toggleMarque, setMinSites, setEnPromo,
  onReset, totalProducts, maxSites,
}) {
  const tree = buildCategoryTree(categories)
  const totalCount = categories.filter(c => !c.id_parent).reduce((s, c) => s + (c.nb_produits || 0), 0)
  const visibleBrands = showAllBrands ? brands : brands.slice(0, 6)
  const extraBrands = brands.length - 6

  return (
    <div className="pw-card" style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
      <div className="pw-card-head" style={{ padding: '12px 16px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IcoFilter />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pw-slate-700)' }}>Filtres</span>
        </span>
        <div className="right">
          <button className="pw-btn pw-btn-sm pw-btn-ghost" onClick={onReset}>Réinitialiser</button>
        </div>
      </div>

      {/* Catégorie */}
      <FilterGroup title="Catégorie">
        {categoriesLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[70, 55, 65, 50].map((w, i) => (
              <div key={i} className="pw-sk" style={{ height: 11, width: `${w}%`, borderRadius: 4 }} />
            ))}
          </div>
        ) : (
          <div>
            {/* Toutes catégories */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 0', cursor: 'pointer', fontSize: 13,
                color: !categorieId ? 'var(--pw-indigo-700)' : 'var(--pw-slate-700)',
                fontWeight: !categorieId ? 600 : 500,
              }}
              onClick={() => setCategorieId(null)}
            >
              <span style={{ width: 12, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>Toutes catégories</span>
              <span className="pw-mono" style={{ fontSize: 11, color: 'var(--pw-slate-400)', flexShrink: 0 }}>
                {totalCount || totalProducts || ''}
              </span>
            </div>
            {tree.map(cat => (
              <CatTreeNode
                key={cat.id}
                cat={cat}
                activeCatId={categorieId}
                onSelect={setCategorieId}
              />
            ))}
          </div>
        )}
      </FilterGroup>

      {/* Marque */}
      <FilterGroup title="Marque">
        <div className="pw-input" style={{ padding: '6px 10px', fontSize: 12, marginBottom: 8 }}>
          <IcoSearch />
          <input
            value={brandSearch}
            onChange={e => setBrandSearch(e.target.value)}
            placeholder="Rechercher une marque"
          />
          {brandSearch && (
            <button
              onClick={() => setBrandSearch('')}
              style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--pw-slate-400)', display: 'grid', placeItems: 'center', padding: 0 }}
            >
              <IcoX size={12} />
            </button>
          )}
        </div>
        {brandsLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[75, 60, 55, 70].map((w, i) => (
              <div key={i} className="pw-sk" style={{ height: 11, width: `${w}%`, borderRadius: 4 }} />
            ))}
          </div>
        ) : (
          <>
            {visibleBrands.map(b => (
              <Checkbox
                key={b.marque}
                label={b.marque}
                count={b.nb_produits}
                checked={marques.includes(b.marque)}
                onChange={() => toggleMarque(b.marque)}
              />
            ))}
            {!showAllBrands && extraBrands > 0 && (
              <div
                style={{ fontSize: 11.5, color: 'var(--pw-indigo-700)', marginTop: 6, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setShowAllBrands(true)}
              >
                + {extraBrands} autres marques
              </div>
            )}
            {brands.length === 0 && !brandsLoading && (
              <div style={{ fontSize: 12.5, color: 'var(--pw-slate-400)', fontStyle: 'italic' }}>Aucune marque trouvée</div>
            )}
          </>
        )}
      </FilterGroup>

      {/* Nombre de sites */}
      <FilterGroup title="Nombre de sites">
        <div className="pw-mono" style={{ fontSize: 12, color: 'var(--pw-slate-600)', marginBottom: 6 }}>
          Au moins {minSites} / {maxSites} sites
        </div>
        <input
          type="range" min={1} max={maxSites} step={1}
          value={minSites}
          onChange={e => setMinSites(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--pw-indigo)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--pw-slate-400)', marginTop: 2 }}>
          <span>1</span><span>{maxSites}</span>
        </div>
      </FilterGroup>

      {/* Fourchette de prix */}
      <FilterGroup title="Fourchette de prix">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number" min={0}
            value={prixMinLocal}
            onChange={e => setPrixMinLocal(e.target.value)}
            placeholder="Min"
            style={{ flex: 1, minWidth: 0, width: 0, padding: '6px 8px', fontSize: 12, border: '1px solid var(--pw-border)', borderRadius: 6, outline: 0, fontFamily: 'var(--pw-font-mono)', color: 'var(--pw-slate-800)' }}
          />
          <span style={{ color: 'var(--pw-slate-300)', fontSize: 12, flexShrink: 0 }}>—</span>
          <input
            type="number" min={0}
            value={prixMaxLocal}
            onChange={e => setPrixMaxLocal(e.target.value)}
            placeholder="Max"
            style={{ flex: 1, minWidth: 0, width: 0, padding: '6px 8px', fontSize: 12, border: '1px solid var(--pw-border)', borderRadius: 6, outline: 0, fontFamily: 'var(--pw-font-mono)', color: 'var(--pw-slate-800)' }}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--pw-slate-400)', marginTop: 6 }}>en TND</div>
      </FilterGroup>

      {/* Présence promo */}
      <FilterGroup title="Présence promo" defaultOpen={false}>
        <Toggle
          label="Avec promotion seulement"
          on={enPromo}
          onChange={() => setEnPromo(!enPromo)}
        />
      </FilterGroup>
    </div>
  )
}

// ── Skeletons ──────────────────────────────────────────────────────────────────

function SkGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="pw-card" style={{ overflow: 'hidden' }}>
          <div className="pw-sk" style={{ width: '100%', height: 140, borderRadius: 0 }} />
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="pw-sk" style={{ height: 10, width: '40%', borderRadius: 4 }} />
            <div className="pw-sk" style={{ height: 14, width: '85%', borderRadius: 4 }} />
            <div className="pw-sk" style={{ height: 10, width: '65%', borderRadius: 4 }} />
            <div className="pw-sk" style={{ height: 20, width: '55%', borderRadius: 4, marginTop: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function SkTable() {
  return (
    <div className="pw-card" style={{ overflow: 'hidden' }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderBottom: '1px solid var(--pw-border)' }}>
          <div className="pw-sk" style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0 }} />
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="pw-sk" style={{ height: 12, width: '60%', borderRadius: 4 }} />
            <div className="pw-sk" style={{ height: 10, width: '35%', borderRadius: 4 }} />
          </div>
          {[1, 1, 1, 1, 1].map((_, j) => (
            <div key={j} className="pw-sk" style={{ flex: 1, height: 10, borderRadius: 4 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Product card (grid view) ───────────────────────────────────────────────────

function ProductCard({ product: p, onView }) {
  const samePrice = p.prix_min != null && p.prix_min === p.prix_max
  const [imgErr, setImgErr] = useState(false)

  return (
    <div className="pw-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative' }}>
        {p.image && !imgErr ? (
          <img
            src={p.image}
            alt={p.nom_produit}
            onError={() => setImgErr(true)}
            style={{ width: '100%', height: 140, objectFit: 'contain', padding: 12, background: 'var(--pw-slate-50)', display: 'block' }}
          />
        ) : (
          <div
            className="pw-placeholder"
            style={{ width: '100%', height: 140, borderRadius: '8px 8px 0 0', fontSize: 10 }}
          >
            {p.categorie_nom?.toLowerCase() ?? 'img'}
          </div>
        )}
        {p.has_promo && (
          <span className="pw-pill amber" style={{ position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <IcoTag /><span style={{ fontSize: 11 }}>Promo</span>
          </span>
        )}
        <span className="pw-pill slate" style={{ position: 'absolute', top: 8, right: 8, fontSize: 11 }}>
          Sur {p.nb_sites} site{p.nb_sites !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pw-slate-500)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          {p.marque || '—'}
        </div>
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: 'var(--pw-slate-900)', marginTop: 2,
          lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 36,
        }}>
          {p.nom_produit}
        </div>

        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--pw-slate-500)' }}>
          {samePrice ? 'Prix' : 'Fourchette de prix'}
        </div>
        <div className="pw-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--pw-slate-900)', marginTop: 2 }}>
          {p.prix_min != null ? `${formatNumber(p.prix_min)} TND` : '—'}
          {!samePrice && p.prix_max != null && (
            <> <span style={{ color: 'var(--pw-slate-300)' }}>—</span> {formatNumber(p.prix_max)} TND</>
          )}
        </div>

        <SiteDots slugs={p.site_slugs} />

        <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--pw-slate-400)' }}>
            {timeAgo(p.derniere_observation)}
          </span>
          <button className="pw-btn pw-btn-sm" onClick={onView}>
            Voir <IcoArrow />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Table view ─────────────────────────────────────────────────────────────────

function ProductThumb({ image, alt }) {
  const [imgErr, setImgErr] = useState(false)
  if (image && !imgErr) {
    return (
      <img
        src={image}
        alt={alt || ''}
        onError={() => setImgErr(true)}
        style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, flexShrink: 0, background: 'var(--pw-slate-50)' }}
      />
    )
  }
  return <div className="pw-placeholder" style={{ width: 36, height: 36, flexShrink: 0, fontSize: 8, borderRadius: 6 }}>img</div>
}

function TableSiteDots({ slugs }) {
  if (!slugs?.length) return null
  const visible = slugs.slice(0, 4)
  const extra = slugs.length - 4
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {visible.map((slug, k) => (
        <span
          key={slug}
          title={slug}
          style={{
            width: 16, height: 16, borderRadius: '50%',
            background: SITE_CONFIG[slug]?.color ?? 'var(--pw-slate-400)',
            border: '2px solid #fff', marginLeft: k ? -4 : 0,
          }}
        />
      ))}
      {extra > 0 && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--pw-slate-500)' }}>+{extra}</span>}
    </div>
  )
}

function TableView({ products, onRowClick }) {
  return (
    <div className="pw-card" style={{ overflow: 'hidden' }}>
      <table className="pw-table dense">
        <thead>
          <tr>
            <th style={{ width: '32%' }}>Produit</th>
            <th>Marque</th>
            <th>Catégorie</th>
            <th style={{ textAlign: 'center' }}>Sites</th>
            <th style={{ textAlign: 'right' }}>Prix min</th>
            <th style={{ textAlign: 'right' }}>Prix max</th>
            <th style={{ textAlign: 'right' }}>Écart</th>
            <th>Dernière obs.</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => {
            const ecart = p.prix_min && p.prix_max && p.prix_min !== p.prix_max
              ? ((p.prix_max - p.prix_min) / p.prix_min * 100)
              : null
            const ecartColor = ecart == null
              ? 'var(--pw-slate-400)'
              : ecart > 10 ? 'var(--pw-red)'
              : ecart > 5  ? 'var(--pw-amber)'
              : 'var(--pw-slate-700)'

            return (
              <tr key={p.id} onClick={() => onRowClick(p.id)} style={{ cursor: 'pointer' }}>
                <td>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <ProductThumb image={p.image} alt={p.nom_produit} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--pw-slate-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.nom_produit}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)' }}>{p.marque || '—'}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 13, color: 'var(--pw-slate-700)' }}>{p.marque || '—'}</td>
                <td><span className="pw-pill slate">{p.categorie_nom || '—'}</span></td>
                <td style={{ textAlign: 'center' }}>
                  <TableSiteDots slugs={p.site_slugs} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className="pw-mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {p.prix_min != null ? `${formatNumber(p.prix_min)} TND` : '—'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className="pw-mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {p.prix_max != null ? `${formatNumber(p.prix_max)} TND` : '—'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {ecart != null ? (
                    <span className="pw-mono" style={{ fontWeight: 600, color: ecartColor }}>{ecart.toFixed(1)}%</span>
                  ) : (
                    <span className="pw-mono" style={{ color: 'var(--pw-slate-400)' }}>—</span>
                  )}
                </td>
                <td style={{ fontSize: 11.5, color: 'var(--pw-slate-500)' }}>
                  {timeAgo(p.derniere_observation)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Pagination ─────────────────────────────────────────────────────────────────

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
      <button className="pw-btn pw-btn-sm" disabled={page === 1} onClick={() => onChange(page - 1)} style={{ opacity: page === 1 ? .4 : 1 }}>‹</button>
      {pages.map((p, i) => (
        <button
          key={i}
          className="pw-btn pw-btn-sm"
          disabled={p === '…'}
          onClick={() => typeof p === 'number' && onChange(p)}
          style={{
            minWidth: 32, justifyContent: 'center',
            background: p === page ? 'var(--pw-indigo)' : '#fff',
            color: p === page ? '#fff' : 'inherit',
            borderColor: p === page ? 'var(--pw-indigo)' : 'var(--pw-border)',
            opacity: p === '…' ? .5 : 1,
          }}
        >
          {p}
        </button>
      ))}
      <button className="pw-btn pw-btn-sm" disabled={page === totalPages} onClick={() => onChange(page + 1)} style={{ opacity: page === totalPages ? .4 : 1 }}>›</button>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onClear }) {
  return (
    <div style={{ padding: '56px 24px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px solid var(--pw-border)' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--pw-slate-800)', marginBottom: 6 }}>Aucun produit trouvé</div>
      <div style={{ fontSize: 13, color: 'var(--pw-slate-500)', marginBottom: 16 }}>Essayez de modifier vos filtres ou votre recherche.</div>
      <button className="pw-btn pw-btn-sm" onClick={onClear}>Modifier vos filtres</button>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Products() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Read URL state
  const q         = searchParams.get('q') ?? ''
  const catIdRaw  = searchParams.get('categorie_id')
  const categorieId = catIdRaw ? Number(catIdRaw) : null
  const marques   = searchParams.getAll('marque')
  const minSitesRaw = searchParams.get('min_sites')
  const minSites  = minSitesRaw ? Number(minSitesRaw) : 1
  const enPromo   = searchParams.get('en_promo') === 'true'
  const urlPrixMin = searchParams.get('prix_min') ?? ''
  const urlPrixMax = searchParams.get('prix_max') ?? ''
  const sort      = searchParams.get('sort') ?? ''
  const pageRaw   = searchParams.get('page')
  const page      = pageRaw ? Number(pageRaw) : 1

  // Local state for debounced inputs
  const [localQ, setLocalQ]             = useState(q)
  const [localPrixMin, setLocalPrixMin] = useState(urlPrixMin)
  const [localPrixMax, setLocalPrixMax] = useState(urlPrixMax)
  const [brandSearch, setBrandSearch]   = useState('')
  const [showAllBrands, setShowAllBrands] = useState(false)
  const [view, setView]                 = useState('grid')

  // Skip-on-mount refs — prevents spurious setSearchParams on initial render
  const qMounted     = useRef(false)
  const priceMounted = useRef(false)

  // Debounce search query → URL (skip first render)
  useEffect(() => {
    if (!qMounted.current) { qMounted.current = true; return }
    const t = setTimeout(() => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        localQ ? next.set('q', localQ) : next.delete('q')
        next.delete('page')
        return next
      }, { replace: true })
    }, 400)
    return () => clearTimeout(t)
  }, [localQ])

  // Debounce price → URL (skip first render)
  useEffect(() => {
    if (!priceMounted.current) { priceMounted.current = true; return }
    const t = setTimeout(() => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        localPrixMin ? next.set('prix_min', localPrixMin) : next.delete('prix_min')
        localPrixMax ? next.set('prix_max', localPrixMax) : next.delete('prix_max')
        next.delete('page')
        return next
      }, { replace: true })
    }, 600)
    return () => clearTimeout(t)
  }, [localPrixMin, localPrixMax])

  // URL param setters
  const setCategorieId = (id) => setSearchParams(prev => {
    const n = new URLSearchParams(prev)
    id ? n.set('categorie_id', String(id)) : n.delete('categorie_id')
    n.delete('page'); return n
  })

  const toggleMarque = (m) => {
    const next = marques.includes(m) ? marques.filter(x => x !== m) : [...marques, m]
    setSearchParams(prev => {
      const n = new URLSearchParams(prev)
      n.delete('marque')
      next.forEach(v => n.append('marque', v))
      n.delete('page'); return n
    })
  }

  const clearMarques = () => setSearchParams(prev => {
    const n = new URLSearchParams(prev)
    n.delete('marque'); n.delete('page'); return n
  })

  const setMinSites = (val) => setSearchParams(prev => {
    const n = new URLSearchParams(prev)
    val > 1 ? n.set('min_sites', String(val)) : n.delete('min_sites')
    n.delete('page'); return n
  })

  const setEnPromo = (val) => setSearchParams(prev => {
    const n = new URLSearchParams(prev)
    val ? n.set('en_promo', 'true') : n.delete('en_promo')
    n.delete('page'); return n
  })

  const setSort = (s) => setSearchParams(prev => {
    const n = new URLSearchParams(prev)
    s ? n.set('sort', s) : n.delete('sort')
    n.delete('page'); return n
  })

  const setPage = (p) => setSearchParams(prev => {
    const n = new URLSearchParams(prev)
    p > 1 ? n.set('page', String(p)) : n.delete('page')
    return n
  })

  const clearFilters = () => {
    setLocalQ(''); setLocalPrixMin(''); setLocalPrixMax('')
    setSearchParams(new URLSearchParams())
  }

  // Queries
  const filters = {
    ...(q           && { q }),
    ...(categorieId && { categorie_id: categorieId }),
    ...(marques.length && { marque: marques }),
    ...(minSites > 1 && { min_sites: minSites }),
    ...(enPromo     && { en_promo: true }),
    ...(urlPrixMin  && { prix_min: urlPrixMin }),
    ...(urlPrixMax  && { prix_max: urlPrixMax }),
    ...(sort        && { sort }),
    page,
    limit: 24,
  }

  const productsQ = useQuery({
    queryKey: ['products', filters],
    queryFn:  () => getProducts(filters),
    placeholderData: keepPreviousData,
  })

  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn:  () => getCategories(),
    staleTime: 5 * 60_000,
  })

  const brandsQ = useQuery({
    queryKey: ['brands', brandSearch],
    queryFn:  () => getBrands({ q: brandSearch || undefined }),
  })

  const sitesQ = useQuery({
    queryKey: ['event-sites'],
    queryFn:  getEventSites,
    staleTime: 5 * 60_000,
  })
  const maxSites = sitesQ.data?.length || 6

  const products   = productsQ.data?.data ?? []
  const meta       = productsQ.data?.meta ?? {}
  const total      = meta.total ?? 0
  const totalPages = meta.pages ?? 1

  const categories = Array.isArray(categoriesQ.data) ? categoriesQ.data : []
  const brands     = Array.isArray(brandsQ.data) ? brandsQ.data : []

  const catPath = categorieId ? getCatPath(categories, categorieId) : ''

  const hasActiveFilters = !!(q || categorieId || marques.length || minSites > 1 || enPromo || urlPrixMin || urlPrixMax)

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 14 }}>
        <div className="pw-h1">Catalogue produits</div>
        {!productsQ.isLoading && total > 0 && (
          <div className="pw-muted" style={{ fontSize: 13 }}>
            {formatNumber(total)} produits surveillés
          </div>
        )}
      </div>

      {/* Global search */}
      <div className="pw-input lg" style={{ marginBottom: 16 }}>
        <IcoSearch />
        <input
          value={localQ}
          onChange={e => setLocalQ(e.target.value)}
          placeholder="Rechercher un produit, une marque, une référence…"
        />
        {localQ && (
          <button
            onClick={() => { setLocalQ(''); setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('q'); return n }) }}
            style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--pw-slate-400)', display: 'grid', placeItems: 'center', padding: 2 }}
          >
            <IcoX size={14} />
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18, alignItems: 'start' }}>

        {/* Sidebar */}
        <FiltersPanel
          categories={categories}
          categoriesLoading={categoriesQ.isLoading}
          brands={brands}
          brandsLoading={brandsQ.isLoading || brandsQ.isFetching}
          brandSearch={brandSearch}
          setBrandSearch={setBrandSearch}
          showAllBrands={showAllBrands}
          setShowAllBrands={setShowAllBrands}
          categorieId={categorieId}
          marques={marques}
          minSites={minSites}
          enPromo={enPromo}
          prixMinLocal={localPrixMin}
          prixMaxLocal={localPrixMax}
          setCategorieId={setCategorieId}
          toggleMarque={toggleMarque}
          setMinSites={setMinSites}
          setEnPromo={setEnPromo}
          setPrixMinLocal={setLocalPrixMin}
          setPrixMaxLocal={setLocalPrixMax}
          onReset={clearFilters}
          totalProducts={total}
          maxSites={maxSites}
        />

        {/* Main content */}
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 13 }}>
              {productsQ.isLoading ? (
                <div className="pw-sk" style={{ height: 13, width: 180, borderRadius: 4 }} />
              ) : (
                <>
                  <strong className="pw-mono" style={{ color: 'var(--pw-slate-900)' }}>{formatNumber(total)}</strong>
                  <span className="pw-muted"> produit{total !== 1 ? 's' : ''} correspondent à vos filtres</span>
                </>
              )}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--pw-slate-500)' }}>
                <span>Trier par</span>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  style={{ fontWeight: 600, color: 'var(--pw-slate-900)', padding: '5px 24px 5px 8px', border: '1px solid var(--pw-border)', borderRadius: 6, background: '#fff', fontSize: 12.5, outline: 0, cursor: 'pointer' }}
                >
                  <option value="">Pertinence</option>
                  <option value="prix_asc">Prix croissant</option>
                  <option value="ecart_desc">Écart décroissant</option>
                  <option value="recent">Récent</option>
                </select>
              </div>
              <div style={{ display: 'flex', border: '1px solid var(--pw-border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <button
                  className="pw-btn pw-btn-sm" title="Vue grille"
                  onClick={() => setView('grid')}
                  style={{ border: 0, borderRadius: 0, background: view === 'grid' ? 'var(--pw-slate-100)' : '#fff' }}
                >
                  <IcoGrid />
                </button>
                <button
                  className="pw-btn pw-btn-sm" title="Vue tableau"
                  onClick={() => setView('table')}
                  style={{ border: 0, borderRadius: 0, background: view === 'table' ? 'var(--pw-slate-100)' : '#fff' }}
                >
                  <IcoList />
                </button>
              </div>
            </div>
          </div>

          {/* Active filter pills */}
          {hasActiveFilters && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {q && (
                <span
                  className="pw-pill indigo"
                  style={{ cursor: 'pointer', gap: 6 }}
                  onClick={() => { setLocalQ(''); setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('q'); return n }) }}
                >
                  "{q}" <IcoX size={10} />
                </span>
              )}
              {categorieId && (
                <span className="pw-pill indigo" style={{ cursor: 'pointer', gap: 6 }} onClick={() => setCategorieId(null)}>
                  {catPath || `Catégorie #${categorieId}`} <IcoX size={10} />
                </span>
              )}
              {marques.length > 0 && (
                <span className="pw-pill indigo" style={{ cursor: 'pointer', gap: 6 }} onClick={clearMarques}>
                  {marques.join(', ')} <IcoX size={10} />
                </span>
              )}
              {minSites > 1 && (
                <span className="pw-pill indigo" style={{ cursor: 'pointer', gap: 6 }} onClick={() => setMinSites(1)}>
                  {minSites}+ sites <IcoX size={10} />
                </span>
              )}
              {enPromo && (
                <span className="pw-pill indigo" style={{ cursor: 'pointer', gap: 6 }} onClick={() => setEnPromo(false)}>
                  Promo active <IcoX size={10} />
                </span>
              )}
              {(urlPrixMin || urlPrixMax) && (
                <span
                  className="pw-pill indigo"
                  style={{ cursor: 'pointer', gap: 6 }}
                  onClick={() => { setLocalPrixMin(''); setLocalPrixMax(''); setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('prix_min'); n.delete('prix_max'); return n }) }}
                >
                  {urlPrixMin || '0'} – {urlPrixMax || '∞'} TND <IcoX size={10} />
                </span>
              )}
            </div>
          )}

          {/* Loading */}
          {productsQ.isLoading && (view === 'grid' ? <SkGrid /> : <SkTable />)}

          {/* Error */}
          {productsQ.isError && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--pw-red)', fontSize: 13 }}>
              Erreur de chargement.{' '}
              <button className="pw-btn pw-btn-sm" onClick={() => productsQ.refetch()} style={{ color: 'var(--pw-red)', marginLeft: 8 }}>
                Réessayer
              </button>
            </div>
          )}

          {/* Empty */}
          {productsQ.isSuccess && products.length === 0 && !productsQ.isLoading && (
            <EmptyState onClear={clearFilters} />
          )}

          {/* Results */}
          {products.length > 0 && (
            <>
              {view === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {products.map(p => (
                    <ProductCard key={p.id} product={p} onView={() => navigate(`/tenant/products/${p.id}`)} />
                  ))}
                </div>
              ) : (
                <TableView products={products} onRowClick={id => navigate(`/tenant/products/${id}`)} />
              )}
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
