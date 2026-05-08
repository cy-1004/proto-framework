import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"

interface User {
  id: number
  name: string
  quota: number
  role: "user" | "pro" | "admin"
}

interface AuthContextType {
  user: User | null
  isLoginEnabled: boolean
  enableDownload: boolean
  isLoading: boolean
  login: (name: string, pwd: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>(null!)

const TOKEN_KEY = "kick_token"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoginEnabled, setIsLoginEnabled] = useState(false)
  const [enableDownload, setEnableDownload] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) { setUser(null); return }
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        setUser(await res.json())
      } else {
        localStorage.removeItem(TOKEN_KEY)
        setUser(null)
      }
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/auth/config")
        const data = await res.json()
        setIsLoginEnabled(data.enable_login)
        setEnableDownload(!!data.enable_download)
        if (data.enable_login) await refreshUser()
      } catch { /* ignore */ }
      setIsLoading(false)
    })()
  }, [refreshUser])

  const login = useCallback(async (name: string, pwd: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pwd }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || "登录失败")
    }
    const data = await res.json()
    localStorage.setItem(TOKEN_KEY, data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoginEnabled, enableDownload, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
