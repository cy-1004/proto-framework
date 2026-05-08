import HeadNav from "@/components/ui/HeadNav"
import TikTokButtons from "@/components/TikTok/TikTokButtons"
import { tabs, getActions } from "./data"

interface TaskNavProps {
  title: string
  activeTabId?: string
  onTabChange: (tabId: string) => void
  onBack: () => void
  showChat: boolean
  onToggleChat: () => void
  onExport?: () => void
}

export default function TaskNav({
  title,
  activeTabId,
  onTabChange,
  onBack,
  showChat,
  onToggleChat,
  onExport,
}: TaskNavProps) {
  const config = {
    tabs,
    actions: getActions({ showChat, onToggleChat, onExport }),
  }

  return (
    <HeadNav
      config={config}
      title={"项目名称：" + title}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      onBack={onBack}
      extraActions={<TikTokButtons taskTitle={title} />}
    />
  )
}
