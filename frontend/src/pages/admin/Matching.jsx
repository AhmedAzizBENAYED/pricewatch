import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, ExternalLink } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { useDebounce } from '../../utils/hooks'
import { formatNumber } from '../../utils/format'
import { getCandidates, getMatchingStats, bulkAction } from '../../api/admin/matching'

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUT_VARIANT = { INCERTAIN: 'warning', VALIDE: 'success', REJETE: 'gray' }

function scoreTextColor(s) {
  if (s == null) return 'text-gray-400'
  if (s >= 0.65) return 'text-green-600'
  if (s >= 0.45) return 'text-amber-600'
  return 'text-red-600'
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ stats, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-5 animate-pulse space-y-3">
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="flex-1 h-16 bg-gray-200 rounded-lg" />)}
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full" />
      </div>
    )
  }
  if (!stats) return null

  const { total = 0, incertain = 0, valide = 0, rejete = 0 } = stats
  const taux        = total > 0 ? Math.round((valide / total) * 100) : 0
  const pctValide   = total > 0 ? (valide    / total) * 100 : 0
  const pctRejete   = total > 0 ? (rejete    / total) * 100 : 0
  const pctIncertain = total > 0 ? (incertain / total) * 100 : 0

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex gap-4">
        <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">En attente</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{formatNumber(incertain)}</p>
        </div>
        <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Validés</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{formatNumber(valide)}</p>
        </div>
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rejetés</p>
          <p className="text-2xl font-bold text-gray-700 mt-1">{formatNumber(rejete)}</p>
        </div>
      </div>
      <div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
          <div className="bg-green-500 transition-all" style={{ width: `${pctValide}%` }} />
          <div className="bg-gray-400 transition-all"  style={{ width: `${pctRejete}%` }} />
          <div className="bg-amber-400 transition-all" style={{ width: `${pctIncertain}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Taux de validation :{' '}
          <span className="font-semibold text-gray-600">{taux}%</span>
        </p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Matching() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()

  const page   = parseInt(params.get('page') || '1', 10)
  const statut = params.get('statut') || 'INCERTAIN'

  const [scoreMin, setScoreMin] = useState(0)
  const [scoreMax, setScoreMax] = useState(1)
  const debouncedMin = useDebounce(scoreMin, 400)
  const debouncedMax = useDebounce(scoreMax, 400)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const setFilter = (key, val) => {
    const next = new URLSearchParams(params)
    if (val) next.set(key, val); else next.delete(key)
    next.set('page', '1')
    setParams(next)
    setSelectedIds(new Set())
  }

  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ['matchingStats'],
    queryFn: getMatchingStats,
    staleTime: 30_000,
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['candidates', page, statut, debouncedMin, debouncedMax],
    queryFn: () => getCandidates({
      page, limit: 20,
      statut:    statut || undefined,
      score_min: debouncedMin > 0  ? debouncedMin : undefined,
      score_max: debouncedMax < 1  ? debouncedMax : undefined,
    }),
    staleTime: 30_000,
  })

  const candidates = data?.data ?? []
  const meta       = data?.meta
  const pagination = meta ? { page: meta.page, pages: meta.pages, total: meta.total } : null
  const currentIds = candidates.map((c) => c.id)
  const allSelected = currentIds.length > 0 && currentIds.every((id) => selectedIds.has(id))

  const bulkMut = useMutation({
    mutationFn: ({ ids, action }) => bulkAction(ids, action),
    onSuccess: (res) => {
      showToast(`${res.updated ?? 0} candidat(s) traité(s)`)
      setSelectedIds(new Set())
      qc.invalidateQueries({ queryKey: ['candidates'] })
      qc.invalidateQueries({ queryKey: ['matchingStats'] })
    },
    onError: () => showToast("Erreur lors de l'action groupée", 'danger'),
  })

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => { const n = new Set(prev); currentIds.forEach((id) => n.delete(id)); return n })
    } else {
      setSelectedIds((prev) => new Set([...prev, ...currentIds]))
    }
  }

  const toggleSelect = (id) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleRowClick = (c, index) =>
    navigate(`/admin/matching/${c.id}`, { state: { candidates, currentIndex: index, page, statut } })

  const changePage = (p) => {
    const next = new URLSearchParams(params)
    next.set('page', String(p))
    setParams(next)
    setSelectedIds(new Set())
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">File de validation — Matching produits</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Validation des rapprochements détectés automatiquement
        </p>
      </div>

      {/* Stats */}
      <StatsBar stats={statsData} loading={loadingStats} />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-[#1B3A6B] text-white rounded-xl px-5 py-3 flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium">{selectedIds.size} candidat(s) sélectionné(s)</span>
          <button
            onClick={() => bulkMut.mutate({ ids: [...selectedIds], action: 'validate' })}
            disabled={bulkMut.isPending}
            className="text-xs px-3 py-1.5 bg-green-500 hover:bg-green-600 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            Valider tous
          </button>
          <button
            onClick={() => bulkMut.mutate({ ids: [...selectedIds], action: 'reject' })}
            disabled={bulkMut.isPending}
            className="text-xs px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            Rejeter tous
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs px-3 py-1.5 text-blue-200 hover:text-white ml-auto transition-colors"
          >
            Désélectionner
          </button>
        </div>
      )}

      {/* Filters + table card */}
      <div className="bg-white rounded-xl shadow-sm">

        {/* Filters */}
        <div className="flex items-center gap-5 p-4 border-b border-gray-100 flex-wrap">
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
            value={statut}
            onChange={(e) => setFilter('statut', e.target.value)}
          >
            <option value="INCERTAIN">INCERTAIN</option>
            <option value="VALIDE">VALIDE</option>
            <option value="REJETE">REJETÉ</option>
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Score min</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={scoreMin}
              onChange={(e) => setScoreMin(parseFloat(e.target.value))}
              className="w-28 accent-[#1B3A6B]"
            />
            <span className="text-xs font-medium text-gray-600 w-8">{scoreMin.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Score max</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={scoreMax}
              onChange={(e) => setScoreMax(parseFloat(e.target.value))}
              className="w-28 accent-[#1B3A6B]"
            />
            <span className="text-xs font-medium text-gray-600 w-8">{scoreMax.toFixed(2)}</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                {['Offre A', 'Offre B', 'Score', 'Statut', 'Action'].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 py-3 pr-4 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-4 py-3" />
                    {[160, 160, 48, 80, 80].map((w, j) => (
                      <td key={j} className="py-3 pr-4">
                        <div className="animate-pulse h-3.5 bg-gray-200 rounded" style={{ width: `${w}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-red-500">
                    Erreur de chargement.{' '}
                    <button onClick={refetch} className="underline text-gray-500 hover:text-gray-700">Réessayer</button>
                  </td>
                </tr>
              ) : candidates.length === 0 && statut === 'INCERTAIN' ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">
                      File vide — aucun candidat en attente de validation
                    </p>
                  </td>
                </tr>
              ) : candidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-gray-400">
                    Aucun candidat trouvé
                  </td>
                </tr>
              ) : (
                candidates.map((c, index) => (
                  <tr
                    key={c.id}
                    onClick={() => handleRowClick(c, index)}
                    className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                      />
                    </td>
                    <td className="py-3 pr-4" style={{ maxWidth: '240px' }}>
                      <div className="flex items-center gap-2">
                        {c.offre_a?.image ? (
                          <img
                            src={c.offre_a.image}
                            alt=""
                            className="w-9 h-9 rounded object-contain bg-gray-50 shrink-0 border border-gray-100"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded bg-gray-100 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{c.offre_a?.nom ?? '—'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {c.offre_a?.site_id && (
                              <span className="text-[10px] bg-[#1B3A6B]/10 text-[#1B3A6B] px-1.5 py-0.5 rounded font-medium">
                                {c.offre_a.site_id}
                              </span>
                            )}
                            {c.offre_a?.url_produit && (
                              <a
                                href={c.offre_a.url_produit}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] text-gray-400 hover:text-[#1B3A6B] transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4" style={{ maxWidth: '240px' }}>
                      <div className="flex items-center gap-2">
                        {c.offre_b?.image ? (
                          <img
                            src={c.offre_b.image}
                            alt=""
                            className="w-9 h-9 rounded object-contain bg-gray-50 shrink-0 border border-gray-100"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded bg-gray-100 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{c.offre_b?.nom ?? '—'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {c.offre_b?.site_id && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                                {c.offre_b.site_id}
                              </span>
                            )}
                            {c.offre_b?.url_produit && (
                              <a
                                href={c.offre_b.url_produit}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] text-gray-400 hover:text-[#1B3A6B] transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span className={`text-sm font-bold ${scoreTextColor(c.score_confluence)}`}>
                        {c.score_confluence != null ? c.score_confluence.toFixed(2) : '—'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={STATUT_VARIANT[c.statut] ?? 'gray'} label={c.statut ?? '—'} />
                    </td>
                    <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleRowClick(c, index)}
                        className="text-xs px-3 py-1.5 border border-[#1B3A6B] text-[#1B3A6B] rounded-lg hover:bg-[#1B3A6B] hover:text-white transition-colors whitespace-nowrap"
                      >
                        Examiner →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && !isLoading && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              {pagination.total} candidat{pagination.total !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => changePage(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                ← Préc.
              </button>
              <span className="text-xs text-gray-500">
                Page {pagination.page} sur {pagination.pages || 1}
              </span>
              <button
                onClick={() => changePage(pagination.page + 1)}
                disabled={pagination.page >= (pagination.pages || 1)}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Suiv. →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
