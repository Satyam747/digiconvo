/*
=========================================================
DIGICONVO SMART QR MENU - COMMON ENGINE (v7.0)
Multi-City Scalable • Tenant-Scoped RPCs • Turnstile Ready
=========================================================
*/

"use strict";

let SETTINGS = {};
let SHORTLIST = [];

/*=========================================================
SAFE STORAGE (works even when the browser blocks storage)
=========================================================*/
const MEM_STORE = {};
const store = {
    _area(kind) { return kind === "session" ? sessionStorage : localStorage; },
    get(kind, key) {
        try {
            const v = this._area(kind).getItem(key);
            if (v !== null) return v;
        } catch (e) { /* blocked */ }
        return Object.prototype.hasOwnProperty.call(MEM_STORE, kind + key) ? MEM_STORE[kind + key] : null;
    },
    set(kind, key, val) {
        try {
            this._area(kind).setItem(key, val);
            delete MEM_STORE[kind + key];
            return true;
        } catch (e) {
            MEM_STORE[kind + key] = val;
            return false;
        }
    },
    remove(kind, key) {
        delete MEM_STORE[kind + key];
        try { this._area(kind).removeItem(key); } catch (e) { /* blocked */ }
    }
};

const supabaseClient = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
    : null;

/*=========================================================
BRAND COLOR THEME PRESETS
=========================================================*/
const THEME_PRESETS = {
    gold: { primary: "#c5a880", bg: "#05070f", card: "#141b2d", panel: "#0b0f19", border: "#24304d" },
    emerald: { primary: "#10b981", bg: "#04130e", card: "#0d261e", panel: "#071a14", border: "#164e3b" },
    crimson: { primary: "#f97316", bg: "#120705", card: "#27120e", panel: "#1a0b08", border: "#482119" },
    royal: { primary: "#38bdf8", bg: "#040d1a", card: "#0f223d", panel: "#081526", border: "#1e3a5f" },
    plum: { primary: "#c084fc", bg: "#0e0616", card: "#221133", panel: "#150a21", border: "#3b1d59" }
};

function applyThemePreset(themeKey) {
    const t = THEME_PRESETS[themeKey] || THEME_PRESETS.gold;
    const root = document.documentElement;
    root.style.setProperty("--primary", t.primary);
    root.style.setProperty("--bg-main", t.bg);
    root.style.setProperty("--bg-card", t.card);
    root.style.setProperty("--bg-panel", t.panel);
    root.style.setProperty("--border-col", t.border);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t.bg);
}

/*=========================================================
NATURAL GUEST-READING CATEGORY ORDER
=========================================================*/
const CATEGORY_PRIORITY = [
    "soup", "starter", "appetizer", "tandoor", "snack", "chaat",
    "main", "gravy", "curry", "paneer", "indian", "chinese", "continental",
    "pizza", "pasta", "burger", "sandwich", "roll",
    "bread", "roti", "naan", "rice", "biryani", "thali", "accompaniment",
    "dessert", "sweet", "ice cream", "beverage", "drink", "coffee", "shake", "mocktail"
];
const CATEGORY_PATTERNS = CATEGORY_PRIORITY.map(k => new RegExp("(^|[^a-z])" + k.replace(/ /g, "\\s+")));

function getCategoryPriority(catName) {
    const lower = String(catName || "").toLowerCase();
    for (let i = 0; i < CATEGORY_PATTERNS.length; i++) {
        if (CATEGORY_PATTERNS[i].test(lower)) return i;
    }
    return 50;
}

function sortCategoriesNaturally(categories) {
    return [...categories].sort((a, b) => {
        const pa = getCategoryPriority(a);
        const pb = getCategoryPriority(b);
        if (pa !== pb) return pa - pb;
        return String(a).localeCompare(String(b));
    });
}

/*=========================================================
RESTAURANT CLOCK (Multi-City Timezone Safe)
=========================================================*/
function restaurantClock(date = new Date()) {
    const tz = (SETTINGS && SETTINGS.Timezone) || CONFIG.UI.TIMEZONE || "Asia/Kolkata";
    try {
        const fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
        });
        const p = {};
        fmt.formatToParts(date).forEach(x => { p[x.type] = x.value; });
        const hr = p.hour === "24" ? "00" : String(p.hour || "00").padStart(2, "0");
        const mn = String(p.minute || "00").padStart(2, "0");
        const yFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
        return {
            day: p.weekday,
            yesterday: yFmt.format(new Date(date.getTime() - 86400000)),
            time: `${hr}:${mn}`
        };
    } catch (e) {
        return {
            day: date.toLocaleDateString("en-US", { weekday: "short" }),
            yesterday: new Date(date.getTime() - 86400000).toLocaleDateString("en-US", { weekday: "short" }),
            time: date.toTimeString().substring(0, 5)
        };
    }
}

function todayInRestaurantTZ(tzOverride) {
    const tz = tzOverride || (SETTINGS && SETTINGS.Timezone) || CONFIG.UI.TIMEZONE || "Asia/Kolkata";
    try {
        return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch (e) {
        return new Date().toISOString().substring(0, 10);
    }
}

function daysUntil(dateStr, tzOverride) {
    const d = String(dateStr || "").substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(todayInRestaurantTZ(tzOverride) + "T00:00:00Z")) / 86400000);
}

/*=========================================================
OFFER & PRICE CALCULATION ENGINE
=========================================================*/
function normalizeMenuRow(row, clock) {
    const c = clock || restaurantClock();
    const currentDay = c.day;
    const yesterday = c.yesterday;
    const currentTimeString = c.time;

    const originalPrice = Number(row.original_price || row.price || 0);
    const rawHalfPrice = Number(row.half_price || 0);
    let finalPrice = originalPrice;
    let finalHalfPrice = rawHalfPrice;
    let isOfferActive = false;
    let offerLabel = "";
    let timeWindowText = "";

    const st = String(row.start_time || "").substring(0, 5);
    const et = String(row.end_time || "").substring(0, 5);
    if (st && et) timeWindowText = `${st} - ${et}`;

    const offerType = row.offer_type || "None";
    const offerVal = Number(row.offer_value || 0);

    if (offerType !== "None" && offerVal > 0) {
        const happyHourDisabled =
            offerType === "Happy Hour" &&
            String(SETTINGS.HappyHourEnabled).toUpperCase() === "FALSE";

        if (!happyHourDisabled) {
            const days = Array.isArray(row.offer_days) ? row.offer_days : [];
            let dayToCheck = currentDay;
            let validTime = true;
            if (st && et) {
                if (st <= et) {
                    validTime = currentTimeString >= st && currentTimeString <= et;
                } else {
                    validTime = currentTimeString >= st || currentTimeString <= et;
                    if (currentTimeString <= et) dayToCheck = yesterday;
                }
            }
            const validDay = days.length === 0 || days.includes(dayToCheck);
            if (validDay && validTime) {
                isOfferActive = true;
                if (offerType === "Flat") {
                    finalPrice = Math.max(0, originalPrice - offerVal);
                    if (rawHalfPrice > 0 && originalPrice > 0) {
                        finalHalfPrice = Math.max(0, Math.round(rawHalfPrice - (offerVal * rawHalfPrice) / originalPrice));
                    }
                    offerLabel = `FLAT ${SETTINGS.Currency || "₹"}${offerVal} OFF`;
                } else {
                    finalPrice = Math.max(0, Math.round(originalPrice - (originalPrice * offerVal) / 100));
                    if (rawHalfPrice > 0) {
                        finalHalfPrice = Math.max(0, Math.round(rawHalfPrice - (rawHalfPrice * offerVal) / 100));
                    }
                    offerLabel = `${offerType === "Happy Hour" ? "HAPPY HOUR • " : ""}${offerVal}% OFF`;
                }
            }
        }
    }

    return {
        id: row.id,
        category: row.category || "General",
        name: row.name || "",
        description: row.description || "",
        originalPrice: originalPrice,
        price: finalPrice,
        halfOriginalPrice: rawHalfPrice,
        halfPrice: finalHalfPrice,
        image: row.image_url || "",
        available: row.available !== false,
        veg: row.veg !== false,
        jain: Boolean(row.jain_available),
        bestseller: Boolean(row.bestseller),
        chefsSpecial: Boolean(row.chefs_special),
        mustTry: Boolean(row.must_try),
        spicy: Boolean(row.spicy),
        pairsWith: row.pairs_with || "",
        prepTime: row.prep_time || "",
        shortlistCount: Number(row.shortlist_count || 0),
        isOfferActive: isOfferActive,
        offerLabel: offerLabel,
        timeWindowText: timeWindowText,
        OfferType: offerType,
        OfferValue: offerVal,
        StartTime: st,
        EndTime: et,
        OfferDays: Array.isArray(row.offer_days) ? row.offer_days : [],
        // Dashboard keys
        ID: row.id,
        Category: row.category || "General",
        Name: row.name || "",
        Description: row.description || "",
        OriginalPrice: originalPrice,
        Price: finalPrice,
        HalfPrice: rawHalfPrice,
        Image: row.image_url || "",
        Available: row.available !== false,
        Veg: row.veg !== false,
        Jain: Boolean(row.jain_available),
        Bestseller: Boolean(row.bestseller),
        ChefsSpecial: Boolean(row.chefs_special),
        MustTry: Boolean(row.must_try),
        Spicy: Boolean(row.spicy),
        PairsWith: row.pairs_with || "",
        PrepTime: row.prep_time || "",
        ShortlistCount: Number(row.shortlist_count || 0)
    };
}

function sortMenuGoldenTriangle(items) {
    return [...items].sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        const scoreA = (a.bestseller ? 4 : 0) + (a.chefsSpecial ? 3 : 0) + (a.isOfferActive ? 2 : 0) + (a.mustTry ? 1 : 0);
        const scoreB = (b.bestseller ? 4 : 0) + (b.chefsSpecial ? 3 : 0) + (b.isOfferActive ? 2 : 0) + (b.mustTry ? 1 : 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return String(a.name).localeCompare(String(b.name));
    });
}

function buildMenu(rows) {
    const clock = restaurantClock();
    return sortMenuGoldenTriangle((rows || []).map(r => normalizeMenuRow(r, clock)));
}

/*=========================================================
CLOUDFLARE TURNSTILE HELPER (Auto-activates when configured)
=========================================================*/
let _turnstileLoader = null;

function isTurnstileEnabled() {
    return Boolean(CONFIG.SECURITY && CONFIG.SECURITY.TURNSTILE_SITE_KEY && CONFIG.SECURITY.TURNSTILE_SITE_KEY.trim());
}

function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (_turnstileLoader) return _turnstileLoader;
    _turnstileLoader = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile failed to initialize.")));
        s.onerror = () => reject(new Error("Could not load Cloudflare Turnstile."));
        document.head.appendChild(s);
    });
    return _turnstileLoader;
}

/*=========================================================
NETWORK LAYER (timeout + retry + session tokens + Turnstile proxy)
=========================================================*/
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

const NO_LIB = {
    success: false,
    loadFailed: true,
    message: "Could not load the app library. Check your internet connection and refresh."
};

function netMessage(e, fallback) {
    if (e && e.message === "timeout") return "The server took too long to respond.";
    return (e && e.message) || fallback;
}

async function callRpc(name, params, opts = {}) {
    if (!supabaseClient) return NO_LIB;
    const retries = opts.retries || 0;
    let msg = "Unable to reach the server.";
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const { data, error } = await withTimeout(supabaseClient.rpc(name, params), opts.timeoutMs || CONFIG.NETWORK.TIMEOUT_MS);
            if (!error) {
                if (data !== null && data !== undefined) return data;
                msg = "Empty response from the server.";
            } else {
                msg = error.message || msg;
            }
        } catch (e) {
            msg = netMessage(e, msg);
        }
        if (attempt < retries) await sleep(500 * (attempt + 1));
    }
    return { success: false, loadFailed: true, message: msg };
}

async function callAuthProxy(payload) {
    const proxyUrl = safeUrl(CONFIG.SECURITY && CONFIG.SECURITY.AUTH_PROXY_URL);
    if (!proxyUrl) return null;
    try {
        const res = await withTimeout(fetch(proxyUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": CONFIG.SUPABASE.ANON_KEY
            },
            body: JSON.stringify(payload)
        }), CONFIG.NETWORK.TIMEOUT_MS);
        const json = await res.json().catch(() => null);
        return json || { success: false, message: "Invalid response from auth server." };
    } catch (e) {
        return { success: false, loadFailed: true, message: netMessage(e, "Unable to reach the auth server.") };
    }
}

function getOwnerToken() { return store.get("session", CONFIG.STORAGE.ADMIN_PIN) || ""; }
function setOwnerToken(t) { t ? store.set("session", CONFIG.STORAGE.ADMIN_PIN, t) : store.remove("session", CONFIG.STORAGE.ADMIN_PIN); }
function getMasterToken() { return store.get("session", CONFIG.STORAGE.MASTER_KEY) || ""; }
function setMasterToken(t) { t ? store.set("session", CONFIG.STORAGE.MASTER_KEY, t) : store.remove("session", CONFIG.STORAGE.MASTER_KEY); }

function handleAuthExpired(kind) {
    if (kind === "master") setMasterToken(""); else setOwnerToken("");
    window.dispatchEvent(new CustomEvent("dc:auth-expired", { detail: { kind } }));
}

async function api(action, data = {}) {
    const slug = data.slug || CONFIG.TENANT.SLUG;

    const owner = async (rpc, extra) => {
        const res = await callRpc(rpc, { p_slug: slug, p_pin: getOwnerToken(), ...extra });
        if (res && res.authExpired) handleAuthExpired("owner");
        return res;
    };
    const master = async (rpc, extra) => {
        const res = await callRpc(rpc, { p_secret: getMasterToken(), ...extra });
        if (res && res.authExpired) handleAuthExpired("master");
        return res;
    };

    switch (action) {
        case "getSettings":
            return callRpc("get_public_restaurant", { p_slug: slug }, { retries: CONFIG.NETWORK.READ_RETRIES });

        case "getMenu": {
            const res = await callRpc("get_public_menu", { p_slug: slug }, { retries: CONFIG.NETWORK.READ_RETRIES });
            if (res && res.success) {
                const raw = Array.isArray(res.raw) ? res.raw : [];
                return { success: true, raw, data: buildMenu(raw), inactive: Boolean(res.inactive) };
            }
            return res;
        }

        case "getOwnerMenu": {
            const res = await owner("get_owner_menu", {});
            if (res && res.success) {
                const raw = Array.isArray(res.raw) ? res.raw : [];
                return { success: true, raw, data: buildMenu(raw) };
            }
            return res;
        }

        case "incrementScan":
            await callRpc("increment_scan", { p_slug: slug }, { timeoutMs: 8000 });
            return { success: true };

        case "incrementShortlist":
            await callRpc("increment_shortlist", { p_item_id: String(data.id), p_slug: slug }, { timeoutMs: 8000 });
            return { success: true };

        case "verifyPin": {
            let res;
            if (CONFIG.SECURITY && CONFIG.SECURITY.AUTH_PROXY_URL) {
                res = await callAuthProxy({
                    action: "owner_login",
                    slug,
                    pin: String(data.pin),
                    turnstileToken: data.turnstileToken || ""
                });
            } else {
                res = await callRpc("verify_restaurant_pin", { p_slug: slug, p_pin: String(data.pin) });
            }
            if (res && res.success && res.token) setOwnerToken(res.token);
            return res;
        }
        case "resumeSession": {
            const tok = getOwnerToken();
            if (!tok) return { success: false, message: "No session." };
            const res = await callRpc("verify_restaurant_pin", { p_slug: slug, p_pin: tok });
            if (!res || !res.success) { if (!res || !res.loadFailed) setOwnerToken(""); }
            return res;
        }
        case "logout": {
            const tok = getOwnerToken();
            setOwnerToken("");
            if (tok) await callRpc("end_session", { p_token: tok }, { timeoutMs: 8000 });
            return { success: true };
        }

        case "saveSettings": {
            const res = await owner("save_restaurant_settings", { p_data: data });
            if (res && res.success && res.token) setOwnerToken(res.token);
            return res;
        }
        case "saveMenuItem":
            return owner("upsert_menu_item", { p_item: data });
        case "bulkSaveMenuItems":
            return owner("bulk_upsert_menu_items", { p_items: data.items || [] });
        case "deleteMenuItem":
            return owner("delete_menu_item_secure", { p_item_id: String(data.id) });
        case "toggleAvailability":
            return owner("toggle_item_availability", { p_item_id: String(data.id) });
        case "saveOffer":
            return owner("update_menu_offer", { p_offer: data });
        case "removeOffer":
            return owner("update_menu_offer", {
                p_offer: { id: data.id, offerType: "None", offerValue: 0, startTime: "", endTime: "", days: [] }
            });

        case "saasLogin": {
            let res;
            if (CONFIG.SECURITY && CONFIG.SECURITY.AUTH_PROXY_URL) {
                res = await callAuthProxy({
                    action: "master_login",
                    secret: String(data.secret),
                    turnstileToken: data.turnstileToken || ""
                });
            } else {
                res = await callRpc("saas_login", { p_secret: String(data.secret) });
            }
            if (res && res.success && res.token) setMasterToken(res.token);
            return res;
        }
        case "saasResume": {
            const tok = getMasterToken();
            if (!tok) return { success: false, message: "No session." };
            const res = await callRpc("saas_login", { p_secret: tok });
            if (!res || !res.success) { if (!res || !res.loadFailed) setMasterToken(""); }
            return res;
        }
        case "saasLogout": {
            const tok = getMasterToken();
            setMasterToken("");
            if (tok) await callRpc("end_session", { p_token: tok }, { timeoutMs: 8000 });
            return { success: true };
        }
        case "saasList":
            return master("saas_list_restaurants", {
                p_city: data.city || "",
                p_status: data.status || "all",
                p_search: data.search || "",
                p_sort: data.sort || "newest",
                p_limit: Number(data.limit || 50),
                p_offset: Number(data.offset || 0)
            });
        case "saasUpsert":
            return master("saas_upsert_restaurant", { p_data: data.payload });
        case "saasToggle":
            return master("saas_toggle_tenant", { p_slug: data.targetSlug });
        case "saasExtend":
            return master("saas_extend_subscription", { p_slug: data.targetSlug });
        case "saasDelete":
            return master("saas_delete_tenant", { p_slug: data.targetSlug });
        case "saasUpdateMaster": {
            const res = await callRpc("saas_update_master_config", {
                p_current_secret: data.currentSecret || getMasterToken(),
                p_new_secret: data.newSecret || "",
                p_whatsapp: data.providerWhatsapp || "",
                p_upi: data.providerUpi || ""
            });
            if (res && res.authExpired) handleAuthExpired("master");
            if (res && res.success && res.token) setMasterToken(res.token);
            return res;
        }
    }
    return { success: false, message: "Unknown action: " + action };
}

/*=========================================================
LOAD SETTINGS & OFFLINE CACHE
=========================================================*/
async function loadRestaurantSettings() {
    const activeSlug = resolveRestaurantSlug();
    CONFIG.TENANT.SLUG = activeSlug;
    CONFIG.STORAGE.SHORTLIST = "digiconvo_shortlist_" + activeSlug;
    CONFIG.STORAGE.ADMIN_PIN = "digiconvo_owner_token_" + activeSlug;
    CONFIG.STORAGE.CACHE = "digiconvo_cache_" + activeSlug;

    SETTINGS = {
        slug: activeSlug,
        Name: activeSlug.toUpperCase(),
        Tagline: "",
        City: CONFIG.UI.DEFAULT_CITY || "Indore",
        State: CONFIG.UI.DEFAULT_STATE || "Madhya Pradesh",
        Area: "",
        Timezone: CONFIG.UI.TIMEZONE || "Asia/Kolkata",
        Currency: "₹",
        GST: 5,
        ThemeColor: "gold",
        HappyHourEnabled: "TRUE",
        IsActive: true,
        ScanCount: 0
    };

    const res = await api("getSettings", { slug: activeSlug });
    if (res && res.success) {
        SETTINGS = { ...SETTINGS, ...res };
    } else {
        SETTINGS.NotFound = true;
        SETTINGS.LoadFailed = Boolean(res && res.loadFailed);
        SETTINGS.ErrorMessage = (res && res.message) || `Restaurant "${activeSlug}" not found.`;
    }
    applyThemePreset(SETTINGS.ThemeColor);
    return SETTINGS;
}

function readOfflineCache() {
    try {
        const o = JSON.parse(store.get("local", CONFIG.STORAGE.CACHE) || "null");
        return (o && o.settings && Array.isArray(o.rows)) ? o : null;
    } catch (e) {
        return null;
    }
}

function writeOfflineCache(settings, rows) {
    if (!Array.isArray(rows)) return;
    const safe = { ...settings };
    delete safe.NotFound; delete safe.LoadFailed; delete safe.ErrorMessage;
    store.set("local", CONFIG.STORAGE.CACHE, JSON.stringify({ ts: Date.now(), settings: safe, rows }));
}

/*=========================================================
SHORTLIST ENGINE
=========================================================*/
function loadShortlist() {
    let arr = [];
    try {
        const raw = store.get("local", CONFIG.STORAGE.SHORTLIST);
        arr = raw ? JSON.parse(raw) : [];
    } catch (e) {
        arr = [];
    }
    SHORTLIST = (Array.isArray(arr) ? arr : [])
        .filter(x => x && x.key && x.id !== undefined && x.id !== null)
        .map(x => ({
            key: String(x.key),
            id: x.id,
            name: String(x.name || ""),
            portion: x.portion === "Half" ? "Half" : "",
            price: Math.max(0, Number(x.price) || 0),
            veg: x.veg !== false,
            qty: Math.min(99, Math.max(1, Math.floor(Number(x.qty) || 1))),
            ts: Number(x.ts) || Date.now()
        }));
    return SHORTLIST;
}

function saveShortlist() {
    store.set("local", CONFIG.STORAGE.SHORTLIST, JSON.stringify(SHORTLIST));
}

function getShortlistKey(id, portion = "Full") {
    return `${id}__${portion}`;
}

function getShortlistQty(id, portion = "Full") {
    const key = getShortlistKey(id, portion);
    const found = SHORTLIST.find(x => x.key === key);
    return found ? found.qty : 0;
}

function updateShortlistItem(item, delta, portion = "Full") {
    loadShortlist();
    const key = getShortlistKey(item.id, portion);
    const unitPrice = (portion === "Half" && Number(item.halfPrice) > 0)
        ? Number(item.halfPrice)
        : Number(item.price);

    const existing = SHORTLIST.find(x => x.key === key);
    if (existing) {
        existing.qty = Math.min(99, existing.qty + delta);
        existing.price = unitPrice;
        if (existing.qty <= 0) {
            SHORTLIST = SHORTLIST.filter(x => x.key !== key);
        }
    } else if (delta > 0) {
        if (SHORTLIST.length >= 60) return false;
        SHORTLIST.push({
            key: key,
            id: item.id,
            name: item.name,
            portion: Number(item.halfPrice) > 0 && portion === "Half" ? "Half" : "",
            price: unitPrice,
            veg: item.veg,
            qty: 1,
            ts: Date.now()
        });
        api("incrementShortlist", { id: item.id });
    }
    saveShortlist();
    return true;
}

function clearShortlist() {
    SHORTLIST = [];
    saveShortlist();
}

/*=========================================================
UTILITIES (Strict HTTPS URLs to match CSP)
=========================================================*/
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>'"]/g, tag => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[tag]));
}

function escapeJS(str) {
    return String(str ?? "").replace(/[\\'"&<>\r\n\u2028\u2029]/g,
        c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

function formatMoney(value) {
    const num = Number(value) || 0;
    const cur = SETTINGS.Currency || CONFIG.UI.CURRENCY || "₹";
    const hasPaise = Math.abs(num - Math.round(num)) > 0.004;
    const digits = hasPaise ? 2 : 0;
    let txt;
    try {
        txt = num.toLocaleString(cur === "₹" ? "en-IN" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch (e) {
        txt = num.toFixed(digits);
    }
    return cur + txt;
}

function randomID(prefix = "DISH") {
    let rand;
    try {
        const a = new Uint32Array(2);
        crypto.getRandomValues(a);
        rand = a[0].toString(36) + a[1].toString(36);
    } catch (e) {
        rand = Math.random().toString(36).substring(2, 10);
    }
    return `${prefix}_${Date.now().toString(36)}_${rand}`.toUpperCase();
}

function safeUrl(u) {
    const s = String(u || "").trim();
    return /^https:\/\//i.test(s) ? s : "";
}

function imageOrDefault(url) {
    const u = safeUrl(url);
    return u ? escapeHTML(u) : CONFIG.UI.DEFAULT_IMAGE;
}

function waNumber(raw) {
    let d = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
    if (d.length === 10) d = "91" + d;
    return d;
}

function telHref(raw) {
    return String(raw || "").replace(/[^0-9+]/g, "");
}

function debounce(fn, ms) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

function getTableLabel() {
    const t = new URLSearchParams(window.location.search).get("t") || "";
    return t.replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 12);
}

/*=========================================================
TOAST & OVERLAYS
=========================================================*/
let _toastTimer;
function showToast(msg, isErr = false) {
    let t = document.getElementById("dcToast");
    if (!t) {
        t = document.createElement("div");
        t.id = "dcToast";
        t.setAttribute("role", "status");
        t.setAttribute("aria-live", "polite");
        t.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);max-width:90%;padding:11px 18px;border-radius:10px;font:700 13px system-ui,sans-serif;color:#fff;z-index:100000;opacity:0;pointer-events:none;transition:opacity .25s;text-align:center;";
        document.body.appendChild(t);
    }
    t.style.background = isErr ? "#dc2626" : "#16a34a";
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.style.opacity = "0"; }, 2800);
}

const _overlayFocus = new WeakMap();

function openOverlay(idOrEl) {
    const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
    if (!el) return;
    if (!el.classList.contains("show")) _overlayFocus.set(el, document.activeElement);
    el.classList.add("show");
    const f = el.querySelector("[autofocus], input:not([type=hidden]), select, textarea, button");
    if (f) setTimeout(() => { try { f.focus(); } catch (e) { /* ignore */ } }, 30);
}

function closeOverlay(idOrEl) {
    const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
    if (!el) return;
    el.classList.remove("show");
    const prev = _overlayFocus.get(el);
    _overlayFocus.delete(el);
    if (prev && prev.focus && document.contains(prev)) { try { prev.focus(); } catch (e) { /* ignore */ } }
}

document.addEventListener("keydown", (e) => {
    const open = [...document.querySelectorAll(".modalOverlay.show, .modal.show")];
    const top = open[open.length - 1];

    if (e.key === "Escape" && top) {
        e.preventDefault();
        closeOverlay(top);
        return;
    }
    if (e.key === "Tab" && top) {
        const f = [...top.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex='0']")]
            .filter(x => x.offsetParent !== null);
        if (f.length) {
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            else if (!top.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        }
        return;
    }
    const t = e.target;
    if ((e.key === "Enter" || e.key === " ") && t && t.getAttribute && t.getAttribute("role") === "button" && t.tagName !== "BUTTON") {
        e.preventDefault();
        t.click();
    }
});

document.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.classList && (t.classList.contains("modalOverlay") || t.classList.contains("modal")) && t.classList.contains("show")
        && t.id !== "loginScreen" && t.id !== "masterLogin") {
        closeOverlay(t);
    }
});

function preventFraming() {
    if (window.top !== window.self) {
        try { window.top.location = window.self.location; } catch (e) { document.documentElement.style.display = "none"; }
    }
}