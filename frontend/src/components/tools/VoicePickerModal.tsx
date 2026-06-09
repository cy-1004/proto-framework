import { useState, useMemo } from "react"
import { Search, Check, User, Users } from "lucide-react"
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

const GENDER_ICON = {
  male: <User className="size-3 text-blue-400" />,
  female: <User className="size-3 text-pink-400" />,
  neutral: <Users className="size-3 text-muted-foreground" />,
}

export default function VoicePickerModal({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState("zh")
  const [search, setSearch] = useState("")
  const [pending, setPending] = useState(value)

  const currentVoice = findVoice(value)
  const displayName = currentVoice ? currentVoice.name : value || "请选择音色"

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return VOICE_GROUPS
    const q = search.toLowerCase()
    return VOICE_GROUPS.map(g => ({
      ...g,
      voices: g.voices.filter(
        v => v.name.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)
      ),
    })).filter(g => g.voices.length > 0)
  }, [search])

  const activeGroup = search.trim()
    ? filteredGroups[0]
    : VOICE_GROUPS.find(g => g.key === tab)

  const displayedVoices: VoiceEntry[] = search.trim()
    ? filteredGroups.flatMap(g => g.voices)
    : (activeGroup?.voices ?? [])

  function handleOpen(o: boolean) {
    if (o) setPending(value)
    setOpen(o)
  }

  function handleConfirm() {
    onChange(pending)
    setOpen(false)
  }

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
            <span className="ml-2 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {GENDER_ICON[currentVoice.gender]}
            </span>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="text-base">选择音色</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="shrink-0 border-b px-4 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索音色名称或 ID..."
              className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Language tabs */}
        {!search.trim() && (
          <div className="shrink-0 overflow-x-auto border-b">
            <div className="flex min-w-max gap-0 px-4">
              {VOICE_GROUPS.map(g => (
                <button
                  key={g.key}
                  onClick={() => setTab(g.key)}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                    tab === g.key
                      ? "border-primary font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g.label}
                  <span className="ml-1 text-xs opacity-60">
                    {VOICE_GROUPS.find(x => x.key === g.key)?.voices.length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice grid */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {displayedVoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">未找到匹配的音色</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {displayedVoices.map(v => {
                const isSelected = pending === v.id
                return (
                  <button
                    key={v.id}
                    onClick={() => setPending(v.id)}
                    className={`relative flex flex-col rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    }`}
                  >
                    {isSelected && (
                      <Check className="absolute right-2 top-2 size-3.5 text-primary" />
                    )}
                    <span className="flex items-center gap-1 pr-4 text-sm font-medium leading-tight">
                      {GENDER_ICON[v.gender]}
                      <span className="truncate">{v.name}</span>
                    </span>
                    <span className="mt-0.5 truncate text-xs text-muted-foreground">{v.id}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {pending ? `已选：${findVoice(pending)?.name ?? pending}` : "未选择"}
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
