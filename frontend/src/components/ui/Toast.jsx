import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = {
  success: <CheckCircle className="w-4 h-4 text-white" />,
  danger:  <AlertCircle className="w-4 h-4 text-white" />,
}

const BG = {
  success: 'bg-green-600',
  danger:  'bg-red-600',
  default: 'bg-gray-800',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(({ id, message, type }) => (
          <div
            key={id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${BG[type] ?? BG.default}`}
          >
            {ICONS[type]}
            <span>{message}</span>
            <button onClick={() => dismiss(id)} className="ml-1 opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
