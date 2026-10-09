import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'
import {
  getCategories, getScopeAvailable, addToScope, removeFromScope,
} from '../../api/tenant/index'
import { buildCategoryTree, formatNumber } from '../../utils/pw'
import { IcoMap, IcoSearch, IcoTrash, IcoPlus, IcoChevR, IcoChevD, IcoArrow } from '../../components/icons'

const PLAN_MAX = { BASIC: 50, MEDIUM: 150, PREMIUM: null }

// ── Checkbox visual ───────────────────────────────────────────────────────────

function Checkbox({ checked, onChange, size = 16 }) {
  return (
    <span
      onClick={onChange}
      style={{
        width: size, height: size, borderRadius: 4, flexShrink: 0,
        background: checked ? 'var(--pw-indigo)' : '#fff',
        border: `1.5px solid ${checked ? 'var(--pw-indigo)' : 'var(--pw-slate-300)'}`,
        display: 'grid', placeItems: 'center', color: '#fff', cursor: 'pointer',
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12">
          <path d="M2 6l3 3 5-6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

// ── Tree row for current scope ────────────────────────────────────────────────

function ScopeTreeNode({ node, depth = 0, expandedMap, onToggle, onRemove, isLast }) {
  const [hover, setHover] = useState(false)
  const hasChildren = node.children?.length > 0
  const isExpanded  = !!expandedMap[node.id]

  return (
    <>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 0 8px ' + (depth * 16) + 'px',
          borderBottom: isLast && !isExpanded ? 0 : '1px solid var(--pw-border)',
        }}
      >
        <span
          onClick={() => hasChildren && onToggle(node.id)}
          style={{ width: 14, color: 'var(--pw-slate-400)', display: 'inline-flex', cursor: hasChildren ? 'pointer' : 'default' }}
        >
          {hasChildren ? (isExpanded ? <IcoChevD size={12} /> : <IcoChevR size={12} />) : null}
        </span>
        <Checkbox checked size={16} />
        <span
          onClick={() => hasChildren && onToggle(node.id)}
          style={{
            flex: 1, fontSize: 13.5, fontWeight: 600,
            color: 'var(--pw-slate-800)',
            cursor: hasChildren ? 'pointer' : 'default',
          }}
        >
          {node.nom}
        </span>
        <span className="pw-pill slate" style={{ fontSize: 11 }}>
          {formatNumber(node.nb_produits)} offres
        </span>
        {hover && (
          <span
            onClick={() => onRemove(node.id, node.nom)}
            style={{
              width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center',
              color: 'var(--pw-red)', cursor: 'pointer', background: 'var(--pw-red-50)',
            }}
          >
            <IcoTrash size={13} />
          </span>
        )}
      </div>
      {isExpanded && hasChildren && node.children.map((child, i) => (
        <ScopeTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          expandedMap={expandedMap}
          onToggle={onToggle}
          onRemove={onRemove}
          isLast={i === node.children.length - 1}
        />
      ))}
    </>
  )
}

// ── Parent path helper ────────────────────────────────────────────────────────

function buildIdMap(categories) {
  const m = {}
  categories.forEach(c => { m[c.id] = c })
  return m
}

function getParentPath(cat, idMap) {
  const parts = []
  let cur = idMap[cat.id_parent]
  while (cur) {
    parts.unshift(cur.nom)
    cur = idMap[cur.id_parent]
  }
  return parts.join(' › ')
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Scope() {
  const { user }    = useAuthStore()
  const navigate    = useNavigate()
  const qc          = useQueryClient()

  const [search, setSearch]       = useState('')
  const [debouncedSearch, setDS]  = useState('')
  const [selected, setSelected]   = useState([])
  const [expanded, setExpanded]   = useState({})
  const [toast, setToast]         = useState(null)
  const debounceRef               = useRef(null)

  // Redirect if not RESP_MARKETING
  useEffect(() => {
    if (user && user.role !== 'RESP_MARKETING') navigate('/tenant/dashboard', { replace: true })
  }, [user, navigate])

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDS(search), 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const scopeQ     = useQuery({ queryKey: ['categories'],                  queryFn: getCategories })
  const availableQ = useQuery({ queryKey: ['scope-available', debouncedSearch], queryFn: () => getScopeAvailable(debouncedSearch) })

  const scopeCats  = scopeQ.data ?? []
  const tree       = buildCategoryTree(scopeCats)
  const available  = availableQ.data ?? []

  const plan       = user?.plan_abonnement ?? 'BASIC'
  const maxCat     = PLAN_MAX[plan]
  const used       = scopeCats.length
  const totalOffres = scopeCats.reduce((s, c) => s + (c.nb_produits ?? 0), 0)
  const pct        = maxCat ? Math.min(Math.round(used / maxCat * 100), 100) : 0

  // Build id map from all available + scope cats for parent path
  const allKnownCats = [...scopeCats, ...available]
  const idMap        = buildIdMap(allKnownCats)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleRemove(catId, catNom) {
    if (!window.confirm(`Supprimer "${catNom}" de votre périmètre ?`)) return
    try {
      await removeFromScope(catId)
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['scope-available'] })
      showToast(`Catégorie "${catNom}" retirée`)
    } catch (err) {
      const detail = err?.response?.data?.detail
      showToast(detail ?? 'Impossible de supprimer la dernière catégorie')
    }
  }

  async function handleAdd() {
    if (!selected.length) return
    try {
      const res = await addToScope(selected)
      setSelected([])
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['scope-available'] })
      showToast(`${res.added ?? selected.length} catégorie(s) ajoutée(s)`)
    } catch (err) {
      const detail = err?.response?.data?.detail
      showToast(detail ?? 'Erreur lors de l\'ajout')
    }
  }

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div style={{ padding: 24, position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'var(--pw-slate-900)', color: '#fff',
          padding: '10px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 500,
          boxShadow: 'var(--pw-shadow-lg)',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="pw-h1">Périmètre de surveillance</div>
          <div className="pw-muted" style={{ fontSize: 13 }}>
            Choisissez les catégories que PriceWatch doit surveiller pour votre organisation.
          </div>
        </div>
      </div>

      {/* Usage bar */}
      <div className="pw-card" style={{ padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--pw-indigo-50)', color: 'var(--pw-indigo)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <IcoMap />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>
              Quota catégories · plan {plan}
            </span>
            <span style={{ marginLeft: 'auto' }} className="pw-mono">
              <strong>{used}</strong> / {maxCat ?? '∞'} catégories · <strong>{formatNumber(totalOffres)}</strong> offres suivies
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--pw-slate-100)', overflow: 'hidden' }}>
            <div style={{
              width: maxCat ? `${pct}%` : '8%',
              height: '100%',
              background: 'linear-gradient(90deg, var(--pw-indigo), var(--pw-teal))',
              transition: 'width .4s',
            }} />
          </div>
        </div>
        {plan !== 'PREMIUM' && (
          <button className="pw-btn" onClick={() => navigate('/tenant/profile')}>
            Plan PREMIUM <IcoArrow />
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18 }}>

        {/* LEFT — Current scope */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div>
              <div className="title">Périmètre actuel</div>
              <div className="sub">
                {used} catégorie{used !== 1 ? 's' : ''} · {formatNumber(totalOffres)} offres surveillées
              </div>
            </div>
          </div>
          <div style={{ padding: '6px 16px' }}>
            {scopeQ.isLoading
              ? [0, 1, 2, 3].map(i => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--pw-border)' }}>
                    <div className="pw-sk" style={{ width: 14, height: 14, borderRadius: 3 }} />
                    <div className="pw-sk" style={{ width: 16, height: 16, borderRadius: 4 }} />
                    <div className="pw-sk" style={{ flex: 1, height: 13, borderRadius: 4 }} />
                    <div className="pw-sk" style={{ width: 56, height: 11, borderRadius: 4 }} />
                  </div>
                ))
              : scopeQ.isError
              ? (
                <div style={{ padding: '20px 0', color: 'var(--pw-red)', fontSize: 13 }}>
                  Erreur de chargement.{' '}
                  <button className="pw-btn pw-btn-sm" onClick={() => qc.invalidateQueries({ queryKey: ['categories'] })}>
                    Réessayer
                  </button>
                </div>
              )
              : tree.length === 0
              ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
                  Aucune catégorie dans votre périmètre
                </div>
              )
              : tree.map((node, i) => (
                  <ScopeTreeNode
                    key={node.id}
                    node={node}
                    depth={0}
                    expandedMap={expanded}
                    onToggle={toggleExpand}
                    onRemove={handleRemove}
                    isLast={i === tree.length - 1}
                  />
                ))
            }
          </div>
        </div>

        {/* RIGHT — Add categories */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div>
              <div className="title">Ajouter des catégories</div>
              <div className="sub">Recherchez ou parcourez le catalogue</div>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: 14, borderBottom: '1px solid var(--pw-border)' }}>
            <div className="pw-input" style={{ padding: '8px 12px' }}>
              <IcoSearch />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher une catégorie, une marque…"
              />
            </div>
          </div>

          {/* Results */}
          <div style={{ padding: '6px 16px', flex: 1, overflowY: 'auto', maxHeight: 440 }}>
            <div style={{ fontSize: 11, color: 'var(--pw-slate-500)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, padding: '10px 0 6px' }}>
              Résultats — {available.length} catégorie{available.length !== 1 ? 's' : ''}
            </div>

            {availableQ.isLoading
              ? [0, 1, 2, 3].map(i => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--pw-border)', alignItems: 'flex-start' }}>
                    <div className="pw-sk" style={{ width: 16, height: 16, borderRadius: 4, marginTop: 2 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div className="pw-sk" style={{ height: 13, width: '65%', borderRadius: 4 }} />
                      <div className="pw-sk" style={{ height: 10, width: '45%', borderRadius: 4 }} />
                    </div>
                    <div className="pw-sk" style={{ width: 52, height: 11, borderRadius: 4 }} />
                  </div>
                ))
              : available.length === 0
              ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
                  Toutes les catégories sont déjà dans votre périmètre
                </div>
              )
              : available.map(cat => {
                  const parentPath = getParentPath(cat, idMap)
                  const isSelected = selected.includes(cat.id)
                  return (
                    <div
                      key={cat.id}
                      onClick={() => toggleSelect(cat.id)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        borderBottom: '1px solid var(--pw-border)',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--pw-indigo-50)' : 'transparent',
                        margin: '0 -16px', padding: '10px 16px',
                      }}
                    >
                      <Checkbox checked={isSelected} size={16} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--pw-slate-900)' }}>{cat.nom}</div>
                        {parentPath && (
                          <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 2 }}>{parentPath}</div>
                        )}
                      </div>
                      <span className="pw-pill slate" style={{ fontSize: 11, flexShrink: 0 }}>
                        {formatNumber(cat.nb_produits)} offres
                      </span>
                    </div>
                  )
                })
            }
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--pw-border)', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--pw-slate-500)' }}>
              <strong className="pw-mono" style={{ color: 'var(--pw-slate-900)' }}>{selected.length}</strong>{' '}
              catégorie{selected.length !== 1 ? 's' : ''} sélectionnée{selected.length !== 1 ? 's' : ''}
            </span>
            <button
              className="pw-btn pw-btn-primary"
              style={{ marginLeft: 'auto' }}
              disabled={selected.length === 0}
              onClick={handleAdd}
            >
              <IcoPlus /> Ajouter la sélection
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
