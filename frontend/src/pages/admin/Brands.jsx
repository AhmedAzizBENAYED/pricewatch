import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Check, X, ToggleLeft, ToggleRight, Plus } from 'lucide-react'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import { useToast } from '../../components/ui/Toast'
import { useDebounce } from '../../utils/hooks'
import { formatNumber } from '../../utils/format'
import { getBrands, createBrand, updateBrand } from '../../api/admin/brands'

export default function Brands() {
  const { showToast } = useToast()
  const qc = useQueryClient()

  const [page, setPage]         = useState(1)
  const [q, setQ]               = useState('')
  const [estActif, setEstActif] = useState(undefined)
  const debouncedQ = useDebounce(q, 300)

  const [editingId, setEditingId]   = useState(null)
  const [editingNom, setEditingNom] = useState('')

  const [showCreate, setShowCreate]   = useState(false)
  const [newNom, setNewNom]           = useState('')
  const [createError, setCreateError] = useState(null)

  const queryKey = ['brands', page, debouncedQ, estActif]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getBrands({ page, limit: 50, q: debouncedQ || undefined, est_actif: estActif }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const brands = data?.data ?? []
  const meta   = data?.meta

  const invalidate = () => qc.invalidateQueries({ queryKey: ['brands'] })

  const editMut = useMutation({
    mutationFn: ({ id, nom }) => updateBrand(id, { nom }),
    onSuccess: () => {
      showToast('Marque mise à jour')
      setEditingId(null)
      invalidate()
    },
    onError: (err) => {
      if (err.response?.status === 409) showToast('Ce nom existe déjà', 'danger')
      else showToast('Erreur lors de la mise à jour', 'danger')
    },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, est_actif }) => updateBrand(id, { est_actif }),
    onSuccess: () => {
      showToast('Statut mis à jour')
      invalidate()
    },
    onError: () => showToast('Erreur lors de la mise à jour', 'danger'),
  })

  const createMut = useMutation({
    mutationFn: (nom) => createBrand({ nom }),
    onSuccess: () => {
      showToast('Marque créée')
      setShowCreate(false)
      setNewNom('')
      setCreateError(null)
      invalidate()
    },
    onError: (err) => {
      if (err.response?.status === 409) setCreateError('Cette marque existe déjà')
      else showToast('Erreur lors de la création', 'danger')
    },
  })

  const startEdit  = (row) => { setEditingId(row.id); setEditingNom(row.nom) }
  const cancelEdit = () => setEditingId(null)
  const submitEdit = (row) => {
    const trimmed = editingNom.trim()
    if (trimmed && trimmed !== row.nom) editMut.mutate({ id: row.id, nom: trimmed })
    else cancelEdit()
  }

  const columns = [
    {
      key: 'nom',
      label: 'Nom',
      render: (val, row) =>
        editingId === row.id ? (
          <form
            onSubmit={(e) => { e.preventDefault(); submitEdit(row) }}
            className="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={editingNom}
              onChange={(e) => setEditingNom(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && cancelEdit()}
              className="border border-[#1B3A6B]/40 rounded-lg px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 w-44"
            />
            <button type="submit" className="text-green-600 hover:text-green-700 transition-colors">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <span className="font-medium text-gray-800">{val}</span>
        ),
    },
    {
      key: 'nb_offres',
      label: 'Offres',
      render: (val) => <span className="text-gray-600">{formatNumber(val)}</span>,
    },
    {
      key: 'est_actif',
      label: 'Statut',
      render: (val) => <Badge variant={val ? 'success' : 'gray'} label={val ? 'Actif' : 'Inactif'} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {editingId !== row.id && (
            <button
              onClick={() => startEdit(row)}
              title="Modifier le nom"
              className="p-1.5 text-gray-400 hover:text-[#1B3A6B] hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => toggleMut.mutate({ id: row.id, est_actif: !row.est_actif })}
            disabled={toggleMut.isPending}
            title={row.est_actif ? 'Désactiver' : 'Activer'}
            className={`p-1.5 rounded-lg transition-colors ${
              row.est_actif
                ? 'text-green-500 hover:text-gray-400 hover:bg-gray-100'
                : 'text-gray-400 hover:text-green-500 hover:bg-gray-100'
            }`}
          >
            {row.est_actif ? (
              <ToggleRight className="w-4 h-4" />
            ) : (
              <ToggleLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Marques</h1>
        <button
          onClick={() => { setShowCreate(true); setNewNom(''); setCreateError(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B3A6B] text-white rounded-lg text-sm font-medium hover:bg-[#15305a] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter une marque
        </button>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Rechercher une marque…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30 w-56"
          />
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {[
              { label: 'Tous',     val: undefined },
              { label: 'Actifs',   val: true },
              { label: 'Inactifs', val: false },
            ].map(({ label, val }) => (
              <button
                key={label}
                onClick={() => { setEstActif(val); setPage(1) }}
                className={`px-3 py-2 transition-colors ${
                  estActif === val
                    ? 'bg-[#1B3A6B] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={brands}
          loading={isLoading}
          pagination={
            meta
              ? { page: meta.page, pages: meta.pages, total: meta.total, limit: meta.limit }
              : null
          }
          onPageChange={(p) => setPage(p)}
          emptyMessage="Aucune marque trouvée"
        />
      </div>

      {/* Create modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setCreateError(null) }}
        title="Ajouter une marque"
        size="sm"
        footer={
          <>
            <button
              onClick={() => { setShowCreate(false); setCreateError(null) }}
              className="text-sm px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => newNom.trim() && createMut.mutate(newNom.trim())}
              disabled={createMut.isPending || !newNom.trim()}
              className="text-sm px-4 py-2 bg-[#1B3A6B] text-white rounded-lg hover:bg-[#15305a] disabled:opacity-50 transition-colors"
            >
              {createMut.isPending ? 'Création…' : 'Créer'}
            </button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Nom de la marque
          </label>
          <input
            autoFocus
            type="text"
            value={newNom}
            onChange={(e) => { setNewNom(e.target.value); setCreateError(null) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newNom.trim()) createMut.mutate(newNom.trim())
            }}
            placeholder="Ex : Samsung"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30"
          />
          {createError ? (
            <p className="text-xs text-red-500 mt-1.5">{createError}</p>
          ) : (
            <p className="text-xs text-gray-400 mt-1.5">
              Le nom doit être unique (insensible à la casse)
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
