"use strict";
/* =============================================================================
   common.js - shared by every page.  NO secrets, NO business rules: prices, totals, invoice
   numbers and permissions are all decided by the database. This file only talks to it safely.
   ============================================================================= */

/* ---- clickjacking guard (the _headers file adds the real header; this is the fallback) ---- */
if (window.top !== window.self) {
  try { document.documentElement.style.display = "none"; window.top.location = window.self.location; } catch (_) { /* blocked */ }
}

/* ---------------------------------------------------------------- tiny helpers ---- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
function esc(value) {
  return String(value === null || value === undefined ? "" : value).replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
}
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}
function toPaise(v) { return Math.round(num(v) * 100); }
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const TABLE_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/;

/* only https image / link URLs are ever used */
function safeUrl(u) {
  try {
    const x = new URL(String(u || "").trim(), location.href);
    return x.protocol === "https:" ? x.href : "";
  } catch (_) { return ""; }
}
/* normalize common shared photo hosts (e.g. Google Drive view links) to direct https image URLs */
function safeImageUrl(u) {
  const s = safeUrl(u);
  if (!s) return "";
  try {
    const x = new URL(s);
    if (/^drive\.google\.com$/i.test(x.hostname)) {
      const m = x.pathname.match(/\/file\/d\/([^/]+)/) || x.search.match(/[?&]id=([^&]+)/);
      if (m && m[1]) return `https://lh3.googleusercontent.com/d/${encodeURIComponent(m[1])}=w600`;
    }
    if (/^www\.dropbox\.com$/i.test(x.hostname)) {
      x.searchParams.set("raw", "1");
      return x.href;
    }
  } catch (_) {}
  return s;
}
/* retry transient remote image failures once before falling back to DEFAULT_IMAGE */
function attachImageFallback(container) {
  if (!container || container._dgcImgFallback) return;
  container._dgcImgFallback = true;
  container.addEventListener("error", (ev) => {
    const img = ev.target;
    if (!img || img.tagName !== "IMG") return;
    const raw = img.getAttribute("src") || "";
    if (!raw || raw.startsWith("data:")) return;
    const tries = Number(img.dataset.imgRetry || 0);
    if (tries < 1) {
      img.dataset.imgRetry = "1";
      const sep = raw.includes("?") ? "&" : "?";
      setTimeout(() => {
        if (!img.isConnected) return;
        img.src = raw.replace(/[?&]_dgc_r=\d+/g, "") + sep + "_dgc_r=" + Date.now();
      }, 650);
    } else {
      img.src = DEFAULT_IMAGE;
    }
  }, true);
}
function normalizeWhatsApp(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;       // bare Indian mobile number
  return d.length >= 11 && d.length <= 15 ? d : "";
}
const STAFF_EMAIL_DOMAIN = "@staff.digiconvo.in";
function loginToEmail(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("@")) return s;
  return s.replace(/[^a-z0-9._-]/g, "") + STAFF_EMAIL_DOMAIN;
}
function displayLogin(email) {
  const s = String(email || "").trim().toLowerCase();
  return s.endsWith(STAFF_EMAIL_DOMAIN) ? s.slice(0, -STAFF_EMAIL_DOMAIN.length) : s;
}

const DEFAULT_IMAGE = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#1b2440"/>' +
  '<text x="100" y="118" font-size="64" text-anchor="middle" fill="#c5a880">&#127869;</text></svg>');

/* ------------------------------------------------------- restaurant & formatting ---- */
let R = null;                      // public info of the current restaurant (from get_restaurant)

function currentSlug() {
  const s = String(new URLSearchParams(location.search).get("restaurant") || "").trim().toLowerCase();
  return SLUG_RE.test(s) ? s : "";
}
function money(v) {
  const cur = R && R.currency ? R.currency : "₹";
  return cur + num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function tz() { return (R && R.timezone) || "Asia/Kolkata"; }
function fmtDateTime(ts) {
  try {
    return new Date(ts).toLocaleString("en-IN", { timeZone: tz(), day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch (_) { return String(ts || ""); }
}
function fmtTime(ts) {
  try { return new Date(ts).toLocaleTimeString("en-IN", { timeZone: tz(), hour: "2-digit", minute: "2-digit", hour12: true }); }
  catch (_) { return ""; }
}
function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60);
  return h < 24 ? h + " hr ago" : Math.floor(h / 24) + " d ago";
}
/* business date "now" in the restaurant's timezone (same rule as the database) */
function businessDateNow() {
  const shift = ((R && R.day_start_hour) || 0) * 3600 * 1000;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz(), year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(Date.now() - shift));
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
function isValidGstin(raw) {
  const s = String(raw || "").trim().toUpperCase();
  return !s || GSTIN_RE.test(s);
}
function effectiveGstRate(itemRate, taxRegime, defaultGst) {
  if (taxRegime === "composition" || taxRegime === "unregistered") return 0;
  const hasItem = itemRate !== null && itemRate !== undefined && itemRate !== "";
  if (taxRegime === "specified_18") {
    return (!hasItem || num(itemRate) === 5) ? 18 : num(itemRate);
  }
  return hasItem ? num(itemRate) : num(defaultGst, 5);
}
function gstSlabRows(o, taxRegime, defaultGst) {
  const gstTotal = num(o.gst), pkg = num(o.packaging_charge), svc = num(o.service_charge);
  if (gstTotal <= 0 || o.is_nc || taxRegime === "composition" || taxRegime === "unregistered") return [];
  const items = Array.isArray(o.cart) ? o.cart : [];
  const defRate = taxRegime === "specified_18" ? 18 : num(defaultGst, 5);
  const netItems = Math.max(0, num(o.subtotal) - num(o.discount));
  const afterDisc = Math.max(0, netItems - num(o.coupon_discount) - num(o.loyalty_discount) - num(o.manual_discount));
  const ratio = netItems > 0 ? afterDisc / netItems : 1;
  const buckets = new Map();
  let rawGst = 0;
  items.forEach((i) => {
    const rate = effectiveGstRate(i.gst_rate, taxRegime, defRate);
    const qty = num(i.qty ?? i.quantity, 1);
    const val = Math.max(0, num(i.price) * qty * ratio);
    const cur = buckets.get(rate) || { rate, taxable: 0, tax: 0 };
    const lineTax = val * (rate / 100);
    cur.taxable += val; cur.tax += lineTax; rawGst += lineTax;
    buckets.set(rate, cur);
  });
  if (pkg + svc > 0) {
    const cur = buckets.get(defRate) || { rate: defRate, taxable: 0, tax: 0 };
    const chTax = (pkg + svc) * (defRate / 100);
    cur.taxable += (pkg + svc); cur.tax += chTax; rawGst += chTax;
    buckets.set(defRate, cur);
  }
  const active = Array.from(buckets.values()).filter((b) => b.rate > 0 && b.taxable > 0).sort((a, b) => a.rate - b.rate);
  if (!active.length || rawGst <= 0) return [];
  const scale = gstTotal / rawGst;
  return active.map((b) => {
    const tax = Math.round(b.tax * scale * 100) / 100;
    const cgst = Math.floor(tax * 100 / 2) / 100;
    const sgst = Math.round((tax - cgst) * 100) / 100;
    return { rate: b.rate, taxable: Math.round(b.taxable * 100) / 100, cgst, sgst, tax };
  });
}

/* order totals for DISPLAY only (the database recomputes everything when the order is placed) */
function calcTotals(lines, gstPct, opts) {
  opts = opts || {};
  let subP = 0, discP = 0, qtyTotal = 0;
  for (const l of lines) {
    const q = num(l.qty);
    qtyTotal += q;
    subP += toPaise(l.base) * q;
    discP += (toPaise(l.base) - toPaise(l.price)) * q;
  }
  const netP = Math.max(0, subP - discP);
  const cpP = Math.min(netP, Math.max(0, toPaise(opts.couponDiscount || 0)));
  const loyP = Math.min(Math.max(0, netP - cpP), Math.max(0, toPaise(opts.loyaltyDiscount || 0)));
  const manP = Math.min(Math.max(0, netP - cpP - loyP), Math.max(0, toPaise(opts.manualDiscount || 0)));
  const afterDiscP = Math.max(0, netP - cpP - loyP - manP);

  let pkgP = 0, svcP = 0;
  const otype = opts.orderType || "dine_in";
  if (otype !== "dine_in") {
    if (opts.pkgType === "flat") pkgP = Math.max(0, toPaise(opts.pkgAmt || 0));
    else if (opts.pkgType === "per_item") pkgP = Math.max(0, toPaise(opts.pkgAmt || 0) * Math.max(qtyTotal, 1));
  } else if (num(opts.svcPct) > 0) {
    svcP = Math.round(afterDiscP * num(opts.svcPct) / 100);
  }

  const taxableP = Math.max(0, afterDiscP + pkgP + svcP);
  const isExempt = opts.taxRegime === "composition" || opts.taxRegime === "unregistered";
  let gstP = 0;
  if (!isExempt) {
    const ratio = netP > 0 ? afterDiscP / netP : 1;
    let itemsGstP = 0;
    for (const l of lines) {
      const rate = effectiveGstRate(l.gstRate, opts.taxRegime, gstPct);
      itemsGstP += toPaise(l.price) * num(l.qty) * ratio * rate / 100;
    }
    const chRate = opts.taxRegime === "specified_18" ? 18 : num(gstPct);
    const chargesGstP = (pkgP + svcP) * chRate / 100;
    gstP = Math.round(itemsGstP + chargesGstP);
  }
  const exactP = taxableP + gstP;
  const totalP = Math.round(exactP / 100) * 100;
  const roP = totalP - exactP;
  return {
    subtotal: subP / 100,
    discount: discP / 100,
    couponDiscount: cpP / 100,
    loyaltyDiscount: loyP / 100,
    manualDiscount: manP / 100,
    packaging: pkgP / 100,
    serviceCharge: svcP / 100,
    taxable: taxableP / 100,
    gst: gstP / 100,
    roundOff: roP / 100,
    total: totalP / 100
  };
}

/* ------------------------------------------------------------------- errors / toast ---- */
class AppError extends Error {
  constructor(message, code, raw) { super(message); this.name = "AppError"; this.code = code || ""; this.raw = raw || null; }
}
function friendlyError(err, fallback) {
  fallback = fallback || "Something went wrong. Please try again.";
  if (!err) return fallback;
  const code = String(err.code || ""), msg = String(err.message || "");
  if (code === "P0001") return msg;                                       // our own validation messages
  if (code === "42501" || code === "PGRST301" || /jwt|not authori[sz]ed/i.test(msg)) return "You are not signed in or not allowed to do this. Please sign in again.";
  if (err.status === 429 || /rate limit|too many requests/i.test(msg)) return "Too many requests. Please wait a minute and try again.";
  if (code === "23505") return "That already exists.";
  if (code === "23514") return "One of the values is not allowed. Please check the form.";
  if (code === "23503") return "This is still in use and cannot be removed.";
  if (code === "23502") return "A required field is missing (" + (msg.split('"')[1] || "check inputs") + ").";
  if (code === "22P02") return "Please enter a valid number, date, or ID.";
  if (/^(PGRST202|PGRST204|42703|42883|42P01|42803)$/.test(code)) {
    return "Database schema mismatch (" + code + "). Please re-run sql/01_master_v8_schema.sql in Supabase SQL Editor.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg) || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return "No internet connection. Please check your network and try again.";
  }
  return fallback;
}
function showToast(text, kind, ms) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = text;
  t.className = "show " + (kind || "info");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { t.className = ""; }, ms || 3500);
}

/* ---------------------------------------------------------------------- Supabase ---- */
let sb = null;
function initClient(area) {
  const url = String(CONFIG.SUPABASE.URL || "").trim().replace(/\/+$/, ""), key = CONFIG.SUPABASE.ANON_KEY;
  if (!window.supabase || !/^https:\/\/[^\s/]+$/.test(url) || !key || /YOUR/i.test(url + key)) { sb = null; return null; }
  sb = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "dgc-auth-" + area },
    realtime: { params: { eventsPerSecond: 5 } }
  });
  return sb;
}
async function rpc(fn, args) {
  if (!sb) throw new AppError("The app is not configured yet (Supabase URL / key missing in config.js).", "CONFIG");
  let res;
  try { res = await sb.rpc(fn, args || {}); }
  catch (e) { throw new AppError(friendlyError(e), "NETWORK", e); }
  if (res.error) throw new AppError(friendlyError(res.error), res.error.code || "", res.error);
  return res.data;
}
async function getSession() {
  if (!sb) return null;
  try { const { data, error } = await sb.auth.getSession(); return error ? null : data.session; }
  catch (_) { return null; }
}
const isAnonymous = (session) => !!(session && session.user && session.user.is_anonymous);

/* a friendly full-page message (restaurant missing, setup incomplete ...) */
function renderFatal(message) {
  document.body.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "fatal";
  const h = document.createElement("h2"); h.textContent = "Sorry!";
  const p = document.createElement("p"); p.textContent = message;
  wrap.append(h, p);
  document.body.appendChild(wrap);
}
async function bootRestaurant() {
  if (!sb) { renderFatal("This app has not been set up yet. Please contact the restaurant."); return null; }
  const slug = currentSlug();
  if (!slug) { renderFatal("This link is incomplete. Please scan the QR code on your table again."); return null; }
  try { R = await rpc("get_restaurant", { p_slug: slug }); }
  catch (e) { renderFatal(e.message); return null; }
  if (!R) { renderFatal("We could not find this restaurant. Please scan the QR code on your table again."); return null; }
  document.title = R.name + " - Order";
  return R;
}
function goTo(page) {
  const slug = currentSlug();
  location.href = page + (slug ? "?restaurant=" + encodeURIComponent(slug) : "");
}

/* --------------------------------------------------------------------- captcha ---- */
/* Cloudflare Turnstile. The token is verified by SUPABASE (server side) when signing in, so a bot
   cannot skip it by editing this page. */
const Captcha = (() => {
  let scriptPromise = null, widgetId = null, token = null, host = null, onChangeCb = null;
  function load() {
    if (window.turnstile) return Promise.resolve();
    if (!scriptPromise) {
      scriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => { scriptPromise = null; reject(new Error("captcha-load")); };
        document.head.appendChild(s);
      });
    }
    return scriptPromise;
  }
  function setToken(t) { token = t; if (onChangeCb) onChangeCb(t); }
  async function render(container, onChange) {
    host = container; onChangeCb = onChange || null; token = null;
    const key = CONFIG.TURNSTILE_SITE_KEY;
    if (!key) { container.textContent = "Captcha is not configured (TURNSTILE_SITE_KEY in config.js)."; return false; }
    try { await load(); }
    catch (_) { container.textContent = "Could not load the captcha. Check your internet connection and reload."; return false; }
    container.textContent = "";
    if (widgetId !== null) { try { window.turnstile.remove(widgetId); } catch (_) { /* ignore */ } widgetId = null; }
    widgetId = window.turnstile.render(container, {
      sitekey: key, theme: "dark",
      callback: (t) => setToken(t),
      "expired-callback": () => setToken(null),
      "timeout-callback": () => setToken(null),
      "error-callback": () => { setToken(null); }
    });
    if (onChangeCb) onChangeCb(null);
    return true;
  }
  function reset() {
    token = null;
    if (onChangeCb) onChangeCb(null);
    if (widgetId !== null && window.turnstile) { try { window.turnstile.reset(widgetId); } catch (_) { /* ignore */ } }
  }
  return { render, reset, token: () => token };
})();

/* ------------------------------------------------------ guest (customer) state ---- */
/* Only ids + quantities are stored in the cart. Names and prices ALWAYS come from the server, so
   editing browser storage cannot change what a guest pays. Stored per restaurant, expires after
   CONFIG.CART.TTL_HOURS. */
const Guest = (() => {
  const key = () => "dgc:guest:" + currentSlug();
  const normAddons = (arr) => (Array.isArray(arr) ? arr : [])
    .map((a) => String(typeof a === "string" ? a : (a && a.name) || "").trim().slice(0, 50))
    .filter(Boolean).slice(0, 12).sort();
  const normMod = (m) => String(m || "").trim().slice(0, 40);
  const lineKey = (id, variant, modifier, addons) =>
    `${id}__${variant === "half" ? "half" : "full"}__${normMod(modifier)}__${normAddons(addons).join("|")}`;
  const blank = () => ({
    v: 3, name: "", phone: "", updateName: true, loyaltyPoints: 0,
    table: "", token: "", orderType: "dine_in", deliveryAddress: "", coupon: "", couponDiscount: 0,
    cart: [], orders: [], last: "", rid: "", ridSig: "", ts: Date.now()
  });
  function clean(o) {
    const b = blank();
    if (!o || typeof o !== "object") return b;
    b.name = String(o.name || "").slice(0, 60);
    const digits = String(o.phone || "").replace(/\D/g, "").slice(-10);
    b.phone = digits.length === 10 ? digits : "";
    b.updateName = o.updateName !== false;
    b.loyaltyPoints = Math.max(0, Math.floor(num(o.loyaltyPoints, 0)));
    b.table = TABLE_RE.test(String(o.table || "")) ? String(o.table) : "";
    b.token = /^[0-9a-f]{32}$/i.test(String(o.token || "")) ? String(o.token) : "";
    b.orderType = ["dine_in", "takeaway", "pickup", "delivery"].includes(o.orderType) ? o.orderType : "dine_in";
    b.deliveryAddress = String(o.deliveryAddress || "").slice(0, 250);
    b.coupon = b.phone ? String(o.coupon || "").trim().toUpperCase().slice(0, 30) : "";
    b.couponDiscount = b.coupon ? Math.max(0, num(o.couponDiscount, 0)) : 0;
    b.cart = (Array.isArray(o.cart) ? o.cart : [])
      .filter((i) => i && UUID_RE.test(String(i.id)) && Number.isInteger(i.qty) && i.qty >= 1)
      .slice(0, 40).map((i) => ({
        id: String(i.id),
        variant: i.variant === "half" ? "half" : "full",
        modifier: normMod(i.modifier),
        addons: normAddons(i.addons),
        qty: Math.min(i.qty, CONFIG.CART.MAX_QTY)
      }));
    b.orders = (Array.isArray(o.orders) ? o.orders : [])
      .filter((x) => x && UUID_RE.test(String(x.id))).slice(0, 10)
      .map((x) => ({ id: String(x.id), no: String(x.no || "").slice(0, 30) }));
    b.last = UUID_RE.test(String(o.last || "")) ? String(o.last) : "";
    b.rid = UUID_RE.test(String(o.rid || "")) ? String(o.rid) : "";
    b.ridSig = String(o.ridSig || "").slice(0, 2000);
    b.ts = num(o.ts, Date.now());
    return b;
  }
  function get() {
    try {
      const o = clean(JSON.parse(localStorage.getItem(key())));
      if (Date.now() - o.ts > CONFIG.CART.TTL_HOURS * 3600 * 1000) return blank();
      return o;
    } catch (_) { return blank(); }
  }
  function save(o) {
    o.ts = Date.now();
    try { localStorage.setItem(key(), JSON.stringify(o)); } catch (_) { /* private mode / full */ }
    return o;
  }
  function update(fn) { const o = get(); fn(o); return save(o); }
  const matchLine = (x, id, variant, modifier, addons) =>
    lineKey(x.id, x.variant, x.modifier, x.addons) === lineKey(id, variant, modifier, addons);
  const api = {
    get, update, lineKey,
    clear() { try { localStorage.removeItem(key()); } catch (_) { /* ignore */ } },
    isCheckedIn(o) { o = o || get(); return !!(o.name && o.table); },
    count(o) { return (o || get()).cart.reduce((s, i) => s + i.qty, 0); },
    qty(id, variant, modifier, addons) {
      if (modifier === undefined && addons === undefined && variant === undefined) {
        return get().cart.filter((x) => x.id === id).reduce((s, x) => s + x.qty, 0);
      }
      if (modifier === undefined && addons === undefined) {
        const v = variant === "half" ? "half" : "full";
        return get().cart.filter((x) => x.id === id && (x.variant || "full") === v).reduce((s, x) => s + x.qty, 0);
      }
      const i = get().cart.find((x) => matchLine(x, id, variant, modifier, addons));
      return i ? i.qty : 0;
    },
    add(id, variant, modifier, addons) {
      const v = variant === "half" ? "half" : "full";
      const mod = normMod(modifier), adds = normAddons(addons);
      return update((o) => {
        const i = o.cart.find((x) => matchLine(x, id, v, mod, adds));
        if (i) i.qty = Math.min(i.qty + 1, CONFIG.CART.MAX_QTY);
        else if (o.cart.length < 40) o.cart.push({ id, variant: v, modifier: mod, addons: adds, qty: 1 });
      });
    },
    setQty(id, q, variant, modifier, addons) {
      const v = variant === "half" ? "half" : "full";
      const mod = normMod(modifier), adds = normAddons(addons);
      return update((o) => {
        const i = o.cart.find((x) => matchLine(x, id, v, mod, adds));
        if (q <= 0) { o.cart = o.cart.filter((x) => !matchLine(x, id, v, mod, adds)); return; }
        if (i) i.qty = Math.min(q, CONFIG.CART.MAX_QTY);
        else if (o.cart.length < 40) o.cart.push({ id, variant: v, modifier: mod, addons: adds, qty: Math.min(q, CONFIG.CART.MAX_QTY) });
      });
    },
    removeMissing(validIds) {
      let removed = 0;
      update((o) => { const before = o.cart.length; o.cart = o.cart.filter((i) => validIds.has(i.id)); removed = before - o.cart.length; });
      return removed;
    }
  };
  return api;
})();

/* guards a customer page: must have checked in AND hold a (captcha-verified) guest session */
async function requireGuest() {
  const g = Guest.get(), session = await getSession();
  if (!session || !Guest.isCheckedIn(g)) { goTo("index.html"); return null; }
  return g;
}

/* cart lines = cart ids joined with the live menu */
function buildLines(cart, menu) {
  const byId = new Map((menu || []).map((m) => [m.id, m]));
  return (cart || []).map((c) => {
    const m = byId.get(c.id);
    if (!m) return null;
    const wantHalf = c.variant === "half";
    const hasHalf = num(m.half_price) > 0;
    const isHalf = wantHalf && hasHalf;
    const foodBase = isHalf ? num(m.base_half_price || m.half_price) : num(m.base_price);
    const foodPrice = isHalf ? num(m.half_price) : num(m.price);
    const availAddons = Array.isArray(m.addons) ? m.addons : [];
    const reqAddons = Array.isArray(c.addons) ? c.addons : [];
    let addonSum = 0;
    const matchedAddons = [];
    reqAddons.forEach((rn) => {
      const found = availAddons.find((a) => a && String(a.name || "").trim().toLowerCase() === String(rn).trim().toLowerCase());
      if (found) { addonSum += num(found.price, 0); matchedAddons.push(String(found.name).trim()); }
    });
    const mod = String(c.modifier || "").trim();
    const baseLabel = isHalf ? `${m.name} (Half)` : (hasHalf ? `${m.name} (Full)` : m.name);
    const label = baseLabel + (mod ? ` [${mod}]` : "") + (matchedAddons.length ? ` (+ ${matchedAddons.join(", ")})` : "");
    const avail = !!m.available && (!wantHalf || hasHalf);
    return {
      key: Guest.lineKey(m.id, wantHalf ? "half" : "full", mod, matchedAddons),
      id: m.id, variant: wantHalf ? "half" : "full", modifier: mod, addons: matchedAddons,
      name: label, veg: !!m.veg, available: avail,
      base: foodBase + addonSum, price: foodPrice + addonSum,
      gstRate: m.gst_rate, kotStation: m.kot_station || "Kitchen",
      offer: !!m.offer_active, qty: c.qty
    };
  }).filter(Boolean);
}


/* 5 Brand Color Theme Presets (matching Digiconvo QR-Only Menu) */
const THEME_PRESETS = {
  gold:    { primary: "#c5a880", bg: "#05070f", card: "#141b2d", panel: "#0b0f19", border: "#24304d" },
  emerald: { primary: "#10b981", bg: "#04130e", card: "#0d261e", panel: "#071a14", border: "#164e3b" },
  crimson: { primary: "#f97316", bg: "#120705", card: "#27120e", panel: "#1a0b08", border: "#482119" },
  royal:   { primary: "#38bdf8", bg: "#040d1a", card: "#0f223d", panel: "#081526", border: "#1e3a5f" },
  plum:    { primary: "#c084fc", bg: "#0e0616", card: "#221133", panel: "#150a21", border: "#3b1d59" }
};
function applyThemePreset(key) {
  const t = THEME_PRESETS[key] || THEME_PRESETS.gold;
  const r = document.documentElement;
  r.style.setProperty("--primary", t.primary);
  r.style.setProperty("--bg-main", t.bg);
  r.style.setProperty("--bg-card", t.card);
  r.style.setProperty("--bg-panel", t.panel);
  r.style.setProperty("--border-col", t.border);
}
