"use strict";
/* Checkout: shows the cart priced by the server, lets the guest adjust it, and sends ONLY item ids and
   quantities. The database re-prices everything, so the amounts shown here are an estimate. */
(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  applyThemePreset(R.theme_color || "gold");
  const guest = await requireGuest();
  if (!guest) return;

  let MENU = [], busy = false, validatingCoupon = false;
  const itemsEl = $("#cartItems"), notice = $("#notice"), errBox = $("#formError"), btn = $("#placeOrderButton");
  const phoneInp = $("#coPhoneInput"), cpInput = $("#couponInput"), cpMsg = $("#couponMsg");

  $("#coRestName").textContent = R.name;
  $("#coRestTag").textContent = R.tagline || "Review & Confirm Order";
  const rLogo = safeUrl(R.logo);
  if (rLogo) { const li = $("#coRestLogo"); li.src = rLogo; li.hidden = false; $("#coLogoIcon").hidden = true; }

  $("#customerName").textContent = guest.name;
  const isDirectMode = guest.orderType === "pickup" || guest.orderType === "delivery";
  if ($("#tableTypeLbl")) $("#tableTypeLbl").textContent = isDirectMode ? "Order Mode" : "Table";
  $("#tableNumber").textContent = guest.orderType === "delivery" ? "Delivery" : guest.orderType === "pickup" ? "Self-Pickup" : guest.table;
  if (guest.phone) phoneInp.value = guest.phone;

  const noTaxRegime = R.tax_regime === "composition" || R.tax_regime === "unregistered";
  $("#gstLabel").textContent = noTaxRegime ? "GST (Exempt / Composition)" : "GST (" + num(R.gst) + "%)";
  const otypeBox = $("#orderTypeBox");
  if (otypeBox) otypeBox.hidden = isDirectMode || R.takeaway_enabled === false;
  const addrBox = $("#directAddrBox"), addrInput = $("#coDeliveryAddress");
  if (addrBox && addrInput) {
    addrBox.hidden = guest.orderType !== "delivery";
    if (guest.deliveryAddress) addrInput.value = guest.deliveryAddress;
    addrInput.addEventListener("input", () => {
      Guest.update((o) => { o.deliveryAddress = addrInput.value.slice(0, 250); });
    });
  }
  if (isDirectMode && $("#payCardTitle") && $("#payCardBody")) {
    $("#payCardTitle").textContent = guest.orderType === "delivery" ? "Pay on Delivery (Cash / UPI QR)" : "Pay on Pickup at Counter";
    $("#payCardBody").textContent = "Zero middleman fees — pay via Cash or Counter UPI QR when collecting or receiving your order.";
  }

  function say(msg) { notice.textContent = msg; notice.hidden = !msg; }
  function showErr(msg) { errBox.textContent = msg || ""; }
  function cleanPhone(v) { return String(v || "").replace(/\D/g, "").slice(0, 10); }

  function renderLoyaltyAndCouponUI(netFood) {
    const g = Guest.get();
    const hasPhone = g.phone && g.phone.length === 10;
    const ban = $("#coLoyaltyBanner");
    if (ban) {
      if (hasPhone && R.loyalty_enabled) {
        const pts = num(g.loyaltyPoints, 0);
        const val = pts * num(R.loyalty_point_value, 1);
        ban.innerHTML = pts > 0
          ? `<i class="fa-solid fa-star"></i> You have <b>${pts} loyalty points</b> (${esc(money(val))} value) &middot; Show this at counter to redeem via WhatsApp OTP.`
          : `<i class="fa-solid fa-star"></i> Earn <b>${num(R.loyalty_earn_per_100, 5)} pts / ₹100</b> paid when settling at counter.`;
        ban.hidden = false;
      } else if (!hasPhone) {
        ban.innerHTML = `<i class="fa-solid fa-circle-info"></i> Enter your 10-digit mobile above to participate in loyalty rewards &amp; apply promo coupons.`;
        ban.hidden = false;
      } else {
        ban.hidden = true;
      }
    }

    const applyBtn = $("#applyCouponBtn"), entryRow = $("#couponEntryRow"), appRow = $("#appliedCouponRow");
    if (!hasPhone) {
      entryRow.hidden = false;
      appRow.hidden = true;
      cpInput.disabled = true;
      applyBtn.disabled = true;
      cpMsg.textContent = "Add your 10-digit mobile number above to unlock & apply promo coupons.";
      cpMsg.className = "couponMsg muted";
      if (g.coupon) Guest.update((o) => { o.coupon = ""; o.couponDiscount = 0; });
    } else if (g.coupon && g.couponDiscount > 0) {
      entryRow.hidden = true;
      appRow.hidden = false;
      $("#appliedCouponCode").textContent = g.coupon;
      $("#appliedCouponAmt").textContent = money(g.couponDiscount);
      cpMsg.textContent = "";
    } else {
      entryRow.hidden = false;
      appRow.hidden = true;
      cpInput.disabled = false;
      applyBtn.disabled = validatingCoupon || netFood <= 0;
    }
  }

  function render() {
    const g = Guest.get();
    const lines = buildLines(g.cart, MENU).filter((l) => l.available);
    if (lines.length === 0) {
      itemsEl.innerHTML = '<div class="empty">Your cart is empty.</div>';
      $("#checkoutBody").hidden = true;
      $("#upsellBox").hidden = true;
      return;
    }
    $("#checkoutBody").hidden = false;
    itemsEl.innerHTML = lines.map((l) => {
      const old = l.offer ? `<s>${esc(money(l.base))}</s> ` : "";
      return `<div class="cartItem" data-key="${esc(l.key)}">
        <div class="itemInfo"><div class="itemName"><span class="vegDot ${l.veg ? "v" : "nv"}"><span></span></span> ${esc(l.name)}</div><div class="itemPrice">${old}${esc(money(l.price))} each</div></div>
        <div class="itemRight">
          <div class="stepper"><button type="button" data-action="dec" data-key="${esc(l.key)}" aria-label="Remove one">&minus;</button><span>${l.qty}</span><button type="button" data-action="inc" data-key="${esc(l.key)}" aria-label="Add one">+</button></div>
          <div class="lineTotal">${esc(money(l.price * l.qty))}</div>
          <button type="button" class="linkBtn" data-action="remove" data-key="${esc(l.key)}">Remove</button>
        </div></div>`;
    }).join("");

    const inCart = new Set(lines.map((l) => l.id));
    const upsells = MENU.filter((m) => m.available && m.is_upsell && !inCart.has(m.id)).slice(0, 4);
    const ubox = $("#upsellBox");
    if (ubox) {
      if (upsells.length) {
        ubox.innerHTML = `<div class="upsellTitle"><i class="fa-solid fa-sparkles"></i> Complete your meal <span>Pairings picked for you</span></div><div class="upsellRow">` +
          upsells.map((u) => {
            const img = safeImageUrl(u.image_url) || DEFAULT_IMAGE;
            return `<div class="upsellCard">
              <img class="uImg" src="${esc(img)}" alt="" decoding="async" referrerpolicy="no-referrer">
              <div class="uMeta">
                <div class="uName"><span class="vegDot ${u.veg ? "v" : "nv"}"><span></span></span> ${esc(u.name)}</div>
                <div class="uPrice">${u.offer_active ? `<del>${esc(money(u.base_price))}</del> ` : ""}${esc(money(u.price))}</div>
              </div>
              <button type="button" class="addBtn small" data-upsell="${esc(u.id)}">+ Add</button>
            </div>`;
          }).join("") + `</div>`;
        ubox.hidden = false;
      } else { ubox.hidden = true; }
    }

    $$(".otBtn").forEach((b) => b.classList.toggle("active", b.dataset.otype === (g.orderType || "dine_in")));

    const baseNet = lines.reduce((s, l) => s + l.price * l.qty, 0);
    renderLoyaltyAndCouponUI(baseNet);

    const t = calcTotals(lines, R.gst, {
      couponDiscount: g.couponDiscount,
      orderType: g.orderType,
      pkgType: R.packaging_charge_type,
      pkgAmt: R.packaging_charge,
      svcPct: R.service_charge_percent,
      taxRegime: R.tax_regime
    });
    $("#subtotal").textContent = money(t.subtotal);
    $("#discRow").hidden = t.discount <= 0;
    $("#discount").textContent = "- " + money(t.discount);
    $("#cpRow").hidden = t.couponDiscount <= 0;
    $("#cpLabel").textContent = g.coupon ? `Coupon (${g.coupon})` : "Coupon Discount";
    $("#couponDisc").textContent = "- " + money(t.couponDiscount);
    $("#pkgRow").hidden = t.packaging <= 0;
    $("#pkgCharge").textContent = money(t.packaging);
    $("#svcRow").hidden = t.serviceCharge <= 0;
    $("#svcCharge").textContent = money(t.serviceCharge);
    const rates = new Set(lines.map((l) => effectiveGstRate(l.gstRate, R.tax_regime, R.gst)));
    $("#gstLabel").textContent = noTaxRegime ? "GST (Exempt / Composition)"
      : rates.size > 1 ? "GST (CGST + SGST)"
      : `GST (${[...rates][0]}%)`;
    $("#taxableRow").hidden = (t.discount <= 0 && t.couponDiscount <= 0 && t.packaging <= 0 && t.serviceCharge <= 0);
    $("#taxableVal").textContent = money(t.taxable);
    $("#gst").textContent = money(t.gst);
    $("#roRow").hidden = Math.abs(t.roundOff) < 0.005;
    $("#roundOff").textContent = (t.roundOff > 0 ? "+" : "") + money(t.roundOff);
    $("#grandTotal").textContent = money(t.total);
  }

  async function revalidateCouponIfPresent() {
    const g = Guest.get();
    if (!g.coupon) return;
    if (!g.phone || g.phone.length < 10) {
      Guest.update((o) => { o.coupon = ""; o.couponDiscount = 0; });
      return;
    }
    const lines = buildLines(g.cart, MENU).filter((l) => l.available);
    const net = lines.reduce((s, l) => s + l.price * l.qty, 0);
    try {
      const res = await rpc("v8_validate_coupon", { p_restaurant: R.id, p_code: g.coupon, p_subtotal: net, p_phone: g.phone });
      if (res && res.ok) {
        Guest.update((o) => { o.coupon = res.code; o.couponDiscount = num(res.discount, 0); });
      } else {
        Guest.update((o) => { o.coupon = ""; o.couponDiscount = 0; });
        cpMsg.textContent = (res && res.message) || "Coupon no longer applies to this cart.";
        cpMsg.className = "couponMsg err";
      }
    } catch (_) {}
  }

  async function loadMenu() {
    try {
      const data = await rpc("get_menu", { p_restaurant: R.id });
      MENU = Array.isArray(data) ? data : [];
      const removed = Guest.removeMissing(new Set(MENU.filter((m) => m.available).map((m) => m.id)));
      if (removed > 0) say("Some items are no longer available and were removed from your cart.");
      await revalidateCouponIfPresent();
    } catch (e) {
      if (e.code === "42501" || e.code === "PGRST301") { goTo("index.html"); return false; }
      itemsEl.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
      return false;
    }
    render();
    return true;
  }

  phoneInp.addEventListener("input", async () => {
    const digits = cleanPhone(phoneInp.value);
    if (phoneInp.value !== digits) phoneInp.value = digits;
    if (digits.length === 10) {
      Guest.update((o) => { o.phone = digits; });
      cpMsg.textContent = "";
      render();
      let pts = 0;
      try {
        const res = await rpc("v8_lookup_customer_by_phone", { p_restaurant: R.id, p_phone: digits });
        if (res && res.ok && res.found) pts = num(res.loyalty_points, 0);
      } catch (_) {}
      if (cleanPhone(phoneInp.value) === digits) {
        Guest.update((o) => { o.phone = digits; o.loyaltyPoints = pts; });
        render();
      }
    } else if (Guest.get().phone) {
      Guest.update((o) => { o.phone = ""; o.loyaltyPoints = 0; o.coupon = ""; o.couponDiscount = 0; });
      render();
    }
  });

  $("#applyCouponBtn").addEventListener("click", async () => {
    if (validatingCoupon) return;
    const g = Guest.get();
    if (!g.phone || g.phone.length < 10) {
      cpMsg.textContent = "Please enter a valid 10-digit mobile number above first.";
      cpMsg.className = "couponMsg err";
      phoneInp.focus();
      return;
    }
    const code = cpInput.value.trim().toUpperCase();
    if (!code) { cpMsg.textContent = "Enter a coupon code."; cpMsg.className = "couponMsg err"; return; }
    const lines = buildLines(g.cart, MENU).filter((l) => l.available);
    const net = lines.reduce((s, l) => s + l.price * l.qty, 0);
    validatingCoupon = true; $("#applyCouponBtn").disabled = true; cpMsg.textContent = "Checking..."; cpMsg.className = "couponMsg muted";
    try {
      const res = await rpc("v8_validate_coupon", { p_restaurant: R.id, p_code: code, p_subtotal: net, p_phone: g.phone });
      if (!res || !res.ok) {
        cpMsg.textContent = (res && res.message) || "Invalid coupon.";
        cpMsg.className = "couponMsg err";
        return;
      }
      Guest.update((o) => { o.coupon = res.code; o.couponDiscount = num(res.discount, 0); });
      cpInput.value = "";
      render();
      showToast(res.message || "Coupon applied!", "success");
    } catch (e) {
      cpMsg.textContent = e.message || "Could not validate coupon.";
      cpMsg.className = "couponMsg err";
    } finally {
      validatingCoupon = false;
      render();
    }
  });
  $("#removeCouponBtn").addEventListener("click", () => {
    Guest.update((o) => { o.coupon = ""; o.couponDiscount = 0; });
    cpMsg.textContent = "";
    render();
  });

  itemsEl.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-action]");
    if (!b) return;
    const k = b.dataset.key, a = b.dataset.action;
    const curLines = buildLines(Guest.get().cart, MENU);
    const ln = curLines.find((x) => x.key === k);
    if (!ln) return;
    if (a === "inc") Guest.setQty(ln.id, ln.qty + 1, ln.variant, ln.modifier, ln.addons);
    else if (a === "dec") Guest.setQty(ln.id, ln.qty - 1, ln.variant, ln.modifier, ln.addons);
    else if (a === "remove") Guest.setQty(ln.id, 0, ln.variant, ln.modifier, ln.addons);
    await revalidateCouponIfPresent();
    render();
  });
  document.addEventListener("click", async (ev) => {
    const ot = ev.target.closest("[data-otype]");
    if (ot) {
      Guest.update((o) => { o.orderType = ot.dataset.otype === "takeaway" ? "takeaway" : "dine_in"; });
      render(); return;
    }
    const u = ev.target.closest("[data-upsell]");
    if (u) {
      Guest.add(u.dataset.upsell, "full");
      await revalidateCouponIfPresent();
      render();
      showToast("Added to order", "success", 1800);
    }
  });
  document.addEventListener("click", (ev) => {
    if (ev.target.closest('[data-action="back"]')) goTo("menu.html");
  });

  btn.addEventListener("click", async () => {
    if (busy) return;
    const phoneDigits = cleanPhone(phoneInp.value);
    if (phoneDigits.length > 0 && phoneDigits.length < 10) {
      showErr("Enter all 10 digits of your mobile number, or leave it blank.");
      phoneInp.focus();
      return;
    }
    const g = Guest.get();
    const isDirect = g.orderType === "pickup" || g.orderType === "delivery";
    if (isDirect && phoneDigits.length < 10) {
      showErr("10-digit mobile number is required for Pickup / Delivery orders.");
      phoneInp.focus();
      return;
    }
    const delAddr = g.orderType === "delivery" && $("#coDeliveryAddress")
      ? $("#coDeliveryAddress").value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 250) : "";
    if (g.orderType === "delivery" && delAddr.length < 8) {
      showErr("Enter your full delivery address (at least 8 characters).");
      if ($("#coDeliveryAddress")) $("#coDeliveryAddress").focus();
      return;
    }
    const lines = buildLines(g.cart, MENU).filter((l) => l.available);
    if (lines.length === 0) { goTo("menu.html"); return; }
    if (g.coupon && !g.phone) {
      showErr("Mobile number is required when a coupon is applied.");
      return;
    }
    const notes = $("#orderNotes").value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 150);
    Guest.update((o) => { o.phone = phoneDigits; if (g.orderType === "delivery") o.deliveryAddress = delAddr; });

    /* the same request id is reused for retries (no duplicate orders); a changed cart gets a new one */
    const sig = JSON.stringify([g.cart.map((i) => [i.id, i.variant || "full", i.modifier || "", i.addons || [], i.qty]), notes, g.table, phoneDigits, g.orderType, g.coupon, delAddr]);
    let rid = g.rid;
    if (!rid || g.ridSig !== sig) { rid = uuid(); Guest.update((o) => { o.rid = rid; o.ridSig = sig; }); }

    busy = true; btn.disabled = true; btn.textContent = "Placing order..."; showErr("");
    try {
      const order = await rpc("place_order", {
        p_restaurant: R.id, p_request_id: rid, p_customer_name: g.name, p_table: g.table,
        p_table_token: g.token || null,
        p_items: g.cart.map((i) => ({ id: i.id, variant: i.variant || "full", modifier: i.modifier || "", addons: i.addons || [], qty: i.qty })),
        p_notes: notes,
        p_phone: phoneDigits || "", p_update_customer_name: g.updateName !== false,
        p_order_type: g.orderType || "dine_in", p_coupon_code: g.coupon || "",
        p_delivery_address: delAddr
      });
      Guest.update((o) => {
        o.cart = []; o.rid = ""; o.ridSig = ""; o.coupon = ""; o.couponDiscount = 0;
        o.orders = [{ id: order.id, no: order.order_no }].concat(o.orders.filter((x) => x.id !== order.id)).slice(0, 10);
        o.last = order.id;
      });
      goTo("success.html");
    } catch (e) {
      showErr(e.message);
      if (e.code === "42501" || e.code === "PGRST301") { setTimeout(() => goTo("index.html"), 1500); }
      else if (/not available|cart|menu|coupon/i.test(e.message)) { await loadMenu(); }
    } finally {
      busy = false; btn.disabled = false; btn.textContent = "Place Order";
    }
  });

  window.addEventListener("pageshow", (ev) => { if (ev.persisted) loadMenu(); });
  if (typeof attachImageFallback === "function") attachImageFallback($("#upsellBox"));
  await loadMenu();
})();
