import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { apiFetch } from "@/lib/api"
import PanelScript, { type Narration } from "./PanelScript"
import ScriptStoryboard, { type StoryboardData } from "./ScriptStoryboard"

interface ScriptEditorProps {
  taskId?: number
}

/** Try to parse narration content as structured storyboard JSON. */
function parseStructured(content: string | undefined) {
  if (!content) return null
  try {
    const parsed = JSON.parse(content)
    if (parsed?.video_project) return parsed
  } catch {}
  return null
}

export default function ScriptEditor({ taskId }: ScriptEditorProps) {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const effectiveTaskId = taskId ?? (id != null ? Number(id) : undefined)

  const [narrations, setNarrations] = useState<Narration[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Auto-select narration from ?n=<id> query param (set by chat panel card click)
  useEffect(() => {
    const n = searchParams.get("n")
    if (n) {
      setSelectedId(n)
      const next = new URLSearchParams(searchParams)
      next.delete("n")
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const [panelOpen, setPanelOpen] = useState(true)
  const [saving, setSaving] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedNarration = narrations.find((n) => n.id === selectedId) ?? null

  // Detect structured JSON content — switch view accordingly
  const structuredData = useMemo(
    () => parseStructured(selectedNarration?.content),
    [selectedNarration?.content],
  )

  const loadNarrations = useCallback(() => {
    if (effectiveTaskId == null) return
    apiFetch(`/api/tasks/${effectiveTaskId}/narations`)
      .then((r) => r.json())
      .then((items: Array<{ asset_id: string; asset: any }>) => {
        setNarrations((prev) => {
          const prevMap = new Map(prev.map((n) => [n.id, n]))
          return items.map((item) => {
            const existing = prevMap.get(item.asset_id)
            return {
              id: item.asset_id,
              title: item.asset?.name ?? "未命名",
              content: existing?.content ?? "",
              tts_done: existing?.tts_done ?? "0",
              duration: item.asset?.duration ?? null,
              created_at: item.asset?.created_at ?? "",
            }
          })
        })
      })
      .catch(console.error)
  }, [effectiveTaskId])

  const loadNarrationDetail = useCallback(async (narrationId: string) => {
    try {
      const res = await apiFetch(`/api/narations/${narrationId}`)
      const data = await res.json()
      setNarrations((prev) => {
        const exists = prev.some((n) => n.id === narrationId)
        const updated = { id: narrationId, title: data.title, content: data.content ?? "", tts_done: data.tts_done ?? "0", duration: data.duration ?? null, created_at: data.created_at ?? "" }
        // If narration not yet in list (race with loadNarrations), insert it so the
        // middle area can render immediately without waiting for the list to reload.
        return exists ? prev.map((n) => (n.id === narrationId ? { ...n, ...updated } : n)) : [...prev, updated]
      })
      return data
    } catch (e) {
      console.error(e)
      return null
    }
  }, [])

  useEffect(() => {
    loadNarrations()
  }, [loadNarrations])

  useEffect(() => {
    const handler = () => loadNarrations()
    window.addEventListener("narrations-updated", handler)
    return () => window.removeEventListener("narrations-updated", handler)
  }, [loadNarrations])

  // Keep a stable ref to narrations so we can read the current title without
  // adding narrations to the dependency array (avoids re-firing on every reload).
  const narrationRef = useRef(narrations)
  useEffect(() => { narrationRef.current = narrations }, [narrations])

  // Broadcast selected narration ID + title to ChatPanel (@tag display).
  useEffect(() => {
    const title = narrationRef.current.find((n) => n.id === selectedId)?.title ?? null
    window.dispatchEvent(
      new CustomEvent("script-narration-selected", { detail: { narrationId: selectedId, narrationTitle: title } }),
    )
  }, [selectedId])

  useEffect(() => {
    if (selectedId) loadNarrationDetail(selectedId)
  }, [selectedId, loadNarrationDetail])

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[300px] px-8 py-6",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!selectedId || structuredData) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveContent(selectedId, ed.getHTML())
      }, 800)
    },
  })

  useEffect(() => {
    if (!editor || structuredData) return
    const content = selectedNarration?.content ?? ""
    const current = editor.getHTML()
    if (content !== current) {
      editor.commands.setContent(content || "<p></p>")
    }
  }, [editor, selectedId, selectedNarration?.content, structuredData])

  const saveContent = async (narrationId: string, html: string) => {
    setSaving(true)
    try {
      const plain = html.replace(/<[^>]*>/g, "").trim()
      await apiFetch(`/api/narations/${narrationId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: plain }),
      })
      setNarrations((prev) =>
        prev.map((n) => (n.id === narrationId ? { ...n, content: plain } : n)),
      )
    } catch (e) {
      console.error("Save failed:", e)
    } finally {
      setSaving(false)
    }
  }

  const saveStructured = useCallback(
    async (data: StoryboardData) => {
      if (!selectedId) return
      setSaving(true)
      try {
        const contentStr = JSON.stringify(data)
        await apiFetch(`/api/narations/${selectedId}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: contentStr }),
        })
        setNarrations((prev) =>
          prev.map((n) => (n.id === selectedId ? { ...n, content: contentStr } : n)),
        )
      } catch (e) {
        console.error("Save structured failed:", e)
      } finally {
        setSaving(false)
      }
    },
    [selectedId],
  )

  const handleDelete = async (narrationId: string) => {
    if (effectiveTaskId == null) return
    try {
      await apiFetch(`/api/tasks/${effectiveTaskId}/narations/${narrationId}`, { method: "DELETE" })
      setNarrations((prev) => prev.filter((n) => n.id !== narrationId))
      if (selectedId === narrationId) {
        setSelectedId(null)
        editor?.commands.setContent("<p></p>")
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="flex h-full">
      <PanelScript
        open={panelOpen}
        onToggle={() => setPanelOpen((v) => !v)}
        narrations={narrations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onDelete={handleDelete}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedNarration ? (
          <>
            <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
              <h3 className="text-sm font-medium">{selectedNarration.title}</h3>
              <span className="text-[11px] text-muted-foreground">
                {saving ? "保存中..." : "已保存"}
              </span>
            </div>

            <div className="flex-1 overflow-auto">
              {structuredData ? (
                <ScriptStoryboard
                  key={selectedId}
                  data={structuredData}
                  onSave={saveStructured}
                />
              ) : (
                <EditorContent editor={editor} />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium text-foreground">脚本创作</p>
              <p className="text-sm text-muted-foreground">
                {narrations.length > 0
                  ? "选择左侧旁白开始编辑"
                  : "通过写作模式创建新旁白"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
