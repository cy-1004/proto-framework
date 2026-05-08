import { useMemo, useState } from "react"
import ChatInput from "@/components/ui/ChatInput"
import { createConfig } from "./data"

interface ScriptEditorInputProps {
  onSubmit: (query: string, mode: string, params?: Record<string, any>) => void
  disabled?: boolean
}

export default function ScriptEditorInput({ onSubmit, disabled }: ScriptEditorInputProps) {
  const [language, setLanguage] = useState("中文")

  const config = useMemo(
    () =>
      createConfig({
        language,
        onLanguageChange: setLanguage,
        onFreechat: (query: string) => onSubmit(query, "freechat"),
        onGenerate: (query: string, mediaType: string, provider: string, params?: Record<string, any>) =>
          onSubmit(query, `generate:${mediaType}:${provider}`, params),
      }),
    [onSubmit, language],
  )

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : ""}>
      <ChatInput config={config} defaultPlaceholder="输入内容..." />
    </div>
  )
}
