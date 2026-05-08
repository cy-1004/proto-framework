export interface ProductAsset {
  id: string
  product_id: string
  asset_type: "image" | "video" | "affiliate_video"
  origin_url: string
  thumbnail_url: string
  width: number | null
  height: number | null
  duration: number | null
  created_at: string
}

export interface ScriptReference {
  id: number
  origin_url: string | null
  backup_url: string | null
  title: string | null
  mediatype: "video" | "audio" | "text" | null
  thumbnail: string | null
  text_speech: string | null
  text_visual: string | null
  text_drama: string | null
  like_count: number
  comment_count: number
  collect_count: number
  share_count: number
  view_count: number
}

export interface Product {
  id: string
  product_id: string
  seller_id: string
  title: string
  description: string
  category: string
  slug: string
  canonical_url: string
  cover_image: string
  images: string
  created_at: string
  assets?: ProductAsset[]
}
