/*
=========================================================
CLINICOS SAAS - SHARED ENGINE (v7.0)
Server CAPTCHA • Shift/Delay Helpers • Audio Alerts • CSV/Excel & NMC Print
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

function applyThemePreset(themeKey) {
    const t = THEME_PRESETS[themeKey] || THEME_PRESETS.emerald;
    const root = document.documentElement;
    root.style.setProperty("--primary", t.primary);
    root.style.setProperty("--primary-light", t.primaryLight);
    root.style.setProperty("--accent", t.accent);
}

/*=========================================================
MULTI-DOCTOR NORMALIZER & PARSER
=========================================================*/
function normalizeDoctorsList(clinicObj) {
    if (Array.isArray(clinicObj?.doctors) && clinicObj.doctors.length > 0) {
        return clinicObj.doctors.map((d, idx) => ({
            id: d.id || `doc${idx + 1}`,
            name: d.name || `Doctor ${idx + 1}`,
            reg_no: d.reg_no || "",
            opd_status: d.opd_status || "running",
            delay_minutes: Number(d.delay_minutes || 0),
            morning_status: d.morning_status || "open",
            evening_status: d.evening_status || "open",
            rx_templates: Array.isArray(d.rx_templates) ? d.rx_templates : []
        }));
    }
    const list = [{
        id: "doc1", name: "Consulting Doctor", reg_no: "",
        opd_status: "running", delay_minutes: 0,
        morning_status: "open", evening_status: "open", rx_templates: []
    }];
    if (clinicObj) clinicObj.doctors = list;
    return list;
}

function parseDoctorsFromText(rawText, existing = []) {
    const lines = String(rawText || "").split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 20);
    if (lines.length === 0) lines.push("Consulting Doctor");
    const byName = new Map((existing || []).map(d => [String(d.name).trim().toLowerCase(), d]));
    const used = new Set();

    const out = lines.map(line => {
        const parts = line.split("|").map(p => p.trim());
        const name = parts[0] || "Doctor";
        const prev = byName.get(name.toLowerCase());
        const reg_no = parts[1] !== undefined ? parts[1] : (prev?.reg_no || "");
        const pin = parts[2] && /^[0-9]{6}$/.test(parts[2]) ? parts[2] : "";
        if (prev && prev.id && !used.has(prev.id)) {
            used.add(prev.id);
            return { id: prev.id, name, reg_no, ...(pin ? { pin } : {}) };
        }
        return { id: null, name, reg_no, ...(pin ? { pin } : {}) };
    });

    const free = (existing || []).map(d => d.id).filter(id => !used.has(id));
    let n = 1;
    out.forEach(d => {
        if (d.id) return;
        d.id = free.shift() || null;
        if (!d.id) { while (used.has(`doc${n}`)) n++; d.id = `doc${n}`; }
        used.add(d.id);
    });
    return out;
}

function formatDoctorsToText(doctorsArr) {
    return (doctorsArr || []).map(d => d.reg_no ? `${d.name} | ${d.reg_no}` : d.name).join("\n");
}

function getDoctorById(clinicObj, docId) {
    const docs = normalizeDoctorsList(clinicObj);
    return docs.find(d => d.id === docId) || docs[0];
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

function formatDateTimeIST(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true
    });
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
                const { data: res, error } = await callRpc("public_submit_booking", {
                    p_slug: slug,
                    p_payload: data
                });
                if (!error && res) return res;
                break;
            }
            case "verifyReceptionPin": {
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
SHARED SERVER-VERIFIED CAPTCHA WIDGET (ALL 4 PAGES)
=========================================================*/
const CaptchaWidget = {
    state: {},
    async load(prefix) {
        const imgEl = document.getElementById(prefix + "Img");
        const inputEl = document.getElementById(prefix + "Input");
        if (inputEl) inputEl.value = "";
        const res = await api("getCaptcha", {});
        if (res && res.success) {
            this.state[prefix] = res.captcha_id;
            if (imgEl) imgEl.src = res.image_data;
        }
    },
    get(prefix) {
        const inputEl = document.getElementById(prefix + "Input");
        return {
            captcha_id: this.state[prefix] || "",
            captcha_answer: (inputEl?.value || "").trim().toUpperCase()
        };
    }
};

/*=========================================================
AUDIO & VOICE ENGINE (CABIN CHIME + INCOMING REQUEST RING)
=========================================================*/
let sharedAudioCtx = null;

function getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume();
    return sharedAudioCtx;
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

// Distinct 3-note reception alert ring for new online booking requests
function playOnlineRequestRing() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const notes = [880, 1108.73, 1318.51]; // A5 -> C#6 -> E6
        notes.forEach((freq, idx) => {
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
EXCEL / CSV EXPORT ENGINE (UTF-8 BOM FOR MICROSOFT EXCEL)
=========================================================*/
function csvEscape(val) {
    const str = String(val ?? "");
    if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
}

function exportVisitsToCsv(visits, clinic, filename) {
    const headers = [
        "Date", "Time (IST)", "OPD Shift", "Doctor", "Token #",
        "Patient Name", "Age", "Gender", "Mobile", "Visit Type",
        "Payment Mode", "Fee (INR)", "Payment Confirmed", "Status", "Follow-Up (Days)"
    ];

    const rows = (visits || []).map(v => [
        v.token_day || "",
        formatTimeIST(v.payment_confirmed_at || v.created_at),
        (v.shift || "") + " OPD",
        getDoctorNameById(clinic, v.doctor),
        v.token ?? "-",
        v.name || "",
        v.age ?? "",
        v.gender || "",
        v.phone || "",
        v.visit_type || "",
        v.pay_mode || "",
        Number(v.fee || 0),
        v.payment_verified ? "Yes" : "No",
        String(v.status || "").toUpperCase(),
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
}

/*=========================================================
NMC-COMPLIANT PRINT ENGINE (A4 LETTERHEAD & 58MM SLIP)
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
    const topMm = Number(clinic.letterhead_margin_mm ?? 45);
    const docObj = getDoctorById(clinic, patient.doctor || clinic.authenticated_doctor_id);
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const recallDays = Number(patient.recall_days ?? 5);
    const recallText = recallDays === 0 ? "No follow-up required (SOS)" : `After ${recallDays} Days`;

    mount.innerHTML = `
        <div style="width:210mm;min-height:290mm;padding:${topMm}mm 16mm 16mm 16mm;background:#fff;color:#0f172a;font-family:'Plus Jakarta Sans',sans-serif;">
            <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:14px;">
                <div>
                    <div style="font-size:17px;font-weight:800;">Token #${patient.token || "-"} (${escapeHTML(patient.shift || "")} OPD) — ${escapeHTML(patient.name)} (${patient.age} Y / ${escapeHTML(patient.gender)})</div>
                    <div style="font-size:12px;color:#475569;margin-top:2px;">Mobile: ${escapeHTML(patient.phone)} • Visit Type: ${escapeHTML(patient.visit_type)}</div>
                </div>
                <div style="text-align:right;font-size:12px;">
                    <div><b>Date:</b> ${dateStr}</div>
                    <div><b>Consultant:</b> ${escapeHTML(docObj.name)}</div>
                    ${docObj.reg_no ? `<div><b>Reg. No.:</b> ${escapeHTML(docObj.reg_no)}</div>` : ""}
                </div>
            </div>
            <div style="background:#f8fafc;border:1px solid #cbd5e1;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:16px;display:flex;gap:22px;">
                <span><b>BP:</b> ${escapeHTML(patient.vitals?.bp || "—")} mmHg</span>
                <span><b>Weight:</b> ${escapeHTML(patient.vitals?.wt || "—")} kg</span>
                <span><b>Temp:</b> ${escapeHTML(patient.vitals?.temp || "—")} °F</span>
                <span><b>SpO2:</b> ${escapeHTML(patient.vitals?.spo2 || "—")} %</span>
            </div>
            <div style="font-size:22px;font-weight:800;margin-bottom:8px;color:#059669;">℞</div>
            <div style="white-space:pre-wrap;font-size:14px;line-height:1.75;min-height:110mm;border-left:3px solid #059669;padding-left:14px;">${escapeHTML(patient.rx_notes || "")}</div>
            <div style="border-top:1px solid #cbd5e1;padding-top:18px;margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;font-size:12px;">
                <div>
                    <div><b>Follow-Up Advised:</b> ${escapeHTML(recallText)}</div>
                    <div style="color:#64748b;font-size:11px;margin-top:4px;">${escapeHTML(clinic.clinic_name)}</div>
                </div>
                <div style="text-align:right;min-width:200px;">
                    <div style="height:36px;border-bottom:1px dashed #64748b;margin-bottom:6px;"></div>
                    <div style="font-weight:800;font-size:13px;">${escapeHTML(docObj.name)}</div>
                    ${docObj.reg_no ? `<div style="color:#334155;font-size:11.5px;">Reg. No.: ${escapeHTML(docObj.reg_no)}</div>` : ""}
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
        timer = setTimeout(() => {
            keys.forEach(k => sessionStorage.removeItem(k));
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