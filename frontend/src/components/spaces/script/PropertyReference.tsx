import { HeartIcon, MessageCircleIcon, EyeIcon, ShareIcon, BookmarkIcon } from "lucide-react"
import type { ScriptReference } from "@/types/product"

function formatCount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground w-16">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  )
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-xs leading-relaxed">{text}</p>
    </div>
  )
}

interface PropertyReferenceProps {
  reference: ScriptReference
}

export default function PropertyReference({ reference }: PropertyReferenceProps) {
  const stats = [
    { icon: <EyeIcon className="size-3.5" />, label: "播放", value: reference.view_count },
    { icon: <HeartIcon className="size-3.5" />, label: "点赞", value: reference.like_count },
    { icon: <MessageCircleIcon className="size-3.5" />, label: "评论", value: reference.comment_count },
    { icon: <BookmarkIcon className="size-3.5" />, label: "收藏", value: reference.collect_count },
    { icon: <ShareIcon className="size-3.5" />, label: "分享", value: reference.share_count },
  ]

  return (
    <div className="space-y-4">
      {reference.thumbnail && (
        <img src={`/media/${reference.thumbnail}`} alt={reference.title ?? ""} className="w-full rounded-lg" />
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {stats.map((s) => (
          <span key={s.label} className="flex items-center gap-1 text-muted-foreground">
            {s.icon}
            <span>{formatCount(s.value)}</span>
          </span>
        ))}
      </div>

      <div className="space-y-2 text-xs">
        {reference.title && <Row label="标题" value={reference.title} />}
        {reference.mediatype && <Row label="类型" value={reference.mediatype} />}
        {reference.origin_url && (
          <div className="flex gap-2">
            <span className="shrink-0 text-muted-foreground w-16">来源</span>
            <a href={reference.origin_url} target="_blank" rel="noreferrer" className="text-primary underline break-all">
              查看原始链接
            </a>
          </div>
        )}
      </div>

      {reference.text_speech && <TextBlock label="口播文案" text={reference.text_speech} />}
      {reference.text_visual && <TextBlock label="画面描述" text={reference.text_visual} />}
      {reference.text_drama && <TextBlock label="分镜描述" text={reference.text_drama} />}
    </div>
  )
}
