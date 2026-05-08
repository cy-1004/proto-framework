import { createContext, useCallback, useContext, useRef, useState } from "react"

interface PlaybackState {
  assetId: string | null
  currentTime: number
  segmentIndex: number
  activeEntitySegIndices: number[]
  isPlaying: boolean
}

interface NarationPlaybackCtx extends PlaybackState {
  update: (s: Partial<PlaybackState>) => void
  stop: () => void
}

const initial: PlaybackState = { assetId: null, currentTime: 0, segmentIndex: -1, activeEntitySegIndices: [], isPlaying: false }

const Ctx = createContext<NarationPlaybackCtx>({
  ...initial,
  update: () => {},
  stop: () => {},
})

export function NarationPlaybackProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlaybackState>(initial)
  const stateRef = useRef(state)
  stateRef.current = state

  const update = useCallback((patch: Partial<PlaybackState>) => {
    setState((prev) => ({ ...prev, ...patch }))
  }, [])

  const stop = useCallback(() => {
    setState(initial)
  }, [])

  return <Ctx value={{ ...state, update, stop }}>{children}</Ctx>
}

export function useNarationPlayback() {
  return useContext(Ctx)
}
