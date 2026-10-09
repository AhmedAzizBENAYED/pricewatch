import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Play, ExternalLink, Clock, Package } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { formatNumber, timeAgo, formatDuration } from '../../utils/format'
import { getSources, getSource, toggleSource, launchScraper } from '../../api/admin/sources'

const STATUT_VARIANT = {
  EN_COURS: 'warning',
  TERMINE:  'success',
  ECHOUE:   'danger',
  ANNULE:   'gray',
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function SourceDrawer({ source, onClose }) {
  const { showToast } = useToast()
  const qc = useQueryClient()

  const { data: detail, isLoading } = useQuery({
    queryKey: ['sourceDetail', source.id],
    queryFn:  () => getSource(source.id),
    staleTime: 30_000,
  })

  const launchMut = useMutation({
    mutationFn: () => launchScraper(source.scraper_id),
    onSuccess: () => {
      showToast('Collecte lancée')
      qc.invalidateQueries({ queryKey: ['sources'] })
      onClose()
    },
    onError: () => showToast('Erreur lors du lancement', 'danger'),
  })

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] z-50 bg-white shadow-2xl flex flex-col">

        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{source.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{source.url}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Launch button */}
        <div className="px-6 py-4 border-b border-gray-100">
          <button
            onClick={() => launchMut.mutate()}
            disabled={launchMut.isPending}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#1B3A6B] text-white rounded-lg hover:bg-[#15305a] disabled:opacity-50 text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            {launchMut.isPending ? 'Lancement en cours…' : 'Lancer une collecte'}
          </button>
        </div>

        {/* Recent runs */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Historique récent
          </p>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse h-10 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : !detail?.recent_runs?.length ? (
            <p className="text-sm text-gray-400 text-center py-10">Aucune collecte récente</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Date', 'Statut', 'Durée', 'Offres'].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 pb-2 pr-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.recent_runs.map((run) => (
                  <tr key={run.id} className="border-b border-gray-50">
                    <td className="py-2.5 pr-3 text-xs text-gray-600 whitespace-nowrap">
                      {timeAgo(run.date_debut)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={STATUT_VARIANT[run.statut] ?? 'gray'} label={run.statut ?? '—'} />
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500">
                      {formatDuration(run.duree_secondes)}
                    </td>
                    <td className="py-2.5 text-xs font-medium text-gray-700">
                      {formatNumber(run.offres_collectees)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Sources() {
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [selectedSource, setSelectedSource] = useState(null)

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn:  getSources,
    staleTime: 30_000,
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }) => toggleSource(id, active),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ['sources'] })
      const prev = qc.getQueryData(['sources'])
      qc.setQueryData(['sources'], (old) =>
        old?.map((s) => (s.id === id ? { ...s, est_actif: active } : s))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['sources'], ctx.prev)
      showToast('Erreur lors de la mise à jour', 'danger')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sources'] }),
    onSuccess: () => showToast('Statut mis à jour'),
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Sources e-commerce</h1>
        <p className="text-sm text-gray-500 mt-0.5">Sites scrappés par la plateforme</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-5 animate-pulse space-y-3">
              <div className="flex justify-between">
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-6 w-11 bg-gray-200 rounded-full" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="grid grid-cols-3 gap-3 pt-1">
                {[1, 2, 3].map((j) => <div key={j} className="h-14 bg-gray-100 rounded-lg" />)}
              </div>
              <div className="h-8 bg-gray-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-sm text-gray-400">
          Aucune source configurée
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {sources.map((s) => (
            <div
              key={s.id}
              className={`bg-white rounded-xl shadow-sm overflow-hidden border-l-4 ${
                s.est_actif ? 'border-green-400' : 'border-gray-200'
              }`}
            >
              <div className="p-5">
                {/* Card header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-gray-900">{s.name}</p>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1B3A6B] mt-0.5 transition-colors"
                    >
                      <span className="truncate max-w-[220px]">{s.url}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>

                  {/* Toggle switch */}
                  <button
                    onClick={() => toggleMut.mutate({ id: s.id, active: !s.est_actif })}
                    disabled={toggleMut.isPending}
                    title={s.est_actif ? 'Désactiver' : 'Activer'}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      s.est_actif ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        s.est_actif ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Mini stats */}
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-400 mb-1 flex items-center justify-center gap-1">
                      <Package className="w-3 h-3" /> Offres
                    </p>
                    <p className="text-sm font-bold text-gray-800">{formatNumber(s.nb_offres)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-400 mb-1 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" /> Dernière
                    </p>
                    <p className="text-xs font-bold text-gray-800">{timeAgo(s.last_scrape_at)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-400 mb-1">Statut</p>
                    <p
                      className={`text-sm font-bold ${
                        s.est_actif ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {s.est_actif ? 'Actif' : 'Inactif'}
                    </p>
                  </div>
                </div>

                {/* History button */}
                <button
                  onClick={() => setSelectedSource(s)}
                  className="mt-4 w-full text-xs border border-gray-200 text-gray-600 rounded-lg py-2 hover:bg-gray-50 transition-colors"
                >
                  Voir l'historique
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSource && (
        <SourceDrawer source={selectedSource} onClose={() => setSelectedSource(null)} />
      )}
    </div>
  )
}
