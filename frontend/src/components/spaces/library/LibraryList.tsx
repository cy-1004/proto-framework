import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { Asset } from "@/types/asset"
import CardAsset from "./CardAsset"

interface LibraryListProps {
  assets: Asset[]
  total: number
  page: number
  limit: number
  selectedId?: string
  taskAssetIds?: Set<string>
  onSelect: (asset: Asset) => void
  onToggleFavorite?: (asset: Asset) => void
  onToggleProject?: (asset: Asset) => void
  onPageChange: (page: number) => void
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | "...")[] = [1]
  if (current > 3) pages.push("...")
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push("...")
  pages.push(total)
  return pages
}

export default function LibraryList({
  assets,
  total,
  page,
  limit,
  selectedId,
  taskAssetIds,
  onSelect,
  onToggleFavorite,
  onToggleProject,
  onPageChange,
}: LibraryListProps) {
  const totalPages = Math.ceil(total / limit)

  if (assets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
        暂无素材
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {assets.map((asset) => (
          <CardAsset
            key={asset.id}
            asset={asset}
            selected={selectedId === asset.id}
            isInProject={taskAssetIds?.has(asset.id)}
            onClick={() => onSelect(asset)}
            onToggleFavorite={() => onToggleFavorite?.(asset)}
            onToggleProject={() => onToggleProject?.(asset)}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pb-2 pt-1">
          <button
            className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeftIcon className="size-4" />
          </button>

          {getPageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="flex size-7 items-center justify-center text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={p}
                className={`flex size-7 items-center justify-center rounded text-xs transition-colors ${
                  p === page
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            ),
          )}

          <button
            className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
