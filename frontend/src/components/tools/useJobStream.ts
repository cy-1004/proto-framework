import { useEffect, useState } from "react"

export interface JobStreamState {
  status: "idle" | "pending" | "running" | "complete" | "failed"
  progress: number
  message: string
  result: Record<string, unknown> | null
  error: string | null
}

export function useJobStream(jobId: string | null): JobStreamState {
  const [state, setState] = useState<JobStreamState>({
    status: "idle",
    progress: 0,
    message: "",
    result: null,
    error: null,
  })

  useEffect(() => {
    if (!jobId) return
    setState({ status: "pending", progress: 0, message: "等待中...", result: null, error: null })

    const es = new EventSource(`/api/tools/jobs/${jobId}/stream`)

    es.addEventListener("progress", (e: MessageEvent) => {
      const data = JSON.parse(e.data)
      setState(prev => ({ ...prev, status: data.status, progress: data.progress, message: data.message }))
    })

    es.addEventListener("complete", (e: MessageEvent) => {
      const data = JSON.parse(e.data)
      setState({ status: "complete", progress: 100, message: "完成", result: data, error: null })
      es.close()
    })

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        setState(prev => ({ ...prev, status: "failed", error: data.error || "生成失败" }))
      } catch {
        setState(prev => ({ ...prev, status: "failed", error: "连接中断" }))
      }
      es.close()
    })

    es.onerror = () => {
      setState(prev => {
        if (prev.status !== "complete" && prev.status !== "failed") {
          return { ...prev, status: "failed", error: "SSE 连接异常，请重试" }
        }
        return prev
      })
      es.close()
    }

    return () => es.close()
  }, [jobId])

  return state
}
