import { useCallback, useRef, useState } from "react"
import type { Connection, PortDirection, PortDragState } from "./types"
import { COMPATIBLE_PORT, isPortOccupied, isNarationPortOccupied } from "./types"

let nextId = 1

const SB_CONN_DEBUG = import.meta.env.DEV

export function getPortPosition(
  item: { x: number; y: number; w: number; h: number },
  port: PortDirection,
): { x: number; y: number } {
  switch (port) {
    case "top":
      return { x: item.x + item.w / 2, y: item.y }
    case "bottom":
      return { x: item.x + item.w / 2, y: item.y + item.h }
    case "left":
      return { x: item.x, y: item.y + item.h / 2 }
    case "right":
      return { x: item.x + item.w, y: item.y + item.h / 2 }
  }
}

export default function useCanvasConnections() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [portDrag, setPortDrag] = useState<PortDragState | null>(null)
  const connectionsRef = useRef(connections)
  connectionsRef.current = connections

  const loadConnections = useCallback((conns: Connection[]) => {
    nextId = Math.max(nextId, ...conns.map(c => {
      const m = c.id.match(/^conn-(\d+)$/)
      return m ? Number(m[1]) + 1 : 0
    }), nextId)
    setConnections(conns)
  }, [])

  const startPortDrag = useCallback(
    (fromAssetId: string, fromPort: PortDirection, startX: number, startY: number, fromAssetType?: string) => {
      const blocked = isPortOccupied(connectionsRef.current, fromAssetId, fromPort)
      if (SB_CONN_DEBUG) {
        if (blocked) console.debug("[sb:conn] startPortDrag skipped (hook ref: port occupied)", { fromAssetId, fromPort })
        else console.debug("[sb:conn] portDrag state set", { fromAssetId, fromPort, fromAssetType })
      }
      if (blocked) return
      setPortDrag({ fromAssetId, fromPort, fromAssetType, startX, startY, cursorX: startX, cursorY: startY })
    },
    [],
  )

  const updatePortDrag = useCallback((cursorX: number, cursorY: number) => {
    setPortDrag((prev) => (prev ? { ...prev, cursorX, cursorY } : null))
  }, [])

  const endPortDrag = useCallback(
    (targetAssetId?: string, targetPort?: PortDirection, targetPortIndex?: number) => {
      if (SB_CONN_DEBUG && (!targetAssetId || !targetPort)) {
        console.debug("[sb:conn] endPortDrag: release without valid target (preview cleared)")
      }
      setPortDrag((prev) => {
        if (!prev) {
          if (SB_CONN_DEBUG && targetAssetId && targetPort) {
            console.debug("[sb:conn] endPortDrag: no active drag (stale call?)")
          }
          return null
        }
        if (!targetAssetId || !targetPort) return null
        if (prev.fromAssetId === targetAssetId) {
          if (SB_CONN_DEBUG) console.debug("[sb:conn] endPortDrag: same asset ignored")
          return null
        }
        if (COMPATIBLE_PORT[prev.fromPort] !== targetPort) {
          if (SB_CONN_DEBUG) {
            console.debug("[sb:conn] endPortDrag: incompatible port", { fromPort: prev.fromPort, targetPort })
          }
          return null
        }

        const fromAssetId = prev.fromAssetId
        const fromPort = prev.fromPort
        setConnections((cs) => {
          if (isPortOccupied(cs, fromAssetId, fromPort)) {
            if (SB_CONN_DEBUG) console.debug("[sb:conn] endPortDrag: from port became occupied")
            return cs
          }
          if (targetPortIndex !== undefined) {
            if (isNarationPortOccupied(cs, targetAssetId, targetPortIndex)) {
              if (SB_CONN_DEBUG) console.debug("[sb:conn] endPortDrag: narration segment occupied", { targetAssetId, targetPortIndex })
              return cs
            }
          } else {
            if (isPortOccupied(cs, targetAssetId, targetPort)) {
              if (SB_CONN_DEBUG) console.debug("[sb:conn] endPortDrag: target port occupied", { targetAssetId, targetPort })
              return cs
            }
          }
          if (SB_CONN_DEBUG) {
            console.debug("[sb:conn] connection added", { fromAssetId, fromPort, targetAssetId, targetPort, targetPortIndex })
          }
          return [
            ...cs,
            {
              id: `conn-${nextId++}`,
              fromAssetId,
              fromPort,
              toAssetId: targetAssetId,
              toPort: targetPort,
              toPortIndex: targetPortIndex,
            },
          ]
        })
        return null
      })
    },
    [],
  )

  const removeConnection = useCallback((id: string) => {
    setConnections((cs) => cs.filter((c) => c.id !== id))
  }, [])

  const removeAndStartDrag = useCallback(
    (connId: string, fromAssetId: string, fromPort: PortDirection, startX: number, startY: number, cursorX: number, cursorY: number, fromAssetType?: string) => {
      setConnections((cs) => cs.filter((c) => c.id !== connId))
      setPortDrag({ fromAssetId, fromPort, fromAssetType, startX, startY, cursorX, cursorY })
    },
    [],
  )

  return { connections, portDrag, startPortDrag, updatePortDrag, endPortDrag, removeConnection, removeAndStartDrag, loadConnections }
}
