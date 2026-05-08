import { useState, useEffect } from "react"

interface SettingLanguageProps {
  onChange?: (params: Record<string, any>) => void
  onSelect?: (language: string) => void
  value?: string
}

const LANGUAGE_OPTIONS = ["中文", "English", "日本語", "한국어"] as const

export default function SettingLanguage({ onChange, onSelect, value }: SettingLanguageProps) {
  const [language, setLanguage] = useState<string>(value ?? "中文")

  useEffect(() => {
    onChange?.({ language })
    onSelect?.(language)
  }, [language])

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground">输出语言</span>
        <div className="flex flex-wrap gap-1">
          {LANGUAGE_OPTIONS.map((l) => (
            <button
              key={l}
              type="button"
              className={`rounded-md border px-2 py-1 transition-colors ${
                language === l
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
              onClick={() => setLanguage(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
