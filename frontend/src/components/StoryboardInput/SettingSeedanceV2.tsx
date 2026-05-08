import { useState, useEffect } from "react"

interface SettingSeedanceV2Props {
  onChange?: (params: Record<string, any>) => void
}

const RATIO_OPTIONS = ["16:9", "9:16", "1:1"] as const
const COUNT_OPTIONS = [1, 2, 3] as const

export default function SettingSeedanceV2({ onChange }: SettingSeedanceV2Props) {
  const [duration, setDuration] = useState<number>(5)
  const [ratio, setRatio] = useState<string>("16:9")
  const [generateAudio, setGenerateAudio] = useState(true)
  const [count, setCount] = useState<number>(1)

  useEffect(() => {
    onChange?.({
      duration,
      ratio,
      generate_audio: generateAudio,
      watermark: false,
      count,
    })
  }, [duration, ratio, generateAudio, count])

  const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      className={`rounded-md border px-2 py-1 transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">时长</span>
          <span className="text-muted-foreground">{duration}s</span>
        </div>
        <input
          type="range"
          min={4}
          max={15}
          step={1}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground">比例</span>
        <div className="flex flex-wrap gap-1">
          {RATIO_OPTIONS.map((r) => (
            <Chip key={r} active={ratio === r} onClick={() => setRatio(r)}>{r}</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground">生成数量</span>
        <div className="flex flex-wrap gap-1">
          {COUNT_OPTIONS.map((c) => (
            <Chip key={c} active={count === c} onClick={() => setCount(c)}>{c}</Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">生成音频</span>
        <button
          type="button"
          className={`relative h-5 w-9 rounded-full transition-colors ${generateAudio ? "bg-primary" : "bg-border"}`}
          onClick={() => setGenerateAudio((v) => !v)}
        >
          <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${generateAudio ? "translate-x-4" : ""}`} />
        </button>
      </div>
    </div>
  )
}
