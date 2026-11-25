/*
=========================================================
CLINICOS SAAS - SHARED ENGINE (v8.0 Production)
- Dual-Mode Cloudflare Turnstile + Server SVG CAPTCHA Widget
- Specialty Pre-Exam Intake Templates (Eye, General, Dental, Ortho, Peds, Custom)
- Industry NMC-Compliant Prescription Print Engine (Full Header + Pre-Printed Modes)
- Father's/Guardian's Name, Patient Address & Reception Clinical Remarks
- Server-Side Session Revocation & Formula-Injection-Safe CSV Export
=========================================================
*/
"use strict";

const hasSupabaseConfig = Boolean(CONFIG.SUPABASE.URL && CONFIG.SUPABASE.ANON_KEY && window.supabase);
const supabaseClient = hasSupabaseConfig
    ? window.supabase.createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.ANON_KEY)
    : null;

const THEME_PRESETS = {
    emerald: { primary: "#059669", primaryLight: "#ecfdf5", accent: "#10b981" },
    royal:   { primary: "#0284c7", primaryLight: "#f0f9ff", accent: "#38bdf8" },
    gold:    { primary: "#b45309", primaryLight: "#fffbeb", accent: "#f59e0b" },
    crimson: { primary: "#ea580c", primaryLight: "#fff7ed", accent: "#f97316" },
    plum:    { primary: "#7c3aed", primaryLight: "#f5f3ff", accent: "#a855f7" }
};

/*=========================================================
INDUSTRY SPECIALTY PRE-EXAM INTAKE PRESETS
=========================================================*/
const SPECIALTY_PRESETS = {
    general: {
        label: "General Medicine / Physician",
        fields: ["BP (mmHg)", "Pulse (bpm)", "Temp (°F)", "SpO2 (%)", "Weight (kg)"]
    },
    eye: {
        label: "Eye / Ophthalmology Clinic",
        fields: ["Vision OD (Right)", "Vision OS (Left)", "Near Vision", "IOP OD/OS (mmHg)", "Glasses / Power"]
    },
    dental: {
        label: "Dental Clinic",
        fields: ["Chief Tooth / Area", "Pain Scale (1-10)", "BP (mmHg)", "Allergies / Meds"]
    },
    ortho: {
        label: "Orthopedics / Spine",
        fields: ["Affected Joint / Side", "Pain Score (1-10)", "BP (mmHg)", "Weight (kg)", "X-Ray / MRI Brought"]
    },
    pediatrics: {
        label: "Pediatrics / Child Care",
        fields: ["Weight (kg)", "Height (cm)", "Temp (°F)", "Head Circ. (cm)", "Vaccination Due"]
    },
    gynec: {
        label: "Gynecology / Maternity",
        fields: ["BP (mmHg)", "Weight (kg)", "LMP / Weeks", "Hb (g/dL)", "FHR / Notes"]
    },
    custom: {
        label: "Custom Clinic Fields",
        fields: ["BP (mmHg)", "Weight (kg)", "Temp (°F)"]
    }
};

function getClinicIntakeFields(clinicObj) {
    if (Array.isArray(clinicObj?.intake_fields) && clinicObj.intake_fields.length > 0) {
        return clinicObj.intake_fields.map(x => String(x || "").trim()).filter(Boolean).slice(0, 12);
    }
    const spec = clinicObj?.clinic_specialty || "general";
    return (SPECIALTY_PRESETS[spec] || SPECIALTY_PRESETS.general).fields;
}

// Normalizes both legacy {bp, wt, temp, spo2} and flexible specialty pre-exam maps
function getFilledPreExamEntries(patient) {
    const raw = patient?.vitals;
    if (!raw || typeof raw !== "object") return [];
    const legacyLabels = { bp: "BP (mmHg)", wt: "Weight (kg)", temp: "Temp (°F)", spo2: "SpO2 (%)" };
    const entries = [];
    for (const [k, v] of Object.entries(raw)) {
        const val = String(v ?? "").trim();
        if (!val) continue;
        const label = legacyLabels[k] || k;
        entries.push({ label, value: val });
    }
    return entries;
}

function getPreExamValue(patient, fieldLabel) {
    const raw = patient?.vitals;
    if (!raw || typeof raw !== "object") return "";
    if (raw[fieldLabel] !== undefined && raw[fieldLabel] !== null) return String(raw[fieldLabel]);
    // Fallback for legacy keys
    const lower = fieldLabel.toLowerCase();
    if (lower.startsWith("bp") && raw.bp) return String(raw.bp);
    if (lower.startsWith("weight") && raw.wt) return String(raw.wt);
    if (lower.startsWith("temp") && raw.temp) return String(raw.temp);
    if (lower.startsWith("spo2") && raw.spo2) return String(raw.spo2);
    return "";
}

function applyThemePreset(themeKey) {
    const t = THEME_PRESETS[themeKey] || THEME_PRESETS.emerald;
    const root = document.documentElement;
    root.style.setProperty("--primary", t.primary);
    root.style.setProperty("--primary-light", t.primaryLight);
    root.style.setProperty("--accent", t.accent);
}

/*=========================================================
MULTI-DOCTOR NORMALIZER & SAFE LOOKUP
=========================================================*/
function normalizeDoctorsList(clinicObj) {
    if (Array.isArray(clinicObj?.doctors) && clinicObj.doctors.length > 0) {
        return clinicObj.doctors.map((d, idx) => ({
            id: d.id || `doc${idx + 1}`,
            name: d.name || `Doctor ${idx + 1}`,
            qualification: d.qualification || "",
            reg_no: d.reg_no || "",
            opd_status: d.opd_status || "running",
            delay_minutes: Number(d.delay_minutes || 0),
            morning_status: d.morning_status || "open",
            evening_status: d.evening_status || "open",
            locked: Boolean(d.locked),
            rx_templates: Array.isArray(d.rx_templates) ? d.rx_templates : []
        }));
    }
    const list = [{
        id: "doc1", name: "Consulting Doctor", qualification: "", reg_no: "",
        opd_status: "running", delay_minutes: 0,
        morning_status: "open", evening_status: "open", locked: false, rx_templates: []
    }];
    if (clinicObj) clinicObj.doctors = list;
    return list;
}

function getNextDoctorId(existingDocs) {
    const used = new Set((existingDocs || []).map(d => d.id));
    for (let i = 1; i <= 20; i++) {
        if (!used.has(`doc${i}`)) return `doc${i}`;
    }
    return "";
}

function getDoctorById(clinicObj, docId) {
    const docs = normalizeDoctorsList(clinicObj);
    if (!docId) return docs[0];
    const found = docs.find(d => d.id === docId);
    if (found) return found;
    return {
        id: docId, name: "Former Doctor", qualification: "", reg_no: "",
        opd_status: "closed", delay_minutes: 0,
        morning_status: "completed", evening_status: "completed", locked: false, rx_templates: []
    };
}

function getDoctorNameById(clinicObj, docId) {
    return getDoctorById(clinicObj, docId).name;
}

function setOptionsIfChanged(el, html) {
    if (el && el.dataset.sig !== html) {
        el.innerHTML = html;
        el.dataset.sig = html;
    }
}

/*=========================================================
IST DATE, SHIFT & DELAY FORMATTERS
=========================================================*/
function getDefaultShiftIST() {
    const istHour = Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false
    }).format(new Date()));
    return istHour < 15 ? "Morning" : "Evening";
}

function getTodayIST() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function addDaysYMD(ymd, days) {
    const parts = String(ymd || getTodayIST()).split("-").map(Number);
    if (parts.length !== 3) return "";
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(days || 0)));
    return d.toISOString().split("T")[0];
}

function formatDateLabel(ymd) {
    if (!ymd) return "—";
    const parts = String(ymd).split("-");
    if (parts.length !== 3) return ymd;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTimeIST(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDelayText(mins) {
    const m = Math.max(0, Number(mins) || 0);
    if (m === 0) return "delayed";
    const hrs = Math.floor(m / 60);
    const rem = m % 60;
    if (hrs > 0 && rem > 0) return `${hrs} hr ${rem} min`;
    if (hrs > 0) return hrs === 1 ? "1 hour" : `${hrs} hours`;
    return `${rem} mins`;
}

/*=========================================================
NON-BLOCKING TOAST NOTIFICATION HELPER
=========================================================*/
let toastTimer = null;
function showToast(message, type = "success") {
    let el = document.getElementById("clinicosToast");
    if (!el) {
        el = document.createElement("div");
        el.id = "clinicosToast";
        el.style.cssText = "position:fixed;bottom:22px;right:22px;z-index:10000;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:700;color:#fff;box-shadow:0 12px 28px rgba(15,23,42,0.25);transition:opacity 0.25s;max-width:360px;";
        document.body.appendChild(el);
    }
    el.style.background = type === "error" ? "#dc2626" : (type === "warn" ? "#d97706" : "#059669");
    el.innerText = message;
    el.style.opacity = "1";
    el.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => { el.style.display = "none"; }, 260);
    }, 3200);
}

/*=========================================================
CLOUDFLARE TURNSTILE LOADER & DUAL-MODE CAPTCHA WIDGET
=========================================================*/
let _tsScriptPromise = null;

function isTurnstileEnabled() {
    return Boolean(CONFIG.SECURITY && CONFIG.SECURITY.TURNSTILE_SITE_KEY && CONFIG.SECURITY.TURNSTILE_SITE_KEY.trim());
}

function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (_tsScriptPromise) return _tsScriptPromise;
    _tsScriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile failed to initialize.")));
        s.onerror = () => reject(new Error("Could not load Cloudflare Turnstile."));
        document.head.appendChild(s);
    });
    return _tsScriptPromise;
}

async function callTurnstileGate(payload) {
    const proxyUrl = String(CONFIG.SECURITY?.AUTH_PROXY_URL || "").trim();
    if (!/^https:\/\//i.test(proxyUrl)) return null;
    try {
        const res = await fetch(proxyUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": CONFIG.SUPABASE.ANON_KEY
            },
            body: JSON.stringify(payload)
        });
        const json = await res.json().catch(() => null);
        return json || { success: false, message: "Invalid response from security gateway." };
    } catch (err) {
        return { success: false, message: "Could not reach Turnstile security gateway. Check ALLOWED_ORIGINS and Verify JWT setting." };
    }
}

const CaptchaWidget = {
    state: {},
    timers: {},
    tsWidgets: {},
    tsTokens: {},

    async load(prefix) {
        const svgBox = document.getElementById(prefix + "SvgBox");
        const tsSlot = document.getElementById(prefix + "Turnstile");

        if (isTurnstileEnabled() && tsSlot) {
            if (svgBox) svgBox.style.display = "none";
            tsSlot.style.display = "flex";
            this.tsTokens[prefix] = "";
            try {
                const ts = await loadTurnstileScript();
                if (this.tsWidgets[prefix] !== undefined) {
                    ts.reset(this.tsWidgets[prefix]);
                } else {
                    this.tsWidgets[prefix] = ts.render(tsSlot, {
                        sitekey: CONFIG.SECURITY.TURNSTILE_SITE_KEY.trim(),
                        theme: "light",
                        callback: (token) => { this.tsTokens[prefix] = token; },
                        "expired-callback": () => { this.tsTokens[prefix] = ""; },
                        "error-callback": () => { this.tsTokens[prefix] = ""; }
                    });
                }
            } catch (e) {
                showToast("Security widget could not load. Please refresh.", "error");
            }
            return;
        }

        if (svgBox) svgBox.style.display = "";
        if (tsSlot) tsSlot.style.display = "none";
        const imgEl = document.getElementById(prefix + "Img");
        const inputEl = document.getElementById(prefix + "Input");
        if (inputEl) inputEl.value = "";
        const res = await api("getCaptcha", {});
        if (res && res.success) {
            this.state[prefix] = res.captcha_id;
            if (imgEl) imgEl.src = res.image_data;
            this.scheduleRefresh(prefix);
        }
    },

    scheduleRefresh(prefix) {
        clearTimeout(this.timers[prefix]);
        this.timers[prefix] = setTimeout(() => {
            const inputEl = document.getElementById(prefix + "Input");
            const imgEl = document.getElementById(prefix + "Img");
            if (imgEl && imgEl.offsetParent !== null && (!inputEl || inputEl.value.trim() === "")) {
                this.load(prefix);
            }
        }, 8 * 60 * 1000);
    },

    get(prefix) {
        if (isTurnstileEnabled()) {
            return {
                mode: "turnstile",
                turnstileToken: this.tsTokens[prefix] || "",
                captcha_id: "",
                captcha_answer: ""
            };
        }
        const inputEl = document.getElementById(prefix + "Input");
        return {
            mode: "svg",
            turnstileToken: "",
            captcha_id: this.state[prefix] || "",
            captcha_answer: (inputEl?.value || "").trim().toUpperCase()
        };
    },

    isValid(cap) {
        if (cap.mode === "turnstile") return Boolean(cap.turnstileToken);
        return Boolean(cap.captcha_id && cap.captcha_answer.length >= 4);
    }
};

/*=========================================================
SUPABASE API DISPATCHER (FAIL-CLOSED PRODUCTION MODE)
=========================================================*/
async function api(action, data = {}) {
    const slug = data.slug || CONFIG.TENANT.SLUG;
    const recPin = sessionStorage.getItem(CONFIG.STORAGE.RECEPTION_PIN) || data.pin || "";
    const docPin = sessionStorage.getItem(CONFIG.STORAGE.DOCTOR_PIN) || data.pin || "";

    if (!supabaseClient) {
        return { success: false, message: "Clinic server connection is not configured." };
    }

    try {
        let lastRpcError = null;
        const callRpc = async (functionName, args) => {
            const result = await supabaseClient.rpc(functionName, args);
            lastRpcError = result.error || null;
            if (lastRpcError) {
                console.error("ClinicOS RPC Error:", { action, functionName, error: lastRpcError });
            }
            return result;
        };

        switch (action) {
            case "getCaptcha": {
                const { data: res, error } = await callRpc("public_get_captcha", {});
                if (!error && res) return res;
                break;
            }
            case "getPublicQueue": {
                const { data: res, error } = await callRpc("get_public_clinic_queue", {
                    p_slug: slug,
                    p_booking_ref: String(data.booking_ref || ""),
                    p_doctor: String(data.doctor || ""),
                    p_shift: String(data.shift || "")
                });
                if (!error && res) {
                    if (res.success) normalizeDoctorsList(res);
                    return res;
                }
                break;
            }
            case "submitBooking": {
                if (isTurnstileEnabled() && CONFIG.SECURITY?.AUTH_PROXY_URL) {
                    const gateRes = await callTurnstileGate({
                        action: "submitBooking",
                        slug,
                        payload: data,
                        turnstileToken: data.turnstileToken || ""
                    });
                    if (gateRes) return gateRes;
                }
                const { data: res, error } = await callRpc("public_submit_booking", {
                    p_slug: slug,
                    p_payload: data
                });
                if (!error && res) return res;
                break;
            }
            case "verifyReceptionPin": {
                if (isTurnstileEnabled() && CONFIG.SECURITY?.AUTH_PROXY_URL) {
                    const gateRes = await callTurnstileGate({
                        action: "staffLogin",
                        slug,
                        role: "reception",
                        pin: String(data.pin || ""),
                        doctor_id: null,
                        turnstileToken: data.turnstileToken || ""
                    });
                    if (gateRes) return gateRes;
                }
                const { data: res, error } = await callRpc("staff_login", {
                    p_slug: slug,
                    p_role: "reception",
                    p_pin: String(data.pin || ""),
                    p_doctor_id: null,
                    p_captcha_id: String(data.captcha_id || ""),
                    p_captcha_answer: String(data.captcha_answer || "")
                });
                if (!error && res) return res;
                break;
            }
            case "verifyDoctorPin": {
                if (isTurnstileEnabled() && CONFIG.SECURITY?.AUTH_PROXY_URL) {
                    const gateRes = await callTurnstileGate({
                        action: "staffLogin",
                        slug,
                        role: "doctor",
                        pin: String(data.pin || ""),
                        doctor_id: String(data.doctor_id || ""),
                        turnstileToken: data.turnstileToken || ""
                    });
                    if (gateRes) return gateRes;
                }
                const { data: res, error } = await callRpc("staff_login", {
                    p_slug: slug,
                    p_role: "doctor",
                    p_pin: String(data.pin || ""),
                    p_doctor_id: String(data.doctor_id || ""),
                    p_captcha_id: String(data.captcha_id || ""),
                    p_captcha_answer: String(data.captcha_answer || "")
                });
                if (!error && res) return res;
                break;
            }
            case "revokeSession": {
                const { data: res, error } = await callRpc("revoke_session", {
                    p_token: String(data.token || ""),
                    p_kind: String(data.kind || "staff")
                });
                if (!error && res) return res;
                return { success: true };
            }
            case "getStaffDashboard": {
                const role = data.role || "reception";
                const pinToUse = role === "doctor" ? docPin : recPin;
                const { data: res, error } = await callRpc("get_staff_clinic_dashboard", {
                    p_slug: slug,
                    p_role: role,
                    p_pin: String(pinToUse)
                });
                if (!error && res && res.success) {
                    normalizeDoctorsList(res.clinic);
                    return res;
                }
                if (res && !res.success) return res;
                break;
            }
            case "staffAction": {
                const role = data.role || "reception";
                const pinToUse = role === "doctor" ? docPin : recPin;
                const { data: res, error } = await callRpc("staff_mutate_clinic", {
                    p_slug: slug,
                    p_role: role,
                    p_pin: String(pinToUse),
                    p_op: data.op,
                    p_payload: data.payload || {}
                });
                if (!error && res && res.success) {
                    normalizeDoctorsList(res.clinic);
                    if (res.new_session_token) {
                        sessionStorage.setItem(
                            role === "doctor" ? CONFIG.STORAGE.DOCTOR_PIN : CONFIG.STORAGE.RECEPTION_PIN,
                            res.new_session_token
                        );
                    }
                    return res;
                }
                if (res && !res.success) return res;
                break;
            }
            case "saasLogin": {
                if (isTurnstileEnabled() && CONFIG.SECURITY?.AUTH_PROXY_URL) {
                    const gateRes = await callTurnstileGate({
                        action: "saasLogin",
                        secret: String(data.secret || ""),
                        turnstileToken: data.turnstileToken || ""
                    });
                    if (gateRes) return gateRes;
                }
                const { data: res, error } = await callRpc("saas_login", {
                    p_secret: String(data.secret || ""),
                    p_captcha_id: String(data.captcha_id || ""),
                    p_captcha_answer: String(data.captcha_answer || "")
                });
                if (!error && res) return res;
                break;
            }
            case "saasList": {
                const { data: res, error } = await callRpc("saas_list_clinics", { p_secret: data.secret });
                if (!error && res) return res;
                break;
            }
            case "saasUpsert": {
                const { data: res, error } = await callRpc("saas_upsert_clinic", { p_secret: data.secret, p_data: data.payload });
                if (!error && res) return res;
                break;
            }
            case "saasUnlock": {
                const { data: res, error } = await callRpc("saas_unlock_clinic", { p_secret: data.secret, p_slug: data.targetSlug });
                if (!error && res) return res;
                break;
            }
            case "saasUpdateMaster": {
                const { data: res, error } = await callRpc("saas_update_master_config", {
                    p_current_secret: data.currentSecret,
                    p_new_secret: data.newSecret || "",
                    p_whatsapp: data.providerWhatsapp || "",
                    p_upi: data.providerUpi || ""
                });
                if (!error && res) return res;
                break;
            }
            case "saasToggle": {
                const { data: res, error } = await callRpc("saas_toggle_clinic", { p_secret: data.secret, p_slug: data.targetSlug });
                if (!error && res) return res;
                break;
            }
            case "saasExtend": {
                const { data: res, error } = await callRpc("saas_extend_clinic_sub", { p_secret: data.secret, p_slug: data.targetSlug });
                if (!error && res) return res;
                break;
            }
            case "saasDelete": {
                const { data: res, error } = await callRpc("saas_delete_clinic", { p_secret: data.secret, p_slug: data.targetSlug });
                if (!error && res) return res;
                break;
            }
        }
        return {
            success: false,
            message: lastRpcError ? `Request error (${lastRpcError.message || lastRpcError.code}).` : "Unable to complete request."
        };
    } catch (err) {
        console.error("Network exception:", err);
        return { success: false, message: "Network error while contacting clinic server." };
    }
}

/*=========================================================
AUDIO & VOICE ENGINE (AUTO-UNLOCK + TV / RECEPTION ALERTS)
=========================================================*/
let sharedAudioCtx = null;
const audioStatusListeners = [];

function notifyAudioStatus() {
    const unlocked = Boolean(sharedAudioCtx && sharedAudioCtx.state === "running");
    audioStatusListeners.forEach(fn => { try { fn(unlocked); } catch (e) {} });
}

function getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx) {
        sharedAudioCtx = new AudioCtx();
        sharedAudioCtx.onstatechange = notifyAudioStatus;
    }
    if (sharedAudioCtx.state === "suspended") {
        sharedAudioCtx.resume().then(notifyAudioStatus).catch(() => {});
    }
    return sharedAudioCtx;
}

function initAudioAutoUnlock(onChange) {
    if (typeof onChange === "function") audioStatusListeners.push(onChange);
    const unlock = () => {
        const ctx = getAudioContext();
        if (ctx && ctx.state === "suspended") {
            ctx.resume().then(notifyAudioStatus).catch(() => {});
        } else {
            notifyAudioStatus();
        }
    };
    ["click", "touchstart", "keydown"].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
    notifyAudioStatus();
}

function isAudioUnlocked() {
    return Boolean(sharedAudioCtx && sharedAudioCtx.state === "running");
}

function playHospitalDingDong() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const playTone = (freq, start, dur) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.001, start);
            gain.gain.exponentialRampToValueAtTime(0.35, start + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0008, start + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + dur + 0.02);
        };
        playTone(659.25, now, 0.55);
        playTone(523.25, now + 0.35, 1.1);
    } catch (e) {}
}

function playOnlineRequestRing() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        [880, 1108.73, 1318.51].forEach((freq, idx) => {
            const t = now + idx * 0.14;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.001, t);
            gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.3);
        });
    } catch (e) {}
}

function playPeonBellAlert() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        [0, 0.26].forEach(offset => {
            const t = now + offset;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(987.77, t);
            gain.gain.setValueAtTime(0.001, t);
            gain.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.24);
        });
    } catch (e) {}
}

function announceTokenVoiceHindi(tokenNo, patientFullName) {
    playHospitalDingDong();
    if (!("speechSynthesis" in window)) return;
    const firstName = String(patientFullName || "").replace(/\*/g, "").trim().split(/\s+/)[0];
    const hindiNum = CONFIG.HINDI_NUMBERS[Number(tokenNo)] || String(tokenNo);
    const phrase = firstName
        ? `Attention please. Token number ${hindiNum}, ${firstName} ji, kripya Doctor ke cabin mein aayein.`
        : `Attention please. Token number ${hindiNum}, kripya Doctor ke cabin mein aayein.`;

    setTimeout(() => {
        try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(phrase);
            const voices = window.speechSynthesis.getVoices();
            const v = voices.find(x => x.lang === "hi-IN") || voices.find(x => x.lang === "en-IN") || voices[0];
            if (v) u.voice = v;
            u.lang = v ? v.lang : "hi-IN";
            u.rate = 0.92;
            window.speechSynthesis.speak(u);
        } catch (e) {}
    }, 700);
}

/*=========================================================
FORMULA-INJECTION-SAFE EXCEL / CSV EXPORT ENGINE
=========================================================*/
function csvEscape(val) {
    let str = String(val ?? "");
    if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
    }
    if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function exportVisitsToCsv(visits, clinic, filename) {
    if (!visits || visits.length === 0) {
        showToast("No verified patient records found for the selected export range.", "warn");
        return false;
    }
    const headers = [
        "Date", "Time (IST)", "OPD Shift", "Doctor", "Token #",
        "Patient Name", "Father / Guardian", "Age", "Gender", "Mobile", "Address",
        "Visit Type", "Payment Mode", "Fee (INR)", "Payment Confirmed", "Status",
        "Reception Remarks", "Follow-Up (Days)"
    ];

    const rows = visits.map(v => [
        v.token_day || "",
        formatTimeIST(v.payment_confirmed_at || v.created_at),
        (v.shift || "") + " OPD",
        getDoctorNameById(clinic, v.doctor),
        v.token ?? "-",
        v.name || "",
        v.guardian_name || "",
        v.age ?? "",
        v.gender || "",
        v.phone || "",
        v.patient_address || "",
        v.visit_type || "",
        v.pay_mode || "",
        Number(v.fee || 0),
        v.payment_verified ? "Yes" : "No",
        String(v.status || "").toUpperCase(),
        v.clinical_remarks || "",
        Number(v.recall_days) === 0 ? "No Follow-Up" : v.recall_days
    ]);

    const csvContent = "\uFEFF" + [headers, ...rows].map(r => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${visits.length} record(s) to ${filename}`);
    return true;
}

/*=========================================================
INDUSTRY NMC-COMPLIANT PRESCRIPTION PRINT ENGINE
1. Bold Big Clinic/Hospital Name on top -> Address -> Contact/Timings
2. Doctor Info (Name, Qualification, Reg. No.) + Date / Token / Shift
3. Patient Info (Name, Age/Sex, Father/Guardian, Mobile, Address)
4. Pre-Exam Specialty Findings + Reception Clinical Remarks
5. Clean Spacious Rx Pad + Follow-Up Date + Doctor Signature
=========================================================*/
function ensurePrintContainer() {
    let el = document.getElementById("clinicosPrintMount");
    if (!el) {
        el = document.createElement("div");
        el.id = "clinicosPrintMount";
        document.body.appendChild(el);
    }
    return el;
}

function printPrescriptionLetterhead(patient, clinic) {
    const mount = ensurePrintContainer();
    const isPrePrinted = clinic.print_mode === "preprinted";
    const topMm = isPrePrinted ? Number(clinic.letterhead_margin_mm ?? 45) : 12;
    const docObj = getDoctorById(clinic, patient.doctor || clinic.authenticated_doctor_id);
    const visitYmd = patient.token_day || getTodayIST();
    const dateStr = formatDateLabel(visitYmd);
    const recallDays = patient.recall_days === null || patient.recall_days === undefined ? 5 : Number(patient.recall_days);
    const dueDateLabel = recallDays > 0 ? formatDateLabel(patient.recall_due_date || addDaysYMD(visitYmd, recallDays)) : "";
    const recallText = recallDays === 0 ? "No follow-up required (SOS)" : `After ${recallDays} Days (On/Before ${dueDateLabel})`;

    const clinicAddr = clinic.address || clinic.tagline || "";
    const clinicPhone = clinic.clinic_phone || clinic.whatsapp_number || "";
    const clinicTimings = clinic.opd_timings || "";

    const preExamEntries = getFilledPreExamEntries(patient);
    const remarksText = String(patient.clinical_remarks || "").trim();
    const hasPreExam = preExamEntries.length > 0 || remarksText !== "";

    const headerHtml = isPrePrinted ? "" : `
        <div style="text-align:center;border-bottom:3px double #0f172a;padding-bottom:12px;margin-bottom:14px;">
            <div style="font-size:26px;font-weight:900;letter-spacing:0.6px;text-transform:uppercase;color:#0f172a;line-height:1.15;">
                ${escapeHTML(clinic.clinic_name || "Clinic")}
            </div>
            ${clinicAddr ? `<div style="font-size:12.5px;color:#334155;font-weight:600;margin-top:4px;">${escapeHTML(clinicAddr)}</div>` : ""}
            <div style="font-size:11.5px;color:#475569;margin-top:3px;">
                ${clinicPhone ? `<span><b>Ph:</b> ${escapeHTML(clinicPhone)}</span>` : ""}
                ${clinicPhone && clinicTimings ? ` &nbsp;|&nbsp; ` : ""}
                ${clinicTimings ? `<span><b>OPD Timings:</b> ${escapeHTML(clinicTimings)}</span>` : ""}
            </div>
        </div>
    `;

    const preExamHtml = hasPreExam ? `
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;">
            <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#475569;margin-bottom:6px;">
                Pre-Consultation Assessment / Clinical Remarks
            </div>
            ${preExamEntries.length > 0 ? `
                <div style="display:flex;flex-wrap:wrap;gap:8px 20px;margin-bottom:${remarksText ? '6px' : '0'};">
                    ${preExamEntries.map(e => `<span><b>${escapeHTML(e.label)}:</b> ${escapeHTML(e.value)}</span>`).join("")}
                </div>` : ""}
            ${remarksText ? `<div style="color:#0f172a;line-height:1.5;"><b>Remarks:</b> ${escapeHTML(remarksText)}</div>` : ""}
        </div>
    ` : "";

    mount.innerHTML = `
        <div style="width:210mm;min-height:286mm;padding:${topMm}mm 16mm 14mm 16mm;background:#fff;color:#0f172a;font-family:'Plus Jakarta Sans',system-ui,sans-serif;display:flex;flex-direction:column;">
            ${headerHtml}

            <!-- DOCTOR INFO & VISIT META -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #cbd5e1;padding-bottom:10px;margin-bottom:12px;gap:14px;">
                <div>
                    <div style="font-size:16px;font-weight:800;color:#0f172a;">${escapeHTML(docObj.name)}</div>
                    ${docObj.qualification ? `<div style="font-size:12px;font-weight:700;color:#334155;margin-top:2px;">${escapeHTML(docObj.qualification)}</div>` : ""}
                    ${docObj.reg_no ? `<div style="font-size:11.5px;color:#475569;margin-top:2px;"><b>Reg. No.:</b> ${escapeHTML(docObj.reg_no)}</div>` : ""}
                </div>
                <div style="text-align:right;font-size:12px;line-height:1.55;">
                    <div><b>Date:</b> ${escapeHTML(dateStr)}</div>
                    <div><b>OPD Token:</b> #${patient.token || "-"} (${escapeHTML(patient.shift || "")} OPD)</div>
                    <div><b>Visit Type:</b> ${escapeHTML(patient.visit_type || "Fresh")}</div>
                </div>
            </div>

            <!-- PATIENT DEMOGRAPHICS GRID -->
            <div style="border:1.5px solid #0f172a;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;line-height:1.6;">
                <div style="display:grid;grid-template-columns:1.4fr 0.8fr 1fr;gap:4px 12px;">
                    <div><b>Patient Name:</b> ${escapeHTML(patient.name)}</div>
                    <div><b>Age / Sex:</b> ${patient.age} Y / ${escapeHTML(patient.gender)}</div>
                    <div><b>Mobile:</b> ${escapeHTML(patient.phone)}</div>
                </div>
                ${(patient.guardian_name || patient.patient_address) ? `
                <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:4px 12px;margin-top:4px;padding-top:4px;border-top:1px dashed #cbd5e1;">
                    <div><b>Father's / Guardian's Name:</b> ${escapeHTML(patient.guardian_name || "—")}</div>
                    <div><b>Address:</b> ${escapeHTML(patient.patient_address || "—")}</div>
                </div>` : ""}
            </div>

            ${preExamHtml}

            <!-- RX BODY -->
            <div style="flex:1;">
                <div style="font-size:24px;font-weight:900;margin-bottom:8px;color:#0f172a;font-family:Georgia,serif;">℞</div>
                <div style="white-space:pre-wrap;font-size:14px;line-height:1.8;min-height:105mm;border-left:3px solid #0f172a;padding-left:14px;">${escapeHTML(patient.rx_notes || "")}</div>
            </div>

            <!-- FOOTER & SIGNATURE -->
            <div style="border-top:1.5px solid #cbd5e1;padding-top:14px;margin-top:20px;display:flex;justify-content:space-between;align-items:flex-end;font-size:12px;">
                <div>
                    <div><b>Follow-Up Advised:</b> ${escapeHTML(recallText)}</div>
                    <div style="color:#64748b;font-size:10.5px;margin-top:5px;">Not valid for medico-legal purposes unless physically signed & stamped.</div>
                </div>
                <div style="text-align:right;min-width:210px;">
                    <div style="height:38px;border-bottom:1px dashed #64748b;margin-bottom:6px;"></div>
                    <div style="font-weight:800;font-size:13px;">${escapeHTML(docObj.name)}</div>
                    ${docObj.qualification ? `<div style="color:#334155;font-size:11px;">${escapeHTML(docObj.qualification)}</div>` : ""}
                    ${docObj.reg_no ? `<div style="color:#334155;font-size:11px;">Reg. No.: ${escapeHTML(docObj.reg_no)}</div>` : ""}
                    <div style="color:#64748b;font-size:10.5px;">Doctor's Signature & Stamp</div>
                </div>
            </div>
        </div>
    `;
    window.print();
}

function printThermalTokenSlip(patient, clinic) {
    const mount = ensurePrintContainer();
    const docName = getDoctorNameById(clinic, patient.doctor);
    mount.innerHTML = `
        <div style="width:58mm;padding:3mm;background:#fff;color:#000;font-family:monospace;font-size:11px;">
            <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:5px;">
                <div style="font-weight:800;font-size:13px;">${escapeHTML(clinic.clinic_name)}</div>
                <div style="font-size:10px;">${escapeHTML(docName)}</div>
                <div style="font-size:10px;">${escapeHTML(patient.shift || "")} OPD • ${escapeHTML(formatDateLabel(patient.token_day))}</div>
            </div>
            <div style="text-align:center;margin:8px 0;">
                <div style="font-size:10px;">OPD TOKEN</div>
                <div style="font-size:26px;font-weight:800;">#${patient.token || "-"}</div>
            </div>
            <div style="border-top:1px dashed #000;padding-top:5px;">
                <div>Patient: ${escapeHTML(patient.name)} (${patient.age}${escapeHTML(patient.gender)})</div>
                ${patient.guardian_name ? `<div>S/o-C/o: ${escapeHTML(patient.guardian_name)}</div>` : ""}
                <div>Visit: ${escapeHTML(patient.visit_type)}</div>
                <div>Fee: Rs.${patient.fee} (${escapeHTML(patient.pay_mode)})</div>
                <div>Time: ${escapeHTML(formatTimeIST(patient.created_at))}</div>
            </div>
        </div>
    `;
    window.print();
}

function initInactivityAutoLock(storageKeys) {
    const keys = Array.isArray(storageKeys) ? storageKeys : [storageKeys];
    let timer;
    const reset = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            for (const k of keys) {
                const tok = sessionStorage.getItem(k);
                if (tok && /^[a-f0-9]{64}$/.test(tok)) {
                    await api("revokeSession", { token: tok, kind: "staff" });
                }
                sessionStorage.removeItem(k);
            }
            window.location.reload();
        }, 15 * 60 * 1000);
    };
    ["click", "keydown", "mousemove", "touchstart"].forEach(ev => document.addEventListener(ev, reset, { passive: true }));
    reset();
}

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

function waNumber(raw) {
    let d = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
    if (d.length === 10) d = "91" + d;
    return d;
}

function buildWhatsAppUrl(phone, msg) {
    const clean = waNumber(phone);
    if (!clean) return "#";
    return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
}

function openWhatsApp(phone, msg) {
    const url = buildWhatsAppUrl(phone, msg);
    if (url !== "#") window.open(url, "_blank", "noopener,noreferrer");
}