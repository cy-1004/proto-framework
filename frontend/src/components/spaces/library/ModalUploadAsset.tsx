import { useEffect, useRef } from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ModalUploadAssetProps {
  files: File[]
  open: boolean
  onClose: () => void
}

export default function ModalUploadAsset({ files, open, onClose }: ModalUploadAssetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto w-full max-w-md rounded-xl border bg-background p-0 shadow-lg backdrop:bg-black/40"
      onClose={onClose}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">上传素材</h3>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          已选择 {files.length} 个文件
        </p>
        <ul className="max-h-48 space-y-1 overflow-auto">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between rounded bg-muted px-3 py-1.5 text-xs">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {(f.size / 1024).toFixed(0)} KB
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={onClose}>确认上传</Button>
        </div>
      </div>
    </dialog>
  )
}
