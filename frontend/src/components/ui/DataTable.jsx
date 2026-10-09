export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  pagination = null,
  onPageChange,
  onRowClick,
  emptyMessage = 'Aucun résultat',
}) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left text-xs font-medium text-gray-400 pb-3 pr-4 uppercase tracking-wide"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: pagination?.limit ?? 10 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="py-3 pr-4">
                      <div className="animate-pulse h-3.5 bg-gray-200 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={row.id ?? i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-gray-50 last:border-0 transition-colors ${
                    onRowClick ? 'hover:bg-gray-50 cursor-pointer' : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="py-3 pr-4 text-gray-700">
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && !loading && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {pagination.total} résultat{pagination.total !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Préc.
            </button>
            <span className="text-xs text-gray-500">
              Page {pagination.page} sur {pagination.pages || 1}
            </span>
            <button
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= (pagination.pages || 1)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Suiv. →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
