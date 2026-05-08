import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { MessageSquarePlusIcon, HistoryIcon } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import MessageList, { type DisplayMessage } from "./MessageList"
import type { ChatMessage } from "./MessageList"
import type { SearchResult } from "./SearchResultCard"
import SessionDrawer from "./SessionDrawer"
import type { ChatSession } from "./SessionDrawer"
import { SEARCH_CONFIG } from "@/config/options"
import { type GenerateResult } from "./GenerateResultCard"
import { type NarrationResult } from "./NarrationResultCard"
import type { Asset } from "@/types/asset"
import type { TaskAssetItem } from "@/types/taskAsset"
import { getCanvasViewportCenter } from "@/lib/canvasViewport"

interface ChatPanelProps {
  taskId: number
  stage: string
  renderInput: (props: { onSubmit: (query: string, mode: string, params?: Record<string, any>) => void; disabled: boolean }) => React.ReactNode
  onSelectAsset?: (asset: Asset) => void
  selectedAssetId?: string
  editingAssetNonce?: number
}

// Placeholder shown in the assistant bubble before any real content arrives.
const THINKING_PLACEHOLDER = "💭 思考中..."

// Typewriter pacing for streaming chat replies.
// ~33 chars/sec — intentionally slower than the raw LLM stream for readability.
const TYPEWRITER_CHARS_PER_TICK = 1
const TYPEWRITER_TICK_MS = 30

interface TypewriterState {
  displayed: string                               // chars already shown
  pending: string                                 // chars still queued
  timer: ReturnType<typeof setTimeout> | null
}

export default function ChatPanel({ taskId, stage, renderInput, onSelectAsset, selectedAssetId, editingAssetNonce }: ChatPanelProps) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [sending, setSending] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [taskAssetIds, setTaskAssetIds] = useState<Set<string>>(new Set())
  const typewriterRef = useRef<Map<number, TypewriterState>>(new Map())
  // Always mirrors selectedNarration?.id — used in async handlers to avoid stale closure.
  const scriptNarrationIdRef = useRef<string | null>(null)
  // Visible @tag: which narration the user is targeting.
  const [selectedNarration, setSelectedNarrationState] = useState<{ id: string; title: string } | null>(null)
  const setSelectedNarration = useCallback((data: { id: string; title: string } | null) => {
    setSelectedNarrationState(data)
    scriptNarrationIdRef.current = data?.id ?? null
  }, [])

  // New session → clear @tag (fresh start).
  useEffect(() => {
    setSelectedNarration(null)
  }, [sessionId, setSelectedNarration])

  // Clean up any running typewriter timers on unmount.
  useEffect(() => {
    const states = typewriterRef.current
    return () => {
      states.forEach((s) => { if (s.timer) clearTimeout(s.timer) })
      states.clear()
    }
  }, [])

  // Left-panel narration click → set @tag with title.
  useEffect(() => {
    const handler = (e: Event) => {
      const { narrationId, narrationTitle } = (e as CustomEvent).detail ?? {}
      setSelectedNarration(narrationId ? { id: narrationId, title: narrationTitle || "旁白" } : null)
    }
    window.addEventListener("script-narration-selected", handler)
    return () => window.removeEventListener("script-narration-selected", handler)
  }, [setSelectedNarration])

  const loadTaskAssetIds = useCallback(() => {
    apiFetch(`/api/tasks/${taskId}/assets`)
      .then((r) => r.json())
      .then((items: TaskAssetItem[]) => setTaskAssetIds(new Set(items.map((it) => it.asset_id))))
      .catch(() => {})
  }, [taskId])

  useEffect(() => { loadTaskAssetIds() }, [loadTaskAssetIds])

  useEffect(() => {
    const handler = () => loadTaskAssetIds()
    window.addEventListener("assets-updated", handler)
    return () => window.removeEventListener("assets-updated", handler)
  }, [loadTaskAssetIds])

  const handleToggleFavorite = useCallback(async (asset: Asset) => {
    const res = await apiFetch(`/api/assets/${asset.id}/favorite`, { method: "PATCH" })
    if (!res.ok) return
    const updated: Asset = await res.json()
    setMessages((prev) =>
      prev.map((m) => {
        if ("results" in m && m.type === "search_result") {
          const next = { ...m.results }
          for (const k of Object.keys(next)) {
            next[k] = next[k].map((a) => (a.id === updated.id ? updated : a))
          }
          return { ...m, results: next }
        }
        return m
      }),
    )
    window.dispatchEvent(new CustomEvent("assets-updated"))
  }, [])

  const handleToggleProject = useCallback(async (asset: Asset) => {
    const inProject = taskAssetIds.has(asset.id)
    if (inProject) {
      if (!window.confirm("确定从项目中移除该素材？")) return
      const res = await apiFetch(`/api/tasks/${taskId}/assets/${asset.id}`, { method: "DELETE" })
      if (!res.ok) return
      setTaskAssetIds((prev) => { const n = new Set(prev); n.delete(asset.id); return n })
    } else {
      const vc = getCanvasViewportCenter()
      const res = await apiFetch(`/api/tasks/${taskId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: asset.id, x: vc?.x ?? 100, y: vc?.y ?? 100, w: 200, h: 200 }),
      })
      if (!res.ok) return
      setTaskAssetIds((prev) => new Set(prev).add(asset.id))
    }
    window.dispatchEvent(new CustomEvent("assets-updated"))
  }, [taskId, taskAssetIds])

  const loadSessions = useCallback(async () => {
    const res = await apiFetch(`/api/chat/sessions?task_id=${taskId}&stage=${stage}`)
    const data: ChatSession[] = await res.json()
    setSessions(data)
    return data
  }, [taskId, stage])

  const loadMessages = useCallback(async (sid: number) => {
    const res = await apiFetch(`/api/chat/sessions/${sid}/messages`)
    const data: any[] = await res.json()
    const msgs: DisplayMessage[] = data
      .filter((m) => m.msg_type !== "agent_memory") // hidden LLM-only memory rows
      .map((m) => {
        if (m.msg_type === "search_result" || m.msg_type === "generate_result" || m.msg_type === "narration_result") {
          try {
            const parsed = JSON.parse(m.content)
            return { ...parsed, id: m.id }
          } catch { /* fall through */ }
        }
        return m as ChatMessage
      })
    setMessages(msgs)
    return { sid, msgs }
  }, [])

  const selectSession = useCallback(
    async (sid: number) => {
      setSessionId(sid)
      await loadMessages(sid)
    },
    [sessions, loadMessages],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await loadSessions()
      if (cancelled) return
      let currentSid: number | null = null
      let loadedMsgs: DisplayMessage[] = []
      if (data.length > 0) {
        currentSid = data[0].id
        setSessionId(currentSid)
        const result = await loadMessages(currentSid)
        loadedMsgs = result.msgs
      } else {
        setSessionId(null)
        setMessages([])
      }
      try {
        const res = await apiFetch(`/api/generate/jobs?task_id=${taskId}&status=pending,running`)
        const jobs: any[] = await res.json()
        if (cancelled) return
        for (const job of jobs) {
          if (activeJobsRef.current.has(job.id)) continue
          const existingMsg = loadedMsgs.find(
            (m) => "type" in m && m.type === "generate_result" && (m as GenerateResult).job_id === job.id,
          )
          if (existingMsg) {
            subscribeJobProgress(job.id, existingMsg.id, job.session_id ?? currentSid ?? 0, job.prompt, job.provider)
          } else {
            const cardId = -(Date.now() + Math.floor(Math.random() * 10000))
            const card: GenerateResult = {
              id: cardId, type: "generate_result", prompt: job.prompt, provider: job.provider,
              loading: true, assets: [], errors: [], job_id: job.id,
              progress: job.progress ?? 0, progressMessage: job.message || "恢复中...",
            }
            setMessages((prev) => {
              const alreadyHas = prev.some(
                (m) => "type" in m && m.type === "generate_result" && (m as GenerateResult).job_id === job.id,
              )
              return alreadyHas ? prev : [...prev, card]
            })
            subscribeJobProgress(job.id, cardId, job.session_id ?? 0, job.prompt, job.provider)
          }
        }
      } catch {}
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, stage])

  const handleNewSession = () => {
    setSessionId(null)
    setMessages([])
  }

  const editNonceRef = useRef(0)
  useEffect(() => {
    if (!editingAssetNonce || editingAssetNonce === editNonceRef.current) return
    editNonceRef.current = editingAssetNonce
    handleNewSession()
  }, [editingAssetNonce])

  const ensureSession = async (submitMode: string, title?: string): Promise<number> => {
    const baseMode = submitMode.split(":")[0]
    if (sessionId) {
      const current = sessions.find((s) => s.id === sessionId)
      if (current && current.mode === baseMode) {
        return sessionId
      }
    }
    const res = await apiFetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, stage, mode: baseMode, title: title?.slice(0, 50) }),
    })
    const newSession: ChatSession = await res.json()
    setSessions((prev) => [newSession, ...prev])
    setSessionId(newSession.id)
    setMessages([])
    return newSession.id
  }

  const handleSearch = async (sid: number, query: string, assetType: string) => {
    const cardId = -Date.now()
    const card: SearchResult = {
      id: cardId,
      type: "search_result",
      query,
      filterType: assetType,
      loading: true,
      results: {},
    }
    setMessages((prev) => [...prev, card])

    try {
      const limit = assetType === "all" ? 50 : SEARCH_CONFIG.max_per_type
      const params = new URLSearchParams({
        q: query,
        limit: String(limit),
      })
      if (assetType !== "all") params.set("type", assetType)

      const res = await apiFetch(`/api/assets/search?${params.toString()}`)
      const assets: (Asset & { search_score?: number })[] = await res.json()

      const filtered = assets.filter((a) => {
        const score = a.search_score ?? 0
        return score >= SEARCH_CONFIG.score_threshold
      })

      const grouped: Record<string, Asset[]> = {}
      for (const asset of filtered) {
        if (assetType !== "all" && asset.type !== assetType) continue
        if (!grouped[asset.type]) grouped[asset.type] = []
        if (grouped[asset.type].length < SEARCH_CONFIG.max_per_type) {
          grouped[asset.type].push(asset)
        }
      }

      const savedCard = { type: "search_result" as const, query, filterType: assetType, loading: false, results: grouped }
      const saveRes = await apiFetch(`/api/chat/sessions/${sid}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(savedCard), role: "user", msg_type: "search_result" }),
      })
      const savedMsg = await saveRes.json()
      setMessages((prev) =>
        prev.map((m) => m.id === cardId ? { ...savedCard, id: savedMsg.id } : m),
      )
    } catch (err) {
      console.error("Search failed:", err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === cardId ? { ...card, loading: false, results: {} } : m,
        ),
      )
    }
  }

  const activeJobsRef = useRef<Map<string, AbortController>>(new Map())

  const subscribeJobProgress = useCallback((
    jobId: string,
    cardId: number,
    sid: number,
    prompt: string,
    provider: string,
  ) => {
    const ctrl = new AbortController()
    activeJobsRef.current.set(jobId, ctrl)

    ;(async () => {
      try {
        const res = await apiFetch(`/api/generate/jobs/${jobId}/stream`, { signal: ctrl.signal })
        const reader = res.body?.getReader()
        if (!reader) return
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split("\n\n")
          buffer = blocks.pop() || ""

          for (const block of blocks) {
            let eventType = ""
            let data = ""
            for (const line of block.split("\n")) {
              if (line.startsWith("event: ")) eventType = line.slice(7).trim()
              else if (line.startsWith("data: ")) data = line.slice(6)
            }
            if (!eventType || !data) continue

            try {
              const parsed = JSON.parse(data)
              if (eventType === "progress") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === cardId && "type" in m && m.type === "generate_result"
                      ? { ...m, progress: parsed.progress, progressMessage: parsed.message }
                      : m,
                  ),
                )
              } else if (eventType === "complete") {
                const assets: Asset[] = (parsed.results ?? []).map((r: any) => r.asset)
                const errors: string[] = (parsed.errors ?? []).map((e: any) => e.error)
                const savedCard = {
                  type: "generate_result" as const, prompt, provider,
                  loading: false, assets, errors, job_id: jobId,
                }
                if (cardId > 0) {
                  await apiFetch(`/api/chat/messages/${cardId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: JSON.stringify(savedCard) }),
                  }).catch(() => {})
                  setMessages((prev) =>
                    prev.map((m) => m.id === cardId ? { ...savedCard, id: cardId } : m),
                  )
                } else {
                  const saveRes = await apiFetch(`/api/chat/sessions/${sid}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: JSON.stringify(savedCard), role: "user", msg_type: "generate_result" }),
                  })
                  const savedMsg = await saveRes.json()
                  setMessages((prev) =>
                    prev.map((m) => m.id === cardId ? { ...savedCard, id: savedMsg.id } : m),
                  )
                }
                if (assets.length > 0) {
                  window.dispatchEvent(new CustomEvent("assets-updated"))
                }
              } else if (eventType === "error") {
                const errors: string[] = (parsed.errors ?? []).map((e: any) =>
                  typeof e === "string" ? e : e.error || "Unknown error",
                )
                const errorContent = {
                  type: "generate_result" as const, prompt, provider,
                  loading: false, assets: [] as Asset[],
                  errors: errors.length ? errors : [parsed.message || "生成失败"],
                  job_id: jobId,
                }
                if (cardId > 0) {
                  await apiFetch(`/api/chat/messages/${cardId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: JSON.stringify(errorContent) }),
                  }).catch(() => {})
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === cardId && "type" in m && m.type === "generate_result"
                      ? { ...errorContent, id: cardId }
                      : m,
                  ),
                )
              }
            } catch {}
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === cardId && "type" in m && m.type === "generate_result"
                ? { ...m, loading: false, errors: ["连接中断"], job_id: jobId }
                : m,
            ),
          )
        }
      } finally {
        activeJobsRef.current.delete(jobId)
      }
    })()
  }, [])

  useEffect(() => {
    return () => {
      activeJobsRef.current.forEach((ctrl) => ctrl.abort())
      activeJobsRef.current.clear()
    }
  }, [])

  const handleGenerateNarration = async (
    sid: number,
    prompt: string,
    language?: string,
  ) => {
    // Optimistic user bubble + streaming assistant placeholder.
    // Backend's BackendChatMemory persists real rows to chat_messages; these
    // temp IDs get replaced with real ones on next session reload.
    const userTempId = -Date.now()
    const assistantTempId = -(Date.now() + 1)

    const userMsg: ChatMessage = {
      id: userTempId,
      session_id: sid,
      role: "user",
      content: prompt,
      model: null,
      created_at: new Date().toISOString(),
    }
    // Start with a "thinking" placeholder — replaced on the first real event.
    const assistantMsg: ChatMessage = {
      id: assistantTempId,
      session_id: sid,
      role: "assistant",
      content: THINKING_PLACEHOLDER,
      model: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])

    // ── Typewriter queue (one per assistant bubble) ─────────────────────
    typewriterRef.current.set(assistantTempId, { displayed: "", pending: "", timer: null })

    const runTypewriterTick = (msgId: number) => {
      const state = typewriterRef.current.get(msgId)
      if (!state) return
      if (!state.pending) {
        state.timer = null
        return
      }
      const chunk = state.pending.slice(0, TYPEWRITER_CHARS_PER_TICK)
      state.pending = state.pending.slice(TYPEWRITER_CHARS_PER_TICK)
      state.displayed += chunk
      const snapshot = state.displayed
      setMessages((prev) => prev.map((m) =>
        m.id === msgId && !("type" in m)
          ? { ...(m as ChatMessage), content: snapshot }
          : m
      ))
      state.timer = setTimeout(() => runTypewriterTick(msgId), TYPEWRITER_TICK_MS)
    }

    const pushTypewriter = (msgId: number, delta: string) => {
      const state = typewriterRef.current.get(msgId)
      if (!state) return
      state.pending += delta
      if (!state.timer) {
        state.timer = setTimeout(() => runTypewriterTick(msgId), TYPEWRITER_TICK_MS)
      }
    }

    const stopTypewriter = (msgId: number) => {
      const state = typewriterRef.current.get(msgId)
      if (state?.timer) clearTimeout(state.timer)
      typewriterRef.current.delete(msgId)
    }

    // Directly set bubble content (bypasses typewriter — used for progress/final states)
    const setAssistantContent = (content: string) => {
      stopTypewriter(assistantTempId)
      setMessages((prev) => prev.map((m) =>
        m.id === assistantTempId && !("type" in m)
          ? { ...(m as ChatMessage), content }
          : m
      ))
    }

    const setError = (msg: string) => {
      setAssistantContent(`(错误：${msg})`)
    }

    try {
      const existingNarrationId = scriptNarrationIdRef.current || undefined
      const res = await apiFetch("/api/generate/narration/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          prompt,
          session_id: sid,
          language: language || "中文",
          existing_narration_id: existingNarrationId,
        }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No reader")
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() || ""

        for (const block of blocks) {
          if (!block.startsWith("data: ")) continue
          let evt: any
          try { evt = JSON.parse(block.slice(6)) } catch { continue }

          if (evt.type === "token") {
            // Chat path — enqueue delta into the typewriter queue for paced display
            pushTypewriter(assistantTempId, evt.delta || "")
          } else if (evt.type === "chat") {
            // Chat stream complete — backend already persisted via BackendChatMemory.
            // Typewriter drains remaining pending chars on its own timer.
          } else if (evt.type === "progress") {
            // Pipeline progress — replace assistant content with latest status
            setAssistantContent(`⏳ ${evt.message || "处理中…"}`)
          } else if (evt.type === "copy") {
            // 1) Finalize assistant bubble with the short reply text.
            setAssistantContent(evt.reply || "文案已生成完毕")

            // 2) Backend already handled insert-vs-update based on existing_narration_id.
            //    narration_id in the event is the authoritative ID (new or existing).
            const finalNarrationId = evt.narration_id as string
            const finalTitle = evt.title as string

            // Auto-set @tag so follow-up modifications target this narration.
            setSelectedNarration({ id: finalNarrationId, title: finalTitle })

            // 3) Insert a separate clickable narration card BELOW the text bubble.
            const cardTempId = -(Date.now() + 2)
            const savedCard = {
              id: cardTempId,
              type: "narration_result" as const,
              prompt,
              loading: false,
              narration_id: finalNarrationId,
              title: finalTitle,
            }
            setMessages((prev) => [...prev, savedCard as NarrationResult])

            // Persist the card row so it survives reload
            try {
              const saveRes = await apiFetch(`/api/chat/sessions/${sid}/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: JSON.stringify({
                    type: "narration_result",
                    prompt,
                    loading: false,
                    narration_id: savedCard.narration_id,
                    title: savedCard.title,
                  }),
                  role: "user",
                  msg_type: "narration_result",
                }),
              })
              const savedMsg = await saveRes.json()
              setMessages((prev) => prev.map((m) =>
                m.id === cardTempId ? { ...savedCard, id: savedMsg.id } : m
              ))
            } catch (e) {
              console.error("Failed to save narration card:", e)
            }

            window.dispatchEvent(new CustomEvent("narrations-updated"))
          } else if (evt.type === "error") {
            setError(evt.message || "Unknown error")
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Connection error")
    }
  }

  const handleGenerate = async (
    sid: number,
    prompt: string,
    mediaType: string,
    provider: string,
    params?: Record<string, any>,
  ) => {
    const cardId = -Date.now()
    const card: GenerateResult = {
      id: cardId,
      type: "generate_result",
      prompt,
      provider,
      loading: true,
      assets: [],
      errors: [],
      progress: 0,
      progressMessage: "提交中...",
    }
    setMessages((prev) => [...prev, card])

    try {
      const vc = getCanvasViewportCenter()
      const res = await apiFetch(`/api/generate/${mediaType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          prompt,
          provider,
          session_id: sid,
          config: {
            aspect_ratio: params?.aspect_ratio ?? params?.ratio ?? "16:9",
            image_size: params?.image_size ?? params?.size ?? "1K",
            resolution: params?.resolution,
            duration: params?.duration,
            camera_fixed: params?.camera_fixed,
            model: params?.model,
            prompt_optimizer: params?.prompt_optimizer,
            lyrics: params?.lyrics,
            is_instrumental: params?.is_instrumental,
            lyrics_optimizer: params?.lyrics_optimizer,
            media_files: params?.media_files,
            generate_audio: params?.generate_audio,
            ratio: params?.ratio,
            watermark: params?.watermark,
            generation_mode: params?.generation_mode,
            size: params?.size,
            sequential_image_generation: params?.sequential_image_generation,
          },
          count: params?.count ?? (mediaType === "image" ? 2 : 1),
          ...(vc && { center_x: vc.x, center_y: vc.y }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Generate failed")

      const jobId: string = data.job_id
      const placeholderCard = {
        type: "generate_result" as const, prompt, provider,
        loading: true, assets: [] as Asset[], errors: [] as string[], job_id: jobId,
      }
      const saveRes = await apiFetch(`/api/chat/sessions/${sid}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(placeholderCard), role: "user", msg_type: "generate_result" }),
      })
      const savedMsg = await saveRes.json()
      setMessages((prev) =>
        prev.map((m) => m.id === cardId
          ? { ...placeholderCard, id: savedMsg.id, progress: 0, progressMessage: "提交中..." }
          : m),
      )
      subscribeJobProgress(jobId, savedMsg.id, sid, prompt, provider)
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === cardId
            ? { ...card, loading: false, errors: [err.message || "Unknown error"] }
            : m,
        ),
      )
    }
  }


  const handleSubmit = async (content: string, submitMode: string, params?: Record<string, any>) => {
    if (submitMode.startsWith("generate:")) {
      const parts = submitMode.split(":")
      const mediaType = parts[1] || "image"

      if (mediaType === "narration") {
        const sid = await ensureSession(submitMode, content)
        handleGenerateNarration(sid, content, params?.language)
        return
      }

      const sid = await ensureSession(submitMode, content)
      const provider = parts[2] || "nanobanana2"
      handleGenerate(sid, content, mediaType, provider, params)
      return
    }

    if (submitMode.startsWith("search:")) {
      const sid = await ensureSession(submitMode, content)
      const assetType = submitMode.slice(7)
      await handleSearch(sid, content, assetType)
      return
    }

    const sid = await ensureSession(submitMode, content)
    setSending(true)

    const tempUserMsg: ChatMessage = {
      id: -Date.now(),
      session_id: sid,
      role: "user",
      content,
      model: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    const streamingMsg: ChatMessage = {
      id: -(Date.now() + 1),
      session_id: sid,
      role: "assistant",
      content: "",
      model: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, streamingMsg])

    try {
      const res = await apiFetch(`/api/chat/sessions/${sid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, model: "minimax/minimax-m2.7" }),
      })

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No reader")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() || ""

        for (const block of blocks) {
          let eventType = ""
          let data = ""
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim()
            else if (line.startsWith("data: ")) data = line.slice(6)
          }
          if (!eventType || !data) continue

          try {
            const parsed = JSON.parse(data)
            if (eventType === "user_msg") {
              setMessages((prev) => prev.map((m) => (m.id === tempUserMsg.id ? parsed : m)))
            } else if (eventType === "delta") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingMsg.id && "content" in m ? { ...m, content: m.content + parsed.content } : m,
                ),
              )
            } else if (eventType === "assistant_msg") {
              setMessages((prev) => prev.map((m) => (m.id === streamingMsg.id ? parsed : m)))
            } else if (eventType === "error") {
              console.error("SSE error:", parsed)
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id && m.id !== streamingMsg.id))
      console.error("Send message failed:", err)
    } finally {
      setSending(false)
    }
  }

  const handleRename = async (sid: number, title: string) => {
    const res = await apiFetch(`/api/chat/sessions/${sid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    const updated: ChatSession = await res.json()
    setSessions((prev) => prev.map((s) => (s.id === sid ? updated : s)))
  }

  const handleDelete = async (sid: number) => {
    await apiFetch(`/api/chat/sessions/${sid}`, { method: "DELETE" })
    setSessions((prev) => prev.filter((s) => s.id !== sid))
    if (sessionId === sid) {
      const remaining = sessions.filter((s) => s.id !== sid)
      if (remaining.length > 0) {
        await selectSession(remaining[0].id)
      } else {
        setSessionId(null)
        setMessages([])
      }
    }
  }

  const handleDeleteMessage = async (messageId: number) => {
    await apiFetch(`/api/chat/messages/${messageId}`, { method: "DELETE" })
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b">
        <span className="flex-1 text-xs font-semibold tracking-tight">Chat</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" onClick={handleNewSession}>
              <MessageSquarePlusIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>新会话</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => setDrawerOpen(true)}>
              <HistoryIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>历史会话</TooltipContent>
        </Tooltip>
      </div>

      <MessageList
        messages={messages}
        streaming={sending}
        onDelete={handleDeleteMessage}
        selectedAssetId={selectedAssetId}
        taskAssetIds={taskAssetIds}
        onSelectAsset={onSelectAsset}
        onToggleFavorite={handleToggleFavorite}
        onToggleProject={handleToggleProject}
        onClickNarration={(narrationId) => {
          navigate(`/task/${taskId}/script/editor?n=${narrationId}`)
        }}
      />

      <div className="px-2 pb-2">
        {selectedNarration && (
          <div className="mb-1.5 flex items-center px-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              <span className="max-w-[140px] truncate">@{selectedNarration.title}</span>
              <button
                type="button"
                onClick={() => setSelectedNarration(null)}
                className="ml-0.5 flex size-3.5 items-center justify-center rounded-full text-primary/60 hover:bg-primary/20 hover:text-primary"
                title="取消关联旁白"
              >
                ×
              </button>
            </span>
          </div>
        )}
        {renderInput({ onSubmit: handleSubmit, disabled: sending })}
      </div>

      <SessionDrawer
        sessions={sessions}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={(sid) => selectSession(sid)}
        onRename={handleRename}
        onDelete={handleDelete}
      />
    </div>
  )
}
