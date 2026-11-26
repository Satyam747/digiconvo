"use strict";
let CART = [], appliedCoupon = { code: "", discount: 0 }, reqId = makeRequestId();

function changeQty(idx, delta) {
  CART[idx].qty += delta;
  if (CART[idx].qty <= 0) CART.splice(idx, 1);
  saveCart(CART); renderCart();
}

async function applyCoupon() {
  const code = document.getElementById("couponInput").value.trim().toUpperCase();
  if (!code) return;
  const sub = CART.reduce((s, c) => s + c.qty * c.unit_price, 0);
  const { data } = await sb.rpc("validate_coupon", { p_restaurant: R.id, p_code: code, p_subtotal: sub });
  if (!data || !data.success) { showToast((data && data.message) || "Invalid coupon.", "error"); appliedCoupon = { code: "", discount: 0 }; }
  else { appliedCoupon = { code: data.code, discount: Number(data.discount || 0) }; showToast(data.message, "success"); }
  renderSummary();
}

function renderCart() {
  if (!CART.length) {
    document.getElementById("cartItemsBox").innerHTML = `<div style="text-align:center;color:#64748b;padding:18px;">Your cart is empty.</div>`;
    document.getElementById("placeBtn").disabled = true;
    renderSummary(); return;
  }
  document.getElementById("placeBtn").disabled = false;
  document.getElementById("cartItemsBox").innerHTML = CART.map((c, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <div>
        <div style="font-weight:700;font-size:14px;">${escapeHTML(c.name)} ${c.portion === "half" ? "(Half)" : ""}</div>
        ${c.addons.length ? `<div style="font-size:11.5px;color:#0284c7;">+ ${escapeHTML(c.addons.join(", "))}</div>` : ""}
        ${c.modifier ? `<div style="font-size:11.5px;color:#64748b;">[${escapeHTML(c.modifier)}]</div>` : ""}
        <div style="font-size:12.5px;color:#334155;">${money(c.unit_price)} × ${c.qty} = <strong>${money(c.unit_price * c.qty)}</strong></div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn btn-soft" style="padding:4px 10px;" onclick="changeQty(${i},-1)">−</button>
        <strong>${c.qty}</strong>
        <button class="btn btn-soft" style="padding:4px 10px;" onclick="changeQty(${i},1)">+</button>
      </div>
    </div>`).join("");
  renderSummary();
}

function renderSummary() {
  const gm = getGuestMeta();
  const sub = CART.reduce((s, c) => s + c.qty * c.unit_price, 0);
  const disc = Math.min(appliedCoupon.discount || 0, sub);
  const usePts = document.getElementById("useLoyaltyChk").checked ? Number(gm.loyalty_points || 0) : 0;
  const loyDisc = Math.min(usePts * Number(R.loyalty_point_value || 1), Math.max(sub - disc, 0));
  const pkg = gm.orderType !== "dine_in" ? (R.packaging_charge_type === "flat" ? Number(R.packaging_charge || 0) : R.packaging_charge_type === "per_item" ? Number(R.packaging_charge || 0) * CART.reduce((s, c) => s + c.qty, 0) : 0) : 0;
  const svc = gm.orderType === "dine_in" && Number(R.service_charge_percent || 0) > 0 ? Math.max(sub - disc - loyDisc, 0) * Number(R.service_charge_percent) / 100 : 0;
  const taxable = Math.max(sub - disc - loyDisc + pkg + svc, 0);
  const gstRate = (R.tax_regime === "composition" || R.tax_regime === "unregistered") ? 0 : R.tax_regime === "specified_18" ? 18 : Number(R.gst_percent || 5);
  const gst = taxable * gstRate / 100;
  const total = Math.round(taxable + gst);
  document.getElementById("summaryBox").innerHTML = `
    <div style="font-size:13px;line-height:1.9;">
      <div style="display:flex;justify-content:space-between;"><span>Item Subtotal</span><span>${money(sub)}</span></div>
      ${disc > 0 ? `<div style="display:flex;justify-content:space-between;color:#059669;"><span>Coupon (${escapeHTML(appliedCoupon.code)})</span><span>-${money(disc)}</span></div>` : ""}
      ${loyDisc > 0 ? `<div style="display:flex;justify-content:space-between;color:#059669;"><span>Loyalty Redemption</span><span>-${money(loyDisc)}</span></div>` : ""}
      ${pkg > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Packaging Charge</span><span>${money(pkg)}</span></div>` : ""}
      ${svc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Service Charge (${R.service_charge_percent}%, optional)</span><span>${money(svc)}</span></div>` : ""}
      ${gst > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Est. GST (CGST+SGST)</span><span>${money(gst)}</span></div>` : `<div style="font-size:11.5px;color:#64748b;">${R.tax_regime === "composition" ? "Composition Scheme — No GST collected" : "No GST applicable"}</div>`}
      <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;border-top:1px solid #e2e8f0;margin-top:6px;padding-top:6px;"><span>Est. Total</span><span>${money(total)}</span></div>
    </div>`;
}

async function submitOrder() {
  if (!CART.length) return;
  const btn = document.getElementById("placeBtn"); btn.disabled = true; btn.textContent = "Sending to Kitchen...";
  const gm = getGuestMeta();
  try {
    const { data, error } = await sb.rpc("place_order", {
      p_restaurant: R.id,
      p_guest_token: getGuestToken(),
      p_payload: {
        request_id: reqId,
        order_type: gm.orderType || "dine_in",
        table_number: gm.table || "TAKEAWAY",
        customer_name: gm.name || "Guest",
        customer_phone: gm.phone || "",
        customer_gstin: document.getElementById("ckGstin").value.trim(),
        customer_legal_name: document.getElementById("ckLegal").value.trim(),
        coupon_code: appliedCoupon.code,
        use_loyalty_points: document.getElementById("useLoyaltyChk").checked ? Number(gm.loyalty_points || 0) : 0,
        notes: document.getElementById("ckNotes").value.trim(),
        items: CART.map((c) => ({ menu_id: c.menu_id, portion: c.portion, qty: c.qty, addons: c.addons, modifier: c.modifier }))
      }
    });
    if (error || !data || !data.success) { showToast((data && data.message) || (error && error.message) || "Order failed.", "error"); return; }
    clearCart();
    showToast(data.appended_to_tab ? `Added ${data.kot_no} to your table tab!` : `Order sent (${data.kot_no})!`, "success");
    window.location.href = `success.html?restaurant=${encodeURIComponent(R.slug)}`;
  } finally { btn.disabled = false; btn.textContent = "Place Order to Kitchen →"; }
}

Object.assign(window, { changeQty, applyCoupon, renderSummary, submitOrder });

(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  document.getElementById("backMenu").href = `menu.html?restaurant=${encodeURIComponent(R.slug)}`;
  const gm = getGuestMeta();
  if (R.loyalty_enabled && Number(gm.loyalty_points || 0) > 0) {
    document.getElementById("loyaltyBox").classList.remove("hidden");
    document.getElementById("loyaltyLabel").textContent = `Redeem ${gm.loyalty_points} Loyalty Points (Save ${money(gm.loyalty_points * Number(R.loyalty_point_value || 1))})`;
  }
  CART = getCart();
  renderCart();
})();
