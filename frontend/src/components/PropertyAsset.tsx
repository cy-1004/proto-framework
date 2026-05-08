import { useEffect, useRef, useState, useMemo } from "react"
import { Play, HeartIcon, FolderPlusIcon, FolderCheckIcon, Trash2Icon, AudioLinesIcon, RotateCcwIcon, LoaderIcon, ChevronRightIcon, CheckIcon, DownloadIcon } from "lucide-react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { DropdownMenu } from "radix-ui"
import type { Asset } from "@/types/asset"
import useNarationData from "@/hooks/useNarationData"
import { useNarationPlayback } from "@/contexts/NarationPlaybackContext"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { VOICE_OPTIONS, detectLang, getSavedVoiceId, saveVoiceId, type VoiceOption } from "@/config/voiceConfig"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground w-16">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  )
}

function LazyAudio({ src }: { src: string }) {
  const [ready, setReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (ready) audioRef.current?.play().catch(() => {})
  }, [ready])

  return (
    <div className="rounded-lg bg-muted p-3">
      {ready ? (
        <audio ref={audioRef} src={src} controls className="w-full h-8" />
      ) : (
        <button
          type="button"
          onClick={() => setReady(true)}
          className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted-foreground/10 transition-colors"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Play className="h-3.5 w-3.5 translate-x-0.5" />
          </div>
          <span className="text-xs text-muted-foreground">点击播放音频</span>
        </button>
      )}
    </div>
  )
}

function LazyVideo({ src, thumbnail, alt }: { src: string; thumbnail?: string | null; alt: string }) {
  const [ready, setReady] = useState(false)

  return (
    <div className="relative overflow-hidden rounded-lg bg-black">
      {ready ? (
        <video src={src} controls autoPlay className="w-full" />
      ) : (
        <div className="relative cursor-pointer" onClick={() => setReady(true)}>
          {thumbnail ? (
            <img src={`/media/${thumbnail}`} alt={alt} className="w-full" />
          ) : (
            <div className="aspect-video bg-muted" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
              <Play className="h-5 w-5 translate-x-0.5 text-black" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Voice Selector ────────────────────────────────────────────────

function VoiceSelector({
  selectedVoice,
  onSelect,
}: {
  selectedVoice: VoiceOption
  onSelect: (voice: VoiceOption) => void
}) {
  const langGroups = useMemo(() => {
    const groups: Record<string, { male: VoiceOption[]; female: VoiceOption[] }> = {}
    for (const v of VOICE_OPTIONS) {
      if (!groups[v.lang]) groups[v.lang] = { male: [], female: [] }
      groups[v.lang][v.gender].push(v)
    }
    return groups
  }, [])

  const langLabel = { en: "English", zh: "中文" } as const

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors hover:bg-accent truncate max-w-[140px]"
          title={selectedVoice.name}
        >
          <span className="truncate">{selectedVoice.name}</span>
          <ChevronRightIcon className="size-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={4}
          className="z-50 min-w-[120px] rounded-lg border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {(["en", "zh"] as const).map((lang) => (
            <DropdownMenu.Sub key={lang}>
              <DropdownMenu.SubTrigger className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs outline-none hover:bg-accent data-[state=open]:bg-accent">
                {langLabel[lang]}
                <ChevronRightIcon className="size-3 opacity-50" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  sideOffset={4}
                  className="z-50 min-w-[160px] rounded-lg border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
                >
                  <DropdownMenu.Label className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">Male</DropdownMenu.Label>
                  {langGroups[lang]?.male.map((v) => (
                    <DropdownMenu.Item
                      key={v.id}
                      onSelect={() => onSelect(v)}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-accent"
                    >
                      <CheckIcon className={cn("size-3", selectedVoice.id === v.id ? "opacity-100" : "opacity-0")} />
                      {v.name}
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Separator className="mx-1 my-1 h-px bg-border" />
                  <DropdownMenu.Label className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">Female</DropdownMenu.Label>
                  {langGroups[lang]?.female.map((v) => (
                    <DropdownMenu.Item
                      key={v.id}
                      onSelect={() => onSelect(v)}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-accent"
                    >
                      <CheckIcon className={cn("size-3", selectedVoice.id === v.id ? "opacity-100" : "opacity-0")} />
                      {v.name}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ── Narration-specific property panel ──────────────────────────────

function NarationProperty({ asset }: { asset: Asset }) {
  const { data, loading, updateContent, synthesize, reset } = useNarationData(asset.id)
  const playback = useNarationPlayback()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const suppressUpdateRef = useRef(false)
  const releaseSuppressRef = useRef<ReturnType<typeof setTimeout>>(null)
  const editableRef = useRef(true)
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICE_OPTIONS[0])

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false })],
    content: "",
    editable: true,
    onUpdate: ({ editor: ed }) => {
      if (suppressUpdateRef.current || !editableRef.current) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateContent(ed.getText())
      }, 800)
    },
  })

  const contentSetRef = useRef(false)
  useEffect(() => {
    editableRef.current = data?.tts_done !== "1"
  }, [data?.tts_done])

  useEffect(() => {
    if (data && editor && !contentSetRef.current) {
      if (releaseSuppressRef.current) clearTimeout(releaseSuppressRef.current)
      suppressUpdateRef.current = true
      editor.commands.setContent(data.content || "")
      releaseSuppressRef.current = setTimeout(() => {
        suppressUpdateRef.current = false
      }, 0)
      contentSetRef.current = true

      // auto-detect language and resolve voice
      if (data.content) {
        const lang = detectLang(data.content)
        const savedId = getSavedVoiceId(lang)
        const match = savedId && VOICE_OPTIONS.find((v) => v.id === savedId && v.lang === lang)
        setSelectedVoice(match || VOICE_OPTIONS.find((v) => v.lang === lang) || VOICE_OPTIONS[0])
      }
    }
  }, [data, editor])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (releaseSuppressRef.current) clearTimeout(releaseSuppressRef.current)
    suppressUpdateRef.current = false
    contentSetRef.current = false
  }, [asset.id])

  const handleSelectVoice = (voice: VoiceOption) => {
    setSelectedVoice(voice)
    saveVoiceId(voice.lang, voice.id)
  }

  if (!data) {
    return <div className="text-xs text-muted-foreground py-4 text-center">加载旁白数据…</div>
  }

  if (data.tts_done === "0") {
    return (
      <div className="space-y-3">
        <div
          className="rounded-lg border bg-muted/30 p-3 min-h-[180px]"
          style={{
            backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, hsl(var(--border)/0.4) 27px, hsl(var(--border)/0.4) 28px)",
            backgroundPosition: "0 8px",
          }}
        >
          <EditorContent editor={editor} className="prose prose-sm max-w-none text-sm leading-7 focus:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[160px]" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => synthesize(selectedVoice.id)}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            {loading ? <LoaderIcon className="size-4 animate-spin" /> : <AudioLinesIcon className="size-4" />}
            {loading ? "合成中…" : "语音合成"}
          </button>
          {!loading && <VoiceSelector selectedVoice={selectedVoice} onSelect={handleSelectVoice} />}
        </div>
      </div>
    )
  }

  const segments = data.segments || []
  const entitySegs = playback.assetId === asset.id ? playback.activeEntitySegIndices : []

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
        {segments.map((seg, i) => (
          <span
            key={i}
            className={cn(
              "inline text-sm leading-7 transition-colors",
              entitySegs.includes(i) ? "bg-yellow-300/40 font-medium" : "text-foreground",
            )}
          >
            {seg.text}
          </span>
        ))}
        {segments.length === 0 && <p className="text-xs text-muted-foreground">{data.content}</p>}
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          if (window.confirm("重置将删除已合成的音频和字幕，确定继续？")) reset()
        }}
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        {loading ? <LoaderIcon className="size-4 animate-spin" /> : <RotateCcwIcon className="size-4" />}
        重置语音合成
      </button>
    </div>
  )
}

// ── Main PropertyAsset component ───────────────────────────────────

interface PropertyAssetProps {
  asset: Asset
  isInProject?: boolean
  onToggleFavorite?: () => void
  onToggleProject?: () => void
  onDelete?: () => void
}

export default function PropertyAsset({
  asset,
  isInProject,
  onToggleFavorite,
  onToggleProject,
  onDelete,
}: PropertyAssetProps) {
  const { enableDownload } = useAuth()
  const isFav = asset.favorite === "1"
  const canDownload = enableDownload && asset.uri && (asset.mediatype === "image" || asset.mediatype === "video")
  const hasActions = !!(onToggleFavorite || onToggleProject || onDelete || canDownload)

  const actionButtons = hasActions && (
    <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
      {canDownload && (
        <a
          href={`/media/${asset.uri}`}
          download
          className="rounded bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
          title="下载"
        >
          <DownloadIcon className="size-3.5" />
        </a>
      )}
      {onToggleFavorite && (
        <button
          type="button"
          className="rounded bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
          onClick={onToggleFavorite}
          title={isFav ? "取消收藏" : "收藏"}
        >
          <HeartIcon className={`size-3.5 ${isFav ? "fill-red-500 text-red-500" : ""}`} />
        </button>
      )}
      {onToggleProject && (
        <button
          type="button"
          className="rounded bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
          onClick={onToggleProject}
          title={isInProject ? "从项目移除" : "添加到项目"}
        >
          {isInProject ? (
            <FolderCheckIcon className="size-3.5 text-green-400" />
          ) : (
            <FolderPlusIcon className="size-3.5" />
          )}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="rounded bg-black/50 p-1 text-white transition-colors hover:bg-red-600/80"
          onClick={() => {
            if (window.confirm("确定要永久删除该素材吗？此操作不可撤销。")) onDelete()
          }}
          title="删除素材"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}
    </div>
  )

  if (asset.type === "naration") {
    return (
      <div className="space-y-3">
        <NarationProperty asset={asset} />
        <div className="space-y-2 text-xs">
          <Row label="名称" value={asset.name_cn} />
          {asset.desc && <Row label="描述" value={asset.desc} />}
          {asset.tags && <Row label="标签" value={asset.tags} />}
          {asset.duration != null && <Row label="时长" value={`${asset.duration}s`} />}
          {asset.created_at && <Row label="创建时间" value={asset.created_at} />}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {asset.mediatype === "image" && asset.thumbnail && (
        <div className="group relative">
          <img src={`/media/${asset.thumbnail}`} alt={asset.name_cn} className="w-full rounded-lg" />
          {actionButtons}
        </div>
      )}
      {asset.mediatype === "audio" && asset.uri && (
        <div className="group relative">
          <LazyAudio src={`/media/${asset.uri}`} />
          {actionButtons}
        </div>
      )}
      {asset.mediatype === "video" && asset.uri && (
        <div className="group relative">
          <LazyVideo src={`/media/${asset.uri}`} thumbnail={asset.thumbnail} alt={asset.name_cn} />
          {actionButtons}
        </div>
      )}

      <div className="space-y-2 text-xs">
        <Row label="名称" value={asset.name} />
        {asset.mediatype && <Row label="类型" value={asset.mediatype} />}
        {asset.format && <Row label="格式" value={asset.format} />}
        {asset.desc && <Row label="描述" value={asset.desc} />}
        {asset.tags && <Row label="标签" value={asset.tags} />}
        {asset.width && asset.height && <Row label="尺寸" value={`${asset.width} × ${asset.height}`} />}
        {asset.duration != null && <Row label="时长" value={`${asset.duration}s`} />}
        <Row label="大小" value={`${(asset.size / 1024).toFixed(1)} KB`} />
        <Row label="来源" value={asset.source === "uploaded" ? "上传" : "生成"} />
        {asset.created_at && <Row label="创建时间" value={asset.created_at} />}
      </div>
    </div>
  )
}
