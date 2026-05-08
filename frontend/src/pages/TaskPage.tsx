import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { LAYOUT_DEFINITION } from "@/config/options"
import TaskNav from "@/components/TaskNav"
import SpaceLibrary from "@/components/spaces/SpaceLibrary"
import SpaceStoryboard from "@/components/spaces/SpaceStoryboard"
import SpaceFinecut from "@/components/spaces/SpaceFinecut"
import SpaceScript from "@/components/spaces/SpaceScript"
import ChatPanel from "@/components/ChatPanel"
import LibraryInput from "@/components/LibraryInput"
import StoryboardInput from "@/components/StoryboardInput"
import FinecutInput from "@/components/FinecutInput"
import ScriptEditorInput from "@/components/ScriptEditorInput"
import PropertyAsset from "@/components/PropertyAsset"
import type { Asset } from "@/types/asset"

interface Task {
  id: number
  title: string
  description: string
  status: string
  created_at: string
}

export default function TaskPage() {
  const navigate = useNavigate()
  const { id, stageId } = useParams()
  const { user, isLoginEnabled } = useAuth()
  const [task, setTask] = useState<Task | null>(null)
  const quotaExhausted = isLoginEnabled && user?.role === "user" && (user?.quota ?? 0) < 0

  const [libSelectedAsset, setLibSelectedAsset] = useState<Asset | null>(null)
  const [sbSelectedAsset, setSbSelectedAsset] = useState<Asset | null>(null)
  const [libFloatVisible, setLibFloatVisible] = useState(false)
  const [sbFloatVisible, setSbFloatVisible] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [asideWidth, setAsideWidth] = useState(Math.min(420, LAYOUT_DEFINITION.sidebar_max_width))
  const [taskAssetIds, setTaskAssetIds] = useState<Set<string>>(new Set())
  const [editingAsset, setEditingAsset] = useState<{ asset: Asset; nonce: number } | null>(null)

  const activeSelectedAsset = stageId === "storyboard" ? sbSelectedAsset : libSelectedAsset
  const sbExportRef = useRef<(() => Promise<void>) | null>(null)

  const mainRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startPos: number; startVal: number } | null>(null)

  useEffect(() => {
    apiFetch(`/api/tasks/${id}`)
      .then((r) => r.json())
      .then(setTask)
      .catch(console.error)
  }, [id])

  const loadTaskAssetIds = useCallback(() => {
    if (id == null) return
    apiFetch(`/api/tasks/${id}/assets`)
      .then((r) => r.json())
      .then((items: Array<{ asset_id: string }>) => {
        setTaskAssetIds(new Set(items.map((it) => it.asset_id)))
      })
      .catch(() => {})
  }, [id])

  useEffect(() => {
    loadTaskAssetIds()
  }, [loadTaskAssetIds])

  useEffect(() => {
    const onDeleted = (e: Event) => {
      const deletedId = (e as CustomEvent).detail
      setLibSelectedAsset((prev) => (prev?.id === deletedId ? null : prev))
      setSbSelectedAsset((prev) => (prev?.id === deletedId ? null : prev))
    }
    window.addEventListener("asset-deleted", onDeleted)
    return () => window.removeEventListener("asset-deleted", onDeleted)
  }, [])

  useEffect(() => {
    const onEditCanvasAsset = (e: Event) => {
      const asset = (e as CustomEvent).detail as Asset
      setShowChat(true)
      setEditingAsset({ asset, nonce: Date.now() })
    }
    window.addEventListener("edit-canvas-asset", onEditCanvasAsset)
    return () => window.removeEventListener("edit-canvas-asset", onEditCanvasAsset)
  }, [])

  useEffect(() => {
    const onAssetsUpdated = () => loadTaskAssetIds()
    window.addEventListener("assets-updated", onAssetsUpdated)
    return () => window.removeEventListener("assets-updated", onAssetsUpdated)
  }, [loadTaskAssetIds])

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = {
        startPos: e.clientX,
        startVal: asideWidth,
      }

      const onMove = (ev: MouseEvent) => {
        const d = dragRef.current
        if (!d) return
        const delta = d.startPos - ev.clientX
        const maxW = (mainRef.current?.clientWidth ?? 1000) - 200
        setAsideWidth(
          Math.max(
            LAYOUT_DEFINITION.sidebar_min_width,
            Math.min(d.startVal + delta, maxW, LAYOUT_DEFINITION.sidebar_max_width),
          ),
        )
      }

      const onUp = () => {
        dragRef.current = null
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }

      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [asideWidth],
  )

  const asideVisible = showChat || !!activeSelectedAsset

  const onSelectAssetLib = useCallback((asset: Asset) => {
    setLibSelectedAsset(asset)
    setShowChat(false)
    setLibFloatVisible(false)
  }, [])

  const onSelectAssetSb = useCallback((asset: Asset) => {
    setSbSelectedAsset(asset)
    setShowChat(false)
    setSbFloatVisible(false)
  }, [])

  const onDeselectAssetSb = useCallback(() => {
    setSbSelectedAsset(null)
    setSbFloatVisible(false)
  }, [])

  const handleToggleFavorite = useCallback(async () => {
    if (!activeSelectedAsset) return
    try {
      const res = await apiFetch(`/api/assets/${activeSelectedAsset.id}/favorite`, { method: "PATCH" })
      if (!res.ok) return
      const updated: Asset = await res.json()
      if (stageId === "storyboard") setSbSelectedAsset(updated)
      else setLibSelectedAsset(updated)
      window.dispatchEvent(new Event("assets-updated"))
    } catch { /* ignore */ }
  }, [activeSelectedAsset, stageId])

  const handleDeleteAsset = useCallback(async () => {
    if (!activeSelectedAsset) return
    try {
      const res = await apiFetch(`/api/assets/${activeSelectedAsset.id}`, { method: "DELETE" })
      if (!res.ok) return
      if (stageId === "storyboard") setSbSelectedAsset(null)
      else setLibSelectedAsset(null)
      window.dispatchEvent(new Event("assets-updated"))
    } catch { /* ignore */ }
  }, [activeSelectedAsset, stageId])

  const handleToggleProject = useCallback(async () => {
    if (id == null || !activeSelectedAsset) return
    const inProject = taskAssetIds.has(activeSelectedAsset.id)
    if (inProject) {
      if (!window.confirm("确定从项目中移除该素材？相关连接线也将清除。")) return
      try {
        const res = await apiFetch(`/api/tasks/${id}/assets/${activeSelectedAsset.id}`, { method: "DELETE" })
        if (!res.ok) return
        setTaskAssetIds((prev) => {
          const next = new Set(prev)
          next.delete(activeSelectedAsset.id)
          return next
        })
      } catch { /* ignore */ }
      return
    }
    try {
      const res = await apiFetch(`/api/tasks/${id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: activeSelectedAsset.id }),
      })
      if (!res.ok) return
      setTaskAssetIds((prev) => new Set(prev).add(activeSelectedAsset.id))
    } catch { /* ignore */ }
  }, [id, activeSelectedAsset, taskAssetIds])

  return (
    <div className="flex h-screen flex-col bg-background">
      <TaskNav
        title={task?.title ?? "加载中..."}
        activeTabId={stageId}
        onTabChange={(tabId) => navigate(`/task/${id}/${tabId}`, { replace: true })}
        onBack={() => navigate(-1)}
        showChat={showChat}
        onToggleChat={() => setShowChat((v) => !v)}
        onExport={stageId === "storyboard" ? () => sbExportRef.current?.() : undefined}
      />

      <main ref={mainRef} className="flex flex-1 overflow-hidden">
        <section className="min-w-0 flex-1 overflow-hidden">
          <div className={stageId === "lib" ? "h-full" : "hidden"}>
            <SpaceLibrary
              taskId={id != null ? Number(id) : undefined}
              selectedAssetId={libSelectedAsset?.id}
              onSelectAsset={onSelectAssetLib}
              showFloatProperty={libFloatVisible}
              onCloseFloat={() => { setLibFloatVisible(false); setShowChat(true) }}
              floatAsset={libSelectedAsset}
            />
          </div>
          <div className={stageId === "storyboard" ? "h-full" : "hidden"}>
            {id != null && (
              <SpaceStoryboard
                taskId={Number(id)}
                selectedAssetId={sbSelectedAsset?.id}
                onSelectAsset={onSelectAssetSb}
                onDeselectAsset={onDeselectAssetSb}
                showFloatProperty={sbFloatVisible}
                onCloseFloat={() => { setSbFloatVisible(false); setShowChat(true) }}
                floatAsset={sbSelectedAsset}
                onExportReady={(fn) => { sbExportRef.current = fn }}
              />
            )}
          </div>
          {stageId === "script" && (
            <div className="h-full">
              <SpaceScript taskId={id != null ? Number(id) : undefined} />
            </div>
          )}
          {stageId === "finecut" && <SpaceFinecut />}
        </section>

        {asideVisible && (
          <>
            <div
              className="w-1 shrink-0 cursor-col-resize transition-colors hover:bg-primary/20 active:bg-primary/30"
              onMouseDown={startDrag}
            />

            <aside
              className="flex min-h-0 shrink-0 flex-col overflow-hidden border-l"
              style={{ width: asideWidth }}
            >
              {showChat ? (
                <div className="min-h-0 flex-1 overflow-hidden">
                  {task && stageId && (
                    <ChatPanel
                      taskId={task.id}
                      stage={stageId}
                      selectedAssetId={activeSelectedAsset?.id}
                      editingAssetNonce={stageId === "storyboard" ? editingAsset?.nonce : undefined}
                      onSelectAsset={(asset) => {
                        if (stageId === "storyboard") {
                          setSbSelectedAsset(asset)
                          setSbFloatVisible(true)
                        } else {
                          setLibSelectedAsset(asset)
                          setLibFloatVisible(true)
                        }
                      }}
                      renderInput={({ onSubmit, disabled }) =>
                        stageId === "storyboard" ? (
                          <StoryboardInput onSubmit={onSubmit} disabled={disabled} editingAsset={editingAsset} />
                        ) : stageId === "finecut" ? (
                          <FinecutInput onSubmit={onSubmit} disabled={disabled} />
                        ) : stageId === "script" ? (
                          <ScriptEditorInput onSubmit={onSubmit} disabled={disabled} />
                        ) : (
                          <LibraryInput onSubmit={onSubmit} disabled={disabled} />
                        )
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  <h4 className="mb-3 text-xs font-semibold text-muted-foreground">属性</h4>
                  {activeSelectedAsset ? (
                    <PropertyAsset
                      asset={activeSelectedAsset}
                      isInProject={taskAssetIds.has(activeSelectedAsset.id)}
                      onToggleFavorite={handleToggleFavorite}
                      onToggleProject={stageId === "lib" ? handleToggleProject : undefined}
                      onDelete={stageId !== "storyboard" ? handleDeleteAsset : undefined}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">选择素材以查看属性</p>
                  )}
                </div>
              )}
            </aside>
          </>
        )}
      </main>

      {quotaExhausted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-8 shadow-lg">
            <p className="text-lg font-semibold">配额已用尽</p>
            <p className="text-sm text-muted-foreground">请联系管理员增加配额后继续使用</p>
            <button className="mt-2 text-sm text-primary underline" onClick={() => navigate("/")}>返回首页</button>
          </div>
        </div>
      )}
    </div>
  )
}
