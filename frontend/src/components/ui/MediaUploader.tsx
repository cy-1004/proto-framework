import { useState, useRef, useCallback, useEffect } from "react"
import { Plus, X, Film, Music } from "lucide-react"
import { apiFetch } from "@/lib/api"

export interface MediaFileInfo {
  filename: string
  mediaType: "image" | "video" | "audio"
  label: string
}

export interface PreloadedFile {
  previewUrl: string
  serverFilename: string
  mediaType: "image" | "video" | "audio"
}

interface InternalFile {
  id: string
  file: File | null
  previewUrl: string
  serverFilename?: string
  uploading: boolean
  error?: string
  mediaType: "image" | "video" | "audio"
  isLibrary?: boolean
}

interface MediaUploaderProps {
  maxFiles?: number
  maxSizeMB?: number
  accept?: string
  hint?: string
  onChange?: (files: MediaFileInfo[]) => void
  size?: "small" | "large"
  preloadedFiles?: PreloadedFile[]
}

const DEFAULT_ACCEPT = ".jpg,.jpeg,.png,.wav,.mp3,.mp4,.mov"
const DEFAULT_ALLOWED_EXTS = ["jpg", "jpeg", "png", "wav", "mp3", "mp4", "mov"]

function parseAllowedExts(accept: string): string[] {
  return accept.split(",").map((s) => s.trim().replace(/^\./, "").toLowerCase()).filter(Boolean)
}

function getMediaType(file: File): "image" | "video" | "audio" {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (ext === "mp4" || ext === "mov") return "video"
  if (ext === "wav" || ext === "mp3") return "audio"
  return "image"
}

function computeLabels(files: InternalFile[]): string[] {
  const counters = { image: 0, video: 0, audio: 0 }
  const prefixes = { image: "图片", video: "视频", audio: "音频" }
  return files.map((f) => {
    counters[f.mediaType]++
    return `${prefixes[f.mediaType]}${counters[f.mediaType]}`
  })
}

async function uploadToServer(file: File): Promise<string | undefined> {
  const ext = file.name.split(".").pop() || "bin"
  const safeName = `${crypto.randomUUID().slice(0, 12)}.${ext}`
  const renamed = new File([file], safeName, { type: file.type })
  const form = new FormData()
  form.append("file", renamed)
  try {
    const res = await apiFetch("/api/media/upload", { method: "POST", body: form })
    if (!res.ok) return undefined
    const data = await res.json()
    return data.filename
  } catch {
    return undefined
  }
}

export default function MediaUploader({
  maxFiles = 5,
  maxSizeMB = 50,
  accept,
  hint,
  onChange,
  size = "small",
  preloadedFiles,
}: MediaUploaderProps) {
  const acceptStr = accept || DEFAULT_ACCEPT
  const [files, setFiles] = useState<InternalFile[]>(() => {
    if (!preloadedFiles?.length) return []
    return preloadedFiles.map((pf) => ({
      id: crypto.randomUUID(),
      file: null,
      previewUrl: pf.previewUrl,
      serverFilename: pf.serverFilename,
      uploading: false,
      mediaType: pf.mediaType,
      isLibrary: true,
    }))
  })
  const [hovering, setHovering] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const leaveTimer = useRef<number>(0)

  const lg = size === "large"
  const thumbW = lg ? "w-20" : "w-14"
  const thumbH = lg ? "h-24" : "h-[72px]"

  useEffect(() => {
    setFiles((prev) => {
      if (prev.length === 0) return prev
      const exts = accept ? parseAllowedExts(accept) : DEFAULT_ALLOWED_EXTS
      const filtered = prev.filter((f) => {
        if (f.isLibrary) return true
        const ext = f.file?.name.split(".").pop()?.toLowerCase()
        return exts.includes(ext || "")
      })
      const truncated = filtered.slice(0, maxFiles)
      if (truncated.length === prev.length) return prev
      const removed = prev.filter((f) => !truncated.includes(f))
      removed.forEach((f) => { if (f.previewUrl && !f.isLibrary) URL.revokeObjectURL(f.previewUrl) })
      return truncated
    })
  }, [accept, maxFiles])

  const addFiles = useCallback(
    async (raw: FileList | File[]) => {
      const exts = accept ? parseAllowedExts(accept) : DEFAULT_ALLOWED_EXTS
      const arr = Array.from(raw).filter((f) => {
        if (f.size > maxSizeMB * 1024 * 1024) return false
        const ext = f.name.split(".").pop()?.toLowerCase()
        return exts.includes(ext || "")
      })
      const remaining = maxFiles - files.length
      if (remaining <= 0) return
      const toAdd = arr.slice(0, remaining)

      const newFiles: InternalFile[] = toAdd.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        uploading: true,
        mediaType: getMediaType(f),
      }))

      setFiles((prev) => [...prev, ...newFiles])

      for (const mf of newFiles) {
        if (!mf.file) continue
        const filename = await uploadToServer(mf.file)
        setFiles((prev) =>
          prev.map((f) =>
            f.id === mf.id
              ? { ...f, uploading: false, serverFilename: filename, error: filename ? undefined : "上传失败" }
              : f,
          ),
        )
      }
    },
    [files.length, maxFiles, maxSizeMB, accept],
  )

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target?.previewUrl && !target.isLibrary) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  useEffect(() => {
    const labels = computeLabels(files)
    const infos: MediaFileInfo[] = files
      .map((f, i) => ({ f, label: labels[i] }))
      .filter(({ f }) => f.serverFilename && !f.uploading)
      .map(({ f, label }) => ({
        filename: f.serverFilename!,
        mediaType: f.mediaType,
        label,
      }))
    onChange?.(infos)
  }, [files, onChange])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const onMouseEnter = () => { clearTimeout(leaveTimer.current); setHovering(true) }
  const onMouseLeave = () => { leaveTimer.current = window.setTimeout(() => setHovering(false), 150) }
  const openPicker = () => inputRef.current?.click()

  const labels = computeLabels(files)
  const canAdd = files.length < maxFiles
  const previewFile = previewId ? files.find((f) => f.id === previewId) : null
  const previewLabel = previewFile ? labels[files.indexOf(previewFile)] : ""

  const previewOverlay = previewFile && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setPreviewId(null)}
    >
      <div
        className="relative max-h-[80vh] max-w-[80vw] overflow-hidden rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">{previewLabel}</span>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            onClick={() => setPreviewId(null)}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex items-center justify-center p-4">
          {previewFile.mediaType === "image" && previewFile.previewUrl ? (
            <img
              src={previewFile.previewUrl}
              alt={previewLabel}
              className="max-h-[65vh] max-w-full rounded object-contain"
            />
          ) : previewFile.mediaType === "video" && previewFile.previewUrl ? (
            <video
              src={previewFile.previewUrl}
              controls
              autoPlay
              className="max-h-[65vh] max-w-full rounded"
            />
          ) : previewFile.mediaType === "audio" && previewFile.previewUrl ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <Music className="size-12 text-muted-foreground" />
              <audio src={previewFile.previewUrl} controls autoPlay className="w-72" />
            </div>
          ) : previewFile.mediaType === "audio" ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <Music className="size-12 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{previewFile.file?.name}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <Film className="size-12 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={acceptStr}
      className="hidden"
      onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = "" }}
    />
  )

  // State A: empty
  if (files.length === 0) {
    return (
      <>
        {fileInput}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            className={`flex shrink-0 items-center justify-center rounded-xl border border-dashed text-muted-foreground transition-colors
              ${thumbW} ${thumbH}
              ${dragOver
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/40 hover:bg-muted"
              }`}
            onClick={openPicker}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            title={hint}
          >
            <Plus className={lg ? "size-7" : "size-5"} />
          </button>
          {hint && <div className="max-w-28 text-center text-[10px] leading-4 text-muted-foreground">{hint}</div>}
        </div>
      </>
    )
  }

  // State B/C: has files
  return (
    <div
      className="relative flex shrink-0 items-end gap-1.5"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {fileInput}

      {files.map((f, i) => (
        <div key={f.id} className="relative">
          {/* label tooltip */}
          <div
            className={`pointer-events-none absolute -top-7 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md
              bg-foreground px-2 py-0.5 text-[10px] font-medium text-background
              transition-all duration-150
              ${hovering ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
          >
            {labels[i]}
          </div>

          {/* X button */}
          <button
            type="button"
            className={`absolute -right-1.5 -top-1.5 z-20 flex size-4 items-center justify-center rounded-full
              bg-foreground text-background transition-all duration-150 hover:bg-destructive
              ${hovering ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
            onClick={(e) => { e.stopPropagation(); removeFile(f.id) }}
          >
            <X className="size-2.5" />
          </button>

          {/* preview — click to open lightbox */}
          <div
            className={`cursor-pointer overflow-hidden rounded-lg border border-border ${thumbW} ${thumbH}
              ${f.uploading ? "animate-pulse opacity-60" : ""}
              ${f.error ? "border-destructive/50" : ""}`}
            onClick={() => !f.uploading && setPreviewId(f.id)}
          >
            {f.mediaType === "image" && f.previewUrl ? (
              <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
            ) : f.mediaType === "video" ? (
              f.previewUrl ? (
                <video src={f.previewUrl} className="h-full w-full object-cover" muted preload="metadata" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <Film className="size-5 text-muted-foreground" />
                </div>
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <Music className="size-5 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      ))}

      {/* add more: morphing button */}
      {canAdd && (
        <button
          type="button"
          className={`flex shrink-0 items-center justify-center text-muted-foreground transition-all duration-200
            ${hovering
              ? `${thumbW} ${thumbH} rounded-lg border border-dashed border-border bg-muted/40 hover:bg-muted`
              : "mb-1 size-6 rounded-full border border-border bg-background shadow-sm hover:bg-muted"
            }
            ${dragOver && hovering ? "border-primary bg-primary/5" : ""}`}
          onClick={openPicker}
        >
          <Plus className={hovering ? (lg ? "size-6" : "size-4") : "size-3"} />
        </button>
      )}

      {previewOverlay}
    </div>
  )
}
