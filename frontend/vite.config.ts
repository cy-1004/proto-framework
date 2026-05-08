import path from "path"
import { fileURLToPath } from "url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const vitePort = parseInt(process.env.VITE_PORT || env.VITE_PORT || "5173")
  const apiPort = parseInt(process.env.API_PORT || env.API_PORT || "8000")

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: vitePort,
      proxy: {
        "/api": `http://127.0.0.1:${apiPort}`,
        "/media": `http://127.0.0.1:${apiPort}`,
      },
      allowedHosts: ["localhost", "127.0.0.1", "groot"],
    },
  }
})
