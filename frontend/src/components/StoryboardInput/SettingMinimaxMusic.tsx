import { useState, useEffect } from "react"

interface SettingMinimaxMusicProps {
  onChange?: (params: Record<string, any>) => void
}

export default function SettingMinimaxMusic({ onChange }: SettingMinimaxMusicProps) {
  const [isInstrumental, setIsInstrumental] = useState(false)
  const [lyricsOptimizer, setLyricsOptimizer] = useState(true)
  const [lyrics, setLyrics] = useState("")

  useEffect(() => {
    onChange?.({
      is_instrumental: isInstrumental,
      lyrics_optimizer: lyricsOptimizer,
      lyrics: lyrics || undefined,
      count: 1,
    })
  }, [isInstrumental, lyricsOptimizer, lyrics])

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
        <span className="font-medium text-foreground">类型</span>
        <div className="flex flex-wrap gap-1">
          <Chip active={!isInstrumental} onClick={() => setIsInstrumental(false)}>歌曲</Chip>
          <Chip active={isInstrumental} onClick={() => setIsInstrumental(true)}>纯音乐</Chip>
        </div>
      </div>

      {!isInstrumental && (
        <>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={lyricsOptimizer}
                onChange={(e) => setLyricsOptimizer(e.target.checked)}
                className="accent-primary"
              />
              <span className="font-medium text-foreground">自动生成歌词</span>
            </label>
          </div>

          {!lyricsOptimizer && (
            <div className="flex flex-col gap-1.5">
              <span className="font-medium text-foreground">歌词</span>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder={"[Verse]\n歌词内容...\n[Chorus]\n副歌内容..."}
                rows={5}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
