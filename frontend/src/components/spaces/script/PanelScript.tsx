import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, Trash2Icon, ScrollTextIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Narration {
  id: string
  title: string
  content: string
  tts_done: string
  duration: number | null
  created_at: string
}

interface PanelScriptProps {
  open: boolean
  onToggle: () => void
  narrations: Narration[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete?: (id: string) => void
  onAdd?: () => void
}

function NarrationItem({
  n,
  selected,
  onSelect,
  onDelete,
}: {
  n: Narration
  selected: boolean
  onSelect: (id: string) => void
  onDelete?: (id: string) => void
}) {
  return (
    <li className="group/item relative mb-1.5">
      <button
        type="button"
        onClick={() => onSelect(n.id)}
        className={cn(
          "flex w-full gap-2 rounded-lg border p-2.5 text-left transition-colors",
          selected
            ? "border-primary ring-2 ring-primary/25"
            : "border-border hover:border-primary/40",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ScrollTextIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{n.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
            {n.content || "暂无内容"}
          </p>
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-white group-hover/item:opacity-100"
          title="删除"
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm("确定删除该旁白？")) onDelete(n.id)
          }}
        >
          <Trash2Icon className="size-3" />
        </button>
      )}
    </li>
  )
}

export default function PanelScript({
  open,
  onToggle,
  narrations,
  selectedId,
  onSelect,
  onDelete,
  onAdd,
}: PanelScriptProps) {
  return (
    <div className="relative flex h-full shrink-0">
      {open && (
        <aside className="flex w-[240px] flex-col border-r bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">
              旁白
              {narrations.length > 0 && (
                <span className="ml-1 text-[10px] opacity-60">{narrations.length}</span>
              )}
            </span>
            <div className="flex items-center gap-0.5">
              {onAdd && (
                <button
                  type="button"
                  onClick={onAdd}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="新建旁白"
                >
                  <PlusIcon className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onToggle}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="收起面板"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {narrations.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                暂无旁白
              </li>
            ) : (
              narrations.map((n) => (
                <NarrationItem
                  key={n.id}
                  n={n}
                  selected={selectedId === n.id}
                  onSelect={onSelect}
                  onDelete={onDelete}
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
            aria-label="展开旁白面板"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
