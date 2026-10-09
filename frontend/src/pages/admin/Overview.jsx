import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, RefreshCw, GitMerge, Package,
  CheckCircle, Database, TrendingUp,
  AlertTriangle, RotateCcw,
} from 'lucide-react'
import StatCard, { StatCardSkeleton } from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { getPlatformStats, getScrapingStats, getMatchingStats } from '../../api/admin/stats'
import { getScrapers, retryScraper } from '../../api/admin/scrapers'
import { formatNumber, formatDuration, timeAgo } from '../../utils/format'

// ── Statut badge mapping ──────────────────────────────────────────────────────
const STATUT_VARIANT = {
  TERMINE:   'success',
  EN_COURS:  'warning',
  ECHOUE:    'danger',
  ANNULE:    'gray',
  EN_ATTENTE: 'info',
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function ErrorState({ onRetry }) {
  return (
    <div className="flex items-center gap-3 text-sm text-red-600 py-2">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>Erreur de chargement</span>
      <button onClick={onRetry} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 underline">
        <RotateCcw className="w-3 h-3" /> Réessayer
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Overview() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const qc = useQueryClient()

  const {
    data: platform, isLoading: loadingPlatform,
    isError: errPlatform, refetch: refetchPlatform,
  } = useQuery({ queryKey: ['platformStats'], queryFn: getPlatformStats, staleTime: 30_000 })

  const {
    data: matching, isLoading: loadingMatching,
    isError: errMatching, refetch: refetchMatching,
  } = useQuery({ queryKey: ['matchingStats'], queryFn: getMatchingStats, staleTime: 30_000 })

  const {
    data: sitesData, isLoading: loadingSites,
    isError: errSites, refetch: refetchSites,
  } = useQuery({ queryKey: ['scrapingStats', '7d'], queryFn: () => getScrapingStats('7d'), staleTime: 60_000 })

  const {
    data: scrapersData, isLoading: loadingScrapers,
    isError: errScrapers, refetch: refetchScrapers,
  } = useQuery({ queryKey: ['scrapers', 8], queryFn: () => getScrapers({ limit: 8 }), staleTime: 30_000 })

  const retryMutation = useMutation({
    mutationFn: retryScraper,
    onSuccess: (data) => {
      showToast(data.message || 'Relance lancée')
      qc.invalidateQueries({ queryKey: ['scrapers'] })
    },
    onError: () => showToast('Erreur lors de la relance', 'danger'),
  })

  // ── Derived values ──────────────────────────────────────────────────────────
  const matchingPct = platform && matching && platform.nb_offres > 0
    ? ((matching.offres_matchees / platform.nb_offres) * 100).toFixed(1)
    : '0.0'

  const scrapers = scrapersData?.data ?? []

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ROW 1 — Operational KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {loadingPlatform || loadingMatching ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : errPlatform || errMatching ? (
          <div className="col-span-4">
            <ErrorState onRetry={() => { refetchPlatform(); refetchMatching() }} />
          </div>
        ) : (
          <>
            <StatCard
              icon={Building2}
              value={formatNumber(platform.nb_tenants_actifs)}
              label="Tenants actifs"
              sub={`sur ${platform.nb_tenants} total`}
              color="navy"
            />
            <StatCard
              icon={RefreshCw}
              value={formatNumber(platform.nb_scrappers_en_cours)}
              label="Scrapers en cours"
              color={platform.nb_scrappers_en_cours > 0 ? 'blue' : 'gray'}
            />
            <StatCard
              icon={AlertTriangle}
              value={formatNumber(platform.scrapers_echoue_24h)}
              label="Échecs 24h"
              color={platform.scrapers_echoue_24h > 0 ? 'red' : 'gray'}
            />
            <StatCard
              icon={GitMerge}
              value={formatNumber(matching.incertain)}
              label="Candidats en attente"
              color={matching.incertain > 0 ? 'amber' : 'gray'}
            />
          </>
        )}
      </div>

      {/* ROW 2 — Data scale */}
      <div className="grid grid-cols-4 gap-4">
        {loadingPlatform || loadingMatching ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : errPlatform || errMatching ? null : (
          <>
            <StatCard
              icon={Package}
              value={formatNumber(platform.nb_offres)}
              label="Offres collectées"
              color="teal"
            />
            <StatCard
              icon={CheckCircle}
              value={formatNumber(matching.offres_matchees)}
              label="Produits matchés"
              sub={`${matchingPct}% des offres`}
              color="blue"
            />
            <StatCard
              icon={Database}
              value={formatNumber(platform.nb_referentiels)}
              label="Référentiels"
              color="gray"
            />
            <StatCard
              icon={TrendingUp}
              value={`${matchingPct}%`}
              label="Taux de matching"
              color="teal"
            />
          </>
        )}
      </div>

      {/* ROW 3 — Collectes + Site performance */}
      <div className="grid grid-cols-5 gap-4">

        {/* LEFT 60% — Recent runs */}
        <div className="col-span-3">
          <Section title="Collectes récentes">
            {loadingScrapers ? (
              <table className="w-full text-sm">
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      {[40, 28, 20, 16, 16, 12].map((w, j) => (
                        <td key={j} className="py-2.5 pr-3">
                          <div className={`animate-pulse h-3.5 bg-gray-200 rounded w-${w}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : errScrapers ? (
              <ErrorState onRetry={refetchScrapers} />
            ) : scrapers.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Aucune collecte récente</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Site', 'Statut', 'Début', 'Durée', 'Offres', ''].map((h) => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 pb-2 pr-3 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scrapers.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="py-2.5 pr-3 font-medium text-gray-800 capitalize">
                        {s.site_name ?? '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge variant={STATUT_VARIANT[s.statut] ?? 'gray'} label={s.statut ?? '—'} />
                      </td>
                      <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">
                        {timeAgo(s.date_debut)}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">
                        {formatDuration(s.duree_secondes)}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-700 font-medium">
                        {formatNumber(s.offres_collectees)}
                      </td>
                      <td className="py-2.5">
                        {s.statut === 'ECHOUE' && (
                          <button
                            onClick={() => retryMutation.mutate(s.id)}
                            disabled={retryMutation.isPending}
                            className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                          >
                            Relancer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* RIGHT 40% — Site performance */}
        <div className="col-span-2">
          <Section title="Performance 7 jours">
            {loadingSites ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5 animate-pulse">
                    <div className="h-3.5 bg-gray-200 rounded w-24" />
                    <div className="h-2 bg-gray-200 rounded-full w-full" />
                    <div className="h-3 bg-gray-200 rounded w-32" />
                  </div>
                ))}
              </div>
            ) : errSites ? (
              <ErrorState onRetry={refetchSites} />
            ) : !sitesData || sitesData.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune donnée disponible</p>
            ) : (
              <div className="space-y-4">
                {sitesData.map((site) => {
                  const pct = site.total_runs > 0
                    ? Math.round((site.successful / site.total_runs) * 100)
                    : 0
                  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  return (
                    <div key={site.site_id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800 capitalize">
                          {site.site_name ?? site.site_id}
                        </span>
                        <span className="text-xs font-semibold text-gray-700">{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {site.total_runs} run{site.total_runs !== 1 ? 's' : ''} · moy.{' '}
                        {Math.round(site.avg_offres_per_run).toLocaleString()} offres
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* ROW 4 — Matching summary */}
      <Section
        title="File de matching"
        action={
          <button
            onClick={() => navigate('/admin/matching')}
            className="text-sm text-[#1B3A6B] hover:text-blue-700 font-medium"
          >
            Voir la file →
          </button>
        }
      >
        {loadingMatching ? (
          <div className="grid grid-cols-3 gap-3 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded-lg" />
            ))}
          </div>
        ) : errMatching ? (
          <ErrorState onRetry={refetchMatching} />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Incertains</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{formatNumber(matching.incertain)}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Validés</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{formatNumber(matching.valide)}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rejetés</p>
              <p className="text-2xl font-bold text-gray-700 mt-1">{formatNumber(matching.rejete)}</p>
            </div>
          </div>
        )}
      </Section>

    </div>
  )
}
