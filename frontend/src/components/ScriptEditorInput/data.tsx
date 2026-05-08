import { PenLine, MessageSquare } from "lucide-react"
import type { ChatInputConfig } from "@/components/ui/ChatInput"
import SettingLanguage from "./SettingLanguage"

export function createConfig(handlers: {
  language: string
  onLanguageChange: (lang: string) => void
  onFreechat: (query: string) => void
  onGenerate: (query: string, mediaType: string, provider: string, params?: Record<string, any>) => void
}): ChatInputConfig {
  return {
    show: {
      size: "small",
      menuPos: "up",
      upload: false,
    },
    menu: [
      {
        label: "写作",
        icon: <PenLine className="size-3.5" />,
        placeholder: "输入旁白内容，将为当前任务创建新旁白...",
        statusValue: 40,
        onSubmit: (query: string, params?: Record<string, any>) =>
          handlers.onGenerate(query, "narration", "default", params),
        controller: {
          label: handlers.language,
          pos: "up" as const,
          align: "left" as const,
          widget: <SettingLanguage onSelect={handlers.onLanguageChange} value={handlers.language} />,
        },
      },
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
