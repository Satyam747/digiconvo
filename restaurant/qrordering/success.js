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
    const lines = ["*New order - " + R.name + "*", "Order: " + o.order_no, "Table: " + o.table_number, "Name: " + o.customer_name, ""];
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
    $("#orderId").textContent = o.order_no + (o.order_type === "takeaway" ? " (Takeaway)" : "");
    $("#guestName").textContent = o.customer_name;
    const ph = o.customer_phone || guest.phone || "";
    $("#sucPhoneRow").hidden = !ph;
    if (ph) $("#guestPhone").textContent = ph;
    $("#tableNo").textContent = o.table_number;
    $("#itemsList").innerHTML = (o.items || []).map((i) => {
      const unitOrig = num(i.original_price ?? i.price);
      return `<li><span>${esc(i.name)} &times; ${esc(i.qty)}</span><span>${esc(money(unitOrig * num(i.qty)))}</span></li>`;
    }).join("");
    const bRows = [];
    if (num(o.discount) > 0) bRows.push(`<div class="row"><span class="label">Menu Offers</span><span class="value saveVal">-${esc(money(o.discount))}</span></div>`);
    if (num(o.coupon_discount) > 0) bRows.push(`<div class="row"><span class="label">Coupon (${esc(o.coupon_code || "PROMO")})</span><span class="value saveVal">-${esc(money(o.coupon_discount))}</span></div>`);
    if (num(o.loyalty_discount) > 0) bRows.push(`<div class="row"><span class="label">Loyalty (${num(o.loyalty_points_used, 0)} pts)</span><span class="value saveVal">-${esc(money(o.loyalty_discount))}</span></div>`);
    if (num(o.packaging_charge) > 0) bRows.push(`<div class="row"><span class="label">Packaging</span><span class="value">${esc(money(o.packaging_charge))}</span></div>`);
    if (num(o.service_charge) > 0) bRows.push(`<div class="row"><span class="label">Service Charge</span><span class="value">${esc(money(o.service_charge))}</span></div>`);
    if (num(o.gst) > 0) bRows.push(`<div class="row"><span class="label">GST (incl. CGST+SGST)</span><span class="value">${esc(money(o.gst))}</span></div>`);
    if (Math.abs(num(o.round_off)) >= 0.005) bRows.push(`<div class="row"><span class="label">Round Off</span><span class="value">${esc((num(o.round_off) > 0 ? "+" : "") + money(o.round_off))}</span></div>`);
    $("#billBreakdown").innerHTML = bRows.join("");
    $("#paymentMode").textContent = o.is_nc ? "Complimentary (NC)" : o.payment_status === "Paid" ? "Paid (" + (o.payment_mode || "") + ")" : "Pay at counter";
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
  }

  function schedule() {
    clearTimeout(timer);
    if (!ORDERS.some((o) => ACTIVE.includes(o.status))) return;
    timer = setTimeout(() => { if (document.hidden) schedule(); else refresh(); }, 5000);
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

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action;
    if (a === "select") { SELECTED = b.dataset.id; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (a === "more") goTo("menu.html");
    else if (a === "newguest") { Guest.clear(); goTo("index.html"); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  function startRealtime() {
    try {
      sb.channel("guest-orders-" + R.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "restaurant_id=eq." + R.id }, () => refresh())
        .subscribe();
    } catch (_) { /* 5s polling fallback remains active */ }
  }

  await refresh();
  startRealtime();
})();
