import { useEffect, useRef, useState } from "react"
import { Trash2Icon, CopyIcon, CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import SearchResultCard, { type SearchResult } from "./SearchResultCard"
import GenerateResultCard, { type GenerateResult } from "./GenerateResultCard"
import NarrationResultCard, { type NarrationResult } from "./NarrationResultCard"
import type { Asset } from "@/types/asset"

export interface ChatMessage {
  id: number
  session_id: number
  role: "user" | "assistant"
  content: string
  model: string | null
  created_at: string
}

export type DisplayMessage = ChatMessage | SearchResult | GenerateResult | NarrationResult

function isChatMessage(msg: DisplayMessage): msg is ChatMessage {
  return !("type" in msg && (msg.type === "search_result" || msg.type === "generate_result" || msg.type === "narration_result"))
}

function isGenerateResult(msg: DisplayMessage): msg is GenerateResult {
  return "type" in msg && msg.type === "generate_result"
}

function isNarrationResult(msg: DisplayMessage): msg is NarrationResult {
  return "type" in msg && msg.type === "narration_result"
}

interface MessageListProps {
  messages: DisplayMessage[]
  streaming?: boolean
  onDelete?: (messageId: number) => void
  selectedAssetId?: string
  taskAssetIds?: Set<string>
  onSelectAsset?: (asset: Asset) => void
  onToggleFavorite?: (asset: Asset) => void
  onToggleProject?: (asset: Asset) => void
  onClickNarration?: (narrationId: string) => void
}

export default function MessageList({ messages, streaming, onDelete, selectedAssetId, taskAssetIds, onSelectAsset, onToggleFavorite, onToggleProject, onClickNarration }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleCopy = async (msg: ChatMessage) => {
    await navigator.clipboard.writeText(msg.content)
    setCopiedId(msg.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-2">
      {messages.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-muted-foreground">还没有消息，开始对话吧</p>
        </div>
      )}
      {messages.map((msg, idx) => {
        if (isNarrationResult(msg)) {
          const isTemp = msg.id < 0
          return (
            <div key={msg.id} className="group relative flex justify-start">
              {!isTemp && onDelete && (
                <button
                  type="button"
                  className="absolute right-0 top-0 z-10 rounded-md p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={() => { if (window.confirm("确认删除这条消息？")) onDelete(msg.id) }}
                >
                  <Trash2Icon className="size-3" />
                </button>
              )}
              <div className="max-w-[95%]">
                <NarrationResultCard
                  data={msg}
                  onClick={msg.narration_id ? () => onClickNarration?.(msg.narration_id!) : undefined}
                />
              </div>
            </div>
          )
        }

        if (isGenerateResult(msg)) {
          const isTemp = msg.id < 0
          return (
            <div key={msg.id} className="group relative flex justify-start">
              {!isTemp && onDelete && (
                <button
                  type="button"
                  className="absolute right-0 top-0 z-10 rounded-md p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={() => { if (window.confirm("确认删除这条消息？")) onDelete(msg.id) }}
                >
                  <Trash2Icon className="size-3" />
                </button>
              )}
              <div className="max-w-[95%]">
                <GenerateResultCard
                  data={msg}
                  selectedAssetId={selectedAssetId}
                  onSelectAsset={onSelectAsset}
                />
              </div>
            </div>
          )
        }

        if (!isChatMessage(msg)) {
          const isTemp = msg.id < 0
          return (
            <div key={msg.id} className="group relative flex justify-start">
              {!isTemp && onDelete && (
                <button
                  type="button"
                  className="absolute right-0 top-0 z-10 rounded-md p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={() => { if (window.confirm("确认删除这条消息？")) onDelete(msg.id) }}
                >
                  <Trash2Icon className="size-3" />
                </button>
              )}
              <div className="max-w-[95%]">
                <SearchResultCard
                  data={msg as SearchResult}
                  selectedAssetId={selectedAssetId}
                  taskAssetIds={taskAssetIds}
                  onSelectAsset={onSelectAsset}
                  onToggleFavorite={onToggleFavorite}
                  onToggleProject={onToggleProject}
                />
              </div>
            </div>
          )
        }

        const isUser = msg.role === "user"
        const isLastAssistant = !isUser && idx === messages.length - 1 && streaming
        const isEmpty = !msg.content
        const isTemp = msg.id < 0

        return (
          <div
            key={msg.id}
            className={cn("group relative flex", isUser ? "justify-end" : "justify-start")}
          >
            {!isTemp && (
              <div
                className={cn(
                  "absolute top-0 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
                  isUser ? "left-0" : "right-0",
                )}
              >
                <button
                  type="button"
                  className="rounded-md p-0.5 text-muted-foreground/60 hover:text-foreground"
                  onClick={() => handleCopy(msg)}
                >
                  {copiedId === msg.id ? (
                    <CheckIcon className="size-3" />
                  ) : (
                    <CopyIcon className="size-3" />
                  )}
                </button>
                {onDelete && (
                  <button
                    type="button"
                    className="rounded-md p-0.5 text-muted-foreground/60 hover:text-destructive"
                    onClick={() => {
                      if (window.confirm("确认删除这条消息？")) onDelete(msg.id)
                    }}
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                )}
              </div>
            )}
            <div
              className={cn(
                "max-w-[88%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-xs leading-relaxed",
                isUser
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted text-foreground",
              )}
            >
              {isEmpty && isLastAssistant ? (
                <span className="inline-flex gap-1">
                  <span className="size-1 animate-bounce rounded-full bg-foreground/40 [animation-delay:0ms]" />
                  <span className="size-1 animate-bounce rounded-full bg-foreground/40 [animation-delay:150ms]" />
                  <span className="size-1 animate-bounce rounded-full bg-foreground/40 [animation-delay:300ms]" />
                </span>
              ) : (
                msg.content
              )}
              {isLastAssistant && !isEmpty && (
                <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-foreground/50" />
              )}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
