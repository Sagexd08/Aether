'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WSClientMessage, WSMessage } from '@aether/types'
import { useSessionStore } from '@/lib/store/session'
import { toast } from '@/components/ui/toast'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000'
const MAX_RETRIES = 5
const PING_INTERVAL_MS = 15_000
const PONG_TIMEOUT_MS = 10_000

export function useSessionWebSocket() {
  const sessionId = useSessionStore((s) => s.sessionId)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [lastEvent, setLastEvent] = useState<WSMessage | null>(null)
  const [retryTick, setRetryTick] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const backoffRef = useRef(1000)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const clearPingTimers = useCallback(() => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current)
    if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current)
    pingTimerRef.current = null
    pongTimeoutRef.current = null
  }, [])

  const connect = useCallback(() => {
    if (!sessionId || !mountedRef.current) return

    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`)
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => {
      if (!mountedRef.current) return
      retriesRef.current = 0
      backoffRef.current = 1000

      pingTimerRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ type: 'ping', ts: Date.now() } satisfies WSClientMessage))
        pongTimeoutRef.current = setTimeout(() => {
          ws.close()
        }, PONG_TIMEOUT_MS)
      }, PING_INTERVAL_MS)
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(event.data as string) as WSMessage
        if (msg.type === 'connected') {
          setStatus('connected')
          if (retriesRef.current === 0) toast.success('Connected')
        }
        if (msg.type === 'pong') {
          if (pongTimeoutRef.current) {
            clearTimeout(pongTimeoutRef.current)
            pongTimeoutRef.current = null
          }
          return
        }
        setLastEvent(msg)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      clearPingTimers()
      if (!mountedRef.current) return
      setStatus('connecting')

      if (retriesRef.current >= MAX_RETRIES) {
        setStatus('disconnected')
        return
      }

      retriesRef.current++
      const delay = backoffRef.current
      backoffRef.current = Math.min(backoffRef.current * 2, 30_000)
      toast.info('Reconnecting…')
      setTimeout(() => {
        if (mountedRef.current) setRetryTick((tick) => tick + 1)
      }, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [sessionId, clearPingTimers])

  useEffect(() => {
    mountedRef.current = true
    if (sessionId) {
      connect()
    }
    return () => {
      mountedRef.current = false
      clearPingTimers()
      wsRef.current?.close()
    }
  }, [connect, clearPingTimers, retryTick, sessionId])

  const send = useCallback((msg: WSClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { status, lastEvent, send }
}

export function useWorkspaceWebSocket(_workspaceId?: string) {
  return useSessionWebSocket()
}