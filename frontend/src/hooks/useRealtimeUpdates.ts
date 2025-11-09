import { useState, useEffect } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

interface BackupProgress {
  backup_id: number
  progress: number
  status: string
  message: string
}

interface ServerHealth {
  server_id: number
  health_status: string
  last_heartbeat: string
}

interface Notification {
  level: string
  title: string
  message: string
  timestamp: string
}

export function useRealtimeUpdates() {
  const [backupProgress, setBackupProgress] = useState<Map<number, BackupProgress>>(new Map())
  const [serverHealth, setServerHealth] = useState<Map<number, ServerHealth>>(new Map())
  const [notifications, setNotifications] = useState<Notification[]>([])

  const { isConnected, lastMessage } = useWebSocket('/api/v1/ws', {
    onMessage: (message) => {
      switch (message.type) {
        case 'backup_progress':
        case 'restore_progress':
          setBackupProgress((prev) => {
            const updated = new Map(prev)
            updated.set(message.backup_id, {
              backup_id: message.backup_id,
              progress: message.progress,
              status: message.status,
              message: message.message,
            })
            return updated
          })
          break

        case 'server_health':
          setServerHealth((prev) => {
            const updated = new Map(prev)
            updated.set(message.server_id, {
              server_id: message.server_id,
              health_status: message.health_status,
              last_heartbeat: message.last_heartbeat,
            })
            return updated
          })
          break

        case 'notification':
          setNotifications((prev) => [
            ...prev.slice(-19),
            {
              level: message.level,
              title: message.title,
              message: message.message,
              timestamp: message.timestamp,
            },
          ])
          break
      }
    },
  })

  return {
    isConnected,
    backupProgress,
    serverHealth,
    notifications,
    clearNotifications: () => setNotifications([]),
  }
}
