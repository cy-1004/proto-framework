import { useState, useRef, useEffect } from "react"
import { Trash2Icon, PencilIcon } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export interface ChatSession {
  id: number
  task_id: number
  stage: string
  mode: string
  title: string | null
  created_at: string
}

interface SessionDrawerProps {
  sessions: ChatSession[]
  open: boolean
  onClose: () => void
  onSelect: (sessionId: number) => void
  onRename: (sessionId: number, title: string) => void
  onDelete: (sessionId: number) => void
}

function SessionItem({
  session,
  onSelect,
  onRename,
  onDelete,
  onClose,
}: {
  session: ChatSession
  onSelect: (id: number) => void
  onRename: (id: number, title: string) => void
  onDelete: (id: number) => void
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const displayTitle = session.title || `会话 #${session.id}`

  const commitRename = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== displayTitle) onRename(session.id, trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="w-full rounded-lg px-3 py-2">
        <input
          ref={inputRef}
          className="w-full rounded border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename()
            if (e.key === "Escape") setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      className="group relative w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
      onClick={() => {
        onSelect(session.id)
        onClose()
      }}
    >
      <p className="pr-14 text-xs font-medium truncate">{displayTitle}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {session.mode} · {new Date(session.created_at).toLocaleString()}
      </p>
      <span
        role="button"
        tabIndex={0}
        className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-accent-foreground group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          setDraft(displayTitle)
          setEditing(true)
        }}
        onKeyDown={() => {}}
      >
        <PencilIcon className="size-3" />
      </span>
      <span
        role="button"
        tabIndex={0}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          if (window.confirm(`确定删除会话「${displayTitle}」？`)) onDelete(session.id)
        }}
        onKeyDown={() => {}}
      >
        <Trash2Icon className="size-3" />
      </span>
    </button>
  )
}

export default function SessionDrawer({
  sessions,
  open,
  onClose,
  onSelect,
  onRename,
  onDelete,
}: SessionDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>历史会话</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-0.5 px-4">
          {sessions.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">暂无会话记录</p>
          ) : (
            sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onClose={onClose}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
