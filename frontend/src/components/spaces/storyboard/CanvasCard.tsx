import { useCallback, useEffect, useRef, useState } from "react"
import { ImageIcon, VideoIcon, Volume2Icon, ScrollTextIcon, PencilIcon } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { useTransformComponent } from "react-zoom-pan-pinch"
import type { TaskAssetItem } from "@/types/taskAsset"
import type { NarationData } from "@/types/asset"
import { cn } from "@/lib/utils"
import type { Connection, PortDirection, PortDragState } from "./types"
import { COMPATIBLE_PORT, isPortOccupied, pairHasConnection } from "./types"
import NarationTimelineCard from "./NarationTimelineCard"
import scriptImg from "@/assets/script.png"

const MEDIA_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: VideoIcon,
  audio: Volume2Icon,
}

const LONG_SIDE = 240
const NAME_BAR_H = 32

const SB_CONN_DEBUG = import.meta.env.DEV

export function computeCardSize(asset: {
  mediatype?: string | null
  width?: number | null
  height?: number | null
  type?: string
}): { w: number; h: number } {
  if (
    (asset.mediatype === "image" || asset.mediatype === "video") &&
    asset.width &&
    asset.height &&
    asset.width > 0 &&
    asset.height > 0
  ) {
    const ar = asset.width / asset.height
    if (ar >= 1) {
      return { w: LONG_SIDE, h: Math.round(LONG_SIDE / ar + NAME_BAR_H) }
    }
    const mediaW = Math.round(LONG_SIDE * ar)
    return { w: mediaW, h: LONG_SIDE + NAME_BAR_H }
  }
  return { w: LONG_SIDE, h: 200 }
}

const PORTS: { dir: PortDirection; style: string }[] = [
  { dir: "top", style: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" },
  { dir: "right", style: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2" },
  { dir: "bottom", style: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2" },
  { dir: "left", style: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" },
]

interface CanvasCardProps {
  item: TaskAssetItem
  taskId: number
  selected?: boolean
  onSelect?: (assetId: string) => void
  onPositionSaved?: (updated: TaskAssetItem) => void
  onPortDragStart?: (assetId: string, port: PortDirection, px: number, py: number, assetType?: string) => void
  onPortDragEnd?: (assetId: string, port: PortDirection, portIndex?: number) => void
  onPortLayoutChange?: (assetId: string, positions: Array<{ id: number; x: number; y: number }>) => void
  portDragActive?: PortDragState | null
  onDragPositionChange?: (assetId: string, x: number, y: number) => void
  connections?: Connection[]
  initialCardState?: Record<string, unknown>
  onCardStateChange?: (assetId: string, state: Record<string, unknown>) => void
}

export default function CanvasCard({
  item,
  taskId,
  selected,
  onSelect,
  onPositionSaved,
  onPortDragStart,
  onPortDragEnd,
  onPortLayoutChange,
  portDragActive,
  onDragPositionChange,
  connections = [],
  initialCardState,
  onCardStateChange,
}: CanvasCardProps) {
  const a = item.asset
  const isNaration = a.type === "naration"

  const [narData, setNarData] = useState<NarationData | null>(null)
  useEffect(() => {
    if (!isNaration) return
    apiFetch(`/api/narations/${a.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setNarData)
      .catch(() => {})
  }, [isNaration, a.id])

  useEffect(() => {
    if (!isNaration) return
    const handler = () => {
      apiFetch(`/api/narations/${a.id}`)
        .then((r) => r.ok ? r.json() : null)
        .then(setNarData)
        .catch(() => {})
    }
    window.addEventListener("assets-updated", handler)
    return () => window.removeEventListener("assets-updated", handler)
  }, [isNaration, a.id])

  if (isNaration && narData?.tts_done === "1") {
    return (
      <NarationTimelineCard
        item={item}
        taskId={taskId}
        narData={narData}
        selected={selected}
        onSelect={onSelect}
        onPositionSaved={onPositionSaved}
        onDragPositionChange={onDragPositionChange}
        onPortDragEnd={(assetId, port, idx) => onPortDragEnd?.(assetId, port, idx)}
        onPortLayoutChange={onPortLayoutChange}
        portDragActive={portDragActive}
        connections={connections}
        initialCardState={initialCardState}
        onCardStateChange={onCardStateChange}
      />
    )
  }

  const hidePortsForNaration = isNaration

  return (
    <StandardCard
      item={item}
      taskId={taskId}
      selected={selected}
      onSelect={onSelect}
      onPositionSaved={onPositionSaved}
      onPortDragStart={onPortDragStart}
      onPortDragEnd={onPortDragEnd}
      portDragActive={portDragActive}
      onDragPositionChange={onDragPositionChange}
      connections={connections}
      hidePorts={hidePortsForNaration}
    />
  )
}

// ── StandardCard: the original card for non-narration assets or narration tts_done=0 ──

interface StandardCardProps extends CanvasCardProps {
  hidePorts?: boolean
}

function StandardCard({
  item,
  taskId: _taskId,
  selected,
  onSelect,
  onPositionSaved,
  onPortDragStart,
  onPortDragEnd,
  portDragActive,
  onDragPositionChange,
  connections = [],
  hidePorts,
}: StandardCardProps) {
  const scale = useTransformComponent((c) => c.state.scale)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const dragPosRef = useRef<{ x: number; y: number } | null>(null)
  const startRef = useRef<{
    clientX: number
    clientY: number
    originX: number
    originY: number
  } | null>(null)

  const x = drag?.x ?? item.x
  const y = drag?.y ?? item.y
  const a = item.asset
  const isNaration = a.type === "naration"
  const Icon = isNaration ? ScrollTextIcon : a.mediatype ? MEDIA_ICON[a.mediatype] : null
  const display = computeCardSize(a)
  const displayW = display.w
  const displayH = display.h

  const persist = useCallback(
    (nx: number, ny: number) => {
      onPositionSaved?.({ ...item, x: nx, y: ny, w: displayW, h: displayH })
      setDrag(null)
    },
    [item, displayW, displayH, onPositionSaved],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelect?.(item.asset_id)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      originX: drag?.x ?? item.x,
      originY: drag?.y ?? item.y,
    }
    const ox = startRef.current.originX
    const oy = startRef.current.originY
    dragPosRef.current = { x: ox, y: oy }
    setDrag({ x: ox, y: oy })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = startRef.current
    if (!s) return
    e.stopPropagation()
    const sc = Math.max(scale, 0.001)
    const dx = (e.clientX - s.clientX) / sc
    const dy = (e.clientY - s.clientY) / sc
    const next = { x: s.originX + dx, y: s.originY + dy }
    dragPosRef.current = next
    setDrag(next)
    onDragPositionChange?.(item.asset_id, next.x, next.y)
  }

  const endDrag = (e: React.PointerEvent) => {
    const s = startRef.current
    if (!s) return
    const ox = s.originX
    const oy = s.originY
    startRef.current = null
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const p = dragPosRef.current
    dragPosRef.current = null
    if (p && (p.x !== ox || p.y !== oy)) {
      void persist(p.x, p.y)
    } else {
      setDrag(null)
    }
    onDragPositionChange?.(item.asset_id, p?.x ?? ox, p?.y ?? oy)
  }

  const getPortCanvasPos = useCallback(
    (dir: PortDirection) => {
      const cx = drag?.x ?? item.x
      const cy = drag?.y ?? item.y
      switch (dir) {
        case "top":
          return { x: cx + displayW / 2, y: cy }
        case "bottom":
          return { x: cx + displayW / 2, y: cy + displayH }
        case "left":
          return { x: cx, y: cy + displayH / 2 }
        case "right":
          return { x: cx + displayW, y: cy + displayH / 2 }
      }
    },
    [drag, item.x, item.y, displayW, displayH],
  )

  const handlePortPointerDown = useCallback(
    (e: React.PointerEvent, dir: PortDirection) => {
      const occupied = isPortOccupied(connections, item.asset_id, dir)
      if (SB_CONN_DEBUG) {
        const t = e.target as HTMLElement
        console.debug("[sb:conn] port pointerdown", {
          assetId: item.asset_id,
          dir,
          occupied,
          targetTag: t?.tagName,
          targetClass: t?.className?.toString?.()?.slice?.(0, 80),
        })
      }
      e.stopPropagation()
      e.preventDefault()
      if (occupied) return
      const pos = getPortCanvasPos(dir)
      if (SB_CONN_DEBUG) console.debug("[sb:conn] start drag from port", { assetId: item.asset_id, dir, x: pos.x, y: pos.y, type: a.type })
      onPortDragStart?.(item.asset_id, dir, pos.x, pos.y, a.type)
    },
    [connections, getPortCanvasPos, item.asset_id, onPortDragStart, a.type],
  )

  const handlePortPointerUp = useCallback(
    (e: React.PointerEvent, dir: PortDirection) => {
      if (!portDragActive) {
        if (SB_CONN_DEBUG) console.debug("[sb:conn] port pointerup ignored (no portDragActive on card)", { assetId: item.asset_id, dir })
        return
      }
      e.stopPropagation()
      if (SB_CONN_DEBUG) console.debug("[sb:conn] port pointerup → endPortDrag", { targetAssetId: item.asset_id, dir })
      onPortDragEnd?.(item.asset_id, dir)
    },
    [portDragActive, item.asset_id, onPortDragEnd],
  )

  const isTarget =
    portDragActive && portDragActive.fromAssetId !== item.asset_id

  return (
    <div
      className={cn(
        "storyboard-card group absolute z-10 cursor-grab active:cursor-grabbing rounded-xl border bg-card shadow-lg",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-transparent",
      )}
      style={{ left: x, top: y, width: displayW, height: displayH }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="storyboard-card-inner flex h-full flex-col overflow-hidden rounded-[inherit]">
        <div className="relative min-h-0 flex-1 bg-muted">
          {isNaration ? (
            <img src={scriptImg} alt="" className="h-full w-full object-contain p-4" draggable={false} />
          ) : a.mediatype === "audio" ? (
            <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
              {a.desc || a.name_cn}
            </div>
          ) : a.thumbnail ? (
            <img src={`/media/${a.thumbnail}`} alt="" className="h-full w-full object-contain" draggable={false} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-10" />
            </div>
          )}
          {Icon && (
            <div className="absolute left-2 top-2 rounded-md bg-black/55 p-1 text-white">
              <Icon className="size-3.5" />
            </div>
          )}
          {(a.mediatype === "image" || a.mediatype === "video") && (
            <button
              type="button"
              className="absolute right-2 bottom-2 z-20 rounded-md bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/75"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                window.dispatchEvent(new CustomEvent("edit-canvas-asset", { detail: a }))
              }}
            >
              <PencilIcon className="size-3.5" />
            </button>
          )}
        </div>
        <div className="shrink-0 border-t bg-card px-2 py-1.5">
          <p className="truncate text-xs font-medium">{a.name_cn}</p>
        </div>
      </div>

      {!hidePorts && PORTS.map(({ dir, style }) => {
        const portOccupied = isPortOccupied(connections, item.asset_id, dir)
        const pairWithSource =
          portDragActive &&
          portDragActive.fromAssetId !== item.asset_id &&
          pairHasConnection(connections, item.asset_id, portDragActive.fromAssetId)
        const compatible =
          Boolean(isTarget && portDragActive) &&
          COMPATIBLE_PORT[portDragActive!.fromPort] === dir &&
          !portOccupied &&
          !pairWithSource
        const showPortAlways = Boolean(selected) || compatible
        return (
          <div
            key={dir}
            className={cn(
              "storyboard-port absolute z-20 flex items-center justify-center",
              "h-6 w-6",
              style,
              showPortAlways ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              "transition-opacity duration-150",
            )}
            onPointerDown={(e) => handlePortPointerDown(e, dir)}
            onPointerUp={(e) => handlePortPointerUp(e, dir)}
          >
            <span
              className={cn(
                "block h-3 w-3 rounded-full border-2 border-white shadow-sm",
                compatible
                  ? "bg-primary scale-125 ring-2 ring-primary/40"
                  : portOccupied
                    ? "bg-muted-foreground"
                    : "bg-primary/70",
              )}
            />
          </div>
        )
      })}
    </div>
  )
}
