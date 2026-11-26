"use strict";
/* =============================================================================
   DIGICONVO QR ORDERING v8.0 - SHARED CORE (common.js)
   - Zero-MAU Signed Guest Sessions (no Supabase auth.users bloat)
   - Menu Version Caching & Idempotency Keys (minimal egress)
   - Full Indian GST + FSSAI Thermal/A4 Bill Builder + Dynamic Exact-Amount UPI QR
   - 1-Tap WhatsApp Digital GST Bill + Smart Review Link
   - Multi-Sheet GSTR-1 CA Excel Export (via xlsx.js)
   ============================================================================= */

let sb = null;
let R = null; // Active restaurant metadata

function initClient(mode = "guest") {
  if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase SDK missing.");
  const persist = mode !== "guest";
  sb = window.supabase.createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.ANON_KEY, {
    auth: { persistSession: persist, autoRefreshToken: persist, detectSessionInUrl: false }
  });
  initOfflineBanner();
  return sb;
}

function getQueryParam(k) {
  return new URLSearchParams(window.location.search).get(k) || "";
}

function getRestaurantSlug() {
  return (getQueryParam("restaurant") || getQueryParam("r") || getQueryParam("c") || "").trim().toLowerCase();
}

function escapeHTML(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeJsAttr(str) {
  return String(str ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, " ");
}

function money(val) {
  const cur = (R && R.currency) || "₹";
  return `${cur}${Number(val || 0).toFixed(2).replace(/\.00$/, "")}`;
}

function formatDateTimeIST(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }); }
  catch (_) { return String(iso); }
}

function makeRequestId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

function showToast(msg, type = "info") {
  let box = document.getElementById("dcToastBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "dcToastBox";
    box.style.cssText = "position:fixed;bottom:18px;right:18px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:340px;";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  const bg = type === "error" ? "#dc2626" : type === "success" ? "#059669" : "#0f172a";
  el.style.cssText = `background:${bg};color:#fff;padding:10px 14px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 10px 24px rgba(0,0,0,0.22);`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function initOfflineBanner() {
  if (document.getElementById("dcOfflineBar")) return;
  const bar = document.createElement("div");
  bar.id = "dcOfflineBar";
  bar.style.cssText = "display:none;position:fixed;top:0;left:0;right:0;z-index:99998;background:#dc2626;color:#fff;text-align:center;padding:7px 12px;font-size:12.5px;font-weight:700;";
  bar.textContent = "Internet connection lost — Reconnecting automatically...";
  document.body.prepend(bar);
  const sync = () => { bar.style.display = navigator.onLine ? "none" : "block"; };
  window.addEventListener("online", () => { sync(); showToast("Back online!", "success"); });
  window.addEventListener("offline", sync);
  sync();
}

const THEME_MAP = {
  gold: { accent: "#d97706", dark: "#92400e" },
  emerald: { accent: "#059669", dark: "#065f46" },
  crimson: { accent: "#dc2626", dark: "#991b1b" },
  ocean: { accent: "#0284c7", dark: "#075985" },
  royal: { accent: "#7c3aed", dark: "#5b21b6" }
};
function applyThemePreset(key) {
  const t = THEME_MAP[key] || THEME_MAP.gold;
  document.documentElement.style.setProperty("--accent", t.accent);
  document.documentElement.style.setProperty("--accent-dark", t.dark);
}

async function bootRestaurant() {
  const slug = getRestaurantSlug();
  if (!slug) { showToast("Missing ?restaurant=slug in URL.", "error"); return false; }
  const { data, error } = await sb.rpc("get_restaurant", { p_slug: slug });
  if (error || !data || data.error) { showToast((data && data.error) || (error && error.message) || "Restaurant not found.", "error"); return false; }
  R = data;
  applyThemePreset(R.theme_color || "gold");
  return true;
}

// Zero-MAU Guest Session helpers (stored in localStorage, 0 auth.users rows created!)
function guestKey(suffix) { return `dc_v8_${R ? R.slug : "x"}_${suffix}`; }
function getGuestToken() { return localStorage.getItem(guestKey("gtok")) || ""; }
function getGuestMeta() {
  try { return JSON.parse(localStorage.getItem(guestKey("gmeta")) || "{}"); } catch (_) { return {}; }
}
function setGuestMeta(meta) { localStorage.setItem(guestKey("gmeta"), JSON.stringify(meta || {})); }

async function ensureGuestSession(table, tableToken, name, phone, orderType = "dine_in") {
  const existing = getGuestToken();
  const prev = getGuestMeta();
  if (existing && prev.table === table && (!phone || prev.phone === phone)) {
    return { success: true, guest_token: existing, loyalty_points: prev.loyalty_points || 0 };
  }
  const { data, error } = await sb.rpc("start_guest_session", {
    p_restaurant: R.id, p_table: table || "", p_table_token: tableToken || "", p_name: name || "", p_phone: phone || ""
  });
  if (error || !data || !data.success) return { success: false, message: (data && data.message) || (error && error.message) || "Could not start session." };
  localStorage.setItem(guestKey("gtok"), data.guest_token);
  setGuestMeta({ table, tableToken, name, phone, orderType, loyalty_points: data.loyalty_points || 0 });
  return data;
}

// Version-cached Menu Fetch (saves Supabase egress!)
async function getMenuCached(force = false) {
  const cacheKey = guestKey("menu_cache");
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch (_) {}
  const knownVer = (!force && cached && cached.menu_version) ? cached.menu_version : null;
  const { data, error } = await sb.rpc("get_menu", { p_restaurant: R.id, p_known_version: knownVer });
  if (error || !data) return (cached && cached.items) || [];
  if (data.unchanged && cached) return cached.items || [];
  const payload = { menu_version: data.menu_version, items: data.items || [] };
  try { localStorage.setItem(cacheKey, JSON.stringify(payload)); } catch (_) {}
  return payload.items;
}

// Local Cart helpers
function getCart() {
  try { return JSON.parse(localStorage.getItem(guestKey("cart")) || "[]"); } catch (_) { return []; }
}
function saveCart(items) { localStorage.setItem(guestKey("cart"), JSON.stringify(items || [])); }
function clearCart() { localStorage.removeItem(guestKey("cart")); }

// Dynamic Exact-Amount UPI URI & QR (uses local qr.js when loaded, else QR image fallback)
function buildUpiUri(upiId, name, amount, note) {
  if (!upiId) return "";
  const pa = encodeURIComponent(upiId.trim());
  const pn = encodeURIComponent((name || "Restaurant").slice(0, 40));
  const am = Number(amount || 0).toFixed(2);
  const tn = encodeURIComponent((note || "Restaurant Bill").slice(0, 50));
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}

// Full Indian GST + FSSAI Thermal/A4 Bill HTML Builder (Rule 46 CGST + SAC 996331 + Dynamic UPI QR)
function buildGstBillHtml(order, rest, isProvisional = false) {
  const regime = order.tax_regime_snapshot || rest.tax_regime || "regular_5";
  const title = isProvisional || !order.invoice_no
    ? "PROVISIONAL BILL (NOT A TAX INVOICE)"
    : regime === "composition" ? "BILL OF SUPPLY (COMPOSITION TAXABLE PERSON)"
    : regime === "unregistered" ? "CASH MEMO / BILL"
    : "TAX INVOICE";

  const items = Array.isArray(order.cart) ? order.cart : [];
  const upiUri = (rest.upi_id && Number(order.total || 0) > 0 && !order.is_nc)
    ? buildUpiUri(rest.upi_id, rest.name, order.total, order.invoice_no || order.order_no)
    : "";
  const qrImg = upiUri ? `<div style="text-align:center;margin-top:10px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiUri)}" width="130" height="130" alt="Scan to Pay UPI"><div style="font-size:10px;font-weight:700;">Scan & Pay Exact ${money(order.total)} via UPI</div></div>` : "";

  return `<div style="font-family:monospace;font-size:12px;max-width:${rest.printer_width === 58 ? "56mm" : "76mm"};margin:0 auto;color:#000;">
    <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
      <div style="font-size:15px;font-weight:900;">${escapeHTML(rest.name || "Restaurant")}</div>
      ${rest.address ? `<div style="font-size:10.5px;">${escapeHTML(rest.address)}</div>` : ""}
      ${rest.phone ? `<div style="font-size:10.5px;">Ph: ${escapeHTML(rest.phone)}</div>` : ""}
      ${rest.gstin ? `<div style="font-size:10.5px;font-weight:700;">GSTIN: ${escapeHTML(rest.gstin)}</div>` : ""}
      ${rest.fssai_no ? `<div style="font-size:10.5px;">FSSAI Lic: ${escapeHTML(rest.fssai_no)}</div>` : ""}
      ${rest.state_code ? `<div style="font-size:10px;">Place of Supply: ${escapeHTML(rest.state_code)}</div>` : ""}
      <div style="font-size:11px;font-weight:900;margin-top:4px;border-top:1px dashed #000;padding-top:4px;">${title}</div>
      ${regime === "composition" ? `<div style="font-size:9.5px;">Composition taxable person, not eligible to collect tax on supplies.</div>` : ""}
    </div>
    <div style="font-size:11px;margin-bottom:6px;">
      <div><strong>${order.invoice_no ? "Invoice:" : "Order:"}</strong> ${escapeHTML(order.invoice_no || order.order_no)} | <strong>${escapeHTML(order.order_type === "dine_in" ? "Table " + order.table_number : order.order_type.toUpperCase())}</strong></div>
      <div><strong>Date:</strong> ${escapeHTML(formatDateTimeIST(order.paid_at || order.created_at))}</div>
      <div><strong>Guest:</strong> ${escapeHTML(order.customer_name || "Guest")}${order.customer_phone ? " (" + escapeHTML(order.customer_phone) + ")" : ""}</div>
      ${order.customer_gstin ? `<div><strong>Buyer GSTIN:</strong> ${escapeHTML(order.customer_gstin)} ${escapeHTML(order.customer_legal_name || "")}</div>` : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;border-top:1px dashed #000;border-bottom:1px dashed #000;">
      <thead><tr><th style="text-align:left;padding:3px 0;">Item (SAC 996331)</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Amt</th></tr></thead>
      <tbody>
        ${items.map((it) => `<tr><td style="padding:2px 0;">${escapeHTML(it.name)}${it.portion === "half" ? " (H)" : ""}${Array.isArray(it.addons) && it.addons.length ? "<br><small>+ " + escapeHTML(it.addons.join(", ")) + "</small>" : ""}${it.modifier ? "<br><small>[" + escapeHTML(it.modifier) + "]</small>" : ""}</td><td style="text-align:center;">${it.qty}</td><td style="text-align:right;">${Number(it.line_total || 0).toFixed(2)}</td></tr>`).join("")}
      </tbody>
    </table>
    <div style="margin-top:6px;font-size:11.5px;">
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${Number(order.subtotal || 0).toFixed(2)}</span></div>
      ${Number(order.discount || 0) > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Coupon (${escapeHTML(order.coupon_code)})</span><span>-${Number(order.discount).toFixed(2)}</span></div>` : ""}
      ${Number(order.loyalty_discount || 0) > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Loyalty (${order.loyalty_points_used} pts)</span><span>-${Number(order.loyalty_discount).toFixed(2)}</span></div>` : ""}
      ${Number(order.packaging_charge || 0) > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Packaging</span><span>${Number(order.packaging_charge).toFixed(2)}</span></div>` : ""}
      ${Number(order.service_charge || 0) > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Service Charge (Optional)</span><span>${Number(order.service_charge).toFixed(2)}</span></div>` : ""}
      ${Number(order.cgst || 0) > 0 ? `<div style="display:flex;justify-content:space-between;"><span>CGST</span><span>${Number(order.cgst).toFixed(2)}</span></div>` : ""}
      ${Number(order.sgst || 0) > 0 ? `<div style="display:flex;justify-content:space-between;"><span>SGST</span><span>${Number(order.sgst).toFixed(2)}</span></div>` : ""}
      ${Number(order.round_off || 0) !== 0 ? `<div style="display:flex;justify-content:space-between;"><span>Round Off</span><span>${Number(order.round_off).toFixed(2)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;border-top:1px dashed #000;margin-top:4px;padding-top:4px;"><span>GRAND TOTAL</span><span>${order.is_nc ? "₹0 (NC)" : money(order.total)}</span></div>
      ${order.payment_status === "Paid" ? `<div style="font-size:10.5px;margin-top:2px;">Paid via: <strong>${escapeHTML(order.payment_mode || "Cash")}</strong></div>` : ""}
      ${order.is_nc ? `<div style="font-size:10.5px;margin-top:2px;">Complimentary (NC): ${escapeHTML(order.nc_reason || "")}</div>` : ""}
    </div>
    ${qrImg}
    <div style="text-align:center;font-size:10px;border-top:1px dashed #000;margin-top:8px;padding-top:5px;">${escapeHTML(rest.bill_footer_note || "Thank you for dining with us!")}</div>
  </div>`;
}

function printHtmlDocument(title, bodyHtml) {
  const w = window.open("", "_blank", "width=420,height=740");
  if (!w) { showToast("Allow pop-ups to print bill.", "error"); return; }
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHTML(title)}</title></head><body style="margin:6px;">${bodyHtml}<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>`);
  w.document.close();
}

function sendWhatsAppGstBill(order, rest) {
  const phone = String(order.customer_phone || "").replace(/[^0-9]/g, "");
  const num = phone.length === 10 ? "91" + phone : phone;
  if (num.length < 10) { showToast("Valid 10-digit customer phone required.", "error"); return; }
  const items = (order.cart || []).map((i) => `• ${i.name} x${i.qty} = ₹${Number(i.line_total || 0).toFixed(0)}`).join("\n");
  const msg = `*${rest.name}*\n${order.invoice_no ? "Tax Invoice: " + order.invoice_no : "Order: " + order.order_no}\n${rest.gstin ? "GSTIN: " + rest.gstin + "\n" : ""}${rest.fssai_no ? "FSSAI: " + rest.fssai_no + "\n" : ""}\n${items}\n\nTaxable: ₹${Number(order.taxable_value || 0).toFixed(2)}\nCGST: ₹${Number(order.cgst || 0).toFixed(2)} | SGST: ₹${Number(order.sgst || 0).toFixed(2)}\n*Grand Total: ₹${Number(order.total || 0).toFixed(2)}* (${order.payment_status})\n${rest.review_link ? "\nLoved our food? Rate us: " + rest.review_link : "\nThank you for dining with us!"}`;
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
}

// Multi-Sheet GSTR-1 CA Excel Export (B2CS + B2B + SAC Summary + Full Invoice Register)
function exportGstr1Excel(report, restName) {
  const invoices = report.invoices || [];
  const b2b = invoices.filter((i) => i.customer_gstin && i.customer_gstin.length >= 15 && !i.is_nc);
  const b2cs = invoices.filter((i) => (!i.customer_gstin || i.customer_gstin.length < 15) && !i.is_nc);
  const ncRows = invoices.filter((i) => i.is_nc);

  const sheets = [
    {
      name: "SAC_Summary",
      rows: [
        ["Regime", "SAC Code", "Invoice Count", "Taxable Value", "CGST", "SGST", "IGST", "Total Value"],
        ...(report.sac_summary || []).map((s) => [s.regime, s.sac_code, s.invoice_count, s.taxable_value, s.cgst, s.sgst, s.igst, s.total_value])
      ]
    },
    {
      name: "B2B_Invoices",
      rows: [
        ["Branch", "Branch GSTIN", "Invoice No", "Date", "Buyer GSTIN", "Buyer Name", "Place of Supply", "Taxable Value", "CGST", "SGST", "Total"],
        ...b2b.map((i) => [i.branch_name, i.branch_gstin, i.invoice_no, i.business_date, i.customer_gstin, i.customer_legal_name || i.customer_name, i.state_code, i.taxable_value, i.cgst, i.sgst, i.total])
      ]
    },
    {
      name: "B2CS_Invoices",
      rows: [
        ["Branch", "Invoice No", "Date", "Type", "Guest", "Phone", "Subtotal", "Discount", "Packaging", "Service Chg", "Taxable", "CGST", "SGST", "Round Off", "Total", "Mode"],
        ...b2cs.map((i) => [i.branch_name, i.invoice_no, i.business_date, i.order_type, i.customer_name, i.customer_phone, i.subtotal, i.total_discount, i.packaging_charge, i.service_charge, i.taxable_value, i.cgst, i.sgst, i.round_off, i.total, i.payment_mode])
      ]
    },
    {
      name: "Daily_Rollup",
      rows: [
        ["Branch", "Date", "Orders", "Cancelled", "NC", "Taxable", "CGST", "SGST", "Net Revenue", "Cash", "UPI", "Card", "Dine-In", "Takeaway"],
        ...(report.daily_summary || []).map((d) => [d.branch_name, d.business_date, d.orders_count, d.cancelled_count, d.nc_count, d.taxable_value, d.cgst, d.sgst, d.net_revenue, d.cash_total, d.upi_total, d.card_total, d.dine_in_total, d.takeaway_total])
      ]
    },
    {
      name: "NC_Complimentary",
      rows: [
        ["Branch", "Invoice No", "Date", "Guest", "Subtotal", "NC Reason"],
        ...ncRows.map((i) => [i.branch_name, i.invoice_no, i.business_date, i.customer_name, i.subtotal, i.nc_reason])
      ]
    }
  ];

  // Fallback CSV if xlsx.js exportWorkbook isn't present
  if (typeof window.downloadXlsx === "function") {
    window.downloadXlsx(`GSTR1_${restName}_${report.from}_to_${report.to}.xlsx`, sheets);
  } else {
    const csv = sheets[2].rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `GSTR1_${restName}_${report.from}_to_${report.to}.csv`;
    a.click();
  }
}


// Cloudflare Turnstile helper for Supabase Auth Attack Protection
let _tsLoadProm = null;
function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (_tsLoadProm) return _tsLoadProm;
  _tsLoadProm = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile failed to load."));
    document.head.appendChild(s);
  });
  return _tsLoadProm;
}

async function mountAuthTurnstile(containerId, stateObj) {
  const key = CONFIG && CONFIG.TURNSTILE_SITE_KEY;
  const box = document.getElementById(containerId);
  if (!key || !box) return;
  box.classList.remove("hidden");
  stateObj.captchaToken = "";
  await loadTurnstileScript();
  if (stateObj.tsWidgetId != null && window.turnstile) {
    window.turnstile.reset(stateObj.tsWidgetId);
  } else if (window.turnstile) {
    stateObj.tsWidgetId = window.turnstile.render("#" + containerId, {
      sitekey: key,
      callback: (tok) => { stateObj.captchaToken = tok; },
      "expired-callback": () => { stateObj.captchaToken = ""; },
      "error-callback": () => { stateObj.captchaToken = ""; }
    });
  }
}
