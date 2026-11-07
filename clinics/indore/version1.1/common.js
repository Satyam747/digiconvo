/*
=========================================================
CLINICOS SAAS - SHARED ENGINE (v5.2)
Multi-Doctor Support • Strict Tenant Isolation • Audio & Print
=========================================================
*/
"use strict";

const hasSupabaseConfig = Boolean(CONFIG.SUPABASE.URL && CONFIG.SUPABASE.ANON_KEY && window.supabase);
const supabaseClient = hasSupabaseConfig
    ? window.supabase.createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.ANON_KEY)
    : null;

const THEME_PRESETS = {
    emerald: { primary: "#10b981", bg: "#061410", card: "#0d261e", panel: "#091c16", border: "#164e3b" },
    royal:   { primary: "#38bdf8", bg: "#050d1a", card: "#0f223d", panel: "#091628", border: "#1e3a5f" },
    gold:    { primary: "#c5a880", bg: "#05070f", card: "#141b2d", panel: "#0b0f19", border: "#24304d" },
    crimson: { primary: "#f97316", bg: "#120705", card: "#27120e", panel: "#1a0b08", border: "#482119" },
    plum:    { primary: "#c084fc", bg: "#0e0616", card: "#221133", panel: "#150a21", border: "#3b1d59" }
};

function applyThemePreset(themeKey) {
    const t = THEME_PRESETS[themeKey] || THEME_PRESETS.emerald;
    const root = document.documentElement;
    root.style.setProperty("--primary", t.primary);
    root.style.setProperty("--bg-main", t.bg);
    root.style.setProperty("--bg-card", t.card);
    root.style.setProperty("--bg-panel", t.panel);
    root.style.setProperty("--border-col", t.border);
}

/*=========================================================
MULTI-DOCTOR NORMALIZER
Ensures every clinic supports 1 to N doctors seamlessly
=========================================================*/
function normalizeDoctorsList(clinicObj) {
    if (Array.isArray(clinicObj.doctors) && clinicObj.doctors.length > 0) {
        return clinicObj.doctors.map((d, idx) => ({
            id: d.id || `doc${idx + 1}`,
            name: d.name || `Doctor ${idx + 1}`
        }));
    }
    const list = [];
    if (clinicObj.doc1_name) list.push({ id: "doc1", name: clinicObj.doc1_name });
    if (clinicObj.doc2_name && clinicObj.doc2_name.trim() !== "" && clinicObj.doc2_name !== "-") {
        list.push({ id: "doc2", name: clinicObj.doc2_name });
    }
    if (list.length === 0) list.push({ id: "doc1", name: "Consulting Doctor" });
    clinicObj.doctors = list;
    return list;
}

function parseDoctorsFromText(rawText, existing = []) {
    const names = String(rawText || "").split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 20);
    if (names.length === 0) names.push("Consulting Doctor");
    const byName = new Map((existing || []).map(d => [String(d.name).trim().toLowerCase(), d.id]));
    const used = new Set();
    const out = names.map(name => {
        const id = byName.get(name.toLowerCase());
        if (id && !used.has(id)) { used.add(id); return { id, name }; }
        return { id: null, name };
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

function setOptionsIfChanged(el, html) {
    if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
}

function formatDoctorsToText(doctorsArr) {
    return (doctorsArr || []).map(d => d.name).join("\n");
}

function getDoctorNameById(clinicObj, docId) {
    const docs = normalizeDoctorsList(clinicObj);
    const found = docs.find(d => d.id === docId) || docs[0];
    return found ? found.name : "Doctor";
}

/*=========================================================
SUPABASE API DISPATCHER (FAIL-CLOSED PRODUCTION MODE)
=========================================================*/
async function api(action, data = {}) {
    const slug = data.slug || CONFIG.TENANT.SLUG;
    const recPin = sessionStorage.getItem(CONFIG.STORAGE.RECEPTION_PIN) || data.pin || "";
    const docPin = sessionStorage.getItem(CONFIG.STORAGE.DOCTOR_PIN) || data.pin || "";

    if (supabaseClient) {
        try {
            let lastRpcError = null;
            const callRpc = async (functionName, args) => {
                const result = await supabaseClient.rpc(functionName, args);
                lastRpcError = result.error || null;
                if (lastRpcError) {
                    console.error("ClinicOS Supabase RPC failed", {
                        action,
                        functionName,
                        code: lastRpcError.code,
                        message: lastRpcError.message,
                        details: lastRpcError.details,
                        hint: lastRpcError.hint
                    });
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
                        if (res.success && !res.doctors) {
                            res.doctors = [
                                { id: "doc1", name: res.doc1_name || "Doctor 1" },
                                ...(res.doc2_name && res.doc2_name !== "-" ? [{ id: "doc2", name: res.doc2_name }] : [])
                            ];
                        }
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
                        p_pin: String(data.pin)
                    });
                    if (!error && res) return res;
                    break;
                }
                case "verifyDoctorPin": {
                    const { data: res, error } = await callRpc("staff_login", {
                        p_slug: slug,
                        p_role: "doctor",
                        p_pin: String(data.pin)
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
                    const { data: res, error } = await callRpc("saas_list_clinics", {
                        p_secret: data.secret
                    });
                    if (!error && res) return res;
                    break;
                }
                case "saasUpsert": {
                    const { data: res, error } = await callRpc("saas_upsert_clinic", {
                        p_secret: data.secret,
                        p_data: data.payload
                    });
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
                    const { data: res, error } = await callRpc("saas_toggle_clinic", {
                        p_secret: data.secret,
                        p_slug: data.targetSlug
                    });
                    if (!error && res) return res;
                    break;
                }
                case "saasExtend": {
                    const { data: res, error } = await callRpc("saas_extend_clinic_sub", {
                        p_secret: data.secret,
                        p_slug: data.targetSlug
                    });
                    if (!error && res) return res;
                    break;
                }
                case "saasDelete": {
                    const { data: res, error } = await callRpc("saas_delete_clinic", {
                        p_secret: data.secret,
                        p_slug: data.targetSlug
                    });
                    if (!error && res) return res;
                    break;
                }
            }
            if (lastRpcError) {
                return {
                    success: false,
                    message: `Supabase request failed (${lastRpcError.code || "unknown code"}). Share this code with support.`
                };
            }
            return { success: false, message: "Supabase returned no usable response. No changes were saved." };
        } catch (err) {
            console.error("Clinic server request failed:", err);
            const errorCode = err && (err.code || err.name);
            return {
                success: false,
                message: `Clinic request failed (${errorCode || "network error"}). No changes were saved. Share this code with support.`
            };
        }
    }

    return { success: false, message: "The clinic server is not available. No changes were saved. Please try again." };
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
PRINT ENGINE (A4 LETTERHEAD & 58MM SLIP)
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
    const docName = getDoctorNameById(clinic, patient.doctor || clinic.active_doctor);
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    mount.innerHTML = `
        <div style="width:210mm;min-height:290mm;padding:${topMm}mm 16mm 16mm 16mm;background:#fff;color:#000;font-family:sans-serif;">
            <div style="display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px;">
                <div>
                    <div style="font-size:17px;font-weight:800;">Token #${patient.token || "-"} — ${escapeHTML(patient.name)} (${patient.age}/${escapeHTML(patient.gender)})</div>
                    <div style="font-size:12px;color:#334155;">Mobile: ${escapeHTML(patient.phone)} • Visit: ${escapeHTML(patient.visit_type)}</div>
                </div>
                <div style="text-align:right;font-size:12px;">
                    <div><b>Date:</b> ${dateStr}</div>
                    <div><b>Doctor:</b> ${escapeHTML(docName)}</div>
                </div>
            </div>
            <div style="background:#f8fafc;border:1px solid #cbd5e1;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:16px;display:flex;gap:18px;">
                <span><b>BP:</b> ${escapeHTML(patient.vitals?.bp || "—")}</span>
                <span><b>Weight:</b> ${escapeHTML(patient.vitals?.wt || "—")} kg</span>
                <span><b>Temp:</b> ${escapeHTML(patient.vitals?.temp || "—")} °F</span>
                <span><b>SpO2:</b> ${escapeHTML(patient.vitals?.spo2 || "—")} %</span>
            </div>
            <div style="font-size:22px;font-weight:800;margin-bottom:8px;">℞</div>
            <div style="white-space:pre-wrap;font-size:14px;line-height:1.7;min-height:115mm;border-left:3px solid #10b981;padding-left:12px;">${escapeHTML(patient.rx_notes || "")}</div>
            <div style="border-top:1px dashed #64748b;padding-top:10px;margin-top:20px;display:flex;justify-content:space-between;font-size:12px;">
                <div><b>Follow-Up Visit:</b> After ${patient.recall_days || 5} Days</div>
                <div><b>${escapeHTML(docName)}</b> — ${escapeHTML(clinic.clinic_name)}</div>
            </div>
        </div>
    `;
    window.print();
}

function printThermalTokenSlip(patient, clinic) {
    const mount = ensurePrintContainer();
    const docName = getDoctorNameById(clinic, patient.doctor || clinic.active_doctor);
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

function initInactivityAutoLock(storageKey) {
    let timer;
    const reset = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            sessionStorage.removeItem(storageKey);
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

function openWhatsApp(phone, msg) {
    const clean = waNumber(phone);
    if (!clean) return;
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
}
