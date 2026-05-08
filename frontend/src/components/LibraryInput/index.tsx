import { useMemo } from "react"
import ChatInput from "@/components/ui/ChatInput"
import { createConfig } from "./data"

interface LibraryInputProps {
  onSubmit: (query: string, mode: string) => void
  disabled?: boolean
}

export default function LibraryInput({ onSubmit, disabled }: LibraryInputProps) {
  const config = useMemo(
    () =>
      createConfig({
        onFreechat: (query: string) => onSubmit(query, "freechat"),
        onSearch: (query: string, assetType: string) => onSubmit(query, `search:${assetType}`),
      }),
    [onSubmit],
  )

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : ""}>
      <ChatInput config={config} defaultPlaceholder="输入内容..." />
    </div>
  )
}
