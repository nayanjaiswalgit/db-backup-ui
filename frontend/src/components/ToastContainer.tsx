import { useToastStore } from '../stores/toastStore'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="text-green-500" size={20} />
      case 'error':
        return <AlertCircle className="text-red-500" size={20} />
      case 'warning':
        return <AlertTriangle className="text-yellow-500" size={20} />
      case 'info':
        return <Info className="text-blue-500" size={20} />
      default:
        return <Info className="text-gray-500" size={20} />
    }
  }

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'border-l-green-500'
      case 'error':
        return 'border-l-red-500'
      case 'warning':
        return 'border-l-yellow-500'
      case 'info':
        return 'border-l-blue-500'
      default:
        return 'border-l-gray-500'
    }
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`bg-white rounded-lg shadow-lg border-l-4 ${getBorderColor(
            toast.type
          )} p-4 flex items-start gap-3 animate-slide-in`}
        >
          {getIcon(toast.type)}
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900">{toast.title}</h4>
            <p className="text-sm text-gray-600 mt-1">{toast.message}</p>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  )
}
