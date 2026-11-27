/*
=========================================================
CLINICOS SAAS v11.0 - SHARED CORE ENGINE (common.js)
- 33-RPC Enterprise Bridge (Multi-User Staff + HQ RBAC)
- Egress-Safe Adaptive Poller & Static Metadata Caching
- Offline/Reconnecting Watcher & Service Worker Registration
- Safe SVG CAPTCHA Sanitizer & Session TTL Storage
- Free Browser Voice-to-Text (en-IN / hi-IN) & Queued TV Voice Calling
- Complete Print Suite (NMC Rx, Multi-Item Fee Receipt with
  Balance Due, Lab Req, MCI Reg 1.3.3 Certificate, 80mm Token
  Slip, Local SVG A4 QR Poster, Shift-Wise EOD Cash Handover Report)
- Broadcast Banner Renderer, WhatsApp (wa.me) & CSV Export
=========================================================
*/
"use strict";

const THEME_PRESETS = {
    ocean:   { primary: "#0284c7", primaryDark: "#0369a1", accent: "#0ea5e9", bgSoft: "#f0f9ff" },
    emerald: { primary: "#059669", primaryDark: "#047857", accent: "#10b981", bgSoft: "#ecfdf5" },
    indigo:  { primary: "#4f46e5", primaryDark: "#4338ca", accent: "#6366f1", bgSoft: "#eef2ff" },
    rose:    { primary: "#e11d48", primaryDark: "#be123c", accent: "#f43f5e", bgSoft: "#fff1f2" },
    slate:   { primary: "#1e293b", primaryDark: "#0f172a", accent: "#334155", bgSoft: "#f8fafc" }
};

const SPECIALTY_PRESETS = {
    general: { label: "General Medicine / OPD", fields: [
        { key: "bp", label: "BP (mmHg)", placeholder: "120/80" },
        { key: "pulse", label: "Pulse (/min)", placeholder: "78" },
        { key: "temp", label: "Temp (°F)", placeholder: "98.6" },
        { key: "spo2", label: "SpO2 (%)", placeholder: "99%" },
        { key: "weight", label: "Weight (kg)", placeholder: "65" }
    ]},
    eye: { label: "Ophthalmology / Eye Clinic", fields: [
        { key: "va_od", label: "Vision OD (R)", placeholder: "6/6" },
        { key: "va_os", label: "Vision OS (L)", placeholder: "6/9" },
        { key: "iop_od", label: "IOP OD (mmHg)", placeholder: "14" },
        { key: "iop_os", label: "IOP OS (mmHg)", placeholder: "15" },
        { key: "ar_note", label: "AR / Glass Power", placeholder: "-1.00 DS" }
    ]},
    dental: { label: "Dental Clinic", fields: [
        { key: "tooth_no", label: "Tooth No.", placeholder: "UR6 / 16" },
        { key: "bp", label: "BP (mmHg)", placeholder: "120/80" },
        { key: "sugar", label: "RBS (mg/dL)", placeholder: "110" },
        { key: "swelling", label: "Swelling/Pain", placeholder: "Mild" }
    ]},
    pediatrics: { label: "Pediatrics / Child Care", fields: [
        { key: "weight", label: "Weight (kg)", placeholder: "12.5" },
        { key: "height", label: "Height (cm)", placeholder: "88" },
        { key: "temp", label: "Temp (°F)", placeholder: "99.4" },
        { key: "spo2", label: "SpO2 (%)", placeholder: "99%" },
        { key: "vaccine", label: "Vaccination Due", placeholder: "DPT Booster" }
    ]},
    gynecology: { label: "Gynecology & Obstetrics", fields: [
        { key: "lmp", label: "LMP Date", placeholder: "DD/MM/YYYY" },
        { key: "bp", label: "BP (mmHg)", placeholder: "118/76" },
        { key: "weight", label: "Weight (kg)", placeholder: "58" },
        { key: "hb", label: "Hb (g/dL)", placeholder: "11.5" }
    ]},
    orthopedics: { label: "Orthopedics", fields: [
        { key: "site", label: "Affected Site", placeholder: "Right Knee" },
        { key: "pain_score", label: "Pain (1-10)", placeholder: "6/10" },
        { key: "xray", label: "X-Ray / MRI", placeholder: "Brought / Advised" },
        { key: "bp", label: "BP (mmHg)", placeholder: "124/80" }
    ]},
    dermatology: { label: "Dermatology / Skin", fields: [
        { key: "area", label: "Affected Area", placeholder: "Face / Forearms" },
        { key: "duration", label: "Duration", placeholder: "2 weeks" },
        { key: "itching", label: "Itching/Scaling", placeholder: "Moderate" }
    ]},
    cardiology: { label: "Cardiology", fields: [
        { key: "bp", label: "BP (mmHg)", placeholder: "136/86" },
        { key: "pulse", label: "Pulse (/min)", placeholder: "74" },
        { key: "spo2", label: "SpO2 (%)", placeholder: "98%" },
        { key: "ecg", label: "ECG Status", placeholder: "NSR" }
    ]},
    ent: { label: "ENT Clinic", fields: [
        { key: "side", label: "Ear/Nose/Throat", placeholder: "Right Ear" },
        { key: "temp", label: "Temp (°F)", placeholder: "98.6" },
        { key: "bp", label: "BP (mmHg)", placeholder: "120/80" }
    ]},
    custom: { label: "Custom Specialty", fields: [
        { key: "note_1", label: "Observation 1", placeholder: "Enter value" },
        { key: "note_2", label: "Observation 2", placeholder: "Enter value" },
        { key: "bp", label: "BP (mmHg)", placeholder: "120/80" }
    ]}
};

const DOSAGE_CHIPS = [
    { label: "1-0-1 (BD)", val: "1-0-1" },
    { label: "1-1-1 (TDS)", val: "1-1-1" },
    { label: "1-0-0 (Morning)", val: "1-0-0" },
    { label: "0-0-1 (Night)", val: "0-0-1" },
    { label: "SOS (ज़रूरत पर)", val: "SOS" },
    { label: "After Food / खाने के बाद", val: "After Food (खाने के बाद)" },
    { label: "Before Food / खाने से पहले", val: "Before Food (खाने से पहले)" },
    { label: "With Warm Water / गुनगुने पानी से", val: "With Warm Water (गुनगुने पानी से)" }
];

// =========================================================
// 1. SUPABASE CLIENT & 33-RPC API LAYER
// =========================================================
let _sbClient = null;
function validateSupabaseConfig() {
    if (!CONFIG || !CONFIG.SUPABASE || !CONFIG.SUPABASE.URL || !CONFIG.SUPABASE.ANON_KEY) {
        throw new Error("Supabase configuration missing in config.js.");
    }
    const url = String(CONFIG.SUPABASE.URL).trim();
    const key = String(CONFIG.SUPABASE.ANON_KEY).trim();
    if (!url.startsWith("https://") || key.length < 20) {
        throw new Error("Invalid Supabase URL or key in config.js.");
    }
}

function getSupabase() {
    if (!_sbClient) {
        validateSupabaseConfig();
        if (!window.supabase || !window.supabase.createClient) {
            throw new Error("Supabase SDK failed to load. Check internet connection.");
        }
        _sbClient = window.supabase.createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _sbClient;
}

function isTurnstileEnabled() {
    return Boolean(CONFIG.SECURITY && CONFIG.SECURITY.TURNSTILE_SITE_KEY && CONFIG.SECURITY.AUTH_PROXY_URL);
}

let _turnstilePromise = null;
function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    if (_turnstilePromise) return _turnstilePromise;
    _turnstilePromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true; s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => {
            _turnstilePromise = null;
            reject(new Error("Turnstile script failed to load."));
        };
        document.head.appendChild(s);
    });
    return _turnstilePromise;
}

async function callTurnstileGate(payload) {
    validateSupabaseConfig();
    const res = await fetch(CONFIG.SECURITY.AUTH_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": CONFIG.SUPABASE.ANON_KEY },
        body: JSON.stringify(payload)
    });
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (_) {
        return { success: false, message: `Security gateway error (HTTP ${res.status}). Please retry.` };
    }
}

async function rpcCall(fnName, params = {}) {
    const sb = getSupabase();
    const { data, error } = await sb.rpc(fnName, params);
    if (error) return { success: false, message: error.message || "Server error." };
    return (data === null || data === undefined) ? { success: false, message: "Empty server response." } : data;
}

async function api(action, data = {}) {
    try {
        switch (action) {
            case "getCaptcha":
                return await rpcCall("public_get_captcha");

            case "getPublicQueue":
                return await rpcCall("get_public_clinic_queue", {
                    p_slug: data.slug || CONFIG.TENANT.SLUG,
                    p_booking_ref: data.booking_ref || null,
                    p_known_version: data.known_version ?? null,
                    p_dept_id: data.dept_id || null,
                    p_known_meta_version: data.known_meta_version ?? null,
                    p_known_day: data.known_day || null
                });

            case "submitBooking":
                if (isTurnstileEnabled()) {
                    if (!data.turnstileToken) return { success: false, message: "Please wait for the Cloudflare security check to complete." };
                    return await callTurnstileGate({ action: "submitBooking", slug: data.slug || CONFIG.TENANT.SLUG, payload: data.payload || {}, turnstileToken: data.turnstileToken });
                }
                return await rpcCall("public_submit_booking", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_payload: data.payload || {} });

            case "staffLogin":
                if (isTurnstileEnabled()) {
                    if (!data.turnstileToken) return { success: false, message: "Please wait for the Cloudflare security check to complete." };
                    return await callTurnstileGate({ action: "staffLogin", slug: data.slug || CONFIG.TENANT.SLUG, username: data.username || "", password: data.password || "", portal: data.portal || "reception", turnstileToken: data.turnstileToken });
                }
                return await rpcCall("staff_login", {
                    p_slug: data.slug || CONFIG.TENANT.SLUG, p_username: data.username || "", p_password: data.password || "",
                    p_portal: data.portal || "reception", p_captcha_id: data.captcha_id || "", p_captcha_answer: data.captcha_answer || ""
                });

            case "saasLogin":
                if (isTurnstileEnabled()) {
                    if (!data.turnstileToken) return { success: false, message: "Please wait for the Cloudflare security check to complete." };
                    return await callTurnstileGate({ action: "saasLogin", username: data.username || "", secret: data.secret || "", turnstileToken: data.turnstileToken });
                }
                return await rpcCall("saas_login", {
                    p_username: data.username || "", p_secret: data.secret || "",
                    p_captcha_id: data.captcha_id || "", p_captcha_answer: data.captcha_answer || ""
                });

            case "revokeSession":
                return await rpcCall("revoke_session", { p_token: data.token || "", p_kind: data.kind || "staff" });

            case "getStaffDashboard":
                return await rpcCall("get_staff_clinic_dashboard", {
                    p_slug: data.slug || CONFIG.TENANT.SLUG, p_portal: data.portal || "reception",
                    p_token: data.token || "", p_known_version: data.known_version ?? null, p_day: data.day || null,
                    p_known_meta_version: data.known_meta_version ?? null, p_known_day: data.known_day || null
                });

            case "staffMutate":
                return await rpcCall("staff_mutate_clinic", {
                    p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "",
                    p_action: data.action || "", p_payload: data.payload || {}
                });

            case "lookupPatient":
                return await rpcCall("staff_lookup_patient", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "", p_query: data.query || "" });

            case "getVisitHistory":
                return await rpcCall("staff_get_visit_history", {
                    p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "",
                    p_from_date: data.from_date || null, p_to_date: data.to_date || null,
                    p_search: data.search || "", p_dept_id: data.dept_id || "", p_doctor_id: data.doctor_id || "",
                    p_limit: data.limit || 50, p_offset: data.offset || 0
                });

            case "getFollowups":
                return await rpcCall("staff_get_followups", {
                    p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "",
                    p_from_date: data.from_date || null, p_to_date: data.to_date || null, p_doctor_id: data.doctor_id || ""
                });

            case "getAuditLog":
                return await rpcCall("staff_get_audit_log", {
                    p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "",
                    p_actor: data.actor || "", p_action: data.action || "", p_limit: data.limit || 60, p_offset: data.offset || 0
                });

            case "submitTicket":
                return await rpcCall("staff_submit_ticket", {
                    p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "",
                    p_category: data.category || "general", p_priority: data.priority || "normal",
                    p_subject: data.subject || "", p_description: data.description || ""
                });

            case "manageUsers":
                return await rpcCall("staff_manage_users", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "", p_action: data.action || "list", p_payload: data.payload || {} });

            case "manageClinicSetup":
                return await rpcCall("staff_manage_clinic_setup", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "", p_action: data.action || "", p_payload: data.payload || {} });

            case "changeOwnPassword":
                return await rpcCall("staff_change_own_password", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "", p_old_password: data.old_password || "", p_new_password: data.new_password || "" });

            case "saveRxTemplate":
                return await rpcCall("staff_save_rx_template", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "", p_doctor_id: data.doctor_id || "", p_action: data.action || "save", p_payload: data.payload || {} });

            case "saasListClinics":
                return await rpcCall("saas_list_clinics", {
                    p_token: data.token || "", p_search: data.search || "", p_city: data.city || "",
                    p_status: data.status || "", p_facility_type: data.facility_type || "", p_triage: data.triage || "",
                    p_limit: data.limit || 25, p_offset: data.offset || 0
                });

            case "saasUpsertClinic":
                return await rpcCall("saas_upsert_clinic", { p_token: data.token || "", p_data: data.data || {} });

            case "saasResetAdminPassword":
                return await rpcCall("saas_reset_clinic_admin_password", {
                    p_token: data.token || "", p_slug: data.slug || "", p_username: data.username || "",
                    p_new_password: data.new_password || "", p_reason: data.reason || ""
                });

            case "saasUnlockClinic":
                return await rpcCall("saas_unlock_clinic", { p_token: data.token || "", p_slug: data.slug || "" });

            case "saasToggleClinic":
                return await rpcCall("saas_toggle_clinic", { p_token: data.token || "", p_slug: data.slug || "" });

            case "forceLogoutAll":
                return await rpcCall("staff_force_logout_all", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "" });

            case "getPatientProfile":
                return await rpcCall("staff_get_patient_profile", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "", p_patient_id: data.patient_id || "" });

            case "updatePatientProfile":
                return await rpcCall("staff_update_patient_profile", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_token: data.token || "", p_patient_id: data.patient_id || "", p_payload: data.payload || {} });

            case "saasListPayments":
                return await rpcCall("saas_list_payments", { p_token: data.token || "", p_limit: data.limit || 60 });

            case "saasExtendSub":
                return await rpcCall("saas_extend_clinic_sub", {
                    p_token: data.token || "", p_slug: data.slug || "", p_days: data.days || 30,
                    p_amount: data.amount ?? 0, p_gateway: data.gateway || "upi",
                    p_payment_ref: data.payment_ref || "", p_notes: data.notes || ""
                });

            case "saasDeleteClinic":
                return await rpcCall("saas_delete_clinic", { p_token: data.token || "", p_slug: data.slug || "" });

            case "saasManageStaff":
                return await rpcCall("saas_manage_staff", { p_token: data.token || "", p_action: data.action || "list", p_payload: data.payload || {} });

            case "saasManageTickets":
                return await rpcCall("saas_manage_tickets", { p_token: data.token || "", p_action: data.action || "list", p_payload: data.payload || {} });

            case "saasManageAnnouncements":
                return await rpcCall("saas_manage_announcements", { p_token: data.token || "", p_action: data.action || "list", p_payload: data.payload || {} });

            case "saasGetHqAuditLog":
                return await rpcCall("saas_get_hq_audit_log", { p_token: data.token || "", p_limit: data.limit || 60 });

            case "saasUpdateMasterConfig":
                return await rpcCall("saas_update_master_config", { p_token: data.token || "", p_current_secret: data.current_secret || "", p_new_secret: data.new_secret || null, p_support_phone: data.support_phone ?? null });

            default:
                return { success: false, message: "Unknown API action: " + action };
        }
    } catch (err) {
        return { success: false, message: err && err.message ? err.message : "Network error." };
    }
}

// =========================================================
// 2. SESSION TTL, SAFE SVG SANITIZER, EGRESS-SAFE POLLER & CORE HELPERS
// =========================================================
function setSessionToken(storageKey, token, ttlMs = 12 * 60 * 60 * 1000) {
    if (!storageKey || !token) return;
    try {
        sessionStorage.setItem(storageKey, JSON.stringify({
            token: String(token),
            expiresAt: Date.now() + ttlMs
        }));
    } catch (_) {}
}

function getSessionToken(storageKey) {
    if (!storageKey) return "";
    try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return "";
        if (raw.startsWith("{")) {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.token !== "string" || !parsed.token) {
                sessionStorage.removeItem(storageKey);
                return "";
            }
            if (typeof parsed.expiresAt === "number" && Date.now() > parsed.expiresAt) {
                sessionStorage.removeItem(storageKey);
                return "";
            }
            return parsed.token;
        }
        // Upgrade legacy plain token cleanly with remaining TTL
        setSessionToken(storageKey, raw);
        return raw;
    } catch (_) {
        try { sessionStorage.removeItem(storageKey); } catch (_) {}
        return "";
    }
}

function clearSessionToken(storageKey) {
    if (!storageKey) return;
    try { sessionStorage.removeItem(storageKey); } catch (_) {}
}

function renderSafeCaptchaSvg(containerId, svgStr) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const SVG_NS = "http://www.w3.org/2000/svg";
    const ALLOWED_TAGS = new Set(["svg", "rect", "g", "path", "line", "circle", "polyline", "polygon", "text"]);
    const ALLOWED_ATTRS = new Set([
        "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
        "cx", "cy", "r", "rx", "ry", "d", "transform", "fill", "stroke",
        "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity", "points", "font-size"
    ]);
    try {
        const doc = new DOMParser().parseFromString(String(svgStr || ""), "image/svg+xml");
        if (doc.querySelector("parsererror")) { el.textContent = "CAPTCHA unavailable"; return; }
        const srcRoot = doc.documentElement;
        if (!srcRoot || srcRoot.tagName.toLowerCase() !== "svg") { el.textContent = "CAPTCHA unavailable"; return; }

        const cloneSafe = (node) => {
            if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
            if (node.nodeType !== Node.ELEMENT_NODE) return null;
            const tag = node.tagName.toLowerCase();
            if (!ALLOWED_TAGS.has(tag)) return null;
            const out = document.createElementNS(SVG_NS, tag);
            for (const attr of Array.from(node.attributes)) {
                const name = attr.name.toLowerCase();
                if (name.startsWith("on") || !ALLOWED_ATTRS.has(name)) continue;
                const val = String(attr.value || "");
                if (/javascript:|data:|expression\s*\(/i.test(val)) continue;
                out.setAttribute(attr.name, val);
            }
            for (const child of Array.from(node.childNodes)) {
                const safeChild = cloneSafe(child);
                if (safeChild) out.appendChild(safeChild);
            }
            return out;
        };

        const cleanSvg = cloneSafe(srcRoot);
        if (cleanSvg) el.replaceChildren(cleanSvg);
        else el.textContent = "CAPTCHA unavailable";
    } catch (_) {
        el.textContent = "CAPTCHA unavailable";
    }
}

function createAdaptivePoller(opts) {
    const baseMs = Math.max(Number(opts.baseMs || 10000), 3000);
    const maxMs = Math.max(Number(opts.maxMs || 45000), baseMs);
    const shouldRun = typeof opts.shouldRun === "function" ? opts.shouldRun : () => true;
    const pollFn = opts.pollFn;
    let timer = null;
    let inFlight = false;
    let currentDelay = baseMs;
    let unchangedStreak = 0;
    let lastCompletedAt = 0;
    let stopped = false;

    const scheduleNext = () => {
        if (stopped) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => run(false), currentDelay);
    };

    const run = async (force = false) => {
        if (stopped) return;
        if (!force && (document.hidden || !navigator.onLine || !shouldRun())) {
            scheduleNext();
            return;
        }
        if (inFlight) return;
        inFlight = true;
        if (timer) { clearTimeout(timer); timer = null; }
        try {
            const changed = await pollFn(force);
            lastCompletedAt = Date.now();
            if (force || changed) {
                unchangedStreak = 0;
                currentDelay = baseMs;
            } else {
                unchangedStreak++;
                if (unchangedStreak >= 6) currentDelay = maxMs;
                else if (unchangedStreak >= 3) currentDelay = Math.min(Math.round(baseMs * 2), maxMs);
                else if (unchangedStreak >= 1) currentDelay = Math.min(Math.round(baseMs * 1.4), maxMs);
            }
        } finally {
            inFlight = false;
            scheduleNext();
        }
    };

    const onWake = () => {
        if (stopped || document.hidden || !shouldRun()) return;
        unchangedStreak = 0;
        currentDelay = baseMs;
        if (Date.now() - lastCompletedAt >= Math.min(baseMs, 4000)) {
            run(false);
        } else {
            scheduleNext();
        }
    };

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    return {
        start(runImmediately = true) {
            stopped = false;
            if (runImmediately) run(true);
            else scheduleNext();
        },
        pollNow(force = false) { return run(force); },
        poke() {
            unchangedStreak = 0;
            currentDelay = baseMs;
            scheduleNext();
        },
        stop() {
            stopped = true;
            if (timer) clearTimeout(timer);
            timer = null;
        }
    };
}

function makeIdempotencyKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "idem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function initOfflineBanner() {
    initServiceWorker();
    let el = document.getElementById("clinicosOfflineBar");
    if (!el) {
        el = document.createElement("div");
        el.id = "clinicosOfflineBar";
        el.setAttribute("role", "alert");
        el.style.cssText = "display:none;position:fixed;top:0;left:0;right:0;z-index:99998;background:#dc2626;color:#fff;text-align:center;padding:8px 12px;font-size:13px;font-weight:700;";
        el.textContent = "Internet connection lost — Offline Mode. Reconnecting automatically...";
        document.body.prepend(el);
    }
    const sync = () => { el.style.display = navigator.onLine ? "none" : "block"; };
    window.addEventListener("online", () => { sync(); showToast("Back online!"); });
    window.addEventListener("offline", sync);
    sync();
}

function renderAnnouncementBanner(containerId, announcements) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!Array.isArray(announcements) || !announcements.length) {
        el.classList.add("hidden");
        el.innerHTML = "";
        return;
    }
    el.classList.remove("hidden");
    el.innerHTML = announcements.map((a) => {
        const bg = a.severity === "urgent" ? "#fef2f2;border-color:#dc2626;color:#991b1b" : a.severity === "warn" ? "#fffbeb;border-color:#d97706;color:#92400e" : "#eff6ff;border-color:#0284c7;color:#075985";
        return `<div role="status" style="background:${bg};border:1px solid;border-radius:10px;padding:9px 14px;margin-bottom:8px;font-size:13px;"><strong>${escapeHTML(a.title)}:</strong> ${escapeHTML(a.message)}</div>`;
    }).join("");
}

function applyThemePreset(themeKey) {
    const t = THEME_PRESETS[themeKey] || THEME_PRESETS.ocean;
    const r = document.documentElement;
    r.style.setProperty("--primary", t.primary);
    r.style.setProperty("--primary-dark", t.primaryDark);
    r.style.setProperty("--accent", t.accent);
    r.style.setProperty("--bg-soft", t.bgSoft);
}

function getDeptIntakeFields(deptObj, clinicObj) {
    if (deptObj && Array.isArray(deptObj.intake_fields) && deptObj.intake_fields.length > 0) return deptObj.intake_fields;
    const presetKey = (deptObj && deptObj.specialty_preset) || (clinicObj && clinicObj.specialty_preset) || "general";
    return (SPECIALTY_PRESETS[presetKey] || SPECIALTY_PRESETS.general).fields;
}

function getAppLocale() {
    return (CONFIG && CONFIG.APP && CONFIG.APP.LOCALE) || "en-IN";
}

function getAppTimezone() {
    return (CONFIG && CONFIG.APP && CONFIG.APP.TIMEZONE) || "Asia/Kolkata";
}

function getTodayIST() {
    try {
        const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: getAppTimezone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        if (/^\d{4}-\d{2}-\d{2}$/.test(fmt)) return fmt;
    } catch (_) {}
    const now = new Date();
    const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
    return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
}

function addDaysYMD(ymd, days) {
    const clean = normalizeYMD(ymd) || getTodayIST();
    const p = clean.split("-").map(Number);
    const dt = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
    dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
    return dt.toISOString().slice(0, 10);
}

function getDefaultShiftIST(clinic = null) {
    const cutoff = Number((clinic && clinic.billing_config && clinic.billing_config.shift_cutoff_hour) ?? 15);
    try {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: getAppTimezone(), hour: "numeric", hour12: false }).formatToParts(new Date());
        const hrPart = parts.find((p) => p.type === "hour");
        const hr = Number(hrPart ? hrPart.value : 0) % 24;
        return hr < cutoff ? "morning" : "evening";
    } catch (_) {
        const now = new Date();
        const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
        return ist.getHours() < cutoff ? "morning" : "evening";
    }
}

function normalizeYMD(val) {
    if (!val) return "";
    const s = String(val).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return "";
}

function compareYMD(a, b) {
    const na = normalizeYMD(a), nb = normalizeYMD(b);
    if (!na || !nb) return null;
    const da = Date.UTC(...na.split("-").map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
    const db = Date.UTC(...nb.split("-").map((v, i) => i === 1 ? Number(v) - 1 : Number(v)));
    return da < db ? -1 : da > db ? 1 : 0;
}

function formatDateLabel(ymd) {
    if (!ymd) return "";
    const norm = normalizeYMD(ymd);
    if (!norm) return String(ymd);
    const p = norm.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString(getAppLocale(), { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatDateTimeIST(isoStr) {
    if (!isoStr) return "";
    try { return new Date(isoStr).toLocaleString(getAppLocale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: getAppTimezone() }); }
    catch (_) { return isoStr; }
}

function escapeHTML(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeJsAttr(str) {
    return String(str ?? "")
        .replace(/\\/g, "\\x5c")
        .replace(/'/g, "\\x27")
        .replace(/"/g, "\\x22")
        .replace(/&/g, "\\x26")
        .replace(/</g, "\\x3c")
        .replace(/>/g, "\\x3e")
        .replace(/`/g, "\\x60")
        .replace(/[\r\n\u2028\u2029]+/g, " ");
}

function formatAuditDetailsSafe(details) {
    const REDACT_RE = /(password|secret|token|hash|otp|key|auth|pin)/i;
    const sanitize = (obj, depth = 0) => {
        if (depth > 3 || obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.slice(0, 10).map((v) => sanitize(v, depth + 1));
        if (typeof obj === "object") {
            const out = {};
            for (const [k, v] of Object.entries(obj)) {
                out[k] = REDACT_RE.test(k) ? "[REDACTED]" : sanitize(v, depth + 1);
            }
            return out;
        }
        return typeof obj === "string" && obj.length > 160 ? obj.slice(0, 160) + "…" : obj;
    };
    try {
        return JSON.stringify(sanitize(details || {}));
    } catch (_) {
        return "{}";
    }
}

let _lastToastKey = "", _lastToastAt = 0;
function showToast(message, type = "success") {
    const msg = String(message || "");
    const now = Date.now();
    const key = type + "|" + msg;
    if (key === _lastToastKey && now - _lastToastAt < 1500) return;
    _lastToastKey = key; _lastToastAt = now;

    let box = document.getElementById("clinicosToastBox");
    if (!box) {
        box = document.createElement("div");
        box.id = "clinicosToastBox";
        box.setAttribute("aria-live", "polite");
        box.style.cssText = "position:fixed;bottom:18px;right:18px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:360px;";
        document.body.appendChild(box);
    }
    while (box.children.length >= 4) box.firstChild.remove();
    const item = document.createElement("div");
    item.setAttribute("role", type === "error" ? "alert" : "status");
    const bg = type === "error" ? "#dc2626" : type === "warn" ? "#d97706" : "#0f172a";
    item.style.cssText = `background:${bg};color:#fff;padding:11px 15px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 10px 24px rgba(0,0,0,0.2);transition:opacity .25s;`;
    item.textContent = msg;
    box.appendChild(item);
    setTimeout(() => { item.style.opacity = "0"; setTimeout(() => item.remove(), 260); }, 3200);
}

// =========================================================
// 3. AUDIO CHIME, QUEUED TV VOICE CALLING & VOICE-TO-TEXT
// =========================================================
let _audioCtx = null;
function getAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!_audioCtx) _audioCtx = new Ctx();
    if (_audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
    return _audioCtx;
}

function playHospitalDingDong() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        [880, 659.25].forEach((freq, idx) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = "sine"; osc.frequency.setValueAtTime(freq, now + idx * 0.22);
            gain.gain.setValueAtTime(0.001, now + idx * 0.22);
            gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.22 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.22 + 0.55);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now + idx * 0.22); osc.stop(now + idx * 0.22 + 0.58);
        });
    } catch (_) {}
}

function playOnlineRequestRing() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = "triangle"; osc.frequency.setValueAtTime(freq, now + idx * 0.12);
            gain.gain.setValueAtTime(0.14, now + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.25);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now + idx * 0.12); osc.stop(now + idx * 0.12 + 0.28);
        });
    } catch (_) {}
}

const _voiceQueue = [];
let _voiceSpeaking = false;

function _drainVoiceQueue() {
    if (_voiceSpeaking || !_voiceQueue.length) return;
    const item = _voiceQueue.shift();
    _voiceSpeaking = true;
    playHospitalDingDong();
    if (!("speechSynthesis" in window)) {
        setTimeout(() => { _voiceSpeaking = false; _drainVoiceQueue(); }, 900);
        return;
    }
    let finished = false;
    const done = () => {
        if (finished) return;
        finished = true;
        _voiceSpeaking = false;
        _drainVoiceQueue();
    };
    const safety = setTimeout(done, 10000);
    setTimeout(() => {
        try {
            const utter = new SpeechSynthesisUtterance(item);
            utter.lang = getAppLocale(); utter.rate = 0.92;
            utter.onend = () => { clearTimeout(safety); done(); };
            utter.onerror = () => { clearTimeout(safety); done(); };
            window.speechSynthesis.speak(utter);
        } catch (_) {
            clearTimeout(safety); done();
        }
    }, 550);
}

function announceTokenVoice(tokenLabel, patientName, roomLabel) {
    const cleanTok = String(tokenLabel || "").replace("#", "");
    const namePart = patientName ? `, ${patientName}` : "";
    const roomPart = roomLabel ? `, please proceed to ${roomLabel}` : ", please proceed to the doctor cabin";
    const text = `Token number ${cleanTok}${namePart}${roomPart}.`;
    if (_voiceQueue.length < 6) _voiceQueue.push(text);
    _drainVoiceQueue();
}

let _activeRecognition = null;
function startVoiceDictation(targetEl, btnEl, lang = "en-IN") {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast("Voice dictation requires Chrome or Edge.", "warn"); return; }
    if (_activeRecognition) { try { _activeRecognition.stop(); } catch (_) {} _activeRecognition = null; }
    const rec = new SR();
    rec.lang = lang || getAppLocale(); rec.interimResults = false; rec.maxAlternatives = 1;
    _activeRecognition = rec;
    const orig = btnEl ? btnEl.textContent : "";
    if (btnEl) { btnEl.textContent = "Listening..."; btnEl.classList.add("mic-listening"); }
    rec.onresult = (ev) => {
        const t = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : "";
        if (t && targetEl) {
            const sep = targetEl.value && !targetEl.value.endsWith(" ") && !targetEl.value.endsWith("\n") ? " " : "";
            targetEl.value = (targetEl.value || "") + sep + t;
            targetEl.dispatchEvent(new Event("input", { bubbles: true }));
        }
    };
    rec.onerror = () => showToast("Microphone error. Check browser permission.", "warn");
    rec.onend = () => { if (btnEl) { btnEl.textContent = orig; btnEl.classList.remove("mic-listening"); } _activeRecognition = null; };
    try { rec.start(); } catch (_) { showToast("Microphone busy.", "warn"); }
}

// =========================================================
// 4. WHATSAPP (wa.me) & CSV EXPORT
// =========================================================
function waNumber(raw, defaultCc) {
    const cc = String(defaultCc || (CONFIG && CONFIG.APP && CONFIG.APP.DEFAULT_COUNTRY_CODE) || "91").replace(/[^0-9]/g, "");
    const trimmed = String(raw || "").trim();
    const hasPlus = trimmed.startsWith("+");
    let d = trimmed.replace(/[^0-9]/g, "");
    if (!d) return "";
    if (hasPlus) return d;
    if (trimmed.startsWith("00") && d.length > 10) return d.slice(2);
    if (d.length === 11 && d.startsWith("0")) return cc + d.slice(1);
    if (d.length === 10) return cc + d;
    return d;
}

function openWhatsApp(phone, msg) {
    const num = waNumber(phone);
    if (!num || num.length < 10) { showToast("Valid 10-digit mobile number required.", "warn"); return; }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
}

function sendWhatsAppToken(visit, clinic) {
    const baseUrl = window.location.href.split("?")[0].replace(/[^/]+$/, "index.html");
    const liveUrl = `${baseUrl}?c=${encodeURIComponent((clinic && clinic.slug) || CONFIG.TENANT.SLUG)}`;
    const tok = visit.token_label || ("#" + visit.token_no);
    openWhatsApp(visit.phone, `*${(clinic && clinic.name) || "Clinic"}*\nNamaste ${visit.name || "Patient"} ji,\nYour OPD Token *${tok}* (${visit.doctor_name || "Doctor"}) is confirmed for *${formatDateLabel(visit.token_day)}* (${visit.shift_key || "morning"} shift).\n${visit.uhid ? "UHID: " + visit.uhid + "\n" : ""}Track Live Queue: ${liveUrl}`);
}

function sendWhatsAppRxSummary(visit, clinic) {
    const meds = Array.isArray(visit.rx_medicines) ? visit.rx_medicines : [];
    const medLines = meds.map((m, i) => `${i + 1}. ${m.name || ""} ${m.dosage || ""} (${m.duration || ""})`).join("\n");
    openWhatsApp(visit.phone, `*${(clinic && clinic.name) || "Clinic"} — Consultation Summary*\nPatient: ${visit.name || ""} ${visit.uhid ? "(" + visit.uhid + ")" : ""}\nDoctor: ${visit.doctor_name || ""}\n${visit.diagnosis ? "Diagnosis: " + visit.diagnosis + "\n" : ""}${medLines ? "\n*Medicines:*\n" + medLines + "\n" : ""}${visit.lab_tests ? "\n*Tests:* " + visit.lab_tests + "\n" : ""}${visit.advice ? "\n*Advice:* " + visit.advice + "\n" : ""}${visit.recall_due_date ? "\n*Follow-Up:* " + formatDateLabel(visit.recall_due_date) + "\n" : ""}\nGet well soon!`);
}

function sendWhatsAppFollowup(visit, clinic) {
    openWhatsApp(visit.phone, `Namaste ${visit.name || "Patient"} ji,\nGentle follow-up reminder from *${(clinic && clinic.name) || "Clinic"}* with *${visit.doctor_name || "Doctor"}* due on *${formatDateLabel(visit.recall_due_date)}*.\nCall ${(clinic && clinic.phone) || ""} to confirm.`);
}

function csvEscape(val) {
    const s = String(val ?? "");
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportVisitsToCsv(visits, clinic, filename) {
    const headers = ["Date","Shift","Token","UHID","Receipt No","Patient Name","Father/Guardian","Phone","Age","Gender","Address","Dept","Doctor","Status","Allergies","Diagnosis","Gross Fee","Discount","Paid","Balance Due","Refund","Mode","Pay Status","Staff","Follow-Up"];
    const lines = [headers.map(csvEscape).join(",")];
    (visits || []).forEach((v) => {
        lines.push([v.token_day, v.shift_key, v.token_label || ("#" + v.token_no), v.uhid || "", v.receipt_no || "", v.name, v.father_name || "", v.phone, v.age, v.gender, v.address || "", v.dept_code || "", v.doctor_name || "", v.status, v.drug_allergies || "", v.diagnosis || "", v.fee || 0, v.discount_amount || 0, v.paid_amount || 0, v.balance_due || 0, v.refund_amount || 0, v.payment_mode || "", v.payment_status || "", v.created_by || "", v.recall_due_date || ""].map(csvEscape).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename || `${(clinic && clinic.slug) || "clinicos"}_visits_${getTodayIST()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
}

// =========================================================
// 5. LOCAL ZERO-EGRESS QR CODE SVG GENERATOR (ISO 18004, EC-M, V1-V9)
// =========================================================
const _QR_GF_EXP = new Uint8Array(512);
const _QR_GF_LOG = new Uint8Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        _QR_GF_EXP[i] = x; _QR_GF_EXP[i + 255] = x; _QR_GF_LOG[x] = i;
        x <<= 1; if (x & 0x100) x ^= 0x11d;
    }
})();
function _qrGfMul(a, b) { return (a === 0 || b === 0) ? 0 : _QR_GF_EXP[_QR_GF_LOG[a] + _QR_GF_LOG[b]]; }
function _qrRsGen(deg) {
    let g = [1];
    for (let i = 0; i < deg; i++) {
        const next = new Array(g.length + 1).fill(0);
        const factor = _QR_GF_EXP[i];
        for (let j = 0; j < g.length; j++) {
            next[j] ^= g[j];
            next[j + 1] ^= _qrGfMul(g[j], factor);
        }
        g = next;
    }
    return g;
}
function _qrRsEncode(data, ecCount) {
    const gen = _qrRsGen(ecCount);
    const res = new Uint8Array(data.length + ecCount);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
        const coef = res[i];
        if (coef !== 0) {
            for (let j = 0; j < gen.length; j++) res[i + j] ^= _qrGfMul(gen[j], coef);
        }
    }
    return res.slice(data.length);
}
const _QR_SPEC_M = [
    null,
    { v: 1, sz: 21, ec: 10, g1b: 1, g1d: 16, g2b: 0, g2d: 0, align: [] },
    { v: 2, sz: 25, ec: 16, g1b: 1, g1d: 28, g2b: 0, g2d: 0, align: [6, 18] },
    { v: 3, sz: 29, ec: 26, g1b: 1, g1d: 44, g2b: 0, g2d: 0, align: [6, 22] },
    { v: 4, sz: 33, ec: 18, g1b: 2, g1d: 32, g2b: 0, g2d: 0, align: [6, 26] },
    { v: 5, sz: 37, ec: 24, g1b: 2, g1d: 43, g2b: 0, g2d: 0, align: [6, 30] },
    { v: 6, sz: 41, ec: 16, g1b: 4, g1d: 27, g2b: 0, g2d: 0, align: [6, 34] },
    { v: 7, sz: 45, ec: 18, g1b: 4, g1d: 31, g2b: 0, g2d: 0, align: [6, 22, 38] },
    { v: 8, sz: 49, ec: 22, g1b: 2, g1d: 38, g2b: 2, g2d: 39, align: [6, 24, 42] },
    { v: 9, sz: 53, ec: 22, g1b: 3, g1d: 36, g2b: 2, g2d: 37, align: [6, 26, 46] }
];

function buildQrSvg(text, sizePx = 280) {
    const bytes = new TextEncoder().encode(String(text || ""));
    const spec = _QR_SPEC_M.slice(1).find((s) => (s.g1b * s.g1d + s.g2b * s.g2d) >= bytes.length + 2);
    if (!spec) return `<div style="padding:16px;border:1px solid #cbd5e1;">URL too long for QR</div>`;

    const dataCap = spec.g1b * spec.g1d + spec.g2b * spec.g2d;
    const bits = [];
    const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    pushBits(0b0100, 4); // Byte mode
    pushBits(bytes.length, 8);
    bytes.forEach((b) => pushBits(b, 8));
    for (let i = 0; i < 4 && bits.length < dataCap * 8; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    let padIdx = 0;
    while (bits.length < dataCap * 8) { pushBits(padIdx++ % 2 === 0 ? 0xEC : 0x11, 8); }

    const dataBytes = new Uint8Array(dataCap);
    for (let i = 0; i < dataCap; i++) {
        let v = 0;
        for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
        dataBytes[i] = v;
    }

    const blocks = [], ecBlocks = [];
    let off = 0;
    for (let i = 0; i < spec.g1b; i++) { const sl = dataBytes.slice(off, off + spec.g1d); blocks.push(sl); ecBlocks.push(_qrRsEncode(sl, spec.ec)); off += spec.g1d; }
    for (let i = 0; i < spec.g2b; i++) { const sl = dataBytes.slice(off, off + spec.g2d); blocks.push(sl); ecBlocks.push(_qrRsEncode(sl, spec.ec)); off += spec.g2d; }

    const stream = [];
    const maxD = Math.max(spec.g1d, spec.g2d);
    for (let i = 0; i < maxD; i++) blocks.forEach((b) => { if (i < b.length) stream.push(b[i]); });
    for (let i = 0; i < spec.ec; i++) ecBlocks.forEach((eb) => stream.push(eb[i]));

    const N = spec.sz;
    const mod = Array.from({ length: N }, () => new Int8Array(N).fill(-1));
    const isFn = Array.from({ length: N }, () => new Uint8Array(N));
    const setFn = (r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) { mod[r][c] = v ? 1 : 0; isFn[r][c] = 1; } };

    const drawFinder = (r0, c0) => {
        for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
            const in7 = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
            const dark = in7 && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
            setFn(r0 + dr, c0 + dc, dark ? 1 : 0);
        }
    };
    drawFinder(0, 0); drawFinder(0, N - 7); drawFinder(N - 7, 0);

    for (let i = 8; i < N - 8; i++) { setFn(6, i, i % 2 === 0 ? 1 : 0); setFn(i, 6, i % 2 === 0 ? 1 : 0); }
    setFn(N - 8, 8, 1);

    for (const r of spec.align) for (const c of spec.align) {
        if (isFn[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
            setFn(r + dr, c + dc, Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0) ? 1 : 0);
        }
    }

    // Reserve format & version info areas
    for (let i = 0; i <= 8; i++) { if (!isFn[8][i]) isFn[8][i] = 1; if (!isFn[i][8]) isFn[i][8] = 1; }
    for (let i = N - 8; i < N; i++) { isFn[8][i] = 1; isFn[i][8] = 1; }
    if (spec.v >= 7) {
        let rem = spec.v << 12;
        for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= (0x1F25 << (i - 12));
        const vBits = (spec.v << 12) | rem;
        for (let i = 0; i < 18; i++) {
            const bit = (vBits >> i) & 1;
            const a = Math.floor(i / 3), b = i % 3;
            setFn(N - 11 + b, a, bit); setFn(a, N - 11 + b, bit);
        }
    }

    // Place data bits in zigzag
    let bitIdx = 0;
    const totalBits = stream.length * 8;
    for (let col = N - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        const up = ((N - 1 - col) >> 1) % 2 === 0;
        for (let step = 0; step < N; step++) {
            const r = up ? (N - 1 - step) : step;
            for (const c of [col, col - 1]) {
                if (!isFn[r][c]) {
                    const bit = bitIdx < totalBits ? ((stream[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) : 0;
                    mod[r][c] = bit;
                    bitIdx++;
                }
            }
        }
    }

    const maskFns = [
        (r, c) => (r + c) % 2 === 0,
        (r) => r % 2 === 0,
        (_r, c) => c % 3 === 0,
        (r, c) => (r + c) % 3 === 0,
        (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
        (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
        (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
        (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    ];

    let bestMask = 0, bestPenalty = Infinity, bestGrid = null;
    for (let m = 0; m < 8; m++) {
        const g = mod.map((row, r) => row.map((v, c) => isFn[r][c] ? v : (v ^ (maskFns[m](r, c) ? 1 : 0))));
        // Apply Format Info (EC Level M = 00)
        const d = (0b00 << 3) | m;
        let rem = d << 10;
        for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= (0x537 << (i - 10));
        const fmt = ((d << 10) | rem) ^ 0x5412;
        for (let i = 0; i <= 5; i++) g[8][i] = (fmt >> i) & 1;
        g[8][7] = (fmt >> 6) & 1; g[8][8] = (fmt >> 7) & 1; g[7][8] = (fmt >> 8) & 1;
        for (let i = 9; i < 15; i++) g[14 - i][8] = (fmt >> i) & 1;
        for (let i = 0; i < 8; i++) g[N - 1 - i][8] = (fmt >> i) & 1;
        for (let i = 8; i < 15; i++) g[8][N - 15 + i] = (fmt >> i) & 1;

        let pen = 0;
        for (let r = 0; r < N; r++) {
            let runR = 1, runC = 1;
            for (let c = 1; c < N; c++) {
                runR = g[r][c] === g[r][c - 1] ? runR + 1 : 1; if (runR === 5) pen += 3; else if (runR > 5) pen += 1;
                runC = g[c][r] === g[c - 1][r] ? runC + 1 : 1; if (runC === 5) pen += 3; else if (runC > 5) pen += 1;
            }
        }
        for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) {
            const s = g[r][c] + g[r + 1][c] + g[r][c + 1] + g[r + 1][c + 1];
            if (s === 0 || s === 4) pen += 3;
        }
        if (pen < bestPenalty) { bestPenalty = pen; bestMask = m; bestGrid = g; }
    }

    const rects = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (bestGrid[r][c]) rects.push(`<rect x="${c + 4}" y="${r + 4}" width="1" height="1"/>`);
    }
    const vb = N + 8;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" role="img" aria-label="Clinic QR Code"><rect width="${vb}" height="${vb}" fill="#ffffff"/><g fill="#0f172a">${rects.join("")}</g></svg>`;
}

// =========================================================
// 6. COMPLETE PRINT ENGINE (A4 RX, MULTI-ITEM RECEIPT, LAB, MCI CERT, THERMAL, QR, SHIFT EOD)
// =========================================================
function openPrintWindow(title, bodyHtml, pageCss = "@page { size: A4; margin: 12mm; }") {
    const w = window.open("", "_blank", "width=860,height=960");
    if (!w) { showToast("Pop-up blocked! Allow pop-ups to print.", "warn"); return; }
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHTML(title)}</title><style>
      ${pageCss}
      * { box-sizing:border-box; }
      body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; color:#0f172a; margin:0; padding:0; font-size:13px; line-height:1.45; }
      .header-full { border-bottom:2.5px solid #0f172a; padding-bottom:10px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
      .clinic-title { font-size:23px; font-weight:900; letter-spacing:0.4px; text-transform:uppercase; color:#0f172a; margin:0; }
      .clinic-sub { font-size:12px; color:#334155; margin-top:3px; }
      .doc-box { text-align:right; min-width:210px; }
      .doc-name { font-size:15px; font-weight:800; color:#0369a1; }
      .doc-meta { font-size:11.5px; color:#334155; }
      .pt-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px 12px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; margin-bottom:10px; font-size:12px; }
      .allergy-box { background:#fef2f2; border:1.5px solid #dc2626; color:#991b1b; padding:6px 10px; border-radius:6px; font-weight:700; margin-bottom:10px; font-size:12px; }
      .sec-title { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:#0369a1; border-bottom:1px solid #e2e8f0; padding-bottom:3px; margin:10px 0 6px; }
      table { width:100%; border-collapse:collapse; margin-top:6px; }
      th, td { border:1px solid #cbd5e1; padding:6px 8px; text-align:left; font-size:12px; }
      th { background:#f1f5f9; font-weight:700; }
      .rx-symbol { font-size:22px; font-weight:900; font-family:Georgia,serif; color:#0f172a; margin:8px 0 4px; }
      .footer-sign { margin-top:34px; display:flex; justify-content:space-between; align-items:flex-end; border-top:1px dashed #94a3b8; padding-top:10px; font-size:12px; }
      .sign-line { border-top:1px solid #0f172a; padding-top:4px; min-width:190px; text-align:center; font-weight:700; }
    </style></head><body>${bodyHtml}<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>`);
    w.document.close();
}

function buildLetterheadHtml(clinic, doctor, dept) {
    if (clinic && clinic.rx_header_mode === "preprinted") return `<div style="height:${Number(clinic.rx_header_mm || 42)}mm;"></div>`;
    const docName = (doctor && doctor.name) || (clinic && clinic.doctor_name) || "";
    const docDeg = (doctor && doctor.degree) || (clinic && clinic.degree) || "";
    const docReg = (doctor && doctor.reg_no) || (clinic && clinic.reg_no) || "";
    const docSpec = (doctor && doctor.specialty) || (dept && dept.name) || (clinic && clinic.specialty) || "";
    return `<div class="header-full"><div><h1 class="clinic-title">${escapeHTML((clinic && clinic.name) || "ClinicOS Facility")}</h1>${clinic && clinic.tagline ? `<div class="clinic-sub" style="font-weight:600;">${escapeHTML(clinic.tagline)}</div>` : ""}<div class="clinic-sub">${escapeHTML((clinic && clinic.address) || "")} ${clinic && clinic.city ? ", " + escapeHTML(clinic.city) : ""}</div><div class="clinic-sub">Phone: ${escapeHTML((clinic && clinic.phone) || "-")} ${clinic && clinic.gst_number ? " | GSTIN: " + escapeHTML(clinic.gst_number) : ""}</div>${clinic && clinic.timings ? `<div class="clinic-sub">Timings: ${escapeHTML(clinic.timings)}</div>` : ""}</div><div class="doc-box"><div class="doc-name">${escapeHTML(docName)}</div>${docDeg ? `<div class="doc-meta">${escapeHTML(docDeg)}</div>` : ""}${docSpec ? `<div class="doc-meta">${escapeHTML(docSpec)}</div>` : ""}${docReg ? `<div class="doc-meta"><strong>Reg. No:</strong> ${escapeHTML(docReg)}</div>` : ""}</div></div>`;
}

function printPrescriptionLetterhead(visit, clinic, doctor, dept) {
    const vitalsObj = (visit && visit.vitals_json && typeof visit.vitals_json === "object") ? visit.vitals_json : {};
    const vitalsEntries = Object.entries(vitalsObj).filter(([, v]) => String(v || "").trim() !== "");
    const meds = Array.isArray(visit.rx_medicines) ? visit.rx_medicines : [];
    const medsHtml = meds.length > 0
        ? `<table><thead><tr><th>#</th><th>Medicine Name</th><th>Dosage / Timing</th><th>Duration</th></tr></thead><tbody>` + meds.map((m, i) => `<tr><td>${i + 1}</td><td><strong>${escapeHTML(m.name || "")}</strong></td><td>${escapeHTML(m.dosage || "")}</td><td>${escapeHTML(m.duration || "")}</td></tr>`).join("") + `</tbody></table>`
        : `<div style="height:80mm;"></div>`;
    const html = `${buildLetterheadHtml(clinic, doctor, dept)}
        <div class="pt-grid">
            <div><strong>Patient:</strong> ${escapeHTML(visit.name || "-")}</div><div><strong>Age / Sex:</strong> ${escapeHTML(visit.age || "-")} / ${escapeHTML(visit.gender || "-")}</div><div><strong>Date:</strong> ${escapeHTML(formatDateLabel(visit.token_day || getTodayIST()))}</div>
            <div><strong>S/o / D/o / W/o:</strong> ${escapeHTML(visit.father_name || "-")}</div><div><strong>Phone:</strong> ${escapeHTML(visit.phone || "-")}</div><div><strong>UHID / Token:</strong> ${escapeHTML(visit.uhid || "-")} | ${escapeHTML(visit.token_label || ("#" + visit.token_no))}</div>
            <div style="grid-column:span 3;"><strong>Address:</strong> ${escapeHTML(visit.address || "-")}</div>
        </div>
        ${visit.drug_allergies ? `<div class="allergy-box">⚠ KNOWN DRUG ALLERGIES: ${escapeHTML(visit.drug_allergies)}</div>` : ""}
        ${vitalsEntries.length > 0 || visit.reception_remarks ? `<div class="sec-title">Pre-Examination Intake & Remarks</div><div style="font-size:12px;">${vitalsEntries.map(([k, v]) => `<span style="display:inline-block;margin-right:14px;"><strong>${escapeHTML(k)}:</strong> ${escapeHTML(v)}</span>`).join("")}${visit.reception_remarks ? `<div style="margin-top:4px;"><strong>Remarks:</strong> ${escapeHTML(visit.reception_remarks)}</div>` : ""}</div>` : ""}
        ${visit.chief_complaint ? `<div class="sec-title">Chief Complaints</div><div>${escapeHTML(visit.chief_complaint)}</div>` : ""}
        ${visit.diagnosis ? `<div class="sec-title">Diagnosis</div><div style="font-weight:700;">${escapeHTML(visit.diagnosis)}</div>` : ""}
        <div class="rx-symbol">℞</div>${medsHtml}
        ${visit.lab_tests ? `<div class="sec-title">Investigations / Lab Tests Advised</div><div style="white-space:pre-wrap;">${escapeHTML(visit.lab_tests)}</div>` : ""}
        ${visit.advice ? `<div class="sec-title">Advice & Instructions</div><div style="white-space:pre-wrap;">${escapeHTML(visit.advice)}</div>` : ""}
        <div class="footer-sign"><div>${visit.recall_due_date ? `<strong>Next Follow-Up:</strong> ${escapeHTML(formatDateLabel(visit.recall_due_date))}` : "<em>Bring this prescription on your next visit.</em>"}${clinic && clinic.rx_footer_note ? `<div style="font-size:10.5px;color:#475569;margin-top:4px;">${escapeHTML(clinic.rx_footer_note)}</div>` : ""}</div><div class="sign-line">${escapeHTML((doctor && doctor.name) || visit.doctor_name || "Doctor Signature")}</div></div>`;
    openPrintWindow(`Rx_${visit.name || "Patient"}`, html);
}

function printFeeReceipt(visit, clinic, doctor) {
    const items = Array.isArray(visit.billing_items) && visit.billing_items.length
        ? visit.billing_items
        : [{ name: `OPD Consultation — ${visit.doctor_name || "Doctor"} (${visit.dept_code || "OPD"})`, price: Number(visit.fee || 0) }];
    const fee = Number(visit.fee || 0), disc = Number(visit.discount_amount || 0), paid = Number(visit.paid_amount || 0), bal = Number(visit.balance_due || 0), ref = Math.min(Math.max(Number(visit.refund_amount || 0), 0), paid);
    const netCollected = Math.max(paid - ref, 0);
    const html = `${buildLetterheadHtml(clinic, doctor, null)}
        <h2 style="text-align:center;margin:6px 0 10px;font-size:16px;text-transform:uppercase;letter-spacing:1px;">OPD Billing & Fee Receipt</h2>
        <div class="pt-grid">
            <div><strong>Receipt No:</strong> ${escapeHTML(visit.receipt_no || "-")}</div><div><strong>Date:</strong> ${escapeHTML(formatDateLabel(visit.token_day))}</div><div><strong>Token:</strong> ${escapeHTML(visit.token_label || ("#" + visit.token_no))}</div>
            <div><strong>Patient:</strong> ${escapeHTML(visit.name || "-")}</div><div><strong>UHID:</strong> ${escapeHTML(visit.uhid || "-")}</div><div><strong>Phone:</strong> ${escapeHTML(visit.phone || "-")}</div>
        </div>
        <table><thead><tr><th>#</th><th>Particulars / Service</th><th style="text-align:right;">Amount (₹)</th></tr></thead><tbody>
            ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${escapeHTML(it.name || "Service")}</td><td style="text-align:right;">₹${Number(it.price || 0).toFixed(2)}</td></tr>`).join("")}
            ${disc > 0 ? `<tr><td colspan="2">Discount</td><td style="text-align:right;">- ₹${disc.toFixed(2)}</td></tr>` : ""}
            ${ref > 0 ? `<tr><td colspan="2">Amount Collected Before Refund</td><td style="text-align:right;">₹${paid.toFixed(2)}</td></tr><tr><td colspan="2">Refund (${escapeHTML(visit.refund_reason || "Issued")})</td><td style="text-align:right;">- ₹${ref.toFixed(2)}</td></tr>` : ""}
            <tr><td colspan="2"><strong>${ref > 0 ? "Net Amount Retained" : "Amount Paid"} (${escapeHTML(visit.payment_mode || "Cash")} — ${escapeHTML(visit.payment_status || "Paid")})</strong></td><td style="text-align:right;"><strong>₹${netCollected.toFixed(2)}</strong></td></tr>
            ${bal > 0 ? `<tr style="background:#fef2f2;"><td colspan="2"><strong>Balance Due</strong></td><td style="text-align:right;color:#dc2626;"><strong>₹${bal.toFixed(2)}</strong></td></tr>` : ""}
        </tbody></table>
        <div class="footer-sign"><div>Issued by: ${escapeHTML(visit.created_by || "Reception")} | Gross: ₹${fee.toFixed(2)}</div><div class="sign-line">Authorized Signatory</div></div>`;
    openPrintWindow(`Receipt_${visit.receipt_no || visit.name}`, html);
}

function printLabRequisition(visit, clinic, doctor) {
    const html = `${buildLetterheadHtml(clinic, doctor, null)}
        <h2 style="text-align:center;margin:6px 0 10px;font-size:16px;text-transform:uppercase;">Laboratory / Diagnostic Requisition</h2>
        <div class="pt-grid">
            <div><strong>Patient:</strong> ${escapeHTML(visit.name || "-")}</div><div><strong>Age / Sex:</strong> ${escapeHTML(visit.age || "-")} / ${escapeHTML(visit.gender || "-")}</div><div><strong>Date:</strong> ${escapeHTML(formatDateLabel(visit.token_day || getTodayIST()))}</div>
            <div><strong>UHID:</strong> ${escapeHTML(visit.uhid || "-")}</div><div><strong>Phone:</strong> ${escapeHTML(visit.phone || "-")}</div><div><strong>Doctor:</strong> ${escapeHTML((doctor && doctor.name) || visit.doctor_name || "-")}</div>
        </div>
        <div class="sec-title">Tests / Investigations Requested</div>
        <div style="border:1px solid #cbd5e1;border-radius:6px;padding:14px;min-height:110px;white-space:pre-wrap;font-size:14px;font-weight:600;">${escapeHTML(visit.lab_tests || "Please specify required investigations.")}</div>
        <div class="footer-sign"><div>Please bring reports on your next OPD visit.</div><div class="sign-line">${escapeHTML((doctor && doctor.name) || visit.doctor_name || "Doctor Signature")}</div></div>`;
    openPrintWindow(`LabReq_${visit.name || "Patient"}`, html);
}

function printMedicalCertificate(visit, clinic, doctor, certData) {
    const typeTitle = certData.cert_type === "fitness" ? "MEDICAL FITNESS CERTIFICATE" : "MEDICAL LEAVE CERTIFICATE";
    const bodyText = certData.cert_type === "fitness"
        ? `This is to certify that <strong>${escapeHTML(visit.name || "")}</strong> (Age: ${escapeHTML(visit.age || "-")}, Gender: ${escapeHTML(visit.gender || "-")}, UHID: ${escapeHTML(visit.uhid || "-")}, Address: ${escapeHTML(visit.address || "-")}) was examined by me on <strong>${escapeHTML(formatDateLabel(visit.token_day || getTodayIST()))}</strong>. He/She has recovered from <strong>${escapeHTML(certData.condition || visit.diagnosis || "illness")}</strong> and is medically <strong>FIT</strong> to resume duties from <strong>${escapeHTML(formatDateLabel(certData.from_date || getTodayIST()))}</strong>.`
        : `This is to certify that <strong>${escapeHTML(visit.name || "")}</strong> (Age: ${escapeHTML(visit.age || "-")}, Gender: ${escapeHTML(visit.gender || "-")}, UHID: ${escapeHTML(visit.uhid || "-")}, Address: ${escapeHTML(visit.address || "-")}) is under my treatment for <strong>${escapeHTML(certData.condition || visit.diagnosis || "medical condition")}</strong>. In my opinion, a period of rest for <strong>${escapeHTML(certData.days || "3")} day(s)</strong> from <strong>${escapeHTML(formatDateLabel(certData.from_date || getTodayIST()))}</strong> to <strong>${escapeHTML(formatDateLabel(certData.to_date || getTodayIST()))}</strong> is essential for recovery.`;
    const html = `${buildLetterheadHtml(clinic, doctor, null)}
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px;"><strong>Certificate Reg. No: ${escapeHTML(certData.cert_no || "-")}</strong><span>Date: ${escapeHTML(formatDateLabel(getTodayIST()))}</span></div>
        <h2 style="text-align:center;margin:10px 0 16px;font-size:17px;text-decoration:underline;letter-spacing:1px;">${typeTitle}</h2>
        <p style="font-size:14px;line-height:1.85;text-align:justify;">${bodyText}</p>
        <p style="font-size:13px;margin-top:12px;"><strong>Identification Mark (MCI Reg. 1.3.3):</strong> ${escapeHTML(certData.identification_mark || "Verified on file")}</p>
        ${certData.remarks ? `<p style="font-size:13px;"><strong>Remarks:</strong> ${escapeHTML(certData.remarks)}</p>` : ""}
        <div class="footer-sign" style="margin-top:56px;">
            <div class="sign-line">Patient Signature / Thumb Impression</div>
            <div class="sign-line">${escapeHTML((doctor && doctor.name) || visit.doctor_name || "Doctor")}<br><span style="font-weight:400;font-size:11px;">${escapeHTML((doctor && doctor.reg_no) ? "Reg. No: " + doctor.reg_no : "")}</span></div>
        </div>`;
    openPrintWindow(`Certificate_${certData.cert_no || visit.name}`, html);
}

function printThermalTokenSlip(visit, clinic, doctor, dept) {
    const html = `<div style="text-align:center;font-family:monospace;padding:4px;"><div style="font-size:15px;font-weight:900;">${escapeHTML((clinic && clinic.name) || "Clinic")}</div><div style="font-size:11px;">${escapeHTML((clinic && clinic.phone) || "")}</div><div style="border-top:1px dashed #000;margin:6px 0;"></div><div style="font-size:11px;">OPD TOKEN (${escapeHTML((dept && dept.name) || visit.dept_code || "OPD")})</div><div style="font-size:32px;font-weight:900;margin:4px 0;">${escapeHTML(visit.token_label || ("#" + visit.token_no))}</div><div style="font-size:12px;font-weight:700;">${escapeHTML(visit.name || "")}</div><div style="font-size:11px;">UHID: ${escapeHTML(visit.uhid || "-")}</div><div style="font-size:11px;">Doctor: ${escapeHTML((doctor && doctor.name) || visit.doctor_name || "")}</div>${doctor && doctor.room_no ? `<div style="font-size:11px;font-weight:700;">Room: ${escapeHTML(doctor.room_no)}</div>` : ""}<div style="font-size:11px;">Date: ${escapeHTML(formatDateLabel(visit.token_day))} (${escapeHTML(visit.shift_key || "")})</div><div style="border-top:1px dashed #000;margin:6px 0;"></div><div style="font-size:10px;">Paid: ₹${Number(visit.paid_amount || 0)} ${Number(visit.balance_due || 0) > 0 ? "| Bal: ₹" + Number(visit.balance_due) : ""}</div></div>`;
    openPrintWindow(`Token_${visit.token_label || visit.token_no}`, html, "@page { size: 80mm auto; margin: 4mm; }");
}

function printClinicQrPoster(clinic, portalUrl) {
    const qrSvg = buildQrSvg(portalUrl, 280);
    const html = `<div style="text-align:center;padding:24px 16px;border:3px solid #0284c7;border-radius:18px;max-width:620px;margin:10px auto;"><div style="font-size:13px;font-weight:800;color:#0284c7;letter-spacing:1.5px;text-transform:uppercase;">Skip the Queue • Live OPD Token</div><h1 style="font-size:30px;margin:8px 0 4px;color:#0f172a;">${escapeHTML((clinic && clinic.name) || "Clinic")}</h1><div style="font-size:14px;color:#475569;margin-bottom:22px;">${escapeHTML((clinic && clinic.address) || "")}</div><div style="display:inline-block;padding:14px;background:#fff;border:2px solid #cbd5e1;border-radius:14px;">${qrSvg}</div><h2 style="font-size:20px;margin:20px 0 6px;color:#0f172a;">Scan with Phone Camera</h2><p style="font-size:14px;color:#334155;margin:0 0 14px;">1. Check Live Token Running Now &nbsp;•&nbsp; 2. Register Self-Check-In</p><div style="font-size:12px;color:#64748b;word-break:break-all;background:#f8fafc;padding:8px 12px;border-radius:8px;">${escapeHTML(portalUrl)}</div></div>`;
    openPrintWindow(`QR_Poster_${(clinic && clinic.slug) || "clinic"}`, html);
}

function printEodCashReport(eod, byDoctor, byStaffShift, clinic, fromDate, toDate) {
    const docRows = (byDoctor || []).map((d) => `<tr><td>${escapeHTML(d.doctor_name || d.doctor_id)}</td><td style="text-align:right;">${d.visits || 0}</td><td style="text-align:right;">₹${Number(d.net_collection || 0).toFixed(2)}</td></tr>`).join("") || `<tr><td colspan="3">No doctor data.</td></tr>`;
    const staffRows = (byStaffShift || []).map((s) => `<tr><td>${escapeHTML(s.staff)} (${escapeHTML(s.shift_key)})</td><td style="text-align:right;">${s.visits || 0}</td><td style="text-align:right;">₹${Number(s.cash || 0).toFixed(2)}</td><td style="text-align:right;">₹${Number(s.upi || 0).toFixed(2)}</td><td style="text-align:right;">₹${Number(s.card || 0).toFixed(2)}</td><td style="text-align:right;"><strong>₹${Number(s.net || 0).toFixed(2)}</strong></td></tr>`).join("") || `<tr><td colspan="6">No shift data.</td></tr>`;
    const html = `${buildLetterheadHtml(clinic, null, null)}
        <h2 style="text-align:center;margin:8px 0 12px;font-size:16px;text-transform:uppercase;">End-of-Day Shift Cash Handover Report</h2>
        <div style="margin-bottom:10px;font-size:12.5px;"><strong>Period:</strong> ${escapeHTML(formatDateLabel(fromDate))} to ${escapeHTML(formatDateLabel(toDate))} &nbsp;|&nbsp; <strong>Printed:</strong> ${escapeHTML(formatDateLabel(getTodayIST()))}</div>
        <table><thead><tr><th>Collection Head</th><th style="text-align:right;">Amount / Count</th></tr></thead><tbody>
            <tr><td>Total Active / Completed Visits</td><td style="text-align:right;">${eod.total_visits || 0} / ${eod.completed_visits || 0}</td></tr>
            <tr><td>Gross Billed / Discounts / Refunds</td><td style="text-align:right;">₹${Number(eod.gross_fee||0).toFixed(2)} / -₹${Number(eod.total_discount||0).toFixed(2)} / -₹${Number(eod.total_refund||0).toFixed(2)}</td></tr>
            <tr><td>Cash / UPI / Card</td><td style="text-align:right;">₹${Number(eod.cash_total||0).toFixed(2)} / ₹${Number(eod.upi_total||0).toFixed(2)} / ₹${Number(eod.card_total||0).toFixed(2)}</td></tr>
            <tr style="background:#f0fdf4;"><td><strong>TOTAL NET COLLECTION</strong></td><td style="text-align:right;"><strong>₹${Number(eod.net_collection || 0).toFixed(2)}</strong></td></tr>
            <tr><td>Balance Due / Pending</td><td style="text-align:right;">₹${Number(eod.pending_fee || 0).toFixed(2)}</td></tr>
        </tbody></table>
        <div class="sec-title">Per-Receptionist & Shift Cash Drawer Handover</div>
        <table><thead><tr><th>Staff & Shift</th><th style="text-align:right;">Visits</th><th style="text-align:right;">Cash</th><th style="text-align:right;">UPI</th><th style="text-align:right;">Card</th><th style="text-align:right;">Net</th></tr></thead><tbody>${staffRows}</tbody></table>
        <div class="sec-title">Doctor-Wise Breakdown</div>
        <table><thead><tr><th>Doctor</th><th style="text-align:right;">Visits</th><th style="text-align:right;">Net Collection</th></tr></thead><tbody>${docRows}</tbody></table>
        <div class="footer-sign"><div class="sign-line">Reception Shift Handover</div><div class="sign-line">Clinic Admin / Owner Verified</div></div>`;
    openPrintWindow(`EOD_Report_${fromDate}_to_${toDate}`, html);
}

function initInactivityAutoLock(onLock, timeoutMs = 30 * 60 * 1000) {
    let timer = null;
    const reset = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { if (typeof onLock === "function") onLock(); }, timeoutMs); };
    ["mousemove", "keydown", "click", "touchstart"].forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
}

function printSaasInvoice(payment, clinic) {
    const html = `
        <div class="header-full">
            <div><h1 class="clinic-title">ClinicOS Subscription Receipt</h1><div class="clinic-sub">Powered by DigiConvo • Multi-City Healthcare SaaS</div></div>
            <div class="doc-box"><div class="doc-name">${escapeHTML(payment.invoice_no || "-")}</div><div class="doc-meta">Date: ${escapeHTML(formatDateTimeIST(payment.paid_at))}</div></div>
        </div>
        <div class="pt-grid">
            <div><strong>Billed To:</strong> ${escapeHTML((clinic && clinic.name) || payment.clinic_name || payment.slug)}</div>
            <div><strong>Plan Tier:</strong> ${escapeHTML((payment.plan_tier || "starter").toUpperCase())}</div>
            <div><strong>Payment Mode:</strong> ${escapeHTML((payment.gateway || "upi").toUpperCase())}</div>
            <div><strong>City:</strong> ${escapeHTML((clinic && clinic.city) || payment.city || "-")}</div>
            <div><strong>GSTIN:</strong> ${escapeHTML((clinic && clinic.gst_number) || payment.gst_number || "Unregistered")}</div>
            <div><strong>Ref / Txn ID:</strong> ${escapeHTML(payment.gateway_payment_id || "-")}</div>
        </div>
        <table><thead><tr><th>Description</th><th style="text-align:right;">Validity Added</th><th style="text-align:right;">Amount Paid (₹)</th></tr></thead><tbody>
            <tr><td>ClinicOS Cloud OPD Subscription (${escapeHTML((payment.plan_tier || "starter").toUpperCase())})</td><td style="text-align:right;">+${Number(payment.days_added || 30)} Days</td><td style="text-align:right;"><strong>₹${Number(payment.amount || 0).toFixed(2)}</strong></td></tr>
        </tbody></table>
        ${payment.notes ? `<div style="margin-top:10px;font-size:12px;"><strong>Notes:</strong> ${escapeHTML(payment.notes)}</div>` : ""}
        <div class="footer-sign"><div>Computer-generated SaaS subscription receipt.</div><div class="sign-line">ClinicOS Billing Desk</div></div>`;
    openPrintWindow(`Invoice_${payment.invoice_no || "ClinicOS"}`, html);
}
