"use strict";
/* Order status page. Reads ONLY this guest's own orders (the database enforces ownership). */
(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  applyThemePreset(R.theme_color || "gold");
  const guest = await requireGuest();
  if (!guest) return;

  $("#sucRestName").textContent = R.name;
  $("#sucRestTag").textContent = R.tagline || "Live Order Status";
  const sLogo = safeUrl(R.logo);
  if (sLogo) { const li = $("#sucRestLogo"); li.src = sLogo; li.hidden = false; $("#sucLogoIcon").hidden = true; }

  const ACTIVE = ["Pending", "Preparing", "Ready", "Served"];
  const STEPS = ["Pending", "Preparing", "Ready", "Served", "Completed"];
  const STATUS = {
    Pending:   { title: "Order Placed",      icon: "fa-check",        color: "#f59e0b", label: "Order Received", note: "Your order has been sent to the kitchen." },
    Preparing: { title: "Being Prepared",    icon: "fa-fire-burner",  color: "#3b82f6", label: "Preparing",      note: "Our chefs are preparing your food." },
    Ready:     { title: "Almost There",      icon: "fa-bell-concierge", color: "#8b5cf6", label: "Ready",        note: "Your order is ready and will be served shortly." },
    Served:    { title: "Enjoy Your Meal",   icon: "fa-utensils",     color: "#10b981", label: "Served",         note: "Enjoy! You can pay at the counter when you are done." },
    Completed: { title: "Thank You!",        icon: "fa-heart",        color: "#10b981", label: "Completed",      note: "Payment received. We hope to see you again soon." },
    Cancelled: { title: "Order Cancelled",   icon: "fa-xmark",        color: "#ef4444", label: "Cancelled",      note: "This order was cancelled. Please ask our staff if you need help." }
  };

  let ORDERS = [], SELECTED = guest.last, timer = null, refreshing = false;
  const stepLabel = { Pending: "Received", Preparing: "Preparing", Ready: "Ready", Served: "Served", Completed: "Paid" };

  function selected() { return ORDERS.find((o) => o.id === SELECTED) || ORDERS[0] || null; }

  function waMessage(o) {
    const modeLbl = o.order_type === "delivery" ? "Type: Home Delivery" : o.order_type === "pickup" ? "Type: Self-Pickup" : o.order_type === "takeaway" ? "Type: Takeaway" : "Table: " + o.table_number;
    const lines = ["*New order - " + R.name + "*", "Order: " + o.order_no, modeLbl, "Name: " + o.customer_name, ""];
    if (o.delivery_address) lines.push("Address: " + o.delivery_address, "");
    (o.items || []).forEach((i) => lines.push("- " + i.name + " x " + i.qty));
    lines.push("", "Total: " + money(o.total));
    return lines.join("\n");
  }

  function render() {
    const o = selected();
    if (!o) {
      $("#statusTitle").textContent = "No recent order";
      $("#statusNote").textContent = "We could not find an order from this device in the last 24 hours.";
      $("#orderStatus").hidden = true; $("#tracker").hidden = true; $("#statusIcon").hidden = true;
      $("#keepOpen").hidden = true;
      return;
    }
    const s = STATUS[o.status] || STATUS.Pending;
    const iconBox = $("#statusIcon");
    iconBox.style.color = s.color; iconBox.innerHTML = `<i class="fa-solid ${s.icon}"></i>`;
    $("#statusTitle").textContent = s.title;
    $("#statusNote").textContent = s.note;
    const pill = $("#orderStatus"); pill.textContent = s.label; pill.style.color = s.color;

    const tr = $("#tracker");
    if (o.status === "Cancelled") tr.innerHTML = "";
    else {
      const idx = STEPS.indexOf(o.status);
      tr.innerHTML = STEPS.map((st, i) =>
        `<div class="step ${i < idx ? "done" : ""} ${i === idx ? "now done" : ""}"><div class="dot"></div>${esc(stepLabel[st])}</div>`).join("");
    }

    $("#orderCard").hidden = false;
    $("#orderId").textContent = o.order_no + (o.order_type === "takeaway" ? " (Takeaway)" : o.order_type === "pickup" ? " (Pickup)" : o.order_type === "delivery" ? " (Delivery)" : "");
    $("#guestName").textContent = o.customer_name;
    const ph = o.customer_phone || guest.phone || "";
    $("#sucPhoneRow").hidden = !ph;
    if (ph) $("#guestPhone").textContent = ph;
    if ($("#sucAddrRow")) {
      $("#sucAddrRow").hidden = !o.delivery_address;
      if (o.delivery_address) $("#deliveryAddrVal").textContent = o.delivery_address;
    }
    if ($("#tableLabelSuc")) $("#tableLabelSuc").textContent = (o.order_type === "pickup" || o.order_type === "delivery") ? "Mode" : "Table";
    $("#tableNo").textContent = o.order_type === "delivery" ? "Delivery" : o.order_type === "pickup" ? "Self-Pickup" : o.table_number;
    $("#itemsList").innerHTML = (o.items || []).map((i) => {
      const unitOrig = num(i.original_price ?? i.price);
      return `<li><span>${esc(i.name)} &times; ${esc(i.qty)}</span><span>${esc(money(unitOrig * num(i.qty)))}</span></li>`;
    }).join("");
    const bRows = [];
    if (num(o.discount) > 0) bRows.push(`<div class="row"><span class="label">Menu Offers</span><span class="value saveVal">-${esc(money(o.discount))}</span></div>`);
    if (num(o.coupon_discount) > 0) bRows.push(`<div class="row"><span class="label">Coupon (${esc(o.coupon_code || "PROMO")})</span><span class="value saveVal">-${esc(money(o.coupon_discount))}</span></div>`);
    if (num(o.loyalty_discount) > 0) bRows.push(`<div class="row"><span class="label">Loyalty (${num(o.loyalty_points_used, 0)} pts)</span><span class="value saveVal">-${esc(money(o.loyalty_discount))}</span></div>`);
    if (num(o.manual_discount) > 0) bRows.push(`<div class="row"><span class="label">Counter Discount</span><span class="value saveVal">-${esc(money(o.manual_discount))}</span></div>`);
    if (num(o.packaging_charge) > 0) bRows.push(`<div class="row"><span class="label">Packaging</span><span class="value">${esc(money(o.packaging_charge))}</span></div>`);
    if (num(o.service_charge) > 0) bRows.push(`<div class="row"><span class="label">Service Charge</span><span class="value">${esc(money(o.service_charge))}</span></div>`);
    if (num(o.gst) > 0) bRows.push(`<div class="row"><span class="label">GST (incl. CGST+SGST)</span><span class="value">${esc(money(o.gst))}</span></div>`);
    if (Math.abs(num(o.round_off)) >= 0.005) bRows.push(`<div class="row"><span class="label">Round Off</span><span class="value">${esc((num(o.round_off) > 0 ? "+" : "") + money(o.round_off))}</span></div>`);
    $("#billBreakdown").innerHTML = bRows.join("");
    $("#paymentMode").textContent = o.is_nc ? "Complimentary (NC)" : o.payment_status === "Paid" ? "Paid (" + (o.payment_mode || "") + ")" : o.payment_status === "Credit" ? "Credit (Khata)" : o.order_type === "delivery" ? "Pay on Delivery" : o.order_type === "pickup" ? "Pay at Pickup Counter" : "Pay at counter";
    $("#grandTotal").textContent = o.is_nc ? "₹0.00 (NC)" : money(o.total);

    const loyBox = $("#sucLoyaltyNote");
    if (loyBox) {
      if (R.loyalty_enabled && ph) {
        const pts = num(guest.loyaltyPoints, 0);
        loyBox.innerHTML = num(o.loyalty_discount) > 0
          ? `<i class="fa-solid fa-star"></i> <b>${num(o.loyalty_points_used, 0)} loyalty points</b> redeemed on this bill (-${esc(money(o.loyalty_discount))}).`
          : pts > 0
            ? `<i class="fa-solid fa-star"></i> You have <b>${pts} loyalty points</b> &middot; Contact counter to redeem via WhatsApp OTP when paying.`
            : `<i class="fa-solid fa-star"></i> Earn <b>${num(R.loyalty_earn_per_100, 5)} pts / ₹100</b> paid at settlement.`;
        loyBox.hidden = false;
      } else {
        loyBox.hidden = true;
      }
    }

    const others = ORDERS.filter((x) => x.id !== o.id);
    const oo = $("#otherOrders");
    oo.hidden = others.length === 0;
    oo.innerHTML = others.length ? "<h3>Your other orders</h3>" + others.map((x) =>
      `<button type="button" class="orderChip" data-action="select" data-id="${esc(x.id)}"><span>${esc(x.order_no)} &middot; ${esc(money(x.total))}</span><span class="chipStatus" style="color:${esc((STATUS[x.status] || STATUS.Pending).color)}">${esc((STATUS[x.status] || STATUS.Pending).label)}</span></button>`).join("") : "";

    const wa = normalizeWhatsApp(R.whatsapp), waBtn = $("#whatsappBtn");
    waBtn.hidden = !wa || o.status === "Cancelled";
    if (wa) waBtn.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(waMessage(o));
    const review = safeUrl(R.review_link), rBtn = $("#reviewBtn");
    rBtn.hidden = !(review && o.status === "Completed");
    if (review) rBtn.href = review;
    $("#keepOpen").hidden = !ACTIVE.includes(o.status);
    const moreBtn = $('[data-action="more"]');
    if (moreBtn) moreBtn.hidden = !ACTIVE.includes(o.status);
    const gstBtn = $("#addGstinBtn");
    if (gstBtn) {
      gstBtn.hidden = !(ACTIVE.includes(o.status) && o.payment_status === "Unpaid" && !o.is_nc);
      gstBtn.innerHTML = o.customer_gstin
        ? `<i class="fa-solid fa-file-invoice"></i> GSTIN Added: ${esc(o.customer_gstin)}`
        : `<i class="fa-solid fa-file-invoice"></i> Add Company GSTIN (B2B Bill)`;
    }
  }

  let rtSubscribed = false;
  function schedule() {
    clearTimeout(timer);
    const hasKitchenActive = ORDERS.some((o) => ["Pending", "Preparing", "Ready"].includes(o.status));
    const hasServedActive = ORDERS.some((o) => o.status === "Served");
    if (!hasKitchenActive && !hasServedActive) return;
    const delay = hasKitchenActive ? (rtSubscribed ? 18000 : 10000) : 25000;
    timer = setTimeout(() => { if (document.hidden) schedule(); else refresh(); }, delay);
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const data = await rpc("my_orders", { p_restaurant: R.id, p_limit: 10 });
      ORDERS = Array.isArray(data) ? data : [];
      if (!ORDERS.some((o) => o.id === SELECTED)) SELECTED = ORDERS.length ? ORDERS[0].id : "";
      render();
    } catch (e) {
      if (e.code === "42501" || e.code === "PGRST301") { goTo("index.html"); return; }
      /* temporary network problem: keep what we have and try again */
    } finally { refreshing = false; schedule(); }
  }

  const gstBtnEl = $("#addGstinBtn");
  if (gstBtnEl) gstBtnEl.addEventListener("click", async () => {
    const o = selected();
    if (!o || o.payment_status !== "Unpaid" || o.is_nc) return;
    let gstin = o.customer_gstin || "", legal = o.customer_legal_name || "";
    const choice = await Dialog.open({
      title: "Business GST Tax Invoice (B2B)",
      body: `<label class="dlgLabel">Company 15-Char GSTIN *</label><input id="sucGstinIn" class="dlgInput" maxlength="15" style="text-transform:uppercase;" value="${esc(gstin)}" placeholder="23AAAAA0000A1Z5">
        <label class="dlgLabel" style="margin-top:8px;display:block;">Legal / Firm Name (Optional)</label><input id="sucLegalIn" class="dlgInput" maxlength="80" value="${esc(legal)}" placeholder="Company name">`,
      buttons: [{ id: "cancel", label: "Cancel" }, { id: "save", label: "Save GSTIN", kind: "primaryButton" }],
      onClick(bid) {
        if (bid !== "save") return;
        gstin = String($("#sucGstinIn").value || "").trim().toUpperCase();
        legal = String($("#sucLegalIn").value || "").trim();
        if (!gstin || (typeof isValidGstin === "function" && !isValidGstin(gstin))) {
          return { error: "Enter a valid 15-character GSTIN (e.g. 23AAAAA0000A1Z5)." };
        }
      }
    });
    if (choice !== "save") return;
    try {
      const res = await rpc("v8_attach_guest_meta", {
        p_restaurant: R.id, p_order_id: o.id, p_phone: o.customer_phone || guest.phone || "",
        p_name: o.customer_name || guest.name || "", p_order_type: o.order_type || "dine_in",
        p_customer_gstin: gstin, p_customer_legal_name: legal
      });
      if (res && res.ok === false) { showToast(res.message || "Could not update GSTIN.", "error"); return; }
      showToast("Company GSTIN saved for your invoice!", "success");
      await refresh();
    } catch (e) { showToast((e && e.message) || "Failed to save GSTIN.", "error"); }
  });

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action;
    if (a === "select") { SELECTED = b.dataset.id; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (a === "more") goTo("menu.html");
    else if (a === "newguest") { Guest.clear(); goTo("index.html"); }
  });
  let lastVisSync = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (Date.now() - lastVisSync) > 5000) { lastVisSync = Date.now(); refresh(); }
  });

  async function startRealtime() {
    try {
      const sess = await getSession();
      const uid = sess && sess.user && sess.user.id;
      if (!uid) return;
      sb.channel("guest-orders-" + uid.slice(0, 8))
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "customer_uid=eq." + uid }, () => refresh())
        .subscribe((st) => { rtSubscribed = st === "SUBSCRIBED"; });
    } catch (_) { /* smart polling fallback remains active */ }
  }

  await refresh();
  lastVisSync = Date.now();
  startRealtime();
})();
