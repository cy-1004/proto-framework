import type { Asset } from "@/types/asset"
import type { PortDirection } from "@/components/spaces/storyboard/types"

export interface TaskAssetItemRaw {
  link_id: number
  task_id: number
  asset_id: string
  on_canvas: "0" | "1"
  asset: Asset
}

export interface TaskAssetItem extends TaskAssetItemRaw {
  x: number
  y: number
  w: number
  h: number
}

export interface CanvasCardConfig {
  asset_id: string
  x: number
  y: number
  w: number
  h: number
  state?: Record<string, unknown>
}

export interface CanvasConnectionConfig {
  fromAssetId: string
  fromPort: PortDirection
  toAssetId: string
  toPort: PortDirection
  toPortIndex?: number
}

export interface CanvasConfig {
  viewport: { offsetX: number; offsetY: number; scale: number }
  cards: CanvasCardConfig[]
  connections: CanvasConnectionConfig[]
}
