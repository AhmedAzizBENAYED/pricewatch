import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'
import {
  IcoCalendar, IcoChart, IcoGear, IcoCheck, IcoFolder,
  IcoArrow, IcoDownload,
} from '../../components/icons'
import PlanLocked from '../../components/ui/PlanLocked'
import { useToast } from '../../components/ui/Toast'
import {
  getReports, createReport, getReportStatus,
  downloadReport, retryReport, deleteReport,
} from '../../api/tenant'

// ── Sections available for selection ──────────────────────────────────────────

const ALL_SECTIONS = [
  'Synthèse exécutive',
  'Positionnement',
  'Activité concurrents',
  'Événements significatifs',
]

// ── ReportTypeCard ────────────────────────────────────────────────────────────

function ReportTypeCard({ icon, title, desc, selected, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: 16, flex: 1,
        border: `1.5px solid ${selected ? accent : 'var(--pw-border)'}`,
        borderRadius: 12,
        background: selected ? `${accent}0d` : '#fff',
        boxShadow: selected ? `0 0 0 3px ${accent}1a` : 'none',
        cursor: 'pointer', position: 'relative',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: selected ? accent : 'var(--pw-slate-100)',
        color: selected ? '#fff' : 'var(--pw-slate-600)',
        display: 'grid', placeItems: 'center', marginBottom: 10,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--pw-slate-900)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
      {selected && (
        <span style={{
          position: 'absolute', top: 12, right: 12,
          width: 18, height: 18, borderRadius: '50%',
          background: accent, color: '#fff',
          display: 'grid', placeItems: 'center',
        }}>
          <IcoCheck size={11} />
        </span>
      )}
    </div>
  )
}

// ── HistoryItem ───────────────────────────────────────────────────────────────

function HistoryItem({ rapport, onDownload, onRetry, onCancel }) {
  const fmt = rapport.format === 'PDF'
    ? { bg: 'var(--pw-red-50)',   c: 'var(--pw-red)',   label: 'PDF' }
    : { bg: 'var(--pw-green-50)', c: 'var(--pw-green)', label: 'XLS' }

  // Poll status for in-progress reports
  const { data: statusData } = useQuery({
    queryKey: ['report-status', rapport.id],
    queryFn: () => getReportStatus(rapport.id),
    enabled: rapport.statut === 'EN_ATTENTE' || rapport.statut === 'EN_COURS',
    refetchInterval: (query) => {
      const s = query.state.data?.statut ?? rapport.statut
      return (s === 'PRET' || s === 'ERREUR') ? false : 3000
    },
  })

  const toolLabels = {
    get_market_overview:     'aperçu marché',
    get_recent_events:       'événements récents',
    get_positioning_summary: 'positionnement',
    get_competitor_activity: 'activité concurrents',
    get_stock_ruptures:      'ruptures de stock',
  }
  const liveTools = statusData?.tools_used ?? rapport.tools_used ?? []

  const liveStatut      = statusData?.statut      ?? rapport.statut
  const liveProgression = statusData?.progression ?? rapport.progression

  const dateStr = rapport.date_creation
    ? new Date(rapport.date_creation).toLocaleDateString('fr-FR')
    : '–'

  const periodStr = (() => {
    if (rapport.periode_debut && rapport.periode_fin) {
      const d = new Date(rapport.periode_debut).toLocaleDateString('fr-FR', { day:'numeric', month:'short' })
      const f = new Date(rapport.periode_fin).toLocaleDateString('fr-FR',   { day:'numeric', month:'short', year:'numeric' })
      return `${d} — ${f}`
    }
    if (rapport.type === 'HEBDOMADAIRE') return 'Hebdomadaire'
    if (rapport.type === 'MENSUEL')      return 'Mensuel'
    return 'Personnalisé'
  })()

  const statusBadge = {
    EN_ATTENTE: <span className="pw-pill slate">EN ATTENTE</span>,
    EN_COURS: (
      <span className="pw-pill indigo" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', animation: 'pw-pulse 1.5s infinite', flexShrink: 0 }} />
        EN COURS · {liveProgression}%
      </span>
    ),
    PRET:   <span className="pw-pill green">PRÊT</span>,
    ERREUR: <span className="pw-pill red">ERREUR</span>,
  }[liveStatut] ?? <span className="pw-pill slate">{liveStatut}</span>

  const actionBtn = liveStatut === 'PRET' ? (
    <button className="pw-btn pw-btn-sm" onClick={() => onDownload(rapport.id, rapport.format)}>
      <IcoDownload /> Télécharger
    </button>
  ) : (liveStatut === 'EN_COURS' || liveStatut === 'EN_ATTENTE') ? (
    <button className="pw-btn pw-btn-sm pw-btn-ghost" onClick={() => onCancel(rapport.id)}>Annuler</button>
  ) : liveStatut === 'ERREUR' ? (
    <button className="pw-btn pw-btn-sm" onClick={() => onRetry(rapport.id)}>Réessayer</button>
  ) : null

  const score    = statusData?.score_concurrentiel ?? rapport.score_concurrentiel
  const tendance = statusData?.tendance            ?? rapport.tendance
  const scoreColor = score >= 65 ? 'var(--pw-green)' : score >= 40 ? '#F59E0B' : 'var(--pw-red)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--pw-border)' }}>
      <div style={{
        width: 36, height: 44, borderRadius: 5,
        background: fmt.bg, color: fmt.c,
        display: 'grid', placeItems: 'center',
        fontSize: 10, fontWeight: 800, letterSpacing: '.04em',
        flex: '0 0 36px',
      }}>
        {fmt.label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rapport.titre}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 2 }}>
          {periodStr} · créé le {dateStr}
        </div>
        {(liveStatut === 'EN_COURS' || liveStatut === 'EN_ATTENTE') && liveTools.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--pw-slate-400)', marginTop: 3 }}>
            Collecte : {liveTools.map(t => toolLabels[t] || t).join(' · ')}
          </div>
        )}
        {liveStatut === 'PRET' && score != null && (
          <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 4, background: 'var(--pw-slate-100)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${score}%`, height: '100%', background: scoreColor, borderRadius: 2, transition: 'width .4s' }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, flexShrink: 0 }}>
              {score}/100
            </span>
            {tendance && (
              <span style={{ fontSize: 9, color: 'var(--pw-slate-500)', flexShrink: 0 }}>
                {tendance === 'AMELIORATION' ? '▲' : tendance === 'DEGRADATION' ? '▼' : '—'}
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{statusBadge}</div>
      <div style={{ flexShrink: 0 }}>{actionBtn}</div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Reports() {
  const user = useAuthStore(s => s.user)
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  const plan = user?.plan_abonnement || 'BASIC'

  const [selectedType,   setSelectedType]   = useState('MENSUEL')
  const [selectedFormat, setSelectedFormat] = useState('PDF')
  const [sections,       setSections]       = useState([...ALL_SECTIONS])
  const [searchHist,     setSearchHist]     = useState('')
  const [titre,          setTitre]          = useState('')

  if (plan === 'BASIC') {
    return <PlanLocked requiredPlan="MEDIUM" featureName="Rapports" />
  }

  const { data: reports = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['reports'],
    queryFn: getReports,
  })

  const createMutation = useMutation({
    mutationFn: createReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      showToast('Rapport en cours de génération', 'success')
    },
    onError: () => showToast('Erreur lors de la création du rapport', 'error'),
  })

  const retryMutation = useMutation({
    mutationFn: retryReport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
    onError: () => showToast('Erreur lors de la relance', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteReport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
    onError: () => showToast('Erreur lors de la suppression', 'error'),
  })

  function handleGenerate() {
    const rapportTitre = titre.trim() || `Rapport ${selectedType.toLowerCase()} — ${new Date().toLocaleDateString('fr-FR')}`
    createMutation.mutate({
      titre:   rapportTitre,
      type:    selectedType,
      format:  selectedFormat,
      sections,
    })
  }

  function handleDownload(id, format) {
    downloadReport(id, format).catch(() => showToast('Erreur lors du téléchargement', 'error'))
  }

  function toggleSection(s) {
    setSections(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  const filteredReports = reports.filter(r =>
    r.titre?.toLowerCase().includes(searchHist.toLowerCase())
  )

  const TYPE_CARDS = [
    { key: 'HEBDOMADAIRE', icon: <IcoCalendar />, title: 'Hebdomadaire', desc: 'Synthèse des 7 derniers jours — événements et positions.' },
    { key: 'MENSUEL',      icon: <IcoChart />,    title: 'Mensuel',       desc: 'Analyse approfondie des 30 derniers jours avec tendances.' },
    { key: 'PERSONNALISE', icon: <IcoGear />,     title: 'Personnalisé',  desc: 'Sélectionnez les sections et la période.' },
  ]

  const pdfSelected = selectedFormat === 'PDF'
  const xlsSelected = selectedFormat === 'EXCEL'

  return (
    <div>
      <style>{`
        @keyframes pw-pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="pw-h1">Rapports</div>
          <div className="pw-muted" style={{ fontSize: 13 }}>
            Générez des rapports planifiés ou ponctuels en PDF ou Excel.
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span className="pw-pill slate" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IcoFolder /> {reports.length} rapport{reports.length !== 1 ? 's' : ''} archivé{reports.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* LEFT — Generate form ─────────────────────────────────────────────── */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div className="title">Générer un rapport</div>
            <div className="sub">3 étapes — environ 2 minutes</div>
          </div>
          <div className="pw-card-body">

            {/* Titre */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--pw-slate-600)', fontWeight: 600, marginBottom: 6 }}>Titre (optionnel)</div>
              <input
                value={titre}
                onChange={e => setTitre(e.target.value)}
                placeholder="Ex. Rapport mensuel juin 2026"
                style={{
                  width: '100%', padding: '8px 12px',
                  border: '1px solid var(--pw-border)', borderRadius: 8,
                  fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Step 1 — Type */}
            <div className="pw-h3" style={{ marginBottom: 10 }}>1 · Type de rapport</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
              {TYPE_CARDS.map(card => (
                <ReportTypeCard
                  key={card.key}
                  icon={card.icon}
                  title={card.title}
                  desc={card.desc}
                  selected={selectedType === card.key}
                  accent="var(--pw-indigo)"
                  onClick={() => setSelectedType(card.key)}
                />
              ))}
            </div>

            {/* Step 2 — Sections */}
            <div className="pw-h3" style={{ marginBottom: 10 }}>2 · Sections incluses</div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ALL_SECTIONS.map(s => {
                  const active = sections.includes(s)
                  return (
                    <span
                      key={s}
                      className={`pw-pill ${active ? 'indigo' : 'slate'}`}
                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => toggleSection(s)}
                      title={active ? 'Cliquer pour retirer' : 'Cliquer pour ajouter'}
                    >
                      {active && <IcoCheck size={10} />} {s}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Step 3 — Format */}
            <div className="pw-h3" style={{ marginBottom: 10 }}>3 · Format</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <label
                onClick={() => setSelectedFormat('PDF')}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: 12,
                  border: `1.5px solid ${pdfSelected ? 'var(--pw-red-100)' : 'var(--pw-border)'}`,
                  borderRadius: 10,
                  background: pdfSelected ? 'var(--pw-red-50)' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: pdfSelected ? '4px solid var(--pw-red)' : '1.5px solid var(--pw-slate-300)',
                  background: '#fff', flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontWeight: 700 }}>PDF</div>
                  <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)' }}>Rapport mis en forme · partageable</div>
                </div>
              </label>
              <label
                onClick={() => setSelectedFormat('EXCEL')}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: 12,
                  border: `1.5px solid ${xlsSelected ? 'var(--pw-indigo)' : 'var(--pw-border)'}`,
                  borderRadius: 10,
                  background: xlsSelected ? 'var(--pw-indigo-50)' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: xlsSelected ? '4px solid var(--pw-indigo)' : '1.5px solid var(--pw-slate-300)',
                  background: '#fff', flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontWeight: 700 }}>Excel</div>
                  <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)' }}>Données brutes manipulables</div>
                </div>
              </label>
            </div>

            <button
              className="pw-btn pw-btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: 12 }}
              onClick={handleGenerate}
              disabled={createMutation.isPending || sections.length === 0}
            >
              {createMutation.isPending ? <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="40 20" /></svg> : null}
              Générer le rapport <IcoArrow />
            </button>
          </div>
        </div>

        {/* RIGHT — History ──────────────────────────────────────────────────── */}
        <div className="pw-card">
          <div className="pw-card-head">
            <div className="title">Historique des rapports</div>
            <div className="right">
              <input
                placeholder="Rechercher…"
                value={searchHist}
                onChange={e => setSearchHist(e.target.value)}
                style={{
                  padding: '5px 10px', border: '1px solid var(--pw-border)',
                  borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
          <div style={{ padding: '0 16px' }}>
            {isLoading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--pw-indigo)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="40 20" /></svg>
              </div>
            ) : isError ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--pw-red)', fontSize: 13 }}>
                Erreur lors du chargement.{' '}
                <button className="pw-btn pw-btn-sm" onClick={refetch}>Réessayer</button>
              </div>
            ) : filteredReports.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--pw-slate-400)', fontSize: 13 }}>
                {searchHist ? 'Aucun rapport trouvé' : 'Aucun rapport généré pour l\'instant'}
              </div>
            ) : (
              filteredReports.map(r => (
                <HistoryItem
                  key={r.id}
                  rapport={r}
                  onDownload={handleDownload}
                  onRetry={id => retryMutation.mutate(id)}
                  onCancel={id => deleteMutation.mutate(id)}
                />
              ))
            )}
          </div>
          {reports.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--pw-border)', textAlign: 'center' }}>
              <span className="pw-muted" style={{ fontSize: 12 }}>
                {filteredReports.length} / {reports.length} rapport{reports.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
