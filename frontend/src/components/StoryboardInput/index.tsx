import { useMemo } from "react"
import ChatInput, { type EditingAsset } from "@/components/ui/ChatInput"
import { createConfig } from "./data"

interface StoryboardInputProps {
  onSubmit: (query: string, mode: string, params?: Record<string, any>) => void
  disabled?: boolean
  editingAsset?: EditingAsset | null
}

export default function StoryboardInput({ onSubmit, disabled, editingAsset }: StoryboardInputProps) {
  const config = useMemo(
    () =>
      createConfig({
        onFreechat: (query: string) => onSubmit(query, "freechat"),
        onGenerate: (query: string, mediaType: string, provider: string, params?: Record<string, any>) =>
          onSubmit(query, `generate:${mediaType}:${provider}`, params),
      }),
    [onSubmit],
  )

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : ""}>
      <ChatInput config={config} defaultPlaceholder="输入内容..." editingAsset={editingAsset} />
    </div>
  )
}
