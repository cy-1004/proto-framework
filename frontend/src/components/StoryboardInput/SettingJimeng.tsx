import { useState, useEffect } from "react"

interface SettingJimengProps {
  onChange?: (params: Record<string, any>) => void
}

const RATIO_OPTIONS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"] as const
const SIZE_OPTIONS = ["2K", "3K"] as const
const COUNT_OPTIONS = ["auto", 1, 2, 3, 4] as const

type CountMode = typeof COUNT_OPTIONS[number]

export default function SettingJimeng({ onChange }: SettingJimengProps) {
  const [ratio, setRatio] = useState<string>("16:9")
  const [size, setSize] = useState<string>("2K")
  const [countMode, setCountMode] = useState<CountMode>(2)

  useEffect(() => {
    onChange?.({
      ratio,
      size,
      count: countMode === "auto" ? 1 : countMode,
      sequential_image_generation: countMode === "auto" ? "auto" : "disabled",
      watermark: false,
    })
  }, [ratio, size, countMode])

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
        <span className="font-medium text-foreground">尺寸</span>
        <div className="flex flex-wrap gap-1">
          {SIZE_OPTIONS.map((s) => (
            <Chip key={s} active={size === s} onClick={() => setSize(s)}>{s}</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground">数量</span>
        <div className="flex flex-wrap gap-1">
          {COUNT_OPTIONS.map((n) => (
            <Chip key={n} active={countMode === n} onClick={() => setCountMode(n)}>
              {n}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
