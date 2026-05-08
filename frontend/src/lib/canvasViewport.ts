let _getter: (() => { x: number; y: number } | null) | null = null

export function registerViewportGetter(fn: () => { x: number; y: number } | null) {
  _getter = fn
}

export function unregisterViewportGetter() {
  _getter = null
}

export function getCanvasViewportCenter(): { x: number; y: number } | null {
  return _getter?.() ?? null
}
