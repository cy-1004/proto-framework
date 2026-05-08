import { useState, useEffect } from "react"
import type { MediaFileInfo } from "@/components/ui/MediaUploader"

interface SettingVeoFirstLastProps {
  onChange?: (params: Record<string, any>) => void
  mediaFiles?: MediaFileInfo[]
}

const RATIO_OPTIONS = ["16:9", "9:16"] as const
const DURATION_OPTIONS = [4, 6, 8] as const
const RESOLUTION_OPTIONS = ["720p", "1080p", "4k"] as const

export default function SettingVeoFirstLast({ onChange, mediaFiles = [] }: SettingVeoFirstLastProps) {
  const [ratio, setRatio] = useState<string>("16:9")
  const [duration, setDuration] = useState<number>(8)
  const [resolution, setResolution] = useState<string>("720p")
  const imageCount = mediaFiles.filter((file) => file.mediaType === "image").length
  const hasLastFrame = imageCount > 1
  const durationLocked = hasLastFrame || resolution === "1080p" || resolution === "4k"

  useEffect(() => {
    if (durationLocked && duration !== 8) {
      setDuration(8)
    }
  }, [durationLocked, duration])

  useEffect(() => {
    onChange?.({
      aspect_ratio: ratio,
      duration: durationLocked ? 8 : duration,
      resolution,
      count: 1,
      generation_mode: "first_last",
    })
  }, [ratio, duration, resolution, durationLocked, onChange])

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
          {DURATION_OPTIONS.map((d) => (
            <Chip
              key={d}
              active={duration === d}
              disabled={durationLocked && d !== 8}
              onClick={() => setDuration(d)}
            >
              {d}s
            </Chip>
          ))}
        </div>
        {hasLastFrame ? (
          <span className="text-[10px] text-muted-foreground">首尾帧仅支持 8s</span>
        ) : resolution !== "720p" ? (
          <span className="text-[10px] text-muted-foreground">{resolution} 仅支持 8s</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">只上传首帧时可选 4s / 6s / 8s</span>
        )}
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
