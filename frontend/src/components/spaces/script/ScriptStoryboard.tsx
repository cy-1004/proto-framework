import { useState, useRef, useCallback } from "react"

interface AudioConfig {
  bgm_style?: string
  audio_priority?: string
  voiceover_tone?: string
}

interface Metadata {
  platform?: string
  product_name?: string
  target_audience?: string[]
  estimated_duration?: string
  audio_config?: AudioConfig
}

interface Scene {
  scene_id?: number
  segment_type?: string
  time_range?: string
  voiceover?: string
  visual_description?: string
  text_stickers?: string[]
  post_production_notes?: string
}

interface PublishingStrategy {
  video_title?: string
  hashtags?: string[]
  best_posting_time?: string
  operation_tips?: string
}

interface VideoProject {
  metadata?: Metadata
  storyboard?: Scene[]
  publishing_strategy?: PublishingStrategy
}

export interface StoryboardData {
  video_project?: VideoProject
  content?: string
  score?: number
}

interface ScriptStoryboardProps {
  data: StoryboardData
  /** Called with full updated data after 800ms debounce */
  onSave?: (data: StoryboardData) => void
}

// ── Tiny helper components ──────────────────────────────────────────────────

const EDITABLE_BASE =
  "w-full bg-transparent transition-colors rounded px-1 -ml-1 " +
  "hover:bg-muted/40 focus:bg-muted/60 focus:outline-none placeholder:text-muted-foreground/40"

function EditableInput({
  value,
  onChange,
  placeholder = "—",
  className = "",
}: {
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${EDITABLE_BASE} ${className}`}
    />
  )
}

function EditableTextarea({
  value,
  onChange,
  placeholder = "—",
  className = "",
}: {
  value: string | undefined
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto"
    el.style.height = el.scrollHeight + "px"
  }

  return (
    <textarea
      ref={ref}
      value={value ?? ""}
      rows={1}
      placeholder={placeholder}
      onChange={(e) => {
        resize(e.target)
        onChange(e.target.value)
      }}
      onFocus={(e) => resize(e.target)}
      className={`${EDITABLE_BASE} resize-none overflow-hidden ${className}`}
    />
  )
}

/** Comma-separated array editor — renders as a single input */
function EditableTags({
  tags,
  onChange,
  className = "",
}: {
  tags: string[] | undefined
  onChange: (tags: string[]) => void
  className?: string
}) {
  return (
    <input
      value={(tags ?? []).join(", ")}
      placeholder="用逗号分隔"
      onChange={(e) =>
        onChange(
          e.target.value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        )
      }
      className={`${EDITABLE_BASE} text-xs ${className}`}
    />
  )
}

// ── Segment type color map ──────────────────────────────────────────────────

const SEGMENT_COLORS: Record<string, string> = {
  Hook: "bg-orange-500/10 text-orange-600 border-orange-200",
  "黄金3秒": "bg-orange-500/10 text-orange-600 border-orange-200",
  "Pain Points": "bg-rose-500/10 text-rose-600 border-rose-200",
  痛点: "bg-rose-500/10 text-rose-600 border-rose-200",
  Demo: "bg-blue-500/10 text-blue-600 border-blue-200",
  展示: "bg-blue-500/10 text-blue-600 border-blue-200",
  CTA: "bg-green-500/10 text-green-600 border-green-200",
  逼单: "bg-green-500/10 text-green-600 border-green-200",
}

function segmentColor(type?: string): string {
  if (!type) return "bg-muted text-muted-foreground border-border"
  for (const [key, cls] of Object.entries(SEGMENT_COLORS)) {
    if (type.includes(key)) return cls
  }
  return "bg-muted/50 text-foreground border-border"
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ScriptStoryboard({ data, onSave }: ScriptStoryboardProps) {
  const [draft, setDraft] = useState<StoryboardData>(() => JSON.parse(JSON.stringify(data)))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Schedule debounced save (800 ms) */
  const scheduleSave = useCallback(
    (next: StoryboardData) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onSave?.(next), 800)
    },
    [onSave],
  )

  // ── Updaters ───────────────────────────────────────────────────────────────

  const updateMeta = useCallback(
    (key: keyof Metadata, value: unknown) => {
      setDraft((prev) => {
        const next: StoryboardData = {
          ...prev,
          video_project: {
            ...prev.video_project,
            metadata: { ...prev.video_project?.metadata, [key]: value },
          },
        }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const updateAudio = useCallback(
    (key: keyof AudioConfig, value: string) => {
      setDraft((prev) => {
        const next: StoryboardData = {
          ...prev,
          video_project: {
            ...prev.video_project,
            metadata: {
              ...prev.video_project?.metadata,
              audio_config: {
                ...prev.video_project?.metadata?.audio_config,
                [key]: value,
              },
            },
          },
        }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const updateScene = useCallback(
    (idx: number, key: keyof Scene, value: unknown) => {
      setDraft((prev) => {
        const scenes = [...(prev.video_project?.storyboard ?? [])]
        scenes[idx] = { ...scenes[idx], [key]: value }
        const next: StoryboardData = {
          ...prev,
          video_project: { ...prev.video_project, storyboard: scenes },
        }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const updatePub = useCallback(
    (key: keyof PublishingStrategy, value: unknown) => {
      setDraft((prev) => {
        const next: StoryboardData = {
          ...prev,
          video_project: {
            ...prev.video_project,
            publishing_strategy: { ...prev.video_project?.publishing_strategy, [key]: value },
          },
        }
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  // ── Derived ────────────────────────────────────────────────────────────────

  const vp = draft.video_project ?? {}
  const meta = vp.metadata ?? {}
  const scenes = vp.storyboard ?? []
  const pub = vp.publishing_strategy ?? {}

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 px-6 py-6 overflow-auto h-full">

      {/* ── 元数据 ─────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          项目信息
        </h4>

        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <div className="min-w-[120px]">
            <p className="text-muted-foreground text-xs mb-0.5">商品</p>
            <EditableInput
              value={meta.product_name}
              onChange={(v) => updateMeta("product_name", v)}
              placeholder="商品名称"
              className="font-medium"
            />
          </div>
          <div className="min-w-[100px]">
            <p className="text-muted-foreground text-xs mb-0.5">平台</p>
            <EditableInput
              value={meta.platform}
              onChange={(v) => updateMeta("platform", v)}
              placeholder="平台"
              className="font-medium"
            />
          </div>
          <div className="min-w-[80px]">
            <p className="text-muted-foreground text-xs mb-0.5">时长</p>
            <EditableInput
              value={meta.estimated_duration}
              onChange={(v) => updateMeta("estimated_duration", v)}
              placeholder="如 60s"
              className="font-medium"
            />
          </div>
          {draft.score != null && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">评分</p>
              <p className="font-medium text-sm">{draft.score.toFixed(1)} / 10</p>
            </div>
          )}
        </div>

        {/* 受众 */}
        <div className="mt-3">
          <p className="text-muted-foreground text-xs mb-1">目标受众</p>
          <EditableTags
            tags={meta.target_audience}
            onChange={(v) => updateMeta("target_audience", v)}
          />
          {/* preview pills */}
          {(meta.target_audience?.length ?? 0) > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 pointer-events-none">
              {meta.target_audience!.map((a, i) => (
                <span
                  key={i}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 音频配置 */}
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground mb-0.5">🎵 BGM 风格</p>
            <EditableInput
              value={meta.audio_config?.bgm_style}
              onChange={(v) => updateAudio("bgm_style", v)}
              placeholder="—"
              className="text-xs"
            />
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">🎙 配音风格</p>
            <EditableInput
              value={meta.audio_config?.voiceover_tone}
              onChange={(v) => updateAudio("voiceover_tone", v)}
              placeholder="—"
              className="text-xs"
            />
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">🔊 音频优先</p>
            <EditableInput
              value={meta.audio_config?.audio_priority}
              onChange={(v) => updateAudio("audio_priority", v)}
              placeholder="—"
              className="text-xs"
            />
          </div>
        </div>
      </section>

      {/* ── 分镜脚本 ───────────────────────────────────────────────────────── */}
      {scenes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            分镜脚本 · {scenes.length} 段
          </h4>

          {scenes.map((scene, idx) => (
            <div key={idx} className="rounded-xl border bg-card overflow-hidden">

              {/* 场景头部 */}
              <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
                <span className="text-xs font-mono text-muted-foreground w-5 text-center">
                  {scene.scene_id ?? idx + 1}
                </span>

                {/* segment_type — 可编辑 */}
                <input
                  value={scene.segment_type ?? ""}
                  onChange={(e) => updateScene(idx, "segment_type", e.target.value)}
                  placeholder="类型"
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium bg-transparent
                    focus:outline-none focus:ring-1 focus:ring-ring w-24
                    ${segmentColor(scene.segment_type)}`}
                />

                {/* time_range */}
                <input
                  value={scene.time_range ?? ""}
                  onChange={(e) => updateScene(idx, "time_range", e.target.value)}
                  placeholder="时间轴"
                  className="ml-auto text-xs text-muted-foreground font-mono bg-transparent
                    focus:outline-none hover:bg-muted/40 focus:bg-muted/60 rounded px-1 w-24 text-right"
                />
              </div>

              {/* 口播 / 画面 */}
              <div className="grid grid-cols-2 divide-x text-sm">
                <div className="px-4 py-3">
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    🎤 口播文案
                  </p>
                  <EditableTextarea
                    value={scene.voiceover}
                    onChange={(v) => updateScene(idx, "voiceover", v)}
                    placeholder="口播内容..."
                    className="leading-relaxed text-foreground text-sm"
                  />
                </div>
                <div className="px-4 py-3">
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    📷 画面描述
                  </p>
                  <EditableTextarea
                    value={scene.visual_description}
                    onChange={(v) => updateScene(idx, "visual_description", v)}
                    placeholder="画面说明..."
                    className="leading-relaxed text-muted-foreground text-sm"
                  />
                </div>
              </div>

              {/* 贴纸 / 后期 */}
              <div className="flex flex-wrap items-start gap-3 border-t bg-muted/20 px-4 py-2.5">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-[10px] text-muted-foreground mb-0.5">贴纸文字（逗号分隔）</p>
                  <EditableTags
                    tags={scene.text_stickers}
                    onChange={(v) => updateScene(idx, "text_stickers", v)}
                  />
                  {(scene.text_stickers?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 pointer-events-none">
                      {scene.text_stickers!.map((s, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-yellow-100 px-2 py-0.5 text-[11px] text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-[160px]">
                  <p className="text-[10px] text-muted-foreground mb-0.5">🎬 后期备注</p>
                  <EditableInput
                    value={scene.post_production_notes}
                    onChange={(v) => updateScene(idx, "post_production_notes", v)}
                    placeholder="—"
                    className="text-[11px] text-muted-foreground"
                  />
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── 发布策略 ───────────────────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          发布策略
        </h4>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">视频标题</p>
            <EditableInput
              value={pub.video_title}
              onChange={(v) => updatePub("video_title", v)}
              placeholder="视频标题..."
              className="text-sm font-medium"
            />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-0.5">⏰ 最佳发布时间</p>
            <EditableInput
              value={pub.best_posting_time}
              onChange={(v) => updatePub("best_posting_time", v)}
              placeholder="如 晚间 20:00–22:00"
              className="text-xs"
            />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-0.5">💡 运营提示</p>
            <EditableTextarea
              value={pub.operation_tips}
              onChange={(v) => updatePub("operation_tips", v)}
              placeholder="运营建议..."
              className="text-xs"
            />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-0.5">话题标签（逗号分隔，无需 #）</p>
            <EditableTags
              tags={pub.hashtags}
              onChange={(v) => updatePub("hashtags", v)}
            />
            {(pub.hashtags?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 pointer-events-none">
                {pub.hashtags!.map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  )
}
