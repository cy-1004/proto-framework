import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, EyeOffIcon, FolderMinusIcon, ImageIcon, ScrollTextIcon, UploadIcon, VideoIcon, Volume2Icon } from "lucide-react"
import { useState } from "react"
import type { TaskAssetItem } from "@/types/taskAsset"
import { cn } from "@/lib/utils"

const MEDIA_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: VideoIcon,
  audio: Volume2Icon,
}

interface PanelAssetProps {
  open: boolean
  onToggle: () => void
  assetItems: TaskAssetItem[]
  narationItems: TaskAssetItem[]
  selectedAssetId?: string | null
  onSelectAsset?: (assetId: string) => void
  onRemoveAsset?: (assetId: string) => void
  onToggleCanvas?: (assetId: string) => void
}

function UploadZone() {
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    console.log("dropped files:", e.dataTransfer.files)
  }

  return (
    <div className="px-2 pt-2">
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed py-3 text-muted-foreground transition-colors",
          dragging ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50 hover:text-foreground",
        )}
        onClick={() => console.log("upload zone clicked")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <UploadIcon className="size-4" />
        <span className="text-[11px]">上传素材</span>
      </label>
    </div>
  )
}

function AssetListItem({
  row,
  selected,
  onSelect,
  onRemove,
  onToggleCanvas,
}: {
  row: TaskAssetItem
  selected: boolean
  onSelect?: (id: string) => void
  onRemove?: (id: string) => void
  onToggleCanvas?: (id: string) => void
}) {
  const a = row.asset
  const isNaration = a.type === "naration"
  const Icon = isNaration ? ScrollTextIcon : a.mediatype ? MEDIA_ICON[a.mediatype] : null
  return (
    <li key={row.link_id} className="group/item relative mb-2">
      <button
        type="button"
        onClick={() => onSelect?.(a.id)}
        className={cn(
          "flex w-full gap-2 rounded-lg border p-2 text-left transition-colors",
          selected ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/40",
          row.on_canvas === "0" && "opacity-50",
        )}
      >
        <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
          {isNaration ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ScrollTextIcon className="size-5" />
            </div>
          ) : a.mediatype === "audio" ? (
            <div className="flex h-full items-center justify-center p-1 text-[10px] text-muted-foreground leading-tight">
              {a.name_cn.slice(0, 4)}
            </div>
          ) : a.thumbnail ? (
            <img src={`/media/${a.thumbnail}`} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-5" />
            </div>
          )}
          {Icon && !isNaration && (
            <span className="absolute left-0.5 top-0.5 rounded bg-black/55 p-0.5 text-white">
              <Icon className="size-2.5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{isNaration ? a.name : a.name_cn}</p>
          <p className="truncate text-[10px] text-muted-foreground">{isNaration ? "旁白" : a.subtype}</p>
        </div>
      </button>
      <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover/item:opacity-100">
        {onToggleCanvas && (
          <button
            type="button"
            className={cn(
              "rounded p-0.5 text-white",
              row.on_canvas === "1" ? "bg-primary/70 hover:bg-primary" : "bg-black/50 hover:bg-primary/70",
            )}
            title={row.on_canvas === "1" ? "从画布隐藏" : "显示到画布"}
            onClick={(e) => { e.stopPropagation(); onToggleCanvas(a.id) }}
          >
            {row.on_canvas === "1" ? <EyeIcon className="size-3" /> : <EyeOffIcon className="size-3" />}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="rounded bg-black/50 p-0.5 text-white hover:bg-destructive"
            title="从项目移除"
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm("确定从项目中移除？")) {
                onRemove(a.id)
              }
            }}
          >
            <FolderMinusIcon className="size-3" />
          </button>
        )}
      </div>
    </li>
  )
}

export default function PanelAsset({
  open,
  onToggle,
  assetItems,
  narationItems,
  selectedAssetId,
  onSelectAsset,
  onRemoveAsset,
  onToggleCanvas,
}: PanelAssetProps) {
  const [tab, setTab] = useState<"assets" | "narations">("assets")
  const currentItems = tab === "assets" ? assetItems : narationItems

  return (
    <div className="relative flex h-full shrink-0">
      {open && (
        <aside className="flex w-[240px] flex-col border-r bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setTab("assets")}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-semibold transition-colors",
                  tab === "assets"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                素材
                {assetItems.length > 0 && (
                  <span className="ml-1 text-[10px] opacity-60">{assetItems.length}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab("narations")}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-semibold transition-colors",
                  tab === "narations"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                旁白
                {narationItems.length > 0 && (
                  <span className="ml-1 text-[10px] opacity-60">{narationItems.length}</span>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="收起面板"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
          </div>
          {tab === "assets" && <UploadZone />}
          <ul className="flex-1 overflow-y-auto p-2">
            {currentItems.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                {tab === "assets" ? "暂无关联素材" : "暂无关联旁白"}
              </li>
            ) : (
              currentItems.map((row) => (
                <AssetListItem
                  key={row.link_id}
                  row={row}
                  selected={selectedAssetId === row.asset.id}
                  onSelect={onSelectAsset}
                  onRemove={onRemoveAsset}
                  onToggleCanvas={onToggleCanvas}
                />
              ))
            )}
          </ul>
        </aside>
      )}
      {!open && (
        <div className="flex w-10 shrink-0 flex-col items-center border-r bg-card py-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="展开素材面板"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
