import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Mic, PenLine, Volume2, Video, User, LogOut, LogIn, Users } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import logo from "@/assets/logo.png"
import TranscribeTool from "@/components/tools/TranscribeTool"
import CopywriteTool from "@/components/tools/CopywriteTool"
import TTSTool from "@/components/tools/TTSTool"
import VideoGenTool from "@/components/tools/VideoGenTool"

const TOOLS = [
  {
    id: "transcribe",
    label: "音视频转录",
    icon: Mic,
    desc: "上传文件或 TikTok 链接，自动识别人声文字",
  },
  {
    id: "copywrite",
    label: "创作口播",
    icon: PenLine,
    desc: "根据参考内容 AI 创作 TikTok 口播文案",
  },
  {
    id: "tts",
    label: "语音合成",
    icon: Volume2,
    desc: "MiniMax TTS · 多音色 · 情绪 · 发音字典",
  },
  {
    id: "video",
    label: "视频生成",
    icon: Video,
    desc: "多模型文/图生视频，支持 Seedance、Veo、Hailuo 等",
  },
]

export default function ToolsPage() {
  const navigate = useNavigate()
  const { user, isLoginEnabled, logout } = useAuth()
  const [activeId, setActiveId] = useState(TOOLS[0].id)

  const activeTool = TOOLS.find(t => t.id === activeId)!

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <nav className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            返回
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <img src={logo} alt="logo" className="h-5 w-5" />
            <span className="text-sm font-semibold">TKMAX 工具集</span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="size-8 cursor-pointer">
              <AvatarFallback><User className="size-4" /></AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isLoginEnabled && user ? (
              <>
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span>{user.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user.role}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.role === "admin" && (
                  <DropdownMenuItem onClick={() => navigate("/admin/users")}>
                    <Users className="mr-2 size-4" /> 用户管理
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { logout(); navigate("/login") }}>
                  <LogOut className="mr-2 size-4" /> 退出登录
                </DropdownMenuItem>
              </>
            ) : isLoginEnabled ? (
              <DropdownMenuItem onClick={() => navigate("/login")}>
                <LogIn className="mr-2 size-4" /> 登录
              </DropdownMenuItem>
            ) : (
              <DropdownMenuLabel className="text-muted-foreground">未启用登录</DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r p-3 sm:flex">
          {TOOLS.map(tool => {
            const Icon = tool.icon
            const active = tool.id === activeId
            return (
              <button
                key={tool.id}
                onClick={() => setActiveId(tool.id)}
                className={`flex items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon className="mt-0.5 size-4 shrink-0" />
                <div>
                  <div className="text-sm font-medium leading-tight">{tool.label}</div>
                  <div className="mt-0.5 text-xs leading-snug opacity-70">{tool.desc}</div>
                </div>
              </button>
            )
          })}
        </aside>

        {/* Mobile tab bar */}
        <div className="flex w-full flex-col sm:hidden">
          <div className="flex overflow-x-auto border-b">
            {TOOLS.map(tool => {
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveId(tool.id)}
                  className={`flex shrink-0 flex-col items-center gap-1 px-4 py-2.5 text-xs transition-colors ${
                    activeId === tool.id
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  {tool.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">{activeTool.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{activeTool.desc}</p>
            </div>

            {activeId === "transcribe" && <TranscribeTool />}
            {activeId === "copywrite" && <CopywriteTool />}
            {activeId === "tts" && <TTSTool />}
            {activeId === "video" && <VideoGenTool />}
          </div>
        </main>
      </div>
    </div>
  )
}
