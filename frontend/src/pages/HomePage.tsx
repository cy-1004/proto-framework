import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { User, Trash2, LogIn, LogOut, Users } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import logo from "@/assets/logo.png"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import HomeInput from "@/components/HomeInput"
import { TASK_STAGES } from "@/config/options"

interface Task {
  id: number
  title: string
  description: string
  status: string
  cover_image: string
}

export default function HomePage() {
  const navigate = useNavigate()
  const { user, isLoginEnabled, logout } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    apiFetch("/api/tasks")
      .then((r) => r.json())
      .then(setTasks)
      .catch(console.error)
  }, [])

  const handleDelete = async (e: React.MouseEvent, taskId: number) => {
    e.stopPropagation()
    if (!window.confirm("确定删除该任务？此操作不可恢复。")) return
    const res = await apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" })
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <img src={logo} alt="logo" className="h-6 w-6" />
          <h1 className="text-lg font-semibold">TKMax</h1>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="size-8 cursor-pointer">
              <AvatarFallback>
                <User className="size-4" />
              </AvatarFallback>
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

      <main className="mx-auto flex max-w-[54rem] flex-col items-center gap-6 px-4 pt-24">
        <HomeInput />

        <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {tasks.map((task) => (
            <Card
              key={task.id}
              className="group relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
              style={{ aspectRatio: "3 / 4" }}
              onClick={() => navigate(`/task/${task.id}/${TASK_STAGES.stages[0].id}`)}
            >
              <button
                className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                onClick={(e) => handleDelete(e, task.id)}
              >
                <Trash2 className="size-3.5" />
              </button>
              {task.cover_image && (
                <div className="relative h-2/3 w-full overflow-hidden">
                  <img
                    src={`/media/${task.cover_image}`}
                    alt={task.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <CardHeader className={`flex flex-col justify-end p-4 ${task.cover_image ? "h-1/3" : "h-full"}`}>
                <CardTitle className="text-sm">{task.title}</CardTitle>
                <CardDescription className="line-clamp-2 text-xs">{task.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
