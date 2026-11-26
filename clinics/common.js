/*
=========================================================
CLINICOS SAAS v10.0 - SHARED CORE ENGINE (common.js)
- 29-RPC Enterprise Bridge (Multi-User Staff + HQ RBAC)
- Offline/Reconnecting Watcher & Idempotency Key Generator
- Free Browser Voice-to-Text (en-IN / hi-IN) & TV Voice Calling
- Complete Print Suite (NMC Rx, Multi-Item Fee Receipt with
  Balance Due, Lab Req, MCI Reg 1.3.3 Certificate, 80mm Token
  Slip, A4 QR Poster, Shift-Wise EOD Cash Handover Report)
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
    { label: "1-0-1 (OD BD)", val: "1-0-1" },
    { label: "1-1-1 (TDS)", val: "1-1-1" },
    { label: "1-0-0 (Morning)", val: "1-0-0" },
    { label: "0-0-1 (Night)", val: "0-0-1" },
    { label: "SOS (ज़रूरत पर)", val: "SOS" },
    { label: "After Food / खाने के बाद", val: "After Food (खाने के बाद)" },
    { label: "Before Food / खाने से पहले", val: "Before Food (खाने से पहले)" },
    { label: "With Warm Water / गुनगुने पानी से", val: "With Warm Water (गुनगुने पानी से)" }
];

// =========================================================
// 1. SUPABASE CLIENT & 29-RPC API LAYER
// =========================================================
let _sbClient = null;
function getSupabase() {
    if (!_sbClient) {
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
        s.onerror = () => reject(new Error("Turnstile script failed to load."));
        document.head.appendChild(s);
    });
    return _turnstilePromise;
}

async function callTurnstileGate(payload) {
    const res = await fetch(CONFIG.SECURITY.AUTH_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": CONFIG.SUPABASE.ANON_KEY },
        body: JSON.stringify(payload)
    });
    return await res.json();
}

async function rpcCall(fnName, params = {}) {
    const sb = getSupabase();
    const { data, error } = await sb.rpc(fnName, params);
    if (error) return { success: false, message: error.message || "Server error." };
    return data || { success: false, message: "Empty server response." };
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
                    p_dept_id: data.dept_id || null
                });

            case "submitBooking":
                if (isTurnstileEnabled() && data.turnstileToken) {
                    return await callTurnstileGate({ action: "submitBooking", slug: data.slug || CONFIG.TENANT.SLUG, payload: data.payload || {}, turnstileToken: data.turnstileToken });
                }
                return await rpcCall("public_submit_booking", { p_slug: data.slug || CONFIG.TENANT.SLUG, p_payload: data.payload || {} });

            case "staffLogin":
                if (isTurnstileEnabled() && data.turnstileToken) {
                    return await callTurnstileGate({ action: "staffLogin", slug: data.slug || CONFIG.TENANT.SLUG, username: data.username || "", password: data.password || "", portal: data.portal || "reception", turnstileToken: data.turnstileToken });
                }
                return await rpcCall("staff_login", {
                    p_slug: data.slug || CONFIG.TENANT.SLUG, p_username: data.username || "", p_password: data.password || "",
                    p_portal: data.portal || "reception", p_captcha_id: data.captcha_id || "", p_captcha_answer: data.captcha_answer || ""
                });

            case "saasLogin":
                if (isTurnstileEnabled() && data.turnstileToken) {
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
                    p_token: data.token || "", p_known_version: data.known_version ?? null, p_day: data.day || null
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
// 2. THEME, OFFLINE WATCHER, IDEMPOTENCY, DATE & FORMATTING
// =========================================================
function makeIdempotencyKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "idem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

function initOfflineBanner() {
    let el = document.getElementById("clinicosOfflineBar");
    if (!el) {
        el = document.createElement("div");
        el.id = "clinicosOfflineBar";
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
        return `<div style="background:${bg};border:1px solid;border-radius:10px;padding:9px 14px;margin-bottom:8px;font-size:13px;"><strong>${escapeHTML(a.title)}:</strong> ${escapeHTML(a.message)}</div>`;
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

function getTodayIST() {
    const now = new Date();
    const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
    return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
}

function addDaysYMD(ymd, days) {
    const p = String(ymd || getTodayIST()).split("-").map(Number);
    const dt = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
    dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
    return dt.toISOString().slice(0, 10);
}

function getDefaultShiftIST() {
    const now = new Date();
    const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
    return ist.getHours() < 15 ? "morning" : "evening";
}

function formatDateLabel(ymd) {
    if (!ymd) return "";
    const p = String(ymd).split("-").map(Number);
    if (p.length !== 3) return ymd;
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTimeIST(isoStr) {
    if (!isoStr) return "";
    try { return new Date(isoStr).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }); }
    catch (_) { return isoStr; }
}

function escapeHTML(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showToast(message, type = "success") {
    let box = document.getElementById("clinicosToastBox");
    if (!box) {
        box = document.createElement("div");
        box.id = "clinicosToastBox";
        box.style.cssText = "position:fixed;bottom:18px;right:18px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:360px;";
        document.body.appendChild(box);
    }
    const item = document.createElement("div");
    const bg = type === "error" ? "#dc2626" : type === "warn" ? "#d97706" : "#0f172a";
    item.style.cssText = `background:${bg};color:#fff;padding:11px 15px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 10px 24px rgba(0,0,0,0.2);transition:opacity .25s;`;
    item.textContent = message;
    box.appendChild(item);
    setTimeout(() => { item.style.opacity = "0"; setTimeout(() => item.remove(), 260); }, 3200);
}

// =========================================================
// 3. AUDIO CHIME, TV VOICE CALLING & VOICE-TO-TEXT
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

function announceTokenVoice(tokenLabel, patientName, roomLabel) {
    playHospitalDingDong();
    if (!("speechSynthesis" in window)) return;
    try {
        window.speechSynthesis.cancel();
        const cleanTok = String(tokenLabel || "").replace("#", "");
        const namePart = patientName ? `, ${patientName}` : "";
        const roomPart = roomLabel ? `, please proceed to ${roomLabel}` : ", please proceed to the doctor cabin";
        const utter = new SpeechSynthesisUtterance(`Token number ${cleanTok}${namePart}${roomPart}.`);
        utter.lang = "en-IN"; utter.rate = 0.92;
        setTimeout(() => { try { window.speechSynthesis.speak(utter); } catch (_) {} }, 550);
    } catch (_) {}
}

let _activeRecognition = null;
function startVoiceDictation(targetEl, btnEl, lang = "en-IN") {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast("Voice dictation requires Chrome or Edge.", "warn"); return; }
    if (_activeRecognition) { try { _activeRecognition.stop(); } catch (_) {} _activeRecognition = null; }
    const rec = new SR();
    rec.lang = lang || "en-IN"; rec.interimResults = false; rec.maxAlternatives = 1;
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
function waNumber(raw) {
    const d = String(raw || "").replace(/[^0-9]/g, "");
    return d.length === 10 ? "91" + d : d;
}

function openWhatsApp(phone, msg) {
    const num = waNumber(phone);
    if (!num || num.length < 10) { showToast("Valid 10-digit mobile number required.", "warn"); return; }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
}

function sendWhatsAppToken(visit, clinic) {
    const baseUrl = window.location.href.split("?")[0].replace(/[^/]+$/, "index.html");
    const liveUrl = `${baseUrl}?c=${encodeURIComponent(clinic.slug || CONFIG.TENANT.SLUG)}`;
    const tok = visit.token_label || ("#" + visit.token_no);
    openWhatsApp(visit.phone, `*${clinic.name || "Clinic"}*\nNamaste ${visit.name || "Patient"} ji,\nYour OPD Token *${tok}* (${visit.doctor_name || "Doctor"}) is confirmed for *${formatDateLabel(visit.token_day)}* (${visit.shift_key || "morning"} shift).\n${visit.uhid ? "UHID: " + visit.uhid + "\n" : ""}Track Live Queue: ${liveUrl}`);
}

function sendWhatsAppRxSummary(visit, clinic) {
    const meds = Array.isArray(visit.rx_medicines) ? visit.rx_medicines : [];
    const medLines = meds.map((m, i) => `${i + 1}. ${m.name || ""} ${m.dosage || ""} (${m.duration || ""})`).join("\n");
    openWhatsApp(visit.phone, `*${clinic.name || "Clinic"} — Consultation Summary*\nPatient: ${visit.name || ""} ${visit.uhid ? "(" + visit.uhid + ")" : ""}\nDoctor: ${visit.doctor_name || ""}\n${visit.diagnosis ? "Diagnosis: " + visit.diagnosis + "\n" : ""}${medLines ? "\n*Medicines:*\n" + medLines + "\n" : ""}${visit.lab_tests ? "\n*Tests:* " + visit.lab_tests + "\n" : ""}${visit.advice ? "\n*Advice:* " + visit.advice + "\n" : ""}${visit.recall_due_date ? "\n*Follow-Up:* " + formatDateLabel(visit.recall_due_date) + "\n" : ""}\nGet well soon!`);
}

function sendWhatsAppFollowup(visit, clinic) {
    openWhatsApp(visit.phone, `Namaste ${visit.name || "Patient"} ji,\nGentle follow-up reminder from *${clinic.name || "Clinic"}* with *${visit.doctor_name || "Doctor"}* due on *${formatDateLabel(visit.recall_due_date)}*.\nCall ${clinic.phone || ""} to confirm.`);
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =========================================================
// 5. COMPLETE PRINT ENGINE (A4 RX, MULTI-ITEM RECEIPT, LAB, MCI CERT, THERMAL, QR, SHIFT EOD)
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
    const fee = Number(visit.fee || 0), disc = Number(visit.discount_amount || 0), paid = Number(visit.paid_amount || 0), bal = Number(visit.balance_due || 0), ref = Number(visit.refund_amount || 0);
    const html = `${buildLetterheadHtml(clinic, doctor, null)}
        <h2 style="text-align:center;margin:6px 0 10px;font-size:16px;text-transform:uppercase;letter-spacing:1px;">OPD Billing & Fee Receipt</h2>
        <div class="pt-grid">
            <div><strong>Receipt No:</strong> ${escapeHTML(visit.receipt_no || "-")}</div><div><strong>Date:</strong> ${escapeHTML(formatDateLabel(visit.token_day))}</div><div><strong>Token:</strong> ${escapeHTML(visit.token_label || ("#" + visit.token_no))}</div>
            <div><strong>Patient:</strong> ${escapeHTML(visit.name || "-")}</div><div><strong>UHID:</strong> ${escapeHTML(visit.uhid || "-")}</div><div><strong>Phone:</strong> ${escapeHTML(visit.phone || "-")}</div>
        </div>
        <table><thead><tr><th>#</th><th>Particulars / Service</th><th style="text-align:right;">Amount (₹)</th></tr></thead><tbody>
            ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${escapeHTML(it.name || "Service")}</td><td style="text-align:right;">₹${Number(it.price || 0).toFixed(2)}</td></tr>`).join("")}
            ${disc > 0 ? `<tr><td colspan="2">Discount</td><td style="text-align:right;">- ₹${disc.toFixed(2)}</td></tr>` : ""}
            ${ref > 0 ? `<tr><td colspan="2">Refund (${escapeHTML(visit.refund_reason || "Issued")})</td><td style="text-align:right;">- ₹${ref.toFixed(2)}</td></tr>` : ""}
            <tr><td colspan="2"><strong>Amount Paid (${escapeHTML(visit.payment_mode || "Cash")} — ${escapeHTML(visit.payment_status || "Paid")})</strong></td><td style="text-align:right;"><strong>₹${Math.max(paid - ref, 0).toFixed(2)}</strong></td></tr>
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
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(portalUrl)}`;
    const html = `<div style="text-align:center;padding:24px 16px;border:3px solid #0284c7;border-radius:18px;max-width:620px;margin:10px auto;"><div style="font-size:13px;font-weight:800;color:#0284c7;letter-spacing:1.5px;text-transform:uppercase;">Skip the Queue • Live OPD Token</div><h1 style="font-size:30px;margin:8px 0 4px;color:#0f172a;">${escapeHTML((clinic && clinic.name) || "Clinic")}</h1><div style="font-size:14px;color:#475569;margin-bottom:22px;">${escapeHTML((clinic && clinic.address) || "")}</div><div style="display:inline-block;padding:14px;background:#fff;border:2px solid #cbd5e1;border-radius:14px;"><img src="${qrSrc}" alt="Scan QR" width="280" height="280" style="display:block;" /></div><h2 style="font-size:20px;margin:20px 0 6px;color:#0f172a;">Scan with Phone Camera</h2><p style="font-size:14px;color:#334155;margin:0 0 14px;">1. Check Live Token Running Now &nbsp;•&nbsp; 2. Register Self-Check-In</p><div style="font-size:12px;color:#64748b;word-break:break-all;background:#f8fafc;padding:8px 12px;border-radius:8px;">${escapeHTML(portalUrl)}</div></div>`;
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
            <div><strong>City:</strong> ${escapeHTML((clinic && clinic.city) || "-")}</div>
            <div><strong>GSTIN:</strong> ${escapeHTML((clinic && clinic.gst_number) || "Unregistered")}</div>
            <div><strong>Ref / Txn ID:</strong> ${escapeHTML(payment.gateway_payment_id || "-")}</div>
        </div>
        <table><thead><tr><th>Description</th><th style="text-align:right;">Validity Added</th><th style="text-align:right;">Amount Paid (₹)</th></tr></thead><tbody>
            <tr><td>ClinicOS Cloud OPD Subscription (${escapeHTML((payment.plan_tier || "starter").toUpperCase())})</td><td style="text-align:right;">+${Number(payment.days_added || 30)} Days</td><td style="text-align:right;"><strong>₹${Number(payment.amount || 0).toFixed(2)}</strong></td></tr>
        </tbody></table>
        ${payment.notes ? `<div style="margin-top:10px;font-size:12px;"><strong>Notes:</strong> ${escapeHTML(payment.notes)}</div>` : ""}
        <div class="footer-sign"><div>Computer-generated SaaS subscription receipt.</div><div class="sign-line">ClinicOS Billing Desk</div></div>`;
    openPrintWindow(`Invoice_${payment.invoice_no || "ClinicOS"}`, html);
}