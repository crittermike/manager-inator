import { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react'
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
  title?: string
  duration?: number
}

interface ToastContextType {
  toast: (toast: Omit<ToastMessage, 'id'>) => void
  success: (message: string, title?: string) => void
  error: (message: string, title?: string) => void
  info: (message: string, title?: string) => void
  warning: (message: string, title?: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    setToasts((prev) => {
      const newToasts = [...prev, { ...toast, id: Math.random().toString(36).substring(2, 9) }]
      return newToasts.length > 3 ? newToasts.slice(newToasts.length - 3) : newToasts
    })
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const success = useCallback((message: string, title?: string) => addToast({ type: 'success', message, title }), [addToast])
  const error = useCallback((message: string, title?: string) => addToast({ type: 'error', message, title, duration: 8000 }), [addToast])
  const info = useCallback((message: string, title?: string) => addToast({ type: 'info', message, title }), [addToast])
  const warning = useCallback((message: string, title?: string) => addToast({ type: 'warning', message, title, duration: 8000 }), [addToast])

  const contextValue = useMemo(() => ({
    toast: addToast,
    success,
    error,
    info,
    warning,
  }), [addToast, success, error, info, warning])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: () => void }) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(onRemove, 300)
    }, toast.duration || 4000)
    return () => clearTimeout(timer)
  }, [onRemove])

  const handleManualClose = () => {
    setIsExiting(true)
    setTimeout(onRemove, 300)
  }

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-success" aria-hidden="true" />,
    error: <AlertCircle className="w-5 h-5 text-danger" aria-hidden="true" />,
    warning: <AlertTriangle className="w-5 h-5 text-warning" aria-hidden="true" />,
    info: <Info className="w-5 h-5 text-info" aria-hidden="true" />,
  }

  const borderColors = {
    success: 'border-success/30',
    error: 'border-danger/30',
    warning: 'border-warning/30',
    info: 'border-info/30',
  }

  const bgColors = {
    success: 'bg-success/5',
    error: 'bg-danger/5',
    warning: 'bg-warning/5',
    info: 'bg-info/5',
  }

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-4 w-[350px] rounded-xl border bg-surface-raised shadow-lg shadow-black/50 transition-all duration-300 ${
        borderColors[toast.type]
      } ${bgColors[toast.type]} ${
        isExiting ? 'opacity-0 translate-x-8' : 'animate-fade-in'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        {toast.title && <h4 className="text-sm font-medium text-zinc-100 mb-1">{toast.title}</h4>}
        <p className="text-sm text-zinc-300 break-words leading-relaxed">{toast.message}</p>
      </div>
      <button
        onClick={handleManualClose}
        aria-label="Dismiss notification"
        className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mr-2 -mt-2 rounded-lg hover:bg-white/5"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  )
}
