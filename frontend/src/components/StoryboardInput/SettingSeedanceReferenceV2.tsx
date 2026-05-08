import { useState, useEffect } from "react"

interface SettingSeedanceReferenceV2Props {
  onChange?: (params: Record<string, any>) => void
}

const RATIO_OPTIONS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"] as const
const RESOLUTION_OPTIONS = ["480p", "720p", "1080p"] as const

export default function SettingSeedanceReferenceV2({ onChange }: SettingSeedanceReferenceV2Props) {
  const [duration, setDuration] = useState<number>(5)
  const [autoMode, setAutoMode] = useState(false)
  const [ratio, setRatio] = useState<string>("16:9")
  const [resolution, setResolution] = useState<string>("720p")
  const [generateAudio, setGenerateAudio] = useState(true)

  useEffect(() => {
    onChange?.({
      duration: autoMode ? -1 : duration,
      ratio,
      resolution,
      generate_audio: generateAudio,
      watermark: false,
      generation_mode: "reference",
    })
  }, [duration, autoMode, ratio, resolution, generateAudio])

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
          <span className="text-muted-foreground">{autoMode ? "auto" : `${duration}s`}</span>
        </div>
        <div className="flex items-center gap-2">
          <Chip active={autoMode} onClick={() => setAutoMode(true)}>auto</Chip>
          <input
            type="range"
            min={4}
            max={15}
            step={1}
            value={duration}
            onChange={(e) => { setDuration(Number(e.target.value)); setAutoMode(false) }}
            className="flex-1 accent-primary"
          />
        </div>
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
        <span className="font-medium text-foreground">分辨率</span>
        <div className="flex flex-wrap gap-1">
          {RESOLUTION_OPTIONS.map((r) => (
            <Chip key={r} active={resolution === r} onClick={() => setResolution(r)}>{r}</Chip>
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
