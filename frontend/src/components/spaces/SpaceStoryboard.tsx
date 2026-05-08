import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch } from "@/lib/api"
import type { TaskAssetItem, TaskAssetItemRaw, CanvasConfig } from "@/types/taskAsset"
import type { Asset } from "@/types/asset"
import { computeCardSize } from "./storyboard/CanvasCard"
import CanvasAsset, { type CanvasAssetHandle } from "./storyboard/CanvasAsset"
import PanelAsset from "./storyboard/PanelAsset"
import FloatPropertyAsset from "./library/FloatPropertyAsset"

interface SpaceStoryboardProps {
  taskId: number
  onSelectAsset?: (asset: Asset) => void
  onDeselectAsset?: () => void
  selectedAssetId?: string
  showFloatProperty?: boolean
  onCloseFloat?: () => void
  floatAsset?: Asset | null
  onExportReady?: (exportFn: () => Promise<void>) => void
}

function mergeItemsWithConfig(
  raw: TaskAssetItemRaw[],
  cfg: CanvasConfig | null,
): TaskAssetItem[] {
  const cardMap = new Map(cfg?.cards?.map((c) => [c.asset_id, c]))
  let nextX = 80
  return raw.map((r) => {
    const cc = cardMap?.get(r.asset_id)
    if (cc) {
      return { ...r, x: cc.x, y: cc.y, w: cc.w, h: cc.h }
    }
    const sz = computeCardSize(r.asset)
    const item = { ...r, x: nextX, y: 60, w: sz.w, h: sz.h }
    nextX += sz.w + 40
    return item
  })
}

export default function SpaceStoryboard({
  taskId,
  onSelectAsset,
  onDeselectAsset,
  selectedAssetId,
  showFloatProperty,
  onCloseFloat,
  floatAsset = null,
  onExportReady,
}: SpaceStoryboardProps) {
  const canvasRef = useRef<CanvasAssetHandle>(null)
  const [items, setItems] = useState<TaskAssetItem[]>([])
  const [panelOpen, setPanelOpen] = useState(true)
  const boundaryRef = useRef<HTMLDivElement>(null)
  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig | null>(null)
  const configLoadedRef = useRef(false)

  const handleSelectAsset = useCallback((assetId: string) => {
    const item = items.find((it) => it.asset_id === assetId)
    if (item) onSelectAsset?.(item.asset)
  }, [items, onSelectAsset])

  const selectAndCenter = useCallback((assetId: string) => {
    handleSelectAsset(assetId)
    canvasRef.current?.centerOnAsset(assetId)
  }, [handleSelectAsset])

  const canvasConfigRef = useRef(canvasConfig)
  canvasConfigRef.current = canvasConfig

  const loadAssets = useCallback(() => {
    Promise.all([
      apiFetch(`/api/tasks/${taskId}/assets`).then((r) => r.json()).catch(() => []),
      apiFetch(`/api/tasks/${taskId}/narations`).then((r) => r.json()).catch(() => []),
    ]).then(([assets, narations]: [TaskAssetItemRaw[], TaskAssetItemRaw[]]) => {
      setItems(mergeItemsWithConfig([...assets, ...narations], canvasConfigRef.current))
    }).catch(console.error)
  }, [taskId])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiFetch(`/api/tasks/${taskId}/canvas_config`).then((r) => r.json()).catch(() => null),
      apiFetch(`/api/tasks/${taskId}/assets`).then((r) => r.json()).catch(() => []),
      apiFetch(`/api/tasks/${taskId}/narations`).then((r) => r.json()).catch(() => []),
    ]).then(([cfg, assets, narations]: [CanvasConfig | null, TaskAssetItemRaw[], TaskAssetItemRaw[]]) => {
      if (cancelled) return
      const validCfg = cfg && cfg.cards?.length ? cfg : null
      setCanvasConfig(validCfg)
      setItems(mergeItemsWithConfig([...assets, ...narations], validCfg))
      if (validCfg && !configLoadedRef.current) {
        configLoadedRef.current = true
        requestAnimationFrame(() => {
          canvasRef.current?.loadCanvasConfig(validCfg)
        })
      }
    })
    return () => { cancelled = true }
  }, [taskId])

  useEffect(() => {
    const handler = () => loadAssets()
    window.addEventListener("assets-updated", handler)
    return () => window.removeEventListener("assets-updated", handler)
  }, [loadAssets])

  useEffect(() => {
    if (!onExportReady) return
    onExportReady(() => canvasRef.current?.exportSourceGraph() ?? Promise.resolve())
  }, [onExportReady])

  const onItemUpdated = useCallback((updated: TaskAssetItem) => {
    setItems((prev) => prev.map((row) => (row.link_id === updated.link_id ? { ...row, ...updated } : row)))
  }, [])

  const onRemoveAsset = useCallback(
    async (assetId: string) => {
      const item = items.find((it) => it.asset_id === assetId)
      if (!item) return
      const isNar = item.asset.type === "naration"
      const url = isNar
        ? `/api/tasks/${taskId}/narations/${assetId}`
        : `/api/tasks/${taskId}/assets/${assetId}`
      try {
        const res = await apiFetch(url, { method: "DELETE" })
        if (!res.ok) return
        setItems((prev) => prev.filter((row) => row.asset_id !== assetId))
      } catch { /* ignore */ }
    },
    [taskId, items],
  )

  const onToggleCanvas = useCallback(
    async (assetId: string) => {
      const item = items.find((it) => it.asset_id === assetId)
      if (!item) return
      const isNar = item.asset.type === "naration"
      const url = isNar
        ? `/api/tasks/${taskId}/narations/${assetId}/on_canvas`
        : `/api/tasks/${taskId}/assets/${assetId}/on_canvas`
      try {
        const res = await apiFetch(url, { method: "PATCH" })
        if (!res.ok) return
        const updated = await res.json()
        setItems((prev) => prev.map((row) => {
          if (row.asset_id !== assetId) return row
          return { ...row, on_canvas: updated.on_canvas }
        }))
      } catch { /* ignore */ }
    },
    [taskId, items],
  )

  const handleToggleFavorite = useCallback(async () => {
    if (!floatAsset) return
    try {
      const res = await apiFetch(`/api/assets/${floatAsset.id}/favorite`, { method: "PATCH" })
      if (!res.ok) return
      const updated: Asset = await res.json()
      onSelectAsset?.(updated)
      window.dispatchEvent(new Event("assets-updated"))
    } catch { /* ignore */ }
  }, [floatAsset, onSelectAsset])


  const assetItems = useMemo(() => items.filter((it) => it.asset.type !== "naration"), [items])
  const narationItems = useMemo(() => items.filter((it) => it.asset.type === "naration"), [items])

  return (
    <div ref={boundaryRef} className="relative flex h-full min-h-0 w-full">
      {showFloatProperty && onCloseFloat && (
        <FloatPropertyAsset
          boundaryRef={boundaryRef}
          asset={floatAsset}
          onClose={onCloseFloat}
          onToggleFavorite={floatAsset ? handleToggleFavorite : undefined}
        />
      )}
      <PanelAsset
        open={panelOpen}
        onToggle={() => setPanelOpen((v) => !v)}
        assetItems={assetItems}
        narationItems={narationItems}
        selectedAssetId={selectedAssetId}
        onSelectAsset={selectAndCenter}
        onRemoveAsset={onRemoveAsset}
        onToggleCanvas={onToggleCanvas}
      />
      <CanvasAsset
        ref={canvasRef}
        taskId={taskId}
        items={items}
        selectedAssetId={selectedAssetId}
        onSelectAsset={handleSelectAsset}
        onDeselectAsset={onDeselectAsset}
        onItemUpdated={onItemUpdated}
        cardConfigs={canvasConfig?.cards}
      />
    </div>
  )
}
