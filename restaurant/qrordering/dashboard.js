"use strict";
/* =============================================================================
   dashboard.js - restaurant staff / admin console.
   Every number, permission and status rule comes from the database (RLS + functions). This file only
   draws screens and sends requests. Every value placed into HTML goes through esc().
   ============================================================================= */

const S = {
  rid: "", role: "", email: "", page: "", started: false, expiring: false, suspended: false,
  orders: [], tables: [], menu: [], links: null, seenOrderIds: new Set(), firstOrderLoad: true,
  orderQuery: "", orderTable: "", histDate: "", histOrders: [], histQuery: "", menuQuery: "", menuCat: "", menuFilter: "",
  report: null, reportRange: null, team: [], sound: localStorage.getItem("dgc:sound") !== "off",
  busy: new Set(), refreshing: false
};
const isAdmin = () => S.role === "admin" || S.role === "owner";
const RETENTION = () => (R && R.retention_days) || CONFIG.RETENTION_DAYS_FALLBACK;

/* ---------------------------------------------------------------- loader, errors ---- */

function expire() {
  if (S.expiring) return;
  S.expiring = true;
  showToast("Your session has ended. Please sign in again.", "error", 3000);
  setTimeout(() => LoginUI.signOut(), 1500);
}
function suspend(message) {
  S.suspended = true;
  const b = $("#banner"); b.textContent = message; b.hidden = false;
}
function handle(e) {
  if (!e) return;
  if (e.code === "42501" || e.code === "PGRST301") { expire(); return; }
  if (/suspended/i.test(e.message || "")) { suspend(e.message); return; }
  showToast(e.message || "Something went wrong.", "error", 4500);
}
/* run an async action; returns true when it finished without an error */
async function run(fn, opts) {
  opts = opts || {};
  if (opts.loader) showLoader(opts.loader);
  try { await fn(); return true; }
  catch (e) { handle(e); return false; }
  finally { if (opts.loader) hideLoader(); }
}

/* ----------------------------------------------------------------------- printing ---- */
function billHtml(o) {
  const w = (R && R.printer_width) || 58, items = Array.isArray(o.cart) ? o.cart : [];
  const sub = num(o.subtotal), disc = num(o.discount), gst = num(o.gst), total = num(o.total), net = sub - disc;
  const rate = net > 0 ? Math.round(gst / net * 10000) / 100 : num(R.gst);
  let taxRows;
  if (gst > 0 && R.gstin) {
    const cgst = Math.floor(gst * 100 / 2) / 100, sgst = Math.round((gst - cgst) * 100) / 100;
    taxRows = `<tr><td>CGST @${rate / 2}%</td><td class="r">${esc(money(cgst))}</td></tr><tr><td>SGST @${rate / 2}%</td><td class="r">${esc(money(sgst))}</td></tr>`;
  } else taxRows = gst > 0 ? `<tr><td>GST @${rate}%</td><td class="r">${esc(money(gst))}</td></tr>` : "";
  const rows = items.map((i) => {
    const qty = num(i.qty ?? i.quantity, 1);
    const unitRate = num(i.original_price ?? i.price);
    const amt = unitRate * qty;
    return `<tr><td class="itemCol">${esc(i.name)}</td><td class="r">${esc(qty)}</td><td class="r">${esc(unitRate.toFixed(2))}</td><td class="r">${esc(amt.toFixed(2))}</td></tr>`;
  }).join("");
  const body = `<div class="c b big">${esc(R.name)}</div>${R.address ? `<div class="c">${esc(R.address)}</div>` : ""}${R.phone ? `<div class="c">Ph: ${esc(R.phone)}</div>` : ""}${R.gstin ? `<div class="c">GSTIN: ${esc(R.gstin)}</div>` : ""}
<div class="hr"></div>
<div>Invoice: ${esc(o.invoice_no || o.order_no)}</div><div>Order: ${esc(o.order_no)}</div><div>Date: ${esc(fmtStamp(o.created_at))}</div><div>Table: ${esc(o.table_number)}</div><div>Guest: ${esc(o.customer_name)}</div>
<div class="hr"></div>
<table><tr><th class="itemCol">Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amt</th></tr>${rows}</table>
<div class="hr"></div>
<table><tr><td>Subtotal</td><td class="r">${esc(money(sub))}</td></tr>${disc > 0 ? `<tr><td>Discount</td><td class="r">-${esc(money(disc))}</td></tr>` : ""}${taxRows}
<tr class="b big"><td>TOTAL</td><td class="r">${esc(money(total))}</td></tr></table>
<div class="hr"></div>
<div>Payment: ${o.payment_status === "Paid" ? "Paid (" + esc(o.payment_mode || "") + ")" : "Unpaid"}</div>
<div class="hr"></div><div class="c">Thank you! Visit again.</div>`;
  return docHtml("Bill " + o.invoice_no, PRINT_CSS(w), body);
}
function kotHtml(o) {
  const w = (R && R.printer_width) || 58, items = Array.isArray(o.cart) ? o.cart : [];
  const body = `<div class="c b big">KITCHEN ORDER</div><div class="c b big">${esc(o.kot_no)}</div><div class="hr"></div>
<div class="b big">TABLE ${esc(o.table_number)}</div><div>${esc(o.order_no)}</div><div>${esc(fmtStamp(o.created_at))}</div><div>Guest: ${esc(o.customer_name)}</div><div class="hr"></div>
<table>${items.map((i) => `<tr><td class="b big">${esc(i.qty)} x</td><td class="b big">${esc(i.name)}</td></tr>`).join("")}</table>
${o.notes ? `<div class="note"><b>NOTES:</b> ${esc(o.notes)}</div>` : ""}`;
  return docHtml("KOT " + o.kot_no, PRINT_CSS(w), body);
}

/* QR links ---------------------------------------------------------------------------- */
function tableLink(table, token) {
  const u = new URL("index.html", location.href);
  u.search = "";
  u.searchParams.set("restaurant", R.slug);
  u.searchParams.set("table", table);
  if (token) u.searchParams.set("k", token);
  return u.href;
}
async function loadLinks(force) {
  if (!S.links || force) S.links = await rpc("admin_table_links", { p_restaurant: S.rid });
  return S.links;
}
function qrSheetHtml(links) {
  const cards = links.map((l) => `<div class="card"><div class="n">${esc(R.name)}</div><div class="t">Table ${esc(l.table)}</div>${QR.svg(tableLink(l.table, l.token), { border: 2 })}<div class="s">Scan to view the menu &amp; order</div></div>`).join("");
  const css = `@page{margin:10mm}body{font-family:system-ui,sans-serif;margin:0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}
.card{border:1px solid #000;border-radius:6px;padding:6mm;text-align:center;break-inside:avoid}.n{font-weight:700;font-size:14px}.t{font-size:22px;font-weight:700;margin:4px 0}
.card svg{width:100%;height:auto;display:block;margin:4px auto}.s{font-size:12px}`;
  return docHtml("QR codes", css, `<div class="grid">${cards}</div>`);
}

/* ---------------------------------------------------------------- data loaders ---- */
async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new AppError(friendlyError(error), error.code || "", error);
  return data;
}
const naturalCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const ACTIVE_STATUSES = ["Pending", "Preparing", "Ready", "Served"];
const findOrder = (id) => S.orders.find((o) => o.id === id) || S.histOrders.find((o) => o.id === id) || null;
/* Consolidate all active unpaid orders on a table into a single unified bill preview */
function consolidatedTableBill(o) {
  if (!o || !ACTIVE_STATUSES.includes(o.status)) return o;
  const group = S.orders.filter((x) => x.table_number === o.table_number && ACTIVE_STATUSES.includes(x.status))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (group.length <= 1) return o;
  const map = new Map();
  let sub = 0, disc = 0, gst = 0, tot = 0;
  group.forEach((ord) => {
    sub += num(ord.subtotal); disc += num(ord.discount); gst += num(ord.gst); tot += num(ord.total);
    (ord.cart || []).forEach((it) => {
      const qty = num(it.qty ?? it.quantity, 1);
      const orig = num(it.original_price ?? it.price);
      const k = `${it.id || it.name}__${it.variant || "full"}__${orig.toFixed(2)}`;
      if (map.has(k)) map.get(k).qty += qty;
      else map.set(k, Object.assign({}, it, { qty, price: num(it.price), original_price: orig }));
    });
  });
  const master = group.find((x) => x.status === "Served") || group[0];
  return Object.assign({}, master, {
    order_no: group.map((x) => x.order_no).join(", "),
    cart: Array.from(map.values()),
    subtotal: Math.round(sub * 100) / 100,
    discount: Math.round(disc * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    total: Math.round(tot * 100) / 100
  });
}

async function loadOrders() {
  const data = await rpc("staff_orders", { p_restaurant: S.rid });
  S.orders = Array.isArray(data) ? data : [];
  detectNewOrders();
  const pending = S.orders.filter((o) => o.status === "Pending").length, b = $("#navOrdersBadge");
  b.textContent = pending; b.hidden = pending === 0;
}
async function loadTables() {
  const data = await q(sb.from("tables").select("table_number,status,current_order_id").eq("restaurant_id", S.rid));
  S.tables = (data || []).sort((a, b) => naturalCompare(a.table_number, b.table_number));
}

/* new-order alarm: compares order ids (the old code compared a counter that never rang for the first order of the day) */
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (_) { /* no audio available */ }
}
function playChime() {
  if (!S.sound || !audioCtx) return;
  [[880, 0], [1175, 0.18]].forEach(([freq, delay]) => {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), t0 = audioCtx.currentTime + delay;
    osc.type = "sine"; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0); gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t0); osc.stop(t0 + 0.3);
  });
}
function detectNewOrders() {
  const fresh = S.orders.filter((o) => o.status === "Pending" && !S.seenOrderIds.has(o.id));
  S.orders.forEach((o) => S.seenOrderIds.add(o.id));
  if (S.firstOrderLoad) { S.firstOrderLoad = false; return; }
  if (fresh.length) {
    playChime();
    showToast(`New order ${fresh[0].order_no} - Table ${fresh[0].table_number}` + (fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ""), "success", 6000);
  }
}

/* ------------------------------------------------------------------ live refresh ---- */
function setNet(ok) { const n = $("#netState"); n.hidden = ok; }
async function refreshLive() {
  if (S.refreshing || S.suspended || S.expiring) return;
  S.refreshing = true;
  try {
    await Promise.all([loadOrders(), loadTables()]);
    setNet(true);
    renderLive();
    if (S.page === "dashboard" && isAdmin()) await loadDashboard();
  } catch (e) {
    if (e.code === "NETWORK") setNet(false); else if (e.code === "42501" || e.code === "PGRST301" || /suspended/i.test(e.message)) handle(e);
  } finally { S.refreshing = false; }
}
const refreshSoon = debounce(refreshLive, 400);
function renderLive() {
  if (S.page === "orders") renderBoard();
  else if (S.page === "tables") renderTableCards();
}

/* --------------------------------------------------------------------- orders page ---- */
const COLUMNS = [
  { key: "Pending", title: "Pending", cls: "pendingColor" },
  { key: "Preparing", title: "Preparing", cls: "preparingColor" },
  { key: "Ready", title: "Ready", cls: "readyColor" },
  { key: "Served", title: "Served - Awaiting Payment", cls: "servedColor" },
  { key: "Done", title: "Completed / Cancelled", cls: "completedColor" }
];
function orderMatches(o) {
  if (S.orderTable && o.table_number !== S.orderTable) return false;
  const term = S.orderQuery.trim().toLowerCase();
  if (!term) return true;
  return [o.order_no, o.invoice_no, o.customer_name, o.table_number].concat((o.cart || []).map((i) => i.name)).join(" ").toLowerCase().includes(term);
}
function priority(o) {
  if (o.status === "Completed" || o.status === "Cancelled") return { cls: "priorityFresh", text: "Done" };
  if (o.status === "Served") return { cls: "priorityFresh", text: "Eating" };
  const m = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
  if (m < 10) return { cls: "priorityFresh", text: "Fresh" };
  return m < 20 ? { cls: "priorityAttention", text: "Attention" } : { cls: "priorityUrgent", text: "Urgent" };
}
function statusButtons(o) {
  const id = esc(o.id);
  const cancel = `<button class="cancelBtn" type="button" data-action="cancel" data-id="${id}">Cancel</button>`;
  const go = (status, cls, label) => `<button class="${cls}" type="button" data-action="status" data-status="${status}" data-id="${id}">${label}</button>`;
  switch (o.status) {
    case "Pending":   return `<div class="btnRow">${cancel}${go("Preparing", "prepareBtn", "Start Cooking")}</div>`;
    case "Preparing": return `<div class="btnRow">${cancel}${go("Ready", "readyBtn", "Ready")}</div>`;
    case "Ready":     return `<div class="btnRow">${cancel}${go("Served", "serveBtn", "Serve")}</div>`;
    case "Served":    return `<button class="payBtn" type="button" data-action="pay" data-id="${id}">Collect Payment</button>`;
    case "Completed": return `<span class="statusBadge statusCompleted">Paid - ${esc(o.payment_mode || "")}</span>`;
    default:          return `<span class="statusBadge statusCancelled">Cancelled</span>${o.cancel_reason ? `<div class="muted">${esc(o.cancel_reason)}</div>` : ""}`;
  }
}
function orderCard(o) {
  const p = priority(o), id = esc(o.id);
  const ago = o.status === "Completed" || o.status === "Cancelled" ? fmtTime(o.created_at) : o.status === "Served" ? "Eating" : timeAgo(o.created_at);
  return `<div class="kdsItem">
    <div class="kdsHead"><b>${esc(o.order_no)}</b><span class="${p.cls}">${esc(p.text)}</span></div>
    <div class="kdsMeta">Guest: ${esc(o.customer_name)}</div><div>Table ${esc(o.table_number)}</div><div>${esc(ago)}</div>
    <div class="kdsHead"><div class="price">${esc(money(o.total))}</div><div class="payTag">${o.payment_status === "Paid" ? "Paid" : "Unpaid"}</div></div>
    <hr>${(o.cart || []).map((i) => `<div>${esc(i.qty)} &times; ${esc(i.name)}</div>`).join("")}
    ${o.notes ? `<div class="notesBox"><b>Notes:</b> ${esc(o.notes)}</div>` : ""}
    <hr><div class="btnRow2"><button class="billBtn" type="button" data-action="bill" data-id="${id}">Bill</button><button class="kotBtn" type="button" data-action="kot" data-id="${id}">KOT</button></div>
    <div class="mt10">${statusButtons(o)}</div></div>`;
}
function renderBoard() {
  const board = $("#kdsBoard");
  if (!board) return;
  const cols = { Pending: [], Preparing: [], Ready: [], Served: [], Done: [] };
  S.orders.filter(orderMatches).forEach((o) => (cols[o.status] || cols.Done).push(o));
  const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  ["Pending", "Preparing", "Ready", "Served"].forEach((k) => cols[k].sort(byTime));
  cols.Done.sort((a, b) => byTime(b, a));
  board.innerHTML = COLUMNS.map((c) => `<div class="kdsColumn"><div class="kdsTitle ${c.cls}">${esc(c.title)}<span>${cols[c.key].length}</span></div>${cols[c.key].map(orderCard).join("") || '<div class="muted center">No orders</div>'}</div>`).join("");
  const chip = $("#tableChip");
  chip.hidden = !S.orderTable;
  $("#tableChipText").textContent = "Table " + S.orderTable;
}
function renderOrdersShell() {
  $("#orders").innerHTML = `<div class="sectionHeader"><h2>Kitchen Orders</h2><div class="headerTools">
    <span class="chipFilter" id="tableChip" hidden><span id="tableChipText"></span> <button type="button" data-action="clear-table" aria-label="Clear table filter">&times;</button></span>
    <input id="orderSearch" data-input="orderSearch" placeholder="Search order, guest, table, item" value="${esc(S.orderQuery)}" maxlength="60">
    <button class="primaryButton" type="button" data-action="refresh">Refresh</button></div></div>
    <div class="kdsBoard" id="kdsBoard"></div>`;
  renderBoard();
}

async function setStatus(id, status) {
  if (S.busy.has(id)) return;
  const o = findOrder(id);
  if (!o) return;
  let reason = null;
  if (status === "Cancelled") {
    reason = await Dialog.prompt({ title: "Cancel order " + o.order_no, label: "Reason for cancelling (kept in the activity log)", placeholder: "e.g. Guest left, item out of stock", minLength: 3, maxlength: 200, okText: "Cancel order", danger: true });
    if (!reason) return;
  }
  S.busy.add(id);
  const ok = await run(async () => { await rpc("set_order_status", { p_order: id, p_status: status, p_reason: reason }); });
  S.busy.delete(id);
  if (ok) await refreshLive();
}
async function collectPayment(id) {
  if (S.busy.has(id)) return;
  const o = findOrder(id);
  if (!o) return;
  const tableOpen = S.orders.filter((x) => x.table_number === o.table_number && ACTIVE_STATUSES.includes(x.status));
  const unserved = tableOpen.filter((x) => x.status !== "Served");
  let settleAll = false;
  if (unserved.length > 0) {
    const okUnserved = await Dialog.confirm(
      `Table ${o.table_number} still has ${unserved.length} order(s) not marked Served yet (${unserved.map((u) => u.order_no + ": " + u.status).join(", ")}). Merge and collect payment for ALL open orders on Table ${o.table_number} together?`,
      { title: "Unserved orders on Table " + o.table_number, confirmText: "Merge & Collect All" }
    );
    if (!okUnserved) return;
    settleAll = true;
  }
  const billTargets = settleAll ? tableOpen : tableOpen.filter((x) => x.status === "Served");
  const totalAmt = billTargets.reduce((s, x) => s + num(x.total), 0) || num(o.total);
  const mode = await Dialog.open({
    title: `Collect payment - Table ${o.table_number}`,
    body: `<p class="dlgText">Amount to collect${billTargets.length > 1 ? ` (${billTargets.length} merged rounds)` : ""}: <b>${esc(money(totalAmt))}</b></p><p class="dlgText">How did the guest pay?</p>`,
    buttons: [{ id: "Cash", label: "Cash", kind: "primaryButton" }, { id: "UPI", label: "UPI", kind: "primaryButton" }, { id: "Card", label: "Card", kind: "primaryButton" }, { id: "x", label: "Cancel" }]
  });
  if (!mode || mode === "x") return;
  S.busy.add(id);
  const ok = await run(async () => { await rpc("collect_payment", { p_order: id, p_mode: mode, p_settle_all: settleAll }); });
  S.busy.delete(id);
  if (ok) { showToast("Payment recorded (" + mode + ")", "success"); await refreshLive(); }
}

/* --------------------------------------------------------------- dashboard page ---- */
async function loadDashboard() {
  const d = await rpc("dashboard_summary", { p_restaurant: S.rid });
  renderDashboard(d);
}
function renderDashboard(d) {
  const card = (icon, value, label) => `<div class="statCard"><i class="fa-solid ${icon}"></i><div><h3>${esc(value)}</h3><p>${esc(label)}</p></div></div>`;
  const recent = (d.recent || []).map((r) => `<tr><td>${esc(r.order_no)}</td><td>${esc(r.customer_name)}</td><td>T${esc(r.table_number)}</td><td>${esc(money(r.total))}</td><td><span class="statusBadge status${esc(r.status)}">${esc(r.status)}</span></td></tr>`).join("");
  const top = (d.top_items || []).map((t, i) => `<tr><td>${i + 1}. ${esc(t.name)}</td><td class="r">${esc(t.qty)}</td></tr>`).join("");
  $("#dashboard").innerHTML = `<div class="sectionHeader"><h2>Today</h2><span class="muted">Business day ${esc(d.date)}</span></div>
    <div class="statsGrid">
      ${card("fa-money-bill-wave", money(d.sales), "Sales today")}
      ${card("fa-receipt", d.orders, "Orders today")}
      ${card("fa-hand-holding-dollar", money(d.collected), "Collected")}
      ${card("fa-hourglass-half", money(d.uncollected), "Still to collect")}
      ${card("fa-chair", d.occupied_tables + " / " + d.total_tables, "Occupied tables")}
      ${card("fa-burger", d.menu_items, "Menu items")}
      ${card("fa-percent", money(d.gst), "GST included")}
      ${card("fa-ban", d.cancelled, "Cancelled orders")}
    </div>
    <div class="dashboardGrid">
      <div class="panel"><h3>Recent orders</h3>${recent ? `<table class="dataTable"><tbody>${recent}</tbody></table>` : '<p class="muted">No orders yet today.</p>'}</div>
      <div class="panel"><h3>Top items</h3>${top ? `<table class="dataTable"><tbody>${top}</tbody></table>` : '<p class="muted">No sales yet today.</p>'}</div>
    </div>
    <p class="retentionNote"><i class="fa-solid fa-shield-halved"></i> For privacy, orders are deleted automatically after ${RETENTION()} days. Download your reports from the Reports page.</p>`;
}

/* ----------------------------------------------------------------- tables page ---- */
function renderTablesShell() {
  $("#tables").innerHTML = `<div class="sectionHeader"><h2>Tables</h2><div class="headerTools">
    <input id="tableSearch" data-input="tableSearch" placeholder="Search table" maxlength="20">
    <select id="tableFilter" data-change="tableFilter"><option value="">All</option><option value="Free">Free</option><option value="Occupied">Occupied</option></select>
    <button class="primaryButton" type="button" data-action="refresh">Refresh</button>
    ${isAdmin() ? '<button class="secondaryButton" type="button" data-action="table-add"><i class="fa-solid fa-plus"></i> Add table</button><button class="secondaryButton" type="button" data-action="qr-master"><i class="fa-solid fa-qrcode"></i> Master QR</button><button class="secondaryButton" type="button" data-action="qr-sheet"><i class="fa-solid fa-print"></i> Table QRs</button>' : ""}
    </div></div><div id="tableSummary" class="mb20"></div><div class="tablesGrid" id="tablesGrid"></div>`;
  renderTableCards();
}
function renderTableCards() {
  const grid = $("#tablesGrid");
  if (!grid) return;
  const term = ($("#tableSearch").value || "").trim().toLowerCase(), f = $("#tableFilter").value;
  const list = S.tables.filter((t) => (!term || t.table_number.toLowerCase().includes(term)) && (!f || t.status === f));
  const free = S.tables.filter((t) => t.status === "Free").length;
  $("#tableSummary").innerHTML = `<span class="tableStatus free">${free} free</span> <span class="tableStatus occupied">${S.tables.length - free} occupied</span> <span class="muted">${S.tables.length} tables</span>`;
  grid.innerHTML = list.map((t) => {
    const open = S.orders.filter((o) => o.table_number === t.table_number && ACTIVE_STATUSES.includes(o.status));
    const cur = S.orders.find((o) => o.id === t.current_order_id) || open[0] || null;
    const tn = esc(t.table_number);
    const buttons = [];
    if (t.status === "Occupied" && cur) buttons.push(`<button class="viewBtn" type="button" data-action="view-table" data-table="${tn}">View orders (${open.length})</button>`, `<button class="billBtn" type="button" data-action="bill" data-id="${esc(cur.id)}">Bill</button>`);
    if (t.status === "Occupied" && open.length === 0) buttons.push(`<button class="releaseBtn" type="button" data-action="release" data-table="${tn}">Release table</button>`);
    if (isAdmin()) buttons.push(`<button class="secondaryButton" type="button" data-action="table-qr" data-table="${tn}"><i class="fa-solid fa-qrcode"></i> QR code</button>`);
    if (isAdmin() && t.status === "Free") buttons.push(`<button class="releaseBtn" type="button" data-action="table-delete" data-table="${tn}">Delete table</button>`);
    return `<div class="tableCard"><h2>${tn}</h2><div class="tableStatus ${esc(t.status.toLowerCase())}">${esc(t.status)}</div>
      <div class="tableCustomer">${cur ? esc(cur.customer_name) : "-"}</div><div class="mt10">${cur ? esc(money(open.reduce((s, o) => s + num(o.total), 0))) : ""}</div>
      <div class="tableButtons">${buttons.join("")}</div></div>`;
  }).join("") || '<p class="muted">No tables found.</p>';
}
async function addTable() {
  let added = false;
  await Dialog.prompt({
    title: "Add table", label: "Table name or number", placeholder: "e.g. 11 or VIP-1", maxlength: 20, okText: "Add table",
    async onSubmit(v) {
      try { await rpc("add_table", { p_restaurant: S.rid, p_table: v }); S.links = null; added = true; }
      catch (e) { return { error: e.message }; }
    }
  });
  if (added) { showToast("Table added", "success"); await refreshLive(); }
}
async function deleteTable(table) {
  if (!(await Dialog.confirm(`Delete table ${table}? Its QR code will stop working.`, { danger: true, confirmText: "Delete table" }))) return;
  if (await run(async () => { await rpc("remove_table", { p_restaurant: S.rid, p_table: table }); S.links = null; })) { showToast("Table deleted", "success"); await refreshLive(); }
}
async function releaseTable(table) {
  if (!(await Dialog.confirm(`Mark table ${table} as free?`))) return;
  if (await run(async () => { await rpc("release_table", { p_restaurant: S.rid, p_table: table }); })) await refreshLive();
}
async function showTableQr(table) {
  let links;
  if (!(await run(async () => { links = await loadLinks(); }, { loader: "Loading..." }))) return;
  const l = links.find((x) => x.table === table);
  if (!l) return;
  const url = tableLink(table, l.token);
  await Dialog.open({
    title: "QR code - Table " + table, wide: false,
    body: `<div class="qrBox">${QR.svg(url, { border: 2 })}</div><p class="dlgText small">Print it and place it on the table. Guests scan it to order. The code contains a private key for this table.</p><input class="dlgInput" id="qrUrl" readonly value="${esc(url)}">`,
    buttons: [{ id: "copy", label: "Copy link" }, { id: "print", label: "Print", kind: "primaryButton" }, { id: "rotate", label: "Replace key", kind: "dangerButton" }, { id: "close", label: "Close" }],
    async onClick(id) {
      if (id === "copy") { showToast((await copyText(url)) ? "Link copied" : "Could not copy", "info"); return { error: "" }; }
      if (id === "print") { printHtml(qrSheetHtml([{ table, token: l.token }])); return { error: "" }; }
      if (id === "rotate") {
        if (!(await Dialog.confirm("Replace this table's key? The old printed QR code will stop working.", { danger: true, confirmText: "Replace key" }))) return { error: "" };
        await rpc("rotate_table_token", { p_restaurant: S.rid, p_table: table }); S.links = null;
        showToast("New key created. Print the new QR code.", "success");
      }
    }
  });
}
async function printAllQr() {
  let links;
  if (!(await run(async () => { links = await loadLinks(true); }, { loader: "Preparing QR codes..." }))) return;
  printHtml(qrSheetHtml(links));
}

/* ---------------------------------------------------------------- history page ---- */
function histBounds() { const max = businessDateNow(); return { max, min: addDays(max, -(RETENTION() - 1)) }; }
function renderHistoryShell() {
  const b = histBounds();
  if (!S.histDate) S.histDate = b.max;
  $("#history").innerHTML = `<div class="sectionHeader"><h2>Order history</h2><div class="headerTools">
    <button class="secondaryButton" type="button" data-action="hist-prev">&larr;</button>
    <input type="date" id="histDate" data-change="histDate" min="${esc(b.min)}" max="${esc(b.max)}" value="${esc(S.histDate)}">
    <button class="secondaryButton" type="button" data-action="hist-next">&rarr;</button>
    <input id="histSearch" data-input="histSearch" placeholder="Search" maxlength="60"></div></div>
    <p class="retentionNote"><i class="fa-solid fa-shield-halved"></i> Orders are kept for ${RETENTION()} days, then deleted automatically.${isAdmin() ? " Export what you need from Reports." : ""}</p>
    <div id="histBody"></div>`;
  renderHistoryBody();
}
function renderHistoryBody() {
  const el = $("#histBody");
  if (!el) return;
  const term = S.histQuery.trim().toLowerCase();
  const list = S.histOrders.filter((o) => !term || [o.order_no, o.customer_name, o.table_number].join(" ").toLowerCase().includes(term));
  el.innerHTML = list.length ? `<table class="dataTable wide"><thead><tr><th>Time</th><th>Order</th><th>Guest</th><th>Table</th><th>Items</th><th class="r">Total</th><th>Status</th><th>Payment</th><th></th></tr></thead><tbody>` +
    list.map((o) => `<tr><td>${esc(fmtTime(o.created_at))}</td><td>${esc(o.order_no)}</td><td>${esc(o.customer_name)}</td><td>${esc(o.table_number)}</td><td>${esc((o.cart || []).reduce((s, i) => s + num(i.qty), 0))}</td><td class="r">${esc(money(o.total))}</td><td><span class="statusBadge status${esc(o.status)}">${esc(o.status)}</span></td><td>${o.payment_status === "Paid" ? esc(o.payment_mode || "Paid") : "-"}</td><td><button class="billBtn" type="button" data-action="bill" data-id="${esc(o.id)}">Bill</button></td></tr>`).join("") + "</tbody></table>"
    : '<p class="muted">No orders on this date.</p>';
}
async function loadHistory() {
  const data = await rpc("orders_by_date", { p_restaurant: S.rid, p_date: S.histDate });
  S.histOrders = Array.isArray(data) ? data : [];
  renderHistoryBody();
}
function shiftHistory(delta) {
  const b = histBounds(), next = addDays(S.histDate || b.max, delta);
  if (next < b.min || next > b.max) return;
  S.histDate = next; $("#histDate").value = next;
  run(loadHistory);
}

/* ------------------------------------------------------------------- menu page ---- */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
async function loadMenu() {
  const [raw, priced] = await Promise.all([
    q(sb.from("menu").select("*").eq("restaurant_id", S.rid).order("category").order("name")),
    rpc("get_menu", { p_restaurant: S.rid })
  ]);
  const pm = new Map((priced || []).map((p) => [p.id, p]));
  S.menu = (raw || []).map((m) => {
    const p = pm.get(m.id);
    return Object.assign({}, m, { live_price: p ? num(p.price) : num(m.price), offer_live: p ? !!p.offer_active : false });
  });
}
const ITEM_BADGES = ["Chef Special", "Bestseller", "Must Try", "Spicy", "New"];
function renderMenuShell() {
  $("#menu").innerHTML = `<div class="sectionHeader"><h2>Menu</h2><div class="headerTools">
    <input id="menuSearch" data-input="menuSearch" placeholder="Search dish, badge, category" maxlength="60">
    <select id="menuCat" data-change="menuCat"><option value="">All categories</option></select>
    <select id="menuFilter" data-change="menuFilter">
      <option value="">All items</option>
      <option value="oos">Out of stock</option>
      <option value="special">Special / Badged</option>
      <option value="offer">With offer</option>
      <option value="upsell">Checkout upsells</option>
      <option value="veg">Veg only</option>
      <option value="nonveg">Non-veg only</option>
    </select>
    <button class="secondaryButton" type="button" data-action="menu-template">CSV template</button>
    <button class="secondaryButton" type="button" data-action="menu-import"><i class="fa-solid fa-file-import"></i> Import CSV</button>
    <button class="primaryButton" type="button" data-action="menu-add"><i class="fa-solid fa-plus"></i> Add item</button></div></div>
    <div id="menuSummary" class="menuSummary"></div>
    <div class="menuGrid" id="menuGrid"></div>`;
  renderMenuCards();
}
function renderMenuCards() {
  const grid = $("#menuGrid");
  if (!grid) return;
  const sel = $("#menuCat"), cats = [...new Set(S.menu.map((m) => m.category))].sort();
  if (!cats.includes(S.menuCat)) S.menuCat = "";
  sel.innerHTML = '<option value="">All categories (' + cats.length + ')</option>' + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  sel.value = S.menuCat;
  const fsel = $("#menuFilter"); if (fsel) fsel.value = S.menuFilter;
  const oosCount = S.menu.filter((m) => !m.available).length;
  const offerCount = S.menu.filter((m) => m.offer_type && m.offer_type !== "None").length;
  const upsellCount = S.menu.filter((m) => m.is_upsell).length;
  const sumEl = $("#menuSummary");
  if (sumEl) sumEl.innerHTML = `<span><b>${S.menu.length}</b> total</span> &middot; <span><b>${oosCount}</b> out of stock</span> &middot; <span><b>${offerCount}</b> with offers</span> &middot; <span><b>${upsellCount}</b> checkout upsells</span>`;
  const term = S.menuQuery.trim().toLowerCase();
  const list = S.menu.filter((m) => {
    if (S.menuCat && m.category !== S.menuCat) return false;
    if (S.menuFilter === "oos" && m.available) return false;
    if (S.menuFilter === "special" && (!Array.isArray(m.badges) || m.badges.length === 0)) return false;
    if (S.menuFilter === "offer" && (!m.offer_type || m.offer_type === "None")) return false;
    if (S.menuFilter === "upsell" && !m.is_upsell) return false;
    if (S.menuFilter === "veg" && !m.veg) return false;
    if (S.menuFilter === "nonveg" && m.veg) return false;
    if (term && !([m.name, m.category, m.description].concat(m.badges || []).join(" ").toLowerCase().includes(term))) return false;
    return true;
  });
  grid.innerHTML = list.map((m) => {
    const id = esc(m.id), img = safeUrl(m.image_url) || DEFAULT_IMAGE;
    const hasOffer = m.offer_type && m.offer_type !== "None";
    const tags = (Array.isArray(m.badges) ? m.badges : []).map((t) => `<span class="badge tagBadge">${esc(t)}</span>`).join("");
    const priceHtml = (num(m.half_price) > 0 ? `<span class="muted small">Half ${esc(money(m.half_price))} &middot; Full </span>` : "") +
      (m.offer_live ? `<s class="muted">${esc(money(m.price))}</s> ${esc(money(m.live_price))}` : esc(money(m.price)));
    return `<div class="menuCard${m.available ? "" : " isOos"}"><div class="menuImage"><img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div><div class="menuBody">
      <h3>${esc(m.name)}</h3>
      <div><span class="badge ${m.veg ? "available" : "unavailable"}">${m.veg ? "VEG" : "NON-VEG"}</span><span class="badge ${m.available ? "available" : "unavailable"}">${m.available ? "In Stock" : "OUT OF STOCK"}</span>${tags}${m.is_upsell ? '<span class="badge upsellBadge">Upsell</span>' : ""}${hasOffer ? `<span class="badge offerBadge">${esc(m.offer_type)}${m.offer_live ? " (live)" : ""}</span>` : ""}</div>
      <p><b>${esc(m.category)}</b>${m.description ? " - " + esc(m.description) : ""}</p>
      <div class="price">${priceHtml}</div>
      <div class="cardActions"><button class="editBtn" type="button" data-action="menu-edit" data-id="${id}">Edit</button><button class="offerBtn" type="button" data-action="menu-offer" data-id="${id}">Offer</button>
      <button class="stockBtn" type="button" data-action="menu-toggle" data-id="${id}" data-to="${m.available ? "false" : "true"}">${m.available ? "Mark Out" : "Mark In Stock"}</button><button class="deleteBtn" type="button" data-action="menu-delete" data-id="${id}">Delete</button></div></div></div>`;
  }).join("") || '<p class="muted">No menu items match this filter.</p>';
}
async function afterMenuChange() { await loadMenu(); renderMenuCards(); }

async function editMenuItem(id) {
  const m = id ? S.menu.find((x) => x.id === id) : null;
  if (id && !m) return;
  const cats = [...new Set(S.menu.map((x) => x.category))].sort();
  await Dialog.open({
    title: m ? "Edit item" : "Add menu item", wide: true,
    body: `<div class="formGrid">
      <div><label for="mName">Item name *</label><input id="mName" maxlength="80" autocomplete="off"></div>
      <div><label for="mCatSel">Category *</label>
        <select id="mCatSel">${cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}<option value="__new__">+ Add new category...</option></select>
        <input id="mCatNew" maxlength="40" autocomplete="off" placeholder="Enter new category name" class="mt6" hidden>
      </div>
      <div><label for="mPrice">Full / Regular Price (${esc(R.currency)}) *</label><input id="mPrice" type="number" min="0.01" max="100000" step="0.01"></div>
      <div><label for="mHalfPrice">Half Price (optional, ${esc(R.currency)})</label><input id="mHalfPrice" type="number" min="0.01" max="100000" step="0.01" placeholder="Leave blank if single size"></div>
      <div><label for="mVeg">Food type *</label><select id="mVeg"><option value="">Choose...</option><option value="true">Vegetarian</option><option value="false">Non-vegetarian</option></select></div>
      <div><label for="mAvail">Stock status</label><select id="mAvail"><option value="true">In Stock</option><option value="false">Out of Stock</option></select></div>
      <div class="fullWidth"><label>Highlight badges (optional)</label><div class="dayRow">${ITEM_BADGES.map((b) => `<label class="dayBox"><input type="checkbox" class="mBadge" value="${esc(b)}"> ${esc(b)}</label>`).join("")}</div></div>
      <div class="fullWidth"><label class="dayBox"><input type="checkbox" id="mUpsell"> Suggest at checkout as high-margin add-on (e.g. Papad, Cold Drink, Dessert)</label></div>
      <div class="fullWidth"><label for="mImage">Image URL (https://)</label><input id="mImage" maxlength="500" autocomplete="off"></div>
      <div class="fullWidth"><label for="mDesc">Description</label><textarea id="mDesc" maxlength="300"></textarea></div></div>`,
    buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Save item", kind: "primaryButton" }],
    onOpen() {
      const sel = $("#mCatSel"), inp = $("#mCatNew");
      const syncCat = () => { inp.hidden = sel.value !== "__new__"; if (!inp.hidden) inp.focus(); };
      sel.addEventListener("change", syncCat);
      if (m) {
        $("#mName").value = m.name;
        if (cats.includes(m.category)) sel.value = m.category;
        else { sel.value = "__new__"; inp.value = m.category; }
        $("#mPrice").value = m.price;
        $("#mHalfPrice").value = num(m.half_price) > 0 ? m.half_price : "";
        $("#mVeg").value = String(m.veg);
        $("#mAvail").value = String(m.available);
        $("#mUpsell").checked = !!m.is_upsell;
        const bs = Array.isArray(m.badges) ? m.badges : [];
        $$(".mBadge").forEach((c) => { c.checked = bs.includes(c.value); });
        $("#mImage").value = m.image_url || "";
        $("#mDesc").value = m.description || "";
      } else if (cats.length === 0) {
        sel.value = "__new__";
      }
      syncCat();
    },
    async onClick(btn) {
      if (btn !== "save") return;
      const name = $("#mName").value.trim();
      const category = ($("#mCatSel").value === "__new__" ? $("#mCatNew").value : $("#mCatSel").value).trim();
      const price = Number($("#mPrice").value);
      const halfRaw = $("#mHalfPrice").value.trim();
      const halfPrice = halfRaw === "" ? null : Number(halfRaw);
      const veg = $("#mVeg").value, image = $("#mImage").value.trim(), desc = $("#mDesc").value.trim();
      if (!name || name.length > 80) return { error: "Item name is required (up to 80 characters)." };
      if (!category || category.length > 40) return { error: "Category is required (up to 40 characters)." };
      if (!(price > 0) || price > 100000) return { error: "Enter a price between 0.01 and 100000." };
      if (halfPrice !== null && (!(halfPrice > 0) || halfPrice > 100000)) return { error: "Half price must be greater than 0." };
      if (veg === "") return { error: "Please choose Vegetarian or Non-vegetarian." };
      if (image && !/^https:\/\/\S+$/.test(image)) return { error: "Image URL must start with https://" };
      const badges = $$(".mBadge").filter((c) => c.checked).map((c) => c.value);
      const row = {
        category, name, description: desc,
        price: Math.round(price * 100) / 100,
        half_price: halfPrice === null ? null : Math.round(halfPrice * 100) / 100,
        badges, is_upsell: $("#mUpsell").checked,
        image_url: image, veg: veg === "true", available: $("#mAvail").value === "true"
      };
      try {
        if (m) await q(sb.from("menu").update(row).eq("id", m.id).eq("restaurant_id", S.rid));
        else await q(sb.from("menu").insert(Object.assign({ restaurant_id: S.rid }, row)));
      } catch (e) { return { error: e.code === "23505" ? "An item with this name already exists in this category." : e.message }; }
      await afterMenuChange(); showToast("Menu item saved", "success");
    }
  });
}
async function editOffer(id) {
  const m = S.menu.find((x) => x.id === id);
  if (!m) return;
  const types = ["None", "Happy Hour", "Special", "Flat", "Percentage"];
  await Dialog.open({
    title: "Offer - " + m.name, wide: true,
    body: `<div class="formGrid">
      <div><label for="oType">Offer type</label><select id="oType">${types.map((t) => `<option value="${t}">${t === "None" ? "No offer" : t}</option>`).join("")}</select></div>
      <div><label for="oValue">Value (Flat = ${esc(R.currency)} off, others = % off)</label><input id="oValue" type="number" min="0" step="0.01"></div>
      <div><label for="oStart">Start time (optional)</label><input id="oStart" type="time"></div>
      <div><label for="oEnd">End time (optional)</label><input id="oEnd" type="time"></div>
      <div class="fullWidth"><label>Days (none selected = every day)</label><div class="dayRow">${DAYS.map((d) => `<label class="dayBox"><input type="checkbox" class="oDay" value="${d}"> ${d}</label>`).join("")}</div></div></div>
      <p class="dlgText small">Offers use the restaurant's own clock (${esc(tz())}). A window like 22:00 - 02:00 works across midnight.${R.happy_hour_enabled ? "" : " Happy Hour offers are currently switched off in Settings."}</p>`,
    buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Save offer", kind: "primaryButton" }],
    onOpen() {
      $("#oType").value = m.offer_type || "None"; $("#oValue").value = num(m.offer_value) || "";
      $("#oStart").value = m.start_time || ""; $("#oEnd").value = m.end_time || "";
      const days = Array.isArray(m.offer_days) ? m.offer_days : [];
      $$(".oDay").forEach((c) => { c.checked = days.includes(c.value); });
    },
    async onClick(btn) {
      if (btn !== "save") return;
      const type = $("#oType").value;
      let row = { offer_type: "None", offer_value: 0, start_time: "", end_time: "", offer_days: [] };
      if (type !== "None") {
        const value = Number($("#oValue").value), start = $("#oStart").value, end = $("#oEnd").value;
        if (!(value > 0)) return { error: "Enter an offer value greater than 0." };
        if (type !== "Flat" && value > 100) return { error: "A percentage cannot be more than 100." };
        if (type === "Flat" && value >= num(m.price)) return { error: "A flat discount must be less than the price." };
        if ((start && !end) || (!start && end)) return { error: "Set both a start and an end time, or leave both empty." };
        row = { offer_type: type, offer_value: Math.round(value * 100) / 100, start_time: start, end_time: end, offer_days: $$(".oDay").filter((c) => c.checked).map((c) => c.value) };
      }
      try { await q(sb.from("menu").update(row).eq("id", m.id).eq("restaurant_id", S.rid)); }
      catch (e) { return { error: e.message }; }
      await afterMenuChange(); showToast("Offer saved", "success");
    }
  });
}

/* CSV import: every row is validated here AND again in the database */
function parseVeg(v) {
  const s = String(v || "").trim().toLowerCase();
  if (["veg", "vegetarian", "v", "yes", "y", "true", "1"].includes(s)) return true;
  if (["non-veg", "nonveg", "non veg", "non_veg", "nv", "n", "no", "false", "0"].includes(s)) return false;
  return null;
}
function parseMenuCsv(text) {
  const out = { items: [], errors: [] };
  const rows = Sheets.parseCsv(text);
  if (rows.length < 2) { out.errors.push("The file has no data rows."); return out; }
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const iCat = col("category"), iName = col("name", "item", "item_name"), iDesc = col("description"), iPrice = col("price"), iVeg = col("veg", "type"), iImg = col("image_url", "image");
  if (iCat < 0 || iName < 0 || iPrice < 0 || iVeg < 0) { out.errors.push("Required columns: category, name, price, veg (optional: description, image_url)."); return out; }
  if (rows.length > 501) { out.errors.push("Please import at most 500 items at a time."); return out; }
  rows.slice(1).forEach((r, n) => {
    const line = n + 2, cell = (i) => (i >= 0 && r[i] !== undefined ? String(r[i]).trim() : "");
    const price = parseFloat(cell(iPrice).replace(/[^0-9.]/g, "")), veg = parseVeg(cell(iVeg));
    if (!cell(iCat) || !cell(iName)) return out.errors.push(`Row ${line}: category and name are required.`);
    if (!(price > 0) || price > 100000) return out.errors.push(`Row ${line}: price must be between 0 and 100000.`);
    if (veg === null) return out.errors.push(`Row ${line}: "veg" must be veg or non-veg (so food is never labelled wrongly).`);
    out.items.push({ category: cell(iCat).slice(0, 40), name: cell(iName).slice(0, 80), description: cell(iDesc).slice(0, 300), price, veg, image_url: cell(iImg) });
  });
  return out;
}
async function importMenuCsv() {
  let parsed = { items: [], errors: [] }, result = null;
  await Dialog.open({
    title: "Import menu from CSV", wide: true,
    body: `<p class="dlgText">Choose a CSV file with the columns <b>category, name, description, price, veg, image_url</b>. Items that already exist (same category and name) are updated. <a href="#" data-action="menu-template">Download a template</a>.</p>
      <input type="file" id="csvFile" accept=".csv,text/csv"><div id="csvPreview" class="csvPreview"></div>`,
    buttons: [{ id: "cancel", label: "Cancel" }, { id: "import", label: "Import", kind: "primaryButton" }],
    onOpen() {
      $("#csvFile").addEventListener("change", async (ev) => {
        const f = ev.target.files[0], box = $("#csvPreview");
        if (!f) return;
        if (f.size > 1500000) { box.textContent = "That file is too large."; parsed = { items: [], errors: [] }; return; }
        parsed = parseMenuCsv(await f.text());
        box.innerHTML = `<p><b>${parsed.items.length}</b> item(s) ready to import.</p>` +
          (parsed.errors.length ? `<p class="errText">${parsed.errors.length} problem(s):</p><ul>${parsed.errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : "");
      });
    },
    async onClick(btn) {
      if (btn !== "import") return;
      if (!parsed.items.length) return { error: "Choose a file with at least one valid row." };
      const total = { inserted: 0, updated: 0, skipped: 0, errors: [] };
      for (let i = 0; i < parsed.items.length; i += 200) {
        let r;
        try { r = await rpc("import_menu", { p_restaurant: S.rid, p_items: parsed.items.slice(i, i + 200) }); } catch (e) { return { error: e.message }; }
        total.inserted += r.inserted; total.updated += r.updated; total.skipped += r.skipped; total.errors.push(...(r.errors || []));
      }
      result = total;
    }
  });
  if (result) {
    await afterMenuChange();
    await Dialog.alert("Import finished", `<p class="dlgText">${result.inserted} added, ${result.updated} updated, ${result.skipped + parsed.errors.length} skipped.</p>${result.errors.length ? `<ul>${result.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}`);
  }
}
function downloadMenuTemplate() {
  Sheets.downloadCsv([["category", "name", "description", "price", "veg", "image_url"],
    ["Starters", "Paneer Tikka", "Smoky grilled paneer", 280, "veg", ""],
    ["Mains", "Butter Chicken", "Creamy tomato gravy", 360, "non-veg", ""]], "menu-template.csv");
}

/* ---------------------------------------------------------------- reports page ---- */
function renderReportsShell() {
  const b = histBounds();
  if (!S.reportRange) S.reportRange = { from: b.max, to: b.max };
  $("#reports").innerHTML = `<div class="sectionHeader"><h2>Reports &amp; export</h2></div>
    <div class="panel mb20"><div class="reportBar">
      <label>From <input type="date" id="repFrom" min="${esc(b.min)}" max="${esc(b.max)}" value="${esc(S.reportRange.from)}"></label>
      <label>To <input type="date" id="repTo" min="${esc(b.min)}" max="${esc(b.max)}" value="${esc(S.reportRange.to)}"></label>
      <button class="secondaryButton" type="button" data-action="rep-preset" data-preset="today">Today</button>
      <button class="secondaryButton" type="button" data-action="rep-preset" data-preset="yesterday">Yesterday</button>
      <button class="secondaryButton" type="button" data-action="rep-preset" data-preset="week">Last ${RETENTION()} days</button>
      <button class="primaryButton" type="button" data-action="rep-run">Show report</button></div>
      <div class="reportBar mt10">
      <button class="primaryButton" type="button" data-action="export-xlsx"><i class="fa-solid fa-file-excel"></i> Download Excel</button>
      <button class="secondaryButton" type="button" data-action="export-csv-orders"><i class="fa-solid fa-file-csv"></i> CSV - orders</button>
      <button class="secondaryButton" type="button" data-action="export-csv-items"><i class="fa-solid fa-file-csv"></i> CSV - items</button></div>
      <p class="retentionNote"><i class="fa-solid fa-shield-halved"></i> Orders are deleted automatically after ${RETENTION()} days. Download what you need to keep (for example for GST records) before then.</p></div>
    <div id="reportBody"></div>`;
  renderReportBody();
}
function readRange() {
  const from = $("#repFrom").value, to = $("#repTo").value, re = /^\d{4}-\d{2}-\d{2}$/, b = histBounds();
  if (!re.test(from) || !re.test(to) || from > to) { showToast("Choose a valid date range.", "error"); return null; }
  if (from < b.min || to > b.max) { showToast(`Data is only kept for the last ${RETENTION()} days.`, "error"); return null; }
  S.reportRange = { from, to };
  return S.reportRange;
}
async function loadReport() {
  const r = readRange();
  if (!r) return;
  S.report = await rpc("report_summary", { p_restaurant: S.rid, p_from: r.from, p_to: r.to });
  renderReportBody();
}
function renderReportBody() {
  const el = $("#reportBody"), d = S.report;
  if (!el) return;
  if (!d) { el.innerHTML = '<p class="muted">Choose a date range and press <b>Show report</b>.</p>'; return; }
  const card = (label, value) => `<div class="reportCard"><h4>${esc(label)}</h4><h2>${esc(value)}</h2></div>`;
  el.innerHTML = `<div class="reportCards">${card("Orders", d.orders)}${card("Sales", money(d.sales))}${card("GST included", money(d.gst))}${card("Discounts given", money(d.discount))}${card("Average bill", money(d.avg_bill))}${card("Cancelled", d.cancelled)}</div>
    <div class="dashboardGrid"><div class="panel"><h3>Payments</h3><table class="dataTable"><tbody>
      <tr><td>Cash</td><td class="r">${esc(money(d.cash))}</td></tr><tr><td>UPI</td><td class="r">${esc(money(d.upi))}</td></tr><tr><td>Card</td><td class="r">${esc(money(d.card))}</td></tr>
      <tr class="b"><td>Collected</td><td class="r">${esc(money(d.collected))}</td></tr><tr><td>Not collected yet</td><td class="r">${esc(money(d.uncollected))}</td></tr></tbody></table></div>
      <div class="panel"><h3>Top items</h3>${(d.top_items || []).length ? `<table class="dataTable"><tbody>${d.top_items.map((t, i) => `<tr><td>${i + 1}. ${esc(t.name)}</td><td class="r">${esc(t.qty)}</td><td class="r">${esc(money(t.revenue))}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No sales.</p>'}</div></div>
    <div class="panel mt20"><h3>Day by day</h3>${(d.daily || []).length ? `<table class="dataTable wide"><thead><tr><th>Date</th><th class="r">Orders</th><th class="r">Sales</th><th class="r">GST</th></tr></thead><tbody>${d.daily.map((x) => `<tr><td>${esc(x.date)}</td><td class="r">${esc(x.orders)}</td><td class="r">${esc(money(x.sales))}</td><td class="r">${esc(money(x.gst))}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No data for this range.</p>'}</div>`;
}
function presetRange(name) {
  const b = histBounds();
  const r = name === "yesterday" ? { from: addDays(b.max, -1), to: addDays(b.max, -1) } : name === "week" ? { from: b.min, to: b.max } : { from: b.max, to: b.max };
  $("#repFrom").value = r.from; $("#repTo").value = r.to;
}
async function exportData(kind) {
  const r = readRange();
  if (!r) return;
  let rows = null;
  if (!(await run(async () => { rows = await rpc("export_orders", { p_restaurant: S.rid, p_from: r.from, p_to: r.to }); }, { loader: "Preparing your file..." }))) return;
  if (!rows || !rows.length) { showToast("No orders in that date range.", "error"); return; }
  const base = `${R.slug}_${kind === "csv-items" ? "items" : "orders"}_${r.from}_to_${r.to}`;
  const orderRows = [["Business Date", "Order No", "Invoice No", "Date & Time", "Customer", "Table", "Items", "Subtotal", "Discount", "GST", "Total", "Status", "Payment Status", "Payment Mode", "Paid At", "Notes", "Cancel Reason"]]
    .concat(rows.map((o) => [o.business_date, o.order_no, o.invoice_no, fmtStamp(o.created_at), o.customer_name, o.table_number,
      (o.cart || []).map((i) => `${i.name} x${i.qty}`).join("; "), num(o.subtotal), num(o.discount), num(o.gst), num(o.total), o.status, o.payment_status,
      o.payment_mode || "", o.paid_at ? fmtStamp(o.paid_at) : "", o.notes || "", o.cancel_reason || ""]));
  const itemRows = [["Business Date", "Order No", "Table", "Item", "Qty", "Unit Price", "Line Total", "Order Status"]];
  rows.forEach((o) => (o.cart || []).forEach((i) => itemRows.push([o.business_date, o.order_no, o.table_number, i.name, num(i.qty), num(i.price), Math.round(num(i.price) * num(i.qty) * 100) / 100, o.status])));
  if (kind === "csv-orders") return Sheets.downloadCsv(orderRows, base + ".csv");
  if (kind === "csv-items") return Sheets.downloadCsv(itemRows, base + ".csv");
  const daily = new Map();
  rows.filter((o) => o.status !== "Cancelled").forEach((o) => {
    const d = daily.get(o.business_date) || { n: 0, sales: 0, gst: 0, disc: 0 };
    d.n++; d.sales += num(o.total); d.gst += num(o.gst); d.disc += num(o.discount); daily.set(o.business_date, d);
  });
  const round2 = (x) => Math.round(x * 100) / 100;
  const summary = [["Business Date", "Orders", "Sales", "GST", "Discount"]].concat([...daily.entries()].sort().map(([k, d]) => [k, d.n, round2(d.sales), round2(d.gst), round2(d.disc)]));
  Sheets.downloadXlsx([
    { name: "Orders", rows: orderRows, widths: [13, 17, 18, 20, 20, 8, 40, 11, 10, 10, 11, 11, 13, 13, 20, 30, 24], money: [7, 8, 9, 10] },
    { name: "Items", rows: itemRows, widths: [13, 17, 8, 30, 6, 11, 12, 13], money: [5, 6] },
    { name: "Daily summary", rows: summary, widths: [14, 9, 12, 11, 11], money: [2, 3, 4] }
  ], base + ".xlsx");
  showToast("Excel file downloaded", "success");
}

/* ---------------------------------------------------------------- settings page ---- */
const TIMEZONES = ["Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "Australia/Sydney", "UTC"];
function renderSettings() {
  const inp = (id, label, value, attrs) => `<label for="${id}">${label}</label><input id="${id}" value="${esc(value)}" ${attrs || ""}>`;
  const yn = (id, label, value, yes, no) => `<label for="${id}">${label}</label><select id="${id}"><option value="true"${value ? " selected" : ""}>${yes}</option><option value="false"${value ? "" : " selected"}>${no}</option></select>`;
  $("#settings").innerHTML = `<div class="sectionHeader"><h2>Settings</h2><button class="primaryButton" type="button" data-action="save-settings">Save settings</button></div>
    <div class="settingsGrid">
      <div class="settingCard"><h3>Restaurant</h3>${inp("sName", "Name", R.name, 'maxlength="80"')}${inp("sTagline", "Tagline", R.tagline, 'maxlength="120"')}${inp("sAddress", "Address", R.address, 'maxlength="300"')}${inp("sPhone", "Phone", R.phone, 'maxlength="20"')}${inp("sLogo", "Logo URL (https://)", R.logo, 'maxlength="500"')}</div>
      <div class="settingCard"><h3>Billing</h3>${inp("sGst", "GST % (0 for none)", num(R.gst), 'type="number" min="0" max="100" step="0.01"')}${inp("sGstin", "GSTIN (shows CGST/SGST split on bills)", R.gstin, 'maxlength="15"')}${inp("sCurrency", "Currency symbol", R.currency, 'maxlength="4"')}${inp("sUpi", "UPI ID", R.upi, 'maxlength="60"')}
        <label for="sPrinter">Bill printer paper</label><select id="sPrinter"><option value="58"${R.printer_width === 58 ? " selected" : ""}>58 mm</option><option value="80"${R.printer_width === 80 ? " selected" : ""}>80 mm</option></select></div>
      <div class="settingCard"><h3>Ordering</h3>${yn("sOrdering", "Accept orders from guests", R.ordering_enabled, "Yes - open", "No - paused")}${yn("sHappy", "Happy Hour offers", R.happy_hour_enabled, "Enabled", "Disabled")}${yn("sToken", "Guests must scan the table's QR code", R.require_table_token, "Yes (recommended)", "No - table number only")}${inp("sWhatsapp", "WhatsApp number (optional)", R.whatsapp, 'maxlength="15"')}${inp("sReview", "Google review link (optional)", R.review_link, 'maxlength="500"')}</div>
      <div class="settingCard"><h3>Guest Experience &amp; Banner</h3>
        ${inp("sAnnounce", "Live announcement banner (shown at top of menu)", R.announcement || "", 'maxlength="200" placeholder="e.g. Sufi Night tonight 9 PM - 11 PM"')}
        ${inp("sInsta", "Instagram profile URL (https://)", R.instagram_url || "", 'maxlength="300" placeholder="https://instagram.com/yourcafe"')}
        ${inp("sWifiName", "Restaurant Wi-Fi name (SSID)", R.wifi_name || "", 'maxlength="64"')}
        ${inp("sWifiPass", "Restaurant Wi-Fi password", R.wifi_password || "", 'maxlength="64"')}
        ${yn("sParty", "Show Book a Party (WhatsApp) button", R.party_booking_enabled !== false, "Enabled", "Hidden")}
        ${yn("sMasterQr", "Allow Master QR (manual table entry)", R.allow_master_qr !== false, "Enabled", "Disabled")}
      </div>
      <div class="settingCard"><h3>System</h3>${inp("sTz", "Timezone", R.timezone, 'list="tzList" maxlength="60"')}<datalist id="tzList">${TIMEZONES.map((t) => `<option value="${t}">`).join("")}</datalist>${inp("sDayStart", "Business day starts at (hour, 0-12)", R.day_start_hour, 'type="number" min="0" max="12" step="1"')}${inp("sRefresh", "Screen refresh safety-net (seconds, 5-300)", R.auto_refresh, 'type="number" min="5" max="300" step="1"')}</div>
      <div class="settingCard"><h3>Team</h3><div id="teamBox"><p class="muted">Loading...</p></div></div>
      <div class="settingCard"><h3>Security</h3><div id="mfaBox"><p class="muted">Loading...</p></div></div>
      <div class="settingCard"><h3>Data &amp; privacy</h3><p class="dlgText">Orders, guest names and notes are deleted automatically after <b>${RETENTION()} days</b>, together with the temporary guest accounts. Your menu, tables and settings are kept. Use <b>Reports</b> to download Excel or CSV files for the period you need.</p></div>
    </div>`;
}
async function saveSettings() {
  const n = (id) => Number($(id).value);
  const gst = n("#sGst"), refresh = n("#sRefresh"), dayStart = n("#sDayStart");
  if (!Number.isFinite(gst) || gst < 0 || gst > 100) return showToast("GST must be between 0 and 100.", "error");
  if (!Number.isInteger(refresh) || refresh < 5 || refresh > 300) return showToast("Refresh must be 5 to 300 seconds.", "error");
  if (!Number.isInteger(dayStart) || dayStart < 0 || dayStart > 12) return showToast("Business day start must be an hour from 0 to 12.", "error");
  const v = (id) => $(id).value.trim();
  const payload = {
    name: v("#sName"), tagline: v("#sTagline"), address: v("#sAddress"), phone: v("#sPhone"), logo: v("#sLogo"),
    gst, gstin: v("#sGstin"), currency: v("#sCurrency"), upi: v("#sUpi"), printer_width: Number($("#sPrinter").value),
    ordering_enabled: $("#sOrdering").value === "true", happy_hour_enabled: $("#sHappy").value === "true",
    require_table_token: $("#sToken").value === "true", whatsapp: v("#sWhatsapp"), review_link: v("#sReview"),
    announcement: v("#sAnnounce"), instagram_url: v("#sInsta"), wifi_name: v("#sWifiName"), wifi_password: v("#sWifiPass"),
    party_booking_enabled: $("#sParty").value === "true", allow_master_qr: $("#sMasterQr").value === "true",
    timezone: v("#sTz"), day_start_hour: dayStart, auto_refresh: refresh
  };
  const ok = await run(async () => {
    await rpc("save_settings", { p_restaurant: S.rid, p_settings: payload });
    R = await rpc("get_restaurant", { p_slug: R.slug });
  }, { loader: "Saving..." });
  if (ok) { $("#restaurantName").textContent = R.name; showToast("Settings saved", "success"); }
}

/* team ------------------------------------------------------------------------------- */
async function loadTeam() { S.team = await rpc("list_team", { p_restaurant: S.rid }); renderTeam(); }
function renderTeam() {
  const box = $("#teamBox");
  if (!box) return;
  box.innerHTML = `<table class="dataTable">${S.team.map((m) => `<tr><td>${esc(displayLogin(m.email))}<div class="muted small">${m.last_sign_in_at ? "Last sign-in " + esc(fmtDateTime(m.last_sign_in_at)) : "Never signed in"}</div></td>
    <td><select data-change="teamRole" data-email="${esc(m.email)}"${m.email === S.email ? " disabled" : ""}><option value="staff">Staff</option><option value="admin">Admin</option></select></td>
    <td class="r">${m.role === "staff" ? `<button class="secondaryButton small" type="button" data-action="team-reset" data-email="${esc(m.email)}">Reset password</button> ` : ""}${m.email !== S.email ? `<button class="deleteBtn small" type="button" data-action="team-remove" data-id="${esc(m.user_id)}" data-email="${esc(m.email)}">Remove</button>` : ""}</td></tr>`).join("")}</table>
    <button class="primaryButton mt10" type="button" data-action="team-add"><i class="fa-solid fa-user-plus"></i> Add staff login</button>`;
  $$('select[data-change="teamRole"]', box).forEach((sel, i) => { sel.value = S.team[i].role; });
}
function dashboardUrl() { const u = new URL("dashboard.html", location.href); u.search = ""; u.searchParams.set("restaurant", R.slug); return u.href; }
async function showCredentials(email, password) {
  const text = `${R.name} - staff login\nLink: ${dashboardUrl()}\nUsername / Email: ${displayLogin(email)}\nPassword: ${password}`;
  await Dialog.open({
    title: "Share these login details", wide: false,
    body: `<p class="dlgText">The password is shown only now. Share it privately and ask the person to keep it safe.</p><textarea class="dlgInput credBox" readonly>${esc(text)}</textarea>`,
    buttons: [{ id: "copy", label: "Copy", kind: "primaryButton" }, { id: "done", label: "Done" }],
    async onClick(id) { if (id === "copy") { showToast((await copyText(text)) ? "Copied" : "Could not copy", "info"); return { error: "" }; } }
  });
}
async function passwordDialog(title, emailValue, fixedEmail, action) {
  const pw = generatePassword(14); let done = null;
  await Dialog.open({
    title, wide: true,
    body: `<div class="formGrid"><div class="fullWidth"><label for="tEmail">Username (or Email)</label><input id="tEmail" type="text" autocomplete="off" placeholder="e.g. kitchen_staff1"${fixedEmail ? " readonly" : ""}></div>
      <div class="fullWidth"><label for="tPw">Password (at least 12 characters)</label><input id="tPw" autocomplete="off"></div></div>`,
    buttons: [{ id: "cancel", label: "Cancel" }, { id: "go", label: "Save", kind: "primaryButton" }],
    onOpen() { $("#tEmail").value = displayLogin(emailValue); $("#tPw").value = pw; },
    async onClick(btn) {
      if (btn !== "go") return;
      const raw = $("#tEmail").value.trim().toLowerCase(), password = $("#tPw").value;
      const email = loginToEmail(raw);
      if (!raw || raw.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Enter a valid username (min 3 chars) or email." };
      if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) return { error: "Password: at least 12 characters with letters and numbers." };
      try { await callManageUser({ action, restaurant_id: S.rid, email, password, role: "staff" }); }
      catch (e) { return { error: e.message }; }
      done = { email, password };
    }
  });
  return done;
}
async function addStaffLogin() {
  const r = await passwordDialog("Add staff login", "", false, "create_user");
  if (!r) return;
  await run(loadTeam);
  await showCredentials(r.email, r.password);
}
async function resetStaffPassword(email) {
  const r = await passwordDialog("Reset password", email, true, "reset_password");
  if (r) await showCredentials(r.email, r.password);
}
async function removeMember(userId, email) {
  if (!(await Dialog.confirm(`Remove ${email} from this restaurant? They will no longer be able to sign in here.`, { danger: true, confirmText: "Remove" }))) return;
  if (await run(async () => { await rpc("remove_team_member", { p_restaurant: S.rid, p_user_id: userId }); })) { showToast("Removed", "success"); await run(loadTeam); }
}
async function changeRole(email, role) {
  const ok = await run(async () => { await rpc("set_team_role", { p_restaurant: S.rid, p_email: email, p_role: role }); });
  if (ok) showToast("Role updated", "success");
  await run(loadTeam);
}

/* two-step verification ------------------------------------------------------------------ */
async function renderMfa() {
  const box = $("#mfaBox");
  if (!box) return;
  try {
    const f = await MfaTools.verifiedFactor();
    box.innerHTML = f
      ? `<p class="dlgText">Two-step verification is <b>ON</b> for your account.</p><button class="deleteBtn" type="button" data-action="mfa-disable" data-id="${esc(f.id)}">Turn off</button>`
      : `<p class="dlgText">Add a second lock: a 6-digit code from an authenticator app (Google Authenticator, Authy, Microsoft Authenticator).</p><button class="primaryButton" type="button" data-action="mfa-enable">Turn on two-step verification</button>`;
  } catch (_) { box.innerHTML = '<p class="muted">Not available.</p>'; }
}
async function enableMfa() {
  let info = null;
  if (!(await run(async () => { info = await MfaTools.beginEnroll(); }, { loader: "Preparing..." }))) return;
  await Dialog.open({
    title: "Turn on two-step verification",
    body: `<p class="dlgText">1. Scan this code with your authenticator app.</p><div class="qrBox">${QR.svg(info.uri, { border: 2 })}</div><p class="dlgText small">Or type this key into the app: <b>${esc(info.secret)}</b></p>
      <label class="dlgLabel" for="mfaCode">2. Enter the 6-digit code it shows</label><input id="mfaCode" class="dlgInput" inputmode="numeric" maxlength="6" autocomplete="one-time-code">`,
    buttons: [{ id: "no", label: "Cancel" }, { id: "ok", label: "Verify & turn on", kind: "primaryButton" }],
    async onClick(btn) {
      if (btn !== "ok") return;
      const code = $("#mfaCode").value.replace(/\s/g, "");
      if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code." };
      try { await MfaTools.confirmEnroll(info.id, code); } catch (_) { return { error: "That code is not valid. Check the time on your phone and try again." }; }
    }
  });
  await renderMfa();
}
async function disableMfa(factorId) {
  if (!(await Dialog.confirm("Turn off two-step verification? Your account will be less protected.", { danger: true, confirmText: "Turn off" }))) return;
  if (await run(async () => { await MfaTools.remove(factorId); })) showToast("Two-step verification turned off", "success");
  await renderMfa();
}

/* --------------------------------------------------------------- activity page ---- */
async function loadActivity() {
  const rows = await q(sb.from("activity_log").select("created_at,user_role,actor,action,details").eq("restaurant_id", S.rid).order("created_at", { ascending: false }).limit(150));
  const icon = (a) => /payment/i.test(a) ? "fa-money-bill-wave" : /order/i.test(a) ? "fa-receipt" : /menu|price|offer|availab/i.test(a) ? "fa-utensils" : /table|qr/i.test(a) ? "fa-chair" : /team|settings/i.test(a) ? "fa-gear" : "fa-clock";
  $("#activity").innerHTML = `<div class="sectionHeader"><h2>Activity log</h2><span class="muted">Last ${RETENTION()} days</span></div>` +
    ((rows || []).map((r) => `<div class="activityCard"><div class="activityLeft"><div class="activityIcon"><i class="fa-solid ${icon(r.action || "")}"></i></div>
      <div><b>${esc(r.action)}</b><div class="muted">${esc(r.details)}</div><div class="muted small">${esc(r.actor || "system")} &middot; ${esc(r.user_role || "")}</div></div></div><div class="activityTime">${esc(fmtDateTime(r.created_at))}</div></div>`).join("") || '<p class="muted">Nothing recorded yet.</p>');
}

/* ------------------------------------------------------------- menu item actions ---- */
async function toggleItem(id, to) {
  if (await run(async () => { await q(sb.from("menu").update({ available: to }).eq("id", id).eq("restaurant_id", S.rid)); await afterMenuChange(); })) showToast(to ? "Item is available" : "Item hidden from guests", "success");
}
async function deleteItem(id) {
  const m = S.menu.find((x) => x.id === id);
  if (!m || !(await Dialog.confirm(`Delete "${m.name}" permanently?`, { danger: true, confirmText: "Delete" }))) return;
  if (await run(async () => { await q(sb.from("menu").delete().eq("id", id).eq("restaurant_id", S.rid)); await afterMenuChange(); })) showToast("Item deleted", "success");
}

/* -------------------------------------------------------------------- navigation ---- */
const ADMIN_PAGES = ["dashboard", "menu", "reports", "settings", "activity"];
const TITLES = { dashboard: "Dashboard", orders: "Orders", history: "History", menu: "Menu", tables: "Tables", reports: "Reports", settings: "Settings", activity: "Activity" };
async function switchPage(page) {
  if (!isAdmin() && ADMIN_PAGES.includes(page)) page = "orders";
  S.page = page;
  $$(".navItem").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  $$(".page").forEach((p) => p.classList.toggle("active", p.id === page));
  $("#pageTitle").textContent = TITLES[page] || page;
  switch (page) {
    case "dashboard": await run(loadDashboard); break;
    case "orders": renderOrdersShell(); break;
    case "history": renderHistoryShell(); await run(loadHistory); break;
    case "tables": renderTablesShell(); break;
    case "menu": renderMenuShell(); await run(async () => { await loadMenu(); renderMenuCards(); }); break;
    case "reports": renderReportsShell(); break;
    case "settings": renderSettings(); run(loadTeam); renderMfa(); break;
    case "activity": await run(loadActivity); break;
    default: break;
  }
}

document.addEventListener("click", (ev) => {
  const nav = ev.target.closest(".navItem[data-page]");
  if (nav) { switchPage(nav.dataset.page); return; }
  const b = ev.target.closest("[data-action]");
  if (!b) return;
  if (b.tagName === "A") ev.preventDefault();
  unlockAudio();
  const a = b.dataset.action, id = b.dataset.id, table = b.dataset.table;
  switch (a) {
    case "logout": LoginUI.signOut(); break;
    case "sound": S.sound = !S.sound; localStorage.setItem("dgc:sound", S.sound ? "on" : "off"); updateSoundBtn(); if (S.sound) playChime(); break;
    case "refresh": refreshLive(); break;
    case "status": setStatus(id, b.dataset.status); break;
    case "cancel": setStatus(id, "Cancelled"); break;
    case "pay": collectPayment(id); break;
    case "bill": { const o = findOrder(id); if (o) printHtml(billHtml(consolidatedTableBill(o))); break; }
    case "kot": { const o = findOrder(id); if (o) printHtml(kotHtml(o)); break; }
    case "clear-table": S.orderTable = ""; renderBoard(); break;
    case "view-table": S.orderTable = table; S.orderQuery = ""; switchPage("orders"); break;
    case "release": releaseTable(table); break;
    case "table-add": addTable(); break;
    case "table-delete": deleteTable(table); break;
    case "table-qr": showTableQr(table); break;
    case "qr-master":
      run(async () => {
        const tok = await rpc("get_master_qr_token", { p_restaurant: S.rid });
        const u = new URL("index.html", location.href); u.search = "";
        u.searchParams.set("restaurant", R.slug); u.searchParams.set("m", tok);
        const card = `<div class="card"><div class="n">${esc(R.name)}</div><div class="t">Scan to Order</div>${QR.svg(u.href, { border: 2 })}<div class="s">Scan &amp; enter your table number</div></div>`;
        printHtml(docHtml("Master QR", `@page{margin:14mm}body{font-family:system-ui,sans-serif;margin:0;display:flex;justify-content:center}.card{width:95mm;border:2px solid #000;border-radius:10px;padding:10mm;text-align:center}.n{font-weight:700;font-size:18px}.t{font-size:24px;font-weight:700;margin:6px 0}.card svg{width:100%;height:auto;display:block;margin:8px auto}.s{font-size:14px}`, card));
      }, { loader: "Preparing Master QR..." });
      break;
    case "qr-sheet": printAllQr(); break;
    case "menu-add": editMenuItem(null); break;
    case "menu-edit": editMenuItem(id); break;
    case "menu-offer": editOffer(id); break;
    case "menu-toggle": toggleItem(id, b.dataset.to === "true"); break;
    case "menu-delete": deleteItem(id); break;
    case "menu-import": importMenuCsv(); break;
    case "menu-template": downloadMenuTemplate(); break;
    case "hist-prev": shiftHistory(-1); break;
    case "hist-next": shiftHistory(1); break;
    case "rep-preset": presetRange(b.dataset.preset); run(loadReport); break;
    case "rep-run": run(loadReport); break;
    case "export-xlsx": exportData("xlsx"); break;
    case "export-csv-orders": exportData("csv-orders"); break;
    case "export-csv-items": exportData("csv-items"); break;
    case "save-settings": saveSettings(); break;
    case "team-add": addStaffLogin(); break;
    case "team-reset": resetStaffPassword(b.dataset.email); break;
    case "team-remove": removeMember(id, b.dataset.email); break;
    case "mfa-enable": enableMfa(); break;
    case "mfa-disable": disableMfa(id); break;
    default: break;
  }
});
document.addEventListener("input", (ev) => {
  const t = ev.target;
  switch (t.dataset && t.dataset.input) {
    case "orderSearch": S.orderQuery = t.value; renderBoard(); break;
    case "tableSearch": renderTableCards(); break;
    case "menuSearch": S.menuQuery = t.value; renderMenuCards(); break;
    case "histSearch": S.histQuery = t.value; renderHistoryBody(); break;
    default: break;
  }
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  switch (t.dataset && t.dataset.change) {
    case "tableFilter": renderTableCards(); break;
    case "menuCat": S.menuCat = t.value; renderMenuCards(); break;
    case "menuFilter": S.menuFilter = t.value; renderMenuCards(); break;
    case "histDate": {
      const b = histBounds();
      if (t.value >= b.min && t.value <= b.max) { S.histDate = t.value; run(loadHistory); } else { t.value = S.histDate; }
      break;
    }
    case "teamRole": changeRole(t.dataset.email, t.value); break;
    default: break;
  }
});
function updateSoundBtn() { $("#soundBtn").innerHTML = S.sound ? '<i class="fa-solid fa-bell"></i>' : '<i class="fa-solid fa-bell-slash"></i>'; }
function updateClock() {
  try { $("#liveTime").textContent = new Date().toLocaleString("en-IN", { timeZone: tz(), weekday: "short", hour: "2-digit", minute: "2-digit", hour12: true }); }
  catch (_) { /* ignore */ }
}

/* ---------------------------------------------------------- realtime, polling, lock ---- */
function startRealtime() {
  try {
    S.rt = sb.channel("rest-" + S.rid)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "restaurant_id=eq." + S.rid }, () => refreshSoon())
      .on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: "restaurant_id=eq." + S.rid }, () => refreshSoon())
      .subscribe();
  } catch (_) { /* polling still works */ }
}
function schedulePoll() {
  clearTimeout(S.pollT);
  S.pollT = setTimeout(async () => { if (!document.hidden) await refreshLive(); schedulePoll(); }, Math.max(5, num(R.auto_refresh, 10)) * 1000);
}
function setupIdleLock() {
  const mins = num((CONFIG.DASHBOARD.IDLE_LOCK_MINUTES || {})[S.role], 0);
  if (mins <= 0) return;
  let t = null;
  const lock = () => { try { sessionStorage.setItem("dgc-locked", "1"); } catch (_) { /* ignore */ } LoginUI.signOut(); };
  const reset = () => { clearTimeout(t); t = setTimeout(lock, mins * 60000); };
  ["pointerdown", "keydown", "touchstart", "scroll"].forEach((e) => document.addEventListener(e, reset, { passive: true }));
  reset();
}

/* ------------------------------------------------------------------------- boot ---- */
async function authorize(session) {
  const role = await rpc("my_role", { p_restaurant: R.id });
  if (!role) return { ok: false, message: "This account does not have access to " + R.name + "." };
  if (!R.active && role !== "owner") return { ok: false, message: "This restaurant account is suspended. Please contact DigiConvo support." };
  S.rid = R.id; S.role = role; S.email = (session.user && session.user.email) || "";
  return { ok: true };
}
async function startApp() {
  S.started = true;
  $("#app").hidden = false;
  $("#restaurantName").textContent = R.name;
  $("#roleBadge").textContent = S.role === "owner" ? "Owner Assist" : (isAdmin() ? "Admin" : "Staff");
  $$(".adminOnly").forEach((el) => { el.hidden = !isAdmin(); });
  updateSoundBtn(); updateClock(); setInterval(updateClock, 1000);
  setupIdleLock();
  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT" && !S.expiring) location.reload(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshLive(); });
  window.addEventListener("online", () => refreshLive());
  await run(async () => { await Promise.all([loadOrders(), loadTables()]); });
  await switchPage(isAdmin() ? "dashboard" : "orders");
  startRealtime(); schedulePoll();
}
(async function main() {
  const isAssist = new URLSearchParams(location.search).get("assist") === "1";
  initClient(isAssist ? "owner" : "staff");
  if (!sb) { renderFatal("This app has not been set up yet. Set the Supabase URL and key in config.js."); return; }
  if (!currentSlug()) { renderFatal("Open the dashboard from the link DigiConvo gave you: dashboard.html?restaurant=your-restaurant"); return; }
  if (!(await bootRestaurant())) return;
  document.title = R.name + " - Dashboard";
  $("#loginTitle").textContent = isAssist ? (R.name + " (Owner Assist)") : R.name;
  await LoginUI.init({ requireMfa: isAssist, authorize, onReady: startApp });
  try {
    if (sessionStorage.getItem("dgc-locked")) { sessionStorage.removeItem("dgc-locked"); $("#loginError").textContent = "You were signed out after a period of inactivity."; }
  } catch (_) { /* ignore */ }
})();
