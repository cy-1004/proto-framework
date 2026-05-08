import type { ScriptReference } from "@/types/product"
import CardReference from "./CardReference"

interface ScriptReferenceListProps {
  references: ScriptReference[]
  selectedId?: number
  onSelect: (ref: ScriptReference) => void
}

export default function ScriptReferenceList({ references, selectedId, onSelect }: ScriptReferenceListProps) {
  if (references.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
        暂无参考示例
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-3">
      {references.map((ref) => (
        <CardReference
          key={ref.id}
          reference={ref}
          selected={selectedId === ref.id}
          onClick={() => onSelect(ref)}
        />
      ))}
    </div>
  )
}
