import { SearchIcon, ImageIcon, VideoIcon, Volume2Icon, FileTextIcon, HeartIcon, FolderPlusIcon, FolderCheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Asset } from "@/types/asset"

export interface SearchResult {
  id: number
  type: "search_result"
  query: string
  filterType: string
  loading: boolean
  results: Record<string, Asset[]>
}

const TYPE_META: Record<string, { label: string; icon: typeof ImageIcon }> = {
  image: { label: "图片", icon: ImageIcon },
  video: { label: "视频", icon: VideoIcon },
  audio: { label: "音频", icon: Volume2Icon },
  reference: { label: "参考", icon: FileTextIcon },
}

interface SearchResultCardProps {
  data: SearchResult
  selectedAssetId?: string
  taskAssetIds?: Set<string>
  onSelectAsset?: (asset: Asset) => void
  onToggleFavorite?: (asset: Asset) => void
  onToggleProject?: (asset: Asset) => void
}

export default function SearchResultCard({ data, selectedAssetId, taskAssetIds, onSelectAsset, onToggleFavorite, onToggleProject }: SearchResultCardProps) {
  const typeEntries = Object.entries(data.results).filter(([, assets]) => assets.length > 0)
  const hasResults = typeEntries.length > 0

  return (
    <div className="w-full rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <SearchIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium truncate">{data.query}</span>
        {data.filterType !== "all" && (
          <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
            {TYPE_META[data.filterType]?.label ?? data.filterType}
          </span>
        )}
      </div>

      {/* Body */}
      {data.loading ? (
        <div className="flex items-center justify-center gap-2 px-3 py-6">
          <span className="inline-flex gap-1">
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
          </span>
          <span className="text-xs text-muted-foreground">搜索中...</span>
        </div>
      ) : !hasResults ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          未找到匹配的素材
        </div>
      ) : (
        <div className="divide-y divide-border">
          {typeEntries.map(([type, assets]) => {
            const meta = TYPE_META[type]
            if (!meta) return null
            const Icon = meta.icon

            return (
              <div key={type} className="px-3 py-2">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Icon className="size-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">{meta.label}</span>
                  <span className="text-[10px] text-muted-foreground/60">({assets.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {assets.map((asset) => {
                    const isFav = asset.favorite === "1"
                    const isInProject = taskAssetIds?.has(asset.id)
                    return (
                      <div
                        key={asset.id}
                        className={cn(
                          "group/card relative flex flex-col rounded-lg border bg-background p-1.5 text-left transition-colors hover:bg-accent/50 cursor-pointer",
                          selectedAssetId === asset.id && "border-primary ring-1 ring-primary",
                        )}
                        onClick={() => onSelectAsset?.(asset)}
                      >
                        <div className="relative mb-1">
                          {asset.thumbnail ? (
                            <img
                              src={`/media/${asset.thumbnail}`}
                              alt={asset.name_cn || asset.name}
                              className="aspect-square w-full rounded object-cover"
                            />
                          ) : (
                            <div className="flex aspect-square w-full items-center justify-center rounded bg-muted">
                              <Icon className="size-5 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="absolute bottom-0.5 right-0.5 flex flex-col gap-0.5 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100">
                            <button
                              type="button"
                              className="rounded bg-black/50 p-0.5 text-white transition-colors hover:bg-black/70"
                              onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(asset) }}
                              title={isFav ? "取消收藏" : "收藏"}
                            >
                              <HeartIcon className={cn("size-3", isFav && "fill-red-500 text-red-500")} />
                            </button>
                            <button
                              type="button"
                              className="rounded bg-black/50 p-0.5 text-white transition-colors hover:bg-black/70"
                              onClick={(e) => { e.stopPropagation(); onToggleProject?.(asset) }}
                              title={isInProject ? "从项目移除" : "添加到项目"}
                            >
                              {isInProject
                                ? <FolderCheckIcon className="size-3 text-green-400" />
                                : <FolderPlusIcon className="size-3" />
                              }
                            </button>
                          </div>
                        </div>
                        <span className="truncate text-[10px] leading-tight">{asset.name_cn || asset.name}</span>
                        <span className="text-[9px] text-muted-foreground/60">
                          {((asset as Asset & { search_score?: number }).search_score ?? asset.score).toFixed(4)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
