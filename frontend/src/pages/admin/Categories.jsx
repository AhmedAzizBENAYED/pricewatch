import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FolderOpen, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { useDebounce } from '../../utils/hooks'
import { formatNumber } from '../../utils/format'
import { getCategories, getCategory } from '../../api/admin/categories'

// ── Category detail panel ─────────────────────────────────────────────────────
function CategoryDetail({ id }) {
  const [showUrls, setShowUrls] = useState(false)

  const { data: cat, isLoading } = useQuery({
    queryKey: ['category', id],
    queryFn:  () => getCategory(id),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
        <div className="h-16 bg-gray-100 rounded-xl" />
        <div className="space-y-2">
          <div className="h-3 bg-gray-100 rounded w-1/4" />
          <div className="flex gap-2">
            {[1, 2].map((i) => <div key={i} className="h-6 w-20 bg-gray-100 rounded-full" />)}
          </div>
        </div>
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    )
  }

  if (!cat) return null

  return (
    <div className="p-6 space-y-6">
      {/* Name + IDs */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">{cat.nom}</h2>
        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-400">
          <span>ID : {cat.id}</span>
          {cat.id_parent && <span>Parent ID : {cat.id_parent}</span>}
          {cat.parent_nom && (
            <span className="text-gray-500">→ <span className="font-medium">{cat.parent_nom}</span></span>
          )}
        </div>
      </div>

      {/* Offres */}
      <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <p className="text-xs text-gray-400">Offres liées</p>
          <p className="text-base font-bold text-gray-800">{formatNumber(cat.nb_offres)}</p>
        </div>
      </div>

      {/* Tenants */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
          Tenants qui surveillent cette catégorie
        </p>
        {cat.tenants_assignes?.length ? (
          <div className="flex flex-wrap gap-2">
            {cat.tenants_assignes.map((t) => (
              <span
                key={t.tenant_id}
                className="text-xs bg-[#1B3A6B]/10 text-[#1B3A6B] px-2.5 py-1 rounded-full font-medium"
              >
                {t.tenant_nom}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Aucun tenant ne surveille cette catégorie</p>
        )}
      </div>

      {/* URLs par site — collapsible */}
      <div>
        <button
          onClick={() => setShowUrls((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#1B3A6B] hover:text-[#15305a] transition-colors"
        >
          {showUrls ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Voir les URLs de scraping
        </button>

        {showUrls && (
          <div className="mt-3">
            {cat.urls_par_site && Object.keys(cat.urls_par_site).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(cat.urls_par_site).map(([site, urls]) => (
                  <div key={site}>
                    <p className="text-xs font-bold text-gray-700 mb-1">{site}</p>
                    {Array.isArray(urls) ? (
                      urls.map((u, i) => (
                        <p key={i} className="text-[11px] font-mono text-gray-500 break-all leading-relaxed">
                          {u}
                        </p>
                      ))
                    ) : (
                      <p className="text-[11px] font-mono text-gray-500 break-all">{urls}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-400">Aucune URL de scraping configurée</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Categories() {
  const [page, setPage]           = useState(1)
  const [q, setQ]                 = useState('')
  const debouncedQ = useDebounce(q, 300)
  const [selectedId, setSelectedId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['adminCategories', page, debouncedQ],
    queryFn:  () => getCategories({ page, limit: 50, q: debouncedQ || undefined }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  const cats = data?.data ?? []
  const meta  = data?.meta

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Catalogue de catégories</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {meta?.total != null ? `${formatNumber(meta.total)} catégories globales` : '—'}
          {' '}— référentiel du scraping
        </p>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Rechercher une catégorie…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setPage(1); setSelectedId(null) }}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
      />

      {/* Two-column layout */}
      <div className="flex gap-5 items-start">

        {/* LEFT — list (40%) */}
        <div className="w-2/5 bg-white rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-3 space-y-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="animate-pulse h-10 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : cats.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              Aucune catégorie trouvée
            </div>
          ) : (
            <>
              <ul className="divide-y divide-gray-50">
                {cats.map((cat) => (
                  <li
                    key={cat.id}
                    onClick={() => setSelectedId(cat.id)}
                    className={`flex items-center justify-between gap-2 px-4 py-3 cursor-pointer transition-colors border-l-4 ${
                      selectedId === cat.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-800 truncate">{cat.nom}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cat.nb_offres > 0 && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                          {formatNumber(cat.nb_offres)}
                        </span>
                      )}
                      {cat.nb_tenants > 0 && (
                        <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                          {cat.nb_tenants}T
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* List pagination */}
              {meta && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">{meta.total} catégories</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={meta.page <= 1}
                      className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      ←
                    </button>
                    <span className="text-xs text-gray-500">
                      {meta.page} / {meta.pages || 1}
                    </span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={meta.page >= (meta.pages || 1)}
                      className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT — detail panel (60%) */}
        <div className="flex-1 bg-white rounded-xl shadow-sm min-h-[420px]">
          {selectedId ? (
            <CategoryDetail id={selectedId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-24 text-gray-400">
              <FolderOpen className="w-10 h-10 mb-3" />
              <p className="text-sm">Sélectionnez une catégorie pour voir ses détails</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
