import { useState, useEffect } from "react"
import { Play } from "lucide-react"
import { apiFetch } from "@/lib/api"
import type { Product, ProductAsset } from "@/types/product"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground w-16">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  )
}

function parseCategory(raw: string): string {
  try {
    const obj = JSON.parse(raw)
    return [obj.first, obj.second, obj.third].filter(Boolean).join(" > ")
  } catch {
    return raw
  }
}

interface PropertyProductProps {
  product: Product
}

export default function PropertyProduct({ product }: PropertyProductProps) {
  const [detail, setDetail] = useState<Product | null>(null)

  useEffect(() => {
    apiFetch(`/api/products/${product.id}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(console.error)
  }, [product.id])

  const assets = detail?.assets ?? []
  const coverSrc = product.cover_image ? `/media/${product.cover_image}` : null

  return (
    <div className="space-y-3">
      {coverSrc && (
        <img src={coverSrc} alt={product.title} className="w-full rounded-lg" />
      )}

      {assets.length > 0 && (
        <div className="space-y-2">
          {assets.map((a) => (
            <AssetPreview key={a.id} asset={a} />
          ))}
        </div>
      )}

      <div className="space-y-2 text-xs">
        <Row label="名称" value={product.title} />
        {product.description && <Row label="描述" value={product.description} />}
        {product.category && <Row label="分类" value={parseCategory(product.category)} />}
        {product.canonical_url && (
          <div className="flex gap-2">
            <span className="shrink-0 text-muted-foreground w-16">链接</span>
            <a href={product.canonical_url} target="_blank" rel="noreferrer" className="text-primary underline break-all">
              查看商品
            </a>
          </div>
        )}
        {product.created_at && <Row label="创建时间" value={product.created_at} />}
      </div>
    </div>
  )
}

function AssetPreview({ asset }: { asset: ProductAsset }) {
  const [playing, setPlaying] = useState(false)

  if (asset.asset_type === "image") {
    return (
      <img
        src={`/media/${asset.origin_url}`}
        alt=""
        className="w-full rounded-lg"
      />
    )
  }

  if (!playing) {
    return (
      <div className="relative cursor-pointer overflow-hidden rounded-lg bg-black" onClick={() => setPlaying(true)}>
        {asset.thumbnail_url ? (
          <img src={`/media/${asset.thumbnail_url}`} alt="" className="w-full" />
        ) : (
          <div className="aspect-video bg-muted" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-5 w-5 translate-x-0.5 text-black" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <video
      src={`/media/${asset.origin_url}`}
      controls
      autoPlay
      className="w-full rounded-lg"
    />
  )
}
