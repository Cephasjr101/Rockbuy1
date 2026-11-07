/* QuickShop MVP - hash-routed SPA */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { user: null, token: localStorage.getItem("qs_token") || "", cart: JSON.parse(localStorage.getItem("qs_cart") || "[]") };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => "GH\u00a2" + Number(n || 0).toLocaleString();

async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || "GET",
    headers: { "Content-Type": "application/json",
      ...(state.token ? { Authorization: "Bearer " + state.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.detail ? (Array.isArray(d.detail) ? d.detail[0].msg : d.detail) : r.statusText); e.status = r.status; throw e; }
  return d;
}
function toast(msg, type = "") { const t = document.createElement("div");
  t.className = "toast " + type; t.textContent = msg; $("#toast-root").appendChild(t);
  setTimeout(() => t.remove(), 4200); }
function openModal(html) { $("#modal-card").innerHTML = html; $("#modal-root").hidden = false; }
function closeModal() { $("#modal-root").hidden = true; }
$("#modal-backdrop").onclick = closeModal;

function saveCart() { localStorage.setItem("qs_cart", JSON.stringify(state.cart)); renderCartCount(); }
function renderCartCount() { const n = state.cart.reduce((s, i) => s + i.qty, 0);
  $("#cart-count").hidden = !n; $("#cart-count").textContent = n; }

function chrome() {
  const authed = !!state.token;
  $$("#mainnav [data-auth]").forEach(a => a.hidden = !authed);
  $$("#mainnav [data-admin]").forEach(a => a.hidden = !(authed && state.user?.is_admin));
  $("#auth-btn").textContent = authed ? (state.user?.name || "Account") : "Sign in";
  $("#auth-btn").onclick = () => authed ? location.hash = "#/account" : location.hash = "#/login";
}

/* ------------------------------ views ------------------------------ */
function viewHome() {
  $("#app").innerHTML = `
  <div class="hero"><h1>Quality global products,<br>delivered across Ghana</h1>
    <p>Phones accessories, home appliances and furniture - sourced worldwide, paid with MoMo or card, delivered to your door.</p>
    <p style="margin-top:1rem"><a class="btn btn-gold" href="#/shop">Shop now</a></p></div>
  <h3>New arrivals</h3><div id="home-products" class="grid products-grid"><p class="muted">Loading...</p></div>`;
  api("/api/products").then(d => { $("#home-products").innerHTML = d.products.slice(0, 8).map(productCard).join("") || emptyState("No products yet"); bindCards(); }).catch(e => $("#home-products").innerHTML = emptyState(e.message));
}
const emptyState = m => `<div class="empty" style="grid-column:1/-1">${esc(m)}</div>`;
function productCard(p) {
  return `<div class="card product-card"><a href="#/product/${p.id}">
    <img src="${esc(p.image)}" alt="" loading="lazy" onerror="this.style.opacity=.25">
    <div class="card-body">${p.category ? `<span class="badge">${esc(p.category)}</span>` : ""}
    <h3>${esc(p.title)}</h3><div class="price">${money(p.price)}</div>
    <button class="btn btn-primary btn-sm" style="margin-top:.5rem" data-add="${p.id}">Add to cart</button>
    </div></a></div>`;
}
function bindCards() { $$("[data-add]").forEach(b => b.onclick = e => { e.preventDefault();
  addToCart(+b.dataset.add); }); }
function addToCart(id) { const it = state.cart.find(i => i.id === id);
  it ? it.qty++ : state.cart.push({ id, qty: 1 }); saveCart(); toast("Added to cart", "success"); }

function viewShop(q = "") {
  $("#app").innerHTML = `<div style="display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem">
    <h2 style="margin:0">Shop</h2>
    <input id="shop-q" placeholder="Search products..." value="${esc(q)}" style="flex:1;min-width:180px;padding:.55rem .7rem;border:1.5px solid var(--line);border-radius:9px">
    <select id="shop-cat"><option value="">All categories</option></select></div>
    <div id="shop-grid" class="grid products-grid"><p class="muted">Loading...</p></div>`;
  const load = () => api(`/api/products?q=${encodeURIComponent($("#shop-q").value)}&category=${encodeURIComponent($("#shop-cat").value)}`)
    .then(d => { $("#shop-grid").innerHTML = d.products.map(productCard).join("") || emptyState("No products found");
      bindCards();
      if (!$("#shop-cat").dataset.filled) { $("#shop-cat").dataset.filled = 1;
        $("#shop-cat").innerHTML += d.categories.map(c => `<option>${esc(c)}</option>`).join(""); } })
    .catch(e => $("#shop-grid").innerHTML = emptyState(e.message));
  $("#shop-q").oninput = () => load(); $("#shop-cat").onchange = load; load();
}

function viewProduct(id) {
  api("/api/products/" + id).then(p => {
    $("#app").innerHTML = `<div class="grid" style="grid-template-columns:1fr 1.2fr;align-items:start">
    <div class="card"><img src="${esc(p.image)}" style="width:100%;min-height:280px;object-fit:cover" onerror="this.style.opacity=.25"></div>
    <div class="panel"><span class="badge">${esc(p.category)}</span>
      <h2 style="margin:.2rem 0">${esc(p.title)}</h2>
      <div class="price" style="font-size:1.5rem">${money(p.price)}</div>
      <p class="muted" style="white-space:pre-line">${esc(p.description)}</p>
      <p class="small ${p.stock > 0 ? "" : "muted"}">${p.stock > 0 ? "In stock (" + p.stock + ")" : "Pre-order - ships in 2-3 weeks"}</p>
      <div class="qty-row"><label>Qty</label><input id="pqty" type="number" value="1" min="1" max="10" style="width:70px;padding:.5rem;border:1.5px solid var(--line);border-radius:8px"></div>
      <p><button class="btn btn-gold" id="add-btn" style="margin-top:.8rem">Add to cart</button>
      <a class="btn btn-primary" href="#/cart" style="margin-top:.8rem;margin-left:.5rem">Go to cart</a></p>
    </div></div>`;
    $("#add-btn").onclick = () => { const q = Math.max(1, +$("#pqty").value || 1);
      const it = state.cart.find(i => i.id === p.id); it ? it.qty += q : state.cart.push({ id: p.id, qty: q });
      saveCart(); toast("Added " + q + " to cart", "success"); };
  }).catch(e => $("#app").innerHTML = emptyState(e.message));
}

function viewCart() {
  if (!state.cart.length) { $("#app").innerHTML = `<div class="empty"><h3>Your cart is empty</h3><a class="btn btn-primary" href="#/shop">Continue shopping</a></div>`; return; }
  Promise.all(state.cart.map(i => api("/api/products/" + i.id).catch(() => null))).then(ps => {
    let total = 0;
    const rows = ps.map((p, ix) => { if (!p) return ""; const c = state.cart[ix];
      total += p.price * c.qty;
      return `<tr><td style="width:60px"><img src="${esc(p.image)}" width="48" height="48" style="object-fit:cover;border-radius:8px" onerror="this.style.opacity=.2"></td>
      <td>${esc(p.title)}</td><td>${money(p.price)}</td>
      <td><input type="number" min="1" max="10" value="${c.qty}" data-ix="${ix}" style="width:60px;padding:.3rem;border:1.5px solid var(--line);border-radius:7px"></td>
      <td>${money(p.price * c.qty)}</td><td><button class="btn btn-danger btn-sm" data-del="${ix}">\u00d7</button></td></tr>`; }).join("");
    $("#app").innerHTML = `<h2>Cart</h2><div class="panel"><table><tr><th></th><th>Product</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr>${rows}</table>
    <h3 style="text-align:right">Total: ${money(total)}</h3>
    <p style="text-align:right"><a class="btn btn-gold" href="#/checkout">Proceed to checkout</a></p></div>`;
    $$("[data-ix]").forEach(inp => inp.onchange = () => { state.cart[+inp.dataset.ix].qty = Math.max(1, +inp.value || 1); saveCart(); viewCart(); });
    $$("[data-del]").forEach(b => b.onclick = () => { state.cart.splice(+b.dataset.del, 1); saveCart(); viewCart(); });
  });
}

function viewCheckout() {
  if (!state.token) { location.hash = "#/login?next=/checkout"; return; }
  if (!state.cart.length) { location.hash = "#/shop"; return; }
  $("#app").innerHTML = `<h2>Checkout</h2><div class="form-card" style="max-width:560px;margin:0">
    <div class="form-row"><div class="field"><label>Full name *</label><input id="co-name" value="${esc(state.user?.name || "")}"></div>
    <div class="field"><label>Phone (WhatsApp) *</label><input id="co-phone" value="${esc(state.user?.phone || "")}" placeholder="0551234567"></div></div>
    <div class="field"><label>Delivery address *</label><input id="co-address" placeholder="House no, street, area"></div>
    <div class="form-row"><div class="field"><label>City *</label><input id="co-city" placeholder="Accra"></div>
    <div class="field"><label>Region</label><input id="co-region" placeholder="Greater Accra"></div></div>
    <p class="small muted">Pay securely with MoMo or card via Paystack. You will be redirected to complete payment.</p>
    <button class="btn btn-gold" id="pay-btn" style="width:100%">Pay now with MoMo / Card</button></div>`;
  $("#pay-btn").onclick = async () => {
    const btn = $("#pay-btn"); btn.disabled = true; btn.textContent = "Processing...";
    try {
      const d = await api("/api/orders", { method: "POST", body: {
        items: state.cart, name: $("#co-name").value, phone: $("#co-phone").value,
        address: $("#co-address").value, city: $("#co-city").value, region: $("#co-region").value } });
      state.cart = []; saveCart();
      if (d.authorization_url) location.href = d.authorization_url;
      else { toast(d.message || "Order placed"); location.hash = "#/orders"; }
    } catch (e) { toast(e.message, "error"); btn.disabled = false; btn.textContent = "Pay now with MoMo / Card"; }
  };
}

function viewLogin(next = "") {
  $("#app").innerHTML = `<div class="form-card"><h2>Sign in</h2>
    <div class="field"><label>Email</label><input id="li-email" type="email"></div>
    <div class="field"><label>Password</label><input id="li-pass" type="password"></div>
    <button class="btn btn-primary" id="li-btn" style="width:100%">Sign in</button>
    <p class="small" style="margin-top:.9rem">New here? <a href="#/register${next ? "?next=" + next : ""}">Create an account</a></p></div>`;
  $("#li-btn").onclick = async () => { try {
    const d = await api("/api/auth/login", { method: "POST", body: { email: $("#li-email").value, password: $("#li-pass").value } });
    state.token = d.token; state.user = { name: d.name, is_admin: d.is_admin };
    localStorage.setItem("qs_token", d.token); chrome(); toast("Welcome back, " + d.name, "success");
    location.hash = "#" + (next || "/");
  } catch (e) { toast(e.message, "error"); } };
}

function viewRegister(next = "") {
  $("#app").innerHTML = `<div class="form-card"><h2>Create account</h2>
    <div class="field"><label>Full name *</label><input id="rg-name"></div>
    <div class="field"><label>Email *</label><input id="rg-email" type="email"></div>
    <div class="field"><label>Phone (WhatsApp)</label><input id="rg-phone"></div>
    <div class="field"><label>Password (min 6 chars) *</label><input id="rg-pass" type="password"></div>
    <button class="btn btn-primary" id="rg-btn" style="width:100%">Create account</button>
    <p class="small" style="margin-top:.9rem">Have an account? <a href="#/login">Sign in</a></p></div>`;
  $("#rg-btn").onclick = async () => { try {
    const d = await api("/api/auth/register", { method: "POST", body: { name: $("#rg-name").value,
      email: $("#rg-email").value, phone: $("#rg-phone").value, password: $("#rg-pass").value } });
    state.token = d.token; state.user = { name: d.name };
    localStorage.setItem("qs_token", d.token); chrome(); toast("Account created", "success");
    location.hash = "#" + (next || "/");
  } catch (e) { toast(e.message, "error"); } };
}

function viewAccount() {
  if (!state.token) { location.hash = "#/login"; return; }
  $("#app").innerHTML = `<h2>My account</h2>
  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="panel"><h3>Change password</h3>
      <div class="field"><label>Current password</label><input id="cp-cur" type="password"></div>
      <div class="field"><label>New password</label><input id="cp-new" type="password"></div>
      <button class="btn btn-primary btn-sm" id="cp-btn">Update password</button></div>
    <div class="panel" style="border-color:#f3c2c2"><h3 style="color:var(--red)">Delete account</h3>
      <p class="small muted">Permanently deletes your account and order history. This cannot be undone.</p>
      <div class="field"><label>Confirm with password</label><input id="del-pass" type="password"></div>
      <button class="btn btn-danger btn-sm" id="del-btn">Delete my account</button></div>
  </div>`;
  $("#cp-btn").onclick = async () => { try {
    const d = await api("/api/auth/change-password", { method: "POST", body: { current_password: $("#cp-cur").value, new_password: $("#cp-new").value } });
    toast(d.message, "success"); $("#cp-cur").value = $("#cp-new").value = "";
  } catch (e) { toast(e.message, "error"); } };
  $("#del-btn").onclick = () => openModal(`<h3>Delete account?</h3><p class="muted">All your data and orders will be permanently removed.</p>
    <p style="display:flex;gap:.6rem;justify-content:flex-end"><button class="btn btn-outline btn-sm" onclick="document.getElementById('modal-root').hidden=true">Cancel</button>
    <button class="btn btn-danger btn-sm" id="del-yes">Yes, delete everything</button></p>`) ||
    setTimeout(() => { const y = $("#del-yes"); if (y) y.onclick = async () => { try {
      await api("/api/auth/delete-account", { method: "POST", body: { password: $("#del-pass").value } });
      localStorage.removeItem("qs_token"); state.token = ""; state.user = null; chrome(); closeModal();
      toast("Account deleted"); location.hash = "#/";
    } catch (e) { closeModal(); toast(e.message, "error"); } }; }, 0);
}

function viewOrders() {
  if (!state.token) { location.hash = "#/login"; return; }
  api("/api/orders").then(d => {
    $("#app").innerHTML = `<h2>My orders</h2>` + (d.orders.length ? `<div class="panel"><table>
      <tr><th>Reference</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th></tr>` +
      d.orders.map(o => `<tr><td>${esc(o.reference)}</td>
        <td class="order-items">${o.items.map(i => esc(i.title.slice(0, 32)) + " \u00d7" + i.qty).join("<br>")}</td>
        <td>${money(o.total)}</td><td><span class="status ${o.status}">${o.status}</span></td>
        <td class="small">${esc((o.created_at || "").slice(0, 10))}</td></tr>`).join("") + "</table></div>"
      : `<div class="empty"><h3>No orders yet</h3><a class="btn btn-primary" href="#/shop">Start shopping</a></div>`);
  }).catch(e => $("#app").innerHTML = emptyState(e.message));
}

function viewOrder(ref, paid) {
  api("/api/orders").then(d => { const o = d.orders.find(x => x.reference === ref);
    if (!o) { location.hash = "#/orders"; return; }
    $("#app").innerHTML = `<div class="form-card" style="margin:1rem auto"><h2>Order ${esc(ref)}</h2>
    ${paid === "1" ? `<p class="status paid">Payment confirmed - thank you!</p>` : paid === "0" ? `<p class="status pending">Payment not completed. <a href="#/orders">Retry from your orders</a></p>` : ""}
    <p>${o.items.map(i => esc(i.title) + " \u00d7" + i.qty).join("<br>")}</p>
    <h3>Total: ${money(o.total)}</h3><p>Status: <span class="status ${o.status}">${o.status}</span></p>
    <p><a class="btn btn-primary" href="#/orders">Back to orders</a></p></div>`;
  }).catch(() => location.hash = "#/orders");
}

/* ------------------------------ admin ------------------------------ */
function viewAdmin(tab = "products") {
  if (!state.user?.is_admin) { location.hash = "#/"; return; }
  $("#app").innerHTML = `<h2>Admin</h2><div style="display:flex;gap:.5rem;margin-bottom:1rem">
    <a class="btn ${tab === "products" ? "btn-primary" : "btn-outline"} btn-sm" href="#/admin">Products</a>
    <a class="btn ${tab === "orders" ? "btn-primary" : "btn-outline"} btn-sm" href="#/admin?tab=orders">Orders</a></div>
    <div id="admin-body"></div>`;
  tab === "orders" ? adminOrders() : adminProducts();
}
function adminProducts() {
  $("#admin-body").innerHTML = `<div class="panel"><div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
    <input id="sync-q" placeholder="AliExpress keyword, e.g. phone accessories" style="flex:1;min-width:200px;padding:.5rem;border:1.5px solid var(--line);border-radius:8px">
    <button class="btn btn-gold btn-sm" id="sync-btn">Import from AliExpress</button>
    <button class="btn btn-outline btn-sm" id="add-btn">+ Add manually</button></div>
    <p class="small muted" style="margin:.5rem 0 0">Imports top products with images and USD prices. Without API keys configured, demo products are used.</p></div>
    <div id="admin-list" class="panel"><p class="muted">Loading...</p></div>`;
  $("#sync-btn").onclick = async () => { const b = $("#sync-btn"); b.disabled = true; b.textContent = "Importing..."; try {
    const d = await api("/api/admin/sync?keyword=" + encodeURIComponent($("#sync-q").value || "electronics"), { method: "POST" });
    toast(`Imported ${d.imported} products` + (d.demo_mode ? " (demo mode)" : ""), "success"); adminProducts();
  } catch (e) { toast(e.message, "error"); } b.disabled = false; b.textContent = "Import from AliExpress"; };
  $("#add-btn").onclick = () => productForm(null);
  api("/api/products").then(d => { $("#admin-list").innerHTML = `<table><tr><th>Product</th><th>Price</th><th>Stock</th><th></th></tr>` +
    d.products.map(p => `<tr><td>${esc(p.title.slice(0, 60))}</td><td>${money(p.price)}</td><td>${p.stock}</td>
    <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" data-edit="${p.id}">Edit</button>
    <button class="btn btn-danger btn-sm" data-del="${p.id}">Delete</button></td></tr>`).join("") + "</table>";
    $$("[data-edit]").forEach(b => b.onclick = () => productForm(d.products.find(p => p.id == b.dataset.edit)));
    $$("[data-del]").forEach(b => b.onclick = async () => { if (confirm("Delete product?")) {
      await api("/api/admin/products/" + b.dataset.del, { method: "DELETE" }); toast("Deleted", "success"); adminProducts(); } });
  });
}
function productForm(p) {
  openModal(`<h3>${p ? "Edit" : "Add"} product</h3>
    <div class="field"><label>Title *</label><input id="pf-title" value="${esc(p?.title || "")}"></div>
    <div class="form-row"><div class="field"><label>Price (GH\u00a2) *</label><input id="pf-price" type="number" step="0.01" value="${p?.price || ""}"></div>
    <div class="field"><label>Stock</label><input id="pf-stock" type="number" value="${p?.stock ?? 25}"></div></div>
    <div class="field"><label>Category</label><input id="pf-cat" value="${esc(p?.category || "")}"></div>
    <div class="field"><label>Image URL</label><input id="pf-img" value="${esc(p?.image || "")}"></div>
    <div class="field"><label>Description</label><textarea id="pf-desc" rows="3">${esc(p?.description || "")}</textarea></div>
    <p style="display:flex;gap:.6rem;justify-content:flex-end"><button class="btn btn-outline btn-sm" onclick="document.getElementById('modal-root').hidden=true">Cancel</button>
    <button class="btn btn-primary btn-sm" id="pf-save">${p ? "Save" : "Add product"}</button></p>`);
  setTimeout(() => { $("#pf-save").onclick = async () => { const body = { title: $("#pf-title").value,
    price: +$("#pf-price").value, stock: +$("#pf-stock").value, category: $("#pf-cat").value,
    image: $("#pf-img").value, description: $("#pf-desc").value, source_id: p?.source_id || "" };
    try { p ? await api("/api/admin/products/" + p.id, { method: "PUT", body })
             : await api("/api/admin/products", { method: "POST", body });
      closeModal(); toast("Saved", "success"); adminProducts(); } catch (e) { toast(e.message, "error"); } }; }, 0);
}
function adminOrders() {
  api("/api/admin/orders").then(d => { $("#admin-body").innerHTML = `<div class="panel"><table>
    <tr><th>Ref</th><th>Customer</th><th>Items</th><th>Total</th><th>Address</th><th>Status</th><th></th></tr>` +
    d.orders.map(o => `<tr><td>${esc(o.reference)}</td><td class="small">${esc(o.name)}<br>${esc(o.phone)}<br>${esc(o.email)}</td>
    <td class="order-items">${o.items.map(i => esc(i.title.slice(0, 28)) + "\u00d7" + i.qty).join("<br>")}</td>
    <td>${money(o.total)}</td><td class="small">${esc(o.address)}, ${esc(o.city)}</td>
    <td><span class="status ${o.status}">${o.status}</span></td>
    <td><select data-st="${o.reference}" style="padding:.25rem;border:1.5px solid var(--line);border-radius:7px">
      ${["pending", "paid", "shipped", "delivered", "cancelled"].map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select></td></tr>`).join("") + "</table></div>";
    $$("[data-st]").forEach(sel => sel.onchange = async () => { await api("/api/admin/orders/" + sel.dataset.st + "/status", { method: "POST", body: { status: sel.value } }); toast("Status updated", "success"); });
  }).catch(e => $("#admin-body").innerHTML = emptyState(e.message));
}

/* ------------------------------ policies ------------------------------ */
const POLICIES = {
terms: ["Terms & Conditions", `
<p><em>Last updated: November 2026. These terms govern your use of QuickShop and purchases made through it.</em></p>
<h4>1. The service</h4><p>QuickShop sells consumer products - including phone accessories, home appliances and furniture - sourced from international suppliers ("Products"). Product listings show estimated delivery times and prices in Ghana cedis (GH\u00a2).</p>
<h4>2. Orders & payment</h4><p>Payment is collected at checkout via our payment processor (Paystack) using mobile money or card. An order is confirmed only when payment is successfully received. We may cancel and fully refund orders where a product is unavailable or mispriced.</p>
<h4>3. Pricing & availability</h4><p>Prices include duties and delivery within Ghana unless stated otherwise. Availability shown on the site is an estimate; if an ordered item is out of stock we will offer a substitute, a wait, or a full refund.</p>
<h4>4. Delivery</h4><p>We deliver nationwide via courier. Typical timelines: 3-7 days (in-stock), 2-4 weeks (imported/pre-order). Risk passes to you on delivery to your provided address.</p>
<h4>5. Returns & refunds</h4><p>See our <a href="#/refund">Refund & Returns Policy</a>. Faulty items are repaired, replaced, or refunded at our discretion within 7 days of delivery.</p>
<h4>6. Accounts</h4><p>You are responsible for your account credentials and activity. You may change your password or permanently delete your account (with your order history) at any time from the account page.</p>
<h4>7. Acceptable use</h4><p>You must not misuse the site, attempt to interfere with its operation, or use it for unlawful purposes. We may suspend accounts that do.</p>
<h4>8. Liability</h4><p>To the maximum extent permitted by Ghanaian law, our total liability for any claim relating to a purchase is limited to the amount you paid for the product concerned. Nothing in these terms excludes liability that cannot be excluded by law.</p>
<h4>9. Changes</h4><p>We may update these terms; the version on this page applies to new orders. Continued use after changes constitutes acceptance.</p>
<h4>10. Contact</h4><p>Questions: support@quickshop.example / +233 00 000 0000.</p>`],
privacy: ["Privacy Policy", `
<p><em>Last updated: November 2026.</em></p>
<h4>1. What we collect</h4><ul><li>Account details you give us: name, email, phone number, password (stored only as a secure hash).</li><li>Order details: delivery address, items purchased, payment status.</li><li>Limited technical data: browser type, pages visited, for security and analytics.</li></ul>
<h4>2. How we use it</h4><ul><li>To process and deliver your orders and take payment.</li><li>To provide account features (order history, password reset, account deletion).</li><li>To contact you about your orders - by email, SMS or WhatsApp.</li></ul>
<h4>3. Payment data</h4><p>Card and mobile-money payments are processed by Paystack. We never see or store your full card number or MoMo PIN - only the transaction reference and status.</p>
<h4>4. Sharing</h4><p>We share data only with: delivery couriers (name, phone, address), Paystack (payment processing), and authorities where legally required. We do not sell personal data.</p>
<h4>5. Retention & deletion</h4><p>We keep order records as required for accounting and tax purposes, then delete them. You can permanently delete your account and associated data at any time from the account page - this removes your profile and order history immediately.</p>
<h4>6. Security</h4><p>Data is encrypted in transit (HTTPS) and passwords are stored salted and hashed. Access to customer data is restricted to staff who need it.</p>
<h4>7. Your rights</h4><p>You may request a copy, correction, or deletion of your personal data by contacting us. You can also delete your account directly in the app.</p>
<h4>8. Contact</h4><p>Privacy questions: privacy@quickshop.example.</p>`],
refund: ["Refund & Returns Policy", `
<p><em>Last updated: November 2026.</em></p>
<h4>1. Faulty or damaged items</h4><p>If an item arrives faulty, damaged or not as described, contact us within 7 days of delivery with photos/video via WhatsApp or email. We will offer a replacement, repair, or full refund to your original payment method within 5-10 business days of approval.</p>
<h4>2. Change of mind</h4><p>Unused items in original packaging may be returned within 7 days for a store credit or exchange. Imported/pre-order items are excluded unless faulty, due to international shipping costs.</p>
<h4>3. How to return</h4><ol><li>Message us your order reference and reason.</li><li>We arrange courier pickup (Accra/Kumasi) or give you a drop-off point.</li><li>Once received and inspected, we process the refund or replacement.</li></ol>
<h4>4. Refund timing</h4><p>Mobile money refunds: 1-3 business days. Card refunds: 5-10 business days (bank dependent).</p>
<h4>5. Exceptions</h4><p>For hygiene and safety, opened earphones/headphones, and used appliances, cannot be returned for change-of-mind reasons. Warranty: appliances carry a 3-6 month store warranty against manufacturing defects.</p>`],
shipping: ["Shipping Information", `
<p><em>Last updated: November 2026.</em></p>
<h4>1. Where we deliver</h4><p>Nationwide across Ghana - Accra, Kumasi, Takoradi, Tamale, Tema and all regions, via courier partners.</p>
<h4>2. Timing & fees</h4><ul><li><strong>In-stock items:</strong> 3-7 business days. Accra/Kumasi often 1-3 days.</li><li><strong>Imported / pre-order items:</strong> 2-4 weeks from order.</li><li><strong>Delivery fee:</strong> calculated at checkout (from GH\u00a220 within Accra).</li></ul>
<h4>3. Tracking</h4><p>Your order status appears on the My Orders page (pending \u2192 paid \u2192 shipped \u2192 delivered). We message you on WhatsApp when your order ships.</p>
<h4>4. Failed delivery</h4><p>If a courier cannot reach you after two attempts, the order returns to us and we will rearrange delivery or refund minus delivery costs.</p>`]
};
function viewPolicy(key) {
  const p = POLICIES[key]; if (!p) { location.hash = "#/"; return; }
  document.title = p[0] + " - QuickShop";
  $("#app").innerHTML = `<div class="panel policy"><h2>${p[0]}</h2>${p[1]}</div>`;
}

/* ------------------------------ router ------------------------------ */
function route() {
  const h = location.hash.slice(2) || "";
  const [path, qs] = h.split("?");
  const params = new URLSearchParams(qs || "");
  document.title = "QuickShop";
  if (path === "" || path === "/") return viewHome();
  if (path === "shop") return viewShop(params.get("q") || "");
  if (path.startsWith("product/")) return viewProduct(+path.split("/")[1]);
  if (path === "cart") return viewCart();
  if (path === "checkout") return viewCheckout();
  if (path === "login") return viewLogin(params.get("next") || "");
  if (path === "register") return viewRegister(params.get("next") || "");
  if (path === "account") return viewAccount();
  if (path === "orders") return viewOrders();
  if (path.startsWith("order/")) return viewOrder(path.split("/")[1], params.get("paid"));
  if (path === "admin") return viewAdmin(params.get("tab") || "products");
  if (["terms", "privacy", "refund", "shipping"].includes(path)) return viewPolicy(path);
  viewHome();
}

(async function boot() {
  if (state.token) { try { const d = await api("/api/orders"); state.user = state.user || { name: "User" }; }
    catch { localStorage.removeItem("qs_token"); state.token = ""; } }
  chrome(); renderCartCount(); route();
})();
window.addEventListener("hashchange", route);
