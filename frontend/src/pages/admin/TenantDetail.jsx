import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, Users, FolderOpen, Package, Clock,
  Plus, Trash2, Search,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { useDebounce } from '../../utils/hooks'
import { formatNumber, timeAgo } from '../../utils/format'
import {
  getTenant, getTenantStats, updateTenant,
  getTenantCategories, getAvailableCategories, assignCategories, removeCategory,
  getTenantUsers, createUser, updateUser, deactivateUser,
} from '../../api/admin/tenants'
import { getAudit } from '../../api/admin/audit'

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLE_LABELS  = { MANAGER: 'Manager', RESP_MARKETING: 'Resp. Marketing', EQUIPE_MARKETING: 'Équipe Marketing' }
const ROLE_CLASSES = {
  MANAGER:          'bg-[#1B3A6B]/10 text-[#1B3A6B]',
  RESP_MARKETING:   'bg-blue-100 text-blue-700',
  EQUIPE_MARKETING: 'bg-purple-100 text-purple-700',
}

// ── Shared ────────────────────────────────────────────────────────────────────
function MiniStat({ icon: Icon, label, value, color = 'navy' }) {
  const colors = {
    navy:  'bg-[#1B3A6B]/10 text-[#1B3A6B]',
    blue:  'bg-blue-50 text-blue-600',
    teal:  'bg-teal-50 text-teal-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-800">{value ?? '—'}</p>
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

// Catégories tab: two-panel picker
function CategoriesTab({ tenantId }) {
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [searchAssigned, setSearchAssigned] = useState('')
  const [searchAvailable, setSearchAvailable] = useState('')
  const [selected, setSelected] = useState([])
  const debAssigned  = useDebounce(searchAssigned)
  const debAvailable = useDebounce(searchAvailable)

  const { data: assigned, isLoading: loadingAssigned } = useQuery({
    queryKey: ['tenantCategories', tenantId, debAssigned],
    queryFn: () => getTenantCategories(tenantId, { q: debAssigned || undefined, limit: 200 }),
    staleTime: 30_000,
  })

  const { data: available, isLoading: loadingAvailable } = useQuery({
    queryKey: ['availableCategories', tenantId, debAvailable],
    queryFn: () => getAvailableCategories(tenantId, { q: debAvailable || undefined, limit: 200 }),
    staleTime: 30_000,
  })

  const invalidateCats = () => {
    qc.invalidateQueries({ queryKey: ['tenantCategories', tenantId] })
    qc.invalidateQueries({ queryKey: ['availableCategories', tenantId] })
    qc.invalidateQueries({ queryKey: ['tenantStats', tenantId] })
  }

  const assignMut = useMutation({
    mutationFn: () => assignCategories(tenantId, selected),
    onSuccess: () => {
      showToast(`${selected.length} catégorie(s) assignée(s)`)
      setSelected([])
      invalidateCats()
    },
    onError: () => showToast('Erreur lors de l\'assignation', 'danger'),
  })

  const removeMut = useMutation({
    mutationFn: (catId) => removeCategory(tenantId, catId),
    onSuccess: () => {
      showToast('Catégorie retirée')
      invalidateCats()
    },
    onError: () => showToast('Erreur lors du retrait', 'danger'),
  })

  const assignedList  = assigned?.data ?? assigned ?? []
  const availableList = available?.data ?? available ?? []

  const toggleSelect = (id) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Assigned */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Catégories assignées</h3>
          <span className="text-xs text-gray-400">{assignedList.length}</span>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
            placeholder="Filtrer…"
            value={searchAssigned}
            onChange={(e) => setSearchAssigned(e.target.value)}
          />
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {loadingAssigned ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse h-8 bg-gray-100 rounded" />
            ))
          ) : assignedList.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Aucune catégorie assignée</p>
          ) : (
            assignedList.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 group">
                <span className="text-xs text-gray-700">{cat.nom ?? cat.name ?? cat.id}</span>
                <button
                  onClick={() => removeMut.mutate(cat.id)}
                  disabled={removeMut.isPending}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Available */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Disponibles</h3>
          {selected.length > 0 && (
            <button
              onClick={() => assignMut.mutate()}
              disabled={assignMut.isPending}
              className="text-xs bg-[#1B3A6B] text-white px-3 py-1 rounded-lg hover:bg-[#152f58] disabled:opacity-50 transition-colors"
            >
              {assignMut.isPending ? 'Assignation…' : `Assigner (${selected.length})`}
            </button>
          )}
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
            placeholder="Filtrer…"
            value={searchAvailable}
            onChange={(e) => setSearchAvailable(e.target.value)}
          />
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {loadingAvailable ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse h-8 bg-gray-100 rounded" />
            ))
          ) : availableList.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Aucune catégorie disponible</p>
          ) : (
            availableList.map((cat) => (
              <label
                key={cat.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-[#1B3A6B] focus:ring-[#1B3A6B]/30"
                  checked={selected.includes(cat.id)}
                  onChange={() => toggleSelect(cat.id)}
                />
                <span className="text-xs text-gray-700">{cat.nom ?? cat.name ?? cat.id}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Utilisateurs tab
const EMPTY_USER_FORM = { nom: '', email: '', role: 'EQUIPE_MARKETING', password: '' }

function UsersTab({ tenantId }) {
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['tenantUsers', tenantId, page],
    queryFn: () => getTenantUsers(tenantId, { page, limit: 10 }),
    staleTime: 30_000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tenantUsers', tenantId] })

  const createMut = useMutation({
    mutationFn: (d) => createUser(tenantId, d),
    onSuccess: () => { showToast('Utilisateur créé'); setCreateOpen(false); setUserForm(EMPTY_USER_FORM); invalidate() },
    onError: () => showToast('Erreur lors de la création', 'danger'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => {
      const payload = { ...data }
      if (!payload.password) delete payload.password
      return updateUser(tenantId, id, payload)
    },
    onSuccess: () => { showToast('Utilisateur mis à jour'); setEditTarget(null); invalidate() },
    onError: () => showToast('Erreur lors de la mise à jour', 'danger'),
  })

  const deactivateMut = useMutation({
    mutationFn: (userId) => deactivateUser(tenantId, userId),
    onSuccess: () => { showToast('Utilisateur désactivé'); invalidate() },
    onError: () => showToast('Erreur lors de la désactivation', 'danger'),
  })

  const users      = data?.data ?? []
  const pagination = data ? { page: data.page, pages: data.pages, total: data.total } : null

  const openEdit = (u) => {
    setEditTarget(u)
    setUserForm({ nom: u.nom, role: u.role, est_actif: u.est_actif, password: '' })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Utilisateurs</h3>
        <button
          onClick={() => { setUserForm(EMPTY_USER_FORM); setCreateOpen(true) }}
          className="flex items-center gap-1.5 text-xs bg-[#1B3A6B] text-white px-3 py-1.5 rounded-lg hover:bg-[#152f58] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse h-10 bg-gray-100 rounded" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Aucun utilisateur</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Nom', 'Email', 'Rôle', 'Statut', ''].map((h) => (
                <th key={h} className="text-left text-xs font-medium text-gray-400 pb-2 pr-4 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2.5 pr-4 font-medium text-gray-800">{u.nom}</td>
                <td className="py-2.5 pr-4 text-gray-500 text-xs">{u.email}</td>
                <td className="py-2.5 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_CLASSES[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <Badge variant={u.est_actif ? 'success' : 'gray'} label={u.est_actif ? 'Actif' : 'Inactif'} />
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Modifier
                    </button>
                    {u.est_actif && (
                      <button
                        onClick={() => deactivateMut.mutate(u.id)}
                        disabled={deactivateMut.isPending}
                        className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                      >
                        Désactiver
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-xs px-3 py-1 border border-gray-200 rounded text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            ← Préc.
          </button>
          <span className="text-xs text-gray-400">Page {page} / {pagination.pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page >= pagination.pages}
            className="text-xs px-3 py-1 border border-gray-200 rounded text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            Suiv. →
          </button>
        </div>
      )}

      {/* Create user modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouvel utilisateur"
        size="sm"
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
            <button
              onClick={() => createMut.mutate(userForm)}
              disabled={!userForm.nom || !userForm.email || !userForm.password || createMut.isPending}
              className="px-4 py-2 text-sm font-medium bg-[#1B3A6B] text-white rounded-lg hover:bg-[#152f58] disabled:opacity-50"
            >
              {createMut.isPending ? 'Création…' : 'Créer'}
            </button>
          </>
        }
      >
        <UserForm value={userForm} onChange={setUserForm} isCreate />
      </Modal>

      {/* Edit user modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Modifier l'utilisateur"
        size="sm"
        footer={
          <>
            <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
            <button
              onClick={() => updateMut.mutate({ id: editTarget.id, data: userForm })}
              disabled={!userForm.nom || updateMut.isPending}
              className="px-4 py-2 text-sm font-medium bg-[#1B3A6B] text-white rounded-lg hover:bg-[#152f58] disabled:opacity-50"
            >
              {updateMut.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </>
        }
      >
        <UserForm value={userForm} onChange={setUserForm} isCreate={false} />
      </Modal>
    </div>
  )
}

function UserForm({ value, onChange, isCreate }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
          value={value.nom ?? ''}
          onChange={(e) => onChange({ ...value, nom: e.target.value })}
        />
      </div>
      {isCreate && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
              value={value.email ?? ''}
              onChange={(e) => onChange({ ...value, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mot de passe *</label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
              value={value.password ?? ''}
              onChange={(e) => onChange({ ...value, password: e.target.value })}
            />
          </div>
        </>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Rôle</label>
        <select
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
          value={value.role ?? 'EQUIPE_MARKETING'}
          onChange={(e) => onChange({ ...value, role: e.target.value })}
        >
          <option value="MANAGER">Manager</option>
          <option value="RESP_MARKETING">Resp. Marketing</option>
          <option value="EQUIPE_MARKETING">Équipe Marketing</option>
        </select>
      </div>
      {!isCreate && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nouveau mot de passe <span className="text-gray-400 font-normal">(laisser vide pour ne pas changer)</span>
            </label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
              value={value.password ?? ''}
              onChange={(e) => onChange({ ...value, password: e.target.value })}
              placeholder="••••••••"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="est_actif"
              type="checkbox"
              className="rounded border-gray-300 text-[#1B3A6B]"
              checked={value.est_actif ?? true}
              onChange={(e) => onChange({ ...value, est_actif: e.target.checked })}
            />
            <label htmlFor="est_actif" className="text-xs text-gray-600">Actif</label>
          </div>
        </>
      )}
    </div>
  )
}

// Activité tab
function ActivityTab({ tenantId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['audit', tenantId],
    queryFn: () => getAudit({ tenant_id: tenantId, limit: 20 }),
    staleTime: 60_000,
  })

  const events = data?.data ?? data ?? []

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Activité récente</h3>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Aucune activité</p>
      ) : (
        <div className="space-y-3">
          {events.map((ev, i) => (
            <div key={ev.id ?? i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1B3A6B]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-[#1B3A6B]" />
              </div>
              <div>
                <p className="text-xs text-gray-700">
                  <span className="font-medium">{ev.utilisateur ?? ev.user ?? '—'}</span>
                  {' '}{ev.action ?? ev.description ?? '—'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{timeAgo(ev.created_at ?? ev.date)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = ['Catégories', 'Utilisateurs', 'Activité']

export default function TenantDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState(0)

  const { data: tenant, isLoading: loadingTenant } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => getTenant(id),
    staleTime: 60_000,
  })

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['tenantStats', id],
    queryFn: () => getTenantStats(id),
    staleTime: 60_000,
  })

  const updateMut = useMutation({
    mutationFn: (data) => updateTenant(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', id] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: () => showToast('Erreur lors de la mise à jour', 'danger'),
  })

  return (
    <div className="space-y-5">

      {/* Breadcrumb + header */}
      <div>
        <button
          onClick={() => navigate('/admin/tenants')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Tenants
        </button>
        {loadingTenant ? (
          <div className="animate-pulse h-6 bg-gray-200 rounded w-48" />
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{tenant?.nom_organisation ?? '—'}</h1>

            {/* Plan selector */}
            <select
              value={tenant?.plan_abonnement ?? 'BASIC'}
              onChange={(e) => updateMut.mutate({ plan_abonnement: e.target.value })}
              disabled={updateMut.isPending}
              className="text-xs border border-gray-200 rounded-full px-2.5 py-0.5 font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 cursor-pointer disabled:opacity-60"
            >
              <option value="BASIC">BASIC</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="PREMIUM">PREMIUM</option>
            </select>

            {/* Status toggle */}
            <button
              onClick={() => updateMut.mutate({ est_actif: !tenant?.est_actif })}
              disabled={updateMut.isPending}
              className={`text-xs px-2.5 py-0.5 rounded-full font-medium border transition-colors disabled:opacity-60 ${
                tenant?.est_actif
                  ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
              }`}
            >
              {tenant?.est_actif ? 'Actif' : 'Inactif'}
            </button>
          </div>
        )}
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-4">
        {loadingStats ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-4 animate-pulse h-20" />
          ))
        ) : (
          <>
            <MiniStat icon={Users}     label="Utilisateurs" value={formatNumber(stats?.nb_users)}               color="navy" />
            <MiniStat icon={FolderOpen} label="Catégories"  value={formatNumber(stats?.nb_categories_assignees)} color="blue" />
            <MiniStat icon={Package}   label="Offres"       value={formatNumber(stats?.offres_visibles)}         color="teal" />
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === i
                  ? 'border-[#1B3A6B] text-[#1B3A6B]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 0 && <CategoriesTab tenantId={id} />}
      {activeTab === 1 && <UsersTab tenantId={id} />}
      {activeTab === 2 && <ActivityTab tenantId={id} />}

    </div>
  )
}
