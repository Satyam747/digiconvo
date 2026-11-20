/* LibraryOS plans.js: plan picker with live server price, renew dialog, owner plan and pricing builder.
   Loaded by desk.html after common.js. It relies on desk.html globals (L, role, S, ms, openM, closeM, doOp, esc). */
"use strict";

let C = null;       // state of the open collect dialog
let PE = null;      // plan being edited
const planOf = id => (L.plans || []).find(p => p.id === id);
const activePlans = () => (L.plans || []).filter(p => p.active !== false);
const lines = sel => ($(sel).value || "").split("\n").map(s => s.trim()).filter(Boolean);

function planSummary(p) {
    const hrs = p.price_mode === "rate" ? `${hoursText(p.hours_min)}-${hoursText(p.hours_max)}/day` : `${hoursText(p.hours)}/day`;
    const price = p.price_mode === "rate" ? `${inr(p.rate)} per daily hour a month${+p.cap ? ` (max ${inr(p.cap)})` : ""}` : `${inr(p.monthly)}/month`;
    const seat = { reserved: "reserved seat", unreserved: "unreserved", either: "reserved or unreserved" }[p.seat] || p.seat;
    const when = p.mode === "flexible" ? "any time of day" : (p.starts && p.starts.length ? "starts " + p.starts.map(fmtMin).join(", ") : "any start time");
    return `${hrs} · ${price} · ${seat} · ${when}${p.days === "weekdays" ? " · weekdays only" : ""}`;
}

/*================ Collect dialog: admit a new student or renew a member, price comes from the server ================*/
function startOpts(pl, hours, sel) {
    const of = L.open_from ?? 360, ot = L.open_to ?? 1320, len = Math.round(hours * 60);
    let list = (pl.starts && pl.starts.length) ? pl.starts.slice() : [];
    if (!list.length) for (let m = of; m + len <= ot; m += 30) list.push(m);
    list = list.filter(s => s + len <= ot);
    const pick = list.includes(sel) ? sel : list[0];
    return list.map(s => `<option value="${s}" ${s === pick ? "selected" : ""}>${fmtMin(s)} - ${fmtMin(s + len)}</option>`).join("");
}

function openCollect(cfg) {
    const renew = cfg.mode === "renew", m = cfg.member || null, plans = activePlans(), terms = L.terms || [1, 3, 6];
    if (!renew && !plans.length) return toast("Add a plan first (Plans tab).");
    if (renew && !planOf(m.plan_id)) return toast("This member's plan no longer exists. Turn the plan on again in the Plans tab.");
    C = { mode: cfg.mode, m, n: 0, seatTouched: !!cfg.seat, seat: cfg.seat || "", start: cfg.startMin, hall: cfg.hall, t: null, q: null };
    openM(`<h3>${renew ? "Renew · " + esc(m.name) : "Admit a student"}</h3><div class="grid">
        ${renew ? `<div class="muted">${esc(m.plan_name || "")} · ${esc(slotText(m))} · ${m.seat ? "seat " + m.seat : "unreserved"}</div>` :
        `<input id="c-name" class="inp" placeholder="Student name"><input id="c-ph" class="inp" inputmode="tel" maxlength="10" placeholder="10-digit mobile"><input id="c-ex" class="inp" placeholder="Preparing for (e.g. MPPSC)">
         <select id="c-plan" class="inp">${plans.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select><div id="c-psum" class="muted"></div>`}
        <div id="c-dyn" class="grid"></div>
        <select id="c-term" class="inp">${terms.map(t => `<option value="${t}" ${t === (renew ? (+m.term || 1) : 1) ? "selected" : ""}>${t} month${t > 1 ? "s" : ""}${L.term_discounts && +L.term_discounts[t] ? ` (${L.term_discounts[t]}% off)` : ""}</option>`).join("")}</select>
        ${(L.addons || []).length ? `<div class="row">${L.addons.map(a => `<label class="pill"><input type="checkbox" data-addon="${esc(a.id)}" ${renew && (m.addons || []).includes(a.id) ? "checked" : ""}> ${esc(a.name)}</label>`).join("")}</div>` : ""}
        <div class="row"><input id="c-disc" class="inp" style="flex:1" inputmode="numeric" placeholder="Discount ₹ (optional)"><input id="c-reason" class="inp" style="flex:2" placeholder="Reason for the discount"></div>
        <select id="c-pm" class="inp"><option>Cash</option><option>UPI</option></select>
        <div id="c-quote" class="card" style="margin:0"><div class="sk"></div></div>
        <button id="c-go" class="btn" data-act="collect-go" disabled>Collect</button></div>`);
    $("#sheet").onchange = e => { if (!C || !$("#c-quote")) return; if (["c-plan", "c-hours", "c-stype", "c-hall"].includes(e.target.id)) cDyn(); cQuoteSoon(); };
    $("#sheet").oninput = e => { if (!C || !$("#c-quote")) return; if (e.target.id === "c-sn") C.seatTouched = true; cQuoteSoon(); };
    cDyn(); cQuoteSoon();
}

function cPlan() { return C.mode === "renew" ? planOf(C.m.plan_id) : planOf($("#c-plan").value); }

function cDyn() {
    const renew = C.mode === "renew", pl = cPlan(); if (!pl) return;
    if (renew) { $("#c-dyn").innerHTML = ""; return; }
    const prevHours = $("#c-hours") ? +$("#c-hours").value : (C.hours || null), prevStart = $("#c-start") ? +$("#c-start").value : C.start;
    const prevType = $("#c-stype") ? $("#c-stype").value : "reserved", prevHall = $("#c-hall") ? $("#c-hall").value : (C.hall || S.hall);
    let h = `<select id="c-hall" class="inp">${L.halls.map(x => `<option value="${esc(x.id)}" ${x.id === prevHall ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>`;
    let hours = +pl.hours;
    if (pl.price_mode === "rate") {
        const lo = +pl.hours_min, hi = +pl.hours_max; hours = prevHours && prevHours >= lo && prevHours <= hi ? prevHours : Math.min(Math.max(5, lo), hi);
        let o = ""; for (let x = lo; x <= hi; x += 0.5) o += `<option value="${x}" ${x === hours ? "selected" : ""}>${hoursText(x)} per day</option>`;
        h += `<select id="c-hours" class="inp">${o}</select>`;
    } else h += `<div class="muted">${hoursText(hours)} per day</div>`;
    if (pl.mode !== "flexible") h += `<select id="c-start" class="inp">${startOpts(pl, hours, prevStart)}</select>`;
    else h += `<div class="muted">Any time between ${fmtMin(L.open_from ?? 360)} and ${fmtMin(L.open_to ?? 1320)}</div>`;
    if (pl.seat === "either") h += `<select id="c-stype" class="inp"><option value="reserved" ${prevType === "reserved" ? "selected" : ""}>Reserved seat</option><option value="unreserved" ${prevType === "unreserved" ? "selected" : ""}>Unreserved seat</option></select>`;
    const reserved = pl.seat === "reserved" || (pl.seat === "either" && prevType === "reserved");
    if (reserved) h += `<input id="c-sn" class="inp" inputmode="numeric" placeholder="Seat number (suggested automatically)" value="${esc(C.seatTouched ? ($("#c-sn") ? $("#c-sn").value : C.seat) : "")}">`;
    $("#c-dyn").innerHTML = h; $("#c-psum").textContent = planSummary(pl); C.hours = hours;
}

function cRead() {
    const renew = C.mode === "renew", m = C.m, pl = cPlan();
    const p = { plan_id: pl.id, term: +$("#c-term").value, addons: $$("[data-addon]:checked").map(x => x.dataset.addon), discount: +($("#c-disc").value || 0), discount_reason: $("#c-reason").value.trim() };
    if (renew) { p.hours = m.hours; p.start_min = m.slot_from; p.seat_type = m.seat_type; p.hall = m.hall; p.new_member = false; p.except_id = m.id; }
    else {
        p.hall = $("#c-hall").value;
        if (pl.price_mode === "rate") p.hours = +$("#c-hours").value;
        if (pl.mode !== "flexible") p.start_min = +$("#c-start").value;
        if (pl.seat === "either") p.seat_type = $("#c-stype").value;
    }
    return p;
}

function cQuoteSoon() { if (!C) return; clearTimeout(C.t); C.t = setTimeout(cQuote, 250); }

async function cQuote() {
    if (!C || !$("#c-quote")) return;
    const n = ++C.n, renew = C.mode === "renew", p = cRead();
    const r = await api("staffQuote", { role, payload: p });
    if (!C || n !== C.n || !$("#c-quote")) return;          // a newer request replaced this one
    C.q = r.success ? r : null;
    if (!r.success) { $("#c-quote").innerHTML = `<span class="pill bad">${esc(r.message)}</span>`; $("#c-go").disabled = true; $("#c-go").textContent = "Collect"; return; }
    $("#c-quote").innerHTML = r.lines.map(l => `<div class="row sp"><span class="muted">${esc(l.label)}</span><span>${l.amount < 0 ? "-" : ""}${inr(Math.abs(l.amount))}</span></div>`).join("")
        + `<div class="row sp" style="margin-top:8px;border-top:1px solid var(--border-col);padding-top:8px"><b>Total</b><span class="stat" style="font-size:24px">${inr(r.total)}</span></div>`
        + `<div class="muted" style="margin-top:4px">${esc(slotText(r))} · valid till ${fmtDate(r.valid_till)}</div>`
        + (r.available ? `<span class="pill ok">Available</span>` : `<span class="pill bad">${esc(r.availability_message || "Not available")}</span>`);
    if (!renew && r.seat_type === "reserved" && $("#c-sn") && !C.seatTouched) $("#c-sn").value = r.suggested_seat || "";
    $("#c-go").disabled = !r.available;
    $("#c-go").textContent = `Collect ${inr(r.total)} and ${renew ? "renew" : "admit"}`;
}

async function cGo() {
    if (!C || !C.q) return;
    const p = cRead(), pm = $("#c-pm").value;
    if (pm === "UPI" && C.q.total > 0 && !confirm("Confirm: this UPI payment is visible in your payment app?")) return;
    let ok;
    if (C.mode === "renew") ok = await doOp("renew", { id: C.m.id, term: p.term, addons: p.addons, discount: p.discount, discount_reason: p.discount_reason, pay_mode: pm, payment_confirmed: pm === "UPI" });
    else {
        const sn = $("#c-sn") ? parseInt($("#c-sn").value, 10) : NaN;
        ok = await doOp("admit", { ...p, name: $("#c-name").value.trim(), phone: $("#c-ph").value.replace(/\D/g, ""), exam: $("#c-ex").value.trim(), seat: Number.isNaN(sn) ? undefined : sn, pay_mode: pm, payment_confirmed: pm === "UPI" });
    }
    if (ok) { const renew = C.mode === "renew"; C = null; closeM(); toast(renew ? "Renewed" : "Student admitted"); }
}

/*================ Plans tab (owner) ================*/
function vPlans() {
    if (role !== "owner") return `<p class="muted">Only the owner can change plans and prices.</p>`;
    const cards = (L.plans || []).map(p => `<div class="card row sp" style="${p.active === false ? "opacity:.55" : ""}"><div><b>${esc(p.name)}</b> ${p.active === false ? '<span class="pill bad">off</span>' : ""}<div class="muted">${esc(planSummary(p))}</div></div>
        <div class="row"><button class="btn alt" data-act="pedit" data-id="${esc(p.id)}">Edit</button><button class="btn alt" data-act="ptoggle" data-id="${esc(p.id)}">${p.active === false ? "Turn on" : "Turn off"}</button></div></div>`).join("");
    const terms = L.terms || [1, 3, 6], td = L.term_discounts || {};
    const add = (L.addons || []).map(a => `${a.id} | ${a.name} | ${a.monthly || 0} | ${a.once || 0}`).join("\n");
    const sur = (L.surcharges || []).map(x => `${x.label} | ${x.from} | ${x.to} | ${x.pct}`).join("\n");
    return `<div class="row sp"><h3 style="margin:0">Plans</h3><button class="btn" data-act="pnew">+ Add plan</button></div>
        <p class="muted">Students pick a plan, hours and start time; the price is worked out automatically. A plan used by members can be turned off but not deleted.</p>${cards}
        <div class="card grid"><b>Opening hours and rules</b>
        <div class="row"><label class="muted" style="flex:1">Opens<select id="cfg-of" class="inp">${minOpts(0, 1410, L.open_from ?? 360)}</select></label><label class="muted" style="flex:1">Closes<select id="cfg-ot" class="inp">${minOpts(30, 1440, L.open_to ?? 1320)}</select></label></div>
        <label class="muted">Flexible-hours capacity (% of seat-hours that may be sold)<input id="cfg-ob" class="inp" inputmode="numeric" value="${L.overbook_pct ?? 100}"></label>
        <b>Terms offered (months) and discount %</b>
        <div class="row">${[1, 2, 3, 4, 6, 12].map(t => `<label class="pill"><input type="checkbox" data-term="${t}" ${terms.includes(t) ? "checked" : ""}> ${t}</label><input id="cfg-td-${t}" class="inp" style="width:64px" inputmode="numeric" placeholder="%" value="${td[t] || ""}">`).join("")}</div>
        <label class="muted">One-time registration fee ₹<input id="cfg-reg" class="inp" inputmode="numeric" value="${L.registration_fee || 0}"></label>
        <label class="muted">Add-ons, one per line: id | name | monthly ₹ | one-time ₹ (example: locker | Locker | 100 | 0)<textarea id="cfg-add" class="inp" rows="3">${esc(add)}</textarea></label>
        <label class="muted">Season surcharges, one per line: label | from | to | % (example: Summer rush | 2027-03-01 | 2027-06-30 | 10)<textarea id="cfg-sur" class="inp" rows="3">${esc(sur)}</textarea></label>
        <button class="btn" data-act="cfgsave">Save rules</button></div>`;
}

function openPlan(id) {
    const p = id ? { ...planOf(id) } : { id: null, name: "", active: true, mode: "fixed", price_mode: "table", hours: 5, monthly: 500, hours_min: 2, hours_max: 12, rate: 100, cap: 0, seat: "unreserved", reserved_extra: 0, days: "all", starts: [] };
    PE = p; const tp = Object.entries(p.term_prices || {}).map(([k, v]) => `${k}=${v}`).join(", ");
    openM(`<h3>${id ? "Edit plan" : "New plan"}</h3><div class="grid">
        <input id="pe-name" class="inp" placeholder="Plan name (e.g. 5 hours reserved)" value="${esc(p.name)}">
        <label class="muted"><input id="pe-active" type="checkbox" ${p.active !== false ? "checked" : ""}> Plan is on (students can choose it)</label>
        <select id="pe-mode" class="inp"><option value="fixed" ${p.mode === "fixed" ? "selected" : ""}>Fixed time slot (student picks a start time)</option><option value="flexible" ${p.mode === "flexible" ? "selected" : ""}>Flexible: any time, up to N hours a day</option></select>
        <select id="pe-pm" class="inp"><option value="table" ${p.price_mode === "table" ? "selected" : ""}>Fixed monthly price</option><option value="rate" ${p.price_mode === "rate" ? "selected" : ""}>Price by hours: student chooses the hours</option></select>
        <div id="pe-t" class="grid"><label class="muted">Hours per day<input id="pe-hours" class="inp" inputmode="decimal" value="${p.hours ?? 5}"></label><label class="muted">Monthly price ₹<input id="pe-monthly" class="inp" inputmode="numeric" value="${p.monthly ?? 0}"></label></div>
        <div id="pe-r" class="grid"><div class="row"><label class="muted" style="flex:1">Min hours<input id="pe-hmin" class="inp" inputmode="decimal" value="${p.hours_min ?? 2}"></label><label class="muted" style="flex:1">Max hours<input id="pe-hmax" class="inp" inputmode="decimal" value="${p.hours_max ?? 12}"></label></div>
        <div class="row"><label class="muted" style="flex:1">₹ per daily hour, per month<input id="pe-rate" class="inp" inputmode="numeric" value="${p.rate ?? 0}"></label><label class="muted" style="flex:1">Monthly cap ₹ (0 = none)<input id="pe-cap" class="inp" inputmode="numeric" value="${p.cap ?? 0}"></label></div></div>
        <select id="pe-seat" class="inp"><option value="reserved" ${p.seat === "reserved" ? "selected" : ""}>Reserved seat (blocked for the student)</option><option value="unreserved" ${p.seat === "unreserved" ? "selected" : ""}>Unreserved (any free seat)</option><option value="either" ${p.seat === "either" ? "selected" : ""}>Student chooses reserved or unreserved</option></select>
        <label class="muted">Extra ₹ per month when the student reserves a seat (only for "chooses")<input id="pe-rx" class="inp" inputmode="numeric" value="${p.reserved_extra || 0}"></label>
        <label class="muted">Allowed start times, comma separated (empty = any), e.g. 6am, 2pm<input id="pe-starts" class="inp" value="${esc((p.starts || []).map(fmtMin).join(", "))}"></label>
        <label class="muted">Special term prices, optional, e.g. 3=1500, 6=2800<input id="pe-tp" class="inp" value="${esc(tp)}"></label>
        <select id="pe-days" class="inp"><option value="all" ${p.days !== "weekdays" ? "selected" : ""}>Every day</option><option value="weekdays" ${p.days === "weekdays" ? "selected" : ""}>Weekdays only</option></select>
        <button class="btn" data-act="psave">Save plan</button></div>`);
    $("#sheet").onchange = null; $("#sheet").oninput = null;
    const sync = () => { const fl = $("#pe-mode").value === "flexible"; if (fl) $("#pe-pm").value = "table"; $("#pe-pm").disabled = fl; $("#pe-t").hidden = $("#pe-pm").value === "rate"; $("#pe-r").hidden = $("#pe-pm").value !== "rate"; $("#pe-starts").parentElement.hidden = fl; };
    $("#pe-mode").onchange = sync; $("#pe-pm").onchange = sync; sync();
}

async function planSave() {
    const name = $("#pe-name").value.trim(); if (!name) return toast("Give the plan a name.");
    const fl = $("#pe-mode").value === "flexible", pm = fl ? "table" : $("#pe-pm").value;
    const starts = ($("#pe-starts").value || "").split(",").map(s => s.trim()).filter(Boolean).map(parseTime);
    if (starts.some(x => x === null)) return toast("Start times must look like 6am or 14:30.");
    const tp = {}; for (const part of ($("#pe-tp").value || "").split(",").map(s => s.trim()).filter(Boolean)) { const [k, v] = part.split("="); if (!+k || isNaN(+v)) return toast("Term prices must look like 3=1500, 6=2800."); tp[+k] = +v; }
    const p = { id: PE.id || ("p_" + (name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 18) || "plan") + "_" + Math.floor(Math.random() * 900 + 100)),
        name, active: $("#pe-active").checked, mode: fl ? "flexible" : "fixed", price_mode: pm, seat: $("#pe-seat").value, days: $("#pe-days").value, reserved_extra: +($("#pe-rx").value || 0) };
    if (pm === "rate") { p.hours_min = +$("#pe-hmin").value; p.hours_max = +$("#pe-hmax").value; p.rate = +$("#pe-rate").value; p.cap = +($("#pe-cap").value || 0); }
    else { p.hours = +$("#pe-hours").value; p.monthly = +$("#pe-monthly").value; if (Object.keys(tp).length) p.term_prices = tp; }
    if (!fl && starts.length) p.starts = starts;
    const plans = (L.plans || []).some(x => x.id === p.id) ? L.plans.map(x => x.id === p.id ? p : x) : [...(L.plans || []), p];
    if (await doOp("savePlans", { plans })) { closeM(); toast("Plan saved"); }
}

async function cfgSave() {
    const terms = $$("[data-term]:checked").map(x => +x.dataset.term), td = {};
    terms.forEach(t => { const v = +($("#cfg-td-" + t).value || 0); if (v) td[t] = v; });
    const addons = lines("#cfg-add").map(l => { const [id, name, monthly, once] = l.split("|").map(s => s.trim()); return { id, name, monthly: +monthly || 0, once: +once || 0 }; });
    const surcharges = lines("#cfg-sur").map(l => { const [label, from, to, pct] = l.split("|").map(s => s.trim()); return { label, from, to, pct: +pct || 0 }; });
    if (await doOp("savePlans", { open_from: +$("#cfg-of").value, open_to: +$("#cfg-ot").value, overbook_pct: +$("#cfg-ob").value, terms, term_discounts: td, registration_fee: +($("#cfg-reg").value || 0), addons, surcharges })) toast("Rules saved");
}

/* Called from desk.html's click handler; returns true when it handled the action. */
async function plansAct(a, el) {
    const id = el.dataset.id;
    if (a === "admitopen") { openCollect({ mode: "admit", hall: S.hall, seat: +id, startMin: S.time }); return true; }
    if (a === "renewopen") { openCollect({ mode: "renew", member: ms().find(x => x.id === id) }); return true; }
    if (a === "collect-go") { await cGo(); return true; }
    if (a === "pnew") { openPlan(null); return true; }
    if (a === "pedit") { openPlan(id); return true; }
    if (a === "psave") { await planSave(); return true; }
    if (a === "cfgsave") { await cfgSave(); return true; }
    if (a === "ptoggle") { await doOp("savePlans", { plans: L.plans.map(x => x.id === id ? { ...x, active: x.active === false } : x) }); return true; }
    return false;
}
