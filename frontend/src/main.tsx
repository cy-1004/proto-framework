// import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NarationPlaybackProvider } from "@/contexts/NarationPlaybackContext"
import { AuthProvider } from "@/contexts/AuthContext"
import App from "@/App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  // <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NarationPlaybackProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </NarationPlaybackProvider>
      </AuthProvider>
    </BrowserRouter>
  // </StrictMode>
)
