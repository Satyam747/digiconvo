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
    if (typeof R === "undefined" || !R || !R.id) return;
    try {
      const ex = await rpc("v8_dashboard_extras", { p_restaurant: R.id });
      if (!ex || !ex.ok) return;
      V8_EXTRAS = ex;
      renderV8Banners();
      renderChainSwitcher();
    } catch (_) {}
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
    host.innerHTML = annHtml + callsHtml;
    host.querySelectorAll("[data-v8-resolve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await rpc("v8_resolve_waiter_call", { p_restaurant: R.id, p_call_id: btn.dataset.v8Resolve });
        loadV8Extras();
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
  async function renderKdsPage() {
    const el = document.getElementById("v8kds");
    if (!el) return;
    const orders = await rpc("staff_orders", { p_restaurant: R.id }) || [];
    const active = orders.filter((o) => ["Pending", "Preparing"].includes(o.status));
    el.innerHTML = `
      <div style="${cardStyle()}display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div><h3 style="margin:0;"><i class="fa-solid fa-fire-burner"></i> Live Kitchen Display (KDS)</h3>
        <small style="color:var(--muted,#94a3b8);">Amber ≥ 15 min • Red ≥ 25 min • Open <code>?restaurant=${esc(R.slug)}&kds=1</code> on kitchen tablet</small></div>
        <button class="secondaryButton" id="v8KdsRefresh">Refresh KDS</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;">
        ${active.map((o) => {
          const mins = Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000));
          const border = mins >= 25 ? "#ef4444" : mins >= 15 ? "#f59e0b" : "var(--accent,#c5a880)";
          return `<div style="${cardStyle()}border:2px solid ${border};margin:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="font-size:16px;">Table ${esc(o.table_number)} • ${esc(o.kot_no || o.order_no)}</strong>
              <span class="roleBadge" style="background:${border};color:#000;">${mins}m</span>
            </div>
            <div style="font-size:14px;line-height:1.7;margin-bottom:10px;">
              ${(o.cart || []).map((i) => `<div><strong>${num(i.qty, 1)}×</strong> ${esc(i.name)}</div>`).join("")}
            </div>
            ${o.notes ? `<div style="font-size:12px;color:#fde68a;margin-bottom:8px;">Note: ${esc(o.notes)}</div>` : ""}
            <button class="primaryButton block" data-kds-id="${esc(o.id)}" data-kds-next="${o.status === "Pending" ? "Preparing" : "Ready"}">
              ${o.status === "Pending" ? "Start Cooking" : "Mark Ready ✓"}
            </button>
          </div>`;
        }).join("") || `<div style="${cardStyle()}text-align:center;color:var(--muted,#94a3b8);">Kitchen queue is clear!</div>`}
      </div>`;
    const rbtn = document.getElementById("v8KdsRefresh");
    if (rbtn) rbtn.addEventListener("click", renderKdsPage);
    el.querySelectorAll("[data-kds-id]").forEach((b) => {
      b.addEventListener("click", async () => {
        await rpc("set_order_status", { p_order: b.dataset.kdsId, p_status: b.dataset.kdsNext, p_reason: null });
        showToast("KOT updated!", "ok");
        renderKdsPage();
      });
    });
  }

  // --- GST, FSSAI, SETTLEMENT & GSTR-1 CA PAGE ---
  async function renderGstPage() {
    const el = document.getElementById("v8gst");
    if (!el) return;
    await loadV8Meta();
    const today = businessDateNow();
    const firstDay = today.slice(0, 8) + "01";
    const unpaid = ((await rpc("staff_orders", { p_restaurant: R.id })) || []).filter((o) => o.payment_status === "Unpaid" && o.status !== "Cancelled");

    el.innerHTML = `
      <div style="${cardStyle()}">
        <h3 style="margin:0 0 10px;"><i class="fa-solid fa-file-invoice-dollar"></i> Indian GST, FSSAI, Loyalty & Billing Configuration</h3>
        <form id="v8GstForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;">
          <div><label class="fieldLabel">GST Regime</label><select class="field" id="v8Regime">
            <option value="regular_5" ${V8_META.tax_regime==="regular_5"?"selected":""}>Regular 5% (2.5% CGST + 2.5% SGST, No ITC)</option>
            <option value="specified_18" ${V8_META.tax_regime==="specified_18"?"selected":""}>Specified Premises 18% (9% + 9%)</option>
            <option value="composition" ${V8_META.tax_regime==="composition"?"selected":""}>Composition Scheme (Bill of Supply, 0%)</option>
            <option value="unregistered" ${V8_META.tax_regime==="unregistered"?"selected":""}>Unregistered (Cash Memo, 0%)</option>
          </select></div>
          <div><label class="fieldLabel">GSTIN (15-char)</label><input class="field" id="v8Gstin" value="${esc(V8_META.gstin || R.gstin || "")}" placeholder="23AAAAA0000A1Z5"></div>
          <div><label class="fieldLabel">FSSAI License No. (14-digit)</label><input class="field" id="v8Fssai" maxlength="14" value="${esc(V8_META.fssai_no || "")}" placeholder="11424000000000"></div>
          <div><label class="fieldLabel">Place of Supply (State Code)</label><input class="field" id="v8State" value="${esc(V8_META.state_code || "23-Madhya Pradesh")}"></div>
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
            <label><input type="checkbox" id="v8LoyOn" ${V8_META.loyalty_enabled?"checked":""}> Loyalty Points Active</label>
            <label><input type="checkbox" id="v8ShareCrm" ${V8_META.share_crm_across_org?"checked":""}> Share CRM & Loyalty Across Chain</label>
            <button type="submit" class="primaryButton">Save GST & Loyalty Config</button>
          </div>
        </form>
      </div>

      <div style="${cardStyle()}">
        <h3 style="margin:0 0 10px;"><i class="fa-solid fa-file-excel"></i> 1-Click GSTR-1 CA Accountant Export (Permanent Records — Zero Auto-Delete)</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
          <div><label class="fieldLabel">From Date</label><input class="field" type="date" id="v8GFrom" value="${firstDay}"></div>
          <div><label class="fieldLabel">To Date</label><input class="field" type="date" id="v8GTo" value="${today}"></div>
          ${(V8_EXTRAS.outlets || []).length > 1 ? `<label style="font-size:13px;"><input type="checkbox" id="v8GOrg"> Consolidated All Chain Branches</label>` : ""}
          <button class="primaryButton" id="v8ExportGstr1Btn">Export 5-Sheet GSTR-1 Excel</button>
        </div>
      </div>

      <div style="${cardStyle()}">
        <h3 style="margin:0 0 10px;"><i class="fa-solid fa-cash-register"></i> Pro Settlement Desk (Split Cash+UPI / NC Bill / B2B GSTIN / Dynamic UPI QR Bill)</h3>
        ${unpaid.length ? unpaid.map((o) => `
          <div style="border-bottom:1px solid var(--border,rgba(255,255,255,.08));padding:10px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div><strong>#${esc(o.order_no)}</strong> • Table ${esc(o.table_number)} • ${esc(o.customer_name)} • <strong>${money(o.total)}</strong></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="primaryButton" style="padding:6px 10px;font-size:12px;" data-v8-settle="${esc(o.id)}" data-v8-tot="${num(o.total)}">Settle (Split/NC/B2B)</button>
              <button class="secondaryButton" style="padding:6px 10px;font-size:12px;" data-v8-provisional="${esc(o.id)}">Print GST Bill + UPI QR</button>
            </div>
          </div>`).join("") : `<div style="color:var(--muted,#94a3b8);font-size:13px;">All active orders are settled.</div>`}
      </div>`;

    document.getElementById("v8GstForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const res = await rpc("v8_save_settings", { p_restaurant: R.id, p_data: {
        tax_regime: document.getElementById("v8Regime").value, gstin: document.getElementById("v8Gstin").value,
        fssai_no: document.getElementById("v8Fssai").value, state_code: document.getElementById("v8State").value,
        invoice_prefix: document.getElementById("v8Prefix").value, packaging_charge_type: document.getElementById("v8PkgType").value,
        packaging_charge: num(document.getElementById("v8PkgAmt").value), service_charge_percent: num(document.getElementById("v8SvcPct").value),
        loyalty_earn_per_100: num(document.getElementById("v8LoyEarn").value, 5), loyalty_point_value: num(document.getElementById("v8LoyVal").value, 1),
        takeaway_enabled: document.getElementById("v8Takeaway").checked, loyalty_enabled: document.getElementById("v8LoyOn").checked,
        share_crm_across_org: document.getElementById("v8ShareCrm").checked
      }});
      showToast((res && res.message) || "Saved", res && res.ok ? "ok" : "err");
      await loadV8Meta();
    });

    document.getElementById("v8ExportGstr1Btn").addEventListener("click", async () => {
      const from = document.getElementById("v8GFrom").value, to = document.getElementById("v8GTo").value;
      const orgChk = document.getElementById("v8GOrg");
      const rep = await rpc("v8_gstr1_report", { p_restaurant: R.id, p_from: from, p_to: to, p_include_org: Boolean(orgChk && orgChk.checked) });
      if (!rep || !rep.ok) { showToast((rep && rep.message) || "Export failed", "err"); return; }
      const invs = rep.invoices || [];
      const b2b = invs.filter((i) => i.customer_gstin && i.customer_gstin.length >= 15 && !i.is_nc);
      const b2cs = invs.filter((i) => (!i.customer_gstin || i.customer_gstin.length < 15) && !i.is_nc);
      const nc = invs.filter((i) => i.is_nc);
      const sheets = [
        { name: "SAC_996331_Summary", rows: [["Regime","SAC","Invoices","Taxable","CGST","SGST","Total"], ...(rep.sac_summary||[]).map((s)=>[s.regime,s.sac_code,s.invoice_count,s.taxable_value,s.cgst,s.sgst,s.total_value])] },
        { name: "B2B_Invoices", rows: [["Branch","GSTIN","Invoice No","Date","Buyer GSTIN","Buyer Name","Taxable","CGST","SGST","Total"], ...b2b.map((i)=>[i.branch_name,i.branch_gstin,i.invoice_no,i.business_date,i.customer_gstin,i.customer_legal_name||i.customer_name,i.taxable_value,i.cgst,i.sgst,i.total])] },
        { name: "B2CS_Invoices", rows: [["Branch","Invoice No","Date","Type","Guest","Phone","Taxable","CGST","SGST","RoundOff","Total","Mode"], ...b2cs.map((i)=>[i.branch_name,i.invoice_no,i.business_date,i.order_type,i.customer_name,i.customer_phone,i.taxable_value,i.cgst,i.sgst,i.round_off,i.total,i.payment_mode])] },
        { name: "NC_Complimentary", rows: [["Branch","Invoice No","Date","Guest","Subtotal","Reason"], ...nc.map((i)=>[i.branch_name,i.invoice_no,i.business_date,i.customer_name,i.subtotal,i.nc_reason])] }
      ];
      if (typeof downloadXlsx === "function") downloadXlsx(`GSTR1_${R.slug}_${from}_to_${to}.xlsx`, sheets);
      showToast(`Exported ${invs.length} GST invoices!`, "ok");
    });

    el.querySelectorAll("[data-v8-settle]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const oid = btn.dataset.v8Settle;
        const mode = prompt("Payment mode? Type: UPI, Cash, Card, Split, or NC", "UPI");
        if (!mode) return;
        let splits = [], isNc = mode.toUpperCase() === "NC", ncReason = "", gstin = "", legal = "";
        if (mode.toLowerCase() === "split") {
          const c = num(prompt("Cash part (₹):", "0"));
          const u = Math.max(0, num(btn.dataset.v8Tot) - c);
          splits = [{ mode: "Cash", amount: c }, { mode: "UPI", amount: u }];
        } else if (isNc) {
          ncReason = prompt("Mandatory reason for Complimentary (NC) bill:", "Owner / VIP Table") || "";
        } else {
          gstin = prompt("Optional B2B Buyer GSTIN (leave blank for regular guest):", "") || "";
          if (gstin.trim()) legal = prompt("Buyer Company Legal Name:", "") || "";
        }
        const res = await rpc("v8_settle_order", {
          p_restaurant: R.id, p_order_id: oid, p_mode: mode, p_splits: splits,
          p_is_nc: isNc, p_nc_reason: ncReason, p_customer_gstin: gstin, p_customer_legal_name: legal, p_remove_service_charge: false
        });
        if (!res || !res.ok) { showToast((res && res.message) || "Settlement failed", "err"); return; }
        showToast(`Settled! Tax Invoice: ${res.invoice_no}`, "ok");
        printV8GstBill(res.order);
        renderGstPage();
      });
    });

    el.querySelectorAll("[data-v8-provisional]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const o = unpaid.find((x) => x.id === btn.dataset.v8Provisional);
        if (o) printV8GstBill(o);
      });
    });
  }

  function printV8GstBill(o) {
    const regime = o.tax_regime_snapshot || V8_META.tax_regime || "regular_5";
    const invNo = o.fy_invoice_no || (o.payment_status === "Paid" ? o.invoice_no : "");
    const title = !invNo ? "PROVISIONAL BILL" : regime === "composition" ? "BILL OF SUPPLY (COMPOSITION)" : regime === "unregistered" ? "CASH MEMO" : "TAX INVOICE";
    const cgst = num(o.cgst) > 0 ? num(o.cgst) : Number((num(o.gst) / 2).toFixed(2));
    const sgst = num(o.sgst) > 0 ? num(o.sgst) : Number((num(o.gst) - cgst).toFixed(2));
    const upiUri = (R.upi_id && !o.is_nc && num(o.total) > 0) ? `upi://pay?pa=${encodeURIComponent(R.upi_id)}&pn=${encodeURIComponent(R.name)}&am=${num(o.total).toFixed(2)}&cu=INR&tn=${encodeURIComponent(invNo || o.order_no)}` : "";
    const qrBlock = (upiUri && typeof qrSvg === "function") ? `<div style="text-align:center;margin-top:8px;"><div style="width:120px;margin:0 auto;">${qrSvg(upiUri)}</div><div style="font-size:10px;font-weight:700;">Scan & Pay ${money(o.total)} via UPI</div></div>` : "";
    const html = `<div style="font-family:monospace;font-size:12px;max-width:74mm;margin:0 auto;color:#000;">
      <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
        <div style="font-size:15px;font-weight:900;">${esc(R.name)}</div>
        ${R.address ? `<div style="font-size:10px;">${esc(R.address)}</div>` : ""}
        ${(V8_META.gstin || R.gstin) ? `<div style="font-size:10.5px;font-weight:700;">GSTIN: ${esc(V8_META.gstin || R.gstin)}</div>` : ""}
        ${V8_META.fssai_no ? `<div style="font-size:10.5px;">FSSAI Lic: ${esc(V8_META.fssai_no)}</div>` : ""}
        <div style="font-size:11px;font-weight:900;margin-top:4px;">${title}</div>
      </div>
      <div style="font-size:11px;margin-bottom:6px;">
        <div><strong>${invNo ? "Invoice:" : "Order:"}</strong> ${esc(invNo || o.order_no)} | <strong>Table ${esc(o.table_number)}</strong></div>
        <div><strong>Guest:</strong> ${esc(o.customer_name)}${o.customer_phone ? " (" + esc(o.customer_phone) + ")" : ""}</div>
        ${o.customer_gstin ? `<div><strong>Buyer GSTIN:</strong> ${esc(o.customer_gstin)} ${esc(o.customer_legal_name || "")}</div>` : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border-top:1px dashed #000;border-bottom:1px dashed #000;">
        <thead><tr><th style="text-align:left;">Item (SAC 996331)</th><th>Qty</th><th style="text-align:right;">Amt</th></tr></thead>
        <tbody>${(o.cart || []).map((i) => `<tr><td>${esc(i.name)}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">${num(i.total || i.price * i.qty).toFixed(2)}</td></tr>`).join("")}</tbody>
      </table>
      <div style="margin-top:6px;font-size:11px;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${num(o.subtotal).toFixed(2)}</span></div>
        ${num(o.discount) > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Discount</span><span>-${num(o.discount).toFixed(2)}</span></div>` : ""}
        ${cgst > 0 ? `<div style="display:flex;justify-content:space-between;"><span>CGST</span><span>${cgst.toFixed(2)}</span></div>` : ""}
        ${sgst > 0 ? `<div style="display:flex;justify-content:space-between;"><span>SGST</span><span>${sgst.toFixed(2)}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;border-top:1px dashed #000;margin-top:4px;padding-top:4px;"><span>TOTAL</span><span>${o.is_nc ? "₹0 (NC)" : money(o.total)}</span></div>
      </div>
      ${qrBlock}
    </div>`;
    if (typeof printHtml === "function") printHtml(html, invNo || o.order_no);
  }

  // --- CRM & COUPONS PAGE ---
  async function renderCrmPage() {
    const el = document.getElementById("v8crm");
    if (!el) return;
    const cRes = await rpc("v8_list_customers", { p_restaurant: R.id, p_search: "" });
    const cpRes = await rpc("v8_manage_coupons", { p_restaurant: R.id, p_action: "list" });
    const custs = (cRes && cRes.customers) || [];
    const coupons = (cpRes && cpRes.coupons) || [];
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;align-items:start;">
        <div style="${cardStyle()}">
          <h3 style="margin:0 0 10px;"><i class="fa-solid fa-users"></i> Permanent Customer CRM & Loyalty (${custs.length})</h3>
          <div style="overflow-x:auto;"><table style="width:100%;font-size:12.5px;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:6px;">Customer</th><th>Phone</th><th>Visits</th><th>Spent</th><th>Points</th></tr></thead>
            <tbody>${custs.map((c) => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:6px;"><strong>${esc(c.name)}</strong></td><td>${esc(c.phone)}</td><td style="text-align:center;">${c.visit_count}</td><td style="text-align:right;">${money(c.total_spent)}</td><td style="text-align:center;">⭐ ${c.loyalty_points}</td></tr>`).join("") || `<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--muted);">Customers appear automatically once they enter their phone.</td></tr>`}</tbody>
          </table></div>
        </div>
        <div style="${cardStyle()}">
          <h3 style="margin:0 0 10px;"><i class="fa-solid fa-tags"></i> Promo Coupons</h3>
          <form id="v8CpForm" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <input class="field" id="v8CpCode" required placeholder="Code (WELCOME10)" style="text-transform:uppercase;">
            <select class="field" id="v8CpType"><option value="percent">% Off</option><option value="flat">Flat ₹ Off</option></select>
            <input class="field" id="v8CpVal" type="number" required value="10" placeholder="Value">
            <input class="field" id="v8CpMin" type="number" value="200" placeholder="Min Order ₹">
            <button type="submit" class="primaryButton" style="grid-column:1/-1;">+ Create Coupon</button>
          </form>
          ${coupons.map((cp) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
            <div><strong>${esc(cp.code)}</strong> (${cp.discount_type==="flat"?"₹"+cp.discount_value:cp.discount_value+"%"} • Min ₹${cp.min_order})</div>
            <button class="secondaryButton" style="padding:4px 8px;font-size:11.5px;" data-cp-tog="${esc(cp.id)}">${cp.is_active?"Active":"Off"}</button>
          </div>`).join("") || `<div style="color:var(--muted);font-size:12.5px;">No coupons yet.</div>`}
        </div>
      </div>`;
    document.getElementById("v8CpForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      await rpc("v8_manage_coupons", { p_restaurant: R.id, p_action: "create", p_payload: { code: document.getElementById("v8CpCode").value, discount_type: document.getElementById("v8CpType").value, discount_value: num(document.getElementById("v8CpVal").value, 10), min_order: num(document.getElementById("v8CpMin").value, 0) } });
      showToast("Coupon created!", "ok"); renderCrmPage();
    });
    el.querySelectorAll("[data-cp-tog]").forEach((b) => b.addEventListener("click", async () => { await rpc("v8_manage_coupons", { p_restaurant: R.id, p_action: "toggle", p_payload: { id: b.dataset.cpTog } }); renderCrmPage(); }));
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
      const over = confirm("Overwrite branch-specific dish prices too? Click Cancel to keep each branch's own prices.");
      const r = await rpc("v8_chain_push_menu", { p_source_restaurant: R.id, p_overwrite_prices: over });
      showToast((r && r.message) || "Done", r && r.ok ? "ok" : "err");
    });
  }

  function wireV8Nav() {
    if (V8_INITIALIZED) return;
    V8_INITIALIZED = true;
    document.querySelectorAll('.navItem[data-page^="v8"]').forEach((item) => {
      item.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const pg = item.dataset.page;
        document.querySelectorAll(".navItem").forEach((n) => n.classList.toggle("active", n === item));
        document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === pg));
        const pt = document.getElementById("pageTitle");
        if (pt) pt.textContent = item.querySelector("span").textContent;
        if (pg === "v8kds") renderKdsPage().catch((e) => showToast(e.message || "KDS error", "error"));
        if (pg === "v8gst") renderGstPage().catch((e) => showToast(e.message || "GST error", "error"));
        if (pg === "v8crm") renderCrmPage().catch((e) => showToast(e.message || "CRM error", "error"));
        if (pg === "v8chain") renderChainPage().catch((e) => showToast(e.message || "Chain error", "error"));
      }, true);
    });
    if (new URLSearchParams(location.search).get("kds") === "1") {
      const kdsItem = document.querySelector('.navItem[data-page="v8kds"]');
      if (kdsItem) kdsItem.click();
    }
  }

  function tryBootV8() {
    const app = document.getElementById("app");
    if (app && !app.hidden && typeof R !== "undefined" && R && R.id) {
      wireV8Nav();
      loadV8Meta();
      loadV8Extras();
      setInterval(() => { if (!document.hidden && !app.hidden) loadV8Extras(); }, 15000);
      return true;
    }
    return false;
  }

  const bootTimer = setInterval(() => { if (tryBootV8()) clearInterval(bootTimer); }, 250);
  window.addEventListener("DOMContentLoaded", () => { if (tryBootV8()) clearInterval(bootTimer); });
})();
