import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

interface TikTokAccount {
  bound: boolean
  open_id?: string
  display_name?: string
  avatar_url?: string
}

interface Video {
  name: string
  display_name: string
  url: string
  thumbnail_url: string
  download_url: string
  size: number
  created_at: number
}

interface TikTokButtonsProps {
  taskTitle?: string
}

export default function TikTokButtons({ taskTitle = "" }: TikTokButtonsProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [account, setAccount] = useState<TikTokAccount | null>(null)
  const [bindLoading, setBindLoading] = useState(false)
  const [bindStatus, setBindStatus] = useState<"idle" | "binding" | "ok" | "error">("idle")

  const [publishOpen, setPublishOpen] = useState(false)
  const [videos, setVideos] = useState<Video[]>([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState("")
  const [postTitle, setPostTitle] = useState(taskTitle)
  const [copy, setCopy] = useState("")
  const [privacyLevel, setPrivacyLevel] = useState("PUBLIC_TO_EVERYONE")
  const [commercialDisclosure, setCommercialDisclosure] = useState(false)
  const [brandType, setBrandType] = useState<"organic" | "content">("organic")
  const [publishingMode, setPublishingMode] = useState<"publish" | "upload" | null>(null)
  const [publishError, setPublishError] = useState("")
  const [publishOk, setPublishOk] = useState(false)

  const loadAccount = useCallback(async () => {
    try {
      const res = await apiFetch("/api/tiktok/account")
      setAccount(await res.json())
    } catch {}
  }, [])

  useEffect(() => { loadAccount() }, [loadAccount])

  // Handle OAuth callback: ?tiktok_auth=1&state=<base64>
  useEffect(() => {
    if (searchParams.get("tiktok_auth") !== "1") return
    const state = searchParams.get("state") ?? ""
    const next = new URLSearchParams(searchParams)
    next.delete("tiktok_auth")
    next.delete("state")
    setSearchParams(next, { replace: true })

    if (!state) return
    setBindStatus("binding")
    apiFetch("/api/tiktok/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error()
        setBindStatus("ok")
        await loadAccount()
      })
      .catch(() => setBindStatus("error"))
      .finally(() => setTimeout(() => setBindStatus("idle"), 3000))
  }, [searchParams, setSearchParams, loadAccount])

  const handleBind = async () => {
    setBindLoading(true)
    try {
      const redirectTo = window.location.href.split("?")[0]
      const res = await apiFetch(
        `/api/tiktok/auth-url?redirect_to=${encodeURIComponent(redirectTo)}`,
      )
      const { auth_url } = await res.json()
      window.location.href = auth_url
    } catch {
      setBindLoading(false)
    }
  }

  const handleUnbind = async () => {
    if (!window.confirm(`确定解除 TikTok 账号 @${account?.display_name ?? ""} 的绑定？`)) return
    await apiFetch("/api/tiktok/account", { method: "DELETE" })
    setAccount({ bound: false })
  }

  const openPublish = async () => {
    setPublishOpen(true)
    setPostTitle(taskTitle)
    setCopy("")
    setSelectedUrl("")
    setPrivacyLevel("PUBLIC_TO_EVERYONE")
    setCommercialDisclosure(false)
    setBrandType("organic")
    setPublishError("")
    setPublishOk(false)
    setVideosLoading(true)
    try {
      const res = await apiFetch("/api/tiktok/videos")
      const data = await res.json()
      setVideos(Array.isArray(data) ? data : (data.videos ?? data.data ?? []))
    } catch {
      setVideos([])
    } finally {
      setVideosLoading(false)
    }
  }

  const handlePublish = async (mode: "publish" | "upload") => {
    if (!selectedUrl || !postTitle.trim()) {
      setPublishError("请填写标题并选择视频")
      return
    }
    setPublishingMode(mode)
    setPublishError("")
    try {
      if (mode === "publish") {
        const res = await apiFetch("/api/tiktok/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: postTitle.trim(),
            description: copy,
            video_url: selectedUrl,
            video_size: videos.find((v) => v.download_url === selectedUrl)?.size ?? 0,
            privacy_level: privacyLevel,
            brand_organic_toggle: commercialDisclosure && brandType === "organic",
            brand_content_toggle: commercialDisclosure && brandType === "content",
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setPublishError(data.detail ?? "发布失败")
        } else {
          setPublishOk(true)
          setPublishError(data.processing ? "视频已提交，TikTok 处理中，请稍后查看" : "")
          setTimeout(() => { setPublishOpen(false); setPublishOk(false) }, data.processing ? 4000 : 2000)
        }
      } else {
        const res = await apiFetch("/api/tiktok/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_url: selectedUrl }),
        })
        const data = await res.json()
        if (!res.ok) {
          setPublishError(data.detail ?? "上传失败")
        } else {
          setPublishOk(true)
          setPublishError("视频已发送到 TikTok 草稿箱，请在 TikTok App 中完成编辑后发布")
          setTimeout(() => { setPublishOpen(false); setPublishOk(false) }, 4000)
        }
      }
    } catch {
      setPublishError("网络错误，请重试")
    } finally {
      setPublishingMode(null)
    }
  }

  if (!account) return null

  return (
    <div className="flex items-center gap-1">
      {/* Bind status flash */}
      {bindStatus === "binding" && (
        <span className="text-xs text-muted-foreground">绑定中…</span>
      )}
      {bindStatus === "ok" && (
        <span className="text-xs text-green-500">绑定成功</span>
      )}
      {bindStatus === "error" && (
        <span className="text-xs text-destructive">绑定失败，请重试</span>
      )}

      {/* Bind / Account button */}
      {account.bound ? (
        <button
          onClick={handleUnbind}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-muted"
          title="点击解除绑定"
        >
          {account.avatar_url && (
            <img
              src={account.avatar_url}
              alt=""
              className="size-4 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          )}
          <span className="max-w-[80px] truncate">{account.display_name}</span>
        </button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={handleBind}
          disabled={bindLoading}
        >
          <img
            src="https://lf16-tt4d.tiktokcdn.com/obj/tiktok-open-platform/tt_icon.png"
            alt=""
            className="size-3.5 shrink-0"
          />
          绑定 TikTok
        </Button>
      )}

      {/* Publish button — only when bound */}
      {account.bound && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={openPublish}>
          <img
            src="https://lf16-tt4d.tiktokcdn.com/obj/tiktok-open-platform/tt_icon.png"
            alt=""
            className="size-3.5 shrink-0"
          />
          发布到 TikTok
        </Button>
      )}

      {/* Publish modal */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>发布到 TikTok</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">标题</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                placeholder="视频标题"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">文案（可选）</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                placeholder="发布描述文案…"
              />
            </div>

            {/* Privacy level — only shown for direct publish */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">谁可以看此视频</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                value={privacyLevel}
                onChange={(e) => setPrivacyLevel(e.target.value)}
              >
                <option value="PUBLIC_TO_EVERYONE">所有人</option>
                <option value="MUTUAL_FOLLOW_FRIENDS">互相关注的好友</option>
                <option value="FOLLOWER_OF_CREATOR">我的粉丝</option>
                <option value="SELF_ONLY">仅自己可见</option>
              </select>
            </div>

            {/* Commercial content disclosure */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">商业内容披露</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={commercialDisclosure}
                  onClick={() => setCommercialDisclosure((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    commercialDisclosure ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      commercialDisclosure ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
              {commercialDisclosure && (
                <div className="mt-2 space-y-2 rounded-md border bg-muted/30 px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="brandType"
                      value="organic"
                      checked={brandType === "organic"}
                      onChange={() => setBrandType("organic")}
                      className="accent-primary"
                    />
                    推广我自己的品牌或产品
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="brandType"
                      value="content"
                      checked={brandType === "content"}
                      onChange={() => setBrandType("content")}
                      className="accent-primary"
                    />
                    推广第三方品牌或产品（赞助内容）
                  </label>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">选择视频</label>
              {videosLoading ? (
                <p className="text-xs text-muted-foreground">加载中…</p>
              ) : videos.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无可用视频</p>
              ) : (
                <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
                  {videos.map((v, i) => {
                    const selected = selectedUrl === v.download_url
                    return (
                      <button
                        key={v.name ?? i}
                        onClick={() => setSelectedUrl(v.download_url)}
                        className={`relative flex flex-col overflow-hidden rounded-md border text-left transition-colors ${
                          selected
                            ? "border-primary ring-2 ring-primary"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <div className="relative aspect-video w-full bg-muted">
                          <img
                            src={v.thumbnail_url}
                            alt={v.display_name}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          {selected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                              <svg
                                className="size-6 text-primary drop-shadow"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <span className="block truncate px-1 py-0.5 text-[11px] text-muted-foreground">
                          {v.display_name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {publishError && (
              <p className="text-xs text-destructive">{publishError}</p>
            )}
            {publishOk && (
              <p className="text-xs text-green-500">发布成功！</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPublishOpen(false)}
              disabled={publishingMode !== null}
            >
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePublish("upload")}
              disabled={publishingMode !== null || publishOk}
            >
              {publishingMode === "upload" ? "上传中…" : "发布到草稿箱"}
            </Button>
            <Button
              size="sm"
              onClick={() => handlePublish("publish")}
              disabled={publishingMode !== null || publishOk}
            >
              {publishingMode === "publish" ? "发布中…" : "直接发布"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
