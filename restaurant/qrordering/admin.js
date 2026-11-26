"use strict";
/* =============================================================================
   owner.js - DigiConvo OWNER console: onboard and manage restaurants.
   * Sign-in is checked by Supabase Auth (password stored hashed in the database, never in code).
   * Two-step verification is mandatory, and the database itself refuses owner actions without it.
   * The owner sees restaurant set-up and usage counts only. Orders and guest data are not readable here.
   ============================================================================= */
const OWN = { list: [], query: "", status: "", city: "", current: "", expiring: false };

const statusKey = (r) => (r.status === "suspended" ? "suspended" : (!r.active ? "expired" : "active"));
function statusBadge(r) {
  const k = statusKey(r);
  return `<span class="badge ${k === "active" ? "available" : "unavailable"}">${k === "active" ? "Active" : k === "suspended" ? "Suspended" : "Expired"}</span>`;
}
const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
const pageUrl = (page, params) => { const u = new URL(page, location.href); u.search = ""; Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v)); return u.href; };
const dashboardLink = (slug) => pageUrl("dashboard.html", { restaurant: slug });
const assistDashboardLink = (slug) => pageUrl("dashboard.html", { restaurant: slug, assist: "1" });
const customerLink = (slug, table, token) => pageUrl("index.html", token ? { restaurant: slug, table, k: token } : { restaurant: slug, table });

async function run(fn, opts) {
  opts = opts || {};
  if (opts.loader) showLoader(opts.loader);
  try { await fn(); return true; }
  catch (e) {
    if (e.code === "42501" || e.code === "PGRST301") { if (!OWN.expiring) { OWN.expiring = true; showToast("Session ended. Please sign in again.", "error", 3000); setTimeout(() => LoginUI.signOut(), 1500); } }
    else showToast(e.message || "Something went wrong.", "error", 4500);
    return false;
  } finally { if (opts.loader) hideLoader(); }
}

/* ------------------------------------------------------------------ data ---- */
async function loadAll() {
  const data = await rpc("owner_list_restaurants");
  OWN.list = Array.isArray(data) ? data : [];
}

/* ---------------------------------------------------------------- list view ---- */
function renderList() {
  const L = OWN.list;
  const stat = (v, label) => `<div class="statCard"><div><h3>${esc(v)}</h3><p>${esc(label)}</p></div></div>`;
  const active = L.filter((r) => statusKey(r) === "active").length;
  const cities = Array.from(new Set(L.map((r) => (r.city || "Indore").trim()).filter(Boolean))).sort();
  const term = OWN.query.trim().toLowerCase();
  const shown = L.filter((r) => (!term || [r.name, r.slug, r.city, r.state, r.contact_name, r.contact_email, r.contact_phone].join(" ").toLowerCase().includes(term)) && (!OWN.status || statusKey(r) === OWN.status) && (!OWN.city || (r.city || "Indore") === OWN.city));
  $("#list").innerHTML = `<div class="sectionHeader"><h2>Restaurants</h2><div class="headerTools">
      <input data-input="search" placeholder="Search name, city, slug, contact" value="${esc(OWN.query)}" maxlength="60">
      <select data-change="city"><option value="">All cities (${cities.length})</option>${cities.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>
      <select data-change="status"><option value="">All status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="expired">Expired</option></select>
      <button class="primaryButton" type="button" data-action="add"><i class="fa-solid fa-plus"></i> Add restaurant</button></div></div>
    <div class="statsGrid">${stat(`${active} / ${L.length}`, "Active restaurants")}${stat(cities.length, "Active cities")}${stat(L.reduce((s, r) => s + num(r.orders_today), 0), "Orders today (all)")}${stat(L.reduce((s, r) => s + num(r.orders_7d), 0), "Orders kept (7 days)")}</div>
    <div class="restGrid">${shown.map((r) => `<div class="restCard">
      <div class="restHead"><div><h3>${esc(r.name)}</h3><code>${esc(r.city || "Indore")} &middot; ${esc(r.slug)}</code></div>${statusBadge(r)}</div>
      <div class="restStats"><div><b>${esc(r.orders_today)}</b><span>today</span></div><div><b>${esc(r.orders_7d)}</b><span>7 days</span></div><div><b>${esc(r.tables)}</b><span>tables</span></div><div><b>${esc(r.menu_items)}</b><span>menu</span></div></div>
      <p class="muted small">Last order: ${r.last_order_at ? esc(timeAgo(r.last_order_at)) : "never"} &middot; Valid until: ${r.valid_until ? esc(r.valid_until) : "no limit"}</p>
      <p class="muted small">Logins: ${r.team.length ? r.team.map((t) => esc(t.email)).join(", ") : "none yet"}</p>
      <div class="restActions"><button class="primaryButton" type="button" data-action="manage" data-id="${esc(r.id)}">Manage</button><button class="secondaryButton" type="button" data-action="open-dash" data-slug="${esc(r.slug)}"><i class="fa-solid fa-headset"></i> Assist</button></div></div>`).join("") || '<p class="muted">No restaurants found. Press <b>Add restaurant</b> to onboard the first one.</p>'}</div>`;
  $("#pageTitle").textContent = "Restaurants";
  $("#list").classList.add("active"); $("#detail").classList.remove("active");
  OWN.current = "";
  const sel = $('select[data-change="status"]'); if (sel) sel.value = OWN.status;
  const csel = $('select[data-change="city"]'); if (csel) csel.value = OWN.city;
}

/* ------------------------------------------------------------- onboarding ---- */
const TZ_LIST = ["Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "Australia/Sydney", "UTC"];
async function addRestaurant() {
  let created = null;
  await Dialog.open({
    title: "Add restaurant", wide: true,
    body: `<div class="formGrid">
      <div><label for="aName">Restaurant name *</label><input id="aName" maxlength="80" autocomplete="off"></div>
      <div><label for="aSlug">Web address (e.g. ind-velvetlounge) *</label><input id="aSlug" maxlength="40" autocomplete="off"></div>
      <div><label for="aCity">City *</label><input id="aCity" maxlength="60" value="Indore" autocomplete="off"></div>
      <div><label for="aState">State</label><input id="aState" maxlength="60" value="Madhya Pradesh" autocomplete="off"></div>
      <div><label for="aTables">Number of tables</label><input id="aTables" type="number" min="1" max="200" value="10"></div>
      <div><label for="aGst">GST %</label><input id="aGst" type="number" min="0" max="100" step="0.01" value="5"></div>
      <div><label for="aTz">Timezone</label><input id="aTz" list="tzl" value="Asia/Kolkata"><datalist id="tzl">${TZ_LIST.map((t) => `<option value="${t}">`).join("")}</datalist></div>
      <div><label for="aValid">Valid until (optional)</label><input id="aValid" type="date"></div>
      <div><label for="aCName">Owner / contact name</label><input id="aCName" maxlength="80"></div>
      <div><label for="aCPhone">Contact phone</label><input id="aCPhone" maxlength="20"></div>
      <div class="fullWidth"><label for="aAddress">Address</label><input id="aAddress" maxlength="300"></div>
      <div class="fullWidth"><label for="aNotes">Notes (only you can see this)</label><input id="aNotes" maxlength="500"></div>
      <div><label for="aEmail">Manager username or email (optional)</label><input id="aEmail" type="text" autocomplete="off" placeholder="e.g. velvet_owner"></div>
      <div><label for="aPw">Manager password (min 12)</label><input id="aPw" autocomplete="off"></div></div>
      <p class="dlgText small">The preview address will be: <b id="aPreview"></b></p>`,
    buttons: [{ id: "cancel", label: "Cancel" }, { id: "create", label: "Create restaurant", kind: "primaryButton" }],
    onOpen() {
      let touched = false;
      const upd = () => { $("#aPreview").textContent = dashboardLink($("#aSlug").value || "your-restaurant"); };
      $("#aPw").value = generatePassword(14);
      const autoSlug = () => { if (!touched) { const cp = slugify($("#aCity").value).slice(0, 3); const np = slugify($("#aName").value); $("#aSlug").value = cp && np ? slugify(cp + "-" + np) : np; } upd(); };
      $("#aName").addEventListener("input", autoSlug); $("#aCity").addEventListener("input", autoSlug);
      $("#aSlug").addEventListener("input", () => { touched = true; upd(); });
      upd();
    },
    async onClick(btn) {
      if (btn !== "create") return;
      const v = (id) => $(id).value.trim();
      const rawLogin = v("#aEmail").toLowerCase(), email = rawLogin ? loginToEmail(rawLogin) : "", pw = $("#aPw").value;
      if (!v("#aName")) return { error: "Restaurant name is required." };
      if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(v("#aSlug"))) return { error: "Web address: 3-40 characters, lowercase letters, numbers and hyphens." };
      if (rawLogin && (rawLogin.includes("@") ? !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) : !/^[a-z0-9._-]{3,40}$/.test(rawLogin))) {
        return { error: rawLogin.includes("@") ? "Enter a valid manager email address." : "Username must be 3-40 lowercase letters, numbers, dot, underscore or hyphen." };
      }
      if (email && (pw.length < 12 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw))) return { error: "Password: at least 12 characters with letters and numbers." };
      let rest;
      try {
        rest = await rpc("owner_create_restaurant", { p_data: {
          name: v("#aName"), slug: v("#aSlug"), city: v("#aCity") || "Indore", state: v("#aState") || "Madhya Pradesh", tables: v("#aTables"), gst: v("#aGst"), timezone: v("#aTz"), valid_until: v("#aValid"),
          contact_name: v("#aCName"), contact_phone: v("#aCPhone"), address: v("#aAddress"), notes: v("#aNotes"), contact_email: email } });
      } catch (e) { return { error: e.message }; }
      let loginError = "";
      if (email) {
        try { await callManageUser({ action: "create_user", restaurant_id: rest.id, email, password: pw, role: "admin" }); }
        catch (e) { loginError = e.message; }
      }
      created = { rest, email, password: pw, loginError };
    }
  });
  if (!created) return;
  await run(loadAll);
  renderList();
  await showOnboarded(created);
}
async function showOnboarded(c) {
  const slug = c.rest.slug;
  const msg = c.email && !c.loginError
    ? `Welcome to DigiConvo QR Ordering!\nRestaurant: ${c.rest.name}\nDashboard: ${dashboardLink(slug)}\nUsername / Email: ${displayLogin(c.email)}\nPassword: ${c.password}\n\nPlease sign in, add your menu, then print the QR codes for your tables.`
    : `Restaurant: ${c.rest.name}\nDashboard: ${dashboardLink(slug)}`;
  await Dialog.open({
    title: c.rest.name + " is ready", wide: true,
    body: `${c.loginError ? `<p class="formMsg">The restaurant was created, but the manager login was not: ${esc(c.loginError)} You can add the login from the restaurant's page.</p>` : ""}
      <p class="dlgText">Share this with the restaurant (the password is shown only now):</p><textarea class="dlgInput credBox" readonly>${esc(msg)}</textarea>
      <p class="dlgText small">Next: the manager signs in, adds the menu (or imports a CSV) and prints the QR codes. You can also print the QR codes for them from the restaurant's page.</p>`,
    buttons: [{ id: "copy", label: "Copy message", kind: "primaryButton" }, { id: "qr", label: "Print QR codes" }, { id: "close", label: "Done" }],
    async onClick(id) {
      if (id === "copy") { showToast((await copyText(msg)) ? "Copied" : "Could not copy", "info"); return { error: "" }; }
      if (id === "qr") { await printQr(c.rest.id); return { error: "" }; }
    }
  });
}

/* -------------------------------------------------------------- detail view ---- */
function renderDetail(id) {
  const r = OWN.list.find((x) => x.id === id);
  if (!r) { renderList(); return; }
  OWN.current = id;
  $("#pageTitle").textContent = r.name;
  $("#list").classList.remove("active"); $("#detail").classList.add("active");
  const f = (idn, label, val, attrs) => `<label for="${idn}">${label}</label><input id="${idn}" value="${esc(val)}" ${attrs || ""}>`;
  $("#detail").innerHTML = `<div class="sectionHeader"><button class="secondaryButton" type="button" data-action="back">&larr; All restaurants</button><h2>${esc(r.name)} ${statusBadge(r)}</h2></div>
    <div class="settingsGrid">
      <div class="settingCard"><h3>Account</h3>${f("dName", "Restaurant name", r.name, 'maxlength="80"')}${f("dCity", "City", r.city || "Indore", 'maxlength="60"')}${f("dState", "State", r.state || "Madhya Pradesh", 'maxlength="60"')}
        <label for="dStatus">Status</label><select id="dStatus"><option value="active">Active</option><option value="suspended">Suspended (guests and staff are locked out)</option></select>
        ${f("dValid", "Valid until (empty = no limit)", r.valid_until || "", 'type="date"')}${f("dCName", "Contact name", r.contact_name, 'maxlength="80"')}${f("dCPhone", "Contact phone", r.contact_phone, 'maxlength="20"')}${f("dCEmail", "Contact email", r.contact_email, 'maxlength="120"')}
        <label for="dNotes">Notes (private)</label><textarea id="dNotes" maxlength="500"></textarea>
        <div class="btnStack"><button class="primaryButton" type="button" data-action="save-rest">Save changes</button></div></div>
      <div class="settingCard"><h3>Logins</h3>
        <table class="dataTable">${r.team.map((t) => `<tr><td>${esc(t.email)}<div class="muted small">${esc(t.role)} &middot; ${t.last_sign_in_at ? "last sign-in " + esc(fmtDateTime(t.last_sign_in_at)) : "never signed in"}</div></td>
          <td class="r"><button class="secondaryButton small" type="button" data-action="reset-pw" data-email="${esc(t.email)}">Reset password</button> <button class="deleteBtn small" type="button" data-action="remove-login" data-id="${esc(t.user_id)}" data-email="${esc(t.email)}">Remove</button></td></tr>`).join("") || '<tr><td class="muted">No logins yet.</td></tr>'}</table>
        <div class="btnStack"><button class="primaryButton" type="button" data-action="add-login"><i class="fa-solid fa-user-plus"></i> Add login</button></div></div>
      <div class="settingCard"><h3>Links &amp; QR codes</h3><label>Staff dashboard link</label>
        <div class="linkRow"><input readonly value="${esc(dashboardLink(r.slug))}"><button class="secondaryButton" type="button" data-action="copy-link" data-link="${esc(dashboardLink(r.slug))}">Copy</button></div>
        <p class="dlgText small">${esc(r.tables)} tables &middot; ${esc(r.menu_items)} menu items &middot; ${esc(r.orders_today)} orders today.</p>
        <div class="btnStack"><button class="primaryButton" type="button" data-action="print-qr" data-id="${esc(r.id)}"><i class="fa-solid fa-qrcode"></i> Print QR codes</button><button class="secondaryButton" type="button" data-action="links-csv" data-id="${esc(r.id)}">Download links (CSV)</button></div></div>
      <div class="settingCard"><h3>Live &amp; Recent Orders (Support)</h3>
        <div class="btnStack mb20"><button class="primaryButton" type="button" data-action="open-dash" data-slug="${esc(r.slug)}"><i class="fa-solid fa-headset"></i> Open Live Dashboard (Assist)</button>
        <button class="secondaryButton" type="button" data-action="load-orders" data-id="${esc(r.id)}">Refresh Orders</button></div>
        <div id="ownerOrdersBox"><p class="muted">Loading recent orders...</p></div></div>
      <div class="settingCard dangerZone"><h3>Danger zone</h3><p class="dlgText">Deleting a restaurant permanently removes its menu, tables, orders and settings. Logins stay in Supabase but lose access.</p>
        <div class="btnStack"><button class="dangerButton" type="button" data-action="delete-rest" data-id="${esc(r.id)}">Delete restaurant</button></div></div>
    </div>`;
  $("#dStatus").value = r.status; $("#dNotes").value = r.notes || "";
  loadRestaurantOrders(r.id);
}
async function loadRestaurantOrders(restaurantId) {
  const box = $("#ownerOrdersBox");
  if (!box) return;
  try {
    const rows = await rpc("owner_restaurant_orders", { p_restaurant: restaurantId, p_limit: 25 });
    if (!rows || !rows.length) { box.innerHTML = '<p class="muted">No orders yet.</p>'; return; }
    box.innerHTML = `<table class="dataTable"><thead><tr><th>Order</th><th>Table</th><th>Guest</th><th class="r">Total</th><th>Status</th></tr></thead><tbody>` +
      rows.map((o) => `<tr><td>${esc(o.order_no)}<div class="muted small">${esc(fmtDateTime(o.created_at))}</div></td><td>T${esc(o.table_number)}</td><td>${esc(o.customer_name)}</td><td class="r">${esc(money(o.total))}</td><td><span class="statusBadge status${esc(o.status)}">${esc(o.status)}</span></td></tr>`).join("") +
      `</tbody></table>`;
  } catch (e) {
    box.innerHTML = `<p class="errText">${esc(e.message || "Could not load orders.")}</p>`;
  }
}
async function saveRestaurant() {
  const id = OWN.current, v = (s) => $(s).value.trim();
  if (!v("#dName")) return showToast("Restaurant name is required.", "error");
  const ok = await run(async () => {
    await rpc("owner_update_restaurant", { p_id: id, p_patch: { name: v("#dName"), city: v("#dCity") || "Indore", state: v("#dState") || "Madhya Pradesh", status: $("#dStatus").value, valid_until: v("#dValid"), contact_name: v("#dCName"), contact_phone: v("#dCPhone"), contact_email: v("#dCEmail"), notes: v("#dNotes") } });
    await loadAll();
  }, { loader: "Saving..." });
  if (ok) { showToast("Saved", "success"); renderDetail(id); }
}
async function loginDialog(title, restaurantId, fixedEmail, action, withRole) {
  const pw = generatePassword(14); let done = null;
  await Dialog.open({
    title, wide: true,
    body: `<div class="formGrid"><div><label for="lEmail">Username or Email</label><input id="lEmail" type="text" autocomplete="off" placeholder="e.g. velvet_owner"${fixedEmail ? " readonly" : ""}></div>
      ${withRole ? '<div><label for="lRole">Role</label><select id="lRole"><option value="admin">Admin (manager)</option><option value="staff">Staff</option></select></div>' : ""}
      <div class="fullWidth"><label for="lPw">Password (at least 12 characters)</label><input id="lPw" autocomplete="off"></div></div>`,
    buttons: [{ id: "cancel", label: "Cancel" }, { id: "go", label: "Save", kind: "primaryButton" }],
    onOpen() { $("#lEmail").value = displayLogin(fixedEmail || ""); $("#lPw").value = pw; },
    async onClick(btn) {
      if (btn !== "go") return;
      const raw = $("#lEmail").value.trim().toLowerCase(), email = loginToEmail(raw), password = $("#lPw").value, role = withRole ? $("#lRole").value : "staff";
      if (!raw || (raw.includes("@") ? !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) : !/^[a-z0-9._-]{3,40}$/.test(raw))) {
        return { error: raw.includes("@") ? "Enter a valid email address." : "Username must be 3-40 lowercase letters, numbers, dot, underscore or hyphen." };
      }
      if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) return { error: "Password: at least 12 characters with letters and numbers." };
      try { await callManageUser({ action, restaurant_id: restaurantId, email, password, role }); }
      catch (e) { return { error: e.message }; }
      done = { email, password };
    }
  });
  return done;
}
async function showCreds(r, c) {
  const text = `${r.name} - login\nDashboard: ${dashboardLink(r.slug)}\nEmail: ${c.email}\nPassword: ${c.password}`;
  await Dialog.open({
    title: "Share these login details", wide: false,
    body: `<p class="dlgText">The password is shown only now.</p><textarea class="dlgInput credBox" readonly>${esc(text)}</textarea>`,
    buttons: [{ id: "copy", label: "Copy", kind: "primaryButton" }, { id: "done", label: "Done" }],
    async onClick(id) { if (id === "copy") { showToast((await copyText(text)) ? "Copied" : "Could not copy", "info"); return { error: "" }; } }
  });
}
async function addLogin() {
  const r = OWN.list.find((x) => x.id === OWN.current); if (!r) return;
  const c = await loginDialog("Add login", r.id, "", "create_user", true);
  if (!c) return;
  await run(loadAll); renderDetail(r.id); await showCreds(r, c);
}
async function resetPw(email) {
  const r = OWN.list.find((x) => x.id === OWN.current); if (!r) return;
  const c = await loginDialog("Reset password", r.id, email, "reset_password", false);
  if (c) await showCreds(r, c);
}
async function removeLogin(userId, email) {
  const r = OWN.list.find((x) => x.id === OWN.current); if (!r) return;
  if (!(await Dialog.confirm(`Remove ${email} from ${r.name}?`, { danger: true, confirmText: "Remove" }))) return;
  if (await run(async () => { await rpc("owner_remove_staff", { p_restaurant: r.id, p_user_id: userId }); await loadAll(); })) { showToast("Removed", "success"); renderDetail(r.id); }
}
async function deleteRestaurant(id) {
  const r = OWN.list.find((x) => x.id === id); if (!r) return;
  const typed = await Dialog.prompt({ title: "Delete " + r.name, label: `This cannot be undone. Type "${r.slug}" to confirm.`, okText: "Delete forever", danger: true, maxlength: 40 });
  if (!typed) return;
  if (await run(async () => { await rpc("owner_delete_restaurant", { p_id: id, p_confirm: typed }); await loadAll(); })) { showToast("Restaurant deleted", "success"); renderList(); }
}

/* -------------------------------------------------------------- QR & links ---- */
async function fetchLinks(id) {
  let links = null;
  const ok = await run(async () => { links = await rpc("owner_table_links", { p_restaurant: id }); }, { loader: "Preparing..." });
  return ok ? links : null;
}
async function printQr(id) {
  const r = OWN.list.find((x) => x.id === id); if (!r) return;
  const links = await fetchLinks(id);
  if (!links) return;
  const cards = links.map((l) => `<div class="card"><div class="n">${esc(r.name)}</div><div class="t">Table ${esc(l.table)}</div>${QR.svg(customerLink(r.slug, l.table, l.token), { border: 2 })}<div class="s">Scan to view the menu &amp; order</div></div>`).join("");
  printHtml(docHtml("QR codes", `@page{margin:10mm}body{font-family:system-ui,sans-serif;margin:0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}.card{border:1px solid #000;border-radius:6px;padding:6mm;text-align:center;break-inside:avoid}.n{font-weight:700;font-size:14px}.t{font-size:22px;font-weight:700;margin:4px 0}.card svg{width:100%;height:auto;display:block;margin:4px auto}.s{font-size:12px}`, `<div class="grid">${cards}</div>`));
}
async function linksCsv(id) {
  const r = OWN.list.find((x) => x.id === id); if (!r) return;
  const links = await fetchLinks(id);
  if (links) Sheets.downloadCsv([["Table", "Link"]].concat(links.map((l) => [l.table, customerLink(r.slug, l.table, l.token)])), r.slug + "_table_links.csv");
}

/* ---------------------------------------------------------------- platform ---- */
async function runPurge() {
  if (!(await Dialog.confirm("Run database housekeeping now? (In v8, orders are preserved permanently; only old logs and temporary sessions are trimmed.)", { confirmText: "Run now" }))) return;
  let res = null;
  if (await run(async () => { res = await rpc("owner_run_purge"); }, { loader: "Cleaning up..." })) {
    const ordersDeleted = num(res.orders_deleted ?? res.orders, 0);
    const logsTrimmed = num(res.logs_trimmed ?? res.activity, 0);
    const guestsTrimmed = num(res.anon_trimmed ?? res.guests, 0);
    const tail = res.retention_days > 0 ? ` older than ${esc(res.retention_days)} days.` : " (orders preserved permanently).";
    await Dialog.alert("Auto-clean finished", `<p class="dlgText">Deleted ${esc(ordersDeleted)} orders, ${esc(logsTrimmed)} log rows and ${esc(guestsTrimmed)} guest accounts${tail}</p>`);
  }
}
async function showPlatformLog() {
  let rows = null;
  if (!(await run(async () => { rows = await rpc("owner_platform_log", { p_limit: 150 }); }, { loader: "Loading..." }))) return;
  await Dialog.alert("Platform activity", rows.length ? `<table class="dataTable">${rows.map((a) => `<tr><td><b>${esc(a.action)}</b><div class="muted small">${esc(a.details)}</div></td><td class="muted small">${esc(a.actor || "system")}<br>${esc(fmtDateTime(a.created_at))}</td></tr>`).join("")}</table>` : '<p class="muted">Nothing yet.</p>');
}

/* ------------------------------------------------------------------ events ---- */
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action, id = b.dataset.id;
  switch (a) {
    case "logout": LoginUI.signOut(); break;
    case "add": addRestaurant(); break;
    case "manage": renderDetail(id); break;
    case "back": renderList(); break;
    case "open-dash": window.open(assistDashboardLink(b.dataset.slug), "_blank", "noopener"); break;
    case "load-orders": loadRestaurantOrders(id); break;
    case "save-rest": saveRestaurant(); break;
    case "add-login": addLogin(); break;
    case "reset-pw": resetPw(b.dataset.email); break;
    case "remove-login": removeLogin(id, b.dataset.email); break;
    case "delete-rest": deleteRestaurant(id); break;
    case "print-qr": printQr(id); break;
    case "links-csv": linksCsv(id); break;
    case "copy-link": copyText(b.dataset.link).then((ok) => showToast(ok ? "Copied" : "Could not copy", "info")); break;
    case "purge": runPurge(); break;
    case "platform-log": showPlatformLog(); break;
    default: break;
  }
});
document.addEventListener("input", (ev) => { if (ev.target.dataset && ev.target.dataset.input === "search") { OWN.query = ev.target.value; renderList(); const i = $('[data-input="search"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
document.addEventListener("change", (ev) => { if (!ev.target.dataset) return; if (ev.target.dataset.change === "status") { OWN.status = ev.target.value; renderList(); } if (ev.target.dataset.change === "city") { OWN.city = ev.target.value; renderList(); } });

/* -------------------------------------------------------------------- boot ---- */
function updateClock() { try { $("#liveTime").textContent = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: true }); } catch (_) { /* ignore */ } }
async function precheck() {
  if (!(await rpc("am_i_platform_admin"))) return { ok: false, message: "This account is not a DigiConvo owner account." };
  return { ok: true };
}
async function authorize() {
  if ((await rpc("is_platform_admin")) !== true) return { ok: false, message: "Two-step verification is required for the owner console." };
  return { ok: true };
}
async function unlockAdminConsole() {
  $("#loginScreen").hidden = true;
  $("#app").hidden = false;
  updateClock(); setInterval(updateClock, 1000);
  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT" && !OWN.expiring) location.reload(); });
  /* the admin console locks itself after 10 idle minutes */
  let t = null;
  const lock = () => { try { sessionStorage.setItem("dgc-locked", "1"); sessionStorage.removeItem("dgc-pk-ok"); } catch (_) { /* ignore */ } LoginUI.signOut(); };
  const reset = () => { clearTimeout(t); t = setTimeout(lock, 10 * 60000); };
  ["pointerdown", "keydown", "touchstart", "scroll"].forEach((e) => document.addEventListener(e, reset, { passive: true }));
  reset();
  await run(loadAll, { loader: "Loading restaurants..." });
  renderList();
}

async function startOwner() {
  let reqPasskey = false;
  try { reqPasskey = (await rpc("admin_passkey_required")) === true; } catch (_) { reqPasskey = false; }
  if (!reqPasskey) {
    const b = $("#passkeyBanner");
    if (b) {
      b.textContent = "Security reminder: Set your 16+ character DB-private master passkey in Supabase SQL Editor using: select private.set_admin_passkey('your-16-plus-char-secret');";
      b.hidden = false;
    }
    await unlockAdminConsole();
    return;
  }
  if (sessionStorage.getItem("dgc-pk-ok") === "1") {
    await unlockAdminConsole();
    return;
  }
  ["loginForm", "otpForm", "enrollForm"].forEach((id) => { const f = document.getElementById(id); if (f) f.hidden = true; });
  $("#passkeyForm").hidden = false;
  $("#loginScreen").hidden = false;
  $("#passkeyInput").value = "";
  $("#passkeyError").textContent = "";
  $("#passkeyInput").focus();

  $("#passkeyCancel").onclick = () => { sessionStorage.removeItem("dgc-pk-ok"); LoginUI.signOut(); };
  $("#passkeyForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const pk = $("#passkeyInput").value;
    if (pk.length < 16) { $("#passkeyError").textContent = "Master passkey must be at least 16 characters."; return; }
    const btn = $("#passkeyBtn"); btn.disabled = true; $("#passkeyError").textContent = "";
    try {
      await rpc("verify_admin_passkey", { p_passkey: pk });
      sessionStorage.setItem("dgc-pk-ok", "1");
      $("#passkeyInput").value = "";
      await unlockAdminConsole();
    } catch (e) {
      $("#passkeyError").textContent = e.message || "Invalid master passkey.";
    } finally {
      btn.disabled = false;
    }
  };
}
(async function main() {
  initClient("owner");
  if (!sb) { renderFatal("This app has not been set up yet. Set the Supabase URL and key in config.js."); return; }
  await LoginUI.init({ requireMfa: true, precheck, authorize, onReady: startOwner });
  try { if (sessionStorage.getItem("dgc-locked")) { sessionStorage.removeItem("dgc-locked"); $("#loginError").textContent = "You were signed out after a period of inactivity."; } } catch (_) { /* ignore */ }
})();
