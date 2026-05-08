from fastapi import APIRouter
from db import get_db

router = APIRouter(prefix="/api")


@router.get("/script-references")
def list_script_references():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM script_references ORDER BY id DESC").fetchall()
        cols = [d[0] for d in conn.execute("SELECT * FROM script_references LIMIT 0").description]
        return [dict(zip(cols, r)) for r in rows]


@router.get("/products")
def list_products():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM products ORDER BY created_at DESC").fetchall()
        cols = [d[0] for d in conn.execute("SELECT * FROM products LIMIT 0").description]
        return [dict(zip(cols, r)) for r in rows]


@router.get("/products/{product_id}")
def get_product(product_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        if not row:
            return {"detail": "not found"}, 404
        cols = [d[0] for d in conn.execute("SELECT * FROM products LIMIT 0").description]
        product = dict(zip(cols, row))

        asset_rows = conn.execute(
            "SELECT * FROM product_assets WHERE product_id = ? ORDER BY created_at",
            (product_id,),
        ).fetchall()
        if asset_rows:
            asset_cols = [d[0] for d in conn.execute("SELECT * FROM product_assets LIMIT 0").description]
            product["assets"] = [dict(zip(asset_cols, r)) for r in asset_rows]
        else:
            product["assets"] = []

        return product
