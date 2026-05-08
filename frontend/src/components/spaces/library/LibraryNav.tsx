import type { ReactNode } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"

const NAV_ITEMS = [
  { key: "all", label: "全部" },
  { key: "image", label: "图像" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
  { key: "reference", label: "参考素材" },
  { key: "naration", label: "旁白" },
  { key: "favorite", label: "我的收藏" },
] as const

interface LibraryNavProps {
  children?: ReactNode
}

export default function LibraryNav({ children }: LibraryNavProps) {
  const navigate = useNavigate()
  const { id, category = "all" } = useParams()

  return (
    <div className="flex items-center justify-between border-b px-1 py-1.5">
      <div className="flex items-center gap-0.5">
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.key}
            variant={category === item.key ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate(`/task/${id}/lib/${item.key}`, { replace: true })}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
