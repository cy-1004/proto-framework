import { useState, useMemo } from "react"
import { Search, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { VOICE_GROUPS, findVoice, type VoiceEntry } from "./voiceData"

interface Props {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}

const GENDER_LABEL = {
  male: { text: "男", cls: "text-blue-500 bg-blue-50 dark:bg-blue-950/40" },
  female: { text: "女", cls: "text-pink-500 bg-pink-50 dark:bg-pink-950/40" },
  neutral: { text: "中", cls: "text-muted-foreground bg-muted" },
}

export default function VoicePickerModal({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState("zh")
  const [search, setSearch] = useState("")
  const [pending, setPending] = useState(value)

  const currentVoice = findVoice(value)
  const displayName = currentVoice ? currentVoice.name : value || "请选择音色"

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    return VOICE_GROUPS.flatMap(g =>
      g.voices.filter(v => v.name.toLowerCase().includes(q) || v.id.toLowerCase().includes(q))
    )
  }, [search])

  const displayedVoices: VoiceEntry[] = searchResults
    ?? (VOICE_GROUPS.find(g => g.key === tab)?.voices ?? [])

  function handleOpen(o: boolean) {
    if (o) { setPending(value); setSearch("") }
    setOpen(o)
  }

  function handleConfirm() {
    onChange(pending)
    setOpen(false)
  }

  const pendingVoice = findVoice(pending)

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <button
          disabled={disabled}
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <span className={currentVoice ? "text-foreground" : "text-muted-foreground"}>
            {displayName}
          </span>
          {currentVoice && (
            <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${GENDER_LABEL[currentVoice.gender].cls}`}>
              {GENDER_LABEL[currentVoice.gender].text}
            </span>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="flex h-[600px] w-full max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-3.5">
          <DialogTitle className="text-base">选择音色</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="shrink-0 px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索音色名称..."
              className="w-full rounded-md border border-input bg-muted/40 py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Language tabs */}
        {!search.trim() && (
          <div className="shrink-0 border-b px-4">
            <div className="flex gap-0">
              {VOICE_GROUPS.map(g => (
                <button
                  key={g.key}
                  onClick={() => setTab(g.key)}
                  className={`relative flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                    tab === g.key
                      ? "border-primary font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                    tab === g.key ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {g.voices.length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {displayedVoices.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">未找到匹配的音色</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {displayedVoices.map(v => {
                const isSelected = pending === v.id
                const g = GENDER_LABEL[v.gender]
                return (
                  <button
                    key={v.id}
                    onClick={() => setPending(v.id)}
                    className={`relative flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/8 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${g.cls}`}>
                      {g.text}
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-snug [word-break:break-all] line-clamp-2">
                      {v.name}
                    </span>
                    {isSelected && (
                      <Check className="absolute right-2 top-2 size-3.5 shrink-0 text-primary" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t bg-muted/20 px-5 py-3">
          <span className="text-sm text-muted-foreground">
            {pendingVoice
              ? <><span className="font-medium text-foreground">{pendingVoice.name}</span></>
              : "未选择"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleConfirm} disabled={!pending}>确认</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
