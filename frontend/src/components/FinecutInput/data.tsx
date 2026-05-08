import { MessageSquare } from "lucide-react"
import type { ChatInputConfig } from "@/components/ui/ChatInput"

export function createConfig(handlers: {
  onFreechat: (query: string) => void
}): ChatInputConfig {
  return {
    show: {
      size: "small",
      menuPos: "up",
    },
    menu: [
      {
        label: "自由聊天",
        icon: <MessageSquare className="size-3.5" />,
        placeholder: "随便聊聊...",
        statusValue: 1,
        onSubmit: handlers.onFreechat,
      },
    ],
  }
}
