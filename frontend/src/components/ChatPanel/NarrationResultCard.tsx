import { ScrollTextIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface NarrationResult {
  id: number
  type: "narration_result"
  prompt: string
  loading: boolean
  narration_id?: string
  title?: string
  error?: string
  /** Current pipeline progress message shown during loading. */
  progressMessage?: string
}

interface NarrationResultCardProps {
  data: NarrationResult
  /** Called when the success-state card is clicked. If omitted the card is not clickable. */
  onClick?: () => void
}

export default function NarrationResultCard({ data, onClick }: NarrationResultCardProps) {
  return (
    <div className="w-full rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ScrollTextIcon className="size-3" />
        <span>创建旁白</span>
      </div>

      {data.loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          <span>{data.progressMessage || "创建中..."}</span>
        </div>
      ) : data.error ? (
        <p className="text-xs text-destructive">{data.error}</p>
      ) : (
        <button
          type="button"
          disabled={!onClick}
          onClick={onClick}
          className={cn(
            "w-full rounded-lg border p-3 text-left transition-colors",
            "border-primary/20 bg-primary/5",
            onClick && "cursor-pointer hover:bg-primary/10 hover:border-primary/40",
          )}
        >
          <p className="text-xs font-medium">{data.title || "未命名旁白"}</p>
          <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
            {data.prompt}
          </p>
          {onClick && (
            <p className="mt-2 text-[10px] text-primary">点击查看脚本内容 →</p>
          )}
        </button>
      )}
    </div>
  )
}
