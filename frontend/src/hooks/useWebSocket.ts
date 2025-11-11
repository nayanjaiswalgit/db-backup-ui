import { useEffect, useState, useRef } from 'react'

interface WebSocketMessage {
  type: string
  [key: string]: any
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void
  onConnect?: () => void
  onDisconnect?: () => void
  autoReconnect?: boolean
  reconnectInterval?: number
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number>()

  const {
    onMessage,
    onConnect,
    onDisconnect,
    autoReconnect = true,
    reconnectInterval = 3000,
  } = options

  const connect = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}${url}`

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        onConnect?.()
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          setLastMessage(message)
          onMessage?.(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        setIsConnected(false)
        wsRef.current = null
        onDisconnect?.()

        // Auto reconnect
        if (autoReconnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Reconnecting...')
            connect()
          }, reconnectInterval)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      wsRef.current = ws
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
    }
  }

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    wsRef.current?.close()
  }

  const send = (data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }

  const subscribe = (channel: string) => {
    send({ action: 'subscribe', channel })
  }

  const unsubscribe = (channel: string) => {
    send({ action: 'unsubscribe', channel })
  }

  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [url])

  return {
    isConnected,
    lastMessage,
    send,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
  }
}
