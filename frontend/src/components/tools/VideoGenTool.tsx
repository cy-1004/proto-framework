import { useRef, useState } from "react"
import { ImagePlus, X, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api"
import { useJobStream } from "./useJobStream"

const PROVIDERS = [
  { key: "seedance", label: "Seedance 1.5 Pro", desc: "字节跳动 · 文/图生视频" },
  { key: "seedance_v2", label: "Seedance 2.0", desc: "字节跳动 · 文/图生视频 1080p" },
  { key: "seedance_v2_fast", label: "Seedance 2.0 Fast", desc: "字节跳动 · 更快速 720p" },
  { key: "veo3.1", label: "Veo 3.1", desc: "Google · 高质量文/图生视频" },
  { key: "grok_video", label: "Grok Video", desc: "xAI · 文生视频" },
  { key: "hailuo_video", label: "Hailuo 2.3", desc: "MiniMax · 文/图生视频" },
]

interface VideoConfig {
  duration: number
  aspect_ratio: string
  resolution: string
  generate_audio: boolean
  camera_fixed: boolean
  prompt_optimizer: boolean
}

const DEFAULT_CONFIG: VideoConfig = {
  duration: 5,
  aspect_ratio: "16:9",
  resolution: "720p",
  generate_audio: true,
  camera_fixed: false,
  prompt_optimizer: true,
}

export default function VideoGenTool() {
  const [provider, setProvider] = useState("seedance_v2")
  const [prompt, setPrompt] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [config, setConfig] = useState<VideoConfig>(DEFAULT_CONFIG)
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [durationCustom, setDurationCustom] = useState(false)
  const [customDurationVal, setCustomDurationVal] = useState("5")
  const [aspectRatioCustom, setAspectRatioCustom] = useState(false)
  const [customAspectRatioVal, setCustomAspectRatioVal] = useState("16:9")

  const job = useJobStream(jobId)
  const isRunning = job.status === "pending" || job.status === "running"

  const setConfigField = <K extends keyof VideoConfig>(k: K, v: VideoConfig[K]) =>
    setConfig(prev => ({ ...prev, [k]: v }))

  const handleImage = (file: File) => {
    setImage(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    if (!prompt.trim()) return setSubmitError("请输入 prompt")
    setSubmitError(null)
    setJobId(null)
    setSubmitting(true)

    try {
      const form = new FormData()
      form.append("provider", provider)
      form.append("prompt", prompt.trim())
      form.append("config", JSON.stringify(config))
      if (image) form.append("image", image)

      const res = await apiFetch("/api/tools/video/generate", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "提交失败")
      setJobId(data.job_id)
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "提交失败")
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setJobId(null)
    setSubmitError(null)
  }

  const resultData = job.result?.result
    ? (() => { try { return JSON.parse(job.result.result as string) } catch { return null } })()
    : null

  return (
    <div className="space-y-5">
      {/* Provider */}
      <div className="space-y-2">
        <Label>生成模型</Label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map(p => (
            <button
              key={p.key}
              onClick={() => setProvider(p.key)}
              disabled={isRunning}
              className={`rounded-lg border p-3 text-left transition-colors ${
                provider === p.key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
              }`}
            >
              <div className="text-sm font-medium">{p.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <Label>Prompt（视频描述）</Label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="描述你想要生成的视频内容，支持中英文..."
          rows={3}
          disabled={isRunning}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* Image upload (I2V) */}
      <div className="space-y-2">
        <Label>参考图片（可选，图生视频）</Label>
        {imagePreview ? (
          <div className="relative inline-block">
            <img src={imagePreview} alt="ref" className="max-h-40 rounded-lg border object-contain" />
            <button
              onClick={() => { setImage(null); setImagePreview(null) }}
              className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-destructive text-white shadow"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isRunning}
            className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30 disabled:opacity-50"
          >
            <ImagePlus className="size-4" />
            上传参考图片
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImage(f) }}
        />
      </div>

      {/* Config */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>时长（秒）</Label>
          <select
            value={durationCustom ? "custom" : String(config.duration)}
            onChange={(e) => {
              if (e.target.value === "custom") {
                setDurationCustom(true)
              } else {
                setDurationCustom(false)
                setConfigField("duration", parseInt(e.target.value))
              }
            }}
            disabled={isRunning}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {(provider === "veo3.1"
              ? [4, 6, 8]
              : provider === "seedance"
                ? [5]
                : [5, 6, 8, 10]
            ).map(d => <option key={d} value={d}>{d}s</option>)}
            <option value="custom">自定义...</option>
          </select>
          {durationCustom && (
            <input
              type="number"
              value={customDurationVal}
              onChange={(e) => {
                setCustomDurationVal(e.target.value)
                const v = parseInt(e.target.value)
                if (!isNaN(v) && v > 0) setConfigField("duration", v)
              }}
              placeholder="输入秒数"
              min={1}
              max={120}
              disabled={isRunning}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>{provider === "hailuo_video" ? "分辨率" : "画面比例"}</Label>
          {provider === "hailuo_video" ? (
            <select
              value={config.resolution}
              onChange={(e) => setConfigField("resolution", e.target.value)}
              disabled={isRunning}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {["768P", "1080P"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <>
              <select
                value={aspectRatioCustom ? "custom" : config.aspect_ratio}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setAspectRatioCustom(true)
                  } else {
                    setAspectRatioCustom(false)
                    setConfigField("aspect_ratio", e.target.value)
                  }
                }}
                disabled={isRunning}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                {["16:9", "9:16", "1:1"].map(r => <option key={r} value={r}>{r}</option>)}
                <option value="custom">自定义...</option>
              </select>
              {aspectRatioCustom && (
                <input
                  type="text"
                  value={customAspectRatioVal}
                  onChange={(e) => {
                    setCustomAspectRatioVal(e.target.value)
                    if (e.target.value.trim()) setConfigField("aspect_ratio", e.target.value.trim())
                  }}
                  placeholder="例：4:3 或 21:9"
                  disabled={isRunning}
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
              )}
            </>
          )}
        </div>

        {(provider === "seedance_v2" || provider === "seedance_v2_fast" || provider === "veo3.1" || provider === "grok_video") && (
          <div className="space-y-2">
            <Label>分辨率</Label>
            <select
              value={config.resolution}
              onChange={(e) => setConfigField("resolution", e.target.value)}
              disabled={isRunning}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {provider === "seedance_v2_fast"
                ? ["720p"].map(r => <option key={r} value={r}>{r}</option>)
                : provider === "grok_video"
                  ? ["480p", "720p", "1080p"].map(r => <option key={r} value={r}>{r}</option>)
                  : provider === "veo3.1"
                    ? ["720p", "1080p", "4k"].map(r => <option key={r} value={r}>{r}</option>)
                    : ["720p", "1080p"].map(r => <option key={r} value={r}>{r}</option>)
              }
            </select>
          </div>
        )}

        {provider === "seedance_v2" && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="gen_audio"
              checked={config.generate_audio}
              onChange={(e) => setConfigField("generate_audio", e.target.checked)}
              disabled={isRunning}
              className="accent-primary"
            />
            <Label htmlFor="gen_audio" className="cursor-pointer">生成音频</Label>
          </div>
        )}

        {provider === "seedance" && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="cam_fixed"
              checked={config.camera_fixed}
              onChange={(e) => setConfigField("camera_fixed", e.target.checked)}
              disabled={isRunning}
              className="accent-primary"
            />
            <Label htmlFor="cam_fixed" className="cursor-pointer">固定镜头</Label>
          </div>
        )}

        {provider === "hailuo_video" && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="prompt_opt"
              checked={config.prompt_optimizer}
              onChange={(e) => setConfigField("prompt_optimizer", e.target.checked)}
              disabled={isRunning}
              className="accent-primary"
            />
            <Label htmlFor="prompt_opt" className="cursor-pointer">Prompt 优化</Label>
          </div>
        )}
      </div>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button onClick={handleSubmit} disabled={submitting || isRunning || !prompt.trim()} className="w-full">
        <Video className="mr-2 size-4" />
        {submitting || isRunning ? "生成中..." : "开始生成"}
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
      {job.status === "complete" && resultData?.url && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <Label>生成结果</Label>
          <video
            controls
            src={resultData.url}
            poster={resultData.thumbnail ?? undefined}
            className="w-full rounded-lg"
          />
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => {
                const a = document.createElement("a")
                a.href = resultData.url
                a.download = "generated_video.mp4"
                a.click()
              }}
            >
              下载视频
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>重新生成</Button>
          </div>
        </div>
      )}
    </div>
  )
}
