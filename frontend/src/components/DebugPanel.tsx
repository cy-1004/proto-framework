import { useEffect, useState, useCallback } from "react"
import { Bug, X, Plus, Trash2, Save, RefreshCw } from "lucide-react"
import { apiFetch } from "@/lib/api"

interface SchemaCol {
  name: string
  type: string
  notnull: number
  pk: number
  default: string | null
}

interface TableState {
  rows: Record<string, unknown>[]
  schema: SchemaCol[]
  total: number
}

const api = (path: string, opts?: RequestInit) =>
  apiFetch(`/api/debug${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  }).then((r) => r.json())

const isDebug = import.meta.env.VITE_DEBUG === "1"

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const [tables, setTables] = useState<string[]>([])
  const [activeTable, setActiveTable] = useState("")
  const [tableState, setTableState] = useState<TableState>({ rows: [], schema: [], total: 0 })
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)

  useEffect(() => {
    if (!open) return
    api("/tables").then((t: string[]) => {
      setTables(t)
      if (t.length && !activeTable) setActiveTable(t[0])
    })
  }, [open])

  const loadTable = useCallback(
    (table: string) => {
      if (!table) return
      Promise.all([api(`/tables/${table}`), api(`/tables/${table}/schema`)]).then(
        ([data, schema]) => {
          setTableState({ rows: data.rows, schema, total: data.total })
          setEditingRow(null)
          setEditingId(null)
          setIsNew(false)
        },
      )
    },
    [],
  )

  useEffect(() => {
    if (activeTable) loadTable(activeTable)
  }, [activeTable, loadTable])

  const getPkCol = () => tableState.schema.find((c) => c.pk === 1)?.name ?? "id"

  const startEdit = (row: Record<string, unknown>) => {
    setEditingRow({ ...row })
    setEditingId(String(row[getPkCol()] ?? row.id ?? row.ID))
    setIsNew(false)
  }

  const startAdd = () => {
    const empty: Record<string, unknown> = {}
    tableState.schema.forEach((c) => {
      empty[c.name] = c.default ?? ""
    })
    setEditingRow(empty)
    setEditingId(null)
    setIsNew(true)
  }

  const saveRow = async () => {
    if (!editingRow) return
    if (isNew) {
      await api(`/tables/${activeTable}`, {
        method: "POST",
        body: JSON.stringify({ data: editingRow }),
      })
    } else {
      await api(`/tables/${activeTable}/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ data: editingRow }),
      })
    }
    loadTable(activeTable)
  }

  const deleteRow = async (id: string) => {
    await api(`/tables/${activeTable}/${id}`, { method: "DELETE" })
    loadTable(activeTable)
  }

  if (!isDebug) return null

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition-transform hover:scale-110"
        title="Debug Panel"
      >
        <Bug className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40">
          <div className="flex h-[80vh] w-[90vw] max-w-5xl flex-col rounded-xl bg-white shadow-2xl dark:bg-zinc-900">
            {/* header */}
            <div className="flex items-start justify-between border-b px-4 py-3">
              <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                <Bug className="h-4 w-4 text-orange-500 shrink-0" />
                <span className="font-semibold text-sm shrink-0">Debug Panel</span>
                <div className="flex flex-wrap gap-1">
                  {tables.map((t) => (
                    <button
                      key={t}
                      onClick={() => setActiveTable(t)}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        t === activeTable
                          ? "bg-orange-500 text-white"
                          : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadTable(activeTable)}
                  className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={startAdd}
                  className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Add row"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { setOpen(false); setEditingRow(null) }}
                  className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-zinc-500">ops</th>
                    {tableState.schema.map((c) => (
                      <th
                        key={c.name}
                        className="whitespace-nowrap px-2 py-2 text-left font-medium text-zinc-500"
                      >
                        {c.name}
                        <span className="ml-1 text-[10px] text-zinc-400">{c.type}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableState.rows.map((row, i) => {
                    const rid = String(row[getPkCol()] ?? row.id ?? row.ID ?? i)
                    return (
                      <tr
                        key={rid}
                        className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                        onClick={() => startEdit(row)}
                      >
                        <td className="px-2 py-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteRow(rid) }}
                            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                        {tableState.schema.map((c) => (
                          <td
                            key={c.name}
                            className="max-w-[200px] truncate px-2 py-1.5"
                            title={String(row[c.name] ?? "")}
                          >
                            {String(row[c.name] ?? "")}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {tableState.rows.length === 0 && (
                <div className="flex h-32 items-center justify-center text-sm text-zinc-400">
                  No data
                </div>
              )}
            </div>

            {/* edit form */}
            {editingRow && (
              <div className="border-t bg-zinc-50 dark:bg-zinc-800/50">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs font-medium">
                    {isNew ? "New Row" : `Edit #${editingId}`}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingRow(null); setIsNew(false) }}
                      className="rounded px-3 py-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveRow}
                      className="flex items-center gap-1 rounded bg-orange-500 px-3 py-1 text-xs text-white hover:bg-orange-600"
                    >
                      <Save className="h-3 w-3" />
                      Save
                    </button>
                  </div>
                </div>
                <div className="grid max-h-48 grid-cols-2 gap-2 overflow-auto px-4 pb-3 sm:grid-cols-3 lg:grid-cols-4">
                  {tableState.schema.map((c) => (
                    <label key={c.name} className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-zinc-500">
                        {c.name} <span className="text-zinc-400">{c.type}</span>
                      </span>
                      <input
                        className="rounded border bg-white px-2 py-1 text-xs dark:bg-zinc-900 dark:border-zinc-700"
                        value={String(editingRow[c.name] ?? "")}
                        onChange={(e) =>
                          setEditingRow((prev) =>
                            prev ? { ...prev, [c.name]: e.target.value || null } : prev,
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* footer */}
            <div className="border-t px-4 py-2 text-[10px] text-zinc-400">
              {activeTable} · {tableState.total} rows
            </div>
          </div>
        </div>
      )}
    </>
  )
}
