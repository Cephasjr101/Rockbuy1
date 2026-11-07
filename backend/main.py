"""QuickShop MVP - AliExpress-powered store.
Run: uvicorn backend.main:app --reload  (dev)  |  Deploy: fly.io (see README)."""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import httpx
import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET = os.getenv("SHOP_SECRET", "dev-secret-change-me")
PAYSTACK_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
DB_PATH = os.getenv("DB_PATH", str(BASE_DIR / "shop.db"))
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

app = FastAPI(title="QuickShop", docs_url=None, redoc_url=None, openapi_url=None)


# ------------------------------------------------------------------ database
def get_db():
    db = sqlite3.connect(DB_PATH, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    try:
        yield db
    finally:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH, check_same_thread=False)
    db.executescript(
        """CREATE TABLE IF NOT EXISTS users(
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             email TEXT UNIQUE NOT NULL,
             password_hash TEXT NOT NULL,
             name TEXT DEFAULT '',
             phone TEXT DEFAULT '',
             is_admin INTEGER DEFAULT 0,
             created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS products(
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             source TEXT DEFAULT 'local',
             source_id TEXT DEFAULT '',
             title TEXT NOT NULL,
             description TEXT DEFAULT '',
             price REAL NOT NULL,
             currency TEXT DEFAULT 'GHS',
             image TEXT DEFAULT '',
             category TEXT DEFAULT '',
             stock INTEGER DEFAULT 0,
             active INTEGER DEFAULT 1,
             created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS orders(
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             reference TEXT UNIQUE NOT NULL,
             user_id INTEGER NOT NULL,
             items TEXT NOT NULL,
             total REAL NOT NULL,
             currency TEXT DEFAULT 'GHS',
             status TEXT DEFAULT 'pending',
             name TEXT DEFAULT '', phone TEXT DEFAULT '',
             address TEXT DEFAULT '', city TEXT DEFAULT '', region TEXT DEFAULT '',
             paid_at TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE IF NOT EXISTS payments(
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             reference TEXT NOT NULL, order_ref TEXT NOT NULL,
             status TEXT DEFAULT 'pending',
             created_at TEXT DEFAULT (datetime('now')));"""
    )
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        h = _hash(ADMIN_PASSWORD)
        db.execute("INSERT OR IGNORE INTO users(email,password_hash,name,is_admin) VALUES(?,?,?,1)",
                   (ADMIN_EMAIL, h, "Store Admin"))
    db.commit()
    db.close()


def _hash(pw: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), b"quickshop", 60_000).hex()


# ---------------------------------------------------------------------- auth
def make_token(uid: int) -> str:
    return jwt.encode({"uid": uid, "exp": datetime.utcnow() + timedelta(days=14)},
                      SECRET, algorithm="HS256")


def current_user(request: Request, db: sqlite3.Connection = Depends(get_db)):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Sign in required")
    try:
        uid = jwt.decode(auth[7:], SECRET, algorithms=["HS256"])["uid"]
    except Exception:
        raise HTTPException(401, "Session expired - sign in again")
    u = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not u:
        raise HTTPException(401, "Account not found")
    return u


def admin_user(user=Depends(current_user)):
    if not user["is_admin"]:
        raise HTTPException(403, "Admin only")
    return user


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=30)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@app.post("/api/auth/register")
def register(body: RegisterIn, db: sqlite3.Connection = Depends(get_db)):
    if db.execute("SELECT 1 FROM users WHERE email=?", (body.email.lower(),)).fetchone():
        raise HTTPException(409, "An account with this email already exists")
    cur = db.execute("INSERT INTO users(email,password_hash,name,phone) VALUES(?,?,?,?)",
                     (body.email.lower(), _hash(body.password), body.name, body.phone))
    db.commit()
    return {"token": make_token(cur.lastrowid), "name": body.name}


@app.post("/api/auth/login")
def login(body: LoginIn, db: sqlite3.Connection = Depends(get_db)):
    u = db.execute("SELECT * FROM users WHERE email=?", (body.email.lower(),)).fetchone()
    if not u or not hmac.compare_digest(u["password_hash"], _hash(body.password)):
        raise HTTPException(401, "Wrong email or password")
    return {"token": make_token(u["id"]), "name": u["name"], "is_admin": bool(u["is_admin"])}


class ChangePwIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


@app.post("/api/auth/change-password")
def change_pw(body: ChangePwIn, user=Depends(current_user),
              db: sqlite3.Connection = Depends(get_db)):
    if not hmac.compare_digest(user["password_hash"], _hash(body.current_password)):
        raise HTTPException(400, "Current password is incorrect")
    db.execute("UPDATE users SET password_hash=? WHERE id=?",
               (_hash(body.new_password), user["id"]))
    db.commit()
    return {"ok": True, "message": "Password updated"}


class DeleteIn(BaseModel):
    password: str


@app.post("/api/auth/delete-account")
def delete_account(body: DeleteIn, user=Depends(current_user),
                   db: sqlite3.Connection = Depends(get_db)):
    if not hmac.compare_digest(user["password_hash"], _hash(body.password)):
        raise HTTPException(400, "Password incorrect - account NOT deleted")
    db.execute("DELETE FROM orders WHERE user_id=?", (user["id"],))
    db.execute("DELETE FROM users WHERE id=?", (user["id"],))
    db.commit()
    return {"ok": True, "message": "Account and order history deleted"}


# ------------------------------------------------------------------- catalog
@app.get("/api/products")
def products(q: str = "", category: str = "", db: sqlite3.Connection = Depends(get_db)):
    sql, args = "SELECT * FROM products WHERE active=1", []
    if q:
        sql += " AND title LIKE ?"
        args.append(f"%{q}%")
    if category:
        sql += " AND category=?"
        args.append(category)
    rows = db.execute(sql + " ORDER BY id DESC LIMIT 100", args).fetchall()
    cats = [r["category"] for r in db.execute(
        "SELECT DISTINCT category FROM products WHERE active=1 AND category!=''").fetchall()]
    return {"products": [dict(r) for r in rows], "categories": cats}


@app.get("/api/products/{pid}")
def product(pid: int, db: sqlite3.Connection = Depends(get_db)):
    r = db.execute("SELECT * FROM products WHERE id=? AND active=1", (pid,)).fetchone()
    if not r:
        raise HTTPException(404, "Product not found")
    return dict(r)


# --------------------------------------------------------------------- admin
class ProductIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = ""
    price: float = Field(gt=0)
    currency: str = "GHS"
    image: str = ""
    category: str = ""
    stock: int = Field(default=0, ge=0)
    source_id: str = ""
    source_url: str = ""


@app.post("/api/admin/products")
def add_product(body: ProductIn, user=Depends(admin_user),
                db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute(
        "INSERT INTO products(source,source_id,title,description,price,currency,image,category,stock)"
        " VALUES(?,?,?,?,?,?,?,?,?)",
        ("aliexpress" if body.source_id else "local", body.source_id, body.title,
         body.description + (("\n" + body.source_url) if body.source_url else ""),
         body.price, body.currency, body.image, body.category, body.stock))
    db.commit()
    return {"id": cur.lastrowid}


@app.put("/api/admin/products/{pid}")
def edit_product(pid: int, body: ProductIn, user=Depends(admin_user),
                 db: sqlite3.Connection = Depends(get_db)):
    db.execute("UPDATE products SET title=?,description=?,price=?,currency=?,image=?,category=?,stock=? WHERE id=?",
               (body.title, body.description, body.price, body.currency, body.image,
                body.category, body.stock, pid))
    db.commit()
    return {"ok": True}


@app.delete("/api/admin/products/{pid}")
def del_product(pid: int, user=Depends(admin_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("UPDATE products SET active=0 WHERE id=?", (pid,))
    db.commit()
    return {"ok": True}


@app.post("/api/admin/sync")
def sync(keyword: str, user=Depends(admin_user), db: sqlite3.Connection = Depends(get_db)):
    from backend.services import aliexpress as ali
    imported = 0
    for p in ali.search_products(keyword):
        exists = db.execute("SELECT 1 FROM products WHERE source_id=? AND source='aliexpress'",
                            (p["source_id"],)).fetchone()
        if exists:
            continue
        db.execute(
            "INSERT INTO products(source,source_id,title,description,price,currency,image,category,stock)"
            " VALUES('aliexpress',?,?,?,?,'USD',?,?,?)",
            (p["source_id"], p["title"], p["desc"], p["price"], p["image"],
             p.get("category", keyword), p.get("stock", 25)))
        imported += 1
    db.commit()
    return {"imported": imported, "demo_mode": not ali.configured()}


# -------------------------------------------------------------------- orders
class OrderIn(BaseModel):
    items: list[dict]      # [{id, qty}]
    name: str = Field(min_length=2)
    phone: str = Field(min_length=7)
    address: str = Field(min_length=4)
    city: str = Field(min_length=2)
    region: str = ""


@app.post("/api/orders")
def create_order(body: OrderIn, user=Depends(current_user),
                 db: sqlite3.Connection = Depends(get_db)):
    if not body.items:
        raise HTTPException(400, "Cart is empty")
    items, total = [], 0.0
    for it in body.items:
        p = db.execute("SELECT * FROM products WHERE id=? AND active=1",
                       (int(it["id"]),)).fetchone()
        if not p:
            raise HTTPException(404, f"Product {it['id']} unavailable")
        qty = max(1, min(int(it.get("qty", 1)), p["stock"] or 10))
        items.append({"id": p["id"], "title": p["title"], "price": p["price"],
                      "qty": qty, "image": p["image"], "currency": p["currency"]})
        total += p["price"] * qty
    reference = "QS" + secrets.token_hex(4).upper()
    db.execute(
        "INSERT INTO orders(reference,user_id,items,total,currency,name,phone,address,city,region)"
        " VALUES(?,?,?,?,?,?,?,?,?,?)",
        (reference, user["id"], json.dumps(items), round(total, 2),
         items[0]["currency"] if items else "GHS",
         body.name, body.phone, body.address, body.city, body.region))
    db.commit()
    if not PAYSTACK_KEY:
        return {"reference": reference, "total": round(total, 2),
                "authorization_url": None,
                "message": "Payment not configured - order recorded as pending."}
    r = httpx.post("https://api.paystack.co/transaction/initialize",
                   headers={"Authorization": f"Bearer {PAYSTACK_KEY}"},
                   json={"email": user["email"], "amount": int(round(total * 100)),
                         "currency": "GHS", "reference": reference,
                         "callback_url": f"{BASE_URL}/api/payments/callback",
                         "metadata": {"order": reference}}, timeout=30)
    data = r.json()
    if not data.get("status"):
        raise HTTPException(502, f"Payment gateway error: {data.get('message')}")
    return {"reference": reference, "total": round(total, 2),
            "authorization_url": data["data"]["authorization_url"]}


@app.get("/api/orders")
def my_orders(user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC",
                      (user["id"],)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["items"] = json.loads(d["items"])
        out.append(d)
    return {"orders": out}


@app.get("/api/admin/orders")
def all_orders(user=Depends(admin_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT o.*, u.email FROM orders o JOIN users u ON u.id=o.user_id "
        "ORDER BY o.id DESC LIMIT 200").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["items"] = json.loads(d["items"])
        out.append(d)
    return {"orders": out}


@app.post("/api/admin/orders/{ref}/status")
def set_status(ref: str, payload: dict, user=Depends(admin_user),
               db: sqlite3.Connection = Depends(get_db)):
    status = str(payload.get("status", ""))[:20]
    if status not in ("pending", "paid", "shipped", "delivered", "cancelled"):
        raise HTTPException(400, "Bad status")
    db.execute("UPDATE orders SET status=? WHERE reference=?", (status, ref))
    db.commit()
    return {"ok": True}


def _verify_paystack(reference: str) -> bool:
    if not PAYSTACK_KEY:
        return False
    try:
        r = httpx.get(f"https://api.paystack.co/transaction/verify/{reference}",
                      headers={"Authorization": f"Bearer {PAYSTACK_KEY}"}, timeout=30)
        d = r.json().get("data", {})
        return d.get("status") == "success"
    except Exception:
        return False


@app.get("/api/payments/callback")
def pay_callback(reference: str = "", db: sqlite3.Connection = Depends(get_db)):
    ok = _verify_paystack(reference)
    if ok:
        db.execute("UPDATE orders SET status='paid', paid_at=datetime('now') WHERE reference=? AND status='pending'",
                   (reference,))
        db.commit()
    return RedirectResponse(f"/#/order/{reference}?paid={1 if ok else 0}")


@app.post("/api/payments/webhook")
async def pay_webhook(request: Request, db: sqlite3.Connection = Depends(get_db)):
    raw = await request.body()
    if PAYSTACK_KEY:
        sig = request.headers.get("x-paystack-signature", "")
        digest = hmac.new(PAYSTACK_KEY.encode(), raw, hashlib.sha512).hexdigest()
        if not hmac.compare_digest(sig, digest):
            raise HTTPException(401, "Invalid signature")
    payload = json.loads(raw or b"{}")
    if payload.get("event") == "charge.success":
        ref = (payload.get("data") or {}).get("reference", "")
        db.execute("UPDATE orders SET status='paid', paid_at=datetime('now') WHERE reference=? AND status='pending'",
                   (ref,))
        db.commit()
    return {"ok": True}


# --------------------------------------------------------------------- pages
@app.get("/api/health")
def health():
    return {"ok": True, "time": datetime.utcnow().isoformat()}


FRONTEND = BASE_DIR / "frontend" / "static"
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/{full_path:path}")
def spa(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    return FileResponse(FRONTEND / "index.html")


init_db()
