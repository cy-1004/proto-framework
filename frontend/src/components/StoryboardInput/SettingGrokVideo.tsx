import { useState, useEffect } from "react"

interface SettingGrokVideoProps {
  onChange?: (params: Record<string, any>) => void
}

const RATIO_OPTIONS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"] as const
const DURATION_OPTIONS = [5, 8, 10, 15] as const
const RESOLUTION_OPTIONS = ["480p", "720p"] as const

export default function SettingGrokVideo({ onChange }: SettingGrokVideoProps) {
  const [ratio, setRatio] = useState<string>("16:9")
  const [duration, setDuration] = useState<number>(5)
  const [resolution, setResolution] = useState<string>("480p")

  useEffect(() => {
    onChange?.({ aspect_ratio: ratio, duration, resolution, count: 1 })
  }, [ratio, duration, resolution])

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
        <span className="font-medium text-foreground">比例</span>
        <div className="flex flex-wrap gap-1">
          {RATIO_OPTIONS.map((r) => (
            <Chip key={r} active={ratio === r} onClick={() => setRatio(r)}>{r}</Chip>
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
          {RESOLUTION_OPTIONS.map((r) => (
            <Chip key={r} active={resolution === r} onClick={() => setResolution(r)}>{r}</Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
