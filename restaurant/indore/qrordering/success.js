"use strict";
/* Order status page. Reads ONLY this guest's own orders (the database enforces ownership). */
(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  const guest = await requireGuest();
  if (!guest) return;

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
    $("#orderId").textContent = o.order_no;
    $("#guestName").textContent = o.customer_name;
    $("#tableNo").textContent = o.table_number;
    $("#itemsList").innerHTML = (o.items || []).map((i) =>
      `<li><span>${esc(i.name)} &times; ${esc(i.qty)}</span><span>${esc(money(num(i.price) * num(i.qty)))}</span></li>`).join("");
    $("#paymentMode").textContent = o.payment_status === "Paid" ? "Paid (" + (o.payment_mode || "") + ")" : "Pay at counter";
    $("#grandTotal").textContent = money(o.total);

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

  await refresh();
})();
