import { SparklesIcon, ImageIcon, AlertCircleIcon, VideoIcon, DownloadIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import type { Asset } from "@/types/asset"

export interface GenerateResult {
  id: number
  type: "generate_result"
  prompt: string
  provider: string
  loading: boolean
  assets: Asset[]
  errors: string[]
  job_id?: string
  progress?: number
  progressMessage?: string
}

interface GenerateResultCardProps {
  data: GenerateResult
  selectedAssetId?: string
  onSelectAsset?: (asset: Asset) => void
}

function isPortrait(asset: Asset): boolean {
  return !!(asset.width && asset.height && asset.width > 0 && asset.height > 0 && asset.height > asset.width)
}

function getAspectStyle(asset: Asset): string {
  if (asset.width && asset.height && asset.width > 0 && asset.height > 0) {
    const ar = asset.width / asset.height
    if (ar < 1) return "aspect-[9/16]"
  }
  return "aspect-video"
}

function AssetThumb({ asset, selected, onClick }: { asset: Asset; selected: boolean; onClick: () => void }) {
  const { enableDownload } = useAuth()
  const portrait = isPortrait(asset)
  const aspectCls = getAspectStyle(asset)
  const thumb = asset.thumbnail || (asset.mediatype === "image" ? asset.uri : null)
  const isVideo = asset.mediatype === "video"
  const canDownload = enableDownload && asset.uri && (asset.mediatype === "image" || asset.mediatype === "video")

  return (
    <button
      type="button"
      className={cn(
        "group/thumb relative flex flex-col rounded-lg border bg-background p-1.5 text-left transition-colors hover:bg-accent/50",
        portrait && "items-center",
        selected && "border-primary ring-1 ring-primary",
      )}
      onClick={onClick}
    >
      <div className={cn("relative mb-1 w-full overflow-hidden rounded", portrait && "flex justify-center")}>
        {thumb ? (
          <img
            src={`/media/${thumb}`}
            alt={asset.name_cn || asset.name}
            className={cn(
              "rounded object-cover",
              portrait ? `${aspectCls} w-auto max-h-[200px]` : `${aspectCls} w-full`,
            )}
          />
        ) : (
          <div className={cn("flex items-center justify-center rounded bg-muted", portrait ? `${aspectCls} w-auto max-h-[200px]` : `${aspectCls} w-full`)}>
            <ImageIcon className="size-5 text-muted-foreground/40" />
          </div>
        )}
        {isVideo && (
          <span className="absolute left-1 top-1 rounded bg-black/55 p-0.5 text-white">
            <VideoIcon className="size-2.5" />
          </span>
        )}
      </div>
      {canDownload && (
        <a
          href={`/media/${asset.uri}`}
          download
          className="absolute bottom-1 right-1 rounded bg-black/50 p-0.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/thumb:opacity-100"
          onClick={(e) => e.stopPropagation()}
          title="下载"
        >
          <DownloadIcon className="size-3" />
        </a>
      )}
      <span className="w-full truncate text-[10px] leading-tight">{asset.name_cn || asset.name}</span>
    </button>
  )
}

export default function GenerateResultCard({ data, selectedAssetId, onSelectAsset }: GenerateResultCardProps) {
  const hasAssets = data.assets.length > 0
  const hasErrors = data.errors.length > 0
  const progress = data.progress ?? 0

  const allPortrait = hasAssets && data.assets.every(isPortrait)
  const count = data.assets.length
  const gridCols = allPortrait && count > 1
    ? count === 2 ? "grid-cols-2" : count === 3 ? "grid-cols-3" : "grid-cols-4"
    : "grid-cols-2"

  return (
    <div className="w-full rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <SparklesIcon className="size-3.5 text-primary" />
        <span className="text-xs font-medium truncate flex-1">{data.prompt}</span>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
          {data.provider}
        </span>
      </div>

      {data.loading ? (
        <div className="px-3 py-4 space-y-2">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60 transition-all duration-500 ease-out"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {data.progressMessage || "准备中..."}
            </span>
            <span className="text-[10px] text-muted-foreground/60">{progress}%</span>
          </div>
        </div>
      ) : !hasAssets && !hasErrors ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          未生成任何结果
        </div>
      ) : (
        <div className="px-3 py-2">
          {hasAssets && (
            <>
              <div className="mb-1.5 flex items-center gap-1.5">
                <ImageIcon className="size-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground">生成结果</span>
                <span className="text-[10px] text-muted-foreground/60">({data.assets.length})</span>
              </div>
              <div className={cn("grid gap-1.5", gridCols)}>
                {data.assets.map((asset) => (
                  <AssetThumb
                    key={asset.id}
                    asset={asset}
                    selected={selectedAssetId === asset.id}
                    onClick={() => onSelectAsset?.(asset)}
                  />
                ))}
              </div>
            </>
          )}

          {hasErrors && (
            <div className="mt-2 flex flex-col gap-1">
              {data.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
                  <AlertCircleIcon className="mt-0.5 size-3 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
