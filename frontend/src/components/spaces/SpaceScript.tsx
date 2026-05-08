import { useState, useEffect, useCallback } from "react"
import { useParams } from "react-router-dom"
import { apiFetch } from "@/lib/api"
import type { Product, ScriptReference } from "@/types/product"
import ScriptNav from "./script/ScriptNav"
import ProductList from "./script/ProductList"
import PropertyProduct from "./script/PropertyProduct"
import ScriptReferenceList from "./script/ScriptReferenceList"
import PropertyReference from "./script/PropertyReference"
import ScriptEditor from "./script/ScriptEditor"

interface SpaceScriptProps {
  taskId?: number
}

export default function SpaceScript({ taskId }: SpaceScriptProps) {
  const { category = "product" } = useParams()
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [references, setReferences] = useState<ScriptReference[]>([])
  const [selectedReference, setSelectedReference] = useState<ScriptReference | null>(null)

  const loadProducts = useCallback(() => {
    apiFetch("/api/products")
      .then((r) => r.json())
      .then(setProducts)
      .catch(console.error)
  }, [])

  const loadReferences = useCallback(() => {
    apiFetch("/api/script-references")
      .then((r) => r.json())
      .then(setReferences)
      .catch(console.error)
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])
  useEffect(() => { loadReferences() }, [loadReferences])

  return (
    <div className="relative flex h-full flex-col">
      <ScriptNav />

      <div className="flex flex-1 overflow-hidden">
        {category === "product" && (
          <>
            <div className={`overflow-auto ${selectedProduct ? "w-1/2 border-r" : "flex-1"}`}>
              <ProductList
                products={products}
                selectedId={selectedProduct?.id}
                onSelect={setSelectedProduct}
              />
            </div>
            {selectedProduct && (
              <div className="w-1/2 overflow-auto p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground">商品属性</h4>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedProduct(null)}
                  >
                    关闭
                  </button>
                </div>
                <PropertyProduct product={selectedProduct} />
              </div>
            )}
          </>
        )}

        {category === "reference" && (
          <>
            <div className={`overflow-auto ${selectedReference ? "w-1/2 border-r" : "flex-1"}`}>
              <ScriptReferenceList
                references={references}
                selectedId={selectedReference?.id}
                onSelect={setSelectedReference}
              />
            </div>
            {selectedReference && (
              <div className="w-1/2 overflow-auto p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground">参考属性</h4>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedReference(null)}
                  >
                    关闭
                  </button>
                </div>
                <PropertyReference reference={selectedReference} />
              </div>
            )}
          </>
        )}

        {category === "editor" && (
          <div className="flex-1 overflow-hidden">
            <ScriptEditor taskId={taskId} />
          </div>
        )}
      </div>
    </div>
  )
}
