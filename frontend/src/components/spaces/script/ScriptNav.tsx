import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"

const NAV_ITEMS = [
  { key: "product", label: "商品" },
  { key: "reference", label: "参考示例" },
  { key: "editor", label: "脚本创作" },
] as const

export default function ScriptNav() {
  const navigate = useNavigate()
  const { id, category = "product" } = useParams()

  return (
    <div className="flex items-center justify-between border-b px-1 py-1.5">
      <div className="flex items-center gap-0.5">
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.key}
            variant={category === item.key ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate(`/task/${id}/script/${item.key}`, { replace: true })}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
