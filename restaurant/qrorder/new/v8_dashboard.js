"use strict";
/* =============================================================================
   v8_dashboard.js - Additive v8.0 Enterprise Module for v7 Dashboard
   Preserves 100% of v7 theme, login.js (2FA+Turnstile), QR generator, Happy Hour,
   Excel import & Team management, while adding:
     * Kitchen Display System (KDS + ?kds=1) with cook timers & station filters
     * Full Indian GST / FSSAI / Composition / B2B / Split / NC Settlement & GSTR-1 Excel
     * Permanent Customer CRM, Loyalty Points & Promo Coupons
     * Waiter Call Bell Alerts & Smart Review Low-Rating Alerts
     * Multi-Outlet Chain Overview, Outlet Switcher & 1-Click Master Menu Push
   ============================================================================= */
(function () {
  let V8_META = {};
  let V8_EXTRAS = { waiter_calls: [], outlets: [], feedback: [], announcements: [] };
  let V8_INITIALIZED = false;
  let V8_EXTRAS_BUSY = false;

  function cardStyle() {
    return "background:var(--card,#151c2c);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:14px;padding:16px;margin-bottom:14px;color:var(--text,#f1f5f9);";
  }

  async function loadV8Meta() {
    if (typeof R === "undefined" || !R || !R.id) return;
    try {
      const m = await rpc("v8_get_restaurant_meta", { p_restaurant: R.id });
      if (m && m.ok) V8_META = m;
    } catch (_) {}
  }

  async function loadV8Extras() {
    if (V8_EXTRAS_BUSY || typeof R === "undefined" || !R || !R.id) return;
    V8_EXTRAS_BUSY = true;
    try {
      const ex = await rpc("v8_dashboard_extras", { p_restaurant: R.id });
      if (!ex || !ex.ok) return;
      V8_EXTRAS = ex;
      renderV8Banners();
      renderChainSwitcher();
    } catch (_) {}
    finally { V8_EXTRAS_BUSY = false; }
  }

  function renderV8Banners() {
    let host = document.getElementById("v8TopAlerts");
    if (!host) {
      const banner = document.getElementById("banner");
      if (!banner || !banner.parentElement) return;
      host = document.createElement("div");
      host.id = "v8TopAlerts";
      host.style.cssText = "padding:0 18px;";
      banner.parentElement.insertBefore(host, banner.nextSibling);
    }
    const callsHtml = (V8_EXTRAS.waiter_calls || []).map((c) => `
      <div style="background:rgba(217,119,6,.18);border:1px solid #d97706;color:#fde68a;border-radius:10px;padding:8px 12px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;font-size:13px;">
        <strong><i class="fa-solid fa-bell"></i> Table ${esc(c.table_number)} requested: ${esc(String(c.call_type || "waiter").toUpperCase())}</strong>
        <button class="primaryButton" style="padding:5px 10px;font-size:12px;" data-v8-resolve="${esc(c.id)}">Done</button>
      </div>`).join("");
    const annHtml = (V8_EXTRAS.announcements || []).map((a) => `
      <div style="background:rgba(2,132,199,.18);border:1px solid #0284c7;color:#bae6fd;border-radius:10px;padding:8px 12px;margin:8px 0;font-size:12.5px;">
        <strong>${esc(a.title)}:</strong> ${esc(a.message)}
      </div>`).join("");
    const lowStock = (V8_EXTRAS.low_stock || []);
    const lowHtml = (lowStock.length && (typeof canBill !== "function" || canBill())) ? `
      <div style="background:rgba(239,68,68,.14);border:1px solid #ef4444;color:#fecaca;border-radius:10px;padding:8px 12px;margin:8px 0;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span><i class="fa-solid fa-boxes-stacked"></i> <strong>Low Stock Alert (${lowStock.length}):</strong> ${lowStock.slice(0, 5).map((x) => `${esc(x.name)} (${num(x.current_stock)} ${esc(x.unit)})`).join(", ")}${lowStock.length > 5 ? "..." : ""}</span>
        ${typeof isAdmin === "function" && isAdmin() ? `<button type="button" class="secondaryButton" style="padding:4px 9px;font-size:11.5px;" data-v8-go="v8inv">Manage Stock</button>` : ""}
      </div>` : "";
    host.innerHTML = annHtml + callsHtml + lowHtml;
    host.querySelectorAll("[data-v8-go]").forEach((btn) => {
      btn.addEventListener("click", () => { if (typeof switchPage === "function") switchPage(btn.dataset.v8Go); });
    });
    host.querySelectorAll("[data-v8-resolve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await rpc("v8_resolve_waiter_call", { p_restaurant: R.id, p_call_id: btn.dataset.v8Resolve });
          loadV8Extras();
        } catch (e) {
          showToast((e && e.message) || "Could not resolve alert.", "error");
        }
      });
    });
  }

  function renderChainSwitcher() {
    const outlets = V8_EXTRAS.outlets || [];
    const chainNav = document.querySelector('.navItem[data-page="v8chain"]');
    if (chainNav) chainNav.hidden = outlets.length <= 1;
    let sw = document.getElementById("v8ChainSelect");
    if (outlets.length <= 1) { if (sw) sw.remove(); return; }
    if (!sw) {
      const area = document.querySelector(".ownerArea");
      if (!area) return;
      sw = document.createElement("select");
      sw.id = "v8ChainSelect";
      sw.className = "field";
      sw.style.cssText = "width:auto;padding:5px 10px;font-size:12px;margin:0;";
      sw.addEventListener("change", () => { if (sw.value) location.href = `dashboard.html?restaurant=${encodeURIComponent(sw.value)}`; });
      area.prepend(sw);
    }
    sw.innerHTML = outlets.map((o) => `<option value="${esc(o.slug)}" ${o.slug === R.slug ? "selected" : ""}>${esc(o.name)}${o.city ? " (" + esc(o.city) + ")" : ""}</option>`).join("");
  }

  // --- KDS PAGE ---
  let KDS_STATION = "All";
  async function renderKdsPage() {
    const el = document.getElementById("v8kds");
    if (!el) return;
    const orders = (await rpc("staff_orders", { p_restaurant: R.id })) || [];
    const active = orders.filter((o) => ["Pending", "Preparing", "Ready"].includes(o.status));
    const stSet = new Set(["All"]);
    active.forEach((o) => (o.cart || []).forEach((i) => {
      const st = String(i.kot_station || "Kitchen").trim() || "Kitchen";
      stSet.add(st);
    }));
    if (!stSet.has(KDS_STATION)) KDS_STATION = "All";
    const stations = Array.from(stSet);
    const filtered = active.filter((o) => KDS_STATION === "All" || (o.cart || []).some((i) => (String(i.kot_station || "Kitchen").trim() || "Kitchen") === KDS_STATION));

    el.innerHTML = `
      <div style="${cardStyle()}display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div><h3 style="margin:0;"><i class="fa-solid fa-fire-burner"></i> Live Kitchen Display (KDS)</h3>
        <small style="color:var(--muted,#94a3b8);">Amber &ge; 15 min &bull; Red &ge; 25 min &bull; Open <code>?restaurant=${esc(R.slug)}&amp;kds=1</code> on kitchen tablet</small></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <div class="v8ChipRow">
            ${stations.map((st) => `<button type="button" class="${KDS_STATION === st ? "primaryButton" : "secondaryButton"}" style="padding:5px 10px;font-size:12px;" data-kds-station="${esc(st)}">${esc(st)}</button>`).join("")}
          </div>
          <button class="secondaryButton" id="v8KdsRefresh">Refresh KDS</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;">
        ${filtered.map((o) => {
          const mins = Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000));
          const border = o.status === "Ready" ? "#10b981" : mins >= 25 ? "#ef4444" : mins >= 15 ? "#f59e0b" : "var(--accent,#c5a880)";
          const nextSt = o.status === "Pending" ? "Preparing" : o.status === "Preparing" ? "Ready" : "Served";
          const nextLbl = o.status === "Pending" ? "Start Cooking" : o.status === "Preparing" ? "Mark Ready \u2713" : "Mark Served";
          return `<div style="${cardStyle()}border:2px solid ${border};margin:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;">
              <strong style="font-size:15px;">${o.order_type === "delivery" ? "DELIVERY" : o.order_type === "pickup" ? "PICKUP" : o.order_type === "takeaway" ? "TAKEAWAY" : "Table " + esc(o.table_number)} &bull; ${esc(o.kot_no || o.order_no)}</strong>
              <span class="roleBadge" style="background:${border};color:#000;">${esc(o.status)} &bull; ${mins}m</span>
            </div>
            ${o.placed_by_name ? `<div style="font-size:11px;color:var(--muted,#94a3b8);margin-bottom:6px;">By ${esc(o.placed_by_name)}</div>` : ""}
            <div style="font-size:13.5px;line-height:1.65;margin-bottom:10px;">
              ${(o.cart || []).map((i) => {
                const st = String(i.kot_station || "Kitchen").trim() || "Kitchen";
                const dim = KDS_STATION !== "All" && st !== KDS_STATION;
                return `<div style="${dim ? "opacity:.45;" : ""}"><strong>${num(i.qty, 1)}&times;</strong> ${esc(i.name)} <span class="v8Pill">${esc(st)}</span></div>`;
              }).join("")}
            </div>
            ${o.notes ? `<div style="font-size:12px;color:#fde68a;margin-bottom:8px;">Note: ${esc(o.notes)}</div>` : ""}
            <div style="display:flex;gap:6px;">
              <button class="primaryButton" style="flex:1;" data-kds-id="${esc(o.id)}" data-kds-next="${nextSt}">${nextLbl}</button>
              <button class="secondaryButton" style="padding:6px 10px;" data-kds-kot="${esc(o.id)}" title="Print KOT"><i class="fa-solid fa-print"></i></button>
            </div>
          </div>`;
        }).join("") || `<div style="${cardStyle()}text-align:center;color:var(--muted,#94a3b8);">Kitchen queue is clear${KDS_STATION !== "All" ? " for " + esc(KDS_STATION) : ""}!</div>`}
      </div>`;

    const rbtn = document.getElementById("v8KdsRefresh");
    if (rbtn) rbtn.addEventListener("click", renderKdsPage);
    el.querySelectorAll("[data-kds-station]").forEach((b) => {
      b.addEventListener("click", () => { KDS_STATION = b.dataset.kdsStation || "All"; renderKdsPage(); });
    });
    el.querySelectorAll("[data-kds-kot]").forEach((b) => {
      b.addEventListener("click", () => {
        const o = active.find((x) => x.id === b.dataset.kdsKot);
        if (o && typeof printHtml === "function" && typeof kotHtml === "function") printHtml(kotHtml(o));
      });
    });
    el.querySelectorAll("[data-kds-id]").forEach((b) => {
      b.addEventListener("click", async () => {
        try {
          await rpc("set_order_status", { p_order: b.dataset.kdsId, p_status: b.dataset.kdsNext, p_reason: null });
          showToast("KOT updated!", "success");
          if (typeof refreshLive === "function") await refreshLive();
          renderKdsPage();
        } catch (e) {
          showToast((e && e.message) || "Could not update KOT.", "error");
        }
      });
    });
  }

  // --- GST, SHIFT CASH REGISTER, SETTLEMENT & GSTR-1 CA PAGE ---
  function printShiftZReport(sh) {
    if (!sh || typeof printHtml !== "function" || typeof docHtml !== "function") return;
    const html = `<div style="font-family:monospace;font-size:12px;max-width:74mm;margin:0 auto;color:#000;">
      <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
        <div style="font-size:15px;font-weight:900;">${esc(R.name)}</div>
        <div style="font-size:12px;font-weight:900;">SHIFT Z-REPORT</div>
      </div>
      <div><strong>Opened:</strong> ${esc(fmtDateTime(sh.opened_at))} (${esc(sh.opened_by_name || "")})</div>
      <div><strong>Closed:</strong> ${esc(fmtDateTime(sh.closed_at))} (${esc(sh.closed_by_name || "")})</div>
      <div style="border-top:1px dashed #000;margin:6px 0;"></div>
      <div style="display:flex;justify-content:space-between;"><span>Opening Cash</span><span>${esc(money(sh.opening_cash))}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Cash Sales</span><span>${esc(money(sh.cash_sales))}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Cash Added</span><span>${esc(money(sh.cash_in))}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Cash Payouts</span><span>-${esc(money(sh.cash_out))}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:900;border-top:1px dashed #000;margin-top:4px;padding-top:4px;"><span>Expected Cash</span><span>${esc(money(sh.expected_cash))}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:900;"><span>Actual Counted</span><span>${esc(money(sh.actual_cash))}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:900;"><span>Variance</span><span>${esc(money(sh.variance))}</span></div>
      <div style="border-top:1px dashed #000;margin:6px 0;"></div>
      <div style="display:flex;justify-content:space-between;"><span>UPI Sales</span><span>${esc(money(sh.upi_sales))}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Card Sales</span><span>${esc(money(sh.card_sales))}</span></div>
      ${sh.notes ? `<div style="margin-top:6px;"><strong>Notes:</strong> ${esc(sh.notes)}</div>` : ""}
    </div>`;
    printHtml(docHtml("Shift Z-Report", "@page{margin:4mm}body{margin:0;color:#000}", html));
  }

  async function renderGstPage() {
    const el = document.getElementById("v8gst");
    if (!el || (typeof canBill === "function" && !canBill())) return;
    await loadV8Meta();
    const admin = typeof isAdmin !== "function" || isAdmin();
    const today = businessDateNow();
    const firstDay = today.slice(0, 8) + "01";
    const [ordersRes, shiftRes, khataRes] = await Promise.all([
      rpc("staff_orders", { p_restaurant: R.id }).catch(() => []),
      rpc("v8_shift_status", { p_restaurant: R.id }).catch(() => ({ ok: false })),
      rpc("v8_khata", { p_restaurant: R.id, p_action: "list" }).catch(() => ({ ok: false, accounts: [] }))
    ]);
    const unpaid = (ordersRes || []).filter((o) => o.payment_status === "Unpaid" && o.status !== "Cancelled");
    const sh = shiftRes && shiftRes.open_shift ? shiftRes.open_shift : null;
    const movs = (shiftRes && shiftRes.movements) || [];
    const hist = (shiftRes && shiftRes.history) || [];
    const khatas = (khataRes && khataRes.accounts) || [];

    el.innerHTML = `
      <div style="${cardStyle()}">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <h3 style="margin:0;"><i class="fa-solid fa-vault"></i> Shift Cash Register &amp; Drawer</h3>
          ${sh ? `<span class="roleBadge" style="background:rgba(16,185,129,.2);color:#34d399;">OPEN &bull; By ${esc(sh.opened_by_name || "staff")}</span>` : `<span class="roleBadge" style="background:rgba(245,158,11,.2);color:#fbbf24;">CLOSED</span>`}
        </div>
        ${sh ? `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:12px;">
            <div style="padding:10px;border:1px solid var(--border);border-radius:10px;"><div style="font-size:11px;color:var(--muted,#94a3b8);">Opening Float</div><strong style="font-size:15px;">${money(sh.opening_cash)}</strong></div>
            <div style="padding:10px;border:1px solid var(--border);border-radius:10px;"><div style="font-size:11px;color:var(--muted,#94a3b8);">Cash Sales</div><strong style="font-size:15px;">${money(sh.cash_sales)}</strong></div>
            <div style="padding:10px;border:1px solid var(--border);border-radius:10px;"><div style="font-size:11px;color:var(--muted,#94a3b8);">UPI Sales</div><strong style="font-size:15px;">${money(sh.upi_sales)}</strong></div>
            <div style="padding:10px;border:1px solid var(--border);border-radius:10px;"><div style="font-size:11px;color:var(--muted,#94a3b8);">Card Sales</div><strong style="font-size:15px;">${money(sh.card_sales)}</strong></div>
            <div style="padding:10px;border:1px solid var(--border);border-radius:10px;"><div style="font-size:11px;color:var(--muted,#94a3b8);">In / Payouts</div><strong style="font-size:15px;">+${money(sh.cash_in)} / -${money(sh.cash_out)}</strong></div>
            <div style="padding:10px;border:1px solid var(--accent,#c5a880);border-radius:10px;background:rgba(197,168,128,.08);"><div style="font-size:11px;color:var(--muted,#94a3b8);">Expected Cash</div><strong style="font-size:16px;color:var(--accent,#c5a880);">${money(sh.expected_cash)}</strong></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:${movs.length ? "10px" : "0"};">
            <button type="button" class="secondaryButton" id="v8CashInBtn">+ Cash In</button>
            <button type="button" class="secondaryButton" id="v8CashOutBtn">- Cash Payout (Petty)</button>
            <button type="button" class="primaryButton" id="v8CloseShiftBtn">Close Shift &amp; Print Z-Report</button>
          </div>
          ${movs.length ? `<div style="font-size:12px;border-top:1px solid var(--border);padding-top:8px;"><strong>Drawer Movements:</strong> ${movs.map((m) => `<span style="display:inline-block;margin-right:10px;">${m.movement_type === "in" ? "+" : "-"}${money(m.amount)} (${esc(m.reason)})</span>`).join("")}</div>` : ""}
        ` : `
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <div><label class="fieldLabel">Opening Cash in Drawer (₹)</label><input class="field" id="v8OpenCash" type="number" min="0" step="1" value="0" style="width:180px;"></div>
            <button type="button" class="primaryButton" id="v8OpenShiftBtn">Open Cash Shift</button>
          </div>
        `}
        ${hist.length ? `<details style="margin-top:12px;font-size:12px;"><summary style="cursor:pointer;color:var(--muted,#94a3b8);">Recent Closed Shifts (${hist.length})</summary>
          <div style="overflow-x:auto;margin-top:8px;"><table style="width:100%;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--border);text-align:left;"><th style="padding:4px;">Closed</th><th>By</th><th>Expected</th><th>Actual</th><th>Variance</th><th></th></tr></thead>
            <tbody>${hist.map((h) => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:4px;">${esc(fmtDateTime(h.closed_at))}</td><td>${esc(h.closed_by_name || "")}</td><td>${money(h.expected_cash)}</td><td>${money(h.actual_cash)}</td><td style="color:${num(h.variance) < 0 ? "#f87171" : "#34d399"};">${money(h.variance)}</td><td><button type="button" class="secondaryButton" style="padding:3px 8px;font-size:11px;" data-z-print="${esc(h.id)}">Z-Report</button></td></tr>`).join("")}</tbody>
          </table></div>
        </details>` : ""}
      </div>

      <div style="${cardStyle()}">
        <h3 style="margin:0 0 10px;"><i class="fa-solid fa-cash-register"></i> Pro Settlement Desk (Split Cash+UPI / NC Bill / B2B GSTIN / Counter Disc / Loyalty OTP)</h3>
        ${unpaid.length ? unpaid.map((o) => `
          <div style="border-bottom:1px solid var(--border,rgba(255,255,255,.08));padding:10px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <strong>#${esc(o.order_no)}</strong> &middot; ${o.order_type === "delivery" ? "Delivery" : o.order_type === "pickup" ? "Self-Pickup" : o.order_type === "takeaway" ? "Takeaway" : "Table " + esc(o.table_number)} &middot; ${esc(o.customer_name)}${o.customer_phone ? " (" + esc(o.customer_phone) + ")" : ""} &middot; <strong>${money(o.total)}</strong>
              ${o.coupon_code ? `<span class="roleBadge" style="margin-left:6px;background:rgba(16,185,129,.2);color:#34d399;">Coupon ${esc(o.coupon_code)} (-${money(o.coupon_discount)})</span>` : ""}
              ${num(o.loyalty_discount) > 0 ? `<span class="roleBadge" style="margin-left:6px;background:rgba(197,168,128,.2);color:#fbbf24;">Loyalty -${money(o.loyalty_discount)}</span>` : ""}
              ${num(o.manual_discount) > 0 ? `<span class="roleBadge" style="margin-left:6px;background:rgba(245,158,11,.2);color:#fbbf24;">Disc -${money(o.manual_discount)}</span>` : ""}
              ${o.split_locked ? `<span class="roleBadge" style="margin-left:6px;background:rgba(99,102,241,.2);color:#a5b4fc;">Split Share</span>` : ""}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${!o.split_locked && (o.cart || []).length > 0 ? `<button class="secondaryButton" style="padding:6px 10px;font-size:12px;" data-v8-split="${esc(o.id)}">Split</button>` : ""}
              ${V8_META.loyalty_enabled ? `<button class="secondaryButton" style="padding:6px 10px;font-size:12px;" data-v8-loy="${esc(o.id)}" data-v8-phone="${esc(o.customer_phone || "")}" data-v8-name="${esc(o.customer_name || "")}">Loyalty OTP</button>` : ""}
              <button class="primaryButton" style="padding:6px 10px;font-size:12px;" data-v8-settle="${esc(o.id)}">Settle Bill</button>
              <button class="secondaryButton" style="padding:6px 10px;font-size:12px;" data-v8-provisional="${esc(o.id)}">Print GST Bill + UPI QR</button>
            </div>
          </div>`).join("") : `<div style="color:var(--muted,#94a3b8);font-size:13px;">All active orders are settled.</div>`}
      </div>

      <div style="${cardStyle()}">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <h3 style="margin:0;"><i class="fa-solid fa-book"></i> Khata / Credit Accounts (${khatas.length} &middot; Total Due: ${money(khatas.reduce((s, a) => s + num(a.balance_due), 0))})</h3>
          <button type="button" class="secondaryButton" id="v8KhataNewBtn">+ New Khata Account</button>
        </div>
        ${khatas.length ? `<div style="overflow-x:auto;"><table style="width:100%;font-size:12.5px;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid var(--border);text-align:left;"><th style="padding:6px;">Account / Company</th><th>Mobile</th><th style="text-align:right;">Limit</th><th style="text-align:right;">Balance Due</th><th style="text-align:right;">Actions</th></tr></thead>
          <tbody>${khatas.map((k) => `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px;"><strong>${esc(k.name)}</strong>${k.company ? `<div style="font-size:11px;color:var(--muted,#94a3b8);">${esc(k.company)}${k.gstin ? " &bull; " + esc(k.gstin) : ""}</div>` : ""}</td>
            <td>${esc(k.phone || "-")}</td>
            <td style="text-align:right;">${num(k.credit_limit) > 0 ? money(k.credit_limit) : "Unlimited"}</td>
            <td style="text-align:right;font-weight:700;color:${num(k.balance_due) > 0 ? "#fbbf24" : "#34d399"};">${money(k.balance_due)}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button type="button" class="secondaryButton" style="padding:4px 8px;font-size:11.5px;" data-kh-ledger="${esc(k.id)}">Ledger</button>
              ${num(k.balance_due) > 0 ? `<button type="button" class="primaryButton" style="padding:4px 8px;font-size:11.5px;margin-left:4px;" data-kh-pay="${esc(k.id)}">Collect</button>` : ""}
            </td>
          </tr>`).join("")}</tbody>
        </table></div>` : `<div style="color:var(--muted,#94a3b8);font-size:13px;">Add regular/corporate credit accounts to settle bills via Khata (Pay Later) while still issuing compliant GST invoices.</div>`}
      </div>

      ${admin ? `
      <div style="${cardStyle()}">
        <h3 style="margin:0 0 8px;"><i class="fa-solid fa-file-invoice-dollar"></i> Indian GST (2025&ndash;26 Rules), FSSAI, Loyalty &amp; Billing Config</h3>
        <p style="font-size:11.5px;color:var(--muted,#94a3b8);margin:0 0 12px;">Per Apr 2025 rules, <strong>Specified Premises (18% with ITC)</strong> applies if any hotel unit had actual room supply &gt; ₹7,500/day in the preceding FY (or opted-in Jan 1&ndash;Mar 31). Item-level 0% / 5% / 18% / 40% (aerated) slabs apply automatically.</p>
        <form id="v8GstForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
          <div><label class="fieldLabel">GST Regime</label><select class="field" id="v8Regime">
            <option value="regular_5" ${V8_META.tax_regime==="regular_5"?"selected":""}>Regular 5% (2.5% CGST + 2.5% SGST, No ITC)</option>
            <option value="specified_18" ${V8_META.tax_regime==="specified_18"?"selected":""}>Specified Premises 18% (&gt;₹7,500 Hotel / Opt-In, With ITC)</option>
            <option value="composition" ${V8_META.tax_regime==="composition"?"selected":""}>Composition Scheme (Bill of Supply, 0%)</option>
            <option value="unregistered" ${V8_META.tax_regime==="unregistered"?"selected":""}>Unregistered Below Threshold (Cash Memo, 0%)</option>
          </select></div>
          <div><label class="fieldLabel">GSTIN (15-char)</label><input class="field" id="v8Gstin" maxlength="15" style="text-transform:uppercase;" value="${esc(V8_META.gstin || R.gstin || "")}" placeholder="23AAAAA0000A1Z5"></div>
          <div><label class="fieldLabel">FSSAI License No. (14-digit)</label><input class="field" id="v8Fssai" maxlength="14" value="${esc(V8_META.fssai_no || "")}" placeholder="11424000000000"></div>
          <div><label class="fieldLabel">Place of Supply (Sec 12(4) IGST Act)</label><input class="field" id="v8State" value="${esc(V8_META.state_code || "23-Madhya Pradesh")}"></div>
          <div><label class="fieldLabel">FY Invoice Prefix (Resets Apr 1)</label><input class="field" id="v8Prefix" value="${esc(V8_META.invoice_prefix || "INV")}"></div>
          <div><label class="fieldLabel">Packaging Charge Type</label><select class="field" id="v8PkgType">
            <option value="none" ${V8_META.packaging_charge_type==="none"?"selected":""}>None</option>
            <option value="flat" ${V8_META.packaging_charge_type==="flat"?"selected":""}>Flat per Takeaway</option>
            <option value="per_item" ${V8_META.packaging_charge_type==="per_item"?"selected":""}>Per Item</option>
          </select></div>
          <div><label class="fieldLabel">Packaging Charge (₹)</label><input class="field" id="v8PkgAmt" type="number" step="0.5" value="${num(V8_META.packaging_charge, 0)}"></div>
          <div><label class="fieldLabel">Optional Service Charge (%)</label><input class="field" id="v8SvcPct" type="number" step="0.5" value="${num(V8_META.service_charge_percent, 0)}"></div>
          <div><label class="fieldLabel">Loyalty Earn (pts / ₹100)</label><input class="field" id="v8LoyEarn" type="number" value="${num(V8_META.loyalty_earn_per_100, 5)}"></div>
          <div><label class="fieldLabel">1 Loyalty Point Value (₹)</label><input class="field" id="v8LoyVal" type="number" step="0.5" value="${num(V8_META.loyalty_point_value, 1)}"></div>
          <div style="grid-column:1/-1;display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:13px;">
            <label><input type="checkbox" id="v8Takeaway" ${V8_META.takeaway_enabled!==false?"checked":""}> Takeaway Enabled</label>
            <label><input type="checkbox" id="v8DirectOn" ${V8_META.direct_order_enabled!==false?"checked":""}> Direct Pickup / Delivery Link</label>
            <label><input type="checkbox" id="v8LoyOn" ${V8_META.loyalty_enabled?"checked":""}> Loyalty Points Active</label>
            <label><input type="checkbox" id="v8ShareCrm" ${V8_META.share_crm_across_org?"checked":""}> Share CRM &amp; Loyalty Across Chain</label>
            <label title="Required by GSTR-1 Phase 3 (May 2025) &amp; B2B E-Invoicing"><input type="checkbox" id="v8Aato5" ${V8_META.is_aato_over_5cr?"checked":""}> Turnover &gt; ₹5 Cr (6-digit HSN/SAC &amp; B2B IRN)</label>
            <label title="Voluntary Jan 1 - Mar 31 declaration for Specified Premises"><input type="checkbox" id="v8SpecOptIn" ${V8_META.specified_premises_opt_in?"checked":""}> Specified Premises Opt-In Declared</label>
            <button type="submit" class="primaryButton">Save GST &amp; Loyalty Config</button>
          </div>
        </form>
      </div>

      <div style="${cardStyle()}">
        <h3 style="margin:0 0 8px;"><i class="fa-solid fa-file-excel"></i> GSTR-1 CA Accountant Export (Phase 3 Compliant: Table 12 B2B/B2C Split + Table 13 Doc Summary)</h3>
        <p style="font-size:11.5px;color:var(--muted,#94a3b8);margin:0 0 10px;">Permanent records (zero auto-delete). Includes Table 12 HSN/SAC split by B2B &amp; B2C, mandatory Table 13 document counts, Table 4A B2B, Table 7 B2CS, and Daily Reconciliation.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
          <div><label class="fieldLabel">From Date</label><input class="field" type="date" id="v8GFrom" value="${firstDay}"></div>
          <div><label class="fieldLabel">To Date</label><input class="field" type="date" id="v8GTo" value="${today}"></div>
          ${(V8_EXTRAS.outlets || []).length > 1 ? `<label style="font-size:13px;"><input type="checkbox" id="v8GOrg"> Consolidated All Chain Branches</label>` : ""}
          <button class="primaryButton" id="v8ExportGstr1Btn">Export 7-Sheet GSTR-1 Excel</button>
        </div>
      </div>` : ""}`;

    const openBtn = document.getElementById("v8OpenShiftBtn");
    if (openBtn) openBtn.addEventListener("click", async () => {
      try {
        const amt = Math.max(0, num(document.getElementById("v8OpenCash").value, 0));
        await rpc("v8_open_shift", { p_restaurant: R.id, p_opening_cash: amt });
        showToast("Shift cash register opened!", "success");
        renderGstPage();
      } catch (e) { showToast((e && e.message) || "Could not open shift.", "error"); }
    });

    async function doCashMove(type) {
      let amt = 0, reason = "";
      const res = await Dialog.open({
        title: type === "in" ? "Add Cash to Drawer" : "Cash Payout (Petty Expense)",
        body: `<label class="dlgLabel">Amount (₹)</label><input id="v8MovAmt" class="dlgInput" type="number" min="1" step="0.5" placeholder="0">
          <label class="dlgLabel" style="margin-top:10px;display:block;">Reason *</label><input id="v8MovWhy" class="dlgInput" maxlength="120" placeholder="e.g. Milk, Ice, Change float">`,
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Record", kind: "primaryButton" }],
        onClick(bid) {
          if (bid !== "save") return;
          amt = num(document.getElementById("v8MovAmt").value, 0);
          reason = String(document.getElementById("v8MovWhy").value || "").trim();
          if (amt <= 0) return { error: "Enter a positive amount." };
          if (reason.length < 2) return { error: "Enter a short reason." };
        }
      });
      if (res !== "save") return;
      try {
        await rpc("v8_cash_movement", { p_restaurant: R.id, p_type: type, p_amount: amt, p_reason: reason });
        showToast("Drawer movement recorded!", "success");
        renderGstPage();
      } catch (e) { showToast((e && e.message) || "Could not record cash movement.", "error"); }
    }
    const cinBtn = document.getElementById("v8CashInBtn");
    if (cinBtn) cinBtn.addEventListener("click", () => doCashMove("in"));
    const coutBtn = document.getElementById("v8CashOutBtn");
    if (coutBtn) coutBtn.addEventListener("click", () => doCashMove("out"));

    const closeBtn = document.getElementById("v8CloseShiftBtn");
    if (closeBtn && sh) closeBtn.addEventListener("click", async () => {
      let actual = 0, notes = "";
      const choice = await Dialog.open({
        title: "Close Shift & Reconcile Cash",
        body: `<p class="dlgText">Expected cash in drawer: <b>${esc(money(sh.expected_cash))}</b></p>
          <label class="dlgLabel">Actual Counted Cash (₹) *</label><input id="v8ActCash" class="dlgInput" type="number" min="0" step="0.5" value="${num(sh.expected_cash).toFixed(2)}">
          <label class="dlgLabel" style="margin-top:10px;display:block;">Closing Notes (optional)</label><input id="v8CloseNotes" class="dlgInput" maxlength="200" placeholder="Handover notes">`,
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "close", label: "Close Shift", kind: "primaryButton", danger: true }],
        onClick(bid) {
          if (bid !== "close") return;
          actual = num(document.getElementById("v8ActCash").value, -1);
          notes = String(document.getElementById("v8CloseNotes").value || "").trim();
          if (actual < 0) return { error: "Actual cash cannot be negative." };
        }
      });
      if (choice !== "close") return;
      try {
        const res = await rpc("v8_close_shift", { p_restaurant: R.id, p_actual_cash: actual, p_notes: notes });
        showToast(`Shift closed! Variance: ${money(res && res.shift ? res.shift.variance : 0)}`, "success");
        if (res && res.shift) printShiftZReport(res.shift);
        renderGstPage();
      } catch (e) { showToast((e && e.message) || "Could not close shift.", "error"); }
    });

    el.querySelectorAll("[data-z-print]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const h = hist.find((x) => x.id === btn.dataset.zPrint);
        if (h) printShiftZReport(h);
      });
    });

    if (admin) {
      const gstForm = document.getElementById("v8GstForm");
      if (gstForm) gstForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const regime = document.getElementById("v8Regime").value;
        const gstinVal = document.getElementById("v8Gstin").value.trim().toUpperCase();
        const fssaiVal = document.getElementById("v8Fssai").value.replace(/\D/g, "");
        if (gstinVal && typeof isValidGstin === "function" && !isValidGstin(gstinVal)) {
          showToast("Enter a valid 15-character GSTIN (e.g. 23AAAAA0000A1Z5).", "error"); return;
        }
        if (fssaiVal && fssaiVal.length !== 14) {
          showToast("FSSAI License No. must be exactly 14 digits.", "error"); return;
        }
        if ((regime === "regular_5" || regime === "specified_18") && !gstinVal) {
          showToast("GSTIN is required for Regular (5%) and Specified Premises (18%) tax invoicing.", "error"); return;
        }
        try {
          const res = await rpc("v8_save_settings", { p_restaurant: R.id, p_data: {
            tax_regime: regime, gstin: gstinVal,
            fssai_no: fssaiVal, state_code: document.getElementById("v8State").value,
            invoice_prefix: document.getElementById("v8Prefix").value, packaging_charge_type: document.getElementById("v8PkgType").value,
            packaging_charge: num(document.getElementById("v8PkgAmt").value), service_charge_percent: num(document.getElementById("v8SvcPct").value),
            loyalty_earn_per_100: num(document.getElementById("v8LoyEarn").value, 5), loyalty_point_value: num(document.getElementById("v8LoyVal").value, 1),
            takeaway_enabled: document.getElementById("v8Takeaway").checked, direct_order_enabled: !!document.getElementById("v8DirectOn")?.checked,
            loyalty_enabled: document.getElementById("v8LoyOn").checked,
            share_crm_across_org: document.getElementById("v8ShareCrm").checked,
            is_aato_over_5cr: !!document.getElementById("v8Aato5")?.checked,
            specified_premises_opt_in: !!document.getElementById("v8SpecOptIn")?.checked
          }});
          showToast((res && res.message) || "Saved", res && res.ok ? "success" : "error");
          if (res && res.ok) {
            POS_STATE.loaded = false;
            await loadV8Meta();
            try { R = await rpc("get_restaurant", { p_slug: R.slug }); } catch (_) {}
          }
        } catch (err) {
          showToast((err && err.message) || "Failed to save GST settings.", "error");
        }
      });

      const expBtn = document.getElementById("v8ExportGstr1Btn");
      if (expBtn) expBtn.addEventListener("click", async () => {
        const from = document.getElementById("v8GFrom").value, to = document.getElementById("v8GTo").value;
        if (!from || !to || from > to) { showToast("Choose a valid date range.", "error"); return; }
        const orgChk = document.getElementById("v8GOrg");
        let rep;
        try {
          rep = await rpc("v8_gstr1_report", { p_restaurant: R.id, p_from: from, p_to: to, p_include_org: Boolean(orgChk && orgChk.checked) });
        } catch (err) {
          showToast((err && err.message) || "Export failed", "error");
          return;
        }
        if (!rep || !rep.ok) { showToast((rep && rep.message) || "Export failed", "error"); return; }
        const invs = rep.invoices || [];
        const b2b = invs.filter((i) => i.customer_gstin && i.customer_gstin.length >= 15 && !i.is_nc);
        const b2cs = invs.filter((i) => (!i.customer_gstin || i.customer_gstin.length < 15) && !i.is_nc);
        const nc = invs.filter((i) => i.is_nc);
        const daily = rep.daily_summary || [];
        const t12Map = (s) => [s.hsn_sac, "NOS", num(s.total_qty), num(s.gst_rate) + "%", num(s.taxable_value), num(s.cgst), num(s.sgst), 0];
        const sheets = [
          { name: "Table12_HSN_B2B", rows: [["HSN/SAC","UQC","Total Qty","Rate %","Taxable Value","CGST","SGST","IGST"], ...(rep.table12_b2b||[]).map(t12Map)] },
          { name: "Table12_HSN_B2C", rows: [["HSN/SAC","UQC","Total Qty","Rate %","Taxable Value","CGST","SGST","IGST"], ...(rep.table12_b2c||[]).map(t12Map)] },
          { name: "Table13_Doc_Summary", rows: [["Branch","Nature of Document","Sr. No. From","Sr. No. To","Total Issued","Cancelled","Net Issued"], ...(rep.table13_docs||[]).map((d)=>[d.branch_name,d.doc_nature,d.sr_from,d.sr_to,num(d.total_issued),num(d.cancelled),num(d.net_issued)])] },
          { name: "B2B_Invoices", rows: [["Branch","GSTIN","POS","Invoice No","Date","Buyer GSTIN","Buyer Name","Offer Disc","Coupon","Loyalty Disc","Counter Disc","Taxable","CGST","SGST","Total"], ...b2b.map((i)=>[i.branch_name,i.branch_gstin,i.state_code||"",i.invoice_no,i.business_date,i.customer_gstin,i.customer_legal_name||i.customer_name,num(i.offer_discount),i.coupon_code||"",num(i.loyalty_discount),num(i.manual_discount),num(i.taxable_value),num(i.cgst),num(i.sgst),num(i.total)])] },
          { name: "B2CS_Invoices", rows: [["Branch","POS","Invoice No","Date","Type","Guest","Phone","Offer Disc","Coupon Code","Coupon Disc","Loyalty Disc","Counter Disc","Taxable","CGST","SGST","RoundOff","Total","Mode"], ...b2cs.map((i)=>[i.branch_name,i.state_code||"",i.invoice_no,i.business_date,i.order_type,i.customer_name,i.customer_phone,num(i.offer_discount),i.coupon_code||"",num(i.coupon_discount),num(i.loyalty_discount),num(i.manual_discount),num(i.taxable_value),num(i.cgst),num(i.sgst),num(i.round_off),num(i.total),i.payment_mode])] },
          { name: "NC_Complimentary", rows: [["Branch","Invoice No","Date","Guest","Subtotal","Reason"], ...nc.map((i)=>[i.branch_name,i.invoice_no,i.business_date,i.customer_name,num(i.subtotal),i.nc_reason])] },
          { name: "Daily_Summary", rows: [["Branch","Date","Orders","NC","Subtotal","Discount","Taxable","CGST","SGST","Net Revenue","Cash","UPI","Card"], ...daily.map((d)=>[d.branch_name,d.business_date,num(d.orders_count),num(d.nc_count),num(d.subtotal),num(d.discount),num(d.taxable_value),num(d.cgst),num(d.sgst),num(d.net_revenue),num(d.cash_total),num(d.upi_total),num(d.card_total)])] }
        ];
        if (typeof Sheets !== "undefined" && typeof Sheets.downloadXlsx === "function") {
          Sheets.downloadXlsx(sheets, `GSTR1_${R.slug}_${from}_to_${to}.xlsx`);
          showToast(`Exported ${invs.length} invoices (7 GSTR-1 sheets)!`, "success");
        } else {
          showToast("Excel export helper is not loaded.", "error");
        }
      });
    }

    el.querySelectorAll("[data-v8-split]").forEach((btn) => {
      btn.addEventListener("click", () => splitBillDialog(btn.dataset.v8Split));
    });

    el.querySelectorAll("[data-v8-settle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const o = unpaid.find((x) => x.id === btn.dataset.v8Settle);
        if (o) openSettleDialog(o);
      });
    });

    el.querySelectorAll("[data-v8-loy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await openLoyaltyOtpDialog({
          orderId: btn.dataset.v8Loy,
          phone: btn.dataset.v8Phone || "",
          customerName: btn.dataset.v8Name || "",
          onDone: async () => {
            if (typeof refreshLive === "function") await refreshLive();
            renderGstPage();
          }
        });
      });
    });

    el.querySelectorAll("[data-v8-provisional]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const o = unpaid.find((x) => x.id === btn.dataset.v8Provisional);
        if (!o) return;
        try {
          const rep = await rpc("v8_record_bill_reprint", { p_restaurant: R.id, p_order_id: o.id });
          if (rep && rep.bill_reprints != null) o.bill_reprints = rep.bill_reprints;
        } catch (_) {}
        printV8GstBill(typeof consolidatedTableBill === "function" ? consolidatedTableBill(o) : o);
      });
    });

    const khNew = document.getElementById("v8KhataNewBtn");
    if (khNew) khNew.addEventListener("click", async () => {
      let name = "", phone = "", company = "", gstin = "", limit = 0;
      const res = await Dialog.open({
        title: "New Khata / Corporate Credit Account",
        body: `<label class="dlgLabel">Account Name *</label><input id="khName" class="dlgInput" maxlength="80" placeholder="e.g. Sharma Traders / Rahul Office">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
            <div><label class="dlgLabel">Mobile (10-digit)</label><input id="khPhone" class="dlgInput" maxlength="10"></div>
            <div><label class="dlgLabel">Credit Limit (₹, 0=none)</label><input id="khLimit" class="dlgInput" type="number" min="0" value="0"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
            <div><label class="dlgLabel">Company Legal Name</label><input id="khComp" class="dlgInput" maxlength="80"></div>
            <div><label class="dlgLabel">GSTIN (optional)</label><input id="khGstin" class="dlgInput" maxlength="15" style="text-transform:uppercase;"></div>
          </div>`,
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Create Account", kind: "primaryButton" }],
        onClick(bid) {
          if (bid !== "save") return;
          name = String(document.getElementById("khName").value || "").trim();
          if (name.length < 2) return { error: "Account name is required." };
          phone = String(document.getElementById("khPhone").value || "").replace(/\D/g, "").slice(0, 10);
          company = String(document.getElementById("khComp").value || "").trim();
          gstin = String(document.getElementById("khGstin").value || "").trim().toUpperCase();
          if (gstin && typeof isValidGstin === "function" && !isValidGstin(gstin)) return { error: "Enter valid 15-char GSTIN or leave blank." };
          limit = Math.max(0, num(document.getElementById("khLimit").value, 0));
        }
      });
      if (res !== "save") return;
      try {
        await rpc("v8_khata", { p_restaurant: R.id, p_action: "create_account", p_payload: { name, phone, company, gstin, credit_limit: limit } });
        showToast("Khata account created!", "success");
        renderGstPage();
      } catch (e) { showToast((e && e.message) || "Failed to create account.", "error"); }
    });

    el.querySelectorAll("[data-kh-pay]").forEach((btn) => btn.addEventListener("click", async () => {
      const k = khatas.find((x) => x.id === btn.dataset.khPay);
      if (!k) return;
      let amt = num(k.balance_due), mode = "UPI", notes = "";
      const res = await Dialog.open({
        title: `Collect Khata Payment — ${esc(k.name)}`,
        body: `<p class="dlgText">Pending Balance: <b>${esc(money(k.balance_due))}</b></p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div><label class="dlgLabel">Amount Received (₹) *</label><input id="khPayAmt" class="dlgInput" type="number" min="1" max="${num(k.balance_due)}" step="0.5" value="${num(k.balance_due)}"></div>
            <div><label class="dlgLabel">Mode</label><select id="khPayMode" class="dlgInput"><option value="UPI">UPI</option><option value="Cash">Cash</option><option value="Card">Card</option><option value="Bank">Bank Transfer</option></select></div>
          </div>
          <label class="dlgLabel" style="margin-top:8px;display:block;">Reference / Notes</label><input id="khPayNote" class="dlgInput" maxlength="120" placeholder="Txn ID / receipt note">`,
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Record Payment", kind: "primaryButton" }],
        onClick(bid) {
          if (bid !== "save") return;
          amt = num(document.getElementById("khPayAmt").value, 0);
          if (amt <= 0 || amt > num(k.balance_due)) return { error: "Amount must be between ₹1 and pending balance." };
          mode = document.getElementById("khPayMode").value;
          notes = String(document.getElementById("khPayNote").value || "").trim();
        }
      });
      if (res !== "save") return;
      try {
        await rpc("v8_khata", { p_restaurant: R.id, p_action: "collect_payment", p_payload: { khata_id: k.id, amount: amt, mode, notes } });
        showToast(`Recorded ${money(amt)} from ${k.name}!`, "success");
        renderGstPage();
      } catch (e) { showToast((e && e.message) || "Payment failed.", "error"); }
    }));

    el.querySelectorAll("[data-kh-ledger]").forEach((btn) => btn.addEventListener("click", async () => {
      const k = khatas.find((x) => x.id === btn.dataset.khLedger);
      if (!k) return;
      try {
        const res = await rpc("v8_khata", { p_restaurant: R.id, p_action: "ledger", p_payload: { khata_id: k.id } });
        const txns = (res && res.txns) || [];
        await Dialog.open({
          title: `Khata Ledger — ${esc(k.name)} (Due: ${esc(money(k.balance_due))})`,
          body: txns.length ? `<div style="max-height:300px;overflow-y:auto;"><table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--border);text-align:left;"><th style="padding:5px;">Date</th><th>Type</th><th>Mode</th><th style="text-align:right;">Amount</th><th>Notes</th></tr></thead>
            <tbody>${txns.map((t) => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:5px;">${esc(fmtDateTime(t.created_at))}</td><td>${t.txn_type === "debit" ? '<span style="color:#fbbf24;">Bill Debit</span>' : '<span style="color:#34d399;">Paid</span>'}</td><td>${esc(t.payment_mode)}</td><td style="text-align:right;">${money(t.amount)}</td><td>${esc(t.notes)}</td></tr>`).join("")}</tbody>
          </table></div>` : `<p class="dlgText">No transactions yet.</p>`,
          buttons: [{ id: "ok", label: "Close", kind: "primaryButton" }]
        });
      } catch (e) { showToast((e && e.message) || "Could not load ledger.", "error"); }
    }));
  }

  function printV8GstBill(o) {
    const regime = o.tax_regime_snapshot || V8_META.tax_regime || "regular_5";
    const invNo = o.fy_invoice_no || (o.payment_status === "Paid" ? o.invoice_no : "");
    const title = !invNo ? "PROVISIONAL BILL" : regime === "composition" ? "BILL OF SUPPLY (COMPOSITION)" : regime === "unregistered" ? "CASH MEMO" : "TAX INVOICE";
    const sub = num(o.subtotal), disc = num(o.discount), cpDisc = num(o.coupon_discount), loyDisc = num(o.loyalty_discount), manDisc = num(o.manual_discount);
    const pkg = num(o.packaging_charge), svc = num(o.service_charge);
    const taxable = o.taxable_value !== undefined && o.taxable_value !== null && num(o.taxable_value) >= 0 && (o.fy_invoice_no || cpDisc > 0 || loyDisc > 0 || manDisc > 0 || o.is_nc)
      ? num(o.taxable_value) : Math.max(0, sub - disc - cpDisc - loyDisc - manDisc + pkg + svc);
    const cgst = num(o.cgst) > 0 ? num(o.cgst) : Number((num(o.gst) / 2).toFixed(2));
    const sgst = num(o.sgst) > 0 ? num(o.sgst) : Number((num(o.gst) - cgst).toFixed(2));
    const slabs = typeof gstSlabRows === "function" ? gstSlabRows(o, regime, R.gst) : [];
    const taxLinesHtml = num(o.gst) > 0
      ? (slabs.length > 1
          ? slabs.map((s) => `<div style="display:flex;justify-content:space-between;"><span>CGST @${s.rate / 2}% (on ₹${s.taxable.toFixed(0)})</span><span>${s.cgst.toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;"><span>SGST @${s.rate / 2}%</span><span>${s.sgst.toFixed(2)}</span></div>`).join("")
          : `<div style="display:flex;justify-content:space-between;"><span>CGST @${(slabs[0]?.rate || (regime === "specified_18" ? 18 : num(R.gst, 5))) / 2}%</span><span>${cgst.toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;"><span>SGST @${(slabs[0]?.rate || (regime === "specified_18" ? 18 : num(R.gst, 5))) / 2}%</span><span>${sgst.toFixed(2)}</span></div>`)
      : "";
    const upiId = R.upi || R.upi_id || "";
    const upiUri = (upiId && !o.is_nc && num(o.total) > 0) ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(R.name)}&am=${num(o.total).toFixed(2)}&cu=INR&tn=${encodeURIComponent(invNo || o.order_no)}` : "";
    const renderQr = (typeof QR !== "undefined" && typeof QR.svg === "function") ? (u) => QR.svg(u, { border: 2 }) : (typeof qrSvg === "function" ? qrSvg : null);
    const qrBlock = (upiUri && renderQr) ? `<div style="text-align:center;margin-top:8px;"><div style="width:120px;margin:0 auto;">${renderQr(upiUri)}</div><div style="font-size:10px;font-weight:700;">Scan &amp; Pay ${esc(money(o.total))} via UPI</div></div>` : "";
    const hasAdj = disc > 0 || cpDisc > 0 || loyDisc > 0 || manDisc > 0 || pkg > 0 || svc > 0;
    const reprints = num(o.bill_reprints, 0);
    const bodyHtml = `<div style="font-family:monospace;font-size:12px;max-width:74mm;margin:0 auto;color:#000;">
      <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
        ${reprints > 1 ? `<div style="font-size:11px;font-weight:900;">*** DUPLICATE COPY (#${reprints}) ***</div>` : ""}
        <div style="font-size:15px;font-weight:900;">${esc(R.name)}</div>
        ${R.address ? `<div style="font-size:10px;">${esc(R.address)}</div>` : ""}
        ${(V8_META.gstin || R.gstin) ? `<div style="font-size:10.5px;font-weight:700;">GSTIN: ${esc(V8_META.gstin || R.gstin)}</div>` : ""}
        ${V8_META.fssai_no ? `<div style="font-size:10.5px;">FSSAI Lic: ${esc(V8_META.fssai_no)}</div>` : ""}
        <div style="font-size:11px;font-weight:900;margin-top:4px;">${title}</div>
      </div>
      <div style="font-size:11px;margin-bottom:6px;">
        <div><strong>${invNo ? "Invoice:" : "Order:"}</strong> ${esc(invNo || o.order_no)} | <strong>${o.order_type === "delivery" ? "Delivery" : o.order_type === "pickup" ? "Self-Pickup" : o.order_type === "takeaway" ? "Takeaway" : "Table " + esc(o.table_number)}</strong></div>
        <div><strong>Guest:</strong> ${esc(o.customer_name)}${o.customer_phone ? " (" + esc(o.customer_phone) + ")" : ""}</div>
        ${o.delivery_address ? `<div><strong>Address:</strong> ${esc(o.delivery_address)}</div>` : ""}
        ${o.customer_gstin ? `<div><strong>Buyer GSTIN:</strong> ${esc(o.customer_gstin)} ${esc(o.customer_legal_name || "")}</div>` : ""}
        ${V8_META.state_code ? `<div><strong>POS (Sec 12(4) IGST):</strong> ${esc(V8_META.state_code)}</div>` : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border-top:1px dashed #000;border-bottom:1px dashed #000;">
        <thead><tr><th style="text-align:left;">Item (HSN/SAC)</th><th>Qty</th><th style="text-align:right;">Amt</th></tr></thead>
        <tbody>${(o.cart || []).map((i) => { const qty = num(i.qty ?? i.quantity, 1); const unit = num(i.original_price ?? i.price); const amt = num(i.total ?? (unit * qty)); return `<tr><td>${esc(i.name)}${i.sac_code && i.sac_code !== "996331" ? " [" + esc(i.sac_code) + "]" : ""}</td><td style="text-align:center;">${esc(qty)}</td><td style="text-align:right;">${amt.toFixed(2)}</td></tr>`; }).join("")}</tbody>
      </table>
      <div style="margin-top:6px;font-size:11px;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${sub.toFixed(2)}</span></div>
        ${disc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Menu Offers</span><span>-${disc.toFixed(2)}</span></div>` : ""}
        ${cpDisc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Coupon (${esc(o.coupon_code || "PROMO")})</span><span>-${cpDisc.toFixed(2)}</span></div>` : ""}
        ${loyDisc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Loyalty (${num(o.loyalty_points_used, 0)} pts)</span><span>-${loyDisc.toFixed(2)}</span></div>` : ""}
        ${manDisc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Counter Disc${o.manual_discount_reason ? " (" + esc(o.manual_discount_reason) + ")" : ""}</span><span>-${manDisc.toFixed(2)}</span></div>` : ""}
        ${pkg > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Packaging</span><span>${pkg.toFixed(2)}</span></div>` : ""}
        ${svc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Service Charge</span><span>${svc.toFixed(2)}</span></div>` : ""}
        ${hasAdj && !o.is_nc ? `<div style="display:flex;justify-content:space-between;"><span>Taxable Value</span><span>${taxable.toFixed(2)}</span></div>` : ""}
        ${taxLinesHtml}
        ${Math.abs(num(o.round_off)) >= 0.005 ? `<div style="display:flex;justify-content:space-between;"><span>Round Off</span><span>${(num(o.round_off) > 0 ? "+" : "") + num(o.round_off).toFixed(2)}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;border-top:1px dashed #000;margin-top:4px;padding-top:4px;"><span>TOTAL</span><span>${o.is_nc ? "₹0.00 (NC)" : esc(money(o.total))}</span></div>
      </div>
      ${(o.payment_status === "Credit" || o.payment_mode === "Khata") ? `<div style="text-align:center;font-size:11px;font-weight:700;margin-top:4px;border:1px solid #000;padding:2px;">PAYMENT: CREDIT / KHATA</div>` : ""}
      ${qrBlock}
    </div>`;
    if (typeof printHtml === "function") {
      const fullDoc = typeof docHtml === "function" ? docHtml("Bill " + (invNo || o.order_no), "@page{margin:4mm}body{margin:0;color:#000}", bodyHtml) : bodyHtml;
      printHtml(fullDoc);
    }
  }

  async function openLoyaltyOtpDialog(opts) {
    opts = opts || {};
    let phone = String(opts.phone || "").replace(/\D/g, "").slice(-10);
    let ptsWanted = 0;
    const step1 = await Dialog.open({
      title: "Redeem Loyalty Points (WhatsApp OTP)",
      body: `<p class="dlgText">Counter / Owner verification. An OTP will be generated and sent via WhatsApp to the customer's phone.</p>
        ${opts.customerName ? `<p class="dlgText small">Guest: <b>${esc(opts.customerName)}</b></p>` : ""}
        <label for="v8OtpPhone">Customer 10-digit Mobile *</label>
        <input id="v8OtpPhone" class="dlgInput" type="tel" maxlength="10" value="${esc(phone)}" placeholder="98XXXXXXXX">
        <label for="v8OtpPts" style="margin-top:10px;display:block;">Points to Redeem (leave 0 for max allowed)</label>
        <input id="v8OtpPts" class="dlgInput" type="number" min="0" value="0">`,
      buttons: [{ id: "cancel", label: "Cancel" }, { id: "gen", label: "Generate WhatsApp OTP", kind: "primaryButton" }],
      onClick(btnId) {
        if (btnId !== "gen") return;
        phone = String(document.getElementById("v8OtpPhone").value || "").replace(/\D/g, "").slice(-10);
        if (phone.length !== 10) return { error: "Enter a valid 10-digit mobile number." };
        ptsWanted = Math.max(0, Math.floor(num(document.getElementById("v8OtpPts").value, 0)));
      }
    });
    if (step1 !== "gen") return;

    let ch;
    try {
      ch = await rpc("v8_request_loyalty_otp", {
        p_restaurant: R.id, p_order_id: opts.orderId || null, p_phone: phone, p_points: ptsWanted
      });
    } catch (e) {
      showToast((e && e.message) || "Failed to generate OTP.", "error");
      return;
    }
    if (!ch || !ch.ok) { showToast((ch && ch.message) || "Could not start loyalty OTP.", "error"); return; }

    const waPhone = normalizeWhatsApp(ch.phone) || ("91" + ch.phone);
    const waText = encodeURIComponent(`Your ${R.name} loyalty redemption OTP is ${ch.otp}. Redeem ${ch.redeem_points} points (save ₹${ch.discount_value}) on Table ${ch.table_number} (${ch.order_no}). Valid for 5 minutes.`);
    const waUrl = `https://wa.me/${waPhone}?text=${waText}`;

    const step2 = await Dialog.open({
      title: `Verify OTP — ${esc(ch.customer_name)}`,
      body: `<p class="dlgText">Order <b>#${esc(ch.order_no)}</b> (Table ${esc(ch.table_number)})<br>
        Available: <b>${ch.available_points} pts</b> &middot; Redeeming: <b>${ch.redeem_points} pts (-₹${ch.discount_value})</b></p>
        <div style="margin:10px 0 12px;">
          <a class="primaryButton" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;background:#25d366;color:#05070f;" href="${esc(waUrl)}" target="_blank" rel="noopener noreferrer">
            <i class="fa-brands fa-whatsapp"></i> Send OTP to Customer on WhatsApp
          </a>
        </div>
        <label for="v8VerifyOtpCode">Enter 6-digit OTP shared by customer *</label>
        <input id="v8VerifyOtpCode" class="dlgInput" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="off">`,
      buttons: [{ id: "cancel", label: "Cancel" }, { id: "verify", label: "Verify & Redeem", kind: "primaryButton" }],
      async onClick(btnId) {
        if (btnId !== "verify") return;
        const code = String(document.getElementById("v8VerifyOtpCode").value || "").trim();
        if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit OTP." };
        try {
          const vr = await rpc("v8_verify_redeem_loyalty_otp", { p_restaurant: R.id, p_challenge_id: ch.challenge_id, p_otp: code });
          if (!vr || !vr.ok) return { error: (vr && vr.message) || "Invalid OTP." };
          showToast(vr.message || "Loyalty points redeemed!", "success");
          if (typeof opts.onDone === "function") await opts.onDone(vr);
        } catch (err) {
          return { error: (err && err.message) || "Verification failed." };
        }
      }
    });
    return step2;
  }

  // --- PRO SETTLEMENT, ORDER EDIT, TABLE TRANSFER, SPLIT BILL ---
  async function openSettleDialog(o, opts) {
    if (!o || (typeof canBill === "function" && !canBill())) return;
    opts = opts || {};
    await loadV8Meta();
    const activeSt = typeof ACTIVE_STATUSES !== "undefined" ? ACTIVE_STATUSES : ["Pending", "Preparing", "Ready", "Served"];
    const orders = typeof S !== "undefined" && Array.isArray(S.orders) ? S.orders : [];
    const isDineIn = o.order_type === "dine_in";
    const tableOpen = o.split_locked || !isDineIn
      ? [o]
      : orders.filter((x) => x.table_number === o.table_number && x.order_type === "dine_in" && activeSt.includes(x.status) && !x.split_locked);
    const unserved = tableOpen.filter((x) => x.status !== "Served");
    const hasInKitchen = tableOpen.some((x) => ["Pending", "Preparing", "Ready"].includes(x.status));
    let settleAll = true;
    if (!opts.keepKitchenActive && !o.split_locked && isDineIn && tableOpen.length > 1 && unserved.length > 0) {
      const okMerge = await Dialog.confirm(
        `Table ${o.table_number} has ${unserved.length} order(s) not marked Served (${unserved.map((u) => u.order_no + ": " + u.status).join(", ")}). Merge & settle ALL ${tableOpen.length} open orders together?`,
        { title: "Settle Table " + o.table_number, confirmText: "Merge & Settle All" }
      );
      if (!okMerge) return;
      settleAll = true;
    }
    const khataRes = await rpc("v8_khata", { p_restaurant: R.id, p_action: "list" }).catch(() => ({ accounts: [] }));
    const khatas = (khataRes && khataRes.accounts) || [];
    const merged = (!o.split_locked && isDineIn && tableOpen.length > 1 && typeof consolidatedTableBill === "function") ? consolidatedTableBill(o) : o;
    const totAmt = num(merged.total, num(o.total));
    const svcAmt = num(merged.service_charge, 0);
    const prevManDisc = num(merged.manual_discount, 0);

    let mode = "UPI", splitCash = Math.round(totAmt / 2), isNc = false, ncReason = "", manDisc = 0, manReason = "", gstin = o.customer_gstin || "", legal = o.customer_legal_name || "", removeSvc = false, keepKitchen = !!(opts.keepKitchenActive || (!isDineIn && hasInKitchen)), khataId = khatas[0] ? khatas[0].id : "";

    const action = await Dialog.open({
      title: `Settle ${!isDineIn ? esc(o.order_type.toUpperCase()) : "Table " + esc(o.table_number)} (${esc(merged.order_no || o.order_no)})`,
      body: `
        <div style="padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span>Bill Total (${tableOpen.length > 1 ? tableOpen.length + " orders" : "1 order"})</span>
            ${prevManDisc > 0 ? `<div style="font-size:11px;color:#fbbf24;">Already has -${esc(money(prevManDisc))} counter discount applied</div>` : ""}
          </div>
          <strong style="font-size:18px;color:var(--accent,#c5a880);">${esc(money(totAmt))}</strong>
        </div>
        <label class="dlgLabel">Payment Mode</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px;" id="v8SettleModes">
          ${["UPI", "Cash", "Card", "Split", "Khata", "NC"].map((m) => `<button type="button" class="${m === "UPI" ? "primaryButton" : "secondaryButton"}" style="padding:6px 12px;font-size:12.5px;" data-smode="${m}">${m === "NC" ? "Complimentary (NC)" : m === "Khata" ? "Khata (Credit)" : m}</button>`).join("")}
        </div>
        <div id="v8SplitBox" style="display:none;margin-bottom:10px;">
          <label class="dlgLabel">Split Cash Part (₹) &mdash; Remainder auto-calculates as UPI</label>
          <input id="v8SplitCash" class="dlgInput" type="number" min="0" max="${totAmt}" step="0.5" value="${splitCash}">
        </div>
        <div id="v8KhataBox" style="display:none;margin-bottom:10px;">
          <label class="dlgLabel">Select Khata / Credit Account *</label>
          ${khatas.length ? `<select id="v8KhataSel" class="dlgInput">${khatas.map((k) => `<option value="${esc(k.id)}">${esc(k.name)}${k.company ? " (" + esc(k.company) + ")" : ""} &mdash; Due ${esc(money(k.balance_due))}</option>`).join("")}</select>` : `<div style="font-size:12px;color:#f87171;">No Khata accounts yet. Create one in Billing &amp; Shift &rarr; Khata Accounts first.</div>`}
        </div>
        <div id="v8NcBox" style="display:none;margin-bottom:10px;">
          <label class="dlgLabel">NC Reason *</label>
          <input id="v8NcWhy" class="dlgInput" maxlength="200" placeholder="Owner / VIP / Kitchen mistake">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:8px;margin-bottom:10px;">
          <div><label class="dlgLabel">Additional Counter Disc (₹)</label><input id="v8ManDisc" class="dlgInput" type="number" min="0" step="1" value="0"></div>
          <div><label class="dlgLabel">Discount Reason</label><input id="v8ManWhy" class="dlgInput" maxlength="100" value="" placeholder="Required if extra disc &gt; ₹0"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div><label class="dlgLabel">Buyer GSTIN (B2B optional)</label><input id="v8BuyerGstin" class="dlgInput" maxlength="15" value="${esc(gstin)}" placeholder="15-char GSTIN" style="text-transform:uppercase;"></div>
          <div><label class="dlgLabel">Buyer Legal Name</label><input id="v8BuyerLegal" class="dlgInput" maxlength="100" value="${esc(legal)}" placeholder="Company name"></div>
        </div>
        ${svcAmt > 0 ? `<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:6px;"><input type="checkbox" id="v8RmSvc"> Waive Service Charge (${esc(money(svcAmt))})</label>` : ""}
        ${hasInKitchen ? `<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:6px;"><input type="checkbox" id="v8KeepKds" ${keepKitchen ? "checked" : ""}> Keep KOT active in Kitchen Display &amp; QSR TV until cooked</label>` : ""}`,
      buttons: [
        ...(V8_META.loyalty_enabled ? [{ id: "loyalty", label: "Redeem Loyalty OTP", kind: "secondaryButton" }] : []),
        { id: "cancel", label: "Cancel" },
        { id: "settle", label: "Confirm & Print Bill", kind: "primaryButton" }
      ],
      onOpen() {
        const modeWrap = document.getElementById("v8SettleModes");
        if (!modeWrap) return;
        modeWrap.addEventListener("click", (ev) => {
          const btn = ev.target.closest("[data-smode]");
          if (!btn) return;
          mode = btn.dataset.smode;
          isNc = mode === "NC";
          modeWrap.querySelectorAll("[data-smode]").forEach((b) => { b.className = b === btn ? "primaryButton" : "secondaryButton"; });
          document.getElementById("v8SplitBox").style.display = mode === "Split" ? "block" : "none";
          document.getElementById("v8KhataBox").style.display = mode === "Khata" ? "block" : "none";
          document.getElementById("v8NcBox").style.display = isNc ? "block" : "none";
        });
      },
      onClick(bid) {
        if (bid !== "settle") return;
        if (mode === "Khata") {
          const ks = document.getElementById("v8KhataSel");
          khataId = ks ? ks.value : "";
          if (!khataId) return { error: "Create a Khata account in Billing & Shift first." };
        }
        manDisc = Math.max(0, num(document.getElementById("v8ManDisc").value, 0));
        manReason = String(document.getElementById("v8ManWhy").value || "").trim();
        if (manDisc > 0 && manReason.length < 3) return { error: "Enter a 3+ character reason for manual counter discount." };
        ncReason = String(document.getElementById("v8NcWhy").value || "").trim();
        if (isNc && ncReason.length < 3) return { error: "Enter a 3+ character reason for NC bill." };
        splitCash = num(document.getElementById("v8SplitCash").value, -1);
        if (mode === "Split" && (splitCash < 0 || splitCash > totAmt)) return { error: "Split Cash part must be between ₹0 and bill total." };
        gstin = String(document.getElementById("v8BuyerGstin").value || "").trim().toUpperCase();
        if (gstin && typeof isValidGstin === "function" && !isValidGstin(gstin)) return { error: "Enter a valid 15-character Buyer GSTIN." };
        legal = String(document.getElementById("v8BuyerLegal").value || "").trim();
        const rmEl = document.getElementById("v8RmSvc");
        removeSvc = !!(rmEl && rmEl.checked);
        const kpEl = document.getElementById("v8KeepKds");
        keepKitchen = !!(kpEl && kpEl.checked);
      }
    });

    if (action === "loyalty") {
      await openLoyaltyOtpDialog({
        orderId: o.id,
        phone: o.customer_phone || "",
        customerName: o.customer_name || "",
        onDone: async () => {
          if (typeof refreshLive === "function") await refreshLive();
          const latest = typeof findOrder === "function" ? findOrder(o.id) : o;
          await openSettleDialog(latest || o, opts);
        }
      });
      return;
    }
    if (action !== "settle") return;

    if (mode === "Khata") {
      try {
        const res = await rpc("v8_khata", { p_restaurant: R.id, p_action: "settle_order", p_payload: {
          khata_id: khataId, order_id: o.id, manual_discount: manDisc, manual_discount_reason: manReason,
          customer_gstin: gstin, customer_legal_name: legal, remove_service_charge: removeSvc,
          keep_kitchen_active: keepKitchen
        }});
        showToast(`Settled to Khata! Invoice: ${res.invoice_no}`, "success");
        if (res.order) printV8GstBill(res.order);
        if (typeof refreshLive === "function") await refreshLive();
        if (typeof S !== "undefined" && S.page === "v8gst") renderGstPage();
      } catch (err) {
        showToast((err && err.message) || "Khata settlement failed", "error");
      }
      return;
    }

    let splits = [];
    if (mode === "Split") {
      const estAfterDisc = Math.max(0, totAmt - manDisc - (removeSvc ? svcAmt : 0));
      const c = Math.min(splitCash, estAfterDisc);
      const u = Math.round(Math.max(0, estAfterDisc - c) * 100) / 100;
      splits = [{ mode: "Cash", amount: c }, { mode: "UPI", amount: u }];
    }
    try {
      const res = await rpc("v8_settle_order", {
        p_restaurant: R.id, p_order_id: o.id, p_mode: mode, p_splits: splits,
        p_is_nc: isNc, p_nc_reason: ncReason, p_customer_gstin: gstin, p_customer_legal_name: legal,
        p_remove_service_charge: removeSvc, p_settle_all: settleAll, p_merge_table: isDineIn && !o.split_locked,
        p_manual_discount: manDisc, p_manual_discount_reason: manReason, p_keep_kitchen_active: keepKitchen
      });
      if (!res || !res.ok) { showToast((res && res.message) || "Settlement failed", "error"); return; }
      const earnNote = num(res.loyalty_earned) > 0 ? ` · +${num(res.loyalty_earned)} pts earned` : "";
      showToast(`Settled! Invoice: ${res.invoice_no}${earnNote}`, "success");
      printV8GstBill(res.order);
      if (typeof refreshLive === "function") await refreshLive();
      if (typeof S !== "undefined" && S.page === "v8gst") renderGstPage();
    } catch (err) {
      showToast((err && err.message) || "Settlement failed", "error");
    }
  }

  async function editOrderDialog(orderId) {
    if (typeof canBill === "function" && !canBill()) return;
    const o = typeof findOrder === "function" ? findOrder(orderId) : null;
    if (!o) return;
    if (o.split_locked) { showToast("Split bill shares cannot have items edited individually.", "error"); return; }
    let menuList = [];
    try { menuList = (await rpc("get_menu", { p_restaurant: R.id })) || []; } catch (_) {}
    const items = (o.cart || []).map((c) => ({
      id: c.id,
      name: c.name,
      variant: c.variant || "full",
      modifier: c.modifier || "",
      addons: Array.isArray(c.addons) ? c.addons : [],
      qty: num(c.qty ?? c.quantity, 1),
      price: num(c.price)
    }));
    let reason = "";

    function renderEditRows() {
      const box = document.getElementById("v8EditList");
      if (!box) return;
      box.innerHTML = items.map((it, idx) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);gap:8px;">
          <div style="font-size:13px;flex:1;"><strong>${esc(it.name)}</strong><div style="font-size:11px;color:var(--muted,#94a3b8);">${money(it.price)} each</div></div>
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" class="secondaryButton" style="padding:3px 9px;" data-ed-dec="${idx}">-</button>
            <strong style="min-width:20px;text-align:center;">${it.qty}</strong>
            <button type="button" class="secondaryButton" style="padding:3px 9px;" data-ed-inc="${idx}">+</button>
            <button type="button" class="secondaryButton" style="padding:3px 8px;color:#f87171;" data-ed-del="${idx}">&times;</button>
          </div>
        </div>`).join("") || `<div class="muted" style="padding:10px 0;">Cart cannot be empty — add an item below or cancel order.</div>`;
    }

    const availMenu = menuList.filter((m) => m.available !== false);
    const choice = await Dialog.open({
      title: `Edit Items — ${esc(o.order_no)} (${o.order_type === "delivery" ? "Delivery" : o.order_type === "pickup" ? "Self-Pickup" : o.order_type === "takeaway" ? "Takeaway" : "Table " + esc(o.table_number)})`,
      body: `<div id="v8EditList" style="max-height:220px;overflow-y:auto;margin-bottom:10px;"></div>
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <select id="v8EditAddSel" class="dlgInput" style="flex:1;margin:0;">
            <option value="">+ Add item to order...</option>
            ${availMenu.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(money(m.price))})</option>`).join("")}
          </select>
          <button type="button" class="secondaryButton" id="v8EditAddBtn">Add</button>
        </div>
        <label class="dlgLabel">Reason for Edit / Void *</label>
        <input id="v8EditWhy" class="dlgInput" maxlength="200" placeholder="e.g. Guest removed 1 item / added extra roti">`,
      buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Save Changes", kind: "primaryButton" }],
      onOpen() {
        renderEditRows();
        const box = document.getElementById("v8EditList");
        if (box) box.addEventListener("click", (ev) => {
          const dec = ev.target.closest("[data-ed-dec]");
          const inc = ev.target.closest("[data-ed-inc]");
          const del = ev.target.closest("[data-ed-del]");
          if (dec) { const i = Number(dec.dataset.edDec); if (items[i].qty > 1) items[i].qty--; else items.splice(i, 1); renderEditRows(); }
          else if (inc) { const i = Number(inc.dataset.edInc); if (items[i].qty < 50) items[i].qty++; renderEditRows(); }
          else if (del) { items.splice(Number(del.dataset.edDel), 1); renderEditRows(); }
        });
        const addBtn = document.getElementById("v8EditAddBtn");
        if (addBtn) addBtn.addEventListener("click", () => {
          const sel = document.getElementById("v8EditAddSel");
          const m = availMenu.find((x) => x.id === (sel && sel.value));
          if (!m) return;
          const ex = items.find((x) => x.id === m.id && x.variant === "full" && !x.modifier && (!x.addons || !x.addons.length));
          if (ex) ex.qty = Math.min(50, ex.qty + 1);
          else items.push({ id: m.id, name: m.name, variant: "full", modifier: "", addons: [], qty: 1, price: num(m.price) });
          sel.value = "";
          renderEditRows();
        });
      },
      onClick(bid) {
        if (bid !== "save") return;
        if (!items.length) return { error: "Order must keep at least 1 item (or cancel the order instead)." };
        reason = String(document.getElementById("v8EditWhy").value || "").trim();
        if (reason.length < 3) return { error: "Enter a 3+ character reason for modifying items." };
      }
    });
    if (choice !== "save") return;
    try {
      const payload = items.map((i) => ({ id: i.id, variant: i.variant || "full", modifier: i.modifier || "", addons: i.addons || [], qty: i.qty }));
      const res = await rpc("v8_edit_order_items", { p_restaurant: R.id, p_order_id: o.id, p_items: payload, p_reason: reason });
      showToast(res && res.ok ? "Order items updated & GST recalculated!" : "Update failed", res && res.ok ? "success" : "error");
      if (typeof refreshLive === "function") await refreshLive();
    } catch (e) {
      showToast((e && e.message) || "Could not edit order items.", "error");
    }
  }

  async function transferTableDialog(orderId) {
    if (typeof canBill === "function" && !canBill()) return;
    const o = typeof findOrder === "function" ? findOrder(orderId) : null;
    if (!o) return;
    if (typeof loadTables === "function" && (!S.tables || !S.tables.length)) await loadTables();
    const tables = (typeof S !== "undefined" && S.tables) ? S.tables : [];
    const others = tables.filter((t) => t.table_number !== o.table_number || o.order_type === "takeaway");
    if (!others.length) { showToast("Add another table on the Tables page first.", "error"); return; }

    let toTable = "", moveAll = o.order_type !== "takeaway";
    const choice = await Dialog.open({
      title: `Transfer Table (${esc(o.order_no)})`,
      body: `<p class="dlgText">Currently: <b>${o.order_type === "takeaway" ? "Takeaway" : "Table " + esc(o.table_number)}</b></p>
        <label class="dlgLabel">Move to Table *</label>
        <select id="v8TrfTarget" class="dlgInput">
          ${others.map((t) => `<option value="${esc(t.table_number)}">Table ${esc(t.table_number)}${t.section ? " (" + esc(t.section) + ")" : ""} &mdash; ${esc(t.status)}</option>`).join("")}
        </select>
        ${o.order_type !== "takeaway" ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-top:10px;"><input type="checkbox" id="v8TrfAll" checked> Move all active orders on Table ${esc(o.table_number)} together</label>` : ""}`,
      buttons: [{ id: "cancel", label: "Cancel" }, { id: "move", label: "Transfer Table", kind: "primaryButton" }],
      onClick(bid) {
        if (bid !== "move") return;
        toTable = document.getElementById("v8TrfTarget").value;
        const chk = document.getElementById("v8TrfAll");
        moveAll = !!(chk && chk.checked);
      }
    });
    if (choice !== "move" || !toTable) return;
    try {
      const res = await rpc("v8_transfer_table", { p_restaurant: R.id, p_order_id: o.id, p_to_table: toTable, p_move_all: moveAll });
      showToast((res && res.message) || "Transferred!", "success");
      if (typeof refreshLive === "function") await refreshLive();
    } catch (e) {
      showToast((e && e.message) || "Could not transfer table.", "error");
    }
  }

  async function splitBillDialog(orderId) {
    if (typeof canBill === "function" && !canBill()) return;
    const o = typeof findOrder === "function" ? findOrder(orderId) : null;
    if (!o) return;
    if (o.split_locked) { showToast("This order is already a split share.", "error"); return; }
    const merged = (o.order_type === "dine_in" && typeof consolidatedTableBill === "function") ? consolidatedTableBill(o) : o;
    const items = Array.isArray(merged.cart) ? merged.cart : [];
    let splitMode = "equal", parts = 2, selections = [];

    const choice = await Dialog.open({
      title: `Split Bill — ${esc(o.order_no)} (${esc(money(merged.total))})`,
      body: `<div style="display:flex;gap:8px;margin-bottom:12px;" id="v8SplitTabs">
          <button type="button" class="primaryButton" data-spt="equal">Split Equally (2&ndash;6)</button>
          <button type="button" class="secondaryButton" data-spt="items">Split by Items</button>
        </div>
        <div id="v8SpEqual">
          <label class="dlgLabel">Split into how many separate bills?</label>
          <select id="v8SplitParts" class="dlgInput">
            ${[2, 3, 4, 5, 6].map((n) => `<option value="${n}">${n} equal bills (~${esc(money(num(merged.total) / n))} each)</option>`).join("")}
          </select>
        </div>
        <div id="v8SpItems" style="display:none;max-height:240px;overflow-y:auto;">
          <p class="dlgText small">Select items &amp; quantities to separate onto <strong>Bill 2</strong>:</p>
          ${items.map((it, idx) => {
            const q = num(it.qty ?? it.quantity, 1);
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);gap:8px;">
              <label style="display:flex;gap:8px;align-items:center;font-size:13px;flex:1;">
                <input type="checkbox" data-sp-chk="${idx}"> <span>${esc(it.name)} (Max ${q})</span>
              </label>
              <input type="number" data-sp-qty="${idx}" min="1" max="${q}" value="${q}" class="dlgInput" style="width:72px;margin:0;padding:4px 6px;">
            </div>`;
          }).join("")}
        </div>
        <p class="dlgText small" style="margin-top:8px;">Each split bill receives its own independent invoice &amp; UPI QR.</p>`,
      buttons: [{ id: "cancel", label: "Cancel" }, { id: "split", label: "Split Bill", kind: "primaryButton" }],
      onOpen() {
        const tabs = document.getElementById("v8SplitTabs");
        if (!tabs) return;
        tabs.addEventListener("click", (ev) => {
          const b = ev.target.closest("[data-spt]"); if (!b) return;
          splitMode = b.dataset.spt;
          tabs.querySelectorAll("[data-spt]").forEach((x) => { x.className = x === b ? "primaryButton" : "secondaryButton"; });
          document.getElementById("v8SpEqual").style.display = splitMode === "equal" ? "block" : "none";
          document.getElementById("v8SpItems").style.display = splitMode === "items" ? "block" : "none";
        });
      },
      onClick(bid) {
        if (bid !== "split") return;
        if (splitMode === "equal") {
          parts = Math.max(2, Math.min(6, Number(document.getElementById("v8SplitParts").value || 2)));
        } else {
          selections = [];
          items.forEach((it, idx) => {
            const chk = document.querySelector(`[data-sp-chk="${idx}"]`);
            const qIn = document.querySelector(`[data-sp-qty="${idx}"]`);
            if (chk && chk.checked) {
              const take = Math.max(1, Math.min(num(it.qty ?? it.quantity, 1), Math.floor(num(qIn && qIn.value, 1))));
              selections.push({ index: idx, qty: take });
            }
          });
          if (!selections.length) return { error: "Select at least 1 item to move onto Bill 2." };
        }
      }
    });
    if (choice !== "split") return;
    try {
      if (splitMode === "equal") {
        const res = await rpc("v8_split_bill", { p_restaurant: R.id, p_order_id: o.id, p_parts: parts });
        showToast(`Split into ${res.parts} independent bills!`, "success");
      } else {
        await rpc("v8_split_bill_by_items", { p_restaurant: R.id, p_order_id: o.id, p_selections: selections });
        showToast("Split into Bill 1 & Bill 2 by selected items!", "success");
      }
      if (typeof refreshLive === "function") await refreshLive();
      if (typeof S !== "undefined" && S.page === "v8gst") renderGstPage();
    } catch (e) {
      showToast((e && e.message) || "Could not split bill.", "error");
    }
  }

  // --- QUICK COUNTER POS PAGE ---
  const POS_STATE = { menu: [], cat: "All", q: "", orderType: "dine_in", table: "", phone: "", name: "", address: "", coupon: "", manDisc: 0, manReason: "", notes: "", printKot: true, cart: [], loaded: false, busy: false };

  function posEstimate() {
    const regime = V8_META.tax_regime || "regular_5";
    const gstRateFallback = num(R.gst, 5);
    let sub = 0, offerDisc = 0;
    POS_STATE.cart.forEach((l) => {
      sub += l.unitBase * l.qty;
      offerDisc += Math.max(0, l.unitBase - l.unitPrice) * l.qty;
    });
    const afterOffer = Math.max(0, sub - offerDisc);
    const manD = Math.min(num(POS_STATE.manDisc, 0), afterOffer);
    const afterDisc = Math.max(0, afterOffer - manD);
    const ratio = afterOffer > 0 ? Math.max(0, afterDisc / afterOffer) : 0;
    let pkg = 0, svc = 0;
    if (POS_STATE.orderType !== "dine_in") {
      if (V8_META.packaging_charge_type === "flat") pkg = num(V8_META.packaging_charge, 0);
      else if (V8_META.packaging_charge_type === "per_item") pkg = num(V8_META.packaging_charge, 0) * POS_STATE.cart.reduce((s, x) => s + x.qty, 0);
    } else if (num(V8_META.service_charge_percent, 0) > 0) {
      svc = Math.round(afterDisc * num(V8_META.service_charge_percent, 0)) / 100;
    }
    let gst = 0;
    if (regime !== "composition" && regime !== "unregistered") {
      POS_STATE.cart.forEach((l) => {
        const lineAfterOffer = l.unitPrice * l.qty;
        const rate = typeof effectiveGstRate === "function" ? effectiveGstRate(l.gstRate, regime, gstRateFallback) : (regime === "specified_18" ? 18 : num(l.gstRate, gstRateFallback));
        gst += (lineAfterOffer * ratio) * (rate / 100);
      });
      gst += (pkg + svc) * ((regime === "specified_18" ? 18 : gstRateFallback) / 100);
    }
    const taxable = Math.max(0, afterDisc + pkg + svc);
    const total = Math.round(taxable + gst);
    return { sub, offerDisc, manD, pkg, svc, gst: Math.round(gst * 100) / 100, taxable, total };
  }
  const posEstHtml = (e) => `<div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${money(e.sub)}</span></div>
    ${e.offerDisc > 0 ? `<div style="display:flex;justify-content:space-between;color:#34d399;"><span>Menu Offers</span><span>-${money(e.offerDisc)}</span></div>` : ""}
    ${e.manD > 0 ? `<div style="display:flex;justify-content:space-between;color:#fbbf24;"><span>Counter Disc</span><span>-${money(e.manD)}</span></div>` : ""}
    ${e.pkg > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Packaging</span><span>${money(e.pkg)}</span></div>` : ""}
    ${e.svc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Service Charge</span><span>${money(e.svc)}</span></div>` : ""}
    ${e.gst > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Est. GST</span><span>${money(e.gst)}</span></div>` : ""}
    <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:900;margin-top:4px;"><span>Est. Total</span><span>${money(e.total)}</span></div>`;

  async function renderPosPage() {
    const el = document.getElementById("v8pos");
    if (!el || (typeof canBill === "function" && !canBill())) return;
    await loadV8Meta();
    if (!POS_STATE.loaded || (Date.now() - (POS_STATE.loadedAt || 0)) > 120000) {
      try { POS_STATE.menu = (await rpc("get_menu", { p_restaurant: R.id })) || []; POS_STATE.loaded = true; POS_STATE.loadedAt = Date.now(); } catch (_) {}
    }
    if (typeof loadTables === "function" && (!S.tables || !S.tables.length)) await loadTables();
    let heldList = [];
    try { const hr = await rpc("v8_hold_order", { p_restaurant: R.id, p_action: "list" }); heldList = (hr && hr.held) || []; } catch (_) {}
    const tables = (typeof S !== "undefined" && Array.isArray(S.tables)) ? S.tables : [];
    if (!POS_STATE.table && tables.length) POS_STATE.table = tables[0].table_number;
    const avail = POS_STATE.menu.filter((m) => m.available !== false);
    const cats = ["All", ...Array.from(new Set(avail.map((m) => m.category || "Menu")))];
    if (!cats.includes(POS_STATE.cat)) POS_STATE.cat = "All";
    const ql = POS_STATE.q.trim().toLowerCase();
    const shown = avail.filter((m) => (POS_STATE.cat === "All" || (m.category || "Menu") === POS_STATE.cat) && (!ql || m.name.toLowerCase().includes(ql) || (m.category || "").toLowerCase().includes(ql)));

    const secMap = new Map();
    tables.forEach((t) => {
      const s = t.section || "Main";
      if (!secMap.has(s)) secMap.set(s, []);
      secMap.get(s).push(t);
    });
    const est = posEstimate();
    const tokenUrl = `token.html?restaurant=${encodeURIComponent(R.slug)}`;

    el.innerHTML = `
      ${heldList.length ? `<div style="${cardStyle()}display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;">
        <strong style="font-size:12.5px;"><i class="fa-solid fa-pause"></i> Held Bills (${heldList.length}):</strong>
        ${heldList.map((h) => `<span class="v8Pill" style="display:inline-flex;gap:6px;align-items:center;">
          <button type="button" class="secondaryButton" style="padding:2px 8px;font-size:11.5px;" data-pos-recall="${esc(h.id)}">${esc(h.label)} (${(h.cart || []).reduce((s, x) => s + num(x.qty, 1), 0)})</button>
          <button type="button" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:13px;" data-pos-delheld="${esc(h.id)}" title="Discard">&times;</button>
        </span>`).join("")}
      </div>` : ""}
      <div class="v8PosLayout">
        <div>
          <div style="${cardStyle()}display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="${POS_STATE.orderType === "dine_in" ? "primaryButton" : "secondaryButton"}" data-pos-otype="dine_in"><i class="fa-solid fa-chair"></i> Dine-In</button>
              <button type="button" class="${POS_STATE.orderType === "takeaway" ? "primaryButton" : "secondaryButton"}" data-pos-otype="takeaway"><i class="fa-solid fa-bag-shopping"></i> Takeaway / Parcel</button>
              <button type="button" class="${POS_STATE.orderType === "delivery" ? "primaryButton" : "secondaryButton"}" data-pos-otype="delivery"><i class="fa-solid fa-motorcycle"></i> Delivery</button>
              <a href="${esc(tokenUrl)}" target="_blank" rel="noopener noreferrer" class="secondaryButton" style="text-decoration:none;display:inline-flex;align-items:center;gap:5px;" title="Open QSR Order-Ready Display TV"><i class="fa-solid fa-tv"></i> QSR TV</a>
            </div>
            ${POS_STATE.orderType === "dine_in" ? `
              <select class="field" id="v8PosTable" style="width:auto;min-width:170px;margin:0;">
                ${Array.from(secMap.entries()).map(([sec, list]) => `<optgroup label="${esc(sec)}">${list.map((t) => `<option value="${esc(t.table_number)}" ${t.table_number === POS_STATE.table ? "selected" : ""}>Table ${esc(t.table_number)}${t.status === "Occupied" ? " (Occupied)" : ""}</option>`).join("")}</optgroup>`).join("") || `<option value="1">Table 1</option>`}
              </select>` : `<span class="v8Pill">${POS_STATE.orderType === "delivery" ? "Phone Home Delivery" : "Counter Takeaway Parcel"}</span>`}
            <input class="field" id="v8PosSearch" type="search" value="${esc(POS_STATE.q)}" placeholder="Search dish..." style="flex:1;min-width:160px;margin:0;">
          </div>
          <div class="v8ChipRow" style="margin-bottom:10px;">
            ${cats.map((c) => `<button type="button" class="${POS_STATE.cat === c ? "primaryButton" : "secondaryButton"}" style="padding:5px 11px;font-size:12px;" data-pos-cat="${esc(c)}">${esc(c)}</button>`).join("")}
          </div>
          <div class="v8PosMenuGrid">
            ${shown.map((m) => {
              const hasCustom = m.half_price != null || (Array.isArray(m.modifiers) && m.modifiers.length) || (Array.isArray(m.addons) && m.addons.length);
              return `<button type="button" class="v8PosItemBtn" data-pos-add="${esc(m.id)}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;">
                  <strong style="font-size:13px;line-height:1.25;">${m.veg === false ? "🔴" : "🟢"} ${esc(m.name)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--accent,#c5a880);">
                  <span>${esc(money(m.price))}${m.half_price != null ? " / " + esc(money(m.half_price)) : ""}</span>
                  ${hasCustom ? `<span class="v8Pill">Custom</span>` : ""}
                </div>
              </button>`;
            }).join("") || `<div class="muted">No matching dishes.</div>`}
          </div>
        </div>

        <div class="v8PosCartBox">
          <h3 style="margin:0 0 10px;"><i class="fa-solid fa-receipt"></i> Counter Order Pad</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
            <input class="field" id="v8PosPhone" type="tel" maxlength="10" value="${esc(POS_STATE.phone)}" placeholder="Guest Mobile (10-digit)" style="margin:0;">
            <input class="field" id="v8PosName" maxlength="60" value="${esc(POS_STATE.name)}" placeholder="Guest Name (Walk-in)" style="margin:0;">
          </div>
          <div id="v8PosGuestHint" style="font-size:11px;color:var(--muted,#94a3b8);margin-bottom:8px;"></div>
          ${POS_STATE.orderType === "delivery" ? `<input class="field" id="v8PosAddr" maxlength="250" value="${esc(POS_STATE.address)}" placeholder="Delivery Address (Flat/House No., Street, Landmark) *" style="margin-bottom:8px;">` : ""}
          <div style="max-height:240px;overflow-y:auto;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:6px 0;margin-bottom:8px;">
            ${POS_STATE.cart.map((l, idx) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;gap:6px;font-size:12.5px;border-bottom:1px dashed var(--border);">
                <div style="flex:1;"><strong>${esc(l.label)}</strong><div style="font-size:11px;color:var(--muted,#94a3b8);">${money(l.unitPrice)} &times; ${l.qty} = ${money(l.unitPrice * l.qty)}</div></div>
                <div style="display:flex;align-items:center;gap:4px;">
                  <button type="button" class="secondaryButton" style="padding:2px 7px;" data-pos-dec="${idx}">-</button>
                  <span>${l.qty}</span>
                  <button type="button" class="secondaryButton" style="padding:2px 7px;" data-pos-inc="${idx}">+</button>
                </div>
              </div>`).join("") || `<div style="padding:18px 0;text-align:center;color:var(--muted,#94a3b8);font-size:12.5px;">Click any dish to add it here.</div>`}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
            <input class="field" id="v8PosCoupon" value="${esc(POS_STATE.coupon)}" placeholder="Coupon Code" style="text-transform:uppercase;margin:0;">
            <input class="field" id="v8PosManDisc" type="number" min="0" step="1" value="${POS_STATE.manDisc || ""}" placeholder="Manual Disc ₹" style="margin:0;">
          </div>
          <input class="field" id="v8PosManWhy" value="${esc(POS_STATE.manReason)}" placeholder="Discount reason (required if > ₹0)" style="margin-bottom:6px;">
          <input class="field" id="v8PosNotes" value="${esc(POS_STATE.notes)}" placeholder="Kitchen notes (less spicy, etc.)" style="margin-bottom:8px;">
          <div id="v8PosEstBox" style="font-size:12px;line-height:1.6;margin-bottom:10px;border-top:1px solid var(--border);padding-top:6px;">${posEstHtml(est)}</div>
          <label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-bottom:8px;"><input type="checkbox" id="v8PosKotChk" ${POS_STATE.printKot ? "checked" : ""}> Auto-print KOT on submit</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button type="button" class="primaryButton" id="v8PosPlaceBtn" ${!POS_STATE.cart.length ? "disabled" : ""}>Place KOT</button>
            <button type="button" class="secondaryButton" id="v8PosSettleBtn" ${!POS_STATE.cart.length ? "disabled" : ""}>Place &amp; Settle</button>
          </div>
          ${POS_STATE.cart.length ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
            <button type="button" class="secondaryButton" id="v8PosHoldBtn" style="padding:6px;font-size:12px;"><i class="fa-solid fa-pause"></i> Hold Bill</button>
            <button type="button" class="secondaryButton" id="v8PosClearBtn" style="padding:6px;font-size:12px;">Clear Cart</button>
          </div>` : ""}
        </div>
      </div>`;

    el.querySelectorAll("[data-pos-otype]").forEach((b) => b.addEventListener("click", () => { POS_STATE.orderType = b.dataset.posOtype; renderPosPage(); }));
    el.querySelectorAll("[data-pos-cat]").forEach((b) => b.addEventListener("click", () => { POS_STATE.cat = b.dataset.posCat; renderPosPage(); }));
    const tSel = document.getElementById("v8PosTable");
    if (tSel) tSel.addEventListener("change", () => { POS_STATE.table = tSel.value; });
    const sIn = document.getElementById("v8PosSearch");
    if (sIn) {
      if (POS_STATE.searching) { sIn.focus(); sIn.setSelectionRange(sIn.value.length, sIn.value.length); POS_STATE.searching = false; }
      sIn.addEventListener("input", debounce((ev) => { POS_STATE.q = ev.target.value; POS_STATE.searching = true; renderPosPage(); }, 180));
    }
    const phIn = document.getElementById("v8PosPhone");
    if (phIn) phIn.addEventListener("input", async () => {
      POS_STATE.phone = phIn.value.replace(/\D/g, "").slice(0, 10);
      phIn.value = POS_STATE.phone;
      const hint = document.getElementById("v8PosGuestHint");
      if (POS_STATE.phone.length === 10) {
        try {
          const lk = await rpc("v8_lookup_customer_by_phone", { p_restaurant: R.id, p_phone: POS_STATE.phone });
          const cust = (lk && lk.found) ? (lk.customer || lk) : null;
          if (cust) {
            if (!POS_STATE.name) {
              POS_STATE.name = cust.name || "";
              const nIn = document.getElementById("v8PosName");
              if (nIn) nIn.value = POS_STATE.name;
            }
            if (hint) hint.textContent = `Returning guest: ${cust.name} · ⭐ ${num(cust.loyalty_points)} pts (${num(cust.visit_count)} visits)`;
          } else if (hint) hint.textContent = "New guest — profile will be saved.";
        } catch (_) {}
      } else if (hint) hint.textContent = "";
    });
    const nmIn = document.getElementById("v8PosName");
    if (nmIn) nmIn.addEventListener("input", () => { POS_STATE.name = nmIn.value; });
    const adIn = document.getElementById("v8PosAddr");
    if (adIn) adIn.addEventListener("input", () => { POS_STATE.address = adIn.value; });
    const cpIn = document.getElementById("v8PosCoupon");
    if (cpIn) cpIn.addEventListener("input", () => { POS_STATE.coupon = cpIn.value.toUpperCase().trim(); });
    const mdIn = document.getElementById("v8PosManDisc");
    if (mdIn) mdIn.addEventListener("input", () => {
      POS_STATE.manDisc = Math.max(0, num(mdIn.value, 0));
      const eb = document.getElementById("v8PosEstBox");
      if (eb) eb.innerHTML = posEstHtml(posEstimate());
    });
    const mwIn = document.getElementById("v8PosManWhy");
    if (mwIn) mwIn.addEventListener("input", () => { POS_STATE.manReason = mwIn.value; });
    const ntIn = document.getElementById("v8PosNotes");
    if (ntIn) ntIn.addEventListener("input", () => { POS_STATE.notes = ntIn.value; });
    const kotChk = document.getElementById("v8PosKotChk");
    if (kotChk) kotChk.addEventListener("change", () => { POS_STATE.printKot = kotChk.checked; });

    function pushPosLine(m, variant, modifier, addons, qty) {
      const addonList = Array.isArray(addons) ? addons : [];
      const addonSum = addonList.reduce((s, a) => s + num(a.price, 0), 0);
      const baseFood = variant === "half" ? num(m.base_half_price ?? m.half_price, m.price) : num(m.base_price ?? m.price);
      const sellFood = variant === "half" ? num(m.half_price, m.price) : num(m.price);
      const unitBase = baseFood + addonSum;
      const unitPrice = sellFood + addonSum;
      const addonNames = addonList.map((a) => a.name).sort();
      const key = `${m.id}__${variant}__${modifier || ""}__${addonNames.join(",")}`;
      const label = m.name + (variant === "half" ? " (Half)" : m.half_price != null ? " (Full)" : "") + (modifier ? ` [${modifier}]` : "") + (addonNames.length ? ` (+ ${addonNames.join(", ")})` : "");
      const ex = POS_STATE.cart.find((l) => l.key === key);
      if (ex) ex.qty = Math.min(50, ex.qty + qty);
      else POS_STATE.cart.push({ key, id: m.id, variant, modifier: modifier || "", addons: addonList.map((a) => a.name), label, unitBase, unitPrice, gstRate: m.gst_rate, qty });
      renderPosPage();
    }

    el.querySelectorAll("[data-pos-add]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const m = avail.find((x) => x.id === btn.dataset.posAdd);
        if (!m) return;
        const mods = Array.isArray(m.modifiers) ? m.modifiers : [];
        const adds = Array.isArray(m.addons) ? m.addons : [];
        if (m.half_price == null && !mods.length && !adds.length) {
          pushPosLine(m, "full", "", [], 1);
          return;
        }
        let variant = "full", modifier = mods[0] || "";
        const selAdds = new Set();
        const res = await Dialog.open({
          title: m.name,
          body: `
            ${m.half_price != null ? `<label class="dlgLabel">Portion</label><div style="display:flex;gap:8px;margin:6px 0 10px;" id="v8PosVarRow">
              <button type="button" class="primaryButton" data-pv="full">Full (${esc(money(m.price))})</button>
              <button type="button" class="secondaryButton" data-pv="half">Half (${esc(money(m.half_price))})</button>
            </div>` : ""}
            ${mods.length ? `<label class="dlgLabel">Option</label><div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px;" id="v8PosModRow">
              ${mods.map((md, idx) => `<button type="button" class="${idx === 0 ? "primaryButton" : "secondaryButton"}" style="padding:5px 10px;font-size:12px;" data-pm="${esc(md)}">${esc(md)}</button>`).join("")}
            </div>` : ""}
            ${adds.length ? `<label class="dlgLabel">Paid Add-ons</label><div style="margin:6px 0 10px;" id="v8PosAddRow">
              ${adds.map((ad, idx) => `<label style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span><input type="checkbox" data-pa="${idx}"> ${esc(ad.name)}</span><strong>+${esc(money(ad.price))}</strong></label>`).join("")}
            </div>` : ""}`,
          buttons: [{ id: "cancel", label: "Cancel" }, { id: "add", label: "Add to Order", kind: "primaryButton" }],
          onOpen() {
            const vr = document.getElementById("v8PosVarRow");
            if (vr) vr.addEventListener("click", (ev) => {
              const b = ev.target.closest("[data-pv]"); if (!b) return;
              variant = b.dataset.pv;
              vr.querySelectorAll("[data-pv]").forEach((x) => { x.className = x === b ? "primaryButton" : "secondaryButton"; });
            });
            const mr = document.getElementById("v8PosModRow");
            if (mr) mr.addEventListener("click", (ev) => {
              const b = ev.target.closest("[data-pm]"); if (!b) return;
              modifier = b.dataset.pm;
              mr.querySelectorAll("[data-pm]").forEach((x) => { x.className = x === b ? "primaryButton" : "secondaryButton"; });
            });
            const ar = document.getElementById("v8PosAddRow");
            if (ar) ar.addEventListener("change", (ev) => {
              const c = ev.target.closest("[data-pa]"); if (!c) return;
              const idx = Number(c.dataset.pa);
              if (c.checked) selAdds.add(idx); else selAdds.delete(idx);
            });
          }
        });
        if (res === "add") pushPosLine(m, variant, modifier, Array.from(selAdds).map((i) => adds[i]), 1);
      });
    });

    el.querySelectorAll("[data-pos-dec]").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.posDec);
      if (POS_STATE.cart[i].qty > 1) POS_STATE.cart[i].qty--; else POS_STATE.cart.splice(i, 1);
      renderPosPage();
    }));
    el.querySelectorAll("[data-pos-inc]").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.posInc);
      if (POS_STATE.cart[i].qty < 50) POS_STATE.cart[i].qty++;
      renderPosPage();
    }));
    const clrBtn = document.getElementById("v8PosClearBtn");
    if (clrBtn) clrBtn.addEventListener("click", () => { POS_STATE.cart = []; POS_STATE.coupon = ""; POS_STATE.manDisc = 0; POS_STATE.manReason = ""; POS_STATE.address = ""; renderPosPage(); });

    async function submitPosOrder(andSettle) {
      if (!POS_STATE.cart.length || POS_STATE.busy) return;
      if (POS_STATE.manDisc > 0 && POS_STATE.manReason.trim().length < 3) {
        showToast("Enter a 3+ character reason for manual counter discount.", "error");
        return;
      }
      if (POS_STATE.phone && POS_STATE.phone.length !== 10) {
        showToast("Enter a full 10-digit mobile number or leave it blank.", "error");
        return;
      }
      if (POS_STATE.orderType === "delivery") {
        if (POS_STATE.phone.length !== 10) { showToast("Enter 10-digit mobile number for delivery.", "error"); return; }
        if (POS_STATE.address.trim().length < 8) { showToast("Enter full delivery address (min 8 chars).", "error"); return; }
      }
      if (POS_STATE.coupon && POS_STATE.phone.length !== 10) {
        showToast("Enter guest 10-digit mobile number to apply a coupon.", "error");
        return;
      }
      POS_STATE.busy = true;
      const pBtnEl = document.getElementById("v8PosPlaceBtn"), sBtnEl = document.getElementById("v8PosSettleBtn");
      if (pBtnEl) pBtnEl.disabled = true;
      if (sBtnEl) sBtnEl.disabled = true;
      try {
        const res = await rpc("v8_staff_place_order", {
          p_restaurant: R.id,
          p_table: POS_STATE.orderType === "delivery" ? "DELIVERY" : POS_STATE.orderType === "takeaway" ? "TAKEAWAY" : (POS_STATE.table || "1"),
          p_order_type: POS_STATE.orderType,
          p_items: POS_STATE.cart.map((l) => ({ id: l.id, variant: l.variant, modifier: l.modifier, addons: l.addons, qty: l.qty })),
          p_customer_name: POS_STATE.name.trim() || "Walk-in Guest",
          p_phone: POS_STATE.phone,
          p_notes: POS_STATE.notes.trim(),
          p_coupon_code: POS_STATE.coupon,
          p_manual_discount: POS_STATE.manDisc,
          p_manual_discount_reason: POS_STATE.manReason.trim(),
          p_delivery_address: POS_STATE.orderType === "delivery" ? POS_STATE.address.trim() : ""
        });
        if (!res || !res.ok || !res.order) { showToast("Order failed.", "error"); return; }
        showToast(`Order ${res.order.order_no} (${res.order.kot_no}) placed!`, "success");
        if (POS_STATE.printKot && typeof printHtml === "function" && typeof kotHtml === "function") printHtml(kotHtml(res.order));
        POS_STATE.cart = []; POS_STATE.coupon = ""; POS_STATE.manDisc = 0; POS_STATE.manReason = ""; POS_STATE.notes = ""; POS_STATE.address = "";
        if (typeof refreshLive === "function") await refreshLive();
        loadV8Extras();
        renderPosPage();
        if (andSettle) await openSettleDialog(res.order, { keepKitchenActive: true });
      } catch (e) {
        showToast((e && e.message) || "Could not place order.", "error");
      } finally {
        POS_STATE.busy = false;
        if (pBtnEl) pBtnEl.disabled = !POS_STATE.cart.length;
        if (sBtnEl) sBtnEl.disabled = !POS_STATE.cart.length;
      }
    }
    const pBtn = document.getElementById("v8PosPlaceBtn");
    if (pBtn) pBtn.addEventListener("click", () => submitPosOrder(false));
    const sBtn = document.getElementById("v8PosSettleBtn");
    if (sBtn) sBtn.addEventListener("click", () => submitPosOrder(true));
    const holdBtn = document.getElementById("v8PosHoldBtn");
    if (holdBtn) holdBtn.addEventListener("click", async () => {
      if (!POS_STATE.cart.length) return;
      const lbl = await Dialog.prompt({ title: "Hold Current Bill", label: "Label (e.g. Guest in blue shirt / Phone order)", value: POS_STATE.name || (POS_STATE.orderType === "delivery" ? "Delivery Hold" : POS_STATE.orderType === "takeaway" ? "Takeaway Hold" : "Table " + POS_STATE.table), maxlength: 60 });
      if (!lbl) return;
      try {
        await rpc("v8_hold_order", { p_restaurant: R.id, p_action: "save", p_payload: { label: lbl, order_type: POS_STATE.orderType, table_number: POS_STATE.table, customer_name: POS_STATE.name, customer_phone: POS_STATE.phone, notes: POS_STATE.notes, coupon_code: POS_STATE.coupon, manual_discount: POS_STATE.manDisc, manual_discount_reason: POS_STATE.manReason, cart: POS_STATE.cart } });
        POS_STATE.cart = []; POS_STATE.name = ""; POS_STATE.phone = ""; POS_STATE.coupon = ""; POS_STATE.manDisc = 0; POS_STATE.manReason = ""; POS_STATE.notes = ""; POS_STATE.address = "";
        showToast("Bill placed on hold!", "success");
        renderPosPage();
      } catch (e) { showToast((e && e.message) || "Failed to hold bill.", "error"); }
    });
    el.querySelectorAll("[data-pos-recall]").forEach((btn) => btn.addEventListener("click", async () => {
      if (POS_STATE.cart.length > 0 && !(await Dialog.confirm("Replace your current POS cart with this held bill?", { confirmText: "Recall Bill" }))) return;
      try {
        const res = await rpc("v8_hold_order", { p_restaurant: R.id, p_action: "recall", p_payload: { id: btn.dataset.posRecall } });
        const h = res && res.held;
        if (!h) { showToast("Held bill already recalled.", "info"); renderPosPage(); return; }
        POS_STATE.orderType = h.order_type || "dine_in"; POS_STATE.table = h.table_number || POS_STATE.table;
        POS_STATE.name = h.customer_name || ""; POS_STATE.phone = h.customer_phone || "";
        POS_STATE.notes = h.notes || ""; POS_STATE.coupon = h.coupon_code || "";
        POS_STATE.manDisc = num(h.manual_discount, 0); POS_STATE.manReason = h.manual_discount_reason || "";
        POS_STATE.cart = Array.isArray(h.cart) ? h.cart : [];
        showToast("Recalled held bill!", "info");
        renderPosPage();
      } catch (e) { showToast((e && e.message) || "Could not recall held bill.", "error"); renderPosPage(); }
    }));
    el.querySelectorAll("[data-pos-delheld]").forEach((btn) => btn.addEventListener("click", async () => {
      if (!(await Dialog.confirm("Discard this held bill?", { danger: true, confirmText: "Discard" }))) return;
      try { await rpc("v8_hold_order", { p_restaurant: R.id, p_action: "delete", p_payload: { id: btn.dataset.posDelheld } }); renderPosPage(); }
      catch (e) { showToast((e && e.message) || "Failed to discard.", "error"); }
    }));
  }

  // --- WAITLIST & TABLE RESERVATIONS DIALOG ---
  async function openReservationsDialog() {
    if (typeof canBill === "function" && !canBill()) return;
    if (typeof loadTables === "function" && (!S.tables || !S.tables.length)) await loadTables();
    const res = await rpc("v8_reservations", { p_restaurant: R.id, p_action: "list" }).catch(() => ({ reservations: [] }));
    const list = (res && res.reservations) || [];
    const tables = (typeof S !== "undefined" && Array.isArray(S.tables)) ? S.tables : [];
    const action = await Dialog.open({
      title: "Waitlist & Table Reservations", wide: true,
      body: `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:10px;">
          <input id="resName" class="dlgInput" maxlength="60" placeholder="Guest Name *">
          <input id="resPhone" class="dlgInput" maxlength="10" placeholder="Mobile (10-digit)">
          <input id="resPax" class="dlgInput" type="number" min="1" max="50" value="2" placeholder="Pax">
          <select id="resTbl" class="dlgInput"><option value="">Waitlist (No table yet)</option>${tables.map((t) => `<option value="${esc(t.table_number)}">Table ${esc(t.table_number)} (${esc(t.section || "Main")})</option>`).join("")}</select>
          <input id="resTime" class="dlgInput" type="datetime-local">
          <button type="button" class="primaryButton" id="resAddBtn">+ Add</button>
        </div>
        <div id="resListBox" style="max-height:280px;overflow-y:auto;">
          ${list.length ? `<table style="width:100%;font-size:12.5px;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--border);text-align:left;"><th style="padding:5px;">Guest</th><th>Pax</th><th>Table</th><th>When</th><th>Status</th><th style="text-align:right;">Action</th></tr></thead>
            <tbody>${list.map((r) => `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:5px;"><strong>${esc(r.guest_name)}</strong>${r.guest_phone ? `<div style="font-size:11px;color:var(--muted);">${esc(r.guest_phone)}</div>` : ""}</td>
              <td>${num(r.party_size, 2)}</td>
              <td>${r.table_number ? "T" + esc(r.table_number) : "Waitlist"}</td>
              <td>${esc(fmtDateTime(r.reserved_for))}</td>
              <td><span class="v8Pill">${esc(r.status)}</span></td>
              <td style="text-align:right;white-space:nowrap;">
                ${["waiting", "confirmed"].includes(r.status) ? `<button type="button" class="primaryButton" style="padding:3px 7px;font-size:11px;" data-res-st="seated" data-res-id="${esc(r.id)}">Seat</button> <button type="button" class="secondaryButton" style="padding:3px 7px;font-size:11px;" data-res-st="cancelled" data-res-id="${esc(r.id)}">Cancel</button>` : ""}
              </td>
            </tr>`).join("")}</tbody>
          </table>` : `<p class="dlgText">No active reservations or waiting guests.</p>`}
        </div>`,
      buttons: [{ id: "close", label: "Close", kind: "primaryButton" }],
      onOpen() {
        const addBtn = document.getElementById("resAddBtn");
        if (addBtn) addBtn.addEventListener("click", async () => {
          const nm = String(document.getElementById("resName").value || "").trim();
          if (!nm) { showToast("Enter guest name.", "error"); return; }
          try {
            await rpc("v8_reservations", { p_restaurant: R.id, p_action: "create", p_payload: {
              guest_name: nm, guest_phone: document.getElementById("resPhone").value,
              party_size: num(document.getElementById("resPax").value, 2),
              table_number: document.getElementById("resTbl").value,
              reserved_for: document.getElementById("resTime").value || "",
              status: document.getElementById("resTbl").value ? "confirmed" : "waiting"
            }});
            showToast("Added!", "success");
            Dialog.close(null);
            openReservationsDialog();
          } catch (e) { showToast((e && e.message) || "Failed.", "error"); }
        });
        if (lbox) lbox.addEventListener("click", async (ev) => {
          const b = ev.target.closest("[data-res-id]"); if (!b) return;
          try {
            await rpc("v8_reservations", { p_restaurant: R.id, p_action: "status", p_payload: { id: b.dataset.resId, status: b.dataset.resSt } });
            const r = list.find((x) => x.id === b.dataset.resId);
            if (b.dataset.resSt === "seated" && r) {
              POS_STATE.orderType = "dine_in";
              if (r.table_number) POS_STATE.table = r.table_number;
              if (r.guest_name) POS_STATE.name = r.guest_name;
              if (r.guest_phone) POS_STATE.phone = r.guest_phone;
              Dialog.close(null);
              showToast(`Seated ${r.guest_name}${r.table_number ? " at Table " + r.table_number : ""}! Opening POS...`, "success");
              if (typeof switchPage === "function") switchPage("v8pos");
              return;
            }
            Dialog.close(null);
            openReservationsDialog();
          } catch (e) { showToast((e && e.message) || "Update failed.", "error"); }
        });
      }
    });
    return action;
  }

  // --- INVENTORY, RECIPES & EXPENSES PAGE (ADMIN ONLY) ---
  async function renderInvPage() {
    const el = document.getElementById("v8inv");
    if (!el || (typeof isAdmin === "function" && !isAdmin())) return;
    const today = businessDateNow();
    const firstDay = today.slice(0, 8) + "01";
    const [invRes, expRes, menuList] = await Promise.all([
      rpc("v8_inventory", { p_restaurant: R.id, p_action: "list" }).catch(() => ({ items: [], recipes: [], movements: [] })),
      rpc("v8_expenses", { p_restaurant: R.id, p_action: "list", p_payload: { from: firstDay, to: today } }).catch(() => ({ expenses: [] })),
      rpc("get_menu", { p_restaurant: R.id }).catch(() => [])
    ]);
    const items = (invRes && invRes.items) || [];
    const recipes = (invRes && invRes.recipes) || [];
    const movs = (invRes && invRes.movements) || [];
    const exps = (expRes && expRes.expenses) || [];

    el.innerHTML = `
      <div class="v8CrmGrid">
        <div style="${cardStyle()}">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
            <h3 style="margin:0;"><i class="fa-solid fa-boxes-stacked"></i> Raw Materials &amp; Stock (${items.length})</h3>
            <div style="display:flex;gap:6px;">
              <button type="button" class="secondaryButton" id="v8InvRecBtn">Map Recipe (BOM)</button>
              <button type="button" class="primaryButton" id="v8InvAddBtn">+ Add Raw Material</button>
            </div>
          </div>
          ${items.length ? `<div style="overflow-x:auto;"><table style="width:100%;font-size:12.5px;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--border);text-align:left;"><th style="padding:6px;">Material</th><th>Stock</th><th>Min Alert</th><th>Avg Cost</th><th style="text-align:right;">Actions</th></tr></thead>
            <tbody>${items.map((i) => {
              const low = num(i.current_stock) <= num(i.min_stock);
              return `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:6px;"><strong>${esc(i.name)}</strong><div style="font-size:11px;color:var(--muted);">${esc(i.category)}</div></td>
                <td style="font-weight:700;color:${low ? "#f87171" : "#34d399"};">${num(i.current_stock)} ${esc(i.unit)}</td>
                <td>${num(i.min_stock)} ${esc(i.unit)}</td>
                <td>${money(i.avg_cost)}/${esc(i.unit)}</td>
                <td style="text-align:right;white-space:nowrap;">
                  <button type="button" class="primaryButton" style="padding:3px 8px;font-size:11px;" data-inv-mv="${esc(i.id)}" data-inv-t="purchase">+ Purchase</button>
                  <button type="button" class="secondaryButton" style="padding:3px 8px;font-size:11px;" data-inv-mv="${esc(i.id)}" data-inv-t="wastage">Wastage</button>
                </td>
              </tr>`;
            }).join("")}</tbody>
          </table></div>` : `<p class="muted">Add ingredients like Paneer, Oil, Cheese, Milk, Coke Cans to start live recipe stock deduction.</p>`}
          ${recipes.length ? `<details style="margin-top:12px;font-size:12px;"><summary style="cursor:pointer;color:var(--muted);">Mapped Dish Recipes (${recipes.length} links)</summary>
            <div style="margin-top:6px;">${recipes.map((r) => `<div style="padding:3px 0;border-bottom:1px dashed var(--border);"><strong>${esc(r.menu_name)} (${esc(r.variant)})</strong> &rarr; ${num(r.qty_required)} ${esc(r.unit)} ${esc(r.inv_name)}</div>`).join("")}</div>
          </details>` : ""}
        </div>

        <div style="${cardStyle()}">
          <h3 style="margin:0 0 10px;"><i class="fa-solid fa-wallet"></i> Operating Expenses (This Month: ${money(exps.reduce((s, e) => s + num(e.amount), 0))})</h3>
          <form id="v8ExpForm" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <select id="v8ExpCat" class="field"><option value="Groceries">Groceries</option><option value="Utilities/Gas">Utilities / Gas</option><option value="Rent">Rent</option><option value="Staff Salary">Staff Salary</option><option value="Packaging">Packaging</option><option value="Maintenance">Maintenance</option><option value="Other">Other</option></select>
            <input id="v8ExpAmt" class="field" type="number" min="1" step="0.5" required placeholder="Amount (₹)">
            <select id="v8ExpMode" class="field"><option value="Cash">Cash</option><option value="UPI">UPI / Bank</option></select>
            <input id="v8ExpDate" class="field" type="date" value="${today}">
            <input id="v8ExpDesc" class="field" style="grid-column:1/-1;" maxlength="180" placeholder="Description (e.g. LPG cylinder, Sabzi market)">
            <button type="submit" class="primaryButton" style="grid-column:1/-1;">+ Log Expense</button>
          </form>
          <div style="max-height:240px;overflow-y:auto;">
            ${exps.map((e) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
              <div><strong>${esc(e.category)}</strong> &bull; ${esc(e.business_date)}<div style="font-size:11px;color:var(--muted);">${esc(e.description || e.payment_mode)}</div></div>
              <div style="display:flex;align-items:center;gap:8px;"><strong>${money(e.amount)}</strong><button type="button" style="background:none;border:none;color:#f87171;cursor:pointer;" data-exp-del="${esc(e.id)}">&times;</button></div>
            </div>`).join("") || `<div class="muted" style="font-size:12.5px;">No expenses logged this month.</div>`}
          </div>
        </div>
      </div>
      ${movs.length ? `<div style="${cardStyle()}"><h3 style="margin:0 0 8px;"><i class="fa-solid fa-clock-rotate-left"></i> Recent Stock &amp; Purchase Ledger</h3>
        <div style="max-height:220px;overflow-y:auto;"><table style="width:100%;font-size:12px;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid var(--border);text-align:left;"><th style="padding:5px;">Time</th><th>Item</th><th>Type</th><th>Qty</th><th>Cost/GST</th><th>Supplier/Ref</th></tr></thead>
          <tbody>${movs.map((m) => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:5px;">${esc(fmtDateTime(m.created_at))}</td><td>${esc(m.item_name)}</td><td>${esc(m.movement_type)}</td><td style="color:${num(m.qty_delta) < 0 ? "#fbbf24" : "#34d399"};">${num(m.qty_delta) > 0 ? "+" : ""}${num(m.qty_delta)} ${esc(m.unit)}</td><td>${num(m.unit_cost) > 0 ? money(m.unit_cost) + (num(m.gst_amount) > 0 ? " (GST " + money(m.gst_amount) + ")" : "") : "-"}</td><td>${esc(m.supplier_name || m.invoice_ref || m.notes || "")}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>` : ""}`;

    const addMatBtn = document.getElementById("v8InvAddBtn");
    if (addMatBtn) addMatBtn.addEventListener("click", async () => {
      let p = {};
      const res = await Dialog.open({
        title: "Add Raw Material",
        body: `<label class="dlgLabel">Ingredient Name *</label><input id="imName" class="dlgInput" maxlength="80" placeholder="e.g. Paneer, Cooking Oil, Coke Can">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
            <div><label class="dlgLabel">Category</label><input id="imCat" class="dlgInput" value="Groceries" maxlength="40"></div>
            <div><label class="dlgLabel">Unit</label><select id="imUnit" class="dlgInput"><option value="kg">kg</option><option value="g">g</option><option value="L">L</option><option value="ml">ml</option><option value="pcs">pcs</option></select></div>
            <div><label class="dlgLabel">Opening Stock</label><input id="imCur" class="dlgInput" type="number" step="0.01" value="0"></div>
            <div><label class="dlgLabel">Min Alert Level</label><input id="imMin" class="dlgInput" type="number" step="0.01" value="2"></div>
          </div>
          <label class="dlgLabel" style="margin-top:8px;display:block;">Avg Cost per Unit (₹)</label><input id="imCost" class="dlgInput" type="number" min="0" step="0.5" value="0">`,
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Save Ingredient", kind: "primaryButton" }],
        onClick(bid) {
          if (bid !== "save") return;
          const nm = String(document.getElementById("imName").value || "").trim();
          if (!nm) return { error: "Enter ingredient name." };
          p = { name: nm, category: document.getElementById("imCat").value.trim(), unit: document.getElementById("imUnit").value, current_stock: num(document.getElementById("imCur").value), min_stock: num(document.getElementById("imMin").value), avg_cost: num(document.getElementById("imCost").value) };
        }
      });
      if (res !== "save") return;
      try { await rpc("v8_inventory", { p_restaurant: R.id, p_action: "save_item", p_payload: p }); showToast("Ingredient added!", "success"); loadV8Extras(); renderInvPage(); }
      catch (e) { showToast((e && e.message) || "Failed.", "error"); }
    });

    el.querySelectorAll("[data-inv-mv]").forEach((btn) => btn.addEventListener("click", async () => {
      const item = items.find((x) => x.id === btn.dataset.invMv);
      const t = btn.dataset.invT;
      if (!item) return;
      let pl = {};
      const res = await Dialog.open({
        title: `${t === "purchase" ? "Purchase Stock-In" : "Log Wastage / Spoilage"} — ${esc(item.name)} (${esc(item.unit)})`,
        body: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div><label class="dlgLabel">Quantity (${esc(item.unit)}) *</label><input id="mvQty" class="dlgInput" type="number" min="0.001" step="0.01" placeholder="0"></div>
            ${t === "purchase" ? `<div><label class="dlgLabel">Cost per ${esc(item.unit)} (₹)</label><input id="mvCost" class="dlgInput" type="number" min="0" step="0.5" value="${num(item.avg_cost)}"></div>` : `<div></div>`}
          </div>
          ${t === "purchase" ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
            <div><label class="dlgLabel">Supplier Name</label><input id="mvSup" class="dlgInput" maxlength="80"></div>
            <div><label class="dlgLabel">Bill Ref / Input GST ₹</label><input id="mvRef" class="dlgInput" maxlength="40" placeholder="Bill #"></div>
          </div><label class="dlgLabel" style="margin-top:8px;display:block;">Input GST Paid (₹)</label><input id="mvGst" class="dlgInput" type="number" min="0" step="0.5" value="0">` : ""}
          <label class="dlgLabel" style="margin-top:8px;display:block;">Notes</label><input id="mvNote" class="dlgInput" maxlength="150" placeholder="${t === "wastage" ? "e.g. Expired / Burnt" : "Optional notes"}">`,
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Save", kind: "primaryButton" }],
        onClick(bid) {
          if (bid !== "save") return;
          const q = num(document.getElementById("mvQty").value, 0);
          if (q <= 0) return { error: "Quantity must be positive." };
          pl = { inv_item_id: item.id, movement_type: t, qty: q, unit_cost: t === "purchase" ? num(document.getElementById("mvCost").value, 0) : 0, gst_amount: t === "purchase" ? num(document.getElementById("mvGst").value, 0) : 0, supplier_name: t === "purchase" ? document.getElementById("mvSup").value : "", invoice_ref: t === "purchase" ? document.getElementById("mvRef").value : "", notes: document.getElementById("mvNote").value };
        }
      });
      if (res !== "save") return;
      try { await rpc("v8_inventory", { p_restaurant: R.id, p_action: "add_stock", p_payload: pl }); showToast("Stock updated!", "success"); loadV8Extras(); renderInvPage(); }
      catch (e) { showToast((e && e.message) || "Failed.", "error"); }
    }));

    const recBtn = document.getElementById("v8InvRecBtn");
    if (recBtn) recBtn.addEventListener("click", async () => {
      if (!items.length || !menuList.length) { showToast("Add both menu dishes and raw materials first.", "error"); return; }
      let mid = menuList[0].id, variant = "full", ings = [];
      const res = await Dialog.open({
        title: "Map Dish Recipe (BOM Auto-Deduction)", wide: true,
        body: `<div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:10px;">
            <select id="rcMenu" class="dlgInput">${menuList.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.category)})</option>`).join("")}</select>
            <select id="rcVar" class="dlgInput"><option value="full">Full Portion</option><option value="half">Half Portion</option></select>
          </div>
          <p class="dlgText small">Enter quantity of each raw material consumed per 1 plate sold (0 = not used):</p>
          <div style="max-height:240px;overflow-y:auto;">${items.map((i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">${esc(i.name)} (${esc(i.unit)})</span>
            <input type="number" step="0.001" min="0" value="0" data-rc-ing="${esc(i.id)}" class="dlgInput" style="width:110px;margin:0;padding:4px 6px;">
          </div>`).join("")}</div>`,
        buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Save Recipe", kind: "primaryButton" }],
        onOpen() {
          const mSel = document.getElementById("rcMenu"), vSel = document.getElementById("rcVar");
          const syncRecipeInputs = () => {
            const curM = mSel.value, curV = vSel.value;
            const byIng = Object.create(null);
            recipes.forEach((r) => { if (r.menu_id === curM && r.variant === curV) byIng[r.inv_item_id] = num(r.qty_required, 0); });
            document.querySelectorAll("[data-rc-ing]").forEach((inp) => { inp.value = byIng[inp.dataset.rcIng] || 0; });
          };
          syncRecipeInputs();
          mSel.addEventListener("change", syncRecipeInputs);
          vSel.addEventListener("change", syncRecipeInputs);
        },
        onClick(bid) {
          if (bid !== "save") return;
          mid = document.getElementById("rcMenu").value;
          variant = document.getElementById("rcVar").value;
          ings = Array.from(document.querySelectorAll("[data-rc-ing]")).map((inp) => ({ inv_item_id: inp.dataset.rcIng, qty_required: num(inp.value, 0) })).filter((x) => x.qty_required > 0);
        }
      });
      if (res !== "save") return;
      try { await rpc("v8_inventory", { p_restaurant: R.id, p_action: "save_recipe", p_payload: { menu_id: mid, variant, ingredients: ings } }); showToast("Recipe saved! Future orders will auto-deduct ingredients.", "success"); renderInvPage(); }
      catch (e) { showToast((e && e.message) || "Failed.", "error"); }
    });

    const expForm = document.getElementById("v8ExpForm");
    if (expForm) expForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await rpc("v8_expenses", { p_restaurant: R.id, p_action: "add", p_payload: { category: document.getElementById("v8ExpCat").value, amount: num(document.getElementById("v8ExpAmt").value, 0), payment_mode: document.getElementById("v8ExpMode").value, business_date: document.getElementById("v8ExpDate").value, description: document.getElementById("v8ExpDesc").value } });
        showToast("Expense logged!", "success");
        renderInvPage();
      } catch (err) { showToast((err && err.message) || "Could not log expense.", "error"); }
    });
    el.querySelectorAll("[data-exp-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await Dialog.confirm("Delete this expense entry?", { danger: true, confirmText: "Delete" }))) return;
      try {
        await rpc("v8_expenses", { p_restaurant: R.id, p_action: "delete", p_payload: { id: b.dataset.expDel } });
        showToast("Expense removed.", "info");
        renderInvPage();
      } catch (err) { showToast((err && err.message) || "Could not delete expense.", "error"); }
    }));
  }

  // --- PRO PETPOOJA ANALYTICS & P&L PAGE (ADMIN ONLY) ---
  let PRO_FROM = "", PRO_TO = "";
  async function renderProReportsPage() {
    const el = document.getElementById("v8pro");
    if (!el || (typeof isAdmin === "function" && !isAdmin())) return;
    const today = businessDateNow();
    if (!PRO_TO) PRO_TO = today;
    if (!PRO_FROM) PRO_FROM = today.slice(0, 8) + "01";
    const rep = await rpc("v8_pro_reports", { p_restaurant: R.id, p_from: PRO_FROM, p_to: PRO_TO });
    const p = rep.pnl || {}, lk = rep.leakage || {};

    el.innerHTML = `
      <div style="${cardStyle()}display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;">
        <div><h3 style="margin:0;"><i class="fa-solid fa-magnifying-glass-chart"></i> Pro Analytics, P&amp;L &amp; Leakage Audit</h3></div>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <div><label class="fieldLabel">From</label><input class="field" type="date" id="proFrom" value="${esc(PRO_FROM)}"></div>
          <div><label class="fieldLabel">To</label><input class="field" type="date" id="proTo" value="${esc(PRO_TO)}"></div>
          <button type="button" class="primaryButton" id="proRunBtn">Run Analytics</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px;">
        <div style="${cardStyle()}margin:0;"><div style="font-size:11.5px;color:var(--muted);">Gross Sales</div><strong style="font-size:18px;">${money(p.sales)}</strong></div>
        <div style="${cardStyle()}margin:0;"><div style="font-size:11.5px;color:var(--muted);">GST Collected</div><strong style="font-size:18px;">${money(p.gst)}</strong></div>
        <div style="${cardStyle()}margin:0;"><div style="font-size:11.5px;color:var(--muted);">Purchases / COGS</div><strong style="font-size:18px;">${money(num(p.cogs) > 0 ? p.cogs : p.purchases)}</strong></div>
        <div style="${cardStyle()}margin:0;"><div style="font-size:11.5px;color:var(--muted);">Operating Expenses</div><strong style="font-size:18px;">${money(p.expenses)}</strong></div>
        <div style="${cardStyle()}margin:0;border-color:var(--accent,#c5a880);"><div style="font-size:11.5px;color:var(--muted);">Est. Net Profit (Ex-GST)</div><strong style="font-size:18px;color:${num(p.net_profit) >= 0 ? "#34d399" : "#f87171"};">${money(p.net_profit)}</strong></div>
      </div>

      <div class="v8CrmGrid">
        <div style="${cardStyle()}">
          <h3 style="margin:0 0 8px;"><i class="fa-solid fa-triangle-exclamation"></i> Discount, NC &amp; Cancellation Leakage Audit</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px;margin-bottom:10px;">
            <div>Cancelled Orders: <b>${num(lk.cancelled_count)}</b> (${money(lk.cancelled_value)})</div>
            <div>NC Bills: <b>${num(lk.nc_count)}</b> (${money(lk.nc_value)})</div>
            <div>Counter Discounts: <b>${money(lk.manual_discount_total)}</b></div>
            <div>Duplicate Bill Reprints: <b>${num(lk.duplicate_reprints)}</b></div>
          </div>
          <div style="max-height:200px;overflow-y:auto;font-size:12px;">
            ${(lk.recent_events || []).map((ev) => `<div style="padding:5px 0;border-bottom:1px solid var(--border);"><strong>${esc(ev.type)}</strong> &bull; ${esc(ev.order_no)} (${money(ev.amount)}) &bull; <span style="color:var(--muted);">${esc(ev.reason || ev.by)}</span></div>`).join("") || `<div class="muted">Zero leakage events in this period.</div>`}
          </div>
        </div>

        <div style="${cardStyle()}">
          <h3 style="margin:0 0 8px;"><i class="fa-solid fa-user-tie"></i> Staff / Channel Performance</h3>
          <table style="width:100%;font-size:12.5px;border-collapse:collapse;margin-bottom:12px;">
            <thead><tr style="border-bottom:1px solid var(--border);text-align:left;"><th style="padding:5px;">Staff / Channel</th><th>Orders</th><th style="text-align:right;">Revenue</th></tr></thead>
            <tbody>${(rep.staff_sales || []).map((s) => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:5px;">${esc(s.staff_name)}</td><td>${num(s.orders)}</td><td style="text-align:right;">${money(s.revenue)}</td></tr>`).join("")}</tbody>
          </table>
          <h4 style="margin:0 0 6px;">Category Share</h4>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tbody>${(rep.category_share || []).map((c) => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:4px;">${esc(c.category)}</td><td>${num(c.qty)} qty</td><td style="text-align:right;">${money(c.revenue)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>

      <div class="v8CrmGrid">
        <div style="${cardStyle()}">
          <h3 style="margin:0 0 8px;"><i class="fa-solid fa-clock"></i> Hourly Peak Sales</h3>
          <div style="max-height:200px;overflow-y:auto;"><table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--border);text-align:left;"><th style="padding:4px;">Hour</th><th>Orders</th><th style="text-align:right;">Revenue</th></tr></thead>
            <tbody>${(rep.hourly || []).map((h) => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:4px;">${String(h.hr).padStart(2, "0")}:00 &ndash; ${String(h.hr).padStart(2, "0")}:59</td><td>${num(h.orders)}</td><td style="text-align:right;">${money(h.revenue)}</td></tr>`).join("")}</tbody>
          </table></div>
        </div>
        <div style="${cardStyle()}">
          <h3 style="margin:0 0 8px;"><i class="fa-solid fa-snowflake"></i> Zero-Sale Active Menu Items (${(rep.dead_items || []).length})</h3>
          <div style="max-height:200px;overflow-y:auto;font-size:12px;">
            ${(rep.dead_items || []).map((d) => `<div style="padding:4px 0;border-bottom:1px solid var(--border);">${esc(d.name)} <span style="color:var(--muted);">(${esc(d.category)} &bull; ${money(d.price)})</span></div>`).join("") || `<div class="muted">Every active dish sold at least once!</div>`}
          </div>
        </div>
      </div>`;

    const rbtn = document.getElementById("proRunBtn");
    if (rbtn) rbtn.addEventListener("click", () => {
      PRO_FROM = document.getElementById("proFrom").value;
      PRO_TO = document.getElementById("proTo").value;
      if (PRO_FROM && PRO_TO && PRO_FROM <= PRO_TO) renderProReportsPage();
      else showToast("Choose a valid date range.", "error");
    });
  }

  window.V8 = {
    openLoyaltyOtpDialog,
    openSettleDialog,
    openReservationsDialog,
    editOrderDialog,
    transferTableDialog,
    splitBillDialog,
    printV8GstBill,
    renderPosPage,
    renderKdsPage,
    renderGstPage,
    renderCrmPage,
    renderInvPage,
    renderProReportsPage,
    renderChainPage,
    loadV8Meta,
    invalidatePosMenu: () => { POS_STATE.loaded = false; },
    isLoyaltyEnabled: () => !!V8_META.loyalty_enabled
  };

  // --- CRM & COUPONS PAGE ---
  let CRM_SEARCH = "";
  let CRM_PERIOD = "all";
  let CRM_LIST = [];

  async function refreshCrmList() {
    const bodyEl = document.getElementById("v8CrmBody");
    const countEl = document.getElementById("v8CrmCount");
    if (!bodyEl) return;
    const cRes = await rpc("v8_list_customers", { p_restaurant: R.id, p_search: CRM_SEARCH, p_period: CRM_PERIOD });
    CRM_LIST = (cRes && cRes.customers) || [];
    if (countEl) countEl.textContent = String(CRM_LIST.length);
    const pVal = num(V8_META.loyalty_point_value, 1);
    const isPeriod = CRM_PERIOD === "week" || CRM_PERIOD === "month";
    bodyEl.innerHTML = CRM_LIST.map((c) => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:7px 6px;"><strong>${esc(c.name)}</strong><div style="font-size:11px;color:var(--muted,#94a3b8);">${esc(c.phone)}</div></td>
        <td style="text-align:center;">${isPeriod ? `<strong>${c.period_visits}</strong> <span style="color:var(--muted,#94a3b8);font-size:11px;">/ ${c.visit_count}</span>` : c.visit_count}</td>
        <td style="text-align:right;">${isPeriod ? `<strong>${money(c.period_spent)}</strong><div style="font-size:11px;color:var(--muted,#94a3b8);">All: ${money(c.total_spent)}</div>` : money(c.total_spent)}</td>
        <td style="text-align:center;">⭐ ${c.loyalty_points}<div style="font-size:11px;color:var(--muted,#94a3b8);">${money(c.loyalty_points * pVal)}</div></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="secondaryButton" style="padding:4px 8px;font-size:11.5px;" data-crm-view="${esc(c.id)}">Details</button>
          ${V8_META.loyalty_enabled && c.loyalty_points > 0 ? `<button class="primaryButton" style="padding:4px 8px;font-size:11.5px;margin-left:4px;" data-crm-redeem="${esc(c.phone)}" data-crm-name="${esc(c.name)}">OTP</button>` : ""}
        </td>
      </tr>`).join("") || `<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--muted,#94a3b8);">${CRM_SEARCH ? "No customers match that name or phone." : isPeriod ? "No visits recorded in this period yet." : "Customers appear automatically once they enter their phone."}</td></tr>`;
  }

  async function renderCrmPage() {
    const el = document.getElementById("v8crm");
    if (!el) return;
    await loadV8Meta();
    const cpRes = await rpc("v8_manage_coupons", { p_restaurant: R.id, p_action: "list" });
    const coupons = (cpRes && cpRes.coupons) || [];
    const admin = typeof isAdmin !== "function" || isAdmin();
    el.innerHTML = `
      <div class="v8CrmGrid">
        <div style="${cardStyle()}">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
            <h3 style="margin:0;"><i class="fa-solid fa-users"></i> Customer CRM &amp; Loyalty (<span id="v8CrmCount">0</span>)</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;" id="v8CrmPeriods">
              <button type="button" class="${CRM_PERIOD === "all" ? "primaryButton" : "secondaryButton"}" style="padding:5px 10px;font-size:12px;" data-crm-period="all">All Time</button>
              <button type="button" class="${CRM_PERIOD === "week" ? "primaryButton" : "secondaryButton"}" style="padding:5px 10px;font-size:12px;" data-crm-period="week">Top Last Week</button>
              <button type="button" class="${CRM_PERIOD === "month" ? "primaryButton" : "secondaryButton"}" style="padding:5px 10px;font-size:12px;" data-crm-period="month">Top Last Month</button>
            </div>
          </div>
          <div style="margin-bottom:10px;">
            <input class="field" id="v8CrmSearch" type="search" value="${esc(CRM_SEARCH)}" placeholder="Search customer by name or 10-digit mobile..." maxlength="60" style="margin:0;">
          </div>
          <div style="overflow-x:auto;"><table style="width:100%;font-size:12.5px;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:6px;">Customer</th><th>Visits</th><th style="text-align:right;">Spent</th><th>Points</th><th style="text-align:right;">Action</th></tr></thead>
            <tbody id="v8CrmBody"><tr><td colspan="5" style="padding:12px;text-align:center;">Loading...</td></tr></tbody>
          </table></div>
        </div>
        <div style="${cardStyle()}">
          <h3 style="margin:0 0 10px;"><i class="fa-solid fa-tags"></i> Promo Coupons</h3>
          ${admin ? `<form id="v8CpForm" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <input class="field" id="v8CpCode" required placeholder="Code (WELCOME10)" style="text-transform:uppercase;">
            <select class="field" id="v8CpType"><option value="percent">% Off</option><option value="flat">Flat ₹ Off</option></select>
            <input class="field" id="v8CpVal" type="number" min="1" required value="10" placeholder="Discount Value">
            <input class="field" id="v8CpMin" type="number" min="0" value="200" placeholder="Min Order ₹">
            <input class="field" id="v8CpMaxDisc" type="number" min="0" value="0" placeholder="Max Disc ₹ (0=no cap)" title="Max discount cap in ₹ (0 = unlimited)">
            <input class="field" id="v8CpMaxUses" type="number" min="0" value="0" placeholder="Max Uses (0=unlimited)" title="Total max redemptions (0 = unlimited)">
            <input class="field" id="v8CpValidTill" type="date" style="grid-column:1/-1;" title="Valid till date (optional)">
            <button type="submit" class="primaryButton" style="grid-column:1/-1;">+ Create Coupon</button>
          </form>` : `<p style="font-size:12px;color:var(--muted,#94a3b8);margin-top:0;">View active promo codes below (only Admin can create or pause coupons).</p>`}
          ${coupons.map((cp) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px;gap:8px;">
            <div>
              <strong>${esc(cp.code)}</strong> (${cp.discount_type==="flat"?"₹"+cp.discount_value:cp.discount_value+"%"} &middot; Min ₹${cp.min_order}${num(cp.max_discount)>0?" &middot; Cap ₹"+cp.max_discount:""})
              <div style="font-size:11px;color:var(--muted,#94a3b8);">Used ${cp.used_count}${num(cp.max_uses)>0?" / "+cp.max_uses:""}${cp.valid_till?" &middot; Till "+cp.valid_till:""}</div>
            </div>
            ${admin ? `<button class="secondaryButton" style="padding:4px 8px;font-size:11.5px;" data-cp-tog="${esc(cp.id)}">${cp.is_active?"Active":"Paused"}</button>` : `<span class="v8Pill">${cp.is_active?"Active":"Paused"}</span>`}
          </div>`).join("") || `<div style="color:var(--muted);font-size:12.5px;">No coupons yet.</div>`}
        </div>
      </div>`;

    await refreshCrmList();

    document.getElementById("v8CrmSearch").addEventListener("input", debounce((ev) => {
      CRM_SEARCH = ev.target.value;
      refreshCrmList().catch(() => {});
    }, 220));

    el.querySelectorAll("[data-crm-period]").forEach((btn) => btn.addEventListener("click", () => {
      CRM_PERIOD = btn.dataset.crmPeriod;
      renderCrmPage();
    }));

    const crmGrid = el.querySelector(".v8CrmGrid");
    if (crmGrid) crmGrid.addEventListener("click", async (ev) => {
      const vb = ev.target.closest("[data-crm-view]");
      if (vb) {
        const c = CRM_LIST.find((x) => x.id === vb.dataset.crmView);
        if (!c) return;
        const pVal = num(V8_META.loyalty_point_value, 1);
        const choice = await Dialog.open({
          title: c.name || "Customer Profile",
          body: `<div style="font-size:13.5px;line-height:1.7;">
            <div><strong>Mobile:</strong> ${esc(c.phone)}</div>
            <div><strong>Total Visits:</strong> ${c.visit_count}</div>
            <div><strong>Total Spent:</strong> ${money(c.total_spent)}</div>
            <div><strong>Loyalty Balance:</strong> ⭐ ${c.loyalty_points} pts (${money(c.loyalty_points * pVal)} value)</div>
            <div><strong>Last Visit:</strong> ${c.last_visit_at ? esc(fmtDateTime(c.last_visit_at)) : "Never"}</div>
          </div>`,
          buttons: (V8_META.loyalty_enabled && c.loyalty_points > 0)
            ? [{ id: "close", label: "Close" }, { id: "redeem", label: "Redeem Points via WhatsApp OTP", kind: "primaryButton" }]
            : [{ id: "close", label: "Close", kind: "primaryButton" }]
        });
        if (choice === "redeem") {
          await openLoyaltyOtpDialog({ phone: c.phone, customerName: c.name, onDone: () => refreshCrmList() });
        }
        return;
      }
      const rb = ev.target.closest("[data-crm-redeem]");
      if (rb) {
        await openLoyaltyOtpDialog({ phone: rb.dataset.crmRedeem, customerName: rb.dataset.crmName || "", onDone: () => refreshCrmList() });
      }
    });

    const cpForm = document.getElementById("v8CpForm");
    if (cpForm) cpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const res = await rpc("v8_manage_coupons", {
          p_restaurant: R.id, p_action: "create",
          p_payload: {
            code: document.getElementById("v8CpCode").value,
            discount_type: document.getElementById("v8CpType").value,
            discount_value: num(document.getElementById("v8CpVal").value, 10),
            min_order: num(document.getElementById("v8CpMin").value, 0),
            max_discount: num(document.getElementById("v8CpMaxDisc").value, 0),
            max_uses: num(document.getElementById("v8CpMaxUses").value, 0),
            valid_till: document.getElementById("v8CpValidTill").value || ""
          }
        });
        showToast((res && res.message) || "Coupon created!", res && res.ok === false ? "error" : "success");
        renderCrmPage();
      } catch (err) {
        showToast((err && err.message) || "Could not create coupon.", "error");
      }
    });
    el.querySelectorAll("[data-cp-tog]").forEach((b) => b.addEventListener("click", async () => {
      try {
        await rpc("v8_manage_coupons", { p_restaurant: R.id, p_action: "toggle", p_payload: { id: b.dataset.cpTog } });
        renderCrmPage();
      } catch (err) {
        showToast((err && err.message) || "Could not toggle coupon.", "error");
      }
    }));
  }

  // --- MULTI-OUTLET CHAIN PAGE ---
  async function renderChainPage() {
    const el = document.getElementById("v8chain");
    if (!el) return;
    const res = await rpc("v8_chain_overview", { p_restaurant: R.id });
    const outlets = (res && res.outlets) || [];
    el.innerHTML = `
      <div style="${cardStyle()}display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div><h3 style="margin:0;"><i class="fa-solid fa-store"></i> Multi-Outlet Brand Chain (${esc(res && res.org_id || "")})</h3></div>
        <button class="primaryButton" id="v8PushMenuBtn">1-Click Push Menu to All Branches</button>
      </div>
      <div style="${cardStyle()}overflow-x:auto;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:8px;">Branch</th><th>City</th><th>Active Tables</th><th>Today Orders</th><th>GST</th><th>Revenue</th><th>Switch</th></tr></thead>
          <tbody>${outlets.map((o) => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:8px;"><strong>${esc(o.name)}</strong></td><td>${esc(o.city||"-")}</td><td style="text-align:center;">${o.active_tables}</td><td style="text-align:center;">${o.today_orders}</td><td style="text-align:right;">${money(o.today_gst)}</td><td style="text-align:right;"><strong>${money(o.today_revenue)}</strong></td><td style="text-align:center;"><a href="dashboard.html?restaurant=${encodeURIComponent(o.slug)}" class="secondaryButton" style="padding:4px 8px;font-size:12px;text-decoration:none;">Open</a></td></tr>`).join("")}</tbody>
        </table>
      </div>`;
    const pb = document.getElementById("v8PushMenuBtn");
    if (pb) pb.addEventListener("click", async () => {
      const choice = await Dialog.open({
        title: "Push menu to all branches",
        body: `<p class="dlgText">Overwrite branch-specific dish prices too, or keep each branch's existing prices?</p>`,
        buttons: [
          { id: "cancel", label: "Cancel" },
          { id: "keep", label: "Keep branch prices", kind: "secondaryButton" },
          { id: "overwrite", label: "Overwrite prices", kind: "primaryButton" }
        ]
      });
      if (!choice || choice === "cancel") return;
      try {
        const r = await rpc("v8_chain_push_menu", { p_source_restaurant: R.id, p_overwrite_prices: choice === "overwrite" });
        showToast((r && r.message) || "Done", r && r.ok ? "success" : "error");
      } catch (err) {
        showToast((err && err.message) || "Failed to push menu.", "error");
      }
    });
  }

  function wireV8Nav() {
    if (V8_INITIALIZED) return;
    V8_INITIALIZED = true;
    if (new URLSearchParams(location.search).get("kds") === "1" || (typeof isKitchenOnly === "function" && isKitchenOnly())) {
      if (typeof switchPage === "function" && (typeof S === "undefined" || S.page !== "v8kds")) switchPage("v8kds");
    }
  }

  function tryBootV8() {
    const app = document.getElementById("app");
    if (app && !app.hidden && typeof R !== "undefined" && R && R.id) {
      wireV8Nav();
      loadV8Meta();
      loadV8Extras();
      setInterval(() => {
        if (!document.hidden && !app.hidden && (typeof S === "undefined" || (S.started && !S.expiring))) loadV8Extras();
      }, 45000);
      return true;
    }
    return false;
  }

  const bootTimer = setInterval(() => { if (tryBootV8()) clearInterval(bootTimer); }, 250);
  window.addEventListener("DOMContentLoaded", () => { if (tryBootV8()) clearInterval(bootTimer); });
})();
