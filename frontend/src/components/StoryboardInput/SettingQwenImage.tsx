import { useState, useEffect } from "react"

interface SettingQwenImageProps {
  onChange?: (params: Record<string, any>) => void
}

const SIZE_OPTIONS = [
  { label: "1:1", value: "1328x1328" },
  { label: "16:9", value: "1664x928" },
  { label: "9:16", value: "928x1664" },
  { label: "4:3", value: "1472x1140" },
  { label: "3:4", value: "1140x1472" },
  { label: "3:2", value: "1584x1056" },
  { label: "2:3", value: "1056x1584" },
] as const

const COUNT_OPTIONS = [1, 2, 3, 4] as const

export default function SettingQwenImage({ onChange }: SettingQwenImageProps) {
  const [imageSize, setImageSize] = useState<string>("1664x928")
  const [count, setCount] = useState<number>(2)

  useEffect(() => {
    onChange?.({ image_size: imageSize, count })
  }, [imageSize, count])

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
          {SIZE_OPTIONS.map((s) => (
            <Chip key={s.value} active={imageSize === s.value} onClick={() => setImageSize(s.value)}>
              {s.label}
            </Chip>
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
