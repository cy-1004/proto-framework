import { useState } from "react"
import { Plus, Trash2, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api"

const VOICE_PRESETS = [
  { value: "Chinese (Mandarin)_Unrestrained_Young_Man", label: "青年男声 · 无拘束" },
  { value: "Chinese (Mandarin)_Lively_Young_Woman", label: "青年女声 · 活泼" },
  { value: "Chinese (Mandarin)_Gentle_Young_Woman", label: "青年女声 · 温柔" },
  { value: "Chinese (Mandarin)_Soothing_Male", label: "男声 · 舒缓" },
  { value: "Chinese (Mandarin)_Deep_Male", label: "男声 · 深沉" },
  { value: "Chinese (Mandarin)_Story_Teller", label: "故事讲述者" },
]

const EMOTION_OPTIONS = [
  { value: "neutral", label: "中性" },
  { value: "happy", label: "开心" },
  { value: "sad", label: "悲伤" },
  { value: "angry", label: "愤怒" },
  { value: "fearful", label: "恐惧" },
  { value: "disgusted", label: "厌恶" },
  { value: "surprised", label: "惊讶" },
]

interface PronEntry { text: string; pronunciation: string }

export default function TTSTool() {
  const [text, setText] = useState("")
  const [voiceId, setVoiceId] = useState(VOICE_PRESETS[0].value)
  const [customVoice, setCustomVoice] = useState("")
  const [useCustomVoice, setUseCustomVoice] = useState(false)
  const [speed, setSpeed] = useState(1.0)
  const [vol, setVol] = useState(1.0)
  const [pitch, setPitch] = useState(0)
  const [emotion, setEmotion] = useState("neutral")
  const [pronDict, setPronDict] = useState<PronEntry[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const addPronRow = () => setPronDict(prev => [...prev, { text: "", pronunciation: "" }])
  const removePronRow = (i: number) => setPronDict(prev => prev.filter((_, idx) => idx !== i))
  const updatePronRow = (i: number, field: keyof PronEntry, val: string) =>
    setPronDict(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row))

  const handleGenerate = async () => {
    if (!text.trim()) return
    setError(null)
    setAudioUrl(null)
    setIsGenerating(true)

    const payload = {
      text: text.trim(),
      voice_id: useCustomVoice ? customVoice.trim() : voiceId,
      speed,
      vol,
      pitch,
      emotion,
      pronunciation_dict: pronDict.filter(r => r.text && r.pronunciation),
    }

    try {
      const res = await apiFetch("/api/tools/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "TTS 生成失败")
      setAudioUrl(data.url)
      setDuration(data.duration)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "生成失败")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Text */}
      <div className="space-y-2">
        <Label>文本内容</Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入要合成的文字..."
          rows={5}
          disabled={isGenerating}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <p className="text-right text-xs text-muted-foreground">{text.length} 字</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Voice */}
        <div className="space-y-2">
          <Label>音色</Label>
          <select
            value={useCustomVoice ? "__custom__" : voiceId}
            onChange={(e) => {
              if (e.target.value === "__custom__") { setUseCustomVoice(true) }
              else { setUseCustomVoice(false); setVoiceId(e.target.value) }
            }}
            disabled={isGenerating}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {VOICE_PRESETS.map(v => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
            <option value="__custom__">自定义...</option>
          </select>
          {useCustomVoice && (
            <Input
              value={customVoice}
              onChange={(e) => setCustomVoice(e.target.value)}
              placeholder="输入 MiniMax voice_id"
              disabled={isGenerating}
            />
          )}
        </div>

        {/* Emotion */}
        <div className="space-y-2">
          <Label>情绪</Label>
          <select
            value={emotion}
            onChange={(e) => setEmotion(e.target.value)}
            disabled={isGenerating}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {EMOTION_OPTIONS.map(e => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>

        {/* Speed */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>语速</Label>
            <span className="text-xs text-muted-foreground">{speed.toFixed(1)}x</span>
          </div>
          <input
            type="range" min={0.5} max={2} step={0.1}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            disabled={isGenerating}
            className="w-full accent-primary"
          />
        </div>

        {/* Volume */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>音量</Label>
            <span className="text-xs text-muted-foreground">{vol.toFixed(1)}</span>
          </div>
          <input
            type="range" min={0.1} max={2} step={0.1}
            value={vol}
            onChange={(e) => setVol(parseFloat(e.target.value))}
            disabled={isGenerating}
            className="w-full accent-primary"
          />
        </div>

        {/* Pitch */}
        <div className="space-y-2">
          <Label>音调 <span className="text-xs text-muted-foreground">(-12 ~ 12)</span></Label>
          <Input
            type="number" min={-12} max={12} step={1}
            value={pitch}
            onChange={(e) => setPitch(parseInt(e.target.value) || 0)}
            disabled={isGenerating}
          />
        </div>
      </div>

      {/* Pronunciation dictionary */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>发音字典</Label>
          <Button variant="ghost" size="sm" onClick={addPronRow} disabled={isGenerating}>
            <Plus className="mr-1 size-3.5" />添加
          </Button>
        </div>
        {pronDict.length > 0 && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">文字</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">发音（拼音）</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pronDict.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1">
                      <Input
                        value={row.text}
                        onChange={(e) => updatePronRow(i, "text", e.target.value)}
                        placeholder="处理"
                        className="h-8 text-xs"
                        disabled={isGenerating}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={row.pronunciation}
                        onChange={(e) => updatePronRow(i, "pronunciation", e.target.value)}
                        placeholder="(chǔ)(lǐ)"
                        className="h-8 text-xs"
                        disabled={isGenerating}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <button
                        onClick={() => removePronRow(i)}
                        disabled={isGenerating}
                        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pronDict.length === 0 && (
          <p className="text-xs text-muted-foreground">可添加自定义发音，如「处理 → (chǔ)(lǐ)」</p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleGenerate} disabled={isGenerating || !text.trim()} className="w-full">
        <Volume2 className="mr-2 size-4" />
        {isGenerating ? "合成中..." : "生成语音"}
      </Button>

      {audioUrl && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <Label>生成结果</Label>
            {duration && <span className="text-xs text-muted-foreground">{duration}s</span>}
          </div>
          <audio controls src={audioUrl} className="w-full" />
          <Button
            variant="outline" size="sm"
            onClick={() => {
              const a = document.createElement("a")
              a.href = audioUrl
              a.download = "tts_output.mp3"
              a.click()
            }}
          >
            下载 MP3
          </Button>
        </div>
      )}
    </div>
  )
}
