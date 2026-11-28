"use strict";
/* =============================================================================
   v8_admin.js - DigiConvo HQ Enterprise Module
   Provides Support Tickets triage, Platform Activity Audit Log (with Actor IDs),
   HQ Sales/Support Team management (Owner only), Announcements & Billing Ledger.
   ============================================================================= */
(function () {
  let TKT_STATUS = "";
  let TKT_QUERY = "";
  let TKT_RAW = [];
  let AUD_ACTOR = "";
  let AUD_ACTION = "";
  let AUD_LIMIT = 150;

  function cardHtml(inner) {
    return `<div style="background:#0b0f19;border:1px solid #24304d;border-radius:14px;padding:16px;margin-bottom:14px;">${inner}</div>`;
  }

  function renderTicketsBody(el) {
    const listWrap = document.getElementById("hqTktList");
    const cntEl = document.getElementById("hqTktCount");
    const ql = TKT_QUERY.trim().toLowerCase();
    const list = ql ? TKT_RAW.filter((t) => [t.id, t.restaurant_name, t.restaurant_slug, t.subject, t.category, t.raised_by, t.message].join(" ").toLowerCase().includes(ql)) : TKT_RAW;
    if (cntEl) cntEl.textContent = String(list.length);
    if (!listWrap) return;
    listWrap.innerHTML = list.map((t) => {
      const stCol = t.status === "resolved" || t.status === "closed" ? "#34d399" : t.status === "in_progress" ? "#38bdf8" : "#fbbf24";
      const priCol = t.priority === "urgent" ? "#f87171" : t.priority === "high" ? "#fbbf24" : "#94a3b8";
      return `<div class="hqTicketCard">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <strong>#${esc(String(t.id || "").slice(0, 8).toUpperCase())}</strong>
              <span class="badge" style="background:rgba(255,255,255,.08);color:${stCol};">${esc(String(t.status || "open").replace("_", " ").toUpperCase())}</span>
              <span class="badge" style="background:rgba(255,255,255,.06);color:${priCol};">${esc(String(t.priority || "normal").toUpperCase())}</span>
              <span class="v8Pill">${esc(t.category || "general")}</span>
            </div>
            <h4 style="margin:6px 0 4px;">${esc(t.subject)}</h4>
            <div class="muted small"><b>${esc(t.restaurant_name || "Unknown")}</b> (${esc(t.restaurant_slug || "-")}) &bull; Raised by ${esc(displayLogin(t.raised_by || ""))} &bull; ${esc(fmtDateTime(t.created_at))}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${t.restaurant_id ? `<button type="button" class="secondaryButton" style="padding:6px 10px;font-size:12px;" data-tkt-inspect="${esc(t.restaurant_id)}">Inspect Restaurant</button>` : ""}
            <button type="button" class="primaryButton" style="padding:6px 12px;font-size:12px;" data-tkt-manage="${esc(t.id)}">Respond / Update</button>
          </div>
        </div>
        <div style="margin-top:8px;font-size:13px;white-space:pre-line;background:#141b2d;padding:10px;border-radius:8px;">${esc(t.message)}</div>
        ${(t.resolution_note || t.assigned_to_name) ? `<div class="muted small" style="margin-top:6px;">Assigned: <b>${esc(displayLogin(t.assigned_to_name || ""))}</b>${t.assigned_to_id ? ` (ID: ${esc(String(t.assigned_to_id).slice(0, 8).toUpperCase())})` : ""}${t.resolution_note ? ` &bull; Note: <span style="color:#e2e8f0;">${esc(t.resolution_note)}</span>` : ""}</div>` : ""}
      </div>`;
    }).join("") || `<p class="muted">No support tickets found.</p>`;
  }

  async function renderTicketsTab() {
    const el = document.getElementById("hqTickets");
    if (!el) return;
    document.getElementById("pageTitle").textContent = "Support Tickets";
    const res = await rpc("v8_tickets", { p_action: "list", p_restaurant: null, p_payload: { status: TKT_STATUS } }).catch(() => ({ tickets: [] }));
    TKT_RAW = (res && res.tickets) || [];
    const badge = document.getElementById("hqTktBadge");
    if (badge && !TKT_STATUS) {
      const openCnt = TKT_RAW.filter((t) => t.status === "open" || t.status === "in_progress").length;
      badge.textContent = String(openCnt);
      badge.hidden = openCnt <= 0;
    }

    el.innerHTML = cardHtml(`
      <div class="sectionHeader" style="margin-bottom:12px;">
        <div>
          <h3 style="margin:0;"><i class="fa-solid fa-life-ring"></i> Restaurant Support Tickets (<span id="hqTktCount">0</span>)</h3>
          <small class="muted">Every status change and resolution reply is audited with your ID.</small>
        </div>
        <div class="headerTools">
          <select id="hqTktFilter" style="margin:0;">
            <option value="" ${TKT_STATUS === "" ? "selected" : ""}>All Tickets</option>
            <option value="open" ${TKT_STATUS === "open" ? "selected" : ""}>Open</option>
            <option value="in_progress" ${TKT_STATUS === "in_progress" ? "selected" : ""}>In Progress</option>
            <option value="resolved" ${TKT_STATUS === "resolved" ? "selected" : ""}>Resolved</option>
            <option value="closed" ${TKT_STATUS === "closed" ? "selected" : ""}>Closed</option>
          </select>
          <input id="hqTktSearch" type="search" value="${esc(TKT_QUERY)}" placeholder="Search restaurant, ticket #, subject" style="margin:0;">
          <button type="button" class="secondaryButton" id="hqTktRefreshBtn">Refresh</button>
        </div>
      </div>
      <div id="hqTktList"></div>
    `);
    renderTicketsBody(el);

    document.getElementById("hqTktFilter")?.addEventListener("change", (ev) => { TKT_STATUS = ev.target.value; renderTicketsTab(); });
    document.getElementById("hqTktSearch")?.addEventListener("input", (ev) => { TKT_QUERY = ev.target.value; renderTicketsBody(el); });
    document.getElementById("hqTktRefreshBtn")?.addEventListener("click", renderTicketsTab);
    if (!el._hqTktBound) {
      el._hqTktBound = true;
      el.addEventListener("click", async (ev) => {
        const ins = ev.target.closest("[data-tkt-inspect]");
        if (ins) { if (typeof renderDetail === "function") renderDetail(ins.dataset.tktInspect); return; }
        const b = ev.target.closest("[data-tkt-manage]");
        if (!b || el._hqTktBusy) return;
        const t = TKT_RAW.find((x) => x.id === b.dataset.tktManage);
        if (!t) return;
        el._hqTktBusy = true;
        try {
          let st = t.status, note = t.resolution_note || "";
          const choice = await Dialog.open({
            title: `Update Ticket #${String(t.ticket_no || String(t.id || "").slice(0, 8)).toUpperCase()}`,
            body: `<p class="dlgText"><b>${esc(t.restaurant_name)}</b>: ${esc(t.subject)}</p>
              <label class="dlgLabel">Ticket Status</label>
              <select id="tkUpdSt" class="dlgInput">
                <option value="open" ${t.status === "open" ? "selected" : ""}>Open</option>
                <option value="in_progress" ${t.status === "in_progress" ? "selected" : ""}>In Progress</option>
                <option value="resolved" ${t.status === "resolved" ? "selected" : ""}>Resolved</option>
                <option value="closed" ${t.status === "closed" ? "selected" : ""}>Closed</option>
              </select>
              <label class="dlgLabel" style="margin-top:10px;display:block;">Resolution Note / Reply to Restaurant Admin</label>
              <textarea id="tkUpdNote" class="dlgInput" rows="4" maxlength="1500" placeholder="Visible to restaurant admin...">${esc(note)}</textarea>`,
            buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Save Update", kind: "primaryButton" }],
            onClick(bid) {
              if (bid !== "save") return;
              st = document.getElementById("tkUpdSt").value;
              note = document.getElementById("tkUpdNote").value.trim();
            }
          });
          if (choice !== "save") return;
          await rpc("v8_tickets", { p_action: "update", p_restaurant: t.restaurant_id || null, p_payload: { id: t.id, status: st, resolution_note: note } });
          showToast("Ticket updated & audited!", "success");
          if (typeof loadAll === "function") await loadAll();
          renderTicketsTab();
        } catch (e) { showToast((e && e.message) || "Update failed.", "error"); }
        finally { el._hqTktBusy = false; }
      });
    }
  }

  async function renderAuditTab() {
    const el = document.getElementById("hqAudit");
    if (!el) return;
    document.getElementById("pageTitle").textContent = "Platform Activity Audit";
    const rows = (await rpc("owner_platform_log", { p_limit: AUD_LIMIT, p_actor: AUD_ACTOR, p_action: AUD_ACTION }).catch(() => [])) || [];

    el.innerHTML = cardHtml(`
      <div class="sectionHeader" style="margin-bottom:12px;">
        <div>
          <h3 style="margin:0;"><i class="fa-solid fa-clock-rotate-left"></i> HQ Activity Audit Log (${rows.length})</h3>
          <small class="muted">${OWN.role === "owner" ? "Complete audit trail of Owner, Sales & Support changes with Actor UUIDs." : "Audit trail of your own actions (with exact User ID)."}</small>
        </div>
        <div class="headerTools">
          <input id="hqAudActor" value="${esc(AUD_ACTOR)}" placeholder="Filter Actor ID / Email" style="margin:0;">
          <input id="hqAudAction" value="${esc(AUD_ACTION)}" placeholder="Filter Action / Details" style="margin:0;">
          <select id="hqAudLimit" style="margin:0;"><option value="100" ${AUD_LIMIT === 100 ? "selected" : ""}>100 rows</option><option value="150" ${AUD_LIMIT === 150 ? "selected" : ""}>150 rows</option><option value="400" ${AUD_LIMIT === 400 ? "selected" : ""}>400 rows</option></select>
          <button type="button" class="primaryButton" id="hqAudRunBtn">Apply</button>
          <button type="button" class="secondaryButton" id="hqAudCsvBtn">Export CSV</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="dataTable wide">
          <thead><tr><th>Time</th><th>Actor (Login ID)</th><th>Actor UUID</th><th>Role</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>${rows.map((a) => `<tr>
            <td style="white-space:nowrap;">${esc(fmtDateTime(a.created_at))}</td>
            <td><b>${esc(displayLogin(a.actor || "system"))}</b></td>
            <td><code>${a.actor_id ? esc(a.actor_id) : "-"}</code></td>
            <td><span class="v8Pill">${esc(a.role || "owner")}</span></td>
            <td><b>${esc(a.action)}</b></td>
            <td>${esc(a.details || "")}</td>
          </tr>`).join("") || `<tr><td colspan="6" class="muted">No audit events match this filter.</td></tr>`}</tbody>
        </table>
      </div>
    `);

    document.getElementById("hqAudRunBtn")?.addEventListener("click", () => {
      AUD_ACTOR = document.getElementById("hqAudActor").value.trim();
      AUD_ACTION = document.getElementById("hqAudAction").value.trim();
      AUD_LIMIT = num(document.getElementById("hqAudLimit").value, 150);
      renderAuditTab();
    });
    document.getElementById("hqAudCsvBtn")?.addEventListener("click", () => {
      if (typeof Sheets !== "undefined" && typeof Sheets.downloadCsv === "function") {
        Sheets.downloadCsv([["Time", "Actor", "Actor UUID", "Role", "Action", "Details"]].concat(rows.map((a) => [a.created_at, a.actor || "", a.actor_id || "", a.role || "", a.action || "", a.details || ""])), "hq_platform_audit_log.csv");
      }
    });
  }

  async function renderTeamTab() {
    const el = document.getElementById("hqTeam");
    if (!el || OWN.role !== "owner") return;
    document.getElementById("pageTitle").textContent = "HQ Team & Access Control";
    const res = await rpc("v8_manage_platform_team", { p_action: "list", p_payload: {} }).catch(() => ({ members: [] }));
    const members = (res && res.members) || [];

    el.innerHTML = cardHtml(`
      <div class="sectionHeader" style="margin-bottom:12px;">
        <div>
          <h3 style="margin:0;"><i class="fa-solid fa-users-gear"></i> Sales &amp; Support Team IDs (${members.length})</h3>
          <small class="muted">Create individual Sales &amp; Support IDs with scoped DB permissions. They sign in here without your Owner passkey and cannot delete restaurants, alter billing, or access HQ Team.</small>
        </div>
        <button type="button" class="primaryButton" id="hqTeamAddBtn"><i class="fa-solid fa-user-plus"></i> + New Sales / Support ID</button>
      </div>
      <div style="overflow-x:auto;">
        <table class="dataTable wide">
          <thead><tr><th>Name / Label</th><th>Login ID / Email</th><th>User UUID</th><th>Role</th><th>Status</th><th class="r">Actions</th></tr></thead>
          <tbody>${members.map((m) => `<tr>
            <td><strong>${esc(m.label || displayLogin(m.email) || "HQ Member")}</strong></td>
            <td><code>${esc(displayLogin(m.email))}</code></td>
            <td><code>${esc(String(m.user_id || "").slice(0, 13))}...</code></td>
            <td><span class="roleBadge" style="background:${m.role === "owner" ? "rgba(197,168,128,.22)" : m.role === "sales" ? "rgba(56,189,248,.18)" : "rgba(16,185,129,.18)"};color:${m.role === "owner" ? "#c5a880" : m.role === "sales" ? "#7dd3fc" : "#6ee7b7"};">${esc(String(m.role).toUpperCase())}</span></td>
            <td>${m.is_active !== false ? `<span class="badge available">Active</span>` : `<span class="badge unavailable">Disabled</span>`}</td>
            <td class="r" style="white-space:nowrap;">
              ${m.role !== "owner" ? `
                <button type="button" class="secondaryButton small" data-hq-toggle="${esc(m.user_id)}" data-hq-role="${esc(m.role)}" data-hq-active="${m.is_active !== false ? "false" : "true"}">${m.is_active !== false ? "Disable" : "Enable"}</button>
                <button type="button" class="secondaryButton small" data-hq-reset="${esc(m.email)}">Reset PW</button>
                <button type="button" class="deleteBtn small" data-hq-del="${esc(m.user_id)}" data-hq-em="${esc(m.email)}">Remove</button>
              ` : `<span class="muted small">Owner</span>`}
            </td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
    `);

    document.getElementById("hqTeamAddBtn")?.addEventListener("click", async () => {
      const pwGen = generatePassword(14);
      let created = null;
      await Dialog.open({
        title: "Create Sales or Support Account", wide: true,
        body: `<div class="formGrid">
          <div><label for="hqIdIn">Login Username ID or Email *</label><input id="hqIdIn" maxlength="80" placeholder="e.g. support_priya or sales_aman"></div>
          <div><label for="hqRoleIn">HQ Role *</label><select id="hqRoleIn"><option value="support">Support Team (Tickets, Orders View, QR)</option><option value="sales">Sales Team (14d Trials, Contact/Chain, Tickets)</option></select></div>
          <div><label for="hqLblIn">Staff Display Name / Label</label><input id="hqLblIn" maxlength="60" placeholder="e.g. Priya - Support Desk"></div>
          <div><label for="hqPwIn">Initial Password (min 12 chars)</label><input id="hqPwIn" value="${esc(pwGen)}"></div>
        </div>`,
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "create", label: "Create HQ ID", kind: "primaryButton" }],
        async onClick(bid) {
          if (bid !== "create") return;
          const raw = document.getElementById("hqIdIn").value.trim().toLowerCase();
          const email = loginToEmail(raw);
          const role = document.getElementById("hqRoleIn").value;
          const label = document.getElementById("hqLblIn").value.trim();
          const password = document.getElementById("hqPwIn").value;
          if (!raw || (raw.includes("@") ? !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) : !/^[a-z0-9._-]{3,40}$/.test(raw))) {
            return { error: "Enter a valid username (3-40 chars) or email." };
          }
          if (password.length < 12 || password.length > 72 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
            return { error: "Password must be 12-72 characters with letters and numbers." };
          }
          try {
            await callManageUser({ action: "create_platform_user", email, password, role, label });
            created = { login: raw, email, password, role };
          } catch (e) { return { error: e.message }; }
        }
      });
      if (!created) return;
      renderTeamTab();
      const txt = `DigiConvo HQ Console (${created.role.toUpperCase()})\nURL: ${location.origin + location.pathname}\nLogin ID: ${created.login}\nPassword: ${created.password}`;
      await Dialog.open({
        title: "HQ Team Account Created",
        body: `<p class="dlgText">Share these credentials once (password is not shown again):</p><textarea class="dlgInput credBox" readonly>${esc(txt)}</textarea>`,
        buttons: [{ id: "copy", label: "Copy", kind: "primaryButton" }, { id: "ok", label: "Done" }],
        async onClick(id) { if (id === "copy") { showToast((await copyText(txt)) ? "Copied" : "Copy failed", "info"); return { error: "" }; } }
      });
    });

    el.querySelectorAll("[data-hq-toggle]").forEach((b) => b.addEventListener("click", async () => {
      try {
        await rpc("v8_manage_platform_team", { p_action: "add_or_update", p_payload: { user_id: b.dataset.hqToggle, role: b.dataset.hqRole, is_active: b.dataset.hqActive === "true" } });
        showToast("Updated HQ member status!", "success");
        renderTeamTab();
      } catch (e) { showToast((e && e.message) || "Failed.", "error"); }
    }));
    el.querySelectorAll("[data-hq-reset]").forEach((b) => b.addEventListener("click", async () => {
      const em = b.dataset.hqReset;
      const pwGen = generatePassword(14);
      let donePw = "";
      await Dialog.open({
        title: `Reset HQ Password — ${displayLogin(em)}`,
        body: `<label class="dlgLabel">New Password (min 12 characters)</label><input id="hqResPw" class="dlgInput" value="${esc(pwGen)}">`,
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Reset Password", kind: "primaryButton" }],
        async onClick(bid) {
          if (bid !== "save") return;
          const pw = document.getElementById("hqResPw").value;
          if (pw.length < 12 || pw.length > 72 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return { error: "Password must be 12-72 chars with letters and numbers." };
          try { await callManageUser({ action: "reset_platform_password", email: em, password: pw }); donePw = pw; }
          catch (e) { return { error: e.message }; }
        }
      });
      if (donePw) {
        const txt = `Login ID: ${displayLogin(em)}\nNew Password: ${donePw}`;
        await Dialog.open({
          title: "Password Reset Complete",
          body: `<textarea class="dlgInput credBox" readonly>${esc(txt)}</textarea>`,
          buttons: [{ id: "copy", label: "Copy", kind: "primaryButton" }, { id: "ok", label: "Done" }],
          async onClick(id) { if (id === "copy") { showToast((await copyText(txt)) ? "Copied" : "Copy failed", "info"); return { error: "" }; } }
        });
      }
    }));
    el.querySelectorAll("[data-hq-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await Dialog.confirm(`Remove HQ access for ${displayLogin(b.dataset.hqEm)}?`, { danger: true, confirmText: "Remove" }))) return;
      try {
        await rpc("v8_manage_platform_team", { p_action: "remove", p_payload: { user_id: b.dataset.hqDel } });
        showToast("HQ access removed.", "info");
        renderTeamTab();
      } catch (e) { showToast((e && e.message) || "Failed.", "error"); }
    }));
  }

  async function renderBroadcastTab() {
    const el = document.getElementById("hqBroadcast");
    if (!el) return;
    document.getElementById("pageTitle").textContent = "Announcements & SaaS Billing";
    const res = await rpc("v8_manage_announcements", { p_action: "list", p_payload: {} }).catch(() => ({ announcements: [], payments: [] }));
    const anns = (res && res.announcements) || [];
    const pays = (res && res.payments) || [];
    const isOwn = OWN.role === "owner";

    el.innerHTML = `
      <div class="v8CrmGrid">
        ${isOwn ? cardHtml(`
          <h3 style="margin:0 0 10px;"><i class="fa-solid fa-bullhorn"></i> Publish Restaurant Dashboard Announcement</h3>
          <form id="hqAnnForm" style="display:grid;gap:8px;">
            <input id="annTitle" class="field" maxlength="120" required placeholder="Headline (e.g. Scheduled Maintenance / New GST 2.0 Export)" style="margin:0;">
            <textarea id="annMsg" class="field" rows="3" maxlength="600" required placeholder="Message shown at the top of restaurant dashboards..." style="margin:0;"></textarea>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
              <input id="annCity" class="field" maxlength="60" placeholder="Target City (blank=all)" style="margin:0;">
              <select id="annPlan" class="field" style="margin:0;"><option value="">All Plans</option><option value="starter">Starter</option><option value="growth">Growth</option><option value="chain">Chain</option></select>
              <input id="annDays" class="field" type="number" min="1" max="180" value="14" placeholder="Days" style="margin:0;">
            </div>
            <button type="submit" class="primaryButton">Publish Announcement</button>
          </form>
        `) : cardHtml(`<h3><i class="fa-solid fa-bullhorn"></i> Active SaaS Broadcasts</h3><p class="muted small">View-only for ${esc(OWN.role)}. Only Owner publishes platform announcements.</p>`)}
        ${cardHtml(`
          <h3 style="margin:0 0 10px;"><i class="fa-solid fa-list"></i> Announcements (${anns.length})</h3>
          <div style="max-height:300px;overflow-y:auto;">
            ${anns.map((a) => `<div style="padding:8px 0;border-bottom:1px solid #24304d;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <strong>${esc(a.title)}</strong>
                ${isOwn ? `<button type="button" class="deleteBtn small" data-ann-del="${esc(a.id)}">&times;</button>` : ""}
              </div>
              <div class="small" style="margin:4px 0;">${esc(a.message)}</div>
              <div class="muted small">Target: ${esc(a.target_city || "All cities")} &bull; ${esc(a.target_plan || "All plans")} &bull; Expires ${a.expires_at ? esc(fmtDateTime(a.expires_at)) : "Never"}</div>
            </div>`).join("") || `<div class="muted small">No announcements yet.</div>`}
          </div>
        `)}
      </div>
      ${isOwn ? cardHtml(`
        <h3 style="margin:0 0 10px;"><i class="fa-solid fa-indian-rupee-sign"></i> SaaS Subscription Payments Ledger (${pays.length})</h3>
        <div style="overflow-x:auto;"><table class="dataTable wide">
          <thead><tr><th>Invoice</th><th>Date</th><th>Restaurant</th><th>Plan</th><th>Days Added</th><th>Gateway / Ref</th><th class="r">Amount</th></tr></thead>
          <tbody>${pays.map((p) => `<tr><td><code>${esc(p.invoice_no)}</code></td><td>${esc(fmtDateTime(p.paid_at || p.created_at))}</td><td><b>${esc(p.restaurant_name)}</b></td><td>${esc(p.plan_tier)}</td><td>+${num(p.days_added)}d</td><td>${esc(p.gateway)}${p.gateway_payment_id ? " · " + esc(p.gateway_payment_id) : ""}</td><td class="r"><b>${esc(money(p.amount))}</b></td></tr>`).join("") || `<tr><td colspan="7" class="muted">No SaaS renewals logged yet.</td></tr>`}</tbody>
        </table></div>
      `) : ""}`;

    document.getElementById("hqAnnForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await rpc("v8_manage_announcements", {
          p_action: "save",
          p_payload: {
            title: document.getElementById("annTitle").value,
            message: document.getElementById("annMsg").value,
            target_city: document.getElementById("annCity").value,
            target_plan: document.getElementById("annPlan").value,
            expire_days: num(document.getElementById("annDays").value, 14),
            is_active: true
          }
        });
        showToast("Announcement published!", "success");
        renderBroadcastTab();
      } catch (err) { showToast((err && err.message) || "Failed.", "error"); }
    });
    el.querySelectorAll("[data-ann-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await Dialog.confirm("Delete this broadcast announcement?", { danger: true, confirmText: "Delete" }))) return;
      try { await rpc("v8_manage_announcements", { p_action: "delete", p_payload: { id: b.dataset.annDel } }); showToast("Deleted.", "info"); renderBroadcastTab(); }
      catch (err) { showToast((err && err.message) || "Failed.", "error"); }
    }));
  }

  window.V8_HQ = {
    async renderTab(tab) {
      if (tab === "hqTickets") await renderTicketsTab();
      else if (tab === "hqAudit") await renderAuditTab();
      else if (tab === "hqTeam") await renderTeamTab();
      else if (tab === "hqBroadcast") await renderBroadcastTab();
    }
  };
})();
