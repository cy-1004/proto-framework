import { Fragment, useRef, useState, useEffect, type ReactNode } from "react"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface HeadNavTab {
  id: string
  label: string
  icon: ReactNode
}

export interface HeadNavAction {
  icon: ReactNode
  active: boolean
  onClick: () => void
  title: string
}

export interface HeadNavConfig {
  tabs?: HeadNavTab[]
  actions?: HeadNavAction[]
}

interface HeadNavProps {
  config: HeadNavConfig
  title: string
  activeTabId?: string
  onTabChange?: (tabId: string) => void
  onBack?: () => void
  extraActions?: ReactNode
}

export default function HeadNav({
  config,
  title,
  activeTabId,
  onTabChange,
  onBack,
  extraActions,
}: HeadNavProps) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const [barStyle, setBarStyle] = useState({ left: 0, width: 0 })
  const tabs = config.tabs ?? []
  const actions = config.actions ?? []

  useEffect(() => {
    const container = tabsRef.current
    if (!container) return
    const active = container.querySelector<HTMLElement>(
      `[data-tab="${activeTabId}"]`,
    )
    if (!active) return
    setBarStyle({ left: active.offsetLeft, width: active.offsetWidth })
  }, [activeTabId])

  return (
    <nav className="relative flex shrink-0 items-center justify-between border-b px-4 py-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onBack}
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <span className="text-sm font-medium">{title}</span>
        </div>

        {tabs.length > 0 && (
          <div ref={tabsRef} className="relative flex items-center gap-1">
            {tabs.map((tab, index) => (
              <Fragment key={tab.id}>
                <button
                  data-tab={tab.id}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTabId === tab.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onTabChange?.(tab.id)}
                >
                  <span className="size-3.5 [&>svg]:size-3.5">{tab.icon}</span>
                  {tab.label}
                </button>
                {index < tabs.length - 1 && (
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                )}
              </Fragment>
            ))}
            <div
              className="absolute -bottom-2 h-0.5 rounded-full bg-blue-500 transition-all duration-300 ease-in-out"
              style={{ left: barStyle.left, width: barStyle.width }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {extraActions}
        {actions.map((action, i) => (
          <Button
            key={i}
            variant={action.active ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={action.onClick}
            title={action.title}
          >
            {action.icon}
          </Button>
        ))}
      </div>
    </nav>
  )
}
