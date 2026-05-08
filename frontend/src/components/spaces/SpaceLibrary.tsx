import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "react-router-dom"
import { apiFetch } from "@/lib/api"
import type { Asset } from "@/types/asset"
import type { TaskAssetItem } from "@/types/taskAsset"
import LibraryNav from "./library/LibraryNav"
import LibraryList from "./library/LibraryList"
import ModalUploadAsset from "./library/ModalUploadAsset"
import FloatPropertyAsset from "./library/FloatPropertyAsset"
import { computeCardSize } from "./storyboard/CanvasCard"
import { LIBRARY_CONFIG } from "@/config/options"

const CANVAS_W = 2400
const CANVAS_H = 1600
const GAP_X = 260
const GAP_Y = 40

function findNonOverlappingPosition(
  existing: TaskAssetItem[],
  cardW: number,
  cardH: number,
): { x: number; y: number } {
  const cols = Math.floor((CANVAS_W - 100) / GAP_X)
  const rows = Math.floor((CANVAS_H - 100) / GAP_Y)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 100 + c * GAP_X
      const y = 100 + r * GAP_Y
      const overlaps = existing.some(
        (it) => {
          const sz = computeCardSize(it.asset)
          return (
            x < it.x + sz.w &&
            x + cardW > it.x &&
            y < it.y + sz.h &&
            y + cardH > it.y
          )
        },
      )
      if (!overlaps) return { x, y }
    }
  }
  return { x: 100 + existing.length * 20, y: 100 + existing.length * 20 }
}

interface SpaceLibraryProps {
  taskId?: number
  onSelectAsset?: (asset: Asset) => void
  selectedAssetId?: string
  showFloatProperty?: boolean
  onCloseFloat?: () => void
  floatAsset?: Asset | null
}

const PAGE_LIMIT = LIBRARY_CONFIG.page_size

export default function SpaceLibrary({
  taskId,
  onSelectAsset,
  selectedAssetId,
  showFloatProperty,
  onCloseFloat,
  floatAsset = null,
}: SpaceLibraryProps) {
  const { category = "all" } = useParams()
  const [assets, setAssets] = useState<Asset[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [taskAssets, setTaskAssets] = useState<TaskAssetItem[]>([])
  const [taskAssetIds, setTaskAssetIds] = useState<Set<string>>(new Set())
  const boundaryRef = useRef<HTMLDivElement>(null)

  const buildQuery = useCallback((p: number) => {
    const params = new URLSearchParams({ page: String(p), limit: String(PAGE_LIMIT) })
    if (category === "favorite") params.set("favorite", "true")
    else if (category !== "all") params.set("type", category)
    return `/api/assets?${params}`
  }, [category])

  const loadAssets = useCallback((p: number) => {
    apiFetch(buildQuery(p))
      .then((r) => r.json())
      .then((data: { items: Asset[]; total: number; page: number }) => {
        setAssets(data.items)
        setTotal(data.total)
      })
      .catch(console.error)
  }, [buildQuery])

  const loadTaskAssets = useCallback(() => {
    if (taskId == null) return
    apiFetch(`/api/tasks/${taskId}/assets`)
      .then((r) => r.json())
      .then((items: TaskAssetItem[]) => {
        setTaskAssets(items)
        setTaskAssetIds(new Set(items.map((it) => it.asset_id)))
      })
      .catch(console.error)
  }, [taskId])

  useEffect(() => {
    setPage(1)
  }, [category])

  useEffect(() => {
    loadAssets(page)
  }, [loadAssets, page])

  useEffect(() => { loadTaskAssets() }, [loadTaskAssets])

  useEffect(() => {
    const handler = () => { loadAssets(page); loadTaskAssets() }
    window.addEventListener("assets-updated", handler)
    return () => window.removeEventListener("assets-updated", handler)
  }, [loadAssets, loadTaskAssets, page])

  const handleToggleFavorite = useCallback(async (asset: Asset) => {
    try {
      const res = await apiFetch(`/api/assets/${asset.id}/favorite`, { method: "PATCH" })
      if (!res.ok) return
      const updated: Asset = await res.json()
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      if (floatAsset?.id === updated.id) onSelectAsset?.(updated)
    } catch { /* ignore */ }
  }, [floatAsset, onSelectAsset])

  const handleToggleProject = useCallback(
    async (asset: Asset) => {
      if (taskId == null) return
      const inProject = taskAssetIds.has(asset.id)

      if (inProject) {
        if (!window.confirm("确定从项目中移除该素材？相关连接线也将清除。")) return
        try {
          const res = await apiFetch(`/api/tasks/${taskId}/assets/${asset.id}`, { method: "DELETE" })
          if (!res.ok) return
          setTaskAssets((prev) => prev.filter((it) => it.asset_id !== asset.id))
          setTaskAssetIds((prev) => {
            const next = new Set(prev)
            next.delete(asset.id)
            return next
          })
          window.dispatchEvent(new Event("assets-updated"))
        } catch { /* ignore */ }
      } else {
        try {
          const sz = computeCardSize(asset)
          const pos = findNonOverlappingPosition(taskAssets, sz.w, sz.h)
          const res = await apiFetch(`/api/tasks/${taskId}/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ asset_id: asset.id, x: pos.x, y: pos.y, w: sz.w, h: sz.h }),
          })
          if (!res.ok) return
          const item: TaskAssetItem = await res.json()
          setTaskAssets((prev) => [...prev, item])
          setTaskAssetIds((prev) => new Set(prev).add(asset.id))
          window.dispatchEvent(new Event("assets-updated"))
        } catch { /* ignore */ }
      }
    },
    [taskId, taskAssetIds, taskAssets],
  )

  const handleDeleteAsset = useCallback(async (asset: Asset) => {
    try {
      const res = await apiFetch(`/api/assets/${asset.id}`, { method: "DELETE" })
      if (!res.ok) return
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
      setTaskAssets((prev) => prev.filter((it) => it.asset_id !== asset.id))
      setTaskAssetIds((prev) => {
        const next = new Set(prev)
        next.delete(asset.id)
        return next
      })
      window.dispatchEvent(new CustomEvent("asset-deleted", { detail: asset.id }))
      window.dispatchEvent(new Event("assets-updated"))
    } catch { /* ignore */ }
  }, [])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadFiles(Array.from(files))
    setShowUploadModal(true)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  return (
    <div
      ref={boundaryRef}
      className="relative flex h-full flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {showFloatProperty && onCloseFloat && (
        <FloatPropertyAsset
          boundaryRef={boundaryRef}
          asset={floatAsset}
          onClose={onCloseFloat}
          isInProject={floatAsset ? taskAssetIds.has(floatAsset.id) : false}
          onToggleFavorite={floatAsset ? () => handleToggleFavorite(floatAsset) : undefined}
          onToggleProject={floatAsset ? () => handleToggleProject(floatAsset) : undefined}
          onDelete={floatAsset ? () => handleDeleteAsset(floatAsset) : undefined}
        />
      )}

      <LibraryNav>
        {/* <div
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-dashed border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloudIcon className="size-4" />
          上传
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ""
          }}
        /> */}
      </LibraryNav>

      <div className="flex-1 overflow-auto">
        <LibraryList
          assets={assets}
          total={total}
          page={page}
          limit={PAGE_LIMIT}
          selectedId={selectedAssetId}
          taskAssetIds={taskAssetIds}
          onSelect={(asset) => onSelectAsset?.(asset)}
          onToggleFavorite={handleToggleFavorite}
          onToggleProject={handleToggleProject}
          onPageChange={setPage}
        />
      </div>

      <ModalUploadAsset
        files={uploadFiles}
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
      />
    </div>
  )
}
