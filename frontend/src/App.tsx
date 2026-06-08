import { Routes, Route, Navigate } from "react-router-dom"
import { Toaster } from "sonner"
import { useAuth } from "./contexts/AuthContext"
import HomePage from "./pages/HomePage"
import TaskPage from "./pages/TaskPage"
import LoginPage from "./pages/LoginPage"
import UserManagePage from "./pages/UserManagePage"
import ToolsPage from "./pages/ToolsPage"
import DebugPanel from "./components/DebugPanel"

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoginEnabled, isLoading } = useAuth()
  if (isLoading) return null
  if (isLoginEnabled && !user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoginEnabled, isLoading } = useAuth()
  if (isLoading) return null
  if (isLoginEnabled && !user) return <Navigate to="/login" replace />
  if (isLoginEnabled && user?.role !== "admin") return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/task/:id/:stageId" element={<RequireAuth><TaskPage /></RequireAuth>} />
        <Route path="/task/:id/:stageId/:category" element={<RequireAuth><TaskPage /></RequireAuth>} />
        <Route path="/admin/users" element={<RequireAdmin><UserManagePage /></RequireAdmin>} />
        <Route path="/tools" element={<RequireAuth><ToolsPage /></RequireAuth>} />
      </Routes>
      <DebugPanel />
      <Toaster position="top-center" richColors />
    </>
  )
}
