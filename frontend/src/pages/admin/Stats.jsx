import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, Users, Globe, Database,
  Package, CheckCircle, GitMerge, TrendingUp,
} from 'lucide-react'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import { formatNumber, timeAgo } from '../../utils/format'
import { getPlatformStats, getSiteScrapingStats, getMatchingStats, getTenantStats } from '../../api/admin/stats'
import { getSources } from '../../api/admin/sources'

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(num, den) {
  return den > 0 ? Math.round((num / den) * 100) : 0
}

function successColor(p) {
  if (p >= 80) return { text: 'text-green-600', bar: 'bg-green-500' }
  if (p >= 50) return { text: 'text-amber-600', bar: 'bg-amber-400' }
  return { text: 'text-red-600', bar: 'bg-red-500' }
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color = 'navy', loading }) {
  const colorMap = {
    navy:  { bg: 'bg-[#1B3A6B]/10', icon: 'text-[#1B3A6B]' },
    blue:  { bg: 'bg-blue-50',      icon: 'text-blue-600'    },
    teal:  { bg: 'bg-teal-50',      icon: 'text-teal-600'    },
    gray:  { bg: 'bg-gray-100',     icon: 'text-gray-500'    },
    amber: { bg: 'bg-amber-50',     icon: 'text-amber-600'   },
    green: { bg: 'bg-green-50',     icon: 'text-green-600'   },
  }
  const { bg, icon: iconCls } = colorMap[color] ?? colorMap.navy

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconCls}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 truncate">{label}</p>
        {loading ? (
          <div className="animate-pulse h-5 w-16 bg-gray-200 rounded mt-1" />
        ) : (
          <p className="text-lg font-bold text-gray-900">{value ?? '—'}</p>
        )}
      </div>
    </div>
  )
}

// ── SVG Donut chart ───────────────────────────────────────────────────────────
function DonutChart({ incertain, valide, rejete }) {
  const total = (incertain ?? 0) + (valide ?? 0) + (rejete ?? 0)
  const r   = 52
  const cx  = 70
  const cy  = 70
  const circ = 2 * Math.PI * r

  const segments = [
    { value: valide ?? 0,    color: '#22c55e' },
    { value: rejete ?? 0,    color: '#9ca3af' },
    { value: incertain ?? 0, color: '#f59e0b' },
  ]

  let cumulative = 0
  return (
    <svg viewBox="0 0 140 140" className="w-full max-w-[180px] mx-auto">
      {total > 0 ? (
        segments.map((seg, i) => {
          const frac   = seg.value / total
          const len    = frac * circ
          const offset = -(cumulative * circ)
          cumulative  += frac
          if (seg.value === 0) return null
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="22"
              strokeDasharray={`${len} ${circ}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )
        })
      ) : (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="22" />
      )}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#111827" fontSize="18" fontWeight="bold">
        {formatNumber(total)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#9ca3af" fontSize="10">
        candidats
      </text>
    </svg>
  )
}

// ── CSS Bar chart ─────────────────────────────────────────────────────────────
function BarChart({ rows }) {
  const maxRuns = Math.max(...rows.map((r) => r.total_runs), 1)

  return (
    <div className="flex items-end gap-3 h-36 pt-2">
      {rows.map((row) => {
        const p    = pct(row.successful, row.total_runs)
        const { bar } = successColor(p)
        const heightPct = row.total_runs > 0 ? (row.total_runs / maxRuns) * 100 : 0
        return (
          <div key={row.site_id ?? row.site_name} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className="text-xs text-gray-500 font-medium">{row.total_runs}</span>
            <div className="w-full flex flex-col justify-end" style={{ height: '88px' }}>
              <div
                className={`w-full rounded-t-md transition-all ${bar}`}
                style={{ height: `${Math.max(heightPct, row.total_runs > 0 ? 4 : 0)}%` }}
                title={`${row.site_name}: ${row.total_runs} runs, ${p}% succès`}
              />
            </div>
            <span className="text-[10px] text-gray-400 text-center leading-tight truncate w-full">
              {row.site_name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Stats() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('7j')

  const { data: platform, isLoading: loadingPlatform } = useQuery({
    queryKey: ['platformStats'],
    queryFn:  getPlatformStats,
    staleTime: 60_000,
  })

  const { data: sources = [], isLoading: loadingSources } = useQuery({
    queryKey: ['sources'],
    queryFn:  getSources,
    staleTime: 60_000,
  })

  const { data: scraping = [], isLoading: loadingScraping } = useQuery({
    queryKey: ['siteScrapingStats', period],
    queryFn:  getSiteScrapingStats,
    staleTime: 60_000,
  })

  const { data: matching, isLoading: loadingMatching } = useQuery({
    queryKey: ['statsMatching'],
    queryFn:  getMatchingStats,
    staleTime: 60_000,
  })

  const { data: tenants = [], isLoading: loadingTenants } = useQuery({
    queryKey: ['tenantStats'],
    queryFn:  getTenantStats,
    staleTime: 60_000,
  })

  const nbSourcesActives = sources.filter((s) => s.est_actif).length
  const tauxMatching     = pct(matching?.offres_matchees ?? 0, (matching?.offres_matchees ?? 0) + (matching?.offres_non_matchees ?? 0))
  const loadingOverview  = loadingPlatform || loadingSources || loadingMatching

  // Tenant table columns
  const tenantCols = [
    {
      key:    'nom_organisation',
      label:  'Tenant',
      render: (val, row) => (
        <button
          onClick={() => navigate(`/admin/tenants/${row.tenant_id}`)}
          className="font-medium text-[#1B3A6B] hover:underline text-left"
        >
          {val}
        </button>
      ),
    },
    {
      key:    'nb_users',
      label:  'Utilisateurs',
      render: (val) => <span className="text-gray-600">{formatNumber(val)}</span>,
    },
    {
      key:    'nb_categories',
      label:  'Catégories',
      render: (val) => <span className="text-gray-600">{formatNumber(val)}</span>,
    },
    {
      key:    'nb_offres',
      label:  'Offres visibles',
      render: (val) => <span className="text-gray-700 font-medium">{formatNumber(val)}</span>,
    },
    {
      key:    'last_scrape_at',
      label:  'Dernière collecte',
      render: (val) => <span className="text-gray-500 text-xs">{timeAgo(val)}</span>,
    },
  ]

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Statistiques plateforme</h1>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {['7j', '30j'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 transition-colors ${period === p ? 'bg-[#1B3A6B] text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {p === '7j' ? '7 jours' : '30 jours'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 1: Vue d'ensemble ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Vue d'ensemble</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={Building2} label="Tenants actifs"      value={formatNumber(platform?.nb_tenants_actifs)} color="navy"  loading={loadingOverview} />
          <StatCard icon={Users}     label="Utilisateurs"        value={formatNumber(platform?.nb_utilisateurs)}   color="blue"  loading={loadingOverview} />
          <StatCard icon={Globe}     label="Sources actives"     value={formatNumber(nbSourcesActives)}            color="teal"  loading={loadingOverview} />
          <StatCard icon={Database}  label="Référentiels"        value={formatNumber(platform?.nb_referentiels)}   color="gray"  loading={loadingOverview} />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={Package}      label="Offres collectées"     value={formatNumber(platform?.nb_offres)}              color="teal"  loading={loadingOverview} />
          <StatCard icon={CheckCircle}  label="Offres matchées"       value={formatNumber(matching?.offres_matchees)}        color="blue"  loading={loadingOverview} />
          <StatCard icon={GitMerge}     label="Candidats en attente"  value={formatNumber(matching?.incertain)}              color="amber" loading={loadingOverview} />
          <StatCard icon={TrendingUp}   label="Taux matching"         value={loadingOverview ? null : `${tauxMatching}%`}   color="green" loading={loadingOverview} />
        </div>
      </section>

      {/* ── Section 2: Performance par site ────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Performance par site</h2>
          <p className="text-xs text-gray-400">
            Basé sur les {period === '7j' ? '7' : '30'} derniers jours
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loadingScraping ? (
            <div className="p-5 animate-pulse space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded" />
              ))}
            </div>
          ) : scraping.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">Aucune donnée de scraping</div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Site', 'Runs', 'Succès', 'Échecs', 'Taux succès', 'Moy. offres', 'Dernière collecte'].map((h) => (
                        <th key={h} className="text-left text-xs font-medium text-gray-400 py-3 px-4 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scraping.map((row) => {
                      const p   = pct(row.successful, row.total_runs)
                      const { text, bar } = successColor(p)
                      return (
                        <tr key={row.site_id ?? row.site_name} className="border-b border-gray-50 last:border-0">
                          <td className="py-3 px-4 font-medium text-gray-900">{row.site_name}</td>
                          <td className="py-3 px-4 text-gray-600">{row.total_runs}</td>
                          <td className="py-3 px-4 text-green-600 font-medium">{row.successful}</td>
                          <td className={`py-3 px-4 font-medium ${row.failed > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {row.failed}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${bar}`} style={{ width: `${p}%` }} />
                              </div>
                              <span className={`text-xs font-semibold ${text}`}>{p}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-600">{formatNumber(Math.round(row.avg_offres_per_run))}</td>
                          <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                            {row.last_run_at ? timeAgo(row.last_run_at) : 'Jamais'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bar chart */}
              <div className="px-6 pb-5 pt-2 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-3">Nombre de runs par site</p>
                <BarChart rows={scraping} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Section 3: Pipeline de matching ────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Pipeline de matching</h2>

        <div className="bg-white rounded-xl shadow-sm p-6">
          {loadingMatching ? (
            <div className="animate-pulse grid grid-cols-5 gap-6">
              <div className="col-span-2 h-48 bg-gray-100 rounded-xl" />
              <div className="col-span-3 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-8 items-center">

              {/* Left: donut */}
              <div className="col-span-2 space-y-4">
                <DonutChart
                  incertain={matching?.incertain}
                  valide={matching?.valide}
                  rejete={matching?.rejete}
                />
                {/* Legend */}
                <div className="flex flex-col gap-1.5 text-xs text-center">
                  {[
                    { label: 'INCERTAIN', color: 'bg-amber-400' },
                    { label: 'VALIDÉ',    color: 'bg-green-500' },
                    { label: 'REJETÉ',    color: 'bg-gray-400'  },
                  ].map(({ label, color }) => (
                    <div key={label} className="flex items-center justify-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <span className="text-gray-600">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: breakdown */}
              <div className="col-span-3 space-y-4">
                {[
                  { label: 'Candidats INCERTAIN',  value: matching?.incertain,          variant: 'warning' },
                  { label: 'Candidats VALIDÉS',    value: matching?.valide,             variant: 'success' },
                  { label: 'Candidats REJETÉS',    value: matching?.rejete,             variant: 'gray'    },
                  { label: 'Offres non matchées',  value: matching?.offres_non_matchees, variant: 'danger' },
                ].map(({ label, value, variant }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{label}</span>
                    <Badge variant={variant} label={formatNumber(value ?? 0)} />
                  </div>
                ))}

                <div className="pt-2 border-t border-gray-100 space-y-3">
                  {[
                    { label: 'Taux validation automatique', value: matching?.taux_validation_auto_pct,    bar: 'bg-blue-500'  },
                    { label: 'Taux validation humaine',     value: matching?.taux_validation_humaine_pct, bar: 'bg-green-500' },
                  ].map(({ label, value, bar }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">{label}</span>
                        <span className="font-semibold text-gray-700">
                          {value != null ? `${value}%` : '—'}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${bar}`}
                          style={{ width: value != null ? `${Math.min(value, 100)}%` : '0%' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Section 4: Activité des tenants ────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Activité des tenants</h2>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <DataTable
            columns={tenantCols}
            data={tenants}
            loading={loadingTenants}
            emptyMessage="Aucun tenant actif"
          />
        </div>
      </section>
    </div>
  )
}
