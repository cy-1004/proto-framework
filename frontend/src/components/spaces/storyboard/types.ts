export type PortDirection = "top" | "right" | "bottom" | "left"

export interface Connection {
  id: string
  fromAssetId: string
  fromPort: PortDirection
  toAssetId: string
  toPort: PortDirection
  toPortIndex?: number
}

export interface PortDragState {
  fromAssetId: string
  fromPort: PortDirection
  fromAssetType?: string
  startX: number
  startY: number
  cursorX: number
  cursorY: number
}

export const COMPATIBLE_PORT: Record<PortDirection, PortDirection> = {
  bottom: "top",
  top: "bottom",
  right: "left",
  left: "right",
}

export function isPortOccupied(
  connections: Connection[],
  assetId: string,
  port: PortDirection,
  portIndex?: number,
): boolean {
  return connections.some((c) => {
    if (c.fromAssetId === assetId && c.fromPort === port) return true
    if (c.toAssetId === assetId && c.toPort === port) {
      if (portIndex !== undefined) return c.toPortIndex === portIndex
      return true
    }
    return false
  })
}

export function isNarationPortOccupied(
  connections: Connection[],
  assetId: string,
  portIndex: number,
): boolean {
  return connections.some(
    (c) => c.toAssetId === assetId && c.toPort === "top" && c.toPortIndex === portIndex,
  )
}

export function pairHasConnection(
  connections: Connection[],
  assetIdA: string,
  assetIdB: string,
): boolean {
  return connections.some(
    (c) =>
      (c.fromAssetId === assetIdA && c.toAssetId === assetIdB) ||
      (c.fromAssetId === assetIdB && c.toAssetId === assetIdA),
  )
}
