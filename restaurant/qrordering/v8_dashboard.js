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
    host.innerHTML = annHtml + callsHtml;
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
        try {
          await rpc("set_order_status", { p_order: b.dataset.kdsId, p_status: b.dataset.kdsNext, p_reason: null });
          showToast("KOT updated!", "success");
          renderKdsPage();
        } catch (e) {
          showToast((e && e.message) || "Could not update KOT.", "error");
        }
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
        <h3 style="margin:0 0 10px;"><i class="fa-solid fa-cash-register"></i> Pro Settlement Desk (Split Cash+UPI / NC Bill / B2B GSTIN / Loyalty OTP / UPI QR)</h3>
        ${unpaid.length ? unpaid.map((o) => `
          <div style="border-bottom:1px solid var(--border,rgba(255,255,255,.08));padding:10px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <strong>#${esc(o.order_no)}</strong> &middot; Table ${esc(o.table_number)} &middot; ${esc(o.customer_name)}${o.customer_phone ? " (" + esc(o.customer_phone) + ")" : ""} &middot; <strong>${money(o.total)}</strong>
              ${o.coupon_code ? `<span class="roleBadge" style="margin-left:6px;background:rgba(16,185,129,.2);color:#34d399;">Coupon ${esc(o.coupon_code)} (-${money(o.coupon_discount)})</span>` : ""}
              ${num(o.loyalty_discount) > 0 ? `<span class="roleBadge" style="margin-left:6px;background:rgba(197,168,128,.2);color:#fbbf24;">Loyalty -${money(o.loyalty_discount)}</span>` : ""}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${V8_META.loyalty_enabled ? `<button class="secondaryButton" style="padding:6px 10px;font-size:12px;" data-v8-loy="${esc(o.id)}" data-v8-phone="${esc(o.customer_phone || "")}" data-v8-name="${esc(o.customer_name || "")}">Redeem Loyalty (OTP)</button>` : ""}
              <button class="primaryButton" style="padding:6px 10px;font-size:12px;" data-v8-settle="${esc(o.id)}" data-v8-tot="${num(o.total)}">Settle (Split/NC/B2B)</button>
              <button class="secondaryButton" style="padding:6px 10px;font-size:12px;" data-v8-provisional="${esc(o.id)}">Print GST Bill + UPI QR</button>
            </div>
          </div>`).join("") : `<div style="color:var(--muted,#94a3b8);font-size:13px;">All active orders are settled.</div>`}
      </div>`;

    document.getElementById("v8GstForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const res = await rpc("v8_save_settings", { p_restaurant: R.id, p_data: {
          tax_regime: document.getElementById("v8Regime").value, gstin: document.getElementById("v8Gstin").value,
          fssai_no: document.getElementById("v8Fssai").value, state_code: document.getElementById("v8State").value,
          invoice_prefix: document.getElementById("v8Prefix").value, packaging_charge_type: document.getElementById("v8PkgType").value,
          packaging_charge: num(document.getElementById("v8PkgAmt").value), service_charge_percent: num(document.getElementById("v8SvcPct").value),
          loyalty_earn_per_100: num(document.getElementById("v8LoyEarn").value, 5), loyalty_point_value: num(document.getElementById("v8LoyVal").value, 1),
          takeaway_enabled: document.getElementById("v8Takeaway").checked, loyalty_enabled: document.getElementById("v8LoyOn").checked,
          share_crm_across_org: document.getElementById("v8ShareCrm").checked
        }});
        showToast((res && res.message) || "Saved", res && res.ok ? "success" : "error");
        await loadV8Meta();
      } catch (err) {
        showToast((err && err.message) || "Failed to save GST settings.", "error");
      }
    });

    document.getElementById("v8ExportGstr1Btn").addEventListener("click", async () => {
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
      const sheets = [
        { name: "SAC_996331_Summary", rows: [["Regime","SAC","Invoices","Taxable","CGST","SGST","Total"], ...(rep.sac_summary||[]).map((s)=>[s.regime,s.sac_code,num(s.invoice_count),num(s.taxable_value),num(s.cgst),num(s.sgst),num(s.total_value)])] },
        { name: "B2B_Invoices", rows: [["Branch","GSTIN","Invoice No","Date","Buyer GSTIN","Buyer Name","Offer Disc","Coupon","Loyalty Disc","Taxable","CGST","SGST","Total"], ...b2b.map((i)=>[i.branch_name,i.branch_gstin,i.invoice_no,i.business_date,i.customer_gstin,i.customer_legal_name||i.customer_name,num(i.offer_discount),i.coupon_code||"",num(i.loyalty_discount),num(i.taxable_value),num(i.cgst),num(i.sgst),num(i.total)])] },
        { name: "B2CS_Invoices", rows: [["Branch","Invoice No","Date","Type","Guest","Phone","Offer Disc","Coupon Code","Coupon Disc","Loyalty Disc","Taxable","CGST","SGST","RoundOff","Total","Mode"], ...b2cs.map((i)=>[i.branch_name,i.invoice_no,i.business_date,i.order_type,i.customer_name,i.customer_phone,num(i.offer_discount),i.coupon_code||"",num(i.coupon_discount),num(i.loyalty_discount),num(i.taxable_value),num(i.cgst),num(i.sgst),num(i.round_off),num(i.total),i.payment_mode])] },
        { name: "NC_Complimentary", rows: [["Branch","Invoice No","Date","Guest","Subtotal","Reason"], ...nc.map((i)=>[i.branch_name,i.invoice_no,i.business_date,i.customer_name,num(i.subtotal),i.nc_reason])] },
        { name: "Daily_Summary", rows: [["Branch","Date","Orders","NC","Subtotal","Discount","Taxable","CGST","SGST","Net Revenue","Cash","UPI","Card"], ...daily.map((d)=>[d.branch_name,d.business_date,num(d.orders_count),num(d.nc_count),num(d.subtotal),num(d.discount),num(d.taxable_value),num(d.cgst),num(d.sgst),num(d.net_revenue),num(d.cash_total),num(d.upi_total),num(d.card_total)])] }
      ];
      if (typeof Sheets !== "undefined" && typeof Sheets.downloadXlsx === "function") {
        Sheets.downloadXlsx(sheets, `GSTR1_${R.slug}_${from}_to_${to}.xlsx`);
        showToast(`Exported ${invs.length} GST invoices!`, "success");
      } else {
        showToast("Excel export helper is not loaded.", "error");
      }
    });

    el.querySelectorAll("[data-v8-settle]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const oid = btn.dataset.v8Settle;
        const totAmt = num(btn.dataset.v8Tot);
        const mode = await Dialog.open({
          title: "Payment mode",
          body: `<p class="dlgText">Choose how this bill was settled.</p>`,
          buttons: [
            { id: "UPI", label: "UPI", kind: "primaryButton" }, { id: "Cash", label: "Cash", kind: "primaryButton" },
            { id: "Card", label: "Card", kind: "primaryButton" }, { id: "Split", label: "Split", kind: "primaryButton" },
            { id: "NC", label: "Complimentary", kind: "secondaryButton" }, { id: "cancel", label: "Cancel" }
          ]
        });
        if (!mode || mode === "cancel") return;
        let splits = [], isNc = mode.toUpperCase() === "NC", ncReason = "", gstin = "", legal = "";
        if (mode.toLowerCase() === "split") {
          const cashText = await Dialog.prompt({ title: "Split payment", label: `Cash part (₹, max ${totAmt.toFixed(2)})`, maxlength: 12 });
          if (cashText === null) return;
          const c = num(cashText, -1);
          if (c < 0 || c > totAmt) { showToast("Enter a valid cash amount within bill total.", "error"); return; }
          const u = Math.round(Math.max(0, totAmt - c) * 100) / 100;
          splits = [{ mode: "Cash", amount: c }, { mode: "UPI", amount: u }];
        } else if (isNc) {
          const rTxt = await Dialog.prompt({ title: "Complimentary bill", label: "Reason for the NC bill", minLength: 3, maxlength: 200 });
          if (rTxt === null) return;
          ncReason = rTxt;
        } else {
          const gTxt = await Dialog.prompt({ title: "Buyer GSTIN", label: "Optional B2B GSTIN (enter 'none' or '-' if regular guest, Cancel to abort)", maxlength: 15, minLength: 1 });
          if (gTxt === null) return;
          const cleanG = gTxt.trim();
          if (cleanG && !/^(none|-|na|n\/a)$/i.test(cleanG)) {
            gstin = cleanG;
            const lTxt = await Dialog.prompt({ title: "Buyer name", label: "Buyer company legal name", maxlength: 100 });
            if (lTxt === null) return;
            legal = lTxt;
          }
        }
        try {
          const res = await rpc("v8_settle_order", {
            p_restaurant: R.id, p_order_id: oid, p_mode: mode, p_splits: splits,
            p_is_nc: isNc, p_nc_reason: ncReason, p_customer_gstin: gstin, p_customer_legal_name: legal,
            p_remove_service_charge: false, p_settle_all: true, p_merge_table: true
          });
          if (!res || !res.ok) { showToast((res && res.message) || "Settlement failed", "error"); return; }
          const earnNote = num(res.loyalty_earned) > 0 ? ` · +${num(res.loyalty_earned)} pts earned` : "";
          showToast(`Settled! Tax Invoice: ${res.invoice_no}${earnNote}`, "success");
          printV8GstBill(res.order);
          if (typeof refreshLive === "function") await refreshLive();
          renderGstPage();
        } catch (err) {
          showToast((err && err.message) || "Settlement failed", "error");
        }
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
      btn.addEventListener("click", () => {
        const o = unpaid.find((x) => x.id === btn.dataset.v8Provisional);
        if (o) printV8GstBill(typeof consolidatedTableBill === "function" ? consolidatedTableBill(o) : o);
      });
    });
  }

  function printV8GstBill(o) {
    const regime = o.tax_regime_snapshot || V8_META.tax_regime || "regular_5";
    const invNo = o.fy_invoice_no || (o.payment_status === "Paid" ? o.invoice_no : "");
    const title = !invNo ? "PROVISIONAL BILL" : regime === "composition" ? "BILL OF SUPPLY (COMPOSITION)" : regime === "unregistered" ? "CASH MEMO" : "TAX INVOICE";
    const sub = num(o.subtotal), disc = num(o.discount), cpDisc = num(o.coupon_discount), loyDisc = num(o.loyalty_discount);
    const pkg = num(o.packaging_charge), svc = num(o.service_charge);
    const taxable = o.taxable_value !== undefined && o.taxable_value !== null && num(o.taxable_value) >= 0 && (o.fy_invoice_no || cpDisc > 0 || loyDisc > 0 || o.is_nc)
      ? num(o.taxable_value) : Math.max(0, sub - disc - cpDisc - loyDisc + pkg + svc);
    const cgst = num(o.cgst) > 0 ? num(o.cgst) : Number((num(o.gst) / 2).toFixed(2));
    const sgst = num(o.sgst) > 0 ? num(o.sgst) : Number((num(o.gst) - cgst).toFixed(2));
    const upiId = R.upi || R.upi_id || "";
    const upiUri = (upiId && !o.is_nc && num(o.total) > 0) ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(R.name)}&am=${num(o.total).toFixed(2)}&cu=INR&tn=${encodeURIComponent(invNo || o.order_no)}` : "";
    const renderQr = (typeof QR !== "undefined" && typeof QR.svg === "function") ? (u) => QR.svg(u, { border: 2 }) : (typeof qrSvg === "function" ? qrSvg : null);
    const qrBlock = (upiUri && renderQr) ? `<div style="text-align:center;margin-top:8px;"><div style="width:120px;margin:0 auto;">${renderQr(upiUri)}</div><div style="font-size:10px;font-weight:700;">Scan &amp; Pay ${esc(money(o.total))} via UPI</div></div>` : "";
    const hasAdj = disc > 0 || cpDisc > 0 || loyDisc > 0 || pkg > 0 || svc > 0;
    const bodyHtml = `<div style="font-family:monospace;font-size:12px;max-width:74mm;margin:0 auto;color:#000;">
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
        <tbody>${(o.cart || []).map((i) => { const qty = num(i.qty ?? i.quantity, 1); const unit = num(i.original_price ?? i.price); const amt = num(i.total ?? (unit * qty)); return `<tr><td>${esc(i.name)}</td><td style="text-align:center;">${esc(qty)}</td><td style="text-align:right;">${amt.toFixed(2)}</td></tr>`; }).join("")}</tbody>
      </table>
      <div style="margin-top:6px;font-size:11px;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${sub.toFixed(2)}</span></div>
        ${disc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Menu Offers</span><span>-${disc.toFixed(2)}</span></div>` : ""}
        ${cpDisc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Coupon (${esc(o.coupon_code || "PROMO")})</span><span>-${cpDisc.toFixed(2)}</span></div>` : ""}
        ${loyDisc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Loyalty (${num(o.loyalty_points_used, 0)} pts)</span><span>-${loyDisc.toFixed(2)}</span></div>` : ""}
        ${pkg > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Packaging</span><span>${pkg.toFixed(2)}</span></div>` : ""}
        ${svc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Service Charge</span><span>${svc.toFixed(2)}</span></div>` : ""}
        ${hasAdj && !o.is_nc ? `<div style="display:flex;justify-content:space-between;"><span>Taxable Value</span><span>${taxable.toFixed(2)}</span></div>` : ""}
        ${cgst > 0 ? `<div style="display:flex;justify-content:space-between;"><span>CGST</span><span>${cgst.toFixed(2)}</span></div>` : ""}
        ${sgst > 0 ? `<div style="display:flex;justify-content:space-between;"><span>SGST</span><span>${sgst.toFixed(2)}</span></div>` : ""}
        ${Math.abs(num(o.round_off)) >= 0.005 ? `<div style="display:flex;justify-content:space-between;"><span>Round Off</span><span>${(num(o.round_off) > 0 ? "+" : "") + num(o.round_off).toFixed(2)}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:900;border-top:1px dashed #000;margin-top:4px;padding-top:4px;"><span>TOTAL</span><span>${o.is_nc ? "₹0.00 (NC)" : esc(money(o.total))}</span></div>
      </div>
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

  window.V8 = {
    openLoyaltyOtpDialog,
    printV8GstBill,
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
          <form id="v8CpForm" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <input class="field" id="v8CpCode" required placeholder="Code (WELCOME10)" style="text-transform:uppercase;">
            <select class="field" id="v8CpType"><option value="percent">% Off</option><option value="flat">Flat ₹ Off</option></select>
            <input class="field" id="v8CpVal" type="number" min="1" required value="10" placeholder="Discount Value">
            <input class="field" id="v8CpMin" type="number" min="0" value="200" placeholder="Min Order ₹">
            <input class="field" id="v8CpMaxDisc" type="number" min="0" value="0" placeholder="Max Disc ₹ (0=no cap)" title="Max discount cap in ₹ (0 = unlimited)">
            <input class="field" id="v8CpMaxUses" type="number" min="0" value="0" placeholder="Max Uses (0=unlimited)" title="Total max redemptions (0 = unlimited)">
            <input class="field" id="v8CpValidTill" type="date" style="grid-column:1/-1;" title="Valid till date (optional)">
            <button type="submit" class="primaryButton" style="grid-column:1/-1;">+ Create Coupon</button>
          </form>
          ${coupons.map((cp) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px;gap:8px;">
            <div>
              <strong>${esc(cp.code)}</strong> (${cp.discount_type==="flat"?"₹"+cp.discount_value:cp.discount_value+"%"} &middot; Min ₹${cp.min_order}${num(cp.max_discount)>0?" &middot; Cap ₹"+cp.max_discount:""})
              <div style="font-size:11px;color:var(--muted,#94a3b8);">Used ${cp.used_count}${num(cp.max_uses)>0?" / "+cp.max_uses:""}${cp.valid_till?" &middot; Till "+cp.valid_till:""}</div>
            </div>
            <button class="secondaryButton" style="padding:4px 8px;font-size:11.5px;" data-cp-tog="${esc(cp.id)}">${cp.is_active?"Active":"Paused"}</button>
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

    document.getElementById("v8CpForm").addEventListener("submit", async (e) => {
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
    document.querySelectorAll('.navItem[data-page^="v8"]').forEach((item) => {
      item.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const pg = item.dataset.page;
        if ((pg === "v8gst" || pg === "v8chain") && typeof isAdmin === "function" && !isAdmin()) return;
        document.querySelectorAll(".navItem").forEach((n) => n.classList.toggle("active", n === item));
        document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === pg));
        const pt = document.getElementById("pageTitle");
        const lbl = item.querySelector("span:not(.navBadge)");
        if (pt && lbl) pt.textContent = lbl.textContent;
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
      setInterval(() => {
        if (!document.hidden && !app.hidden && (typeof S === "undefined" || (S.started && !S.expiring))) loadV8Extras();
      }, 15000);
      return true;
    }
    return false;
  }

  const bootTimer = setInterval(() => { if (tryBootV8()) clearInterval(bootTimer); }, 250);
  window.addEventListener("DOMContentLoaded", () => { if (tryBootV8()) clearInterval(bootTimer); });
})();
