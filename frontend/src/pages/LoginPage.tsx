import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import logo from "@/assets/logo.png"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [name, setName] = useState("")
  const [pwd, setPwd] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(name, pwd)
      navigate("/", { replace: true })
    } catch (err: any) {
      setError(err.message || "登录失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center">
            <img src={logo} alt="logo" className="mb-2 h-10 w-10" />
            <CardTitle className="text-xl">登录 TKMax</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">用户名</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pwd">密码</Label>
                <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "登录中…" : "登录"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <footer className="flex flex-col items-center gap-2 border-t px-6 py-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2">
          <img src="/img/TKMax.png" alt="TKMax" className="h-5 w-5" />
          <span>TKMax</span>
        </div>
        <div>&copy; 2026 Wisdom Horizon Inc All rights reserved.</div>
        <div className="flex gap-4">
          <a href="https://tkmax.wh-press.com/privacy" className="hover:underline">Privacy Policy</a>
          <a href="https://tkmax.wh-press.com/terms" className="hover:underline">Terms of Service</a>
          <a href="mailto:henryyu7705@gmail.com" className="hover:underline">Contact</a>
        </div>
      </footer>
    </div>
  )
}
