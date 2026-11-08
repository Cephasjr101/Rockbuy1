"""AliExpress affiliate API (Alibaba TOP protocol) with demo fallback.
Set ALIEXPRESS_APP_KEY / ALIEXPRESS_SECRET / ALIEXPRESS_TRACKING_ID to go live.
Without keys, sync returns demo products so the shop runs immediately."""
import hashlib
import json
import os
import time
import urllib.parse

import httpx

APP_KEY = os.getenv("ALIEXPRESS_APP_KEY", "")
SECRET = os.getenv("ALIEXPRESS_SECRET", "")
TRACKING_ID = os.getenv("ALIEXPRESS_TRACKING_ID", "")
BASE = "https://api-sg.aliexpress.com/sync"

DEMO_PRODUCTS = [
    {"source_id": "demo-1", "title": "Wireless Bluetooth Earbuds Pro - Noise Cancelling",
     "price": 85.0, "image": "https://ae01.alicdn.com/kf/demo1.jpg",
     "desc": "Active noise cancelling, 30h battery, touch controls. Ships in 7-12 days.",
     "category": "Phone Accessories", "stock": 50},
    {"source_id": "demo-2", "title": "65W GaN Fast Charger - 3-Port USB-C",
     "price": 42.0, "image": "https://ae01.alicdn.com/kf/demo2.jpg",
     "desc": "Charges laptop + phone + earbuds at once. UK/EU/US plugs included.",
     "category": "Phone Accessories", "stock": 100},
    {"source_id": "demo-3", "title": "Robot Vacuum Cleaner - 3000Pa Suction, App Control",
     "price": 640.0, "image": "https://ae01.alicdn.com/kf/demo3.jpg",
     "desc": "Self-charging, schedule cleaning, works on tiles and carpets.",
     "category": "Home Appliances", "stock": 20},
    {"source_id": "demo-4", "title": "Foldable Computer Desk - 100cm, Wood Finish",
     "price": 210.0, "image": "https://ae01.alicdn.com/kf/demo4.jpg",
     "desc": "No-assembly foldable desk, steel frame, fits laptops up to 17 inch.",
     "category": "Furniture", "stock": 30},
]


def configured() -> bool:
    return bool(APP_KEY and SECRET)


def _sign(params: dict) -> str:
    """Alibaba TOP signature: md5(secret + sorted key/value concat + secret)."""
    s = SECRET + "".join(f"{k}{params[k]}" for k in sorted(params)) + SECRET
    return hashlib.md5(s.encode()).hexdigest().upper()


def _get(method: str, extra: dict) -> dict:
    params = {
        "app_key": APP_KEY,
        "method": method,
        "timestamp": str(int(time.time() * 1000)),
        "sign_method": "md5",
        "v": "2.0",
        "format": "json",
        **extra,
    }
    params["sign"] = _sign(params)
    r = httpx.get(BASE, params=params, timeout=30)
    return r.json()


def search_products(keyword: str, page_size: int = 20) -> list[dict]:
    """aliexpress.affiliate.product.query - returns normalized products."""
    if not configured():
        return [p for p in DEMO_PRODUCTS if keyword.lower() in p["title"].lower()
                or keyword.lower() in p["category"].lower()] or DEMO_PRODUCTS
    resp = _get("aliexpress.affiliate.product.query", {
        "keywords": keyword,
        "page_size": str(page_size),
        "target_currency": "USD",
        "tracking_id": TRACKING_ID,
    })
    out = []
    result = (resp.get("aliexpress_affiliate_product_query_response")
              .get("resp_result", {}).get("result", {}))
    for item in (result.get("products", {}).get("product", []) or []):
        out.append({
            "source_id": str(item.get("product_id")),
            "title": item.get("product_title", "")[:200],
            "price": float(item.get("target_sale_price") or item.get("sale_price") or 0),
            "image": (item.get("product_main_image_url") or "").split("?")[0],
            "desc": item.get("product_title", "")[:500],
            "category": keyword,
            "stock": 25,
            "url": item.get("product_detail_url", ""),
        })
    return out
