import { MessageSquare, Video, Image, ImagePlus, Layers } from "lucide-react"
import type { ChatInputConfig } from "@/components/ui/ChatInput"
import SettingSeedanceReferenceV2 from "./SettingSeedanceReferenceV2"
import SettingSeedanceFirstLastV2 from "./SettingSeedanceFirstLastV2"
import SettingVeoReference from "./SettingVeoReference"
import SettingVeoFirstLast from "./SettingVeoFirstLast"
import SettingJimeng from "./SettingJimeng"
import SettingNano from "./SettingNano"

export function createConfig(handlers: {
  onFreechat: (query: string) => void
  onGenerate: (query: string, mediaType: string, provider: string, params?: Record<string, any>) => void
}): ChatInputConfig {
  return {
    show: {
      size: "small",
      menuPos: "up",
    },
    menu: [
      {
        label: "生视频",
        icon: <Video className="size-3.5" />,
        placeholder: "描述你想要的视频...",
        subMenu: [
          {
            label: "参考生成",
            icon: <ImagePlus className="size-3.5" />,
            subMenu: [
              {
                label: "SD 2.0",
                statusValue: 35,
                onSubmit: (query: string, params?: Record<string, any>) => {
                  handlers.onGenerate(query, "video", "seedance_v2", params)
                },
                controller: {
                  label: "setting",
                  pos: "up" as const,
                  widget: <SettingSeedanceReferenceV2 />,
                  uploadConfig: {
                    maxFiles: 9,
                    accept: ".jpg,.jpeg,.png,.mp4,.mov,.mp3,.wav",
                    maxSizeMB: 50,
                    hint: "上传图片/视频/音频作为参考",
                  },
                },
              },
              {
                label: "SD 2.0 Fast",
                statusValue: 36,
                onSubmit: (query: string, params?: Record<string, any>) => {
                  handlers.onGenerate(query, "video", "seedance_v2_fast", params)
                },
                controller: {
                  label: "setting",
                  pos: "up" as const,
                  widget: <SettingSeedanceReferenceV2 />,
                  uploadConfig: {
                    maxFiles: 9,
                    accept: ".jpg,.jpeg,.png,.mp4,.mov,.mp3,.wav",
                    maxSizeMB: 50,
                    hint: "上传图片/视频/音频作为参考",
                  },
                },
              },
              {
                label: "Veo3.1",
                statusValue: 30,
                onSubmit: (query: string, params?: Record<string, any>) => {
                  handlers.onGenerate(query, "video", "veo3.1", params)
                },
                controller: {
                  label: "setting",
                  pos: "up" as const,
                  widget: <SettingVeoReference />,
                  uploadConfig: {
                    maxFiles: 3,
                    accept: ".jpg,.jpeg,.png",
                    maxSizeMB: 20,
                    hint: "上传参考图片（最多3张）",
                  },
                },
              },
            ],
          },
          {
            label: "首尾帧",
            icon: <Layers className="size-3.5" />,
            subMenu: [
              {
                label: "SD 2.0 Fast",
                statusValue: 36,
                onSubmit: (query: string, params?: Record<string, any>) => {
                  handlers.onGenerate(query, "video", "seedance_v2_fast", params)
                },
                controller: {
                  label: "setting",
                  pos: "up" as const,
                  widget: <SettingSeedanceFirstLastV2 />,
                  uploadConfig: {
                    maxFiles: 2,
                    accept: ".jpg,.jpeg,.png",
                    hint: "图片1=首帧，图片2=尾帧（可选）",
                  },
                },
              },
              {
                label: "SD 2.0",
                statusValue: 35,
                onSubmit: (query: string, params?: Record<string, any>) => {
                  handlers.onGenerate(query, "video", "seedance_v2", params)
                },
                controller: {
                  label: "setting",
                  pos: "up" as const,
                  widget: <SettingSeedanceFirstLastV2 />,
                  uploadConfig: {
                    maxFiles: 2,
                    accept: ".jpg,.jpeg,.png",
                    hint: "图片1=首帧，图片2=尾帧（可选）",
                  },
                },
              },
              {
                label: "Veo3.1",
                statusValue: 30,
                onSubmit: (query: string, params?: Record<string, any>) => {
                  handlers.onGenerate(query, "video", "veo3.1", params)
                },
                controller: {
                  label: "setting",
                  pos: "up" as const,
                  widget: <SettingVeoFirstLast />,
                  uploadConfig: {
                    maxFiles: 2,
                    accept: ".jpg,.jpeg,.png",
                    maxSizeMB: 20,
                    hint: "图片1=首帧，图片2=尾帧（可选）",
                  },
                },
              },
            ],
          },
        ],
      },
      {
        label: "生图片",
        icon: <Image className="size-3.5" />,
        placeholder: "描述你想要的图片...",
        subMenu: [
          {
            label: "seedream 5.0",
            statusValue: 21,
            onSubmit: (query: string, params?: Record<string, any>) => {
              handlers.onGenerate(query, "image", "jimeng", params)
            },
            controller: {
              label: "setting",
              pos: "up" as const,
              widget: <SettingJimeng />,
              uploadConfig: {
                maxFiles: 10,
                accept: ".jpg,.jpeg,.png",
                maxSizeMB: 10,
                hint: "上传参考图片（可选，图生图）",
              },
            },
          },
          {
            label: "banana2",
            statusValue: 22,
            onSubmit: (query: string, params?: Record<string, any>) => {
              handlers.onGenerate(query, "image", "nanobanana2", params)
            },
            controller: {
              label: "setting",
              pos: "up" as const,
              widget: <SettingNano />,
              uploadConfig: {
                maxFiles: 10,
                accept: ".jpg,.jpeg,.png",
                maxSizeMB: 10,
                hint: "上传参考图片（可选，图生图）",
              },
            },
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
