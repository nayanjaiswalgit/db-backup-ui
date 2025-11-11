import { useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { Terminal, X } from 'lucide-react'

interface LogEntry {
  timestamp: string
  level: string
  message: string
  source: string
}

export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState<string>('all')

  const { isConnected } = useWebSocket('/api/v1/ws/logs', {
    onMessage: (message) => {
      if (message.type === 'log' && 'timestamp' in message && 'level' in message && 'message' in message && 'source' in message) {
        setLogs((prev) => [...prev.slice(-99), message as unknown as LogEntry])
      }
    },
  })

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true
    return log.level === filter
  })

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-red-500'
      case 'warning':
      case 'warn':
        return 'text-yellow-500'
      case 'info':
        return 'text-blue-500'
      case 'debug':
        return 'text-gray-500'
      default:
        return 'text-gray-700'
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-900 text-white p-3 rounded-full shadow-lg hover:bg-gray-800 transition-colors"
        title="Open Log Viewer"
      >
        <Terminal size={24} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-0 right-0 w-full md:w-2/3 lg:w-1/2 h-96 bg-gray-900 text-white shadow-2xl border-t-2 border-gray-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Terminal size={20} />
          <h3 className="font-semibold">Real-time Logs</h3>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>

          <button
            onClick={() => setLogs([])}
            className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded"
          >
            Clear
          </button>

          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-sm space-y-1">
        {filteredLogs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No logs to display
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div key={index} className="flex gap-2 text-xs">
              <span className="text-gray-500 flex-shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={`font-semibold flex-shrink-0 ${getLevelColor(log.level)}`}>
                [{log.level.toUpperCase()}]
              </span>
              <span className="text-gray-400 flex-shrink-0">
                [{log.source}]
              </span>
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
