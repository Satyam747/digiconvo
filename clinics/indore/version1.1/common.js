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

function parseDoctorsFromText(rawText) {
    const lines = String(rawText || "")
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean);
    if (lines.length === 0) return [{ id: "doc1", name: "Consulting Doctor" }];
    return lines.map((name, i) => ({ id: `doc${i + 1}`, name }));
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
LEGACY LOCAL CREDENTIAL HASHING (UNREACHABLE IN PRODUCTION MODE)
=========================================================*/
async function sha256Salted(secret) {
    const data = new TextEncoder().encode("CLINICOS_V5_SALT::" + String(secret));
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function ensureSecurityVault() {
    let raw = localStorage.getItem(CONFIG.STORAGE.LOCAL_SECURITY);
    if (!raw) {
        throw new Error("Local authentication is disabled. Configure the Supabase backend.");
    }
    return JSON.parse(raw);
}

async function verifyLocalCredential(type, slug, inputSecret) {
    const vault = await ensureSecurityVault();
    const now = Date.now();
    const inputHash = await sha256Salted(inputSecret);

    if (type === "master") {
        if (vault.masterLockedUntil > now) {
            const mins = Math.ceil((vault.masterLockedUntil - now) / 60000);
            return { success: false, locked: true, message: `Too many wrong attempts. Try again in ${mins} minute(s).` };
        }
        if (inputHash === vault.masterHash) {
            vault.masterAttempts = 0;
            vault.masterLockedUntil = 0;
            localStorage.setItem(CONFIG.STORAGE.LOCAL_SECURITY, JSON.stringify(vault));
            return { success: true };
        }
        vault.masterAttempts = (vault.masterAttempts || 0) + 1;
        if (vault.masterAttempts >= 5) vault.masterLockedUntil = now + 15 * 60000;
        localStorage.setItem(CONFIG.STORAGE.LOCAL_SECURITY, JSON.stringify(vault));
        return { success: false, message: "Invalid Master Key" };
    }

    if (!vault.clinics[slug]) return { success: false, message: "Clinic not found" };
    const cSec = vault.clinics[slug];
    if (cSec.lockedUntil > now) {
        const mins = Math.ceil((cSec.lockedUntil - now) / 60000);
        return { success: false, locked: true, message: `Locked for ${mins} min(s) due to failed attempts.` };
    }
    const targetHash = type === "doctor" ? cSec.docHash : cSec.recHash;
    if (inputHash === targetHash) {
        cSec.attempts = 0;
        cSec.lockedUntil = 0;
        localStorage.setItem(CONFIG.STORAGE.LOCAL_SECURITY, JSON.stringify(vault));
        return { success: true };
    }
    cSec.attempts = (cSec.attempts || 0) + 1;
    if (cSec.attempts >= 5) cSec.lockedUntil = now + 10 * 60000;
    localStorage.setItem(CONFIG.STORAGE.LOCAL_SECURITY, JSON.stringify(vault));
    return { success: false, message: "Incorrect 6-digit PIN" };
}

/*=========================================================
EMPTY DEVELOPMENT CLINIC STATE (NO SAMPLE PATIENT DATA)
=========================================================*/
function buildIndoreSeed(slug) {
    return {
        slug: slug || "demo",
        clinic_name: "Demo Clinic",
        tagline: "",
        address: "",
        doctors: [{ id: "doc1", name: "Doctor 1" }],
        doc1_name: "Doctor 1",
        doc2_name: "",
        active_doctor: "doc1",
        opd_status: "closed",
        fee_fresh: 0,
        fee_report: 0,
        fee_followup: 0,
        upi_id: "",
        whatsapp_number: "",
        owner_name: "",
        owner_phone: "",
        review_link: "",
        letterhead_margin_mm: 45,
        theme_color: "emerald",
        plan_price: 0,
        subscription_valid_till: "",
        is_active: false,
        peon_bell: false,
        next_token: 1,
        last_voice_call: null,
        history_lookup: {},
        recalls: [],
        tokens: []
    };
}

function getLocalClinicDB(slug = CONFIG.TENANT.SLUG) {
    const key = "clinicos_v52_db_" + slug;
    let raw = localStorage.getItem(key);
    if (!raw) {
        if (slug === "patidar") {
            const seed = buildIndoreSeed("patidar");
            localStorage.setItem(key, JSON.stringify(seed));
            return seed;
        }
        return null;
    }
    const parsed = JSON.parse(raw);
    normalizeDoctorsList(parsed);
    return parsed;
}

function saveLocalClinicDB(data, slug = CONFIG.TENANT.SLUG) {
    normalizeDoctorsList(data);
    localStorage.setItem("clinicos_v52_db_" + slug, JSON.stringify(data));
}

function getLocalTenantsList() {
    const raw = localStorage.getItem(CONFIG.STORAGE.LOCAL_TENANTS);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function maskName(fullName) {
    if (!fullName) return "Patient";
    const parts = String(fullName).trim().split(/\s+/);
    return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function maskPhone(phone) {
    const clean = String(phone || "").replace(/\D/g, "");
    return clean.length >= 2 ? `***${clean.slice(-2)}` : "***";
}

function createPublicQueueProjection(db, bookingRef, requestedDocId) {
    const doctors = normalizeDoctorsList(db);
    const activeDoc = requestedDocId || db.active_doctor || doctors[0].id;
    const docTokens = (db.tokens || []).filter(t => (t.doctor || doctors[0].id) === activeDoc);
    const inside = docTokens.find(t => t.status === "inside");
    const waiting = docTokens
        .filter(t => t.status === "waiting")
        .sort((a, b) => (b.vip ? 1 : 0) - (a.vip ? 1 : 0) || (a.token || 999) - (b.token || 999));
    const lab = docTokens.filter(t => t.status === "lab");

    let estWaitMins = 0;
    waiting.forEach(w => { estWaitMins += w.visit_type === "Fresh" ? 8 : 3; });

    const cleanBookingRef = String(bookingRef || "").trim().toLowerCase();
    const myRecord = /^[a-f0-9]{64}$/.test(cleanBookingRef)
        ? (db.tokens || []).slice().reverse().find(t => t.booking_ref === cleanBookingRef)
        : null;

    return {
        success: true,
        slug: db.slug,
        clinic_name: db.clinic_name,
        tagline: db.tagline,
        address: db.address,
        doctors: doctors,
        active_doctor: activeDoc,
        opd_status: db.opd_status || "running",
        fee_fresh: db.fee_fresh,
        fee_report: db.fee_report,
        fee_followup: 0,
        upi_id: db.upi_id,
        whatsapp_number: db.whatsapp_number,
        review_link: db.review_link,
        theme_color: db.theme_color || "emerald",
        is_active: db.is_active !== false,
        last_voice_call: db.last_voice_call,
        now_serving: inside ? {
            token: inside.token,
            masked_name: maskName(inside.name),
            visit_type: inside.visit_type
        } : null,
        waiting_count: waiting.length,
        arrived_count: waiting.filter(w => w.arrived).length,
        est_wait_mins: estWaitMins,
        waiting_list: waiting.map(w => ({
            token: w.token,
            masked_name: maskName(w.name),
            masked_phone: maskPhone(w.phone),
            visit_type: w.visit_type,
            arrived: Boolean(w.arrived),
            vip: Boolean(w.vip)
        })),
        lab_list: lab.map(l => ({
            token: l.token,
            masked_name: maskName(l.name)
        })),
        my_booking: myRecord ? {
            id: myRecord.id,
            token: myRecord.token,
            masked_name: maskName(myRecord.name),
            doctor_name: getDoctorNameById(db, myRecord.doctor),
            status: myRecord.status,
            visit_type: myRecord.visit_type,
            fee: myRecord.fee,
            arrived: myRecord.arrived
        } : null
    };
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
            switch (action) {
                case "getPublicQueue": {
                    const { data: res, error } = await supabaseClient.rpc("get_public_clinic_queue", {
                        p_slug: slug,
                        p_phone: "",
                        p_booking_ref: String(data.booking_ref || ""),
                        p_doctor: String(data.doctor || "")
                    });
                    if (!error && res && res.success) {
                        // Also fetch full doctors array if stored in clinic_state
                        if (!res.doctors) {
                            res.doctors = [
                                { id: "doc1", name: res.doc1_name || "Doctor 1" },
                                ...(res.doc2_name && res.doc2_name !== "-" ? [{ id: "doc2", name: res.doc2_name }] : [])
                            ];
                        }
                        return res;
                    }
                    if (res && res.notFound) return res;
                    break;
                }
                case "submitBooking": {
                    const { data: res, error } = await supabaseClient.rpc("public_submit_booking", {
                        p_slug: slug,
                        p_payload: data
                    });
                    if (!error && res) return res;
                    break;
                }
                case "verifyReceptionPin": {
                    const { data: res, error } = await supabaseClient.rpc("verify_clinic_pin", {
                        p_slug: slug,
                        p_role: "reception",
                        p_pin: String(data.pin)
                    });
                    if (!error && res) return res;
                    break;
                }
                case "verifyDoctorPin": {
                    const { data: res, error } = await supabaseClient.rpc("verify_clinic_pin", {
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
                    const { data: res, error } = await supabaseClient.rpc("get_staff_clinic_dashboard", {
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
                    const { data: res, error } = await supabaseClient.rpc("staff_mutate_clinic", {
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
                    const { data: res, error } = await supabaseClient.rpc("saas_list_clinics", {
                        p_secret: data.secret
                    });
                    if (!error && res) return res;
                    break;
                }
                case "saasUpsert": {
                    const { data: res, error } = await supabaseClient.rpc("saas_upsert_clinic", {
                        p_secret: data.secret,
                        p_data: data.payload
                    });
                    if (!error && res) return res;
                    break;
                }
                case "saasUpdateMaster": {
                    const { data: res, error } = await supabaseClient.rpc("saas_update_master_config", {
                        p_current_secret: data.currentSecret,
                        p_new_secret: data.newSecret || "",
                        p_whatsapp: data.providerWhatsapp || "",
                        p_upi: data.providerUpi || ""
                    });
                    if (!error && res) return res;
                    break;
                }
                case "saasToggle": {
                    const { data: res, error } = await supabaseClient.rpc("saas_toggle_clinic", {
                        p_secret: data.secret,
                        p_slug: data.targetSlug
                    });
                    if (!error && res) return res;
                    break;
                }
                case "saasExtend": {
                    const { data: res, error } = await supabaseClient.rpc("saas_extend_clinic_sub", {
                        p_secret: data.secret,
                        p_slug: data.targetSlug
                    });
                    if (!error && res) return res;
                    break;
                }
                case "saasDelete": {
                    const { data: res, error } = await supabaseClient.rpc("saas_delete_clinic", {
                        p_secret: data.secret,
                        p_slug: data.targetSlug
                    });
                    if (!error && res) return res;
                    break;
                }
            }
            return {
                success: false,
                message: "The clinic server did not return a valid response. No changes were saved."
            };
        } catch (err) {
            console.error("Clinic server request failed:", err);
            return {
                success: false,
                message: "The clinic server is unavailable. No changes were saved. Please try again."
            };
        }
    }

    // Production mode must never silently write clinic records to browser-local storage.
    if (!supabaseClient) {
        return {
            success: false,
            message: "The clinic server is not available. No changes were saved. Please try again."
        };
    }

    // Legacy local engine retained for reference only; production requests cannot reach it.
    const db = getLocalClinicDB(slug);
    const vault = await ensureSecurityVault();

    switch (action) {
        case "getPublicQueue": {
            if (!db) return { success: false, notFound: true, message: `Clinic "${slug}" not found.` };
            return createPublicQueueProjection(db, data.booking_ref, data.doctor);
        }
        case "submitBooking": {
            if (!db) return { success: false, message: "Clinic not found." };
            if (db.is_active === false) {
                return { success: false, message: "Online booking is unavailable for this clinic." };
            }
            if (db.opd_status === "closed") {
                return { success: false, message: "Online booking is closed right now." };
            }
            const cleanPhone = String(data.phone || "").replace(/\D/g, "");
            if (!/^[0-9]{10}$/.test(cleanPhone)) {
                return { success: false, message: "Please enter a valid 10-digit mobile number." };
            }
            const bookingRef = String(data.booking_ref || "").trim().toLowerCase();
            if (!/^[a-f0-9]{64}$/.test(bookingRef)) {
                return { success: false, message: "Could not create a secure booking reference. Please reload and try again." };
            }
            const existingInq = db.tokens.find(t => t.phone === cleanPhone && t.status === "inquiry");
            if (existingInq) {
                return { success: false, message: "Your request is already pending with reception." };
            }
            const feeMap = { "Fresh": db.fee_fresh, "Follow-up": 0, "Report": db.fee_report };
            const fee = feeMap[data.visit_type] ?? db.fee_fresh;
            const newRec = {
                id: "INQ_" + Date.now(),
                token: null,
                name: String(data.name || "").trim().substring(0, 80),
                age: Number(data.age || 30),
                gender: data.gender || "M",
                phone: cleanPhone,
                booking_ref: bookingRef,
                doctor: data.doctor || db.active_doctor || "doc1",
                shift: data.shift || "Evening",
                visit_type: data.visit_type || "Fresh",
                fee: fee,
                pay_mode: fee === 0 ? "Free" : (data.pay_mode || "UPI"),
                utr: String(data.utr || "").replace(/\D/g, "").substring(0, 4),
                status: "inquiry",
                arrived: false,
                vip: false,
                vitals: { bp: "", wt: "", temp: "", spo2: "" },
                rx_notes: "",
                recall_days: 5,
                created_at: new Date().toISOString()
            };
            db.tokens.push(newRec);
            saveLocalClinicDB(db, slug);
            return { success: true, booking: newRec };
        }
        case "verifyReceptionPin": {
            if (!/^[0-9]{6}$/.test(String(data.pin || ""))) return { success: false, message: "PIN must be 6 digits." };
            return await verifyLocalCredential("reception", slug, data.pin);
        }
        case "verifyDoctorPin": {
            if (!/^[0-9]{6}$/.test(String(data.pin || ""))) return { success: false, message: "PIN must be 6 digits." };
            return await verifyLocalCredential("doctor", slug, data.pin);
        }
        case "getStaffDashboard": {
            if (!db) return { success: false, notFound: true, message: "Clinic not found." };
            const role = data.role || "reception";
            const pinToCheck = role === "doctor" ? docPin : recPin;
            const auth = await verifyLocalCredential(role, slug, pinToCheck);
            if (!auth.success) return auth;
            return { success: true, clinic: db };
        }
        case "staffAction": {
            if (!db) return { success: false, message: "Clinic not found." };
            const role = data.role || "reception";
            const pinToCheck = role === "doctor" ? docPin : recPin;
            const auth = await verifyLocalCredential(role, slug, pinToCheck);
            if (!auth.success) return auth;
            return await executeLocalStaffMutation(db, slug, role, data.op, data.payload || {}, vault);
        }
        case "saasList": {
            const auth = await verifyLocalCredential("master", null, data.secret);
            if (!auth.success) return auth;
            return {
                success: true,
                provider_whatsapp: vault.providerWhatsapp,
                provider_upi: vault.providerUpi,
                data: getLocalTenantsList()
            };
        }
        case "saasUpsert": {
            const auth = await verifyLocalCredential("master", null, data.secret);
            if (!auth.success) return auth;
            const p = data.payload;
            if (!p || !p.rec_pin || !p.doc_pin) return { success: false, message: "Both staff PINs are required for a new clinic." };
            if (p.rec_pin && !/^[0-9]{6}$/.test(p.rec_pin)) return { success: false, message: "Reception PIN must be 6 digits." };
            if (p.doc_pin && !/^[0-9]{6}$/.test(p.doc_pin)) return { success: false, message: "Doctor PIN must be 6 digits." };

            const doctors = Array.isArray(p.doctors) && p.doctors.length > 0
                ? p.doctors
                : parseDoctorsFromText(p.doctors_text || p.doc1_name || "Consulting Doctor");
            p.doctors = doctors;
            p.doc1_name = doctors[0]?.name || "Doctor 1";
            p.doc2_name = doctors[1]?.name || "";

            const list = getLocalTenantsList();
            const idx = list.findIndex(x => x.slug === p.slug);
            if (idx >= 0) list[idx] = { ...list[idx], ...p };
            else list.unshift({ ...p, token_count: p.clone_demo ? 9 : 0 });
            localStorage.setItem(CONFIG.STORAGE.LOCAL_TENANTS, JSON.stringify(list));

            let tDb = getLocalClinicDB(p.slug);
            const isNewClinic = idx < 0;
            if (!tDb) {
                tDb = buildIndoreSeed(p.slug);
            }
            if (isNewClinic && !p.clone_demo) {
                tDb.tokens = [];
                tDb.history_lookup = {};
                tDb.recalls = [];
                tDb.last_voice_call = null;
                tDb.next_token = 1;
            }
            Object.assign(tDb, p);
            saveLocalClinicDB(tDb, p.slug);

            if (!vault.clinics[p.slug]) {
                vault.clinics[p.slug] = {
                    recHash: await sha256Salted(p.rec_pin),
                    docHash: await sha256Salted(p.doc_pin),
                    attempts: 0,
                    lockedUntil: 0
                };
            } else {
                if (p.rec_pin) vault.clinics[p.slug].recHash = await sha256Salted(p.rec_pin);
                if (p.doc_pin) vault.clinics[p.slug].docHash = await sha256Salted(p.doc_pin);
                vault.clinics[p.slug].attempts = 0;
                vault.clinics[p.slug].lockedUntil = 0;
            }
            localStorage.setItem(CONFIG.STORAGE.LOCAL_SECURITY, JSON.stringify(vault));
            return { success: true };
        }
        case "saasUpdateMaster": {
            const auth = await verifyLocalCredential("master", null, data.currentSecret);
            if (!auth.success) return auth;
            if (data.newSecret) {
                if (data.newSecret.length < 8) return { success: false, message: "Master Key must be at least 8 characters." };
                vault.masterHash = await sha256Salted(data.newSecret);
            }
            vault.providerWhatsapp = data.providerWhatsapp || "";
            vault.providerUpi = data.providerUpi || "";
            localStorage.setItem(CONFIG.STORAGE.LOCAL_SECURITY, JSON.stringify(vault));
            return { success: true };
        }
        case "saasToggle": {
            const auth = await verifyLocalCredential("master", null, data.secret);
            if (!auth.success) return auth;
            const list = getLocalTenantsList();
            const f = list.find(x => x.slug === data.targetSlug);
            if (f) {
                f.is_active = !f.is_active;
                localStorage.setItem(CONFIG.STORAGE.LOCAL_TENANTS, JSON.stringify(list));
                const tDb = getLocalClinicDB(data.targetSlug);
                if (tDb) { tDb.is_active = f.is_active; saveLocalClinicDB(tDb, data.targetSlug); }
            }
            return { success: true };
        }
        case "saasExtend": {
            const auth = await verifyLocalCredential("master", null, data.secret);
            if (!auth.success) return auth;
            const list = getLocalTenantsList();
            const f = list.find(x => x.slug === data.targetSlug);
            if (f) {
                const base = f.subscription_valid_till && new Date(f.subscription_valid_till) > new Date()
                    ? new Date(f.subscription_valid_till) : new Date();
                base.setDate(base.getDate() + 30);
                f.subscription_valid_till = base.toISOString().split("T")[0];
                localStorage.setItem(CONFIG.STORAGE.LOCAL_TENANTS, JSON.stringify(list));
                const tDb = getLocalClinicDB(data.targetSlug);
                if (tDb) { tDb.subscription_valid_till = f.subscription_valid_till; saveLocalClinicDB(tDb, data.targetSlug); }
            }
            return { success: true };
        }
        case "saasDelete": {
            const auth = await verifyLocalCredential("master", null, data.secret);
            if (!auth.success) return auth;
            if (data.targetSlug === "patidar") return { success: false, message: "Default clinic cannot be deleted." };
            const list = getLocalTenantsList().filter(x => x.slug !== data.targetSlug);
            localStorage.setItem(CONFIG.STORAGE.LOCAL_TENANTS, JSON.stringify(list));
            localStorage.removeItem("clinicos_v52_db_" + data.targetSlug);
            return { success: true };
        }
    }
}

async function executeLocalStaffMutation(db, slug, role, op, p, vault) {
    const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    switch (op) {
        case "switchDoctor":
            db.active_doctor = p.doctor || "doc1";
            break;
        case "setOpdStatus":
            db.opd_status = p.status;
            break;
        case "walkIn": {
            const tokenNo = db.next_token++;
            const feeMap = { "Fresh": db.fee_fresh, "Follow-up": 0, "Report": db.fee_report };
            const fee = p.pay_mode === "Free" ? 0 : (feeMap[p.visit_type] ?? db.fee_fresh);
            db.tokens.push({
                id: "T_" + Date.now(),
                token: tokenNo,
                name: String(p.name || "").trim(),
                age: Number(p.age || 35),
                gender: p.gender || "M",
                phone: String(p.phone || "").replace(/\D/g, ""),
                doctor: p.doctor || db.active_doctor || "doc1",
                shift: "Walk-In",
                visit_type: p.visit_type || "Fresh",
                fee: fee,
                pay_mode: p.pay_mode || "Cash",
                utr: "",
                status: "waiting",
                arrived: true,
                vip: false,
                vitals: { bp: "", wt: "", temp: "", spo2: "" },
                rx_notes: "",
                recall_days: 5,
                created_at: nowTime
            });
            break;
        }
        case "approveInquiry": {
            const item = db.tokens.find(x => x.id === p.id);
            if (item) {
                item.token = db.next_token++;
                item.status = "waiting";
                    item.payment_verified = item.pay_mode !== "UPI" || Boolean(p.payment_confirmed);
                if (item.visit_type === "Follow-up") {
                    const priorVisit = db.tokens
                        .filter(x => x.phone === item.phone && x.status === "completed" && !x.recall_completed_at)
                        .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))[0];
                    if (priorVisit) priorVisit.recall_completed_at = new Date().toISOString();
                }
            }
            break;
        }
        case "rejectInquiry": {
            db.tokens = db.tokens.filter(x => x.id !== p.id);
            break;
        }
        case "toggleArrived": {
            const item = db.tokens.find(x => x.id === p.id);
            if (item) item.arrived = !item.arrived;
            break;
        }
        case "toggleVip": {
            const item = db.tokens.find(x => x.id === p.id);
            if (item) item.vip = !item.vip;
            break;
        }
        case "saveVitals": {
            const item = db.tokens.find(x => x.id === p.id);
            if (item) item.vitals = { bp: p.bp || "", wt: p.wt || "", temp: p.temp || "", spo2: p.spo2 || "" };
            break;
        }
        case "changePayMode": {
            const item = db.tokens.find(x => x.id === p.id);
            if (item) {
                item.pay_mode = p.pay_mode;
                item.fee = item.visit_type === "Follow-up" || p.pay_mode === "Free" ? 0 : (item.visit_type === "Report" ? db.fee_report : db.fee_fresh);
            }
            break;
        }
        case "sendInside": {
            const doc = p.doctor || db.active_doctor || "doc1";
            const nextP = db.tokens.find(x => x.id === p.id);
            if (!nextP) return { success: false, message: "Patient not found." };
            const currentInside = db.tokens.find(t => t.doctor === doc && t.status === "inside");
            if (currentInside && currentInside.id !== nextP.id) {
                return {
                    success: false,
                    message: "Complete the current patient's visit before sending another patient in."
                };
            }
            nextP.status = "inside";
            nextP.arrived = true;
            db.last_voice_call = {
                token: nextP.token,
                name: nextP.name,
                doctor_id: doc,
                doctor: getDoctorNameById(db, doc),
                ts: Date.now()
            };
            break;
        }
        case "parkInLab": {
            const item = db.tokens.find(x => x.id === p.id);
            if (item) item.status = "lab";
            break;
        }
        case "returnFromLab": {
            const item = db.tokens.find(x => x.id === p.id);
            if (item) {
                item.status = "waiting";
                item.arrived = true;
                item.vip = true;
            }
            break;
        }
        case "completeAndCallNext": {
            const doc = p.doctor || db.active_doctor || "doc1";
            db.last_voice_call = null;
            const currentInside = db.tokens.find(t => t.doctor === doc && t.status === "inside");
            if (currentInside) {
                if (p.rx_notes !== undefined) currentInside.rx_notes = p.rx_notes;
                if (p.recall_days) currentInside.recall_days = Number(p.recall_days);
                currentInside.status = "completed";
                currentInside.completed_at = new Date().toISOString();
                currentInside.recall_due_date = new Date(Date.now() + Number(p.recall_days || currentInside.recall_days || 5) * 86400000).toISOString().slice(0, 10);
            }
            const nextArrived = db.tokens
                .filter(t => t.doctor === doc && t.status === "waiting" && t.arrived)
                .sort((a, b) => (b.vip ? 1 : 0) - (a.vip ? 1 : 0) || (a.token || 999) - (b.token || 999))[0];
            if (nextArrived) {
                nextArrived.status = "inside";
                db.last_voice_call = {
                    token: nextArrived.token,
                    name: nextArrived.name,
                    doctor_id: doc,
                    doctor: getDoctorNameById(db, doc),
                    ts: Date.now()
                };
            }
            break;
        }
        case "saveRxDraft": {
            const item = db.tokens.find(x => x.id === p.id);
            if (item) {
                item.rx_notes = p.rx_notes || "";
                if (p.recall_days) item.recall_days = Number(p.recall_days);
            }
            break;
        }
        case "setRecallDays": {
            const item = db.tokens.find(x => x.id === p.id);
            if (item) item.recall_days = Number(p.days);
            break;
        }
        case "togglePeonBell": {
            db.peon_bell = Boolean(p.active);
            break;
        }
        case "reAnnounce": {
            const doc = p.doctor || db.active_doctor || "doc1";
            const inside = db.tokens.find(t => t.doctor === doc && t.status === "inside");
            if (inside) {
                db.last_voice_call = {
                    token: inside.token,
                    name: inside.name,
                    doctor: getDoctorNameById(db, doc),
                    ts: Date.now()
                };
            }
            break;
        }
        case "saveSettings": {
            if (p.clinic_name) db.clinic_name = p.clinic_name;
            if (p.tagline !== undefined) db.tagline = p.tagline;
            if (Array.isArray(p.doctors) && p.doctors.length > 0) {
                db.doctors = p.doctors;
                db.doc1_name = p.doctors[0]?.name || "Doctor 1";
                db.doc2_name = p.doctors[1]?.name || "";
            }
            if (p.fee_fresh !== undefined) db.fee_fresh = Number(p.fee_fresh);
            if (p.fee_report !== undefined) db.fee_report = Number(p.fee_report);
            if (p.upi_id !== undefined) db.upi_id = p.upi_id;
            if (p.whatsapp_number !== undefined) db.whatsapp_number = p.whatsapp_number;
            if (p.letterhead_margin_mm !== undefined) db.letterhead_margin_mm = Number(p.letterhead_margin_mm);

            if (p.new_pin) {
                if (!/^[0-9]{6}$/.test(String(p.new_pin))) {
                    return { success: false, message: "PIN must be 6 digits." };
                }
                if (role === "doctor") {
                    vault.clinics[slug].docHash = await sha256Salted(p.new_pin);
                    sessionStorage.setItem(CONFIG.STORAGE.DOCTOR_PIN, p.new_pin);
                } else {
                    vault.clinics[slug].recHash = await sha256Salted(p.new_pin);
                    sessionStorage.setItem(CONFIG.STORAGE.RECEPTION_PIN, p.new_pin);
                }
                localStorage.setItem(CONFIG.STORAGE.LOCAL_SECURITY, JSON.stringify(vault));
            }
            break;
        }
    }

    saveLocalClinicDB(db, slug);
    return { success: true, clinic: db };
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
    const firstName = String(patientFullName || "Patient").trim().split(/\s+/)[0];
    const hindiNum = CONFIG.HINDI_NUMBERS[Number(tokenNo)] || String(tokenNo);
    const phrase = `Attention please. Token number ${hindiNum}, ${firstName} ji, kripya Doctor ke cabin mein aayein.`;

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
    const topMm = Number(clinic.letterhead_margin_mm || 45);
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
