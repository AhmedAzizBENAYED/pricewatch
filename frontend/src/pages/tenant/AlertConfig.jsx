import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'
import { useToast } from '../../components/ui/Toast'
import { EVENT_CONFIG, EVENT_ICON_PATH } from '../../utils/pw'
import {
  getAlertRules, createAlertRule, updateAlertRule,
  deleteAlertRule, toggleAlertRule, getCategories,
} from '../../api/tenant'
import {
  IcoPlus, IcoArrow, IcoArrowL, IcoCheck, IcoEdit, IcoTrash,
} from '../../components/icons'

// ── Type / freq mappings ─────────────────────────────────────────────────────

const TYPE_TO_API = {
  drop:  'BAISSE_PRIX',
  rise:  'HAUSSE_PRIX',
  promo: 'DEBUT_PROMOTION',
  stock: 'RUPTURE_STOCK',
  back:  'RETOUR_STOCK',
  new:   'NOUVELLE_OFFRE_DECOUVERTE',
}
const API_TO_TYPE = Object.fromEntries(Object.entries(TYPE_TO_API).map(([k, v]) => [v, k]))

const FREQ_LABEL = { IMMEDIATE: 'Immédiate', DAILY: 'Quotidienne', WEEKLY: 'Hebdomadaire' }

const PLAN_QUOTA = { BASIC: 5, MEDIUM: 20, PREMIUM: Infinity }

const EVENT_OPTS = [
  { key: 'drop',  label: 'Baisse de prix',   desc: "Quand un concurrent baisse son prix au-delà d'un seuil" },
  { key: 'rise',  label: 'Hausse de prix',    desc: 'Détectez les augmentations significatives' },
  { key: 'promo', label: 'Promotion',         desc: 'Soldes, offres flash, codes promo' },
  { key: 'stock', label: 'Rupture de stock',  desc: "Un concurrent n'est plus disponible" },
  { key: 'back',  label: 'Retour en stock',   desc: 'Un produit redevient disponible' },
  { key: 'new',   label: 'Nouveau produit',   desc: "Apparition d'un nouveau référentiel" },
]

// ── Small icon helper ────────────────────────────────────────────────────────

function TypeIcon({ typeKey, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={1.6}
         strokeLinecap="round" strokeLinejoin="round">
      <path d={EVENT_ICON_PATH[typeKey] || ''} />
    </svg>
  )
}

function SmallCheck() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={2.5}
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5 10 17l9-11" />
    </svg>
  )
}

// ── Stepper (flat array — avoids Fragment-with-key) ──────────────────────────

function Stepper({ step }) {
  const steps = [
    { n: 1, label: 'Événement' },
    { n: 2, label: 'Conditions' },
    { n: 3, label: 'Notification' },
    { n: 4, label: 'Résumé' },
  ]
  const items = []
  steps.forEach((s, i) => {
    const active = s.n === step
    const done = s.n < step
    items.push(
      <div key={`s${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: active ? 'var(--pw-indigo)' : done ? 'var(--pw-teal)' : 'var(--pw-slate-100)',
          color: (active || done) ? '#fff' : 'var(--pw-slate-500)',
          display: 'grid', placeItems: 'center',
          fontSize: 12, fontWeight: 700,
          boxShadow: active ? '0 0 0 4px rgba(99,102,241,.15)' : 'none',
          flexShrink: 0,
        }}>
          {done ? <SmallCheck /> : s.n}
        </span>
        <span style={{
          fontSize: 13, fontWeight: active ? 700 : 500,
          color: active ? 'var(--pw-slate-900)' : 'var(--pw-slate-500)',
        }}>
          {s.label}
        </span>
      </div>
    )
    if (i < steps.length - 1) {
      items.push(
        <div key={`sep${i}`} style={{ flex: 1, height: 1, background: 'var(--pw-border)', margin: '0 14px' }} />
      )
    }
  })
  return (
    <div className="pw-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 24px' }}>
        {items}
      </div>
    </div>
  )
}

// ── RuleCard ─────────────────────────────────────────────────────────────────

function RuleCard({ rule, cats, onToggle, onEdit, onDelete }) {
  const typeKey = API_TO_TYPE[rule.type_evenement] || 'drop'
  const cfg = EVENT_CONFIG[rule.type_evenement] || { label: rule.type_evenement, color: 'var(--pw-slate-600)', bg: 'var(--pw-slate-100)' }
  const catsDisplay = rule.liste_categories?.length
    ? rule.liste_categories
        .map(id => cats.find(c => c.id === id)?.nom ?? `#${id}`)
        .join(', ')
    : 'Toutes catégories'

  return (
    <div className="pw-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14, opacity: rule.alert ? 1 : 0.55 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 9,
        background: cfg.bg, color: cfg.color,
        display: 'grid', placeItems: 'center', flex: '0 0 40px',
      }}>
        <TypeIcon typeKey={typeKey} size={16} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{cfg.label}</span>
          {rule.seuil != null && (
            <span className="pw-pill slate" style={{ fontSize: 10 }}>seuil ≥ {rule.seuil}%</span>
          )}
          <span className="pw-pill indigo" style={{ fontSize: 10 }}>
            {FREQ_LABEL[rule.periode_surveillance] || rule.periode_surveillance}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--pw-slate-600)', marginTop: 4 }}>
          <strong>Périmètre :</strong> {catsDisplay} · Tous les sites
        </div>
        {rule.description && (
          <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {rule.description}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 4 }}>
          <span className="pw-mono">{rule.nb_declenchements}</span> alertes générées (30j)
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          onClick={() => onToggle(rule)}
          role="switch"
          aria-checked={rule.alert}
          style={{
            width: 36, height: 20,
            background: rule.alert ? 'var(--pw-indigo)' : 'var(--pw-slate-300)',
            borderRadius: 999, position: 'relative', cursor: 'pointer', display: 'inline-block',
          }}>
          <span style={{
            position: 'absolute', top: 2,
            left: rule.alert ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
            transition: 'left .15s',
          }} />
        </span>
        <button className="pw-icon-btn" style={{ width: 30, height: 30 }} onClick={() => onEdit(rule)} title="Modifier">
          <IcoEdit />
        </button>
        <button className="pw-icon-btn" style={{ width: 30, height: 30 }} onClick={() => onDelete(rule)} title="Supprimer">
          <IcoTrash />
        </button>
      </div>
    </div>
  )
}

// ── Wizard footer ────────────────────────────────────────────────────────────

function WizardFooter({ step, onCancel, onBack, onNext, canNext, isLast, onSubmit, saving }) {
  return (
    <div style={{ padding: '14px 20px', borderTop: '1px solid var(--pw-border)', display: 'flex', alignItems: 'center' }}>
      <button className="pw-btn pw-btn-ghost" onClick={onCancel}>Annuler</button>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {step > 1 && (
          <button className="pw-btn" onClick={onBack}>
            <IcoArrowL /> Retour
          </button>
        )}
        {isLast ? (
          <button className="pw-btn pw-btn-primary" onClick={onSubmit} disabled={saving}>
            {saving ? 'Enregistrement…' : <><IcoCheck /> Enregistrer</>}
          </button>
        ) : (
          <button className="pw-btn pw-btn-primary" onClick={onNext} disabled={!canNext}>
            Étape suivante <IcoArrow />
          </button>
        )}
      </div>
    </div>
  )
}

// ── WizardView ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  type_evenement: '',
  seuil: '',
  liste_categories: [],
  periode_surveillance: 'IMMEDIATE',
  description: '',
  alert: true,
}

function WizardView({ initial, onCancel, onSave, saving }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(() =>
    initial
      ? {
          type_evenement:       initial.type_evenement,
          seuil:                initial.seuil != null ? String(initial.seuil) : '',
          liste_categories:     initial.liste_categories || [],
          periode_surveillance: initial.periode_surveillance || 'IMMEDIATE',
          description:          initial.description || '',
          alert:                initial.alert !== false,
        }
      : { ...EMPTY_FORM }
  )

  const { data: cats = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories(),
  })

  const needsSeuil = ['BAISSE_PRIX', 'HAUSSE_PRIX'].includes(form.type_evenement)
  const cfg = EVENT_CONFIG[form.type_evenement] || {}

  function toggleCat(id) {
    setForm(f => ({
      ...f,
      liste_categories: f.liste_categories.includes(id)
        ? f.liste_categories.filter(c => c !== id)
        : [...f.liste_categories, id],
    }))
  }

  const canNext = step === 1 ? !!form.type_evenement : true

  function buildPayload() {
    return {
      type_evenement:       form.type_evenement,
      description:          form.description || '',
      liste_categories:     form.liste_categories,
      periode_surveillance: form.periode_surveillance,
      seuil:                needsSeuil && form.seuil ? parseInt(form.seuil, 10) : null,
      alert:                form.alert,
    }
  }

  // ── Step 1: event type ───────────────────────────────────────────────────

  function Step1() {
    return (
      <div className="pw-card">
        <div className="pw-card-head">
          <div className="title">1 · Quel événement souhaitez-vous surveiller ?</div>
          <div className="sub">Sélectionnez le type d'événement déclencheur</div>
        </div>
        <div className="pw-card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {EVENT_OPTS.map(o => {
              const apiType = TYPE_TO_API[o.key]
              const eCfg = EVENT_CONFIG[apiType] || {}
              const selected = form.type_evenement === apiType
              return (
                <div
                  key={o.key}
                  onClick={() => setForm(f => ({ ...f, type_evenement: apiType }))}
                  style={{
                    padding: 20,
                    border: `1.5px solid ${selected ? eCfg.color : 'var(--pw-border)'}`,
                    borderRadius: 12,
                    background: selected ? eCfg.bg : '#fff',
                    boxShadow: selected ? `0 0 0 3px ${eCfg.color}1a` : 'none',
                    cursor: 'pointer', position: 'relative', textAlign: 'center',
                  }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: selected ? eCfg.color : eCfg.bg,
                    color: selected ? '#fff' : eCfg.color,
                    display: 'grid', placeItems: 'center',
                    margin: '0 auto 14px',
                  }}>
                    <TypeIcon typeKey={o.key} size={28} />
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{o.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 4, lineHeight: 1.4 }}>{o.desc}</div>
                  {selected && (
                    <span style={{
                      position: 'absolute', top: 12, right: 12,
                      width: 20, height: 20, borderRadius: '50%',
                      background: eCfg.color, color: '#fff',
                      display: 'grid', placeItems: 'center',
                    }}>
                      <SmallCheck />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <WizardFooter step={step} onCancel={onCancel} onBack={() => setStep(s => s - 1)}
          onNext={() => setStep(s => s + 1)} canNext={canNext} isLast={false}
          onSubmit={() => onSave(buildPayload())} saving={saving} />
      </div>
    )
  }

  // ── Step 2: conditions ───────────────────────────────────────────────────

  function Step2() {
    return (
      <div className="pw-card">
        <div className="pw-card-head">
          <div className="title">2 · Conditions</div>
          <div className="sub">Définissez les critères de déclenchement</div>
        </div>
        <div className="pw-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {needsSeuil && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                Seuil de variation (%)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="number" min={1} max={99}
                  value={form.seuil}
                  onChange={e => setForm(f => ({ ...f, seuil: e.target.value }))}
                  placeholder="Ex : 5"
                  style={{
                    width: 100, padding: '8px 12px',
                    border: '1px solid var(--pw-border)', borderRadius: 8, fontSize: 14,
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--pw-slate-500)' }}>
                  Déclencher si la variation est ≥ ce seuil
                </span>
              </div>
            </div>
          )}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              Catégories&nbsp;
              <span style={{ fontWeight: 400, color: 'var(--pw-slate-500)' }}>
                ({form.liste_categories.length === 0 ? 'toutes' : `${form.liste_categories.length} sélectionnée(s)`})
              </span>
            </label>
            {cats.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {cats.map(cat => {
                  const sel = form.liste_categories.includes(cat.id)
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleCat(cat.id)}
                      style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 12.5,
                        border: `1.5px solid ${sel ? 'var(--pw-indigo)' : 'var(--pw-border)'}`,
                        background: sel ? 'var(--pw-indigo-50)' : '#fff',
                        color: sel ? 'var(--pw-indigo)' : 'var(--pw-slate-700)',
                        cursor: 'pointer', fontWeight: sel ? 600 : 400,
                      }}>
                      {cat.nom}
                    </button>
                  )
                })}
              </div>
            ) : (
              <span style={{ fontSize: 12.5, color: 'var(--pw-slate-500)' }}>Toutes les catégories surveillées</span>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 6 }}>
              Laissez vide pour surveiller toutes les catégories
            </div>
          </div>
        </div>
        <WizardFooter step={step} onCancel={onCancel} onBack={() => setStep(s => s - 1)}
          onNext={() => setStep(s => s + 1)} canNext={true} isLast={false}
          onSubmit={() => onSave(buildPayload())} saving={saving} />
      </div>
    )
  }

  // ── Step 3: notification ─────────────────────────────────────────────────

  function Step3() {
    const freqs = [
      { key: 'IMMEDIATE', label: 'Immédiate',    desc: 'Notification dès la détection' },
      { key: 'DAILY',     label: 'Quotidienne',  desc: 'Récapitulatif journalier à 09:00' },
      { key: 'WEEKLY',    label: 'Hebdomadaire', desc: 'Récapitulatif chaque lundi matin' },
    ]
    return (
      <div className="pw-card">
        <div className="pw-card-head">
          <div className="title">3 · Notification</div>
          <div className="sub">Choisissez comment être notifié</div>
        </div>
        <div className="pw-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 10 }}>
              Fréquence de notification
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {freqs.map(f => {
                const sel = form.periode_surveillance === f.key
                return (
                  <label
                    key={f.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px',
                      border: `1.5px solid ${sel ? 'var(--pw-indigo)' : 'var(--pw-border)'}`,
                      borderRadius: 10, cursor: 'pointer',
                      background: sel ? 'var(--pw-indigo-50)' : '#fff',
                    }}>
                    <input
                      type="radio" name="freq" value={f.key} checked={sel}
                      onChange={() => setForm(fm => ({ ...fm, periode_surveillance: f.key }))}
                      style={{ accentColor: 'var(--pw-indigo)', width: 16, height: 16, flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: sel ? 700 : 500 }}>{f.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--pw-slate-500)' }}>{f.desc}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              Description <span style={{ fontWeight: 400, color: 'var(--pw-slate-500)' }}>(optionnelle)</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Décrivez l'objectif de cette règle…"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid var(--pw-border)', borderRadius: 8,
                fontSize: 13.5, resize: 'vertical', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
        <WizardFooter step={step} onCancel={onCancel} onBack={() => setStep(s => s - 1)}
          onNext={() => setStep(s => s + 1)} canNext={true} isLast={false}
          onSubmit={() => onSave(buildPayload())} saving={saving} />
      </div>
    )
  }

  // ── Step 4: summary ──────────────────────────────────────────────────────

  function Step4() {
    const rows = [
      { label: 'Événement',   value: cfg.label || form.type_evenement },
      needsSeuil && form.seuil
        ? { label: 'Seuil',       value: `≥ ${form.seuil}%` }
        : null,
      {
        label: 'Catégories',
        value: form.liste_categories.length
          ? form.liste_categories
              .map(id => cats.find(c => c.id === id)?.nom ?? `#${id}`)
              .join(', ')
          : 'Toutes les catégories',
      },
      { label: 'Fréquence',   value: FREQ_LABEL[form.periode_surveillance] },
      form.description
        ? { label: 'Description', value: form.description }
        : null,
    ].filter(Boolean)

    return (
      <div className="pw-card">
        <div className="pw-card-head">
          <div className="title">4 · Résumé</div>
          <div className="sub">Vérifiez les paramètres avant d'enregistrer la règle</div>
        </div>
        <div className="pw-card-body">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((row, i) => (
              <div key={i} style={{
                display: 'flex', gap: 16, padding: '11px 0',
                borderBottom: i < rows.length - 1 ? '1px solid var(--pw-border)' : 'none',
              }}>
                <span style={{ width: 120, fontSize: 13, fontWeight: 600, color: 'var(--pw-slate-600)', flexShrink: 0 }}>
                  {row.label}
                </span>
                <span style={{ fontSize: 13 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
        <WizardFooter step={step} onCancel={onCancel} onBack={() => setStep(s => s - 1)}
          onNext={() => {}} canNext={true} isLast={true}
          onSubmit={() => onSave(buildPayload())} saving={saving} />
      </div>
    )
  }

  const stepContent = [Step1, Step2, Step3, Step4][step - 1]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 18 }}>
        <div className="pw-h1">
          {initial ? 'Modifier la règle' : "Nouvelle règle d'alerte"}
        </div>
      </div>
      <Stepper step={step} />
      {stepContent()}
    </div>
  )
}

// ── AlertConfig ───────────────────────────────────────────────────────────────

export default function AlertConfig() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  useEffect(() => {
    if (user && user.role !== 'RESP_MARKETING') {
      navigate('/tenant/dashboard', { replace: true })
    }
  }, [user, navigate])

  const [view, setView] = useState('list')
  const [editingRule, setEditingRule] = useState(null)

  const rulesQ = useQuery({ queryKey: ['alert-rules'], queryFn: getAlertRules })
  const catsQ  = useQuery({ queryKey: ['categories'],  queryFn: getCategories })
  const cats   = catsQ.data ?? []

  const quota = PLAN_QUOTA[user?.plan_abonnement] ?? 5
  const ruleCount = rulesQ.data?.length ?? 0

  const saveMutation = useMutation({
    mutationFn: payload =>
      editingRule
        ? updateAlertRule(editingRule.id, payload)
        : createAlertRule(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] })
      setView('list')
      setEditingRule(null)
      toast?.showToast('Règle enregistrée', 'success')
    },
    onError: (err) => {
      const detail = err?.response?.data?.detail
      toast?.showToast(detail || 'Erreur lors de la sauvegarde', 'danger')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: id => deleteAlertRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] })
      toast?.showToast('Règle supprimée', 'success')
    },
    onError: () => toast?.showToast('Erreur lors de la suppression', 'danger'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => toggleAlertRule(id, active),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ['alert-rules'] })
      const prev = qc.getQueryData(['alert-rules'])
      qc.setQueryData(['alert-rules'], old =>
        old?.map(r => r.id === id ? { ...r, alert: active } : r)
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(['alert-rules'], ctx?.prev)
      toast?.showToast('Erreur lors de la mise à jour', 'danger')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  })

  function handleDelete(rule) {
    const label = EVENT_CONFIG[rule.type_evenement]?.label || rule.type_evenement
    if (!window.confirm(`Supprimer la règle « ${label} » ?`)) return
    deleteMutation.mutate(rule.id)
  }

  if (view === 'wizard') {
    return (
      <WizardView
        key={editingRule?.id ?? 'new'}
        initial={editingRule}
        onCancel={() => { setView('list'); setEditingRule(null) }}
        onSave={payload => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <div className="pw-h1">Règles d'alertes</div>
          <div className="pw-muted" style={{ fontSize: 13 }}>
            Définissez les événements qui doivent être notifiés et leur fréquence.
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="pw-btn pw-btn-primary"
            onClick={() => { setEditingRule(null); setView('wizard') }}
            disabled={quota !== Infinity && ruleCount >= quota}
          >
            <IcoPlus /> Nouvelle règle
          </button>
        </div>
      </div>

      {/* Quota bar */}
      <div className="pw-card" style={{ padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Quota règles · plan {user?.plan_abonnement}
            </span>
            <span style={{ marginLeft: 'auto' }} className="pw-mono">
              <strong>{ruleCount}</strong> / {quota === Infinity ? '∞' : quota} utilisées
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--pw-slate-100)', overflow: 'hidden' }}>
            <div style={{
              width: quota === Infinity
                ? '10%'
                : `${Math.min(100, Math.round(ruleCount / quota * 100))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--pw-indigo), var(--pw-teal))',
              transition: 'width .3s',
            }} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--pw-slate-500)', marginTop: 6 }}>
            Plan PREMIUM : règles illimitées + déclenchement temps réel sub-minute.
          </div>
        </div>
        <button className="pw-btn" onClick={() => navigate('/tenant/profile')}>
          Mettre à niveau <IcoArrow />
        </button>
      </div>

      {/* Rules list — three states */}
      {rulesQ.isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="pw-card pw-sk" style={{ height: 82 }} />
          ))}
        </div>
      ) : rulesQ.isError ? (
        <div className="pw-card" style={{ padding: 24, textAlign: 'center' }}>
          <span style={{ color: 'var(--pw-red)', fontSize: 13 }}>Erreur de chargement.</span>{' '}
          <button className="pw-btn" style={{ fontSize: 12 }} onClick={() => rulesQ.refetch()}>
            Réessayer
          </button>
        </div>
      ) : rulesQ.data?.length === 0 ? (
        <div className="pw-card" style={{ padding: 52, textAlign: 'center' }}>
          <div style={{ fontSize: 38, marginBottom: 14, lineHeight: 1 }}>🔔</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Aucune règle d'alerte</div>
          <div style={{ fontSize: 13, color: 'var(--pw-slate-500)', marginBottom: 22, maxWidth: 360, margin: '0 auto 22px' }}>
            Créez votre première règle pour être notifié automatiquement des changements de prix.
          </div>
          <button className="pw-btn pw-btn-primary" onClick={() => { setEditingRule(null); setView('wizard') }}>
            <IcoPlus /> Créer une règle
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rulesQ.data.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              cats={cats}
              onToggle={r => toggleMutation.mutate({ id: r.id, active: !r.alert })}
              onEdit={r => { setEditingRule(r); setView('wizard') }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
