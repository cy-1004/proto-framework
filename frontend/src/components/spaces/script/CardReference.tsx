import { VideoIcon, MicIcon, FileTextIcon, ImageIcon } from "lucide-react"
import type { ScriptReference } from "@/types/product"

interface CardReferenceProps {
  reference: ScriptReference
  selected?: boolean
  onClick?: () => void
}

const MEDIA_ICON = {
  video: <VideoIcon className="size-4" />,
  audio: <MicIcon className="size-4" />,
  text: <FileTextIcon className="size-4" />,
} as const

export default function CardReference({ reference, selected, onClick }: CardReferenceProps) {
  return (
    <div
      className={`group cursor-pointer overflow-hidden rounded-lg border transition-colors ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
      }`}
      onClick={onClick}
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        {reference.thumbnail ? (
          <img src={`/media/${reference.thumbnail}`} alt={reference.title ?? ""} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {reference.mediatype ? MEDIA_ICON[reference.mediatype] : <ImageIcon className="size-8" />}
          </div>
        )}
        {reference.mediatype && (
          <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
            {reference.mediatype}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-medium">
          {reference.title || reference.text_speech?.slice(0, 30) || `参考 #${reference.id}`}
        </p>
      </div>
    </div>
  )
}
