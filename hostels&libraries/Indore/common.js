/*
=========================================================
LIBRARYOS SAAS - SHARED ENGINE (v1.0)
Fail-closed Supabase RPC access • Strict tenant isolation • Themes • WhatsApp • Receipts
=========================================================
*/
"use strict";

// Only the origin of the URL is used, so a pasted "/rest/v1", dashboard path or trailing slash cannot break requests.
function supabaseOrigin(u) { try { return new URL(String(u || "").trim()).origin; } catch (e) { return ""; } }
const SUPABASE_ORIGIN = supabaseOrigin(CONFIG.SUPABASE.URL);
const SUPABASE_KEY = String(CONFIG.SUPABASE.ANON_KEY || "").trim();
if (SUPABASE_ORIGIN && !/\.supabase\.(co|in)$|^localhost$|^127\./.test(new URL(SUPABASE_ORIGIN).hostname)) {
    console.warn("LibraryOS: config.js SUPABASE.URL should look like https://<project-ref>.supabase.co");
}
const hasSupabaseConfig = Boolean(SUPABASE_ORIGIN && SUPABASE_KEY && window.supabase);
const supabaseClient = hasSupabaseConfig ? window.supabase.createClient(SUPABASE_ORIGIN, SUPABASE_KEY) : null;
const SHIFTS = CONFIG.SHIFTS;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/*---------------- Themes + base styles ----------------*/
const THEMES = {
    indigo:  { primary: "#818cf8", bg: "#0a0d1f", card: "#131938", panel: "#0e1229", border: "#262d5c" },
    emerald: { primary: "#10b981", bg: "#061410", card: "#0d261e", panel: "#091c16", border: "#164e3b" },
    royal:   { primary: "#38bdf8", bg: "#050d1a", card: "#0f223d", panel: "#091628", border: "#1e3a5f" },
    gold:    { primary: "#c5a880", bg: "#05070f", card: "#141b2d", panel: "#0b0f19", border: "#24304d" },
    plum:    { primary: "#c084fc", bg: "#0e0616", card: "#221133", panel: "#150a21", border: "#3b1d59" }
};
function applyTheme(key) {
    const t = THEMES[key] || THEMES.indigo, r = document.documentElement.style;
    r.setProperty("--primary", t.primary); r.setProperty("--bg-main", t.bg); r.setProperty("--bg-card", t.card);
    r.setProperty("--bg-panel", t.panel); r.setProperty("--border-col", t.border);
}
const BASE_CSS = `
:root{--primary:#818cf8;--bg-main:#0a0d1f;--bg-card:#131938;--bg-panel:#0e1229;--border-col:#262d5c;--text:#eef0ff;--muted:#8d95c9;--ok:#34d399;--bad:#f87171;--warn:#fbbf24;--r:16px;--shadow:0 14px 34px -14px #000c}
*{box-sizing:border-box}[hidden]{display:none!important}html{-webkit-tap-highlight-color:transparent}
body{margin:0;color:var(--text);font:15px/1.5 'Hind',system-ui,sans-serif;min-height:100vh;
 background:radial-gradient(900px 480px at 85% -8%,color-mix(in srgb,var(--primary) 22%,transparent),transparent),radial-gradient(700px 400px at -10% 30%,color-mix(in srgb,var(--primary) 9%,transparent),transparent),var(--bg-main) fixed}
h1,h2,h3{margin:.3em 0;font-family:'Sora','Hind',sans-serif;letter-spacing:-.01em}h1{font-size:26px}h3{font-size:17px}
.wrap{max-width:900px;margin:0 auto;padding:16px;animation:rise .45s ease both}
.card{background:linear-gradient(160deg,color-mix(in srgb,var(--bg-card) 90%,#fff 5%),var(--bg-card));border:1px solid var(--border-col);border-radius:var(--r);padding:16px;margin-bottom:12px;box-shadow:var(--shadow);transition:transform .2s,border-color .2s}
.card:hover{border-color:color-mix(in srgb,var(--primary) 45%,var(--border-col))}
.btn{display:inline-block;background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 70%,#fff));color:#0a0d1f;border:0;border-radius:12px;padding:11px 16px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;text-align:center;box-shadow:0 6px 18px -8px var(--primary);transition:transform .15s,box-shadow .15s,opacity .15s}
.btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px -8px var(--primary)}.btn:active{transform:scale(.97)}
.btn.alt{background:color-mix(in srgb,var(--bg-panel) 70%,transparent);color:var(--text);border:1px solid var(--border-col);box-shadow:none}
.btn.ok{background:linear-gradient(135deg,#34d399,#10b981);box-shadow:0 6px 18px -8px #10b981}.btn.bad{background:linear-gradient(135deg,#f87171,#ef4444);box-shadow:none}
.btn:disabled,.btn.busy{opacity:.55;pointer-events:none}.btn.busy::after{content:"";display:inline-block;width:12px;height:12px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px}
.full{width:100%;display:block}
.inp{width:100%;background:var(--bg-panel);color:var(--text);border:1px solid var(--border-col);border-radius:12px;padding:11px 13px;font:inherit;transition:border-color .2s,box-shadow .2s}
.inp:focus,.btn:focus-visible,.seat:focus-visible{outline:0;border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 30%,transparent)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.sp{justify-content:space-between}.grid{display:grid;gap:10px}
.pill{display:inline-block;border-radius:99px;padding:2px 11px;font-size:12px;font-weight:700;border:1px solid var(--border-col);background:color-mix(in srgb,var(--bg-panel) 70%,transparent)}
.pill.ok{color:var(--ok);border-color:#34d39955}.pill.bad{color:var(--bad);border-color:#f8717155}.pill.warn{color:var(--warn);border-color:#fbbf2455}
.muted{color:var(--muted);font-size:13px}
.stat{font:800 34px/1.1 'Sora','Hind',sans-serif;letter-spacing:-.02em}
.bar{height:8px;border-radius:99px;background:var(--bg-panel);overflow:hidden}.bar>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--primary),var(--ok));transition:width .8s cubic-bezier(.2,.8,.2,1)}
.seats{display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:9px}
.seat{border-radius:13px;border:1.5px solid var(--border-col);background:var(--bg-panel);color:var(--text);padding:8px 3px;text-align:center;font:inherit;font-size:12px;cursor:pointer;overflow:hidden;transition:transform .15s,box-shadow .2s;animation:pop .35s ease both}
.seat:hover{transform:translateY(-2px) scale(1.04)}.seat b{display:block;font:700 16px 'Sora',sans-serif}
.seat.paid{border-color:var(--ok);background:linear-gradient(160deg,#0f3a2d,#0a2219);box-shadow:0 0 16px -8px var(--ok)}
.seat.due{border-color:var(--bad);background:linear-gradient(160deg,#4a1822,#2a0f16);box-shadow:0 0 16px -8px var(--bad)}
.seat.trial{border-color:var(--warn);background:linear-gradient(160deg,#4a3a10,#2a210a)}
.tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:14px;padding-bottom:2px;scrollbar-width:none}.tabs::-webkit-scrollbar{display:none}.tabs .btn{white-space:nowrap;padding:9px 14px}
.modal{position:fixed;inset:0;background:#000b;backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;z-index:30;animation:fade .2s ease}
.modal>div{background:var(--bg-card);border:1px solid var(--border-col);width:100%;max-width:480px;border-radius:22px 22px 0 0;padding:18px;max-height:90vh;overflow:auto;animation:up .28s cubic-bezier(.2,.9,.25,1)}
@media(min-width:640px){.modal{align-items:center}.modal>div{border-radius:22px}}
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:#fff;color:#111;padding:11px 18px;border-radius:99px;font-weight:700;z-index:50;max-width:90vw;box-shadow:0 12px 30px -10px #000;animation:up .25s ease}
.sk{border-radius:12px;background:linear-gradient(90deg,var(--bg-panel),var(--border-col),var(--bg-panel));background-size:200% 100%;animation:shimmer 1.2s infinite;min-height:64px;margin-bottom:10px}
@keyframes rise{from{opacity:0;transform:translateY(10px)}}@keyframes pop{from{opacity:0;transform:scale(.9)}}@keyframes fade{from{opacity:0}}
@keyframes up{from{opacity:0;transform:translateY(24px)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{to{background-position:-200% 0}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
#libraryosPrintMount{display:none}
@media print{body>*:not(#libraryosPrintMount){display:none!important}#libraryosPrintMount{display:block}}`;
document.head.insertAdjacentHTML("beforeend",
    `<link href="https://fonts.googleapis.com/css2?family=Hind:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" rel="stylesheet"><style>${BASE_CSS}</style>`);

/*---------------- Supabase API dispatcher (FAIL-CLOSED) ----------------*/
const sessionToken = role => sessionStorage.getItem(role === "owner" ? CONFIG.STORAGE.OWNER_TOKEN : CONFIG.STORAGE.DESK_TOKEN) || "";
const newRid = () => (crypto.randomUUID ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join(""));
const RPC = {
    getPublic:    d => ["get_public_library", { p_slug: d.slug, p_booking_ref: d.booking_ref || "" }],
    submitBooking: d => ["public_submit_booking", { p_slug: d.slug, p_payload: d.payload }],
    submitRenewal: d => ["public_submit_renewal", { p_slug: d.slug, p_booking_ref: d.booking_ref, p_utr: d.utr }],
    login:        d => ["staff_login", { p_slug: d.slug, p_role: d.role, p_pin: String(d.pin) }],
    loginNamed:   d => ["staff_login_named", { p_slug: d.slug, p_code: d.code, p_pin: String(d.pin) }],
    scan:         d => ["staff_scan", { p_slug: d.slug, p_role: d.role, p_pin: sessionToken(d.role), p_code: d.code || "", p_member_id: d.member_id || null }],
    attSummary:   d => ["staff_attendance_summary", { p_slug: d.slug, p_role: d.role, p_pin: sessionToken(d.role) }],
    staffManage:  d => ["owner_manage_staff", { p_slug: d.slug, p_pin: sessionToken("owner"), p_action: d.action, p_payload: d.payload || {} }],
    myQr:         d => ["get_my_qr", { p_slug: d.slug, p_booking_ref: d.booking_ref }],
    joinWaitlist: d => ["public_join_waitlist", { p_slug: d.slug, p_payload: d.payload }],
    restoreBooking: d => ["public_restore_booking", { p_slug: d.slug, p_phone: d.phone, p_code: d.code, p_new_ref: d.new_ref }],
    issueRecovery: d => ["staff_issue_recovery", { p_slug: d.slug, p_role: d.role, p_pin: sessionToken(d.role), p_member_id: d.member_id }],
    waitlistRemove: d => ["staff_waitlist_remove", { p_slug: d.slug, p_role: d.role, p_pin: sessionToken(d.role), p_id: d.id }],
    saasUsage:    d => ["saas_usage", { p_secret: d.secret || "" }],
    saasBilling:  d => ["saas_record_billing", { p_secret: d.secret || "", p_slug: d.targetSlug, p_amount: d.amount, p_note: d.note || "" }],
    saasSecretLogin: d => ["saas_set_secret_login", { p_secret: d.secret || "", p_allow: !!d.allow }],
    logout:       d => ["staff_logout", { p_slug: d.slug, p_role: d.role, p_pin: sessionToken(d.role) }],
    dashboard:    d => ["get_staff_library_dashboard", { p_slug: d.slug, p_role: d.role, p_pin: sessionToken(d.role) }],
    version:      d => ["get_state_version", { p_slug: d.slug, p_role: d.role, p_pin: sessionToken(d.role) }],
    staffAction:  d => ["staff_op", { p_slug: d.slug, p_role: d.role, p_pin: sessionToken(d.role), p_rid: d.rid, p_op: d.op, p_payload: d.payload || {} }],
    voidPayment:  d => ["staff_void_payment", { p_slug: d.slug, p_pin: sessionToken("owner"), p_payment_id: d.paymentId, p_reason: d.reason, p_revert_validity: !!d.revert }],
    auditList:    d => ["owner_audit_list", { p_slug: d.slug, p_pin: sessionToken("owner"), p_limit: d.limit || 100 }],
    saasList:     d => ["saas_list_libraries", { p_secret: d.secret }],
    saasUpsert:   d => ["saas_upsert_library", { p_secret: d.secret, p_data: d.payload }],
    saasMaster:   d => ["saas_update_master_config", { p_current_secret: d.currentSecret, p_new_secret: d.newSecret || "", p_whatsapp: d.whatsapp || "", p_upi: d.upi || "" }],
    saasToggle:   d => ["saas_toggle_library", { p_secret: d.secret, p_slug: d.targetSlug }],
    saasExtend:   d => ["saas_extend_library_sub", { p_secret: d.secret, p_slug: d.targetSlug }],
    saasDelete:   d => ["saas_delete_library", { p_secret: d.secret, p_slug: d.targetSlug }]
};
const ERR_HINT = {
    PGRST125: "The Supabase URL in config.js is wrong. Use only https://<project-ref>.supabase.co (Project Settings → API → Project URL).",
    PGRST202: "The database is not set up. Run migrations 0001, 0002 and 0003 (in order) in this Supabase project.",
    PGRST301: "The Supabase key in config.js is not accepted. Use the project's publishable (anon) key.",
    "42501": "Permission denied. Re-run the GRANT section of the migrations."
};
// Money-moving actions run one at a time (a double tap cannot fire twice) and are retried once with the SAME request id
// after a network drop; the server applies a request id only once.
const GATED = new Set(["submitBooking", "joinWaitlist", "restoreBooking", "submitRenewal"]);
let _actionBusy = false;
async function api(action, data = {}) {
    data.slug = data.slug || CONFIG.TENANT.SLUG;
    if (!supabaseClient) return { success: false, message: "The server is not configured. Set the Supabase URL and key in config.js. No changes were saved." };
    const isAction = action === "staffAction";
    if (isAction) { if (_actionBusy) return { success: false, message: "Please wait, the previous action is still being saved." }; _actionBusy = true; data.rid = data.rid || newRid(); }
    try {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const [fn, args] = RPC[action](data);
                let out;
                if (GATED.has(action) && CONFIG.GATE.ENABLED) {
                    if (!window.__tsToken) return { success: false, message: "Please complete the human check first." };
                    out = await supabaseClient.functions.invoke("public-gate", { body: { fn, args, token: window.__tsToken } });
                    window.__tsToken = ""; try { window.turnstile && window.turnstile.reset(); } catch (e) { }
                    if (out.error && out.error.context && out.error.context.json) { const j = await out.error.context.json().catch(() => null); if (j && j.message) return j; }
                } else out = await supabaseClient.rpc(fn, args);
                const { data: res, error } = out;
                if (error) {
                    const netLike = !error.code && /fetch|network|failed/i.test(error.message || "");
                    if (netLike && isAction && attempt === 0) { await new Promise(r => setTimeout(r, 800)); continue; }
                    console.error("LibraryOS RPC failed", { action, fn, code: error.code, message: error.message });
                    return { success: false, message: ERR_HINT[error.code] || `Request failed (${error.code || "network"}). Please try again. If it keeps happening, share this code with support.` };
                }
                return res || { success: false, message: "No usable response from the server. Please refresh and check before retrying." };
            } catch (err) {
                if (isAction && attempt === 0) { await new Promise(r => setTimeout(r, 800)); continue; }
                console.error("LibraryOS request failed:", err);
                return { success: false, message: "Network error. Please check your connection and refresh before retrying." };
            }
        }
    } finally { if (isAction) _actionBusy = false; }
}
// Button helper: shows a spinner and blocks re-clicks until the async work finishes.
async function withBusy(btn, fn) {
    if (!btn || btn.classList.contains("busy")) return;
    btn.classList.add("busy");
    try { return await fn(); } finally { btn.classList.remove("busy"); }
}
// Premium touches
function countUp(el, to, fmt = inr, ms = 700) {
    if (!el) return; const t0 = performance.now(), from = Number(el.dataset.v || 0); el.dataset.v = to;
    const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
}
const buzz = (p = 12) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };


/*---------------- English / Hindi ----------------*/
const I18N = {
    en: { open: "Admissions open", closed: "Bookings closed", seatsToday: "Seats available today", fees: "Monthly fees", reserve: "Reserve your seat", optTrial: "Free 1-day trial", optJoin: "Join the library (monthly)",
          name: "Your name", phone: "10-digit mobile number", exam: "Preparing for (e.g. MPPSC, Banking, NEET)", send: "Send request", trialBtn: "Book free trial", waitBtn: "Hall is full - join the waitlist",
          payNow: "Pay by UPI now", payCash: "Pay cash at the desk", utr: "Last 4 digits of UPI reference", yourPass: "Your pass", seat: "Seat", daysLeft: "days left", overdue: "Fee overdue by", waiting: "Waiting for the desk to confirm",
          payUpi: "Pay by UPI", paidNotify: "I have paid - notify the desk", restoreTitle: "New phone? Link your pass", restoreCode: "6-digit code from the desk", restoreBtn: "Link this phone", free: "free", sh_Morning: "Morning", sh_Evening: "Evening", "sh_Full Day": "Full Day",
          install: "Install app", qrHint: "Show this code at the desk. It refreshes every minute.", staff: "Staff login", verify: "Human check", sent: "Request sent. The desk will confirm shortly.", waitSent: "You are on the waitlist. We will message you when a seat is free." },
    hi: { open: "एडमिशन खुले हैं", closed: "बुकिंग बंद है", seatsToday: "आज उपलब्ध सीटें", fees: "मासिक फीस", reserve: "अपनी सीट बुक करें", optTrial: "मुफ़्त 1-दिन का ट्रायल", optJoin: "लाइब्रेरी जॉइन करें (मासिक)",
          name: "आपका नाम", phone: "10 अंकों का मोबाइल नंबर", exam: "किसकी तैयारी कर रहे हैं (जैसे MPPSC, बैंकिंग, NEET)", send: "रिक्वेस्ट भेजें", trialBtn: "मुफ़्त ट्रायल बुक करें", waitBtn: "हॉल भरा है - वेटलिस्ट में जुड़ें",
          payNow: "अभी UPI से भुगतान करें", payCash: "डेस्क पर नकद दें", utr: "UPI रेफरेंस के आख़िरी 4 अंक", yourPass: "आपका पास", seat: "सीट", daysLeft: "दिन बाकी", overdue: "फीस बकाया (दिन)", waiting: "डेस्क की पुष्टि का इंतज़ार है",
          payUpi: "UPI से भुगतान करें", paidNotify: "मैंने भुगतान कर दिया है", restoreTitle: "नया फ़ोन? अपना पास जोड़ें", restoreCode: "डेस्क से मिला 6 अंकों का कोड", restoreBtn: "इस फ़ोन में जोड़ें", free: "खाली", sh_Morning: "सुबह", sh_Evening: "शाम", "sh_Full Day": "पूरा दिन",
          install: "ऐप इंस्टॉल करें", qrHint: "यह कोड डेस्क पर दिखाएँ। यह हर मिनट बदलता है।", staff: "स्टाफ लॉगिन", verify: "इंसान की जाँच", sent: "रिक्वेस्ट भेज दी गई है। डेस्क जल्द पुष्टि करेगा।", waitSent: "आप वेटलिस्ट में हैं। सीट खाली होते ही हम संदेश भेजेंगे।" }
};
let LANG = localStorage.getItem("libraryos_lang") || "en";
const t = k => (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;
const setLang = l => { LANG = l; localStorage.setItem("libraryos_lang", l); };

/*---------------- Helpers ----------------*/
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}
const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const istToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const daysLeft = v => Math.round((new Date(v + "T00:00:00Z") - new Date(istToday() + "T00:00:00Z")) / 864e5);
const fmtDate = v => new Date(v + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
function toast(msg) {
    let e = $("#toast");
    if (!e) { e = document.createElement("div"); e.id = "toast"; e.className = "toast"; document.body.appendChild(e); }
    e.textContent = msg; e.hidden = false; clearTimeout(e._t); e._t = setTimeout(() => e.hidden = true, 3000);
}
function waNumber(raw) {
    let d = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
    if (d.length === 10) d = "91" + d;
    return d;
}
const waUrl = (phone, msg) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`;
function reminderMsg(m, lib) {
    const d = daysLeft(m.valid_till), fee = lib.fees[m.shift] || m.fee;
    const link = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}index.html?l=${lib.slug}`;
    return `Namaste ${m.name} ji 🙏\n${lib.library_name} se reminder: aapki seat #${m.seat} (${m.shift}) ki fees ${inr(fee)} ` +
        `${d < 0 ? `${-d} din se pending hai` : d === 0 ? "aaj due hai" : `${d} din mein due hai`} (valid till ${fmtDate(m.valid_till)}).\n` +
        `UPI: ${lib.upi_id || "desk par puchh lein"}\nPayment ke baad UTR ke last 4 digit yahan bhejein: ${link}\nDhanyavaad!`;
}
function getBookingRef() {
    let r = localStorage.getItem(CONFIG.STORAGE.MY_BOOKING_REF);
    if (!/^[a-f0-9]{64}$/.test(r || "")) {
        const b = new Uint8Array(32); crypto.getRandomValues(b);
        r = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(CONFIG.STORAGE.MY_BOOKING_REF, r);
    }
    return r;
}
// "Name:Seats" lines -> [{id,name,seats}], keeping the ID of any hall whose name is unchanged (members stay attached).
function parseHalls(text, existing = []) {
    const rows = String(text || "").split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 20).map(l => {
        const [n, c] = l.split(":"); return { name: (n || "").trim(), seats: parseInt(c, 10) || 30 };
    });
    const byName = new Map(existing.map(h => [h.name.toLowerCase(), h.id])), used = new Set();
    const out = rows.map(r => { const id = byName.get(r.name.toLowerCase()); if (id && !used.has(id)) { used.add(id); return { id, ...r }; } return { id: null, ...r }; });
    const free = existing.map(h => h.id).filter(i => !used.has(i)); let n = 1;
    out.forEach(h => { if (h.id) return; h.id = free.shift() || null; if (!h.id) { while (used.has("hall" + n)) n++; h.id = "hall" + n; } used.add(h.id); });
    return out;
}
function printReceipt(p, lib, member) {
    let el = $("#libraryosPrintMount");
    if (!el) { el = document.createElement("div"); el.id = "libraryosPrintMount"; document.body.appendChild(el); }
    el.innerHTML = `<div style="width:58mm;padding:3mm;background:#fff;color:#000;font-family:monospace;font-size:11px">
        <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:5px"><b style="font-size:13px">${escapeHTML(lib.library_name)}</b><br>${escapeHTML(lib.address || "")}</div>
        <div style="text-align:center;margin:6px 0"><div style="font-size:10px">FEE RECEIPT</div><div style="font-size:22px;font-weight:800">#${p.receipt}</div></div>
        <div>Name: ${escapeHTML(p.name)}</div>${member ? `<div>Seat: ${member.seat} (${escapeHTML(member.shift)})</div><div>Valid till: ${fmtDate(member.valid_till)}</div>` : ""}
        <div>Date: ${p.date}</div><div style="margin-top:4px;border-top:1px dashed #000;padding-top:4px"><b>Paid Rs.${p.amount}</b> (${escapeHTML(p.mode)})</div></div>`;
    window.print();
}
let _lockBound = false;
function initInactivityAutoLock(onLock) {
    if (_lockBound) return; _lockBound = true;
    let t; const reset = () => { clearTimeout(t); t = setTimeout(onLock, 15 * 60 * 1000); };
    ["click", "keydown", "mousemove", "touchstart"].forEach(ev => document.addEventListener(ev, reset, { passive: true }));
    reset();
}
