import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Play, ChevronDown, ChevronRight,
  AlertTriangle, TrendingUp, Package, Clock, RefreshCw,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import StatCard, { StatCardSkeleton } from '../../components/ui/StatCard'
import { useToast } from '../../components/ui/Toast'
import { formatNumber, timeAgo } from '../../utils/format'
import {
  getScrapers, retryScraper, getScraperStats, getScraperDetail,
  cancelScraper, launchScraper, getSources,
} from '../../api/admin/scrapers'

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUT_VARIANT = {
  TERMINE:    'success',
  EN_COURS:   'warning',
  ECHOUE:     'danger',
  ANNULE:     'gray',
  EN_ATTENTE: 'info',
}

function fmtDuration(secs) {
  if (secs == null) return '—'
  if (secs < 60)   return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

// ── Expanded detail sub-table ─────────────────────────────────────────────────
function ExpandedDetail({ scraperId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['scraperDetail', scraperId],
    queryFn: () => getScraperDetail(scraperId),
    staleTime: 30_000,
  })

  const stats = data?.category_stats ?? []

  if (isLoading) {
    return (
      <tr>
        <td colSpan={7} className="py-4 px-10 bg-slate-50 border-b border-gray-100">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse h-3 bg-gray-200 rounded w-3/4" />
            ))}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={7} className="p-0 border-b border-gray-100">
        <div className="bg-slate-50 px-10 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Détail par catégorie
          </p>
          {stats.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Aucune statistique de catégorie</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  {['URL Catégorie', 'Produits', 'Pages', 'Durée'].map((h) => (
                    <th key={h} className="text-left font-medium text-gray-400 pb-1.5 pr-4 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 pr-4 max-w-xs">
                      <span
                        title={s.category_url}
                        className="text-gray-600 font-mono block truncate"
                        style={{ maxWidth: '420px' }}
                      >
                        {s.category_url ?? '—'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-4 text-gray-700">{s.products_found}</td>
                    <td className="py-1.5 pr-4 text-gray-700">{s.page_number}</td>
                    <td className="py-1.5 pr-4 text-gray-500">
                      {s.duration_ms != null ? `${(s.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Scrapers() {
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()

  const page       = parseInt(params.get('page') || '1', 10)
  const statut     = params.get('statut') || ''
  const siteFilter = params.get('site_id') || ''

  const setFilter = (key, val) => {
    const next = new URLSearchParams(params)
    if (val) next.set(key, val); else next.delete(key)
    next.set('page', '1')
    setParams(next)
  }

  const [expandedId,   setExpandedId]   = useState(null)
  const [launchOpen,   setLaunchOpen]   = useState(false)
  const [launchSite,   setLaunchSite]   = useState('')
  const [launchError,  setLaunchError]  = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ['scraperStats', '7d'],
    queryFn: () => getScraperStats('7d'),
    staleTime: 60_000,
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['scrapers', page, statut, siteFilter],
    queryFn: () => getScrapers({
      page, limit: 20,
      statut:  statut     || undefined,
      site_id: siteFilter || undefined,
    }),
    staleTime: 15_000,
    refetchInterval: (query) => {
      const rows = query.state.data?.data ?? []
      return rows.some((s) => s.statut === 'EN_COURS') ? 30_000 : false
    },
  })

  const { data: sourcesData } = useQuery({
    queryKey: ['sources'],
    queryFn: getSources,
    staleTime: 300_000,
  })

  // ── Derived ───────────────────────────────────────────────────────────────
  const scrapers      = data?.data ?? []
  const meta          = data?.meta
  const pagination    = meta ? { page: meta.page, pages: meta.pages, total: meta.total } : null
  const hasEnCours    = scrapers.some((s) => s.statut === 'EN_COURS')
  const sources       = sourcesData ?? []
  const activeSources = sources.filter((s) => s.est_actif)

  const statsList = statsData ?? []
  const totalRuns = statsList.reduce((a, b) => a + b.total_runs, 0)
  const totalSucc = statsList.reduce((a, b) => a + b.successful, 0)
  const tauxSucc  = totalRuns > 0 ? Math.round((totalSucc / totalRuns) * 100) : 0
  const moyOffres = statsList.length > 0
    ? Math.round(statsList.reduce((a, b) => a + b.avg_offres_per_run, 0) / statsList.length)
    : 0
  const lastRunAt = statsList.reduce((max, b) => {
    if (!b.last_run_at) return max
    return !max || b.last_run_at > max ? b.last_run_at : max
  }, null)
  const tauxColor = tauxSucc >= 80 ? 'teal' : tauxSucc >= 50 ? 'amber' : 'red'

  // ── Mutations ─────────────────────────────────────────────────────────────
  const retryMut = useMutation({
    mutationFn: retryScraper,
    onSuccess: () => {
      showToast('Relance lancée')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['scrapers'] }), 2000)
    },
    onError: () => showToast('Erreur lors de la relance', 'danger'),
  })

  const cancelMut = useMutation({
    mutationFn: cancelScraper,
    onSuccess: () => {
      showToast('Collecte annulée')
      setCancelTarget(null)
      qc.invalidateQueries({ queryKey: ['scrapers'] })
    },
    onError: () => showToast("Erreur lors de l'annulation", 'danger'),
  })

  const launchMut = useMutation({
    mutationFn: (site_id) => launchScraper(site_id),
    onSuccess: (_, site_id) => {
      const src = activeSources.find((s) => s.scraper_id === site_id)
      showToast(`Collecte lancée pour ${src?.name ?? site_id}`)
      setLaunchOpen(false)
      setLaunchSite('')
      setLaunchError('')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['scrapers'] }), 2000)
    },
    onError: (err) => {
      setLaunchError(err?.response?.data?.detail || 'Erreur lors du lancement')
    },
  })

  const handleLaunch = () => {
    if (!launchSite) { setLaunchError('Veuillez sélectionner un site'); return }
    setLaunchError('')
    launchMut.mutate(launchSite)
  }

  const handleRowClick = (id) =>
    setExpandedId((prev) => (prev === id ? null : id))

  const changePage = (p) => {
    const next = new URLSearchParams(params)
    next.set('page', String(p))
    setParams(next)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Supervision des collectes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Suivi et gestion des scrapers</p>
        </div>
        <button
          onClick={() => { setLaunchOpen(true); setLaunchError('') }}
          className="flex items-center gap-2 bg-[#1B3A6B] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#152f58] transition-colors"
        >
          <Play className="w-4 h-4" />
          Lancer une collecte
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {loadingStats ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard icon={RefreshCw}  value={formatNumber(totalRuns)} label="Runs 7 jours"       color="navy" />
            <StatCard icon={TrendingUp} value={`${tauxSucc}%`}          label="Taux de succès"      color={tauxColor} />
            <StatCard icon={Package}    value={formatNumber(moyOffres)}  label="Moy. offres / run"   color="blue" />
            <StatCard icon={Clock}      value={lastRunAt ? timeAgo(lastRunAt) : '—'} label="Dernière collecte" color="gray" />
          </>
        )}
      </div>

      {/* Filters + table card */}
      <div className="bg-white rounded-xl shadow-sm">

        {/* Filters bar */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
            value={siteFilter}
            onChange={(e) => setFilter('site_id', e.target.value)}
          >
            <option value="">Tous les sites</option>
            {sources.map((s) => (
              <option key={s.id} value={s.scraper_id ?? String(s.id)}>{s.name}</option>
            ))}
          </select>
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
            value={statut}
            onChange={(e) => setFilter('statut', e.target.value)}
          >
            <option value="">Tous les statuts</option>
            {['EN_COURS', 'TERMINE', 'ECHOUE', 'ANNULE'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {hasEnCours && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Mise à jour automatique
            </span>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="w-8 px-4 py-3" />
                {['Site', 'Statut', 'Début', 'Durée', 'Offres', 'Actions'].map((h) => (
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
                    {[120, 80, 96, 60, 60, 48].map((w, j) => (
                      <td key={j} className="py-3 pr-4">
                        <div className="animate-pulse h-3.5 bg-gray-200 rounded" style={{ width: `${w}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-red-500">
                    Erreur de chargement.{' '}
                    <button onClick={refetch} className="underline text-gray-500 hover:text-gray-700">
                      Réessayer
                    </button>
                  </td>
                </tr>
              ) : scrapers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-gray-400">
                    Aucune collecte trouvée
                  </td>
                </tr>
              ) : (
                scrapers.flatMap((s) => {
                  const isExpanded = expandedId === s.id
                  return [
                    <tr
                      key={s.id}
                      onClick={() => handleRowClick(s.id)}
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-slate-50' : 'hover:bg-gray-50/60'
                      }`}
                    >
                      <td className="px-4 py-2.5 text-gray-400">
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-gray-800 capitalize">
                        {s.site_name ?? '—'}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={STATUT_VARIANT[s.statut] ?? 'gray'} label={s.statut ?? '—'} />
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">
                        {s.date_debut ? timeAgo(s.date_debut) : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">
                        {fmtDuration(s.duree_secondes)}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-700 font-medium">
                        {formatNumber(s.offres_collectees)}
                      </td>
                      <td className="py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                        {s.statut === 'EN_COURS' && (
                          <button
                            onClick={() => setCancelTarget(s)}
                            className="text-xs px-2.5 py-1 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Annuler
                          </button>
                        )}
                        {s.statut === 'ECHOUE' && (
                          <button
                            onClick={() => retryMut.mutate(s.id)}
                            disabled={retryMut.isPending}
                            className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            Relancer
                          </button>
                        )}
                      </td>
                    </tr>,
                    isExpanded && <ExpandedDetail key={`detail-${s.id}`} scraperId={s.id} />,
                  ].filter(Boolean)
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && !isLoading && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              {pagination.total} collecte{pagination.total !== 1 ? 's' : ''}
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

      {/* Launch modal */}
      <Modal
        open={launchOpen}
        onClose={() => { setLaunchOpen(false); setLaunchSite(''); setLaunchError('') }}
        title="Lancer une collecte"
        size="sm"
        footer={
          <>
            <button
              onClick={() => { setLaunchOpen(false); setLaunchSite(''); setLaunchError('') }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Annuler
            </button>
            <button
              onClick={handleLaunch}
              disabled={launchMut.isPending}
              className="px-4 py-2 text-sm font-medium bg-[#1B3A6B] text-white rounded-lg hover:bg-[#152f58] disabled:opacity-50 transition-colors"
            >
              {launchMut.isPending ? 'Lancement…' : 'Lancer'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Site *</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
              value={launchSite}
              onChange={(e) => setLaunchSite(e.target.value)}
            >
              <option value="">Sélectionner un site…</option>
              {activeSources.map((s) => (
                <option key={s.id} value={s.scraper_id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Cette action lance un scraping complet du site sélectionné.
              La durée peut varier de 30 minutes à plusieurs heures.
            </p>
          </div>
          {launchError && (
            <p className="text-xs text-red-600">{launchError}</p>
          )}
        </div>
      </Modal>

      {/* Cancel confirmation */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Annuler la collecte en cours ?"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setCancelTarget(null)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Retour
            </button>
            <button
              onClick={() => cancelMut.mutate(cancelTarget.id)}
              disabled={cancelMut.isPending}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {cancelMut.isPending ? 'Annulation…' : "Confirmer l'annulation"}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Les tâches en cours seront interrompues.
        </p>
      </Modal>

    </div>
  )
}
