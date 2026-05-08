import { ImageIcon } from "lucide-react"
import type { Product } from "@/types/product"

interface CardProductProps {
  product: Product
  selected?: boolean
  onClick?: () => void
}

export default function CardProduct({ product, selected, onClick }: CardProductProps) {
  const coverSrc = product.cover_image ? `/media/${product.cover_image}` : null

  return (
    <div
      className={`group cursor-pointer overflow-hidden rounded-lg border transition-colors ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
      }`}
      onClick={onClick}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {coverSrc ? (
          <img src={coverSrc} alt={product.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-8" />
          </div>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-xs font-medium">{product.title}</p>
      </div>
    </div>
  )
}
