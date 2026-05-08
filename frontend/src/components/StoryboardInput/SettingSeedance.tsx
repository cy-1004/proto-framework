import { useState, useEffect } from "react"

interface SettingSeedanceProps {
  onChange?: (params: Record<string, any>) => void
}

const DURATION_OPTIONS = [5, 10] as const
const CAMERA_OPTIONS = [
  { label: "运动", value: false },
  { label: "固定", value: true },
] as const

export default function SettingSeedance({ onChange }: SettingSeedanceProps) {
  const [duration, setDuration] = useState<number>(5)
  const [cameraFixed, setCameraFixed] = useState<boolean>(false)

  useEffect(() => {
    onChange?.({ duration, camera_fixed: cameraFixed, count: 1 })
  }, [duration, cameraFixed])

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
        <span className="font-medium text-foreground">时长</span>
        <div className="flex flex-wrap gap-1">
          {DURATION_OPTIONS.map((d) => (
            <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>{d}s</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground">镜头</span>
        <div className="flex flex-wrap gap-1">
          {CAMERA_OPTIONS.map((c) => (
            <Chip key={String(c.value)} active={cameraFixed === c.value} onClick={() => setCameraFixed(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
