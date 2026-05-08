import { HeartIcon, ImageIcon, VideoIcon, Volume2Icon, ScrollTextIcon, FolderCheckIcon, FolderPlusIcon, DownloadIcon } from "lucide-react"
import type { Asset } from "@/types/asset"
import { useAuth } from "@/contexts/AuthContext"
import scriptImg from "@/assets/script.png"

const MEDIA_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: VideoIcon,
  audio: Volume2Icon,
}

interface CardAssetProps {
  asset: Asset
  selected?: boolean
  isInProject?: boolean
  onClick?: () => void
  onToggleFavorite?: () => void
  onToggleProject?: () => void
}

export default function CardAsset({
  asset,
  selected,
  isInProject,
  onClick,
  onToggleFavorite,
  onToggleProject,
}: CardAssetProps) {
  const { enableDownload } = useAuth()
  const Icon = asset.type === "naration" ? ScrollTextIcon : asset.mediatype ? MEDIA_ICON[asset.mediatype] : null
  const isFav = asset.favorite === "1"
  const canDownload = enableDownload && asset.uri && (asset.mediatype === "image" || asset.mediatype === "video")

  return (
    <div
      className={`group cursor-pointer overflow-hidden rounded-lg border transition-colors ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
      }`}
      onClick={onClick}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {asset.type === "naration" ? (
          <img src={scriptImg} alt={asset.name_cn} className="h-full w-full object-contain p-4" />
        ) : asset.mediatype === "audio" ? (
          <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
            {asset.desc || asset.name_cn}
          </div>
        ) : asset.thumbnail ? (
          <img
            src={`/media/${asset.thumbnail}`}
            alt={asset.name_cn}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-8" />
          </div>
        )}
        {Icon && (
          <div className="absolute left-1.5 top-1.5 rounded bg-black/50 p-1 text-white">
            <Icon className="size-3" />
          </div>
        )}

        <div className="absolute bottom-1 right-1 flex flex-col gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {canDownload && (
            <a
              href={`/media/${asset.uri}`}
              download
              className="rounded bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
              onClick={(e) => e.stopPropagation()}
              title="下载"
            >
              <DownloadIcon className="size-3.5" />
            </a>
          )}
          <button
            type="button"
            className="rounded bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite?.()
            }}
            title={isFav ? "取消收藏" : "收藏"}
          >
            <HeartIcon
              className={`size-3.5 ${isFav ? "fill-red-500 text-red-500" : ""}`}
            />
          </button>
          <button
            type="button"
            className="rounded bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
            onClick={(e) => {
              e.stopPropagation()
              onToggleProject?.()
            }}
            title={isInProject ? "从项目移除" : "添加到项目"}
          >
            {isInProject ? (
              <FolderCheckIcon className="size-3.5 text-green-400" />
            ) : (
              <FolderPlusIcon className="size-3.5" />
            )}
          </button>
        </div>
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-medium">{asset.name}</p>
      </div>
    </div>
  )
}
