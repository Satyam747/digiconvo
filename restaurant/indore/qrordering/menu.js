"use strict";
/* Menu page. Names, prices and offers are fetched from the server every minute; the cart only
   remembers item ids and quantities, so nothing a guest edits in the browser can change a price. */
(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  const guest = await requireGuest();
  if (!guest) return;

  let MENU = [], CATEGORY = "", QUERY = "", loading = false;
  const productsEl = $("#products"), catsEl = $("#categories"), notice = $("#notice"), bar = $("#cartBar");

  $("#customerName").textContent = "Hi, " + guest.name;
  $("#restaurantName").textContent = R.name;
  $("#tableNo").textContent = "Table " + guest.table;

  function say(msg) { notice.textContent = msg; notice.hidden = !msg; }

  function actionHtml(m) {
    if (!m.available) return '<span class="badge out">Out of stock</span>';
    const q = Guest.qty(m.id);
    if (q === 0) return `<button class="addBtn" type="button" data-action="add" data-id="${esc(m.id)}">Add</button>`;
    return `<div class="stepper"><button type="button" data-action="dec" data-id="${esc(m.id)}" aria-label="Remove one">&minus;</button>` +
           `<span>${q}</span><button type="button" data-action="add" data-id="${esc(m.id)}" aria-label="Add one">+</button></div>`;
  }
  function cardHtml(m) {
    const img = safeUrl(m.image_url) || DEFAULT_IMAGE;
    const badges = (m.veg ? '<span class="badge veg">VEG</span>' : '<span class="badge nonveg">NON-VEG</span>') +
      (m.offer_active ? '<span class="badge offer">Special offer</span>' : "") +
      (!m.available ? '<span class="badge out">Out of stock</span>' : "");
    const old = m.offer_active ? `<span class="oldPrice">${esc(money(m.base_price))}</span>` : "";
    return `<div class="card" data-id="${esc(m.id)}">
      <img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <div class="info">
        <div class="badges">${badges}</div>
        <div class="name">${esc(m.name)}</div>
        ${m.description ? `<div class="desc">${esc(m.description)}</div>` : ""}
        <div class="price">${old}${esc(money(m.price))}</div>
        <div class="action">${actionHtml(m)}</div>
      </div></div>`;
  }

  function renderCategories() {
    const rawCats = [...new Set(MENU.map((m) => m.category))];
    const cats = rawCats.length > 1 ? ["All", ...rawCats] : rawCats;
    if (!cats.includes(CATEGORY)) CATEGORY = cats[0] || "";
    catsEl.innerHTML = cats.map((c) =>
      `<button type="button" class="category ${c === CATEGORY ? "active" : ""}" data-action="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    catsEl.hidden = !!QUERY || cats.length === 0;
  }
  function renderProducts() {
    if (!R.active) { productsEl.innerHTML = '<div class="loading">This restaurant is not available right now.</div>'; return; }
    const q = QUERY.trim().toLowerCase();
    const items = MENU.filter((m) => q
      ? (m.name + " " + m.description + " " + m.category).toLowerCase().includes(q)
      : (CATEGORY === "All" || m.category === CATEGORY));
    productsEl.innerHTML = items.length ? items.map(cardHtml).join("")
      : `<div class="loading">${MENU.length ? "No dishes found." : "The menu is empty right now."}</div>`;
  }
  function updateCartBar() {
    const lines = buildLines(Guest.get().cart, MENU).filter((l) => l.available);
    const count = lines.reduce((s, l) => s + l.qty, 0);
    bar.hidden = count === 0;
    if (count === 0) return;
    $("#cartItems").textContent = count + (count === 1 ? " item" : " items");
    $("#cartTotal").textContent = money(calcTotals(lines, R.gst).total);
  }
  function refreshCard(id) {
    const m = MENU.find((x) => x.id === id), card = productsEl.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (m && card) card.querySelector(".action").innerHTML = actionHtml(m);
    updateCartBar();
  }

  function reconcile() {
    const ok = new Set(MENU.filter((m) => m.available).map((m) => m.id));
    const removed = Guest.removeMissing(ok);
    if (removed > 0) say("Some items in your cart are no longer available and were removed.");
  }

  async function loadMenu(silent) {
    if (loading) return;
    loading = true;
    try {
      const data = await rpc("get_menu", { p_restaurant: R.id });
      MENU = Array.isArray(data) ? data : [];
      reconcile(); renderCategories(); renderProducts(); updateCartBar();
    } catch (e) {
      if (e.code === "42501" || e.code === "PGRST301") { goTo("index.html"); return; }
      if (!silent) productsEl.innerHTML = `<div class="loading">${esc(e.message)}</div>`;
    } finally { loading = false; }
  }

  productsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-action]");
    if (!b) return;
    const id = b.dataset.id, m = MENU.find((x) => x.id === id);
    if (!m || !m.available) return;
    if (b.dataset.action === "add") Guest.add(id);
    else if (b.dataset.action === "dec") Guest.setQty(id, Guest.qty(id) - 1);
    refreshCard(id);
  });
  catsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest('[data-action="cat"]');
    if (!b) return;
    CATEGORY = b.dataset.cat; renderCategories(); renderProducts();
  });
  $("#searchBox").addEventListener("input", debounce((ev) => { QUERY = ev.target.value; renderCategories(); renderProducts(); }, 150));
  const trackBtn = $("#trackOrderBtn");
  if (trackBtn) {
    trackBtn.addEventListener("click", () => goTo("success.html"));
    rpc("my_orders", { p_restaurant: R.id, p_limit: 5 }).then((list) => {
      if (Array.isArray(list) && list.some((o) => ["Pending", "Preparing", "Ready", "Served"].includes(o.status))) {
        trackBtn.hidden = false;
      }
    }).catch(() => {});
  }
  $("#tableNo").addEventListener("click", () => {
    const g = Guest.get();
    const u = new URL("index.html", location.href);
    u.search = "";
    u.searchParams.set("restaurant", currentSlug());
    if (g.table) u.searchParams.set("table", g.table);
    if (g.token) u.searchParams.set("k", g.token);
    location.href = u.href;
  });
  bar.addEventListener("click", () => goTo("checkout.html"));
  productsEl.addEventListener("error", (ev) => {
    if (ev.target && ev.target.tagName === "IMG" && ev.target.src !== DEFAULT_IMAGE) ev.target.src = DEFAULT_IMAGE;
  }, true);

  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadMenu(true); });
  window.addEventListener("pageshow", (ev) => { if (ev.persisted) loadMenu(true); });
  setInterval(() => { if (!document.hidden) loadMenu(true); }, 60000);

  await loadMenu(false);
})();
