import { useRef, useState } from "react"
import { Copy, Check, Sparkles, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api"

export default function CopywriteTool() {
  const [referenceText, setReferenceText] = useState("")
  const [outputText, setOutputText] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)

  const handleGenerate = async () => {
    if (!referenceText.trim()) return
    setError(null)
    setOutputText("")
    setIsGenerating(true)

    let accumulated = ""
    let closed = false

    const res = await apiFetch("/api/tools/copywrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference_text: referenceText }),
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "请求失败")
      setIsGenerating(false)
      return null
    })

    if (!res) return
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.detail || "生成失败")
      setIsGenerating(false)
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    abortRef.current = () => {
      closed = true
      reader.cancel()
    }

    const pump = async () => {
      try {
        while (!closed) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const payload = line.slice(6).trim()
              if (!payload || payload === "{}") continue
              try {
                const chunk = JSON.parse(payload)
                if (chunk.content) {
                  accumulated += chunk.content
                  setOutputText(accumulated)
                }
                if (chunk.error) setError(chunk.error)
              } catch { /* ignore malformed */ }
            }
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>参考内容</Label>
        <textarea
          value={referenceText}
          onChange={(e) => setReferenceText(e.target.value)}
          placeholder="粘贴视频脚本、商品描述、或任何参考文字..."
          rows={6}
          disabled={isGenerating}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">AI 将根据此内容创作适合 TikTok 的口播文案（30–60 秒）</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        {isGenerating ? (
          <Button onClick={handleStop} variant="outline" className="w-full">
            <Square className="mr-2 size-4" />
            停止生成
          </Button>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={!referenceText.trim()}
            className="w-full"
          >
            <Sparkles className="mr-2 size-4" />
            生成口播文案
          </Button>
        )}
      </div>

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
          <p className="text-xs text-muted-foreground">约 {outputText.length} 字</p>
        </div>
      )}
    </div>
  )
}
