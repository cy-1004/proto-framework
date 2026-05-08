import type { Product } from "@/types/product"
import CardProduct from "./CardProduct"

interface ProductListProps {
  products: Product[]
  selectedId?: string
  onSelect: (product: Product) => void
}

export default function ProductList({ products, selectedId, onSelect }: ProductListProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
        暂无商品
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-3">
      {products.map((product) => (
        <CardProduct
          key={product.id}
          product={product}
          selected={selectedId === product.id}
          onClick={() => onSelect(product)}
        />
      ))}
    </div>
  )
}
