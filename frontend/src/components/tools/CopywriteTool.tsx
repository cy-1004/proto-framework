import { useRef, useState } from "react"
import { Copy, Check, Sparkles, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api"

const DURATION_OPTIONS = [
  { value: 15,  label: "15 秒",  hint: "约 50 字" },
  { value: 30,  label: "30 秒",  hint: "约 100 字" },
  { value: 45,  label: "45 秒",  hint: "约 150 字" },
  { value: 60,  label: "1 分钟", hint: "约 200 字" },
  { value: 90,  label: "1.5 分钟",hint: "约 280 字" },
  { value: 120, label: "2 分钟", hint: "约 400 字" },
]

export default function CopywriteTool() {
  const [productInfo, setProductInfo] = useState("")
  const [referenceText, setReferenceText] = useState("")
  const [duration, setDuration] = useState(30)
  const [outputText, setOutputText] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)

  const canGenerate = !isGenerating && (productInfo.trim().length > 0 || referenceText.trim().length > 0)

  const handleGenerate = async () => {
    if (!canGenerate) return
    setError(null)
    setOutputText("")
    setIsGenerating(true)

    let accumulated = ""
    let closed = false

    const res = await apiFetch("/api/tools/copywrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_info: productInfo,
        reference_text: referenceText,
        duration_seconds: duration,
      }),
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "请求失败")
      setIsGenerating(false)
      return null
    })

    if (!res) return
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError((data as Record<string, string>).detail || "生成失败")
      setIsGenerating(false)
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    abortRef.current = () => { closed = true; reader.cancel() }

    const pump = async () => {
      try {
        while (!closed) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6).trim()
            if (!payload || payload === "{}") continue
            try {
              const chunk = JSON.parse(payload)
              if (chunk.content) { accumulated += chunk.content; setOutputText(accumulated) }
              if (chunk.error) setError(chunk.error)
            } catch { /* ignore */ }
          }
        }
      } catch {
        if (!closed) setError("流式读取中断")
      } finally {
        setIsGenerating(false)
      }
    }

    pump()
  }

  const handleStop = () => {
    abortRef.current?.()
    abortRef.current = null
    setIsGenerating(false)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(outputText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedDuration = DURATION_OPTIONS.find(o => o.value === duration)!

  return (
    <div className="space-y-5">

      {/* Product info */}
      <div className="space-y-2">
        <Label>
          带货商品信息
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">商品名称、价格、卖点、使用场景等</span>
        </Label>
        <textarea
          value={productInfo}
          onChange={(e) => setProductInfo(e.target.value)}
          placeholder={"例：XX 防晒霜 SPF50+，价格 ¥89，卖点：轻薄不泛白、防水防汗、适合日常通勤+户外运动。"}
          rows={4}
          disabled={isGenerating}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* Reference content */}
      <div className="space-y-2">
        <Label>
          参考内容
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">竞品视频文案、爆款脚本、任何灵感来源</span>
        </Label>
        <textarea
          value={referenceText}
          onChange={(e) => setReferenceText(e.target.value)}
          placeholder={"粘贴参考文案、爆款脚本片段、或转录出的口播文字..."}
          rows={4}
          disabled={isGenerating}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">商品信息与参考内容至少填写一项</p>
      </div>

      {/* Duration selector */}
      <div className="space-y-2">
        <Label>
          口播时长参考
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            当前选择：{selectedDuration.label}（{selectedDuration.hint}）
          </span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDuration(opt.value)}
              disabled={isGenerating}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                duration === opt.value
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {opt.label}
              <span className="ml-1 text-xs opacity-60">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        {isGenerating ? (
          <Button onClick={handleStop} variant="outline" className="w-full">
            <Square className="mr-2 size-4" />停止生成
          </Button>
        ) : (
          <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full">
            <Sparkles className="mr-2 size-4" />生成口播文案
          </Button>
        )}
      </div>

      {/* Output */}
      {outputText && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>生成结果</Label>
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={isGenerating}>
              {copied ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}
              {copied ? "已复制" : "复制"}
            </Button>
          </div>
          <div className="min-h-[140px] rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {outputText}
            {isGenerating && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            约 {outputText.length} 字
            {" · 预计口播时长约 "}
            {Math.round(outputText.length / 3.5)} 秒
          </p>
        </div>
      )}
    </div>
  )
}
