import { useState, useEffect } from "react"

interface SettingHailuoVideoProps {
  onChange?: (params: Record<string, any>) => void
}

const MODEL_OPTIONS = [
  { label: "Hailuo 2.3", value: "MiniMax-Hailuo-2.3" },
  { label: "Hailuo 02", value: "MiniMax-Hailuo-02" },
] as const

const DURATION_OPTIONS = [6, 10] as const
const RESOLUTION_OPTIONS = ["768P", "1080P"] as const

export default function SettingHailuoVideo({ onChange }: SettingHailuoVideoProps) {
  const [model, setModel] = useState<string>("MiniMax-Hailuo-2.3")
  const [duration, setDuration] = useState<number>(6)
  const [resolution, setResolution] = useState<string>("768P")
  const [promptOptimizer, setPromptOptimizer] = useState(true)

  const availableResolutions = duration === 10 ? ["768P"] : RESOLUTION_OPTIONS
  useEffect(() => {
    if (duration === 10 && resolution === "1080P") setResolution("768P")
  }, [duration, resolution])

  useEffect(() => {
    onChange?.({ model, duration, resolution, prompt_optimizer: promptOptimizer, count: 1 })
  }, [model, duration, resolution, promptOptimizer])

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
        <span className="font-medium text-foreground">模型</span>
        <div className="flex flex-wrap gap-1">
          {MODEL_OPTIONS.map((m) => (
            <Chip key={m.value} active={model === m.value} onClick={() => setModel(m.value)}>{m.label}</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground">时长</span>
        <div className="flex flex-wrap gap-1">
          {DURATION_OPTIONS.map((d) => (
            <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>{d}s</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground">分辨率</span>
        <div className="flex flex-wrap gap-1">
          {(availableResolutions as readonly string[]).map((r) => (
            <Chip key={r} active={resolution === r} onClick={() => setResolution(r)}>{r}</Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={promptOptimizer}
            onChange={(e) => setPromptOptimizer(e.target.checked)}
            className="accent-primary"
          />
          <span className="font-medium text-foreground">Prompt 优化</span>
        </label>
      </div>
    </div>
  )
}
