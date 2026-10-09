import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, ShieldOff } from 'lucide-react'
import { useDebounce } from '../../utils/hooks'
import { timeAgo } from '../../utils/format'
import { getAuditLog, getAuditEntry } from '../../api/admin/audit'

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function formatDateLong(iso) {
  if (!iso) return '—'
  const d    = new Date(iso)
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${date} à ${time}`
}

// Action → badge style
const ACTION_STYLE = {
  CANDIDAT_VALIDE:  { bg: 'bg-green-100',  text: 'text-green-700'  },
  CANDIDAT_REJETE:  { bg: 'bg-red-100',    text: 'text-red-700'    },
  CANDIDAT_CORRIGE: { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  USER_CREATED:     { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  USER_UPDATED:     { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  USER_DEACTIVATED: { bg: 'bg-gray-100',   text: 'text-gray-600'   },
  SOURCE_TOGGLE:    { bg: 'bg-purple-100', text: 'text-purple-700' },
}

function ActionBadge({ action }) {
  if (!action) return <span className="text-gray-400 text-xs">—</span>
  const { bg, text } = ACTION_STYLE[action] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${bg} ${text}`}>
      {action}
    </span>
  )
}

// ── JSON renderer with syntax highlighting ────────────────────────────────────
function JsonValue({ val }) {
  if (val === null) return <span className="text-red-400">null</span>
  if (typeof val === 'boolean') return <span className="text-purple-600">{String(val)}</span>
  if (typeof val === 'number')  return <span className="text-green-600">{val}</span>
  if (typeof val === 'string')  return <span className="text-blue-600">"{val}"</span>
  if (Array.isArray(val)) {
    return (
      <span>
        [
        {val.map((v, i) => (
          <span key={i}>
            <JsonValue val={v} />
            {i < val.length - 1 ? ', ' : ''}
          </span>
        ))}
        ]
      </span>
    )
  }
  if (typeof val === 'object') {
    return (
      <span>
        {'{'}&nbsp;
        {Object.entries(val).map(([k, v], i, arr) => (
          <span key={k}>
            <span className="text-gray-600">"{k}"</span>: <JsonValue val={v} />
            {i < arr.length - 1 ? ', ' : ''}
          </span>
        ))}
        &nbsp;{'}'}
      </span>
    )
  }
  return <span className="text-gray-700">{String(val)}</span>
}

function JsonPanel({ label, data }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="bg-gray-100 rounded-t-lg px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      </div>
      <div className="bg-gray-50 rounded-b-lg px-3 py-3 min-h-[80px] overflow-auto">
        {data ? (
          <div className="font-mono text-xs space-y-1">
            {Object.entries(data).map(([key, val]) => (
              <div key={key} className="leading-relaxed">
                <span className="text-gray-600 font-semibold">"{key}"</span>
                <span className="text-gray-400">: </span>
                <JsonValue val={val} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-4">—</p>
        )}
      </div>
    </div>
  )
}

// ── Detail slide-over ─────────────────────────────────────────────────────────
function AuditSlideOver({ entryId, onClose }) {
  const { data: entry, isLoading } = useQuery({
    queryKey: ['auditEntry', entryId],
    queryFn:  () => getAuditEntry(entryId),
    staleTime: 300_000,
  })

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] z-50 bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            {entry && <ActionBadge action={entry.action} />}
            {entry?.horodatage && (
              <span className="text-xs text-gray-400">{formatDateLong(entry.horodatage)}</span>
            )}
          </div>
          <button onClick={onClose} className="ml-4 shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-3 bg-gray-100 rounded w-1/4" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-32 bg-gray-100 rounded-lg" />
                <div className="h-32 bg-gray-100 rounded-lg" />
              </div>
            </div>
          ) : entry ? (
            <>
              {/* Utilisateur */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Utilisateur
                </p>
                <p className="text-sm text-gray-800">
                  {entry.utilisateur_nom ?? '—'}
                  {entry.id_utilisateur && (
                    <span className="text-gray-400 ml-1">(#{entry.id_utilisateur})</span>
                  )}
                </p>
              </div>

              {/* JSON diff */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Détail de l'action
                </p>
                <div className="flex gap-3">
                  <JsonPanel label="Avant" data={entry.valeurs_avant} />
                  <JsonPanel label="Après" data={entry.valeurs_apres} />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-10">Entrée introuvable</p>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const DEFAULT_DATE_FROM = daysAgo(30)
const DEFAULT_DATE_TO   = today()

export default function Audit() {
  const [params, setParams] = useSearchParams()

  const page      = parseInt(params.get('page') || '1', 10)
  const action    = params.get('action') || ''
  const dateFrom  = params.get('date_from') || DEFAULT_DATE_FROM
  const dateTo    = params.get('date_to')   || DEFAULT_DATE_TO

  const [localAction, setLocalAction] = useState(action)
  const debouncedAction = useDebounce(localAction, 400)

  const [openEntryId, setOpenEntryId] = useState(null)

  const setParam = useCallback((key, val, resetPage = true) => {
    const next = new URLSearchParams(params)
    if (val) next.set(key, val); else next.delete(key)
    if (resetPage) next.set('page', '1')
    setParams(next)
  }, [params, setParams])

  const clearFilters = () => {
    setLocalAction('')
    const next = new URLSearchParams()
    next.set('page', '1')
    setParams(next)
  }

  const hasFilters = !!params.get('action') || params.get('date_from') !== DEFAULT_DATE_FROM || params.get('date_to') !== DEFAULT_DATE_TO

  // Sync debounced action → URL
  const [prevDebounced, setPrevDebounced] = useState(debouncedAction)
  if (prevDebounced !== debouncedAction) {
    setPrevDebounced(debouncedAction)
    setParam('action', debouncedAction)
  }

  const queryKey = ['audit', page, debouncedAction, dateFrom, dateTo]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getAuditLog({
      page,
      limit: 20,
      action:    debouncedAction || undefined,
      date_from: dateFrom || undefined,
      date_to:   dateTo   || undefined,
    }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const entries = data?.data ?? []
  const meta    = data?.meta

  const changePage = (p) => {
    const next = new URLSearchParams(params)
    next.set('page', String(p))
    setParams(next)
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Journal d'audit</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Historique des actions sensibles sur la plateforme
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Filtrer par action (ex: SOURCE_TOGGLE)…"
          value={localAction}
          onChange={(e) => setLocalAction(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 w-72"
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Du</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setParam('date_from', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Au</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setParam('date_to', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Effacer les filtres
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-5 animate-pulse space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-20 flex flex-col items-center text-gray-400">
            <ShieldOff className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">Aucune entrée dans le journal</p>
            <p className="text-xs mt-1">Les actions sensibles apparaîtront ici</p>
          </div>
        ) : (
          <>
            {/* Results count */}
            {meta && (
              <div className="px-4 py-2.5 border-b border-gray-100">
                <span className="text-xs text-gray-400">{meta.total} entrée{meta.total !== 1 ? 's' : ''} trouvée{meta.total !== 1 ? 's' : ''}</span>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Horodatage', 'Utilisateur', 'Action', 'Détail'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-400 py-3 px-4 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setOpenEntryId(entry.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="text-xs text-gray-700 whitespace-nowrap">{formatDateLong(entry.horodatage)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(entry.horodatage)}</p>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {entry.utilisateur_nom ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-3 px-4">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setOpenEntryId(entry.id)}
                        className="text-xs text-[#1B3A6B] hover:underline font-medium whitespace-nowrap"
                      >
                        Voir →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {meta && meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  Page {meta.page} sur {meta.pages}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => changePage(meta.page - 1)}
                    disabled={meta.page <= 1}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    ← Préc.
                  </button>
                  <button
                    onClick={() => changePage(meta.page + 1)}
                    disabled={meta.page >= meta.pages}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    Suiv. →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {openEntryId && (
        <AuditSlideOver entryId={openEntryId} onClose={() => setOpenEntryId(null)} />
      )}
    </div>
  )
}
