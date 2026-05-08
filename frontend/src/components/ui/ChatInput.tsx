import { useRef, useState, useEffect, useCallback, isValidElement, cloneElement, type ReactNode, type ReactElement } from "react"
import { ChevronDown, ChevronUp, ArrowUp, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import MediaUploader, { type MediaFileInfo, type PreloadedFile } from "@/components/ui/MediaUploader"
import type { Asset } from "@/types/asset"

export interface UploadConfig {
  maxFiles?: number
  accept?: string
  maxSizeMB?: number
  hint?: string
}

export interface ControllerConfig {
  label: string
  pos?: "up" | "down"
  align?: "left" | "right"
  widget: ReactElement<{
    onChange?: (params: Record<string, any>) => void
    mediaFiles?: MediaFileInfo[]
  }>
  uploadConfig?: UploadConfig
}

export interface SubSubMenuItem {
  label: string
  icon?: ReactNode
  statusValue?: number
  onSubmit?: (query: string, params?: Record<string, any>) => void
  controller?: ControllerConfig
}

export interface SubMenuItem {
  label: string
  icon?: ReactNode
  statusValue?: number
  onSubmit?: (query: string, params?: Record<string, any>) => void
  subMenu?: SubSubMenuItem[]
  controller?: ControllerConfig
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  placeholder?: string
  subMenu?: SubMenuItem[]
  statusValue?: number
  onSubmit?: (query: string, params?: Record<string, any>) => void
  controller?: ControllerConfig
}

export interface ChatInputConfig {
  show?: {
    upload?: boolean
    menuPos?: "down" | "up"
    size?: "small" | "large"
  }
  menu: MenuItem[]
}

export interface EditingAsset {
  asset: Asset
  nonce: number
}

interface ChatInputProps {
  config: ChatInputConfig
  defaultPlaceholder?: string
  editingAsset?: EditingAsset | null
}

export default function ChatInput({
  config,
  defaultPlaceholder = "输入内容...",
  editingAsset,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState("")
  const [menuIdx, setMenuIdx] = useState(0)
  const [subIdx, setSubIdx] = useState(0)
  const [sub2Idx, setSub2Idx] = useState(0)
  const [activeDropdown, setActiveDropdown] = useState<"main" | "sub" | "sub2" | null>(null)
  const [controllerOpen, setControllerOpen] = useState(false)
  const [controllerParams, setControllerParams] = useState<Record<string, any>>({})
  const [uploadedFiles, setUploadedFiles] = useState<MediaFileInfo[]>([])
  const [uploaderKey, setUploaderKey] = useState(0)
  const [libraryFiles, setLibraryFiles] = useState<PreloadedFile[]>([])

  const handleControllerChange = useCallback((params: Record<string, any>) => {
    setControllerParams(params)
  }, [])

  const editNonceRef = useRef(0)
  useEffect(() => {
    if (!editingAsset || editingAsset.nonce === editNonceRef.current) return
    editNonceRef.current = editingAsset.nonce
    const asset = editingAsset.asset
    const targetLabel = asset.mediatype === "video" ? "生视频" : "生图片"
    const idx = config.menu.findIndex((m) => m.label === targetLabel)
    if (idx >= 0) setMenuIdx(idx)
    setSubIdx(0)
    setSub2Idx(0)
    setValue("")
    if (asset.uri && asset.mediatype) {
      const previewUrl = asset.mediatype === "video"
        ? `/media/${asset.uri}`
        : `/media/${asset.thumbnail || asset.uri}`
      setLibraryFiles([{
        previewUrl,
        serverFilename: asset.uri,
        mediaType: asset.mediatype,
      }])
    } else {
      setLibraryFiles([])
    }
    setUploaderKey((k) => k + 1)
  }, [editingAsset, config.menu])

  const menuPos = config.show?.menuPos ?? "down"
  const size = config.show?.size ?? "small"
  const lg = size === "large"
  const currentMenu = config.menu[menuIdx]
  const hasSubMenu = !!(currentMenu?.subMenu?.length)
  const currentSub = hasSubMenu ? currentMenu.subMenu![subIdx] : null
  const hasSub2Menu = !!(currentSub?.subMenu?.length)
  const currentLeaf: (SubSubMenuItem | SubMenuItem | MenuItem) | undefined = hasSub2Menu
    ? currentSub!.subMenu![sub2Idx]
    : hasSubMenu
      ? currentMenu.subMenu![subIdx]
      : currentMenu
  const currentController = currentLeaf?.controller
  const uploadCfg = currentController?.uploadConfig
  const showUpload = uploadCfg ? true : (config.show?.upload ?? false)

  const Chevron = menuPos === "up" ? ChevronUp : ChevronDown
  const dropdownPos = menuPos === "up" ? "bottom-full mb-1" : "top-full mt-1"

  useEffect(() => {
    setSubIdx(0)
    setSub2Idx(0)
  }, [menuIdx])

  useEffect(() => {
    setSub2Idx(0)
  }, [subIdx])

  useEffect(() => {
    setControllerOpen(false)
  }, [menuIdx, subIdx, sub2Idx])

  useEffect(() => {
    if (!showUpload) setUploadedFiles([])
  }, [showUpload])

  useEffect(() => {
    const handleClickOutside = () => {
      setActiveDropdown(null)
      setControllerOpen(false)
    }
    if (activeDropdown || controllerOpen) {
      document.addEventListener("click", handleClickOutside)
      return () => document.removeEventListener("click", handleClickOutside)
    }
  }, [activeDropdown, controllerOpen])

  const currentPlaceholder = currentMenu?.placeholder ?? defaultPlaceholder

  const handleFilesChange = useCallback((files: MediaFileInfo[]) => {
    setUploadedFiles(files)
  }, [])

  const handleSubmit = () => {
    if (!value.trim()) return
    const params: Record<string, any> = {
      ...(currentController ? controllerParams : {}),
      ...(uploadedFiles.length > 0 ? { media_files: uploadedFiles } : {}),
    }
    currentLeaf?.onSubmit?.(value, Object.keys(params).length > 0 ? params : undefined)
    setValue("")
    setUploadedFiles([])
    setLibraryFiles([])
    setUploaderKey((k) => k + 1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className={`flex w-full flex-col rounded-2xl border border-border bg-background shadow-sm ${lg ? "rounded-3xl" : ""}`}>
      <div className={`flex gap-3 ${lg ? "px-6 pt-6 pb-3" : "px-4 pt-4 pb-2"}`}>
        {showUpload && (
          <MediaUploader
            key={uploaderKey}
            maxFiles={uploadCfg?.maxFiles ?? 5}
            maxSizeMB={uploadCfg?.maxSizeMB}
            accept={uploadCfg?.accept}
            hint={uploadCfg?.hint}
            onChange={handleFilesChange}
            size={size}
            preloadedFiles={libraryFiles}
          />
        )}
        <textarea
          ref={textareaRef}
          className={`flex-1 resize-none bg-transparent pt-1 leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none ${lg ? "text-lg" : "text-sm"}`}
          placeholder={currentPlaceholder}
          rows={lg ? 4 : 3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className={`flex items-center gap-1 ${lg ? "px-5 pb-5 gap-2" : "px-3 pb-3"}`}>
        {/* 主菜单 */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-full font-medium gap-1 text-foreground ${lg ? "h-9 px-3.5 text-sm" : "h-7 px-2.5 text-xs"}`}
            onClick={(e) => {
              e.stopPropagation()
              setActiveDropdown(activeDropdown === "main" ? null : "main")
            }}
          >
            {currentMenu?.icon}
            {currentMenu?.label}
            {menuPos !== "up" && <Chevron className={lg ? "size-4" : "size-3"} />}
          </Button>

          {activeDropdown === "main" && (
            <div
              className={`absolute left-0 z-50 rounded-lg border border-border bg-popover p-1 shadow-md ${lg ? "min-w-[150px]" : "min-w-[120px]"} ${dropdownPos}`}
              onClick={(e) => e.stopPropagation()}
            >
              {config.menu.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-md transition-colors hover:bg-accent ${lg ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"} ${
                    menuIdx === idx ? "bg-accent font-medium" : ""
                  }`}
                  onClick={() => {
                    setMenuIdx(idx)
                    setActiveDropdown(null)
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 二级菜单（仅当主菜单项有 subMenu 时显示） */}
        {hasSubMenu && (
          <>
            <div className={`mx-0.5 w-px bg-border ${lg ? "h-5" : "h-4"}`} />
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className={`rounded-full font-medium gap-1 text-muted-foreground ${lg ? "h-9 px-3.5 text-sm" : "h-7 px-2.5 text-xs"}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveDropdown(activeDropdown === "sub" ? null : "sub")
                }}
              >
                {currentMenu.subMenu![subIdx].icon}
                {currentMenu.subMenu![subIdx].label}
                {menuPos !== "up" && <Chevron className={lg ? "size-4" : "size-3"} />}
              </Button>

              {activeDropdown === "sub" && (
                <div
                  className={`absolute left-0 z-50 rounded-lg border border-border bg-popover p-1 shadow-md ${lg ? "min-w-[150px]" : "min-w-[120px]"} ${dropdownPos}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {currentMenu.subMenu!.map((sub, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-md transition-colors hover:bg-accent ${lg ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"} ${
                        subIdx === idx ? "bg-accent font-medium" : ""
                      }`}
                      onClick={() => {
                        setSubIdx(idx)
                        setActiveDropdown(null)
                      }}
                    >
                      {sub.icon}
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* 三级菜单（仅当二级菜单项有 subMenu 时显示） */}
        {hasSub2Menu && (
          <>
            <div className={`mx-0.5 w-px bg-border ${lg ? "h-5" : "h-4"}`} />
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className={`rounded-full font-medium gap-1 text-muted-foreground ${lg ? "h-9 px-3.5 text-sm" : "h-7 px-2.5 text-xs"}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveDropdown(activeDropdown === "sub2" ? null : "sub2")
                }}
              >
                {currentSub!.subMenu![sub2Idx].icon}
                {currentSub!.subMenu![sub2Idx].label}
                {menuPos !== "up" && <Chevron className={lg ? "size-4" : "size-3"} />}
              </Button>

              {activeDropdown === "sub2" && (
                <div
                  className={`absolute left-0 z-50 rounded-lg border border-border bg-popover p-1 shadow-md ${lg ? "min-w-[150px]" : "min-w-[120px]"} ${dropdownPos}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {currentSub!.subMenu!.map((sub2, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-md transition-colors hover:bg-accent ${lg ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"} ${
                        sub2Idx === idx ? "bg-accent font-medium" : ""
                      }`}
                      onClick={() => {
                        setSub2Idx(idx)
                        setActiveDropdown(null)
                      }}
                    >
                      {sub2.icon}
                      {sub2.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Controller toggle + widget */}
        {currentController && (
          <>
            <div className={`mx-0.5 w-px bg-border ${lg ? "h-5" : "h-4"}`} />
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                className={`rounded-full font-medium gap-1 ${controllerOpen ? "bg-accent text-foreground" : "text-muted-foreground"} ${lg ? "h-9 px-3.5 text-sm" : "h-7 px-2.5 text-xs"}`}
                onClick={() => setControllerOpen(!controllerOpen)}
              >
                <Settings className={lg ? "size-3.5" : "size-3"} />
                {currentController.label}
              </Button>

              <div
                className={`absolute z-50 rounded-lg border border-border bg-popover p-3 shadow-md min-w-[160px] ${
                  (currentController.align ?? "right") === "left" ? "left-0" : "right-0"
                } ${
                  (currentController.pos ?? "up") === "up" ? "bottom-full mb-1" : "top-full mt-1"
                } ${controllerOpen ? "" : "invisible pointer-events-none"}`}
              >
                {isValidElement(currentController.widget)
                  ? cloneElement(currentController.widget as ReactElement<any>, {
                      onChange: handleControllerChange,
                      mediaFiles: uploadedFiles,
                    })
                  : currentController.widget}
              </div>
            </div>
          </>
        )}

        <div className="flex-1" />

        <Button
          size="icon"
          className={`rounded-full ${lg ? "size-10" : "size-8"}`}
          onClick={handleSubmit}
          aria-label="发送"
        >
          <ArrowUp className={lg ? "size-5" : "size-4"} />
        </Button>
      </div>
    </div>
  )
}
