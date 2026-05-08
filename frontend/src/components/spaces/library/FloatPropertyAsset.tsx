import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import type { Asset } from "@/types/asset"
import { LAYOUT_DEFINITION } from "@/config/options"
import PropertyAsset from "@/components/PropertyAsset"

const MIN_H = 240
const PAD = 8
const MIN_W = LAYOUT_DEFINITION.sidebar_min_width
const MAX_W = LAYOUT_DEFINITION.sidebar_max_width

function clampPos(
  x: number,
  y: number,
  w: number,
  h: number,
  bw: number,
  bh: number,
) {
  return {
    x: Math.min(Math.max(PAD, x), Math.max(PAD, bw - w - PAD)),
    y: Math.min(Math.max(PAD, y), Math.max(PAD, bh - h - PAD)),
  }
}

type ResizeEdge = "se" | "sw" | "s" | "w"

interface FloatPropertyAssetProps {
  boundaryRef: React.RefObject<HTMLElement | null>
  asset: Asset | null
  onClose: () => void
  isInProject?: boolean
  onToggleFavorite?: () => void
  onToggleProject?: () => void
  onDelete?: () => void
}

export default function FloatPropertyAsset({
  boundaryRef,
  asset,
  onClose,
  isInProject,
  onToggleFavorite,
  onToggleProject,
  onDelete,
}: FloatPropertyAssetProps) {
  const [w, setW] = useState(320)
  const [h, setH] = useState(360)
  const [x, setX] = useState(PAD)
  const [y, setY] = useState(PAD)
  const placedRef = useRef(false)
  const dimsRef = useRef({ x: PAD, y: PAD, w: 320, h: 360 })
  dimsRef.current = { x, y, w, h }

  useLayoutEffect(() => {
    const el = boundaryRef.current
    if (!el) return
    if (!placedRef.current) {
      const bw = el.clientWidth
      const bh = el.clientHeight
      const cw = Math.min(MAX_W, Math.max(MIN_W, 320))
      const ch = Math.max(MIN_H, bh - 2 * PAD)
      const c = clampPos(Math.max(PAD, bw - cw - PAD), PAD, cw, ch, bw, bh)
      setX(c.x)
      setY(c.y)
      setW(cw)
      setH(ch)
      placedRef.current = true
    }
  }, [boundaryRef])

  useEffect(() => {
    const el = boundaryRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const bw = el.clientWidth
      const bh = el.clientHeight
      if (bw === 0 || bh === 0) return
      const d = dimsRef.current
      let nw = Math.min(MAX_W, Math.max(MIN_W, d.w))
      let nh = Math.max(MIN_H, d.h)
      nw = Math.min(nw, Math.max(MIN_W, bw - d.x - PAD))
      nh = Math.min(nh, Math.max(MIN_H, bh - d.y - PAD))
      const c = clampPos(d.x, d.y, nw, nh, bw, bh)
      setX(c.x)
      setY(c.y)
      setW(nw)
      setH(nh)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [boundaryRef])

  const startMove = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = boundaryRef.current
      if (!el) return
      const startX = e.clientX
      const startY = e.clientY
      const { x: ox, y: oy, w: cw, h: ch } = dimsRef.current

      const onMove = (ev: MouseEvent) => {
        const c = clampPos(
          ox + (ev.clientX - startX),
          oy + (ev.clientY - startY),
          cw,
          ch,
          el.clientWidth,
          el.clientHeight,
        )
        setX(c.x)
        setY(c.y)
      }
      const onUp = () => {
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
      document.body.style.cursor = "move"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [boundaryRef],
  )

  const startResize = useCallback(
    (edge: ResizeEdge) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = boundaryRef.current
      if (!el) return
      const startX = e.clientX
      const startY = e.clientY
      const { x: sx, y: sy, w: sw, h: sh } = dimsRef.current

      const cursors: Record<ResizeEdge, string> = {
        se: "nwse-resize",
        sw: "nesw-resize",
        s: "s-resize",
        w: "w-resize",
      }

      const onMove = (ev: MouseEvent) => {
        const bw = el.clientWidth
        const bh = el.clientHeight
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY

        let nx = sx
        let ny = sy
        let nw = sw
        let nh = sh

        if (edge === "se") {
          nw = sw + dx
          nh = sh + dy
        } else if (edge === "sw") {
          nx = sx + dx
          nw = sw - dx
          nh = sh + dy
        } else if (edge === "s") {
          nh = sh + dy
        } else if (edge === "w") {
          nx = sx + dx
          nw = sw - dx
        }

        nw = Math.min(MAX_W, Math.max(MIN_W, nw))
        nh = Math.max(MIN_H, nh)

        if (edge === "sw" || edge === "w") {
          const maxNx = sx + sw - MIN_W
          nx = Math.max(PAD, Math.min(nx, maxNx))
          nw = sx + sw - nx
          nw = Math.min(MAX_W, Math.max(MIN_W, nw))
          nx = sx + sw - nw
        }

        const maxW = bw - nx - PAD
        const maxH = bh - ny - PAD
        nw = Math.min(nw, Math.max(MIN_W, maxW))
        nh = Math.min(nh, Math.max(MIN_H, maxH))

        const clamped = clampPos(nx, ny, nw, nh, bw, bh)
        setX(clamped.x)
        setY(clamped.y)
        setW(nw)
        setH(nh)
      }
      const onUp = () => {
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
      document.body.style.cursor = cursors[edge]
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [boundaryRef],
  )

  return (
    <div
      className="absolute z-20 flex flex-col overflow-hidden rounded-lg border bg-card shadow-lg"
      style={{ left: x, top: y, width: w, height: h }}
    >
      <div
        className="flex shrink-0 cursor-move items-center justify-between border-b px-2 py-1.5"
        onMouseDown={startMove}
      >
        <span className="text-xs font-semibold text-muted-foreground">属性</span>
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation()
            onClose()
          }}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="收起"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {asset ? (
          <PropertyAsset
            asset={asset}
            isInProject={isInProject}
            onToggleFavorite={onToggleFavorite}
            onToggleProject={onToggleProject}
            onDelete={onDelete}
          />
        ) : (
          <p className="text-xs text-muted-foreground">选择素材以查看属性</p>
        )}
      </div>

      <div
        role="presentation"
        className="absolute bottom-3 left-0 top-7 w-1.5 cursor-w-resize"
        onMouseDown={startResize("w")}
      />
      <div
        role="presentation"
        className="absolute bottom-0 left-3 right-3 h-1.5 cursor-s-resize"
        onMouseDown={startResize("s")}
      />
      <div
        role="presentation"
        className="absolute bottom-0 left-0 size-3 cursor-nesw-resize"
        onMouseDown={startResize("sw")}
      />
      <div
        role="presentation"
        className="absolute bottom-0 right-0 size-3 cursor-nwse-resize"
        onMouseDown={startResize("se")}
      />
    </div>
  )
}
