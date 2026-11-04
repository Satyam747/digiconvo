/*
=========================================================
DIGICONVO LITE - COMMON ENGINE (v4.0 Zero-Knowledge Security)
=========================================================
*/

"use strict";

let SETTINGS = {};
let SHORTLIST = [];

const supabaseClient = window.supabase.createClient(
    CONFIG.SUPABASE.URL,
    CONFIG.SUPABASE.ANON_KEY
);

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

function getCategoryPriority(catName) {
    const lower = String(catName || "").toLowerCase();
    for (let i = 0; i < CATEGORY_PRIORITY.length; i++) {
        if (lower.includes(CATEGORY_PRIORITY[i])) return i;
    }
    return 50;
}

function sortCategoriesNaturally(categories) {
    return [...categories].sort((a, b) => {
        const pa = getCategoryPriority(a);
        const pb = getCategoryPriority(b);
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
    });
}

/*=========================================================
OFFER & PRICE CALCULATION ENGINE
=========================================================*/
function normalizeMenuRow(row) {
    const now = new Date();
    const currentDay = now.toLocaleDateString("en-US", { weekday: "short" });
    const currentTimeString = now.toTimeString("en-US", { hour12: false }).substring(0, 5);

    const originalPrice = Number(row.original_price || row.price || 0);
    const rawHalfPrice = Number(row.half_price || 0);
    let finalPrice = originalPrice;
    let finalHalfPrice = rawHalfPrice;
    let isOfferActive = false;
    let offerLabel = "";
    let timeWindowText = "";

    if (row.start_time && row.end_time) {
        timeWindowText = `${row.start_time} - ${row.end_time}`;
    }

    const offerType = row.offer_type || "None";
    const offerVal = Number(row.offer_value || 0);

    if (offerType !== "None" && offerVal > 0) {
        const happyHourDisabled =
            offerType === "Happy Hour" &&
            String(SETTINGS.HappyHourEnabled).toUpperCase() === "FALSE";

        if (!happyHourDisabled) {
            const days = Array.isArray(row.offer_days) ? row.offer_days : [];
            const validDay = days.length === 0 || days.includes(currentDay);
            let validTime = true;
            if (row.start_time && row.end_time) {
                if (row.start_time <= row.end_time) {
                    validTime = currentTimeString >= row.start_time && currentTimeString <= row.end_time;
                } else {
                    validTime = currentTimeString >= row.start_time || currentTimeString <= row.end_time;
                }
            }
            if (validDay && validTime) {
                isOfferActive = true;
                if (offerType === "Flat") {
                    finalPrice = Math.max(0, originalPrice - offerVal);
                    if (rawHalfPrice > 0) finalHalfPrice = Math.max(0, rawHalfPrice - offerVal);
                    offerLabel = `FLAT ${SETTINGS.Currency || "₹"}${offerVal} OFF`;
                } else {
                    finalPrice = Math.max(0, Math.round(originalPrice - (originalPrice * offerVal) / 100));
                    if (rawHalfPrice > 0) finalHalfPrice = Math.max(0, Math.round(rawHalfPrice - (rawHalfPrice * offerVal) / 100));
                    offerLabel = `${offerType === "Happy Hour" ? "HAPPY HOUR • " : ""}${offerVal}% OFF`;
                }
            }
        }
    }

    return {
        id: row.id,
        category: row.category || "General",
        name: row.name,
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
        StartTime: row.start_time || "",
        EndTime: row.end_time || "",
        OfferDays: Array.isArray(row.offer_days) ? row.offer_days : [],
        // Dashboard keys
        ID: row.id,
        Category: row.category || "General",
        Name: row.name,
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

/*=========================================================
GOLDEN TRIANGLE DISH SORTER (Bestsellers & Chef's Specials First)
=========================================================*/
function sortMenuGoldenTriangle(items) {
    return [...items].sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        const scoreA = (a.bestseller ? 4 : 0) + (a.chefsSpecial ? 3 : 0) + (a.isOfferActive ? 2 : 0) + (a.mustTry ? 1 : 0);
        const scoreB = (b.bestseller ? 4 : 0) + (b.chefsSpecial ? 3 : 0) + (b.isOfferActive ? 2 : 0) + (b.mustTry ? 1 : 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
    });
}

/*=========================================================
SUPABASE SECURE RPC API
=========================================================*/
async function api(action, data = {}) {
    const slug = data.slug || CONFIG.TENANT.SLUG;
    const savedPin = sessionStorage.getItem(CONFIG.STORAGE.ADMIN_PIN) || data.pin || "";

    try {
        switch (action) {
            case "getSettings": {
                // Primary: Call SECURITY DEFINER RPC (Never fails with RLS View permissions)
                const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc("get_public_restaurant", {
                    p_slug: slug
                });
                if (!rpcErr && rpcRes) {
                    return rpcRes;
                }

                // Fallback: Direct view query if RPC patch hasn't been run yet
                const { data: row, error } = await supabaseClient
                    .from("public_restaurants")
                    .select("*")
                    .eq("slug", slug)
                    .maybeSingle();

                if (error || !row) {
                    return {
                        success: false,
                        notFound: true,
                        message: error?.message || `Restaurant "${slug}" not found.`
                    };
                }
                return {
                    success: true,
                    slug: row.slug,
                    Name: row.restaurant_name,
                    Tagline: row.tagline || "",
                    Address: row.address || "",
                    Phone: row.phone || "",
                    Logo: row.logo_url || "",
                    Currency: row.currency || "₹",
                    GST: row.gst_percent ?? 5,
                    WhatsApp: row.whatsapp_number || "",
                    ReviewLink: row.review_link || "",
                    Instagram: row.instagram_url || "",
                    WifiName: row.wifi_name || "",
                    WifiPassword: row.wifi_password || "",
                    Announcement: row.announcement_text || "",
                    ThemeColor: row.theme_color || "gold",
                    HappyHourEnabled: row.happy_hour_enabled ? "TRUE" : "FALSE",
                    IsActive: row.is_active !== false,
                    PlanPrice: row.plan_price || 399,
                    ValidTill: row.subscription_valid_till || "",
                    ScanCount: row.scan_count || 0,
                    ProviderWhatsApp: row.provider_whatsapp || "",
                    ProviderUpi: row.provider_upi || ""
                };
            }
            case "incrementScan": {
                await supabaseClient.rpc("increment_scan", { p_slug: slug });
                return { success: true };
            }
            case "incrementShortlist": {
                await supabaseClient.rpc("increment_shortlist", { p_item_id: String(data.id) });
                return { success: true };
            }
            case "verifyPin": {
                const { data: res, error } = await supabaseClient.rpc("verify_restaurant_pin", {
                    p_slug: slug,
                    p_pin: String(data.pin)
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "saveSettings": {
                const { data: res, error } = await supabaseClient.rpc("save_restaurant_settings", {
                    p_slug: slug,
                    p_pin: savedPin,
                    p_data: data
                });
                if (error) return { success: false, message: error.message };
                if (res.success && data.NewAdminPIN) {
                    sessionStorage.setItem(CONFIG.STORAGE.ADMIN_PIN, data.NewAdminPIN);
                }
                return res;
            }
            case "getMenu": {
                const { data: rows, error } = await supabaseClient
                    .from("menu_items")
                    .select("*")
                    .eq("restaurant_slug", slug);
                if (error) return { success: false, message: error.message };
                const normalized = (rows || []).map(normalizeMenuRow);
                return { success: true, data: sortMenuGoldenTriangle(normalized) };
            }
            case "saveMenuItem": {
                const { data: res, error } = await supabaseClient.rpc("upsert_menu_item", {
                    p_slug: slug,
                    p_pin: savedPin,
                    p_item: data
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "deleteMenuItem": {
                const { data: res, error } = await supabaseClient.rpc("delete_menu_item_secure", {
                    p_slug: slug,
                    p_pin: savedPin,
                    p_item_id: String(data.id)
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "toggleAvailability": {
                const { data: res, error } = await supabaseClient.rpc("toggle_item_availability", {
                    p_slug: slug,
                    p_pin: savedPin,
                    p_item_id: String(data.id)
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "saveOffer": {
                const { data: res, error } = await supabaseClient.rpc("update_menu_offer", {
                    p_slug: slug,
                    p_pin: savedPin,
                    p_offer: data
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "removeOffer": {
                const { data: res, error } = await supabaseClient.rpc("update_menu_offer", {
                    p_slug: slug,
                    p_pin: savedPin,
                    p_offer: { id: data.id, offerType: "None", offerValue: 0, startTime: "", endTime: "", days: [] }
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            // Super Admin RPCs
            case "saasList": {
                const { data: res, error } = await supabaseClient.rpc("saas_list_restaurants", { p_secret: data.secret });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "saasUpsert": {
                const { data: res, error } = await supabaseClient.rpc("saas_upsert_restaurant", {
                    p_secret: data.secret,
                    p_data: data.payload
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "saasUpdateMaster": {
                const { data: res, error } = await supabaseClient.rpc("saas_update_master_config", {
                    p_current_secret: data.currentSecret,
                    p_new_secret: data.newSecret || "",
                    p_whatsapp: data.providerWhatsapp || "",
                    p_upi: data.providerUpi || ""
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "saasToggle": {
                const { data: res, error } = await supabaseClient.rpc("saas_toggle_tenant", {
                    p_secret: data.secret,
                    p_slug: data.targetSlug
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "saasExtend": {
                const { data: res, error } = await supabaseClient.rpc("saas_extend_subscription", {
                    p_secret: data.secret,
                    p_slug: data.targetSlug
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
            case "saasDelete": {
                const { data: res, error } = await supabaseClient.rpc("saas_delete_tenant", {
                    p_secret: data.secret,
                    p_slug: data.targetSlug
                });
                if (error) return { success: false, message: error.message };
                return res;
            }
        }
    } catch (err) {
        return { success: false, message: err.toString() };
    }
}

/*=========================================================
LOAD SETTINGS & APPLY THEME
=========================================================*/
async function loadRestaurantSettings() {
    const activeSlug = resolveRestaurantSlug();
    CONFIG.TENANT.SLUG = activeSlug;
    CONFIG.STORAGE.SHORTLIST = "digiconvo_shortlist_" + activeSlug;
    CONFIG.STORAGE.ADMIN_PIN = "digiconvo_session_pin_" + activeSlug;

    SETTINGS = {
        slug: activeSlug,
        Name: activeSlug.toUpperCase(),
        Tagline: "",
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
        SETTINGS.ErrorMessage = res?.message || `Restaurant "${activeSlug}" not found.`;
    }
    applyThemePreset(SETTINGS.ThemeColor);
    return SETTINGS;
}

/*=========================================================
SHORTLIST ENGINE (Supports Half / Full Portion Variants)
=========================================================*/
function loadShortlist() {
    try {
        const raw = localStorage.getItem(CONFIG.STORAGE.SHORTLIST);
        SHORTLIST = raw ? JSON.parse(raw) : [];
    } catch (e) {
        SHORTLIST = [];
    }
    return SHORTLIST;
}

function saveShortlist() {
    localStorage.setItem(CONFIG.STORAGE.SHORTLIST, JSON.stringify(SHORTLIST));
}

function getShortlistKey(id, portion = "Full") {
    return `${id}__${portion}`;
}

function getShortlistQty(id, portion = "Full") {
    loadShortlist();
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
        existing.qty += delta;
        existing.price = unitPrice;
        if (existing.qty <= 0) {
            SHORTLIST = SHORTLIST.filter(x => x.key !== key);
        }
    } else if (delta > 0) {
        SHORTLIST.push({
            key: key,
            id: item.id,
            name: item.name,
            portion: item.halfPrice > 0 ? portion : "",
            price: unitPrice,
            veg: item.veg,
            qty: 1
        });
        // Track dish popularity in Supabase
        api("incrementShortlist", { id: item.id });
    }
    saveShortlist();
}

function clearShortlist() {
    SHORTLIST = [];
    saveShortlist();
}

/*=========================================================
UTILITIES
=========================================================*/
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>'"]/g, tag => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[tag]));
}

function formatMoney(value) {
    const num = Number(value) || 0;
    const cur = SETTINGS.Currency || CONFIG.UI.CURRENCY || "₹";
    return cur + num.toFixed(0);
}

function randomID(prefix = "DISH") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function imageOrDefault(url) {
    if (!url || String(url).trim() === "") return CONFIG.UI.DEFAULT_IMAGE;
    return url;
}
function escapeJS(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, "&quot;")
        .replace(/\n/g, " ");
}