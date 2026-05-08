import { useMemo } from "react"
import ChatInput from "@/components/ui/ChatInput"
import { createConfig } from "./data"

interface FinecutInputProps {
  onSubmit: (query: string, mode: string) => void
  disabled?: boolean
}

export default function FinecutInput({ onSubmit, disabled }: FinecutInputProps) {
  const config = useMemo(
    () =>
      createConfig({
        onFreechat: (query: string) => onSubmit(query, "freechat"),
      }),
    [onSubmit],
  )

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : ""}>
      <ChatInput config={config} defaultPlaceholder="输入内容..." />
    </div>
  )
}
