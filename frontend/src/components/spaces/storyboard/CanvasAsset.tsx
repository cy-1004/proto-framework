import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { MinusIcon, PlusIcon, RotateCcwIcon, SaveIcon } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { toast } from "sonner"
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch"
import type { TaskAssetItem, CanvasConfig, CanvasCardConfig } from "@/types/taskAsset"
import { registerViewportGetter, unregisterViewportGetter } from "@/lib/canvasViewport"
import CanvasCard, { computeCardSize } from "./CanvasCard"
import ConnectionLine from "./ConnectionLine"
import useCanvasConnections, { getPortPosition } from "./useCanvasConnections"
import type { Connection, PortDirection } from "./types"
import { COMPATIBLE_PORT, isPortOccupied, isNarationPortOccupied, pairHasConnection } from "./types"

const CANVAS_W = 2400
const CANVAS_H = 1600

const SB_CONN_DEBUG = import.meta.env.DEV

export interface CanvasAssetHandle {
  centerOnAsset: (assetId: string) => void
  loadCanvasConfig: (cfg: CanvasConfig) => void
  exportSourceGraph: () => Promise<void>
}

interface CanvasAssetProps {
  taskId: number
  items: TaskAssetItem[]
  selectedAssetId?: string | null
  onSelectAsset?: (assetId: string) => void
  onDeselectAsset?: () => void
  onItemUpdated?: (updated: TaskAssetItem) => void
  cardConfigs?: CanvasCardConfig[]
}

const CanvasAsset = forwardRef<CanvasAssetHandle, CanvasAssetProps>(function CanvasAsset({
  taskId,
  items,
  selectedAssetId,
  onSelectAsset,
  onDeselectAsset,
  onItemUpdated,
  cardConfigs,
}, ref) {
  const twRef = useRef<ReactZoomPanPinchContentRef>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [narationPortLayouts, setNarationPortLayouts] = useState<Record<string, Array<{ id: number; x: number; y: number }>>>({})
  const [saving, setSaving] = useState(false)
  const configLoadedRef = useRef(false)

  const cardStatesRef = useRef<Record<string, Record<string, unknown>>>({})
  const initialCardStates = useMemo(() => {
    const m: Record<string, Record<string, unknown>> = {}
    cardConfigs?.forEach((c) => { if (c.state) m[c.asset_id] = c.state })
    return m
  }, [cardConfigs])

  const handleCardStateChange = useCallback((assetId: string, state: Record<string, unknown>) => {
    cardStatesRef.current[assetId] = state
  }, [])

  const { connections, portDrag, startPortDrag, updatePortDrag, endPortDrag, removeConnection, removeAndStartDrag, loadConnections } =
    useCanvasConnections()

  const canvasItems = useMemo(
    () => items.filter((it) => it.on_canvas === "1"),
    [items],
  )
  const visibleAssetIds = useMemo(
    () => new Set(canvasItems.map((it) => it.asset_id)),
    [canvasItems],
  )
  const effectiveConnections = useMemo(
    () => connections.filter((conn) => visibleAssetIds.has(conn.fromAssetId) && visibleAssetIds.has(conn.toAssetId)),
    [connections, visibleAssetIds],
  )

  const saveCanvasConfig = useCallback(async () => {
    setSaving(true)
    try {
      const tw = twRef.current
      let viewport = { offsetX: 0, offsetY: 0, scale: 0.85 }
      if (tw) {
        const { scale, positionX, positionY } = tw.instance.transformState
        viewport = { offsetX: positionX, offsetY: positionY, scale }
      }
      const cards = canvasItems.map((it) => {
        const dp = dragPositionsRef.current[it.asset_id]
        const sz = computeCardSize(it.asset)
        const cardState = cardStatesRef.current[it.asset_id]
        return {
          asset_id: it.asset_id,
          x: dp?.x ?? it.x,
          y: dp?.y ?? it.y,
          w: sz.w,
          h: sz.h,
          ...(cardState && Object.keys(cardState).length > 0 ? { state: cardState } : {}),
        }
      })
      const conns: Array<Omit<Connection, "id">> = effectiveConnections.map(({ id: _id, ...rest }) => rest)
      const config: CanvasConfig = { viewport, cards, connections: conns }
      await apiFetch(`/api/tasks/${taskId}/canvas_config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
    } finally {
      setSaving(false)
    }
  }, [taskId, canvasItems, effectiveConnections])

  useImperativeHandle(ref, () => ({
    centerOnAsset(assetId: string) {
      const tw = twRef.current
      if (!tw) return
      const target = items.find((it) => it.asset_id === assetId)
      if (!target) return
      const wrapper = tw.instance.wrapperComponent
      if (!wrapper) return
      const rect = wrapper.getBoundingClientRect()
      const { scale } = tw.instance.transformState
      const cx = target.x + target.w / 2
      const cy = target.y + target.h / 2
      const px = rect.width / 2 - cx * scale
      const py = rect.height / 2 - cy * scale
      tw.setTransform(px, py, scale, 300, "easeOut")
    },
    loadCanvasConfig(cfg: CanvasConfig) {
      if (cfg.connections?.length) {
        const conns: Connection[] = cfg.connections.map((c, i) => ({
          id: `conn-${i + 1}`,
          ...c,
        }))
        loadConnections(conns)
      }
      if (cfg.viewport) {
        setTimeout(() => {
          twRef.current?.setTransform(cfg.viewport.offsetX, cfg.viewport.offsetY, cfg.viewport.scale, 0)
        }, 50)
      }
      configLoadedRef.current = true
    },
    async exportSourceGraph() {
      await saveCanvasConfig()

      if (!selectedAssetId) {
        toast.warning("请先选中一个卡片")
        return
      }

      const itemById = new Map(canvasItems.map((it) => [it.asset_id, it]))
      if (!itemById.has(selectedAssetId)) {
        toast.warning("选中的卡片不在画布上")
        return
      }

      // BFS: find connected component containing selectedAssetId
      const visited = new Set<string>()
      const queue = [selectedAssetId]
      visited.add(selectedAssetId)
      const graphConns: Connection[] = []

      while (queue.length > 0) {
        const cur = queue.shift()!
        for (const c of effectiveConnections) {
          let neighbor: string | null = null
          if (c.fromAssetId === cur) neighbor = c.toAssetId
          else if (c.toAssetId === cur) neighbor = c.fromAssetId
          if (!neighbor || !itemById.has(neighbor)) continue
          if (!graphConns.includes(c)) graphConns.push(c)
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            queue.push(neighbor)
          }
        }
      }

      const graphItems = canvasItems.filter((it) => visited.has(it.asset_id))

      // Count StoryLines
      // 1) Horizontal chains via left-right ports
      const horizConns = graphConns.filter(
        (c) => (c.fromPort === "right" && c.toPort === "left") ||
               (c.fromPort === "left" && c.toPort === "right"),
      )
      // Union-Find for horizontal chains
      const parent = new Map<string, string>()
      const find = (x: string): string => {
        if (!parent.has(x)) parent.set(x, x)
        if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
        return parent.get(x)!
      }
      const union = (a: string, b: string) => {
        parent.set(find(a), find(b))
      }
      const horizNodeIds = new Set<string>()
      for (const c of horizConns) {
        horizNodeIds.add(c.fromAssetId)
        horizNodeIds.add(c.toAssetId)
        union(c.fromAssetId, c.toAssetId)
      }
      const chainRoots = new Set<string>()
      for (const id of horizNodeIds) chainRoots.add(find(id))
      let storyLineCount = chainRoots.size

      // 2) Each NarationTimelineCard = 1 StoryLine
      const narationCards = graphItems.filter((it) => it.asset.type === "naration")
      storyLineCount += narationCards.length

      if (storyLineCount === 0) {
        toast.warning("SourceGraph 中未找到 StoryLine")
        return
      }
      if (storyLineCount > 1) {
        toast.warning(`SourceGraph 中包含 ${storyLineCount} 个 StoryLine，需要恰好 1 个`)
        return
      }

      const sourceGraph = {
        items: graphItems.map((it) => ({
          asset_id: it.asset_id,
          type: it.asset.type,
          name: it.asset.name_cn,
          x: dragPositionsRef.current[it.asset_id]?.x ?? it.x,
          y: dragPositionsRef.current[it.asset_id]?.y ?? it.y,
        })),
        connections: graphConns.map(({ id: _id, ...rest }) => rest),
      }
      console.log("export", sourceGraph)
    },
  }), [canvasItems, effectiveConnections, items, loadConnections, selectedAssetId, saveCanvasConfig])

  useEffect(() => {
    registerViewportGetter(() => {
      const tw = twRef.current
      if (!tw) return null
      const { scale, positionX, positionY } = tw.instance.transformState
      const wrapper = tw.instance.wrapperComponent
      if (!wrapper) return null
      const rect = wrapper.getBoundingClientRect()
      return {
        x: Math.round((rect.width / 2 - positionX) / scale),
        y: Math.round((rect.height / 2 - positionY) / scale),
      }
    })
    return () => unregisterViewportGetter()
  }, [])

  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({})
  const dragPositionsRef = useRef(dragPositions)
  dragPositionsRef.current = dragPositions

  const handleDragPositionChange = useCallback(
    (assetId: string, x: number, y: number) => {
      setDragPositions((prev) => {
        const old = prev[assetId]
        if (old && old.x === x && old.y === y) return prev
        return { ...prev, [assetId]: { x, y } }
      })
    },
    [],
  )

  const resolveItem = useCallback(
    (it: TaskAssetItem) => {
      const dp = dragPositions[it.asset_id]
      const sz = computeCardSize(it.asset)
      const base = { ...it, w: sz.w, h: sz.h }
      return dp ? { ...base, x: dp.x, y: dp.y } : base
    },
    [dragPositions],
  )

  const handlePortDragStart = useCallback(
    (assetId: string, port: PortDirection, px: number, py: number, assetType?: string) => {
      startPortDrag(assetId, port, px, py, assetType)
    },
    [startPortDrag],
  )

  const handlePortDragEnd = useCallback(
    (assetId: string, port: PortDirection, portIndex?: number) => {
      endPortDrag(assetId, port, portIndex)
    },
    [endPortDrag],
  )

  const handlePortLayoutChange = useCallback(
    (assetId: string, positions: Array<{ id: number; x: number; y: number }>) => {
      setNarationPortLayouts((prev) => {
        const old = prev[assetId]
        if (
          old &&
          old.length === positions.length &&
          old.every((p, i) => p.id === positions[i].id && p.x === positions[i].x && p.y === positions[i].y)
        ) {
          return prev
        }
        return { ...prev, [assetId]: positions }
      })
    },
    [],
  )

  const itemsRef = useRef(items)
  itemsRef.current = items
  const resolveItemRef = useRef(resolveItem)
  resolveItemRef.current = resolveItem
  const portDragRef = useRef(portDrag)
  portDragRef.current = portDrag
  const connectionsRef = useRef(connections)
  connectionsRef.current = effectiveConnections
  const narationPortLayoutsRef = useRef(narationPortLayouts)
  narationPortLayoutsRef.current = narationPortLayouts

  const isDraggingPort = portDrag !== null

  useEffect(() => {
    if (!isDraggingPort) return

    const handleMove = (e: PointerEvent) => {
      const el = canvasRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const scale = rect.width / CANVAS_W
      const cx = (e.clientX - rect.left) / scale
      const cy = (e.clientY - rect.top) / scale
      updatePortDrag(cx, cy)
    }

    const handleUp = (e: PointerEvent) => {
      const el = canvasRef.current
      const pd = portDragRef.current
      if (!el || !pd) {
        if (SB_CONN_DEBUG) console.debug("[sb:conn] doc pointerup: no canvas or no portDrag ref")
        endPortDrag()
        return
      }
      const rect = el.getBoundingClientRect()
      const scale = rect.width / CANVAS_W
      const cx = (e.clientX - rect.left) / scale
      const cy = (e.clientY - rect.top) / scale
      const targetPort = COMPATIBLE_PORT[pd.fromPort]
      const HIT_RADIUS = 20

      const cs = connectionsRef.current

      // For narration cards, skip the broad card-area drop — require precise port hit
      let bestCardHit: { assetId: string; dist2: number } | null = null
      for (const it of itemsRef.current) {
        if (it.asset_id === pd.fromAssetId) continue
        if (it.asset.type === "naration") continue
        if (pairHasConnection(cs, pd.fromAssetId, it.asset_id)) continue
        if (isPortOccupied(cs, it.asset_id, targetPort)) continue
        const resolved = resolveItemRef.current(it)
        const insideCard =
          cx >= resolved.x &&
          cx <= resolved.x + resolved.w &&
          cy >= resolved.y &&
          cy <= resolved.y + resolved.h
        if (insideCard) {
          const mx = resolved.x + resolved.w / 2
          const my = resolved.y + resolved.h / 2
          const dist2 = (cx - mx) * (cx - mx) + (cy - my) * (cy - my)
          if (!bestCardHit || dist2 < bestCardHit.dist2) {
            bestCardHit = { assetId: it.asset_id, dist2 }
          }
        }
      }

      if (bestCardHit) {
        if (SB_CONN_DEBUG) console.debug("[sb:conn] doc pointerup: hit card bbox → connect", { to: bestCardHit.assetId, targetPort, cx, cy })
        endPortDrag(bestCardHit.assetId, targetPort)
        return
      }

      // Narration card: drop anywhere on card → auto-pick nearest segment port by x
      if (pd.fromPort === "bottom" && (pd.fromAssetType === "image" || pd.fromAssetType === "video")) {
        for (const it of itemsRef.current) {
          if (it.asset_id === pd.fromAssetId) continue
          if (it.asset.type !== "naration") continue
          const ports = narationPortLayoutsRef.current[it.asset_id]
          if (!ports || ports.length === 0) {
            if (SB_CONN_DEBUG) console.debug("[sb:conn] narration drop skip: no port layout yet", { narId: it.asset_id })
            continue
          }
          const portY = ports[0].y
          const minPx = Math.min(...ports.map((p) => p.x))
          const maxPx = Math.max(...ports.map((p) => p.x))
          const segGap = ports.length > 1 ? (maxPx - minPx) / (ports.length - 1) : 40
          const cardH = it.h > 0 ? it.h : 200
          if (cx < minPx - segGap || cx > maxPx + segGap) continue
          if (cy < portY - 10 || cy > portY + cardH) continue
          let bestId = -1
          let bestDist = Infinity
          for (let i = 0; i < ports.length; i++) {
            if (isNarationPortOccupied(cs, it.asset_id, ports[i].id)) continue
            const dx = Math.abs(cx - ports[i].x)
            if (dx < bestDist) { bestDist = dx; bestId = ports[i].id }
          }
          if (bestId >= 0) {
            if (SB_CONN_DEBUG) console.debug("[sb:conn] doc pointerup: narration band hit", { to: it.asset_id, segmentId: bestId, cx, cy })
            endPortDrag(it.asset_id, "top", bestId)
            return
          }
          if (SB_CONN_DEBUG) console.debug("[sb:conn] narration in band but all segment ports occupied", { narId: it.asset_id })
        }
      }

      // Port proximity hit for non-narration cards
      for (const it of itemsRef.current) {
        if (it.asset_id === pd.fromAssetId) continue
        if (it.asset.type === "naration") continue
        if (pairHasConnection(cs, pd.fromAssetId, it.asset_id)) continue
        if (isPortOccupied(cs, it.asset_id, targetPort)) continue
        const resolved = resolveItemRef.current(it)
        const pos = getPortPosition(resolved, targetPort)
        const dx = cx - pos.x
        const dy = cy - pos.y
        if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
          if (SB_CONN_DEBUG) console.debug("[sb:conn] doc pointerup: port proximity", { to: it.asset_id, targetPort, cx, cy })
          endPortDrag(it.asset_id, targetPort)
          return
        }
      }
      if (SB_CONN_DEBUG) {
        console.debug("[sb:conn] doc pointerup: no hit (miss)", {
          from: pd.fromAssetId,
          fromPort: pd.fromPort,
          targetPort,
          cx: Math.round(cx),
          cy: Math.round(cy),
          pointerType: e.pointerType,
        })
      }
      endPortDrag()
    }

    document.addEventListener("pointermove", handleMove)
    document.addEventListener("pointerup", handleUp)
    return () => {
      document.removeEventListener("pointermove", handleMove)
      document.removeEventListener("pointerup", handleUp)
    }
  }, [isDraggingPort, updatePortDrag, endPortDrag])

  const itemMap = new Map(canvasItems.map((it) => [it.asset_id, it]))

  return (
    <div className="relative h-full min-h-0 flex-1 overflow-hidden bg-muted/40">
      <TransformWrapper
        ref={twRef}
        initialScale={0.85}
        minScale={0.15}
        maxScale={4}
        limitToBounds={false}
        centerOnInit
        wheel={{ step: 0.08 }}
        panning={{
          excluded: [
            "storyboard-card",
            "storyboard-card-inner",
            "storyboard-port",
          ],
          velocityDisabled: true,
        }}
        doubleClick={{ disabled: false, mode: "reset" }}
      >
        <TransformComponent
          wrapperClass="!w-full !h-full"
          contentClass="!w-full !h-full"
          wrapperStyle={{ width: "100%", height: "100%" }}
        >
          <div
            ref={canvasRef}
            className="relative bg-[length:24px_24px] bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)]"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              minWidth: CANVAS_W,
              minHeight: CANVAS_H,
            }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) onDeselectAsset?.()
            }}
          >
            {/* SVG overlay for connection lines */}
            <svg
              className="absolute inset-0"
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ zIndex: 15, overflow: "visible" }}
              pointerEvents="none"
            >
              {effectiveConnections.map((conn) => {
                const fromItem = itemMap.get(conn.fromAssetId)
                const toItem = itemMap.get(conn.toAssetId)
                if (!fromItem || !toItem) return null
                const from = getPortPosition(
                  resolveItem(fromItem),
                  conn.fromPort,
                )
                const toPortEntry = conn.toPortIndex !== undefined
                  ? narationPortLayouts[conn.toAssetId]?.find((p) => p.id === conn.toPortIndex)
                  : undefined
                const to = toPortEntry
                  ? { x: toPortEntry.x, y: toPortEntry.y }
                  : getPortPosition(resolveItem(toItem), conn.toPort)
                return (
                  <ConnectionLine
                    key={conn.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    fromPort={conn.fromPort}
                    toPort={conn.toPort}
                    onDelete={() => removeConnection(conn.id)}
                    onReconnect={(e) => {
                      const el = canvasRef.current
                      if (!el) return
                      const rect = el.getBoundingClientRect()
                      const scale = rect.width / CANVAS_W
                      const cx = (e.clientX - rect.left) / scale
                      const cy = (e.clientY - rect.top) / scale
                      removeAndStartDrag(conn.id, conn.fromAssetId, conn.fromPort, from.x, from.y, cx, cy, fromItem.asset.type)
                    }}
                  />
                )
              })}
              {portDrag && (
                <ConnectionLine
                  x1={portDrag.startX}
                  y1={portDrag.startY}
                  x2={portDrag.cursorX}
                  y2={portDrag.cursorY}
                  fromPort={portDrag.fromPort}
                  toPort={COMPATIBLE_PORT[portDrag.fromPort]}
                  isPreview
                />
              )}
            </svg>

            {canvasItems.map((row) => (
              <CanvasCard
                key={row.link_id}
                item={row}
                taskId={taskId}
                selected={selectedAssetId === row.asset_id}
                onSelect={onSelectAsset}
                onPositionSaved={onItemUpdated}
                onPortDragStart={handlePortDragStart}
                onPortDragEnd={handlePortDragEnd}
                onPortLayoutChange={handlePortLayoutChange}
                portDragActive={portDrag}
                onDragPositionChange={handleDragPositionChange}
                connections={effectiveConnections}
                initialCardState={initialCardStates[row.asset_id]}
                onCardStateChange={handleCardStateChange}
              />
            ))}
          </div>
        </TransformComponent>
      </TransformWrapper>

      <div className="pointer-events-auto absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-lg border bg-card/95 p-1 shadow-md backdrop-blur-sm">
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => twRef.current?.zoomOut(0.2)}
          aria-label="缩小"
        >
          <MinusIcon className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => twRef.current?.zoomIn(0.2)}
          aria-label="放大"
        >
          <PlusIcon className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => twRef.current?.resetTransform()}
          aria-label="重置视图"
        >
          <RotateCcwIcon className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          onClick={saveCanvasConfig}
          disabled={saving}
          aria-label="保存画布状态"
        >
          <SaveIcon className="size-4" />
        </button>
      </div>
    </div>
  )
})

export default CanvasAsset
