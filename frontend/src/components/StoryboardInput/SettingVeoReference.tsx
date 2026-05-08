import { useState, useEffect } from "react"

interface SettingVeoReferenceProps {
  onChange?: (params: Record<string, any>) => void
}

const RATIO_OPTIONS = ["16:9", "9:16"] as const
const RESOLUTION_OPTIONS = ["720p", "1080p", "4k"] as const

export default function SettingVeoReference({ onChange }: SettingVeoReferenceProps) {
  const [ratio, setRatio] = useState<string>("16:9")
  const [resolution, setResolution] = useState<string>("720p")

  useEffect(() => {
    onChange?.({ aspect_ratio: ratio, duration: 8, resolution, count: 1, generation_mode: "reference" })
  }, [ratio, resolution])

  const Chip = ({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
    <button
      type="button"
      disabled={disabled}
      className={`rounded-md border px-2 py-1 transition-colors ${
        disabled
          ? "border-border text-muted-foreground/40 cursor-not-allowed"
          : active
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
          <Chip active onClick={() => {}}>8s</Chip>
        </div>
        <span className="text-[10px] text-muted-foreground">参考图模式仅支持 8s</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground">分辨率</span>
        <div className="flex flex-wrap gap-1">
          {RESOLUTION_OPTIONS.map((r) => (
            <Chip key={r} active={resolution === r} onClick={() => setResolution(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
