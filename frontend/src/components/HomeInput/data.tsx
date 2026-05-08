import { Image, List, Music, Search, Sparkles, Video } from "lucide-react"
import type { ChatInputConfig } from "@/components/ui/ChatInput"

const config: ChatInputConfig = {
  show: {
    size: "large",
    upload: false,
    menuPos: "down",
  },
  menu: [
    {
      label: "搜素材",
      icon: <Search className="size-3.5" />,
      placeholder: "描述你的需求, 创建新任务...",
      subMenu: [
        {
          label: "全部",
          icon: <List className="size-3.5" />,
          statusValue: 1,
          onSubmit: (query: string) => {
            console.log(query, "search-all")
          },
        },
        {
          label: "图片",
          icon: <Image className="size-3.5" />,
          statusValue: 2,
          onSubmit: (query: string) => {
            console.log(query, "search-image")
          },
        },
        {
          label: "视频",
          icon: <Video className="size-3.5" />,
          statusValue: 3,
          onSubmit: (query: string) => {
            console.log(query, "search-video")
          },
        },
        {
          label: "音频",
          icon: <Music className="size-3.5" />,
          statusValue: 4,
          onSubmit: (query: string) => {
            console.log(query, "search-audio")
          },
        },
      ],
    },
    {
      label: "素材生成",
      icon: <Sparkles className="size-3.5" />,
      placeholder: "描述你的需求, 创建新任务...",
      subMenu: [
        {
          label: "图片",
          icon: <Image className="size-3.5" />,
          statusValue: 6,
          onSubmit: (query: string) => {
            console.log(query, "generate-image")
          },
        },
        {
          label: "视频",
          icon: <Video className="size-3.5" />,
          statusValue: 7,
          onSubmit: (query: string) => {
            console.log(query, "generate-video")
          },
        },
        {
          label: "音频",
          icon: <Music className="size-3.5" />,
          statusValue: 8,
          onSubmit: (query: string) => {
            console.log(query, "generate-audio")
          },
        },
      ],
    }
  ]
}

export default config
