"use strict";
/* Checkout: shows the cart priced by the server, lets the guest adjust it, and sends ONLY item ids and
   quantities. The database re-prices everything, so the amounts shown here are an estimate. */
(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  applyThemePreset(R.theme_color || "gold");
  const guest = await requireGuest();
  if (!guest) return;

  let MENU = [], busy = false;
  const itemsEl = $("#cartItems"), notice = $("#notice"), errBox = $("#formError"), btn = $("#placeOrderButton");
  $("#customerName").textContent = guest.name;
  $("#tableNumber").textContent = guest.table;
  $("#gstLabel").textContent = "GST (" + num(R.gst) + "%)";

  function say(msg) { notice.textContent = msg; notice.hidden = !msg; }
  function showErr(msg) { errBox.textContent = msg || ""; }

  function render() {
    const lines = buildLines(Guest.get().cart, MENU).filter((l) => l.available);
    if (lines.length === 0) {
      itemsEl.innerHTML = '<div class="empty">Your cart is empty.</div>';
      $("#checkoutBody").hidden = true;
      return;
    }
    $("#checkoutBody").hidden = false;
    itemsEl.innerHTML = lines.map((l) => {
      const old = l.offer ? `<s>${esc(money(l.base))}</s> ` : "";
      return `<div class="cartItem" data-id="${esc(l.id)}" data-variant="${esc(l.variant)}">
        <div class="itemInfo"><div class="itemName">${esc(l.name)}</div><div class="itemPrice">${old}${esc(money(l.price))} each</div></div>
        <div class="itemRight">
          <div class="stepper"><button type="button" data-action="dec" data-id="${esc(l.id)}" data-variant="${esc(l.variant)}" aria-label="Remove one">&minus;</button><span>${l.qty}</span><button type="button" data-action="inc" data-id="${esc(l.id)}" data-variant="${esc(l.variant)}" aria-label="Add one">+</button></div>
          <div class="lineTotal">${esc(money(l.price * l.qty))}</div>
          <button type="button" class="linkBtn" data-action="remove" data-id="${esc(l.id)}" data-variant="${esc(l.variant)}">Remove</button>
        </div></div>`;
    }).join("");
    const inCart = new Set(lines.map((l) => l.id));
    const upsells = MENU.filter((m) => m.available && m.is_upsell && !inCart.has(m.id)).slice(0, 6);
    const ubox = $("#upsellBox");
    if (ubox) {
      if (upsells.length) {
        ubox.innerHTML = `<div class="upsellTitle"><i class="fa-solid fa-sparkles"></i> Complete your meal</div><div class="upsellRow">` +
          upsells.map((u) => `<div class="upsellCard"><div class="uName">${esc(u.name)}</div><div class="uPrice">${esc(money(u.price))}</div><button type="button" class="addBtn small" data-upsell="${esc(u.id)}">+ Add</button></div>`).join("") + `</div>`;
        ubox.hidden = false;
      } else { ubox.hidden = true; }
    }
    const t = calcTotals(lines, R.gst);
    $("#subtotal").textContent = money(t.subtotal);
    $("#discount").textContent = t.discount > 0 ? "- " + money(t.discount) : money(0);
    $("#gst").textContent = money(t.gst);
    $("#grandTotal").textContent = money(t.total);
  }

  async function loadMenu() {
    try {
      const data = await rpc("get_menu", { p_restaurant: R.id });
      MENU = Array.isArray(data) ? data : [];
      const removed = Guest.removeMissing(new Set(MENU.filter((m) => m.available).map((m) => m.id)));
      if (removed > 0) say("Some items are no longer available and were removed from your cart.");
    } catch (e) {
      if (e.code === "42501" || e.code === "PGRST301") { goTo("index.html"); return false; }
      itemsEl.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
      return false;
    }
    render();
    return true;
  }

  itemsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-action]");
    if (!b) return;
    const id = b.dataset.id, v = b.dataset.variant || "full", q = Guest.qty(id, v), a = b.dataset.action;
    if (a === "inc") Guest.setQty(id, q + 1, v);
    else if (a === "dec") Guest.setQty(id, q - 1, v);
    else if (a === "remove") Guest.setQty(id, 0, v);
    render();
  });
  document.addEventListener("click", (ev) => {
    const u = ev.target.closest("[data-upsell]");
    if (u) { Guest.add(u.dataset.upsell, "full"); render(); }
  });
  document.addEventListener("click", (ev) => {
    if (ev.target.closest('[data-action="back"]')) goTo("menu.html");
  });

  btn.addEventListener("click", async () => {
    if (busy) return;
    const g = Guest.get();
    const lines = buildLines(g.cart, MENU).filter((l) => l.available);
    if (lines.length === 0) { goTo("menu.html"); return; }
    const notes = $("#orderNotes").value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 150);

    /* the same request id is reused for retries (no duplicate orders); a changed cart gets a new one */
    const sig = JSON.stringify([g.cart.map((i) => [i.id, i.variant || "full", i.qty]), notes, g.table]);
    let rid = g.rid;
    if (!rid || g.ridSig !== sig) { rid = uuid(); Guest.update((o) => { o.rid = rid; o.ridSig = sig; }); }

    busy = true; btn.disabled = true; btn.textContent = "Placing order..."; showErr("");
    try {
      const order = await rpc("place_order", {
        p_restaurant: R.id, p_request_id: rid, p_customer_name: g.name, p_table: g.table,
        p_table_token: g.token || null, p_items: g.cart.map((i) => ({ id: i.id, variant: i.variant || "full", qty: i.qty })), p_notes: notes
      });
      Guest.update((o) => {
        o.cart = []; o.rid = ""; o.ridSig = "";
        o.orders = [{ id: order.id, no: order.order_no }].concat(o.orders.filter((x) => x.id !== order.id)).slice(0, 10);
        o.last = order.id;
      });
      goTo("success.html");
    } catch (e) {
      showErr(e.message);
      if (e.code === "42501" || e.code === "PGRST301") { setTimeout(() => goTo("index.html"), 1500); }
      else if (/not available|cart|menu/i.test(e.message)) { await loadMenu(); }
    } finally {
      busy = false; btn.disabled = false; btn.textContent = "Place Order";
    }
  });

  window.addEventListener("pageshow", (ev) => { if (ev.persisted) loadMenu(); });
  await loadMenu();
})();
