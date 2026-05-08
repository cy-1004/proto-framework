import { getToken } from "@/contexts/AuthContext"

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init?.headers)
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401) {
    const isLoginEnabled = await fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => d.enable_login)
      .catch(() => false)
    if (isLoginEnabled) {
      localStorage.removeItem("kick_token")
      window.location.href = "/login"
    }
  }
  return res
}
