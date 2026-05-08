import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

interface UserItem {
  id: number
  name: string
  quota: number
  role: string
  created_at: string
}

const EMPTY_FORM = { name: "", pwd: "", quota: 100, role: "user" }

export default function UserManagePage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserItem[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UserItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState("")

  const load = () =>
    apiFetch("/api/users").then((r) => r.json()).then(setUsers).catch(console.error)

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError("")
    setOpen(true)
  }

  const openEdit = (u: UserItem) => {
    setEditing(u)
    setForm({ name: u.name, pwd: "", quota: u.quota, role: u.role })
    setError("")
    setOpen(true)
  }

  const handleSubmit = async () => {
    setError("")
    try {
      if (editing) {
        const body: Record<string, any> = {}
        if (form.name !== editing.name) body.name = form.name
        if (form.pwd) body.pwd = form.pwd
        if (form.quota !== editing.quota) body.quota = form.quota
        if (form.role !== editing.role) body.role = form.role
        const res = await apiFetch(`/api/users/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) { setError((await res.json()).detail || "更新失败"); return }
      } else {
        if (!form.name || !form.pwd) { setError("用户名和密码不能为空"); return }
        const res = await apiFetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) { setError((await res.json()).detail || "创建失败"); return }
      }
      setOpen(false)
      load()
    } catch { setError("请求失败") }
  }

  const handleDelete = async (u: UserItem) => {
    if (!window.confirm(`确定删除用户「${u.name}」？`)) return
    const res = await apiFetch(`/api/users/${u.id}`, { method: "DELETE" })
    if (res.ok) load()
  }

  const roleBadge = (role: string) => {
    const cls = role === "admin"
      ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
      : role === "pro"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
    return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{role}</span>
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-3 border-b px-6 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">用户管理</h1>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={openCreate}><Plus className="mr-1 size-4" /> 新增用户</Button>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead className="w-24">角色</TableHead>
                <TableHead className="w-24 text-right">配额</TableHead>
                <TableHead className="w-28 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.id}</TableCell>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{roleBadge(u.role)}</TableCell>
                  <TableCell className="text-right">{u.quota}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(u)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(u)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑用户" : "新增用户"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>用户名</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{editing ? "新密码（留空不修改）" : "密码"}</Label>
              <Input type="password" value={form.pwd} onChange={(e) => setForm({ ...form, pwd: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>角色</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="pro">pro</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>配额</Label>
              <Input type="number" value={form.quota} onChange={(e) => setForm({ ...form, quota: Number(e.target.value) })} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={handleSubmit}>{editing ? "保存" : "创建"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
