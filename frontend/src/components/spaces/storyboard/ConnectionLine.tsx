import { useState } from "react"
import type { PortDirection } from "./types"

interface ConnectionLineProps {
  x1: number
  y1: number
  x2: number
  y2: number
  fromPort: PortDirection
  toPort: PortDirection
  isPreview?: boolean
  onDelete?: () => void
  onReconnect?: (e: React.PointerEvent<SVGPathElement>) => void
}

function getControlPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fromPort: PortDirection,
  toPort: PortDirection,
) {
  const axisDist =
    fromPort === "top" || fromPort === "bottom"
      ? Math.abs(y2 - y1)
      : Math.abs(x2 - x1)
  const euclid = Math.hypot(x2 - x1, y2 - y1)
  const minHandle = Math.min(20, axisDist * 0.5)
  const rawHandle = Math.max(axisDist * 0.35, euclid * 0.18)
  const handle = Math.min(Math.max(rawHandle, minHandle), 120)

  const dir: Record<PortDirection, [number, number]> = {
    top: [0, -1],
    bottom: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  }
  const [fdx, fdy] = dir[fromPort]
  const [tdx, tdy] = dir[toPort]

  return {
    cp1x: x1 + fdx * handle,
    cp1y: y1 + fdy * handle,
    cp2x: x2 + tdx * handle,
    cp2y: y2 + tdy * handle,
  }
}

function buildPath(
  x1: number, y1: number, x2: number, y2: number,
  fromPort: PortDirection, toPort: PortDirection,
): string {
  const { cp1x, cp1y, cp2x, cp2y } = getControlPoints(x1, y1, x2, y2, fromPort, toPort)
  return `M ${x1},${y1} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`
}

function bezierMidpoint(
  x1: number, y1: number, x2: number, y2: number,
  fromPort: PortDirection, toPort: PortDirection,
) {
  const { cp1x, cp1y, cp2x, cp2y } = getControlPoints(x1, y1, x2, y2, fromPort, toPort)
  const t = 0.5
  const mt = 1 - t
  const mx = mt ** 3 * x1 + 3 * mt ** 2 * t * cp1x + 3 * mt * t ** 2 * cp2x + t ** 3 * x2
  const my = mt ** 3 * y1 + 3 * mt ** 2 * t * cp1y + 3 * mt * t ** 2 * cp2y + t ** 3 * y2
  return { mx, my }
}

export default function ConnectionLine({
  x1, y1, x2, y2, fromPort, toPort, isPreview, onDelete, onReconnect,
}: ConnectionLineProps) {
  const [hovered, setHovered] = useState(false)
  const d = buildPath(x1, y1, x2, y2, fromPort, toPort)

  const isTimeline = fromPort === "left" || fromPort === "right"
  const lineColor = isTimeline ? "#22c55e" : "var(--primary)"

  if (isPreview) {
    return (
      <path
        d={d}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeOpacity={0.5}
        strokeDasharray="6 4"
        strokeLinecap="round"
      />
    )
  }

  const { mx, my } = bezierMidpoint(x1, y1, x2, y2, fromPort, toPort)
  const r = 10

  return (
    <g
      style={{ pointerEvents: "auto" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ pointerEvents: "stroke", cursor: onReconnect ? "grab" : "pointer" }}
        onPointerDown={(e) => {
          if (!onReconnect) return
          e.stopPropagation()
          e.preventDefault()
          onReconnect(e)
        }}
      />
      <path
        d={d}
        fill="none"
        stroke={lineColor}
        strokeWidth={hovered ? 3 : 2}
        strokeOpacity={0.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
        style={{ pointerEvents: "none" }}
      />
      {hovered && onDelete && (
        <g
          style={{ pointerEvents: "auto", cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <circle cx={mx} cy={my} r={r} fill="hsl(var(--destructive))" opacity={0.9} />
          <line x1={mx - 4} y1={my - 4} x2={mx + 4} y2={my + 4} stroke="white" strokeWidth={2} strokeLinecap="round" />
          <line x1={mx + 4} y1={my - 4} x2={mx - 4} y2={my + 4} stroke="white" strokeWidth={2} strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}
