import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MoreVertical, Building2 } from 'lucide-react'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { useDebounce } from '../../utils/hooks'
import {
  getTenants, createTenant, updateTenant, deleteTenant,
} from '../../api/admin/tenants'

// ── Helpers ───────────────────────────────────────────────────────────────────
const PLAN_VARIANT = { BASIC: 'gray', MEDIUM: 'info', PREMIUM: 'warning' }

function ActionMenu({ tenant, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-md z-20 py-1 text-sm">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(tenant) }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
            >
              Modifier
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(tenant) }}
              className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600"
            >
              Désactiver
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const EMPTY_FORM = { nom_organisation: '', plan_abonnement: 'BASIC' }

function TenantForm({ value, onChange, isEdit = false }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Organisation *</label>
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
          value={value.nom_organisation}
          onChange={(e) => onChange({ ...value, nom_organisation: e.target.value })}
          placeholder="Nom de l'organisation"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
        <select
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
          value={value.plan_abonnement}
          onChange={(e) => onChange({ ...value, plan_abonnement: e.target.value })}
        >
          <option value="BASIC">Basic</option>
          <option value="MEDIUM">Medium</option>
          <option value="PREMIUM">Premium</option>
        </select>
      </div>
      {isEdit && (
        <div className="flex items-center gap-2">
          <input
            id="tenant_est_actif"
            type="checkbox"
            className="rounded border-gray-300 text-[#1B3A6B]"
            checked={value.est_actif ?? true}
            onChange={(e) => onChange({ ...value, est_actif: e.target.checked })}
          />
          <label htmlFor="tenant_est_actif" className="text-xs text-gray-600">Actif</label>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Tenants() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()

  const page   = parseInt(params.get('page') || '1', 10)
  const status = params.get('status') || ''
  const [localSearch, setLocalSearch] = useState(params.get('search') || '')
  const debouncedSearch = useDebounce(localSearch)

  const setFilter = (key, val) => {
    const next = new URLSearchParams(params)
    if (val) next.set(key, val); else next.delete(key)
    next.set('page', '1')
    setParams(next)
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tenants', page, debouncedSearch, status],
    queryFn: () => getTenants({ page, limit: 15, q: debouncedSearch || undefined, status: status || undefined }),
    staleTime: 30_000,
  })

  // Modal state
  const [createOpen, setCreateOpen]     = useState(false)
  const [editTarget, setEditTarget]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm]                 = useState(EMPTY_FORM)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tenants'] })

  const createMut = useMutation({
    mutationFn: createTenant,
    onSuccess: () => { showToast('Tenant créé'); setCreateOpen(false); setForm(EMPTY_FORM); invalidate() },
    onError: () => showToast('Erreur lors de la création', 'danger'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateTenant(id, data),
    onSuccess: () => { showToast('Tenant mis à jour'); setEditTarget(null); invalidate() },
    onError: () => showToast('Erreur lors de la mise à jour', 'danger'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteTenant,
    onSuccess: () => { showToast('Tenant désactivé'); setDeleteTarget(null); invalidate() },
    onError: () => showToast('Erreur lors de la désactivation', 'danger'),
  })

  const openCreate = () => { setForm(EMPTY_FORM); setCreateOpen(true) }
  const openEdit   = (t) => {
    setEditTarget(t)
    setForm({ nom_organisation: t.nom_organisation, plan_abonnement: t.plan_abonnement ?? 'BASIC', est_actif: t.est_actif ?? true })
  }

  const tenants    = data?.data ?? []
  const meta       = data?.meta
  const pagination = meta ? { page: meta.page, limit: meta.limit, total: meta.total, pages: meta.pages } : null

  const columns = [
    {
      key: 'nom_organisation',
      label: 'Organisation',
      render: (val) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#1B3A6B]/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 text-[#1B3A6B]" />
          </div>
          <span className="font-medium text-gray-800">{val}</span>
        </div>
      ),
    },
    {
      key: 'plan_abonnement',
      label: 'Plan',
      render: (val) => <Badge variant={PLAN_VARIANT[val] ?? 'gray'} label={val ?? '—'} />,
    },
    {
      key: 'est_actif',
      label: 'Statut',
      render: (val) => <Badge variant={val ? 'success' : 'gray'} label={val ? 'Actif' : 'Inactif'} />,
    },
    {
      key: 'nb_users',
      label: 'Utilisateurs',
      render: (val) => <span className="text-gray-500 text-xs">{val ?? 0}</span>,
    },
    {
      key: 'nb_categories_assignees',
      label: 'Catégories',
      render: (val) => <span className="text-gray-500 text-xs">{val ?? 0}</span>,
    },
    {
      key: '_actions',
      label: '',
      render: (_, row) => (
        <ActionMenu tenant={row} onEdit={openEdit} onDelete={setDeleteTarget} />
      ),
    },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gérer les organisations clientes</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#1B3A6B] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#152f58] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau tenant
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
            placeholder="Rechercher…"
            value={localSearch}
            onChange={(e) => { setLocalSearch(e.target.value); setFilter('search', e.target.value) }}
          />
        </div>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
          value={status}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        {isError ? (
          <div className="text-sm text-red-500 py-4">
            Erreur de chargement.{' '}
            <button onClick={refetch} className="underline text-gray-500 hover:text-gray-700">Réessayer</button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={tenants}
            loading={isLoading}
            pagination={pagination}
            onPageChange={(p) => { const n = new URLSearchParams(params); n.set('page', String(p)); setParams(n) }}
            onRowClick={(row) => navigate(`/admin/tenants/${row.id}`)}
            emptyMessage="Aucun tenant trouvé"
          />
        )}
      </div>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouveau tenant"
        size="sm"
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Annuler
            </button>
            <button
              onClick={() => createMut.mutate(form)}
              disabled={!form.nom_organisation || createMut.isPending}
              className="px-4 py-2 text-sm font-medium bg-[#1B3A6B] text-white rounded-lg hover:bg-[#152f58] disabled:opacity-50 transition-colors"
            >
              {createMut.isPending ? 'Création…' : 'Créer'}
            </button>
          </>
        }
      >
        <TenantForm value={form} onChange={setForm} isEdit={false} />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Modifier le tenant"
        size="sm"
        footer={
          <>
            <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Annuler
            </button>
            <button
              onClick={() => updateMut.mutate({ id: editTarget.id, data: form })}
              disabled={!form.nom_organisation || updateMut.isPending}
              className="px-4 py-2 text-sm font-medium bg-[#1B3A6B] text-white rounded-lg hover:bg-[#152f58] disabled:opacity-50 transition-colors"
            >
              {updateMut.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </>
        }
      >
        <TenantForm value={form} onChange={setForm} isEdit />
      </Modal>

      {/* Deactivate confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Désactiver le tenant"
        size="sm"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Annuler
            </button>
            <button
              onClick={() => deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleteMut.isPending ? 'Désactivation…' : 'Désactiver'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Voulez-vous désactiver <strong>{deleteTarget?.nom_organisation}</strong> ?
          Les données seront conservées.
        </p>
      </Modal>

    </div>
  )
}
