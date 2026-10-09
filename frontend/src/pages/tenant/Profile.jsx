import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth'
import { getCategories, getAlertRules, getReports, updateProfile, updatePassword } from '../../api/tenant'
import { IcoLock, IcoArrow, IcoSparkles, IcoCheck } from '../../components/icons'
import { useToast } from '../../components/ui/Toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_PRICES  = { BASIC: '49', MEDIUM: '149', PREMIUM: '299' }
// NOTE: catégories et règles sont aussi appliquées côté backend
// (products.py _PLAN_LIMITS, alert_rules.py _PLAN_RULE_QUOTA) — garder en phase.
const PLAN_LIMITS  = {
  categories: { BASIC: 50,  MEDIUM: 150, PREMIUM: null },
  rules:      { BASIC: 5,   MEDIUM: 20,  PREMIUM: null },
  reports:    { BASIC: 10,  MEDIUM: 30,  PREMIUM: null },
}
const ROLE_LABEL = {
  MANAGER:          'Manager — vue stratégique',
  RESP_MARKETING:   'Responsable Marketing — peut configurer alertes et périmètre',
  EQUIPE_MARKETING: 'Équipe Marketing — accès opérationnel uniquement',
}
const ROLE_BADGE = {
  MANAGER:          'mg',
  RESP_MARKETING:   'rm',
  EQUIPE_MARKETING: '',
}
const PREMIUM_FEATURES = [
  'Catégories illimitées',
  "Règles d'alertes illimitées",
  'Assistant IA conversationnel',
  'Détection temps réel',
  'Support prioritaire',
]

// ── Small helpers ─────────────────────────────────────────────────────────────

function initials(nom) {
  if (!nom) return '?'
  return nom.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({ label, value, readOnly = true, onChange, onSave, saving }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--pw-border)', gap: 12 }}>
      <div style={{ flex: '0 0 200px', fontSize: 13, color: 'var(--pw-slate-500)', fontWeight: 600 }}>{label}</div>
      {readOnly ? (
        <div style={{ flex: 1, fontSize: 13.5, color: 'var(--pw-slate-900)' }}>{value}</div>
      ) : (
        <>
          <div className="pw-input" style={{ flex: 1, padding: '6px 10px' }}>
            <input value={value} onChange={e => onChange(e.target.value)} style={{ fontSize: 13.5 }} />
          </div>
          <button
            className="pw-btn pw-btn-sm pw-btn-ghost"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Enregistrement…' : 'Modifier'}
          </button>
        </>
      )}
    </div>
  )
}

function ToggleField({ label, sub, on, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--pw-border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--pw-slate-500)', marginTop: 2 }}>{sub}</div>
      </div>
      <span
        onClick={onChange}
        style={{
          width: 36, height: 20, borderRadius: 999, position: 'relative',
          cursor: 'pointer', flex: '0 0 36px', transition: 'background .2s',
          background: on ? 'var(--pw-indigo)' : 'var(--pw-slate-300)',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: on ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
          transition: 'left .2s',
        }} />
      </span>
    </div>
  )
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', background: 'var(--pw-slate-100)', borderRadius: 8, padding: 3, width: 'fit-content' }}>
      {options.map(opt => (
        <span
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
            cursor: 'pointer',
            background: value === opt ? '#fff' : 'transparent',
            boxShadow: value === opt ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
          }}
        >
          {opt}
        </span>
      ))}
    </div>
  )
}

function UsageBar({ label, used, max, plan }) {
  const unlimited = plan === 'PREMIUM' || max === null
  const pct = unlimited ? 100 : Math.min(used / max * 100, 100)
  const maxLabel = unlimited ? '∞' : max
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--pw-slate-600)', fontWeight: 500 }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontWeight: 700 }}>
          {used} / {maxLabel}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.7)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--pw-indigo)' }} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Profile() {
  const user = useAuthStore(s => s.user)
  const { showToast } = useToast()

  const plan = user?.plan_abonnement || 'BASIC'

  const categoriesQ = useQuery({ queryKey: ['categories'], queryFn: getCategories })
  const alertRulesQ = useQuery({ queryKey: ['alert-rules'], queryFn: getAlertRules })
  const reportsQ    = useQuery({
    queryKey: ['reports'],
    queryFn:  getReports,
    enabled:  plan !== 'BASIC',
  })

  // Profile form
  const [profileForm, setProfileForm] = useState({ nom: user?.nom || '', email: user?.email || '' })
  const [nomSaving,   setNomSaving]   = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)

  // Password form
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [pwSaving, setPwSaving] = useState(false)

  // Notification toggles (UI state only)
  const [notifs, setNotifs] = useState({
    email:        true,
    app:          true,
    daily_recap:  false,
    weekly_recap: true,
  })
  const [freq, setFreq] = useState('Immédiate')

  // Language (UI state only)
  const [lang, setLang] = useState('Français')

  // 2FA (UI state only, off)
  const [twoFA, setTwoFA] = useState(false)

  async function saveNom() {
    setNomSaving(true)
    try {
      const updated = await updateProfile({ nom: profileForm.nom })
      useAuthStore.setState(s => ({ user: { ...s.user, nom: updated.nom } }))
      showToast('Nom mis à jour', 'success')
    } catch {
      showToast('Erreur lors de la mise à jour', 'danger')
    } finally {
      setNomSaving(false)
    }
  }

  async function saveEmail() {
    setEmailSaving(true)
    try {
      const updated = await updateProfile({ email: profileForm.email })
      useAuthStore.setState(s => ({ user: { ...s.user, email: updated.email } }))
      showToast('Email mis à jour', 'success')
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Erreur lors de la mise à jour'
      showToast(msg, 'danger')
    } finally {
      setEmailSaving(false)
    }
  }

  async function savePassword() {
    setPwSaving(true)
    try {
      await updatePassword(pwForm)
      setPwForm({ current_password: '', new_password: '', confirm_password: '' })
      showToast('Mot de passe mis à jour', 'success')
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Erreur lors du changement'
      showToast(msg, 'danger')
    } finally {
      setPwSaving(false)
    }
  }

  const pwDisabled = !pwForm.current_password || !pwForm.new_password || !pwForm.confirm_password || pwSaving

  const catUsed   = categoriesQ.data?.length ?? 0
  const rulesUsed = alertRulesQ.data?.length ?? 0
  const now = new Date()
  const reportsUsed = (reportsQ.data ?? []).filter(r => {
    if (!r.date_creation) return false
    const d = new Date(r.date_creation)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  return (
    <div>
      <div className="pw-h1" style={{ marginBottom: 18 }}>Mon profil &amp; paramètres</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18 }}>

        {/* ── LEFT COLUMN ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Identity card */}
          <div className="pw-card">
            <div className="pw-card-head">
              <div className="title">Identité</div>
              <div className="sub">Informations de votre compte utilisateur</div>
            </div>

            {/* Avatar row */}
            <div style={{ padding: '4px 22px 18px', display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
                color: '#fff', display: 'grid', placeItems: 'center',
                fontSize: 30, fontWeight: 700, flexShrink: 0,
              }}>
                {initials(user?.nom)}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{user?.nom}</div>
                <div style={{ fontSize: 13, color: 'var(--pw-slate-500)', marginTop: 2 }}>{user?.email}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span className={`pw-role-badge ${ROLE_BADGE[user?.role] || ''}`}>
                    {user?.role === 'MANAGER' ? 'Manager'
                      : user?.role === 'RESP_MARKETING' ? 'Responsable Marketing'
                      : 'Équipe Marketing'}
                  </span>
                  <span className="pw-pill slate">{user?.nom_organisation}</span>
                </div>
              </div>
              <button
                className="pw-btn pw-btn-sm"
                style={{ marginLeft: 'auto' }}
                disabled
                title="Disponible prochainement"
              >
                Changer la photo
              </button>
            </div>

            {/* Field rows */}
            <div style={{ padding: '0 22px 18px' }}>
              <FieldRow
                label="Nom complet"
                value={profileForm.nom}
                readOnly={false}
                onChange={v => setProfileForm(f => ({ ...f, nom: v }))}
                onSave={saveNom}
                saving={nomSaving}
              />
              <FieldRow
                label="Email"
                value={profileForm.email}
                readOnly={false}
                onChange={v => setProfileForm(f => ({ ...f, email: v }))}
                onSave={saveEmail}
                saving={emailSaving}
              />
              <FieldRow label="Rôle" value={ROLE_LABEL[user?.role] || user?.role} />
              <FieldRow label="Organisation" value={user?.nom_organisation || '—'} />
            </div>
          </div>

          {/* Security card */}
          <div className="pw-card">
            <div className="pw-card-head">
              <div className="title">Sécurité</div>
              <div className="sub">Mot de passe et authentification</div>
            </div>
            <div style={{ padding: '4px 22px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--pw-slate-600)', fontWeight: 600, marginBottom: 6 }}>Mot de passe actuel</div>
                  <div className="pw-input">
                    <IcoLock />
                    <input
                      type="password"
                      value={pwForm.current_password}
                      onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))}
                    />
                  </div>
                </div>
                <div />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--pw-slate-600)', fontWeight: 600, marginBottom: 6 }}>Nouveau mot de passe</div>
                  <div className="pw-input">
                    <IcoLock />
                    <input
                      type="password"
                      placeholder="Min. 8 caractères"
                      value={pwForm.new_password}
                      onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--pw-slate-600)', fontWeight: 600, marginBottom: 6 }}>Confirmer</div>
                  <div className="pw-input">
                    <IcoLock />
                    <input
                      type="password"
                      placeholder="Confirmation"
                      value={pwForm.confirm_password}
                      onChange={e => setPwForm(f => ({ ...f, confirm_password: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <button
                className="pw-btn pw-btn-primary"
                style={{ marginTop: 14 }}
                onClick={savePassword}
                disabled={pwDisabled}
              >
                {pwSaving ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
              </button>

              <div style={{ marginTop: 18 }}>
                <ToggleField
                  label={<>Authentification à deux facteurs <span className="pw-pill slate" style={{ fontSize: 10, marginLeft: 6 }}>Proposed feature</span></>}
                  sub="Renforce la sécurité avec un code à usage unique"
                  on={twoFA}
                  onChange={() => setTwoFA(v => !v)}
                />
              </div>
            </div>
          </div>

          {/* Notifications card */}
          <div className="pw-card">
            <div className="pw-card-head">
              <div className="title">Notifications</div>
              <div className="sub">Comment souhaitez-vous être alerté ?</div>
              <div className="right">
                <span className="pw-pill slate" style={{ fontSize: 10 }}>Proposed feature</span>
              </div>
            </div>
            <div style={{ padding: '4px 22px 18px' }}>
              <ToggleField
                label="Notifications email"
                sub="Recevoir un email pour chaque alerte déclenchée"
                on={notifs.email}
                onChange={() => setNotifs(n => ({ ...n, email: !n.email }))}
              />
              <ToggleField
                label="Notifications dans l'application"
                sub="Cloche en haut à droite + page d'alertes"
                on={notifs.app}
                onChange={() => setNotifs(n => ({ ...n, app: !n.app }))}
              />
              <ToggleField
                label="Email récapitulatif quotidien"
                sub="Un seul email à 09:00 avec toutes les alertes de la veille"
                on={notifs.daily_recap}
                onChange={() => setNotifs(n => ({ ...n, daily_recap: !n.daily_recap }))}
              />
              <ToggleField
                label="Email récapitulatif hebdomadaire"
                sub="Lundi 08:00 — synthèse de la semaine concurrentielle"
                on={notifs.weekly_recap}
                onChange={() => setNotifs(n => ({ ...n, weekly_recap: !n.weekly_recap }))}
              />
              <div style={{ padding: '14px 0 0' }}>
                <div style={{ fontSize: 12.5, color: 'var(--pw-slate-600)', fontWeight: 600, marginBottom: 8 }}>
                  Fréquence préférée par défaut
                </div>
                <SegmentedControl
                  options={['Immédiate', 'Quotidienne', 'Hebdomadaire']}
                  value={freq}
                  onChange={setFreq}
                />
              </div>
            </div>
          </div>

          {/* Language card */}
          <div className="pw-card">
            <div className="pw-card-head">
              <div className="title">Langue &amp; région</div>
              <div className="sub">Préférences d'affichage</div>
              <div className="right">
                <span className="pw-pill slate" style={{ fontSize: 10 }}>Proposed feature</span>
              </div>
            </div>
            <div style={{ padding: '4px 22px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--pw-border)', gap: 10 }}>
                <div style={{ flex: '0 0 200px', fontSize: 13, color: 'var(--pw-slate-500)', fontWeight: 600 }}>Langue interface</div>
                <SegmentedControl
                  options={['🇫🇷 Français', '🇬🇧 English', '🇹🇳 العربية']}
                  value={lang}
                  onChange={setLang}
                />
              </div>
              <FieldRow label="Fuseau horaire" value="Africa/Tunis (UTC+1)" />
              <FieldRow label="Format date" value="JJ/MM/AAAA" />
              <FieldRow label="Devise" value="TND — Dinar Tunisien" />
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Plan card */}
          <div className="pw-card" style={{
            padding: 22,
            background: 'linear-gradient(160deg, #EEF2FF 0%, #F0FDFA 100%)',
            borderColor: 'var(--pw-indigo-100)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--pw-indigo-700)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Plan actuel
              </span>
              <span style={{ marginLeft: 'auto', padding: '4px 10px', background: 'var(--pw-indigo)', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                {plan}
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', marginTop: 12 }}>
              {PLAN_PRICES[plan] || '—'}
              {' '}
              <span style={{ fontSize: 14, color: 'var(--pw-slate-500)', fontWeight: 600 }}>TND / mois</span>
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <UsageBar label="Catégories"      used={catUsed}     max={PLAN_LIMITS.categories[plan]} plan={plan} />
              <UsageBar label="Règles d'alertes" used={rulesUsed}   max={PLAN_LIMITS.rules[plan]}      plan={plan} />
              <UsageBar label="Rapports / mois"  used={reportsUsed} max={PLAN_LIMITS.reports[plan]}    plan={plan} />
            </div>
          </div>

          {/* Upgrade card — hidden for PREMIUM */}
          {plan !== 'PREMIUM' && (
            <div className="pw-card" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: -20, right: -20,
                width: 100, height: 100, borderRadius: '50%',
                background: 'rgba(245,158,11,.15)', filter: 'blur(20px)',
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
                  color: '#fff', display: 'grid', placeItems: 'center',
                }}>
                  <IcoSparkles />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Plan PREMIUM
                </span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, position: 'relative' }}>
                Débloquez l&apos;Analyse de marché, l&apos;Assistant IA et les catégories illimitées.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '14px 0', position: 'relative' }}>
                {PREMIUM_FEATURES.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--pw-slate-700)' }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: 'var(--pw-green)', color: '#fff',
                      display: 'grid', placeItems: 'center', flex: '0 0 14px',
                    }}>
                      <IcoCheck size={9} />
                    </span>
                    {f}
                  </div>
                ))}
              </div>
              <button className="pw-btn pw-btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled title="Contactez votre administrateur PriceWatch">
                Passer au PREMIUM <IcoArrow />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
