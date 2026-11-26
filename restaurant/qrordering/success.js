"use strict";
let ORDERS = [];

function printGuestBill(idx) {
  const o = ORDERS[idx]; if (!o) return;
  printHtmlDocument(o.invoice_no || o.order_no, buildGstBillHtml(o, R, o.payment_status !== "Paid"));
}

async function rateOrder(idx, stars) {
  const o = ORDERS[idx]; if (!o) return;
  let comment = "";
  if (stars <= 3) comment = prompt("We're sorry! Tell the manager what we can improve right away:") || "";
  const { data } = await sb.rpc("submit_guest_feedback", { p_restaurant: R.id, p_order_id: o.id, p_rating: stars, p_comment: comment, p_guest_token: getGuestToken() });
  if (data && data.route_to_google && data.review_link) {
    showToast("Thank you for the 5★ love! Opening Google Reviews...", "success");
    window.open(data.review_link, "_blank", "noopener");
  } else {
    showToast("Thank you! Your feedback has been sent directly to the manager.", "success");
  }
  loadOrders();
}

async function loadOrders() {
  const { data } = await sb.rpc("my_guest_orders", { p_restaurant: R.id, p_guest_token: getGuestToken() });
  ORDERS = (data && data.orders) || [];
  document.getElementById("ordersBox").innerHTML = ORDERS.map((o, idx) => {
    const upi = (R.upi_id && o.payment_status === "Unpaid" && Number(o.total || 0) > 0)
      ? buildUpiUri(R.upi_id, R.name, o.total, o.order_no) : "";
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div><strong>${escapeHTML(o.invoice_no || ("Order #" + o.order_no))}</strong> • <span style="font-size:12px;color:#64748b;">${escapeHTML(o.order_type === "dine_in" ? "Table " + o.table_number : o.order_type.toUpperCase())}</span></div>
        <span style="padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:800;background:${o.status==="Completed"?"#dcfce7":"#fef3c7"};color:${o.status==="Completed"?"#166534":"#92400e"};">${escapeHTML(o.status)} • ${escapeHTML(o.payment_status)}</span>
      </div>
      <div style="font-size:13px;color:#334155;margin-bottom:8px;">
        ${(o.cart || []).map((i) => `<div>• ${escapeHTML(i.name)} × ${i.qty} — ${money(i.line_total)}</div>`).join("")}
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14.5px;border-top:1px solid #e2e8f0;padding-top:6px;">
        <span>Total (${o.cgst > 0 ? "Incl. GST" : "Net"})</span><span>${o.is_nc ? "₹0 (NC)" : money(o.total)}</span>
      </div>
      ${upi ? `<div style="margin-top:10px;text-align:center;background:#f8fafc;padding:10px;border-radius:10px;">
        <a href="${upi}" class="btn" style="margin-bottom:6px;">Pay ${money(o.total)} via UPI App</a>
        <div style="font-size:11px;color:#64748b;">Or scan QR at counter • ${escapeHTML(R.upi_id)}</div>
      </div>` : ""}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button class="btn btn-soft" onclick="printGuestBill(${idx})">${o.invoice_no ? "GST Tax Invoice" : "Provisional Bill"}</button>
      </div>
      ${!o.rating ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1;text-align:center;">
        <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">How was your experience? Tap to rate:</div>
        ${[1,2,3,4,5].map((st) => `<span class="star on" onclick="rateOrder(${idx},${st})">⭐</span>`).join("")}
      </div>` : `<div style="margin-top:8px;font-size:12px;color:#059669;font-weight:700;">Rated ${o.rating}/5 ★ — Thank you!</div>`}
    </div>`;
  }).join("") || `<div class="card" style="text-align:center;color:#64748b;padding:28px;">No orders placed yet. Tap "+ Order More" to browse the menu!</div>`;
}

Object.assign(window, { printGuestBill, rateOrder });

(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  document.getElementById("sRest").textContent = R.name;
  document.getElementById("orderMoreLink").href = `menu.html?restaurant=${encodeURIComponent(R.slug)}`;
  await loadOrders();
  setInterval(() => { if (!document.hidden) loadOrders(); }, 10000);
})();
