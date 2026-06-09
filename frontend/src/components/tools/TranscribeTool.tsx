import { useRef, useState } from "react"
import { Upload, Link, Copy, Check, FileAudio, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api"
import { useJobStream } from "./useJobStream"

export default function TranscribeTool() {
  const [mode, setMode] = useState<"file" | "url">("file")
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState("")
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const job = useJobStream(jobId)

  const handleSubmit = async () => {
    setSubmitError(null)
    if (mode === "file" && !file) return setSubmitError("请选择一个文件")
    if (mode === "url" && !url.trim()) return setSubmitError("请输入 TikTok 链接")

    setSubmitting(true)
    setJobId(null)
    try {
      const form = new FormData()
      if (mode === "file") form.append("file", file!)
      else form.append("url", url.trim())

      const res = await apiFetch("/api/tools/transcribe", { method: "POST", body: form })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* nginx may return HTML on 413 */ }
      if (!res.ok) {
        if (res.status === 413) throw new Error("文件太大，请联系管理员调整服务器上传限制")
        throw new Error((data.detail as string) || `服务器错误 (${res.status})`)
      }
      setJobId(data.job_id as string)
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "提交失败")
    } finally {
      setSubmitting(false)
    }
  }

  const transcript = job.result?.result as string | undefined
  const isRunning = job.status === "pending" || job.status === "running"

  const handleCopy = () => {
    if (!transcript) return
    navigator.clipboard.writeText(transcript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReset = () => {
    setJobId(null)
    setFile(null)
    setUrl("")
    setSubmitError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {(["file", "url"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); handleReset() }}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {m === "file" ? <Upload className="size-4" /> : <Link className="size-4" />}
            {m === "file" ? "上传文件" : "TikTok 链接"}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="space-y-2">
        {mode === "file" ? (
          <>
            <Label>视频 / 音频文件</Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50 hover:bg-muted/30"
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center gap-2 text-sm">
                  <FileAudio className="size-5 text-primary" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">点击选择视频或音频文件</p>
                  <p className="mt-1 text-xs text-muted-foreground">支持 MP4、MOV、AVI、MP3、WAV、M4A 等格式</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSubmitError(null) }}
              />
            </div>
          </>
        ) : (
          <>
            <Label>TikTok 视频链接</Label>
            <Input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setSubmitError(null) }}
              placeholder="https://www.tiktok.com/@username/video/..."
              disabled={isRunning}
            />
            <p className="text-xs text-muted-foreground">仅支持公开视频；私密或需登录的视频将报错</p>
          </>
        )}
      </div>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button
        onClick={handleSubmit}
        disabled={submitting || isRunning}
        className="w-full"
      >
        {submitting || isRunning ? "处理中..." : "开始转录"}
      </Button>

      {/* Progress */}
      {(isRunning || job.status === "complete" || job.status === "failed") && (
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{job.message || "处理中..."}</span>
            <span className="font-medium">{job.progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                job.status === "failed" ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${job.progress}%` }}
            />
          </div>
          {job.status === "failed" && (
            <p className="text-sm text-destructive">{job.error}</p>
          )}
        </div>
      )}

      {/* Result */}
      {job.status === "complete" && transcript && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>转录结果</Label>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}
                {copied ? "已复制" : "复制"}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleReset}>重新转录</Button>
            </div>
          </div>
          <div className="min-h-[120px] rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {transcript}
          </div>
          {!!job.result?.audio_duration && (
            <p className="text-xs text-muted-foreground">
              音频时长：{Math.round(job.result.audio_duration as number)}s
              {job.result.cost_usd ? `  ·  预计费用：$${(job.result.cost_usd as number).toFixed(4)}` : ""}
            </p>
          )}
        </div>
      )}
      {/* Download helper cards */}
      <div className="space-y-2 pt-2">
        <p className="text-xs font-medium text-muted-foreground">视频下载工具</p>
        <div className="grid grid-cols-2 gap-3">
          {/* TikTok */}
          <a
            href="https://zh.savefrom.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-border bg-gradient-to-br from-[#010101] to-[#1a1a2e] p-4 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              {/* TikTok logo SVG */}
              <svg viewBox="0 0 48 48" className="size-6 fill-white">
                <path d="M38.9 13.2a11.6 11.6 0 0 1-7.1-7.2h-6v21.7l-.1 9.4a6.8 6.8 0 1 1-4.8-6.5V24.4a13.3 13.3 0 1 0 11.3 13.1V22.6a18 18 0 0 0 10.5 3.4v-5.9a11.6 11.6 0 0 1-3.8-.9z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-white">TikTok 下载</span>
                <ExternalLink className="size-3 text-white/40 transition-colors group-hover:text-white/70" />
              </div>
              <p className="mt-0.5 text-xs text-white/50">savefrom.net</p>
            </div>
          </a>

          {/* Douyin */}
          <a
            href="https://blog.aitoolwang.com/dy/"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-border bg-gradient-to-br from-[#161823] to-[#2b2040] p-4 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-900/20"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              {/* Douyin logo — stylised double-D */}
              <svg viewBox="0 0 48 48" className="size-6">
                <circle cx="30" cy="18" r="8" fill="none" stroke="#69C9D0" strokeWidth="4" />
                <circle cx="18" cy="30" r="8" fill="none" stroke="#EE1D52" strokeWidth="4" />
                <rect x="22" y="10" width="4" height="28" rx="2" fill="white" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-white">抖音下载</span>
                <ExternalLink className="size-3 text-white/40 transition-colors group-hover:text-white/70" />
              </div>
              <p className="mt-0.5 text-xs text-white/50">aitoolwang.com</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
