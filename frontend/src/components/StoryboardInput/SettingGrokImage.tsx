import { useState, useEffect } from "react"

interface SettingGrokImageProps {
  onChange?: (params: Record<string, any>) => void
}

const RATIO_OPTIONS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "auto"] as const
const RESOLUTION_OPTIONS = ["1k", "2k"] as const
const COUNT_OPTIONS = [1, 2, 3, 4] as const

export default function SettingGrokImage({ onChange }: SettingGrokImageProps) {
  const [ratio, setRatio] = useState<string>("16:9")
  const [resolution, setResolution] = useState<string>("1k")
  const [count, setCount] = useState<number>(2)

  useEffect(() => {
    onChange?.({ ratio, resolution, count })
  }, [ratio, resolution, count])

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
        <span className="font-medium text-foreground">分辨率</span>
        <div className="flex flex-wrap gap-1">
          {RESOLUTION_OPTIONS.map((r) => (
            <Chip key={r} active={resolution === r} onClick={() => setResolution(r)}>{r}</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground">数量</span>
        <div className="flex flex-wrap gap-1">
          {COUNT_OPTIONS.map((n) => (
            <Chip key={n} active={count === n} onClick={() => setCount(n)}>{n}</Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
