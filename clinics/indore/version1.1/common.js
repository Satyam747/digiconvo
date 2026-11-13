/*
=========================================================
CLINICOS SAAS - SHARED ENGINE (v6.0)
Per-Doctor Auth • OTP Verification • NMC-Compliant Print Engine
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
Supports "Dr. Name | Reg No | 6-Digit PIN" per line
=========================================================*/
function normalizeDoctorsList(clinicObj) {
    if (Array.isArray(clinicObj?.doctors) && clinicObj.doctors.length > 0) {
        return clinicObj.doctors.map((d, idx) => ({
            id: d.id || `doc${idx + 1}`,
            name: d.name || `Doctor ${idx + 1}`,
            reg_no: d.reg_no || "",
            rx_templates: Array.isArray(d.rx_templates) ? d.rx_templates : []
        }));
    }
    const list = [];
    if (clinicObj?.doc1_name) list.push({ id: "doc1", name: clinicObj.doc1_name, reg_no: "", rx_templates: [] });
    if (clinicObj?.doc2_name && clinicObj.doc2_name.trim() !== "" && clinicObj.doc2_name !== "-") {
        list.push({ id: "doc2", name: clinicObj.doc2_name, reg_no: "", rx_templates: [] });
    }
    if (list.length === 0) list.push({ id: "doc1", name: "Consulting Doctor", reg_no: "", rx_templates: [] });
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
    return docs.find(d => d.id === docId) || docs[0] || { id: "doc1", name: "Doctor", reg_no: "", rx_templates: [] };
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
            case "getPublicQueue": {
                const { data: res, error } = await callRpc("get_public_clinic_queue", {
                    p_slug: slug,
                    p_phone: "",
                    p_booking_ref: String(data.booking_ref || ""),
                    p_doctor: String(data.doctor || "")
                });
                if (!error && res) {
                    if (res.success) normalizeDoctorsList(res);
                    return res;
                }
                break;
            }
            case "requestBookingOtp": {
                const { data: res, error } = await callRpc("public_request_booking_otp", {
                    p_slug: slug,
                    p_phone: String(data.phone || ""),
                    p_captcha_token: String(data.captcha_token || "")
                });
                if (!error && res) return res;
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
                    p_doctor_id: null
                });
                if (!error && res) return res;
                break;
            }
            case "verifyDoctorPin": {
                const { data: res, error } = await callRpc("staff_login", {
                    p_slug: slug,
                    p_role: "doctor",
                    p_pin: String(data.pin || ""),
                    p_doctor_id: String(data.doctor_id || "")
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
                    return res;
                }
                if (res && !res.success) return res;
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
AUDIO & VOICE ENGINE
=========================================================*/
let sharedAudioCtx = null;

function playHospitalDingDong() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
        if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume();
        const now = sharedAudioCtx.currentTime;

        const playTone = (freq, start, dur) => {
            const osc = sharedAudioCtx.createOscillator();
            const gain = sharedAudioCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.001, start);
            gain.gain.exponentialRampToValueAtTime(0.35, start + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0008, start + dur);
            osc.connect(gain);
            gain.connect(sharedAudioCtx.destination);
            osc.start(start);
            osc.stop(start + dur + 0.02);
        };
        playTone(659.25, now, 0.55);
        playTone(523.25, now + 0.35, 1.1);
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
NMC-COMPLIANT PRINT ENGINE (A4 LETTERHEAD & 58MM SLIP)
Includes Doctor Registration Number & Signature Block
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

    mount.innerHTML = `
        <div style="width:210mm;min-height:290mm;padding:${topMm}mm 16mm 16mm 16mm;background:#fff;color:#0f172a;font-family:'Plus Jakarta Sans',sans-serif;">
            <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:14px;">
                <div>
                    <div style="font-size:17px;font-weight:800;">Token #${patient.token || "-"} — ${escapeHTML(patient.name)} (${patient.age} Y / ${escapeHTML(patient.gender)})</div>
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
                    <div><b>Follow-Up Advised:</b> After ${patient.recall_days || 5} Days</div>
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
            </div>
            <div style="text-align:center;margin:8px 0;">
                <div style="font-size:10px;">OPD TOKEN</div>
                <div style="font-size:26px;font-weight:800;">#${patient.token || "-"}</div>
            </div>
            <div style="border-top:1px dashed #000;padding-top:5px;">
                <div>Patient: ${escapeHTML(patient.name)} (${patient.age}${escapeHTML(patient.gender)})</div>
                <div>Visit: ${escapeHTML(patient.visit_type)}</div>
                <div>Fee: Rs.${patient.fee} (${escapeHTML(patient.pay_mode)})</div>
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