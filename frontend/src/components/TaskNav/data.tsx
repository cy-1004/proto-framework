import { MessageSquare, SlidersHorizontal, Share2Icon } from "lucide-react"
import { TASK_STAGES } from "@/config/options"
import type { HeadNavTab, HeadNavAction } from "@/components/ui/HeadNav"

export const tabs: HeadNavTab[] = TASK_STAGES.stages.map((s) => ({
  id: s.id,
  label: s.label,
  icon: s.icon,
}))

export function getActions(opts: {
  showChat: boolean
  onToggleChat: () => void
  onExport?: () => void
}): HeadNavAction[] {
  const actions: HeadNavAction[] = []
  if (opts.onExport) {
    actions.push({
      icon: <Share2Icon className="size-4" />,
      active: false,
      onClick: opts.onExport,
      title: "Export StoryLine",
    })
  }
  actions.push({
    icon: opts.showChat
      ? <SlidersHorizontal className="size-4" />
      : <MessageSquare className="size-4" />,
    active: opts.showChat,
    onClick: opts.onToggleChat,
    title: opts.showChat ? "Properties" : "Chat",
  })
  return actions
}
