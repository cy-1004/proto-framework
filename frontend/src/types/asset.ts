export interface Asset {
  id: string
  name: string
  name_cn: string
  type: "image" | "video" | "audio" | "reference" | "naration"
  subtype: string
  thumbnail: string | null
  score: number
  featured: "0" | "1"
  desc: string | null
  tags: string | null
  mediatype: "image" | "video" | "audio" | null
  category: string | null
  format: string | null
  uri: string | null
  size: number
  width: number | null
  height: number | null
  duration: number | null
  source: "uploaded" | "created"
  user_id: string
  favorite: "0" | "1"
  created_at: string | null
}

export interface SubtitleSegment {
  text: string
  time_begin: number
  time_end: number
}

export interface NarationData {
  id: string
  title: string
  content: string
  tts_done: "0" | "1"
  audio: string | null
  subtitles: string | null
  uri: string | null
  duration: number | null
  size: number
  segments?: SubtitleSegment[]
}
