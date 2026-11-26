"use strict";
let D = { role: "", org_id: "", outlets: [], knownVer: null, orders: [], tables: [], calls: [], menu: [], captainCart: [] };
const isKdsOnly = getQueryParam("kds") === "1";

function closeModal(id) { document.getElementById(id).classList.add("hidden"); }
function switchOutlet(slug) { if (slug) window.location.href = `dashboard.html?restaurant=${encodeURIComponent(slug)}`; }

function switchTab(t) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.t === t));
  ["orders","kds","menu","crm","gst","settings","chain"].forEach((k) => document.getElementById("t-"+k).classList.toggle("hidden", k !== t));
  if (t === "menu") loadMenuAdmin();
  if (t === "crm") { loadCustomers(); loadCoupons(); }
  if (t === "settings") fillSettingsForm();
  if (t === "chain") loadChainOverview();
}

async function logoutDash() { await sb.auth.signOut(); window.location.reload(); }

async function pollDelta(force = false) {
  const { data, error } = await sb.rpc("staff_dashboard_delta", { p_restaurant: R.id, p_known_version: force ? null : D.knownVer });
  if (error || !data || !data.success) return;
  if (data.unchanged) return;
  D.knownVer = data.queue_version;
  D.orders = data.orders || []; D.tables = data.tables || []; D.calls = data.waiter_calls || [];

  // Broadcast banners
  document.getElementById("annBar").innerHTML = (data.announcements || []).map((a) => `<div style="background:#eff6ff;border:1px solid #0284c7;color:#075985;border-radius:10px;padding:8px 12px;margin-bottom:8px;font-size:12.5px;"><strong>${escapeHTML(a.title)}:</strong> ${escapeHTML(a.message)}</div>`).join("");
  // Waiter Call Bell alerts
  document.getElementById("callsBar").innerHTML = D.calls.map((c) => `<div style="background:#fef3c7;border:1.5px solid #d97706;border-radius:10px;padding:8px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;font-size:13px;"><strong>🔔 Table ${escapeHTML(c.table_number)} requested: ${escapeHTML(c.call_type.toUpperCase())}</strong><button class="btn btn-sm btn-green" onclick="resolveCall('${c.id}')">Done</button></div>`).join("");

  const s = data.today_summary || {};
  document.getElementById("kpiGrid").innerHTML = `
    <div class="kpi"><div class="l">Today Orders</div><div class="v">${s.orders_count||0}</div></div>
    <div class="kpi"><div class="l">Net Revenue</div><div class="v" style="color:#059669;">${money(s.net_revenue||0)}</div></div>
    <div class="kpi"><div class="l">Cash / UPI / Card</div><div class="v" style="font-size:13.5px;margin-top:6px;">${money(s.cash_total||0)} / ${money(s.upi_total||0)} / ${money(s.card_total||0)}</div></div>
    <div class="kpi"><div class="l">GST (CGST+SGST)</div><div class="v" style="color:#0284c7;">${money(Number(s.cgst||0)+Number(s.sgst||0))}</div></div>
    <div class="kpi"><div class="l">Low Ratings Alert</div><div class="v" style="color:${data.unresolved_low_ratings?"#dc2626":"#64748b"};">${data.unresolved_low_ratings||0}</div></div>`;

  renderOrders(); renderKds();
}

function renderOrders() {
  document.getElementById("ordersList").innerHTML = D.orders.map((o, idx) => `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px;background:${o.payment_status==="Unpaid"?"#fff":"#f8fafc"};">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
        <div>
          <strong>${escapeHTML(o.invoice_no || ("#" + o.order_no))}</strong> • <span class="badge b-blue">${escapeHTML(o.order_type==="dine_in"?"Table "+o.table_number:o.order_type.toUpperCase())}</span>
          <span style="font-size:12.5px;color:#475569;margin-left:6px;">${escapeHTML(o.customer_name)}${o.customer_phone?" • "+escapeHTML(o.customer_phone):""}</span>
        </div>
        <div><span class="badge ${o.payment_status==="Paid"?"b-green":o.payment_status==="NC"?"b-blue":"b-amber"}">${escapeHTML(o.status)} • ${escapeHTML(o.payment_status)}</span> <strong style="margin-left:8px;">${o.is_nc?"₹0 (NC)":money(o.total)}</strong></div>
      </div>
      <div style="font-size:12.5px;color:#334155;margin:6px 0;">${(o.cart||[]).map((i)=>`${escapeHTML(i.name)}×${i.qty}`).join(" • ")}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">
        ${o.status==="Pending"?`<button class="btn btn-sm" onclick="setStatus('${o.id}','Preparing')">Start Preparing</button>`:""}
        ${o.status==="Preparing"?`<button class="btn btn-sm btn-green" onclick="setStatus('${o.id}','Ready')">Mark Ready</button>`:""}
        ${o.status==="Ready"?`<button class="btn btn-sm btn-dark" onclick="setStatus('${o.id}','Served')">Served</button>`:""}
        ${o.payment_status==="Unpaid" && o.status!=="Cancelled"?`<button class="btn btn-sm btn-green" onclick="openPayModal(${idx})">Settle / Bill</button>`:""}
        <button class="btn btn-soft btn-sm" onclick="printBillIdx(${idx})">${o.invoice_no?"Tax Invoice":"Provisional"}</button>
        ${o.customer_phone?`<button class="btn btn-soft btn-sm" onclick="sendWhatsAppGstBill(D.orders[${idx}], R)">WhatsApp Bill</button>`:""}
        ${o.payment_status==="Unpaid" && o.status!=="Cancelled"?`<button class="btn btn-red btn-sm" onclick="cancelOrd('${o.id}')">Cancel</button>`:""}
      </div>
    </div>`).join("") || `<div style="text-align:center;color:#64748b;padding:24px;">No orders today yet.</div>`;
}

function renderKds() {
  const st = document.getElementById("kdsStation").value;
  const active = D.orders.filter((o) => ["Pending","Preparing"].includes(o.status));
  document.getElementById("kdsGrid").innerHTML = active.map((o) => {
    const items = (o.cart || []).filter((i) => !st || (i.kot_station || "Kitchen") === st);
    if (!items.length) return "";
    const mins = Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000));
    const cls = mins >= 25 ? "late" : mins >= 15 ? "warn" : "";
    return `<div class="kds-card ${cls}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:17px;">${escapeHTML(o.order_type==="dine_in"?"Table "+o.table_number:o.order_type.toUpperCase())} • ${escapeHTML(o.kot_no)}</strong>
        <span class="badge ${mins>=25?"b-red":mins>=15?"b-amber":"b-blue"}">${mins}m ago</span>
      </div>
      <div style="font-size:14px;line-height:1.7;margin-bottom:10px;">
        ${items.map((i)=>`<div><strong>${i.qty}×</strong> ${escapeHTML(i.name)} ${i.portion==="half"?"(Half)":""} ${i.modifier?`<span style="color:#b91c1c;">[${escapeHTML(i.modifier)}]</span>`:""} ${Array.isArray(i.addons)&&i.addons.length?`<div style="font-size:12px;color:#0369a1;">+ ${escapeHTML(i.addons.join(", "))}</div>`:""}</div>`).join("")}
      </div>
      ${o.notes?`<div style="font-size:12px;background:#fef3c7;padding:5px 8px;border-radius:6px;margin-bottom:8px;">Note: ${escapeHTML(o.notes)}</div>`:""}
      <div style="display:flex;gap:6px;">
        ${o.status==="Pending"?`<button class="btn" style="flex:1;" onclick="setStatus('${o.id}','Preparing')">Start Cooking</button>`:`<button class="btn btn-green" style="flex:1;" onclick="setStatus('${o.id}','Ready')">Order Ready ✓</button>`}
      </div>
    </div>`;
  }).join("") || `<div style="color:#64748b;padding:24px;">Kitchen queue is clear!</div>`;
}

async function resolveCall(id) { await sb.rpc("resolve_waiter_call", { p_restaurant: R.id, p_call_id: id }); pollDelta(true); }
async function setStatus(id, st) { await sb.rpc("set_order_status", { p_restaurant: R.id, p_order_id: id, p_status: st }); pollDelta(true); }
async function cancelOrd(id) { const r = prompt("Cancel reason:"); if (r === null) return; await sb.rpc("set_order_status", { p_restaurant: R.id, p_order_id: id, p_status: "Cancelled", p_cancel_reason: r }); pollDelta(true); }
function printBillIdx(idx) { const o = D.orders[idx]; if (o) printHtmlDocument(o.invoice_no || o.order_no, buildGstBillHtml(o, R, o.payment_status !== "Paid")); }

function openPayModal(idx) {
  const o = D.orders[idx]; if (!o) return;
  document.getElementById("pmOrderId").value = o.id;
  document.getElementById("pmAmountInfo").textContent = `${o.order_no} • Payable: ${money(o.total)}`;
  document.getElementById("pmMode").value = "UPI"; document.getElementById("pmGstin").value = o.customer_gstin || ""; document.getElementById("pmLegal").value = o.customer_legal_name || "";
  document.getElementById("pmRmSvc").checked = false; toggleSplitBox();
  document.getElementById("payModal").classList.remove("hidden");
}
function toggleSplitBox() {
  const m = document.getElementById("pmMode").value;
  document.getElementById("pmSplitWrap").classList.toggle("hidden", m !== "Split");
  document.getElementById("pmNcWrap").classList.toggle("hidden", m !== "NC");
}
async function confirmPayment() {
  const mode = document.getElementById("pmMode").value;
  const splits = mode === "Split" ? [{ mode: "Cash", amount: Number(document.getElementById("pmSplitCash").value || 0) }, { mode: "UPI", amount: Number(document.getElementById("pmSplitUpi").value || 0) }] : [];
  const { data, error } = await sb.rpc("collect_payment", {
    p_restaurant: R.id, p_order_id: document.getElementById("pmOrderId").value, p_mode: mode, p_splits: splits,
    p_is_nc: mode === "NC", p_nc_reason: document.getElementById("pmNcReason").value.trim(),
    p_customer_gstin: document.getElementById("pmGstin").value.trim(), p_customer_legal_name: document.getElementById("pmLegal").value.trim(),
    p_remove_service_charge: document.getElementById("pmRmSvc").checked
  });
  if (error || !data || !data.success) { showToast((data && data.message) || (error && error.message) || "Failed.", "error"); return; }
  showToast(`Settled! Invoice: ${data.invoice_no}`, "success");
  closeModal("payModal"); pollDelta(true);
}

// Captain POS Mode
async function openCaptainModal() {
  if (!D.menu.length) D.menu = await getMenuCached(true);
  D.captainCart = [];
  document.getElementById("cpDishSel").innerHTML = D.menu.filter((m) => m.available).map((m) => `<option value="${m.id}">${escapeHTML(m.name)} (${money(m.price)})</option>`).join("");
  document.getElementById("cpCartBox").innerHTML = "No items added yet.";
  document.getElementById("captainModal").classList.remove("hidden");
}
function addCaptainLine() {
  const id = document.getElementById("cpDishSel").value;
  const qty = Number(document.getElementById("cpDishQty").value || 1);
  const m = D.menu.find((x) => x.id === id); if (!m) return;
  D.captainCart.push({ menu_id: m.id, name: m.name, qty, portion: "full", addons: [], modifier: "" });
  document.getElementById("cpCartBox").innerHTML = D.captainCart.map((c, i) => `<div>${escapeHTML(c.name)} × ${c.qty} <a href="#" onclick="D.captainCart.splice(${i},1);return false;">✕</a></div>`).join("");
}
async function submitCaptainOrder() {
  if (!D.captainCart.length) return;
  const { data } = await sb.rpc("place_order", { p_restaurant: R.id, p_guest_token: "", p_payload: {
    request_id: makeRequestId(), order_type: document.getElementById("cpOrderType").value,
    table_number: document.getElementById("cpTable").value.trim(), customer_name: "Walk-In",
    customer_phone: document.getElementById("cpPhone").value.trim(), items: D.captainCart
  }});
  if (data && data.success) { showToast(`KOT ${data.kot_no} sent!`, "success"); closeModal("captainModal"); pollDelta(true); }
  else showToast((data && data.message) || "Error", "error");
}

// Merge Tables
function openMergeModal() {
  const unpaid = D.orders.filter((o) => o.payment_status === "Unpaid" && o.order_type === "dine_in" && o.status !== "Cancelled");
  const opts = unpaid.map((o) => `<option value="${o.id}">Table ${escapeHTML(o.table_number)} (${o.order_no} • ${money(o.total)})</option>`).join("");
  document.getElementById("mgSrc").innerHTML = opts; document.getElementById("mgTgt").innerHTML = opts;
  document.getElementById("mergeModal").classList.remove("hidden");
}
async function confirmMerge() {
  const { data } = await sb.rpc("merge_tables", { p_restaurant: R.id, p_source_order_id: document.getElementById("mgSrc").value, p_target_order_id: document.getElementById("mgTgt").value });
  showToast((data && data.success) ? "Tables merged!" : (data && data.message) || "Error", (data && data.success) ? "success" : "error");
  if (data && data.success) { closeModal("mergeModal"); pollDelta(true); }
}

// Menu & 86 Stock
async function loadMenuAdmin() {
  D.menu = await getMenuCached(true);
  document.getElementById("menuTbody").innerHTML = D.menu.map((m, i) => `<tr>
    <td><strong>${m.veg?"🟢":"🔴"} ${escapeHTML(m.name)}</strong><br><span style="font-size:11px;color:#64748b;">Station: ${escapeHTML(m.kot_station||"Kitchen")}</span></td>
    <td>${escapeHTML(m.category)}</td>
    <td>${money(m.price)}${m.half_price!=null?" / "+money(m.half_price):""}</td>
    <td>${m.gst_rate!=null?m.gst_rate+"%":"Default"}</td>
    <td><button class="btn btn-sm ${m.available?"btn-green":"btn-red"}" onclick="toggleStock('${m.id}')">${m.available?"In Stock":"SOLD OUT"}</button></td>
    <td><button class="btn btn-soft btn-sm" onclick="openMenuModal(${i})">Edit</button></td>
  </tr>`).join("");
}
async function toggleStock(id) { await sb.rpc("toggle_menu_stock", { p_restaurant: R.id, p_menu_id: id }); loadMenuAdmin(); }
function openMenuModal(idx = null) {
  const m = idx !== null ? D.menu[idx] : null;
  document.getElementById("mnId").value = m ? m.id : ""; document.getElementById("mnName").value = m ? m.name : "";
  document.getElementById("mnCat").value = m ? m.category : "Main Course"; document.getElementById("mnPrice").value = m ? m.price : "";
  document.getElementById("mnHalf").value = (m && m.half_price != null) ? m.half_price : "";
  document.getElementById("mnStation").value = m ? (m.kot_station || "Kitchen") : "Kitchen";
  document.getElementById("mnGst").value = (m && m.gst_rate != null) ? m.gst_rate : "";
  document.getElementById("mnAddons").value = (m && Array.isArray(m.addons)) ? m.addons.map((a) => `${a.name}:${a.price}`).join(", ") : "";
  document.getElementById("mnMods").value = (m && Array.isArray(m.modifiers)) ? m.modifiers.join(", ") : "";
  document.getElementById("mnVeg").checked = m ? m.veg !== false : true;
  document.getElementById("menuModal").classList.remove("hidden");
}
async function saveMenuDish() {
  const addons = document.getElementById("mnAddons").value.split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const [n, p] = s.split(":"); return { name: (n||"").trim(), price: Number((p||0).trim()) }; }).filter((a) => a.name);
  const mods = document.getElementById("mnMods").value.split(",").map((s) => s.trim()).filter(Boolean);
  const { data } = await sb.rpc("upsert_menu_item", { p_restaurant: R.id, p_item: {
    id: document.getElementById("mnId").value, name: document.getElementById("mnName").value.trim(), category: document.getElementById("mnCat").value.trim(),
    price: Number(document.getElementById("mnPrice").value || 0), half_price: document.getElementById("mnHalf").value,
    kot_station: document.getElementById("mnStation").value, gst_rate: document.getElementById("mnGst").value,
    addons, modifiers: mods, veg: document.getElementById("mnVeg").checked
  }});
  if (data && data.success) { closeModal("menuModal"); loadMenuAdmin(); showToast("Dish saved!", "success"); }
}
async function pushMenuToChain() {
  const over = confirm("Overwrite branch-specific prices too? Click Cancel to keep each branch's own prices.");
  const { data } = await sb.rpc("chain_push_menu", { p_source_restaurant: R.id, p_overwrite_prices: over });
  showToast((data && data.message) || "Done", (data && data.success) ? "success" : "error");
}

// CRM & Coupons
async function loadCustomers() {
  const { data } = await sb.rpc("list_customers", { p_restaurant: R.id, p_search: document.getElementById("crmSearch").value.trim() });
  document.getElementById("crmTbody").innerHTML = ((data && data.customers) || []).map((c) => `<tr><td><strong>${escapeHTML(c.name)}</strong></td><td>${escapeHTML(c.phone)}</td><td>${c.visit_count}</td><td>${money(c.total_spent)}</td><td>⭐ ${c.loyalty_points}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;color:#64748b;">No customers yet.</td></tr>`;
}
async function loadCoupons() {
  const { data } = await sb.rpc("manage_coupons", { p_restaurant: R.id, p_action: "list" });
  document.getElementById("couponsList").innerHTML = ((data && data.coupons) || []).map((c) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:12.5px;"><div><strong>${escapeHTML(c.code)}</strong> (${c.discount_type==="flat"?"₹"+c.discount_value:c.discount_value+"%"} • Min ₹${c.min_order})</div><button class="btn btn-soft btn-sm" onclick="toggleCoupon('${c.id}')">${c.is_active?"Active":"Off"}</button></div>`).join("");
}
async function createCoupon(e) {
  e.preventDefault();
  await sb.rpc("manage_coupons", { p_restaurant: R.id, p_action: "create", p_payload: { code: document.getElementById("cpCode").value, discount_type: document.getElementById("cpType").value, discount_value: Number(document.getElementById("cpVal").value), min_order: Number(document.getElementById("cpMin").value), valid_till: document.getElementById("cpTill").value } });
  e.target.reset(); loadCoupons(); showToast("Coupon created!", "success");
}
async function toggleCoupon(id) { await sb.rpc("manage_coupons", { p_restaurant: R.id, p_action: "toggle", p_payload: { id } }); loadCoupons(); }

// GSTR-1 Export
async function runGstr1Export() {
  const { data } = await sb.rpc("gstr1_report", { p_restaurant: R.id, p_from: document.getElementById("gFrom").value, p_to: document.getElementById("gTo").value, p_include_org: document.getElementById("gIncludeOrg").checked });
  if (!data || !data.success) { showToast((data && data.message) || "Export failed.", "error"); return; }
  exportGstr1Excel(data, R.slug);
  showToast(`Exported ${(data.invoices||[]).length} settled GST invoices!`, "success");
}

// Settings
function fillSettingsForm() {
  document.getElementById("stRegime").value = R.tax_regime || "regular_5"; document.getElementById("stGstin").value = R.gstin || "";
  document.getElementById("stFssai").value = R.fssai_no || ""; document.getElementById("stState").value = R.state_code || "23-Madhya Pradesh";
  document.getElementById("stInvPrefix").value = R.invoice_prefix || "INV"; document.getElementById("stUpi").value = R.upi_id || "";
  document.getElementById("stPkgType").value = R.packaging_charge_type || "none"; document.getElementById("stPkgAmt").value = R.packaging_charge || 0;
  document.getElementById("stSvcPct").value = R.service_charge_percent || 0; document.getElementById("stReview").value = R.review_link || "";
  document.getElementById("stLoyEarn").value = R.loyalty_earn_per_100 || 5; document.getElementById("stLoyVal").value = R.loyalty_point_value || 1;
  document.getElementById("stTakeaway").checked = R.takeaway_enabled !== false; document.getElementById("stDirect").checked = R.direct_order_enabled !== false;
  document.getElementById("stLoyOn").checked = Boolean(R.loyalty_enabled); document.getElementById("stShareCrm").checked = Boolean(R.share_crm_across_org);
}
async function saveSettingsForm(e) {
  e.preventDefault();
  const { data } = await sb.rpc("save_settings_v8", { p_restaurant: R.id, p_data: {
    tax_regime: document.getElementById("stRegime").value, gstin: document.getElementById("stGstin").value,
    fssai_no: document.getElementById("stFssai").value, state_code: document.getElementById("stState").value,
    invoice_prefix: document.getElementById("stInvPrefix").value, upi_id: document.getElementById("stUpi").value,
    packaging_charge_type: document.getElementById("stPkgType").value, packaging_charge: Number(document.getElementById("stPkgAmt").value || 0),
    service_charge_percent: Number(document.getElementById("stSvcPct").value || 0), review_link: document.getElementById("stReview").value,
    loyalty_earn_per_100: Number(document.getElementById("stLoyEarn").value || 5), loyalty_point_value: Number(document.getElementById("stLoyVal").value || 1),
    takeaway_enabled: document.getElementById("stTakeaway").checked, direct_order_enabled: document.getElementById("stDirect").checked,
    loyalty_enabled: document.getElementById("stLoyOn").checked, share_crm_across_org: document.getElementById("stShareCrm").checked
  }});
  showToast((data && data.message) || "Saved", (data && data.success) ? "success" : "error");
  if (data && data.success) await bootRestaurant();
}

// Chain Overview
async function loadChainOverview() {
  const { data } = await sb.rpc("chain_overview", { p_restaurant: R.id });
  document.getElementById("chainTbody").innerHTML = ((data && data.outlets) || []).map((o) => `<tr>
    <td><strong>${escapeHTML(o.name)}</strong><br><span style="font-size:11px;color:#64748b;">${escapeHTML(o.city||"")}</span></td>
    <td><span class="badge ${o.active?"b-green":"b-red"}">${o.active?"Live":"Off"}</span></td>
    <td>${o.active_tables}</td><td>${o.today_orders}</td>
    <td>${money(o.today_cash)} / ${money(o.today_upi)}</td><td>${money(o.today_gst)}</td>
    <td><strong>${money(o.today_revenue)}</strong></td>
    <td><a href="dashboard.html?restaurant=${encodeURIComponent(o.slug)}" class="btn btn-soft btn-sm" style="text-decoration:none;">Open</a></td>
  </tr>`).join("");
}

Object.assign(window, { closeModal, switchOutlet, switchTab, logoutDash, pollDelta, resolveCall, setStatus, cancelOrd, printBillIdx, openPayModal, toggleSplitBox, confirmPayment, openCaptainModal, addCaptainLine, submitCaptainOrder, openMergeModal, confirmMerge, toggleStock, openMenuModal, saveMenuDish, pushMenuToChain, loadCustomers, createCoupon, toggleCoupon, runGstr1Export, saveSettingsForm, loadChainOverview, renderKds });

async function bootApp() {
  const { data: ctx } = await sb.rpc("my_staff_context", { p_restaurant: R.id });
  if (!ctx || !ctx.authorized) { showToast("This account is not assigned to this restaurant.", "error"); await sb.auth.signOut(); return; }
  D.role = ctx.role; D.org_id = ctx.org_id || ""; D.outlets = ctx.outlets || [];
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");
  document.getElementById("topRestName").textContent = R.name;
  document.getElementById("topRoleBadge").textContent = D.role.toUpperCase();
  document.getElementById("kdsModeLink").href = `dashboard.html?restaurant=${encodeURIComponent(R.slug)}&kds=1`;

  if (["admin","chain_owner"].includes(D.role)) document.getElementById("tabBtnSettings").classList.remove("hidden");
  if (D.outlets.length > 1) {
    const sw = document.getElementById("chainSwitcher"); sw.classList.remove("hidden");
    sw.innerHTML = D.outlets.map((o) => `<option value="${escapeHTML(o.slug)}" ${o.slug===R.slug?"selected":""}>${escapeHTML(o.name)} (${escapeHTML(o.city||"")})</option>`).join("");
    document.getElementById("tabBtnChain").classList.remove("hidden");
    document.getElementById("pushMenuBtn").classList.remove("hidden");
    document.getElementById("gOrgWrap").classList.remove("hidden");
  }
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("gFrom").value = today.slice(0, 8) + "01"; document.getElementById("gTo").value = today;
  if (isKdsOnly) switchTab("kds");
  await pollDelta(true);
  setInterval(() => { if (!document.hidden) pollDelta(false); }, (R.auto_refresh || 10) * 1000);
}

(async function () {
  initClient("staff");
  if (!(await bootRestaurant())) return;
  document.getElementById("lgSub").textContent = `Sign in to ${R.name}`;
  const { data: { session } } = await sb.auth.getSession();
  if (session) { await bootApp(); return; }
  document.getElementById("staffLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("lgBtn"); btn.disabled = true;
    try {
      const { error } = await sb.auth.signInWithPassword({ email: document.getElementById("lgEmail").value.trim(), password: document.getElementById("lgPass").value });
      if (error) { showToast(error.message, "error"); return; }
      await bootApp();
    } finally { btn.disabled = false; }
  });
})();
