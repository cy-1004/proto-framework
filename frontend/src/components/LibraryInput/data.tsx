import { Image, List, MessageSquare, Music, Search, Video, FileText } from "lucide-react"
import type { ChatInputConfig } from "@/components/ui/ChatInput"

export function createConfig(handlers: {
  onFreechat: (query: string) => void
  onSearch: (query: string, assetType: string) => void
}): ChatInputConfig {
  return {
    show: {
      size: "small",
      upload: false,
      menuPos: "up",
    },
    menu: [
      {
        label: "搜索",
        icon: <Search className="size-3.5" />,
        placeholder: "描述你要搜索的素材...",
        subMenu: [
          {
            label: "全部",
            icon: <List className="size-3.5" />,
            statusValue: 10,
            onSubmit: (query: string) => handlers.onSearch(query, "all"),
          },
          {
            label: "图片",
            icon: <Image className="size-3.5" />,
            statusValue: 11,
            onSubmit: (query: string) => handlers.onSearch(query, "image"),
          },
          {
            label: "视频",
            icon: <Video className="size-3.5" />,
            statusValue: 12,
            onSubmit: (query: string) => handlers.onSearch(query, "video"),
          },
          {
            label: "音频",
            icon: <Music className="size-3.5" />,
            statusValue: 13,
            onSubmit: (query: string) => handlers.onSearch(query, "audio"),
          },
          {
            label: "参考",
            icon: <FileText className="size-3.5" />,
            statusValue: 14,
            onSubmit: (query: string) => handlers.onSearch(query, "reference"),
          },
        ],
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
