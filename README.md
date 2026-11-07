# QuickShop MVP

AliExpress-powered e-commerce store. FastAPI + SQLite + vanilla JS SPA.

## Stack
- Backend: FastAPI (auth/JWT, products, orders, Paystack, admin)
- Frontend: single-page app (no build step)
- DB: SQLite (on a Fly.io volume in production)

## Local run
    cd backend
    pip install -r requirements.txt
    cp ../.env.example ../.env   # fill in values (or set env vars)
    uvicorn main:app --reload --app-dir ..   # from repo root:
    # actually:  uvicorn backend.main:app --reload   (run from project root)
Then open http://localhost:8000

## Deploy to Fly.io
    fly launch --name shop-mvp --region iad --no-deploy   # first time only
    fly volumes create shopdata --region iad --size 1
    fly secrets set SHOP_SECRET="$(openssl rand -hex 32)" \
        PAYSTACK_SECRET_KEY=sk_live_xxx \
        ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=strongpass
    # (optional, for live AliExpress imports:)
    fly secrets set ALIEXPRESS_APP_KEY=xxx ALIEXPRESS_SECRET=xxx ALIEXPRESS_TRACKING_ID=xxx
    fly deploy

## AliExpress API
Get keys at https://developers.aliexpress.com (affiliate program).
Without keys the "Import from AliExpress" button imports demo products,
so the shop is fully testable end-to-end immediately.

## Features included
- Browse/search products, categories
- Cart + checkout with Paystack (MoMo/card) + webhook verification
- Accounts: register, login, change password, delete account
- My orders with live payment status
- Admin: product CRUD, one-click AliExpress import, order status management
- Legal pages: Terms, Privacy, Refund, Shipping (footer links)
- Favicon, responsive layout, loading/empty states

## First login
Use ADMIN_EMAIL / ADMIN_PASSWORD from your secrets to sign in, then
open #/admin to import products and manage orders.
