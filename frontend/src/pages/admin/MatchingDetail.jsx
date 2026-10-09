import { useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Edit3, ExternalLink } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { getCandidate, validateCandidate, rejectCandidate, correctCandidate } from '../../api/admin/matching'

// ── Helpers ───────────────────────────────────────────────────────────────────
const CRITERE_LABELS = {
  model: 'Similarité modèle',
  spec:  'Similarité specs',
  name:  'Similarité nom',
}

const STATUT_VARIANT = { INCERTAIN: 'warning', VALIDE: 'success', REJETE: 'gray' }

function scoreColors(s) {
  if (s == null) return { border: 'border-gray-200', text: 'text-gray-400', bar: 'bg-gray-300' }
  if (s >= 0.65) return { border: 'border-green-400', text: 'text-green-600', bar: 'bg-green-500' }
  if (s >= 0.45) return { border: 'border-amber-400', text: 'text-amber-600', bar: 'bg-amber-400' }
  return { border: 'border-red-400', text: 'text-red-600', bar: 'bg-red-500' }
}

function stockLabel(statut_stock) {
  if (!statut_stock) return null
  const map = { EN_STOCK: { label: 'En stock', cls: 'text-green-600' }, RUPTURE: { label: 'Rupture', cls: 'text-red-500' }, STOCK_LIMITE: { label: 'Stock limité', cls: 'text-amber-600' } }
  return map[statut_stock] ?? { label: statut_stock, cls: 'text-gray-500' }
}

// ── Offre card ────────────────────────────────────────────────────────────────
function OffreCard({ offre, label }) {
  if (!offre) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-center min-h-[200px]">
        <p className="text-sm text-gray-400">Aucune offre</p>
      </div>
    )
  }
  const stock = stockLabel(offre.statut_stock)
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
          {offre.site_id && (
            <span className="text-[10px] bg-[#1B3A6B]/10 text-[#1B3A6B] px-1.5 py-0.5 rounded font-medium">
              {offre.site_id}
            </span>
          )}
        </div>
        {offre.url_produit && (
          <a
            href={offre.url_produit}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] text-[#1B3A6B] hover:underline font-medium shrink-0"
          >
            Voir l'offre <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Image */}
      {offre.image && (
        <div className="w-full h-44 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
          <img
            src={offre.image}
            alt={offre.nom ?? ''}
            className="w-full h-full object-contain"
            onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
          />
        </div>
      )}

      {/* Name + brand */}
      <div>
        <p className="text-sm font-semibold text-gray-900 leading-snug">{offre.nom ?? '—'}</p>
        {offre.marque && <p className="text-xs text-gray-500 mt-0.5">{offre.marque}</p>}
      </div>

      {/* Pricing + stock */}
      <div className="space-y-1.5">
        {offre.prix_original != null && (
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Prix original</span>
            <span className={`text-sm font-semibold ${offre.est_en_promotion ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {offre.prix_original.toLocaleString('fr-TN')} TND
            </span>
          </div>
        )}
        {offre.prix_en_promotion != null && offre.est_en_promotion && (
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Prix promo</span>
            <span className="text-sm font-semibold text-green-600">
              {offre.prix_en_promotion.toLocaleString('fr-TN')} TND
            </span>
          </div>
        )}
        {stock && (
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Stock</span>
            <span className={`text-xs font-medium ${stock.cls}`}>{stock.label}</span>
          </div>
        )}
      </div>

      {/* Specs */}
      {offre.specs_normalises && Object.keys(offre.specs_normalises).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Specs</p>
          <div className="space-y-1">
            {Object.entries(offre.specs_normalises).slice(0, 6).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-xs text-gray-500 truncate">{k}</span>
                <span className="text-xs font-medium text-gray-700 truncate">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MatchingDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToast()
  const qc = useQueryClient()

  const state      = location.state ?? {}
  const candidates = state.candidates   ?? []
  const currentIdx = state.currentIndex ?? 0
  const listPage   = state.page         ?? 1
  const listStatut = state.statut       ?? 'INCERTAIN'

  const [showValidate, setShowValidate] = useState(false)
  const [showReject,   setShowReject]   = useState(false)
  const [showCorrect,  setShowCorrect]  = useState(false)
  const [reason, setReason] = useState('')
  const [refId,  setRefId]  = useState('')

  const { data: candidat, isLoading, isError } = useQuery({
    queryKey: ['candidate', id],
    queryFn:  () => getCandidate(id),
    staleTime: 60_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['candidate', id] })
    qc.invalidateQueries({ queryKey: ['candidates'] })
    qc.invalidateQueries({ queryKey: ['matchingStats'] })
  }

  const goBack = () =>
    navigate('/admin/matching', { state: { page: listPage, statut: listStatut } })

  const goToIndex = (idx) => {
    const c = candidates[idx]
    if (!c) return
    navigate(`/admin/matching/${c.id}`, {
      state: { candidates, currentIndex: idx, page: listPage, statut: listStatut },
    })
  }

  const goNext = () => {
    if (currentIdx + 1 < candidates.length) goToIndex(currentIdx + 1)
    else goBack()
  }

  const validateMut = useMutation({
    mutationFn: () => validateCandidate(id, null),
    onSuccess: () => {
      showToast('Candidat validé')
      setShowValidate(false)
      invalidate()
      goNext()
    },
    onError: () => showToast('Erreur lors de la validation', 'danger'),
  })

  const rejectMut = useMutation({
    mutationFn: () => rejectCandidate(id, reason || null),
    onSuccess: () => {
      showToast('Candidat rejeté')
      setShowReject(false)
      setReason('')
      invalidate()
      goNext()
    },
    onError: () => showToast('Erreur lors du rejet', 'danger'),
  })

  const correctMut = useMutation({
    mutationFn: () => correctCandidate(id, parseInt(refId, 10)),
    onSuccess: () => {
      showToast('Correction appliquée')
      setShowCorrect(false)
      setRefId('')
      invalidate()
    },
    onError: () => showToast('Erreur lors de la correction', 'danger'),
  })

  const score    = candidat?.score_confluence
  const colors   = scoreColors(score)
  // criteres is list[{critere, score, detail}] — convert to map for O(1) lookup
  const critereMap = Object.fromEntries(
    (candidat?.criteres ?? []).map((c) => [c.critere, c])
  )
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx + 1 < candidates.length

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
            <button onClick={goBack} className="hover:text-[#1B3A6B] transition-colors">
              Matching
            </button>
            <span>/</span>
            <span className="text-gray-700 font-medium">Candidat #{id}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">Examen du candidat</h1>
            {candidat && (
              <Badge
                variant={STATUT_VARIANT[candidat.statut] ?? 'gray'}
                label={candidat.statut}
              />
            )}
            {score != null && (
              <span className={`text-sm font-bold border-2 rounded-full px-2.5 py-0.5 ${colors.border} ${colors.text}`}>
                {score.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Prev/Next + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => goToIndex(currentIdx - 1)}
            disabled={!hasPrev}
            className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-400">
            {candidates.length > 0 ? `${currentIdx + 1} / ${candidates.length}` : '—'}
          </span>
          <button
            onClick={() => goToIndex(currentIdx + 1)}
            disabled={!hasNext}
            className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-200 mx-1" />

          <button
            onClick={() => { setRefId(''); setShowCorrect(true) }}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Corriger
          </button>
          <button
            onClick={() => { setReason(''); setShowReject(true) }}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Rejeter
          </button>
          <button
            onClick={() => setShowValidate(true)}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Valider ✓
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-5 animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-44 bg-gray-200 rounded" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center">
          <p className="text-sm text-red-500">Erreur de chargement du candidat.</p>
        </div>
      )}

      {/* 3-column layout */}
      {candidat && !isLoading && (
        <div className="grid grid-cols-3 gap-5 items-start">

          {/* LEFT — Offre A */}
          <OffreCard offre={candidat.offre_a} label="Offre A" />

          {/* CENTER — Score + criteres + justification + referentiel */}
          <div className="space-y-4">

            {/* Score circle */}
            <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col items-center gap-3">
              <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center ${colors.border}`}>
                <span className={`text-2xl font-bold ${colors.text}`}>
                  {score != null ? score.toFixed(2) : '—'}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Score confluence
              </p>

              {/* Critere bars */}
              <div className="w-full space-y-3 pt-3 border-t border-gray-100">
                {Object.entries(CRITERE_LABELS).map(([key, label]) => {
                  const entry = critereMap[key]
                  const val   = entry?.score ?? null
                  const c     = scoreColors(val)
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">{label}</span>
                        <span className={`font-semibold ${c.text}`}>
                          {val != null ? val.toFixed(2) : '—'}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${c.bar}`}
                          style={{ width: val != null ? `${Math.round(val * 100)}%` : '0%' }}
                        />
                      </div>
                      {entry?.detail && (
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{entry.detail}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Justification */}
            {candidat.justification && (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Justification
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">{candidat.justification}</p>
              </div>
            )}

            {/* Referentiel */}
            {candidat.referentiel && (
              <div className="bg-white rounded-xl shadow-sm p-5 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Produit référentiel associé
                </p>
                {candidat.referentiel.image && (
                  <img
                    src={candidat.referentiel.image}
                    alt={candidat.referentiel.nom_produit}
                    className="w-16 h-16 object-contain rounded bg-gray-50"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                )}
                <p className="text-sm font-medium text-gray-800">{candidat.referentiel.nom_produit}</p>
                {candidat.referentiel.marque && (
                  <p className="text-xs text-gray-500">{candidat.referentiel.marque}</p>
                )}
                <p className="text-xs text-gray-400">ID : {candidat.referentiel.id}</p>
              </div>
            )}
          </div>

          {/* RIGHT — Offre B */}
          <OffreCard offre={candidat.offre_b} label="Offre B" />
        </div>
      )}

      {/* Validate dialog */}
      <Modal
        open={showValidate}
        onClose={() => setShowValidate(false)}
        title="Valider le candidat"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setShowValidate(false)}
              className="text-sm px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => validateMut.mutate()}
              disabled={validateMut.isPending}
              className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {validateMut.isPending ? 'En cours…' : 'Confirmer la validation'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Confirmer que les deux offres correspondent au même produit ?
          Cette action est réversible via la correction.
        </p>
      </Modal>

      {/* Reject dialog */}
      <Modal
        open={showReject}
        onClose={() => { setShowReject(false); setReason('') }}
        title="Rejeter le candidat"
        size="sm"
        footer={
          <>
            <button
              onClick={() => { setShowReject(false); setReason('') }}
              className="text-sm px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => rejectMut.mutate()}
              disabled={rejectMut.isPending}
              className="text-sm px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {rejectMut.isPending ? 'En cours…' : 'Confirmer le rejet'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Rejeter ce candidat signifie que les deux offres ne correspondent pas au même produit.
          </p>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Motif de rejet <span className="text-gray-400">(optionnel)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : produits de générations différentes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* Correct dialog */}
      <Modal
        open={showCorrect}
        onClose={() => { setShowCorrect(false); setRefId('') }}
        title="Corriger le référentiel"
        size="sm"
        footer={
          <>
            <button
              onClick={() => { setShowCorrect(false); setRefId('') }}
              className="text-sm px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => correctMut.mutate()}
              disabled={correctMut.isPending || !refId}
              className="text-sm px-4 py-2 bg-[#1B3A6B] text-white rounded-lg hover:bg-[#15305a] disabled:opacity-50 transition-colors"
            >
              {correctMut.isPending ? 'En cours…' : 'Appliquer la correction'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Associer ce candidat à un produit référentiel différent.
          </p>
          {/* TODO: backend - add referentiel search/autocomplete endpoint for correction panel */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              ID du produit référentiel
            </label>
            <input
              type="number"
              min="1"
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="Ex : 42"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
