import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { PlayIcon, PauseIcon, ScrollTextIcon } from "lucide-react"
import { useTransformComponent } from "react-zoom-pan-pinch"
import WaveSurfer from "wavesurfer.js"
import type { TaskAssetItem } from "@/types/taskAsset"
import type { NarationData, SubtitleSegment } from "@/types/asset"
import { NARATION_CARD_CONFIG } from "@/config/options"
import { cn } from "@/lib/utils"
import { useNarationPlayback } from "@/contexts/NarationPlaybackContext"
import type { Connection, PortDragState } from "./types"
import { isNarationPortOccupied } from "./types"

interface NarationTimelineCardProps {
  item: TaskAssetItem
  taskId: number
  narData: NarationData
  selected?: boolean
  onSelect?: (assetId: string) => void
  onPositionSaved?: (updated: TaskAssetItem) => void
  onDragPositionChange?: (assetId: string, x: number, y: number) => void
  onPortDragEnd?: (assetId: string, port: "top", portIndex: number) => void
  onPortLayoutChange?: (assetId: string, positions: Array<{ id: number; x: number; y: number }>) => void
  portDragActive?: PortDragState | null
  connections?: Connection[]
  initialCardState?: Record<string, unknown>
  onCardStateChange?: (assetId: string, state: Record<string, unknown>) => void
}

function findSegmentIndex(segments: SubtitleSegment[], timeMs: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (timeMs >= segments[i].time_begin && timeMs <= segments[i].time_end) return i
  }
  return -1
}

const SB_CONN_DEBUG = import.meta.env.DEV

const WAVEFORM_CACHE_SAMPLE_COUNT = 2048
const waveformSampleCache = new WeakMap<object, Float32Array>()

function getWaveformSamples(channel: number[] | Float32Array) {
  const cached = waveformSampleCache.get(channel as object)
  if (cached) return cached

  const sampleCount = Math.min(WAVEFORM_CACHE_SAMPLE_COUNT, channel.length)
  const bucketSize = channel.length / sampleCount
  const samples = new Float32Array(sampleCount)

  for (let i = 0; i < sampleCount; i++) {
    const start = Math.floor(i * bucketSize)
    const end = Math.min(channel.length, Math.max(start + 1, Math.floor((i + 1) * bucketSize)))
    let peak = 0
    for (let j = start; j < end; j++) {
      peak = Math.max(peak, Math.abs(channel[j] ?? 0))
    }
    samples[i] = peak
  }

  waveformSampleCache.set(channel as object, samples)
  return samples
}

export default function NarationTimelineCard({
  item,
  taskId: _taskId,
  narData,
  selected,
  onSelect,
  onPositionSaved,
  onDragPositionChange,
  onPortDragEnd,
  onPortLayoutChange,
  portDragActive,
  connections = [],
  initialCardState,
  onCardStateChange,
}: NarationTimelineCardProps) {
  const scale = useTransformComponent((c) => c.state.scale)
  const playback = useNarationPlayback()
  const updatePlayback = playback.update
  const segments = narData.segments || []
  const duration = item.asset.duration || 1

  const headH = 28
  const initialScaleX = typeof initialCardState?.scaleX === "number" ? initialCardState.scaleX : 1
  const [scaleX, setScaleX] = useState(initialScaleX)
  const initialMergedDividers = Array.isArray(initialCardState?.mergedDividers) ? initialCardState.mergedDividers as boolean[] : []
  const [mergedDividers, setMergedDividers] = useState<boolean[]>(initialMergedDividers)

  const effectiveMergedDividers = useMemo(() => {
    const len = Math.max(0, segments.length - 1)
    if (mergedDividers.length === len) return mergedDividers
    const result = new Array(len).fill(false) as boolean[]
    for (let i = 0; i < Math.min(mergedDividers.length, len); i++) result[i] = mergedDividers[i]
    return result
  }, [segments.length, mergedDividers])

  const entities = useMemo(() => {
    if (segments.length === 0) return []
    const md = effectiveMergedDividers
    const result: { id: number; segs: number[]; tBegin: number; tEnd: number }[] = []
    let grp: number[] = [0]
    for (let i = 0; i < md.length; i++) {
      if (md[i]) {
        grp.push(i + 1)
      } else {
        result.push({ id: grp[0], segs: grp, tBegin: segments[grp[0]].time_begin, tEnd: segments[grp[grp.length - 1]].time_end })
        grp = [i + 1]
      }
    }
    result.push({ id: grp[0], segs: grp, tBegin: segments[grp[0]].time_begin, tEnd: segments[grp[grp.length - 1]].time_end })
    return result
  }, [segments, effectiveMergedDividers])

  const entitiesRef = useRef(entities)
  entitiesRef.current = entities

  const findEntitySegs = useCallback((segIdx: number): number[] => {
    const ents = entitiesRef.current
    if (segIdx < 0) return []
    const ent = ents.find((e) => e.segs.includes(segIdx))
    return ent?.segs ?? []
  }, [])

  const handleScaleXChange = useCallback((val: number) => {
    setScaleX(val)
    onCardStateChange?.(item.asset_id, { scaleX: val, mergedDividers })
  }, [item.asset_id, onCardStateChange, mergedDividers])

  useEffect(() => {
    onCardStateChange?.(item.asset_id, { scaleX, mergedDividers })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const barW = Math.round(duration * NARATION_CARD_CONFIG.pixels_per_second * scaleX)
  const barH = NARATION_CARD_CONFIG.timeline_height
  const cardH = headH + barH
  const totalDurationMs = segments.length > 0 ? segments[segments.length - 1].time_end : duration * 1000

  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const dragPosRef = useRef<{ x: number; y: number } | null>(null)
  const startRef = useRef<{ clientX: number; clientY: number; originX: number; originY: number } | null>(null)

  const x = drag?.x ?? item.x
  const y = drag?.y ?? item.y

  const wsRef = useRef<WaveSurfer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubberRef = useRef<HTMLDivElement>(null)
  const resizeRafRef = useRef<number | null>(null)
  const appliedWaveWidthRef = useRef(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)

  useEffect(() => {
    if (!containerRef.current || !narData.audio) return
    const renderWaveform = (peaks: (number[] | Float32Array)[], ctx: CanvasRenderingContext2D) => {
      const { width, height } = ctx.canvas
      const channel = peaks[0]
      if (!channel || channel.length === 0) return
      const samples = getWaveformSamples(channel)
      const pointCount = Math.max(48, Math.min(samples.length, Math.floor(width)))
      const stride = Math.max(1, Math.ceil(samples.length / pointCount))
      const n = Math.ceil(samples.length / stride)
      const lineColor = ctx.fillStyle as string

      const areaPath = new Path2D()
      areaPath.moveTo(0, height)
      for (let i = 0; i < n; i++) {
        const sample = samples[Math.min(i * stride, samples.length - 1)] ?? 0
        const x = n === 1 ? width / 2 : (i / (n - 1)) * width
        const y = height * (1 - sample * 0.92)
        areaPath.lineTo(x, y)
      }
      areaPath.lineTo(width, height)
      areaPath.closePath()

      const grad = ctx.createLinearGradient(0, 0, 0, height)
      grad.addColorStop(0, lineColor)
      grad.addColorStop(1, "transparent")
      ctx.fillStyle = grad
      ctx.fill(areaPath)

      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const sample = samples[Math.min(i * stride, samples.length - 1)] ?? 0
        const x = n === 1 ? width / 2 : (i / (n - 1)) * width
        const y = height * (1 - sample * 0.92)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1.5
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.stroke()
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: `/media/${narData.audio}`,
      height: barH - 16,
      waveColor: "hsl(var(--primary) / 0.5)",
      progressColor: "hsl(var(--primary) / 0.85)",
      cursorColor: "hsl(var(--primary))",
      cursorWidth: 1,
      normalize: true,
      interact: false,
      renderFunction: renderWaveform,
    })
    ws.on("play", () => setIsPlaying(true))
    ws.on("pause", () => {
      const ms = ws.getCurrentTime() * 1000
      setIsPlaying(false)
      setCurrentMs(ms)
      const idx = findSegmentIndex(segments, ms)
      updatePlayback({ assetId: item.asset_id, currentTime: ms, segmentIndex: idx, activeEntitySegIndices: findEntitySegs(idx), isPlaying: false })
    })
    ws.on("finish", () => {
      setIsPlaying(false)
      setCurrentMs(totalDurationMs)
      const idx = findSegmentIndex(segments, totalDurationMs)
      updatePlayback({ assetId: item.asset_id, currentTime: totalDurationMs, segmentIndex: idx, activeEntitySegIndices: findEntitySegs(idx), isPlaying: false })
    })
    const syncPlayback = (time: number) => {
      const ms = time * 1000
      setCurrentMs(ms)
      const idx = findSegmentIndex(segments, ms)
      updatePlayback({ assetId: item.asset_id, currentTime: ms, segmentIndex: idx, activeEntitySegIndices: findEntitySegs(idx), isPlaying: true })
    }
    ws.on("audioprocess", syncPlayback)
    ws.on("timeupdate", syncPlayback)
    wsRef.current = ws
    appliedWaveWidthRef.current = barW
    return () => {
      if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
      appliedWaveWidthRef.current = 0
      ws.destroy()
      wsRef.current = null
    }
  }, [narData.audio, barH, item.asset_id, segments, totalDurationMs, updatePlayback, findEntitySegs])

  useEffect(() => {
    const ws = wsRef.current
    if (!ws) return
    if (Math.abs(appliedWaveWidthRef.current - barW) < 1) return

    if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current)
    resizeRafRef.current = requestAnimationFrame(() => {
      const dur = ws.getDuration()
      if (dur > 0) {
        ws.setOptions({ width: barW })
        appliedWaveWidthRef.current = barW
      }
      resizeRafRef.current = null
    })

    return () => {
      if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
    }
  }, [barW])

  const togglePlay = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const ws = wsRef.current
    if (!ws) return
    void ws.playPause()
  }, [])

  const seekToClientX = useCallback((clientX: number) => {
    const el = scrubberRef.current
    const ws = wsRef.current
    if (!el || !ws || totalDurationMs <= 0) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    ws.seekTo(ratio)
    const ms = ratio * totalDurationMs
    setCurrentMs(ms)
    const idx = findSegmentIndex(segments, ms)
    updatePlayback({
      assetId: item.asset_id,
      currentTime: ms,
      segmentIndex: idx,
      activeEntitySegIndices: findEntitySegs(idx),
      isPlaying: ws.isPlaying(),
    })
  }, [item.asset_id, segments, totalDurationMs, updatePlayback, findEntitySegs])

  const handleScrubPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    seekToClientX(e.clientX)
    const move = (ev: PointerEvent) => seekToClientX(ev.clientX)
    const up = () => {
      document.removeEventListener("pointermove", move)
      document.removeEventListener("pointerup", up)
    }
    document.addEventListener("pointermove", move)
    document.addEventListener("pointerup", up)
  }, [seekToClientX])

  const persist = useCallback((nx: number, ny: number) => {
    onPositionSaved?.({ ...item, x: nx, y: ny, w: barW, h: cardH })
    setDrag(null)
  }, [item, barW, cardH, onPositionSaved])

  const onHeadPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelect?.(item.asset_id)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startRef.current = { clientX: e.clientX, clientY: e.clientY, originX: drag?.x ?? item.x, originY: drag?.y ?? item.y }
    dragPosRef.current = { x: startRef.current.originX, y: startRef.current.originY }
    setDrag({ x: startRef.current.originX, y: startRef.current.originY })
  }

  const onHeadPointerMove = (e: React.PointerEvent) => {
    const s = startRef.current; if (!s) return
    e.stopPropagation()
    const sc = Math.max(scale, 0.001)
    const next = { x: s.originX + (e.clientX - s.clientX) / sc, y: s.originY + (e.clientY - s.clientY) / sc }
    dragPosRef.current = next; setDrag(next)
    onDragPositionChange?.(item.asset_id, next.x, next.y)
  }

  const endHeadDrag = (e: React.PointerEvent) => {
    const s = startRef.current; if (!s) return
    startRef.current = null; e.stopPropagation()
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* */ }
    const p = dragPosRef.current; dragPosRef.current = null
    if (p && (p.x !== s.originX || p.y !== s.originY)) { void persist(p.x, p.y) }
    else { setDrag(null) }
    onDragPositionChange?.(item.asset_id, p?.x ?? s.originX, p?.y ?? s.originY)
  }

  const activeSegIdx = playback.assetId === item.asset_id ? playback.segmentIndex : -1
  const playRatio = totalDurationMs > 0 ? Math.min(1, Math.max(0, currentMs / totalDurationMs)) : 0

  const portPositions = useMemo(() => {
    if (totalDurationMs <= 0) return []
    return entities.map((ent) => ({
      id: ent.id,
      px: ((ent.tBegin + ent.tEnd) / 2 / totalDurationMs) * barW,
    }))
  }, [entities, totalDurationMs, barW])

  useEffect(() => {
    onPortLayoutChange?.(
      item.asset_id,
      portPositions.map((p) => ({ id: p.id, x: x + p.px, y })),
    )
  }, [item.asset_id, onPortLayoutChange, portPositions, x, y])

  const isTarget = portDragActive && portDragActive.fromAssetId !== item.asset_id
  const canAccept = isTarget && portDragActive!.fromPort === "bottom" &&
    (portDragActive!.fromAssetType === "image" || portDragActive!.fromAssetType === "video")

  const hoveredEntityId = useMemo(() => {
    if (!canAccept || !portDragActive || totalDurationMs <= 0) return -1
    const cursorLocalX = portDragActive.cursorX - x
    const cursorLocalY = portDragActive.cursorY - y
    if (cursorLocalX < 0 || cursorLocalX > barW) return -1
    if (cursorLocalY < -10 || cursorLocalY > cardH) return -1
    let bestId = -1
    let bestDist = Infinity
    for (const p of portPositions) {
      if (isNarationPortOccupied(connections, item.asset_id, p.id)) continue
      const dx = Math.abs(cursorLocalX - p.px)
      if (dx < bestDist) { bestDist = dx; bestId = p.id }
    }
    return bestId
  }, [canAccept, portDragActive, totalDurationMs, x, y, barW, cardH, portPositions, connections, item.asset_id])

  const connectedEntityIds = useMemo(
    () =>
      new Set(
        connections
          .filter((conn) => conn.toAssetId === item.asset_id && conn.toPort === "top" && conn.toPortIndex !== undefined)
          .map((conn) => conn.toPortIndex as number),
      ),
    [connections, item.asset_id],
  )

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; segIdx: number } | null>(null)
  const headRef = useRef<HTMLDivElement>(null)

  const handleHeadContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = headRef.current?.getBoundingClientRect()
    if (!rect || totalDurationMs <= 0) return
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const timeMs = ratio * totalDurationMs
    let segIdx = -1
    for (let i = 0; i < segments.length; i++) {
      if (timeMs >= segments[i].time_begin && timeMs <= segments[i].time_end) { segIdx = i; break }
    }
    if (segIdx === -1 && segments.length > 0) {
      let best = 0; let bestDist = Infinity
      for (let i = 0; i < segments.length; i++) {
        const mid = (segments[i].time_begin + segments[i].time_end) / 2
        const d = Math.abs(timeMs - mid)
        if (d < bestDist) { bestDist = d; best = i }
      }
      segIdx = best
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, segIdx })
  }, [totalDurationMs, segments])

  useEffect(() => {
    if (!selected || narData.tts_done !== "1") return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      wsRef.current?.playPause()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected, narData.tts_done])

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener("pointerdown", close)
    window.addEventListener("scroll", close, true)
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("scroll", close, true) }
  }, [ctxMenu])

  return (
    <div
      ref={headRef}
      className={cn(
        "storyboard-card group absolute z-10 border bg-card shadow-md",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-transparent",
      )}
      style={{ left: x, top: y, width: barW, height: cardH }}
      onContextMenu={handleHeadContextMenu}
    >
      <div
        className="absolute inset-x-0 top-0 z-40 flex h-10 cursor-grab items-center gap-1.5 border-b bg-muted/95 px-2 active:cursor-grabbing"
        onPointerDown={onHeadPointerDown}
        onPointerMove={onHeadPointerMove}
        onPointerUp={endHeadDrag}
        onPointerCancel={endHeadDrag}
      >
        <ScrollTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[20px] font-medium">{item.asset.name}</span>
      </div>

      {/* base fill below waveform */}
      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-primary/8 pointer-events-none" />
      <div
        className="absolute bottom-0 left-0 bg-primary/8 pointer-events-none"
        style={{ top: headH, width: `${playRatio * 100}%` }}
      />

      {/* entity highlight overlay */}
      {entities.map((ent, entIdx) => {
        if (!connectedEntityIds.has(ent.id)) return null
        const rightBound = entIdx < entities.length - 1 ? entities[entIdx + 1].tBegin : totalDurationMs
        return (
          <div
            key={`connected-entity-${ent.id}`}
            className="absolute bottom-0 z-10 pointer-events-none border-y-2 border-yellow-400/70 bg-yellow-400/25"
            style={{
              top: headH,
              left: `${(ent.tBegin / totalDurationMs) * 100}%`,
              right: `${((totalDurationMs - rightBound) / totalDurationMs) * 100}%`,
            }}
          />
        )
      })}

      {/* entity highlight overlay */}
      {(() => {
        if (activeSegIdx < 0) return null
        const entIdx = entities.findIndex((e) => e.segs.includes(activeSegIdx))
        if (entIdx < 0) return null
        const ent = entities[entIdx]
        const rightBound = entIdx < entities.length - 1 ? entities[entIdx + 1].tBegin : totalDurationMs
        return (
          <div
            className="absolute bottom-0 z-[11] bg-emerald-500/28 pointer-events-none"
            style={{
              top: headH,
              left: `${(ent.tBegin / totalDurationMs) * 100}%`,
              right: `${((totalDurationMs - rightBound) / totalDurationMs) * 100}%`,
            }}
          />
        )
      })()}

      {/* drag-hover entity highlight */}
      {hoveredEntityId >= 0 && (() => {
        const entIdx = entities.findIndex((e) => e.id === hoveredEntityId)
        if (entIdx < 0) return null
        const ent = entities[entIdx]
        const rightBound = entIdx < entities.length - 1 ? entities[entIdx + 1].tBegin : totalDurationMs
        return (
          <div
            className="absolute bottom-0 z-10 pointer-events-none border-y-2 border-yellow-400/70 bg-yellow-400/25"
            style={{
              top: headH,
              left: `${(ent.tBegin / totalDurationMs) * 100}%`,
              right: `${((totalDurationMs - rightBound) / totalDurationMs) * 100}%`,
            }}
          />
        )
      })()}

      {/* segment divider vlines – click to toggle merge */}
      {NARATION_CARD_CONFIG.segment_vline && segments.slice(1).map((seg, i) => {
        const isMerged = effectiveMergedDividers[i] ?? false
        return (
          <div
            key={`vline-${i}`}
            className="absolute bottom-0 w-4 -translate-x-1/2 cursor-pointer group/vline"
            style={{ top: headH, left: `${(seg.time_begin / totalDurationMs) * 100}%`, zIndex: 35 }}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              const next = [...effectiveMergedDividers]
              next[i] = !next[i]
              setMergedDividers(next)
              onCardStateChange?.(item.asset_id, { scaleX, mergedDividers: next })
            }}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-1/2 -translate-x-1/2 transition-all",
                isMerged
                  ? "w-0 border-l border-dashed border-primary/20 group-hover/vline:border-red-500"
                  : "w-px bg-primary/30 group-hover/vline:bg-red-500",
              )}
            />
          </div>
        )
      })}

      {/* waveform */}
      <div className="storyboard-card-inner absolute inset-x-0 bottom-0 z-20 overflow-hidden" style={{ top: headH, background: "hsl(var(--primary) / 0.04)" }}>
        <div ref={containerRef} className="absolute inset-x-0 bottom-2 top-0 px-1 pointer-events-none" />
      </div>

      {/* play time indicator / draggable scrubber */}
      <div
        ref={scrubberRef}
        className="absolute inset-x-0 bottom-0 z-30 cursor-ew-resize"
        style={{ top: headH }}
        onPointerDown={(e) => {
          onSelect?.(item.asset_id)
          handleScrubPointerDown(e)
        }}
      >
        <div
          className="absolute top-0 bottom-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
          style={{
            left: `${playRatio * 100}%`,
          }}
        >
          <span className="absolute left-1/2 top-0 block size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-primary shadow-sm" />
          <span className="absolute left-1/2 bottom-0 block size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border border-white bg-primary shadow-sm" />
        </div>
      </div>

      {/* scale slider with play button at bottom-left */}
      <div
        className="storyboard-port absolute -bottom-10 left-0 z-40 flex items-center gap-1 rounded bg-card border px-1.5 py-0.5 shadow-sm"
        style={{ width: NARATION_CARD_CONFIG.slider_width }}
        onPointerDown={(e) => {
          e.stopPropagation()
          onSelect?.(item.asset_id)
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            onSelect?.(item.asset_id)
            togglePlay(e)
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:scale-110 transition-transform"
        >
          {isPlaying ? <PauseIcon className="size-3" /> : <PlayIcon className="size-3 translate-x-px" />}
        </button>
        <input
          type="range"
          min={NARATION_CARD_CONFIG.slider_min_scale}
          max={NARATION_CARD_CONFIG.slider_max_scale}
          step={0.1}
          value={scaleX}
          onChange={(e) => handleScaleXChange(Number(e.target.value))}
          className="flex-1 h-1 accent-primary"
        />
        <span className="text-[9px] text-muted-foreground w-5 shrink-0 text-right">{scaleX.toFixed(1)}x</span>
      </div>

      {/* entity ports on top edge */}
      {portPositions.map((p) => {
        const occupied = isNarationPortOccupied(connections, item.asset_id, p.id)
        const compatible = canAccept && !occupied
        const showAlways = Boolean(selected) || compatible
        return (
          <div
            key={p.id}
            className={cn(
              "storyboard-port absolute z-20 flex items-center justify-center h-6 w-6 -translate-x-1/2 -translate-y-1/2 top-0 transition-opacity duration-150",
              showAlways ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            style={{ left: p.px }}
            onPointerUp={(e) => {
              if (!portDragActive || !canAccept || occupied) {
                if (SB_CONN_DEBUG && portDragActive) {
                  console.debug("[sb:conn] narration port pointerup skipped", {
                    narId: item.asset_id,
                    segId: p.id,
                    canAccept,
                    occupied,
                    from: portDragActive.fromAssetId,
                    fromPort: portDragActive.fromPort,
                    fromType: portDragActive.fromAssetType,
                  })
                }
                return
              }
              e.stopPropagation()
              if (SB_CONN_DEBUG) console.debug("[sb:conn] narration port pointerup → endPortDrag", { to: item.asset_id, segId: p.id })
              onPortDragEnd?.(item.asset_id, "top", p.id)
            }}
          >
            <span
              className={cn(
                "block h-3 w-3 rounded-full border-2 border-white shadow-sm",
                compatible ? "bg-primary scale-125 ring-2 ring-primary/40" : occupied ? "bg-muted-foreground" : "bg-primary/70",
              )}
            />
          </div>
        )
      })}

      {ctxMenu && createPortal(
        <div
          className="fixed z-[9999] min-w-[140px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(["搜索素材", "生成素材", "数字人解说"] as const).map((label) => (
            <button
              key={label}
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-default"
              onClick={() => {
                console.log(narData.subtitles, ctxMenu.segIdx)
                setCtxMenu(null)
              }}
            >
              {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
