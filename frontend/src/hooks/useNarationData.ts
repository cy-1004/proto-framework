import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"
import type { NarationData } from "@/types/asset"

export default function useNarationData(assetId: string | null) {
  const [data, setData] = useState<NarationData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!assetId) { setData(null); return }
    setLoading(true)
    try {
      const res = await apiFetch(`/api/narations/${assetId}`)
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [assetId])

  useEffect(() => { load() }, [load])

  const updateContent = useCallback(async (content: string) => {
    if (!assetId) return
    try {
      const res = await apiFetch(`/api/narations/${assetId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
  }, [assetId])

  const synthesize = useCallback(async (voiceId?: string) => {
    if (!assetId) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/narations/${assetId}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_id: voiceId }),
      })
      if (res.ok) {
        setData(await res.json())
        window.dispatchEvent(new Event("assets-updated"))
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [assetId])

  const reset = useCallback(async () => {
    if (!assetId) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/narations/${assetId}/reset`, { method: "POST" })
      if (res.ok) {
        setData(await res.json())
        window.dispatchEvent(new Event("assets-updated"))
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [assetId])

  return { data, loading, reload: load, updateContent, synthesize, reset }
}
