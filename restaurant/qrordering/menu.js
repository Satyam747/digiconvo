"use strict";
/* Live Menu page with QR-Only Menu visual polish (Smart Filters, Offer Carousel, Dish Lightbox,
   Half/Full portion pills, Golden Glow specials, Category Jump FAB) + v7 server-priced cart. */
(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  applyThemePreset(R.theme_color || "gold");
  const guest = await requireGuest();
  if (!guest) return;

  let MENU = [], CATEGORY = "All", SMART_FILTER = "all", QUERY = "", loading = false;
  const SELECTED_PORTIONS = {};
  const productsEl = $("#products"), catsEl = $("#categories"), notice = $("#notice"), bar = $("#cartBar");

  $("#customerName").textContent = "Hi, " + guest.name;
  $("#restaurantName").textContent = R.name;
  $("#tableNo").textContent = "T-" + guest.table;
  const logo = safeUrl(R.logo);
  if (logo) { const img = $("#restaurantLogo"); img.src = logo; img.hidden = false; $("#logoIcon").hidden = true; }
  if (R.announcement) { $("#announcementText").textContent = R.announcement; $("#announcementBanner").hidden = false; }

  /* Quick action chips */
  const waNum = normalizeWhatsApp(R.whatsapp || R.phone);
  const igUrl = safeUrl(R.instagram_url);
  const chips = [];
  if (R.wifi_name) chips.push(`<button type="button" class="actionChip" data-open="info"><i class="fa-solid fa-wifi"></i> Free Wi-Fi</button>`);
  if (R.party_booking_enabled !== false && waNum) {
    const msg = encodeURIComponent(`Hi *${R.name}*, I'm at Table ${guest.table} and wanted to inquire about a party booking.`);
    chips.push(`<a class="actionChip" href="https://wa.me/${esc(waNum)}?text=${msg}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> Book Party</a>`);
  }
  if (R.phone) chips.push(`<a class="actionChip" href="tel:${esc(R.phone.replace(/[^\d+]/g, ""))}"><i class="fa-solid fa-phone"></i> Call</a>`);
  if (igUrl) chips.push(`<a class="actionChip" href="${esc(igUrl)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-instagram"></i> Instagram</a>`);
  if (chips.length) { $("#quickActions").innerHTML = chips.join(""); $("#quickActions").hidden = false; }

  function say(msg) { notice.textContent = msg; notice.hidden = !msg; }

  const badgeClass = (t) => {
    const l = String(t || "").toLowerCase();
    if (l.includes("best")) return "tagBest";
    if (l.includes("chef")) return "tagChef";
    if (l.includes("must")) return "tagMust";
    if (l.includes("spicy")) return "tagSpicy";
    return "tagMust";
  };

  function controlHtml(m, portion) {
    if (!m.available) return `<button class="shortBtn" type="button" disabled>Sold Out</button>`;
    const q = Guest.qty(m.id, portion);
    if (q === 0) return `<button class="shortBtn" type="button" data-action="add" data-id="${esc(m.id)}" data-variant="${portion}">+ Add</button>`;
    return `<div class="shortStepper"><button type="button" data-action="dec" data-id="${esc(m.id)}" data-variant="${portion}" aria-label="Remove one">&minus;</button>` +
           `<span>${q}</span><button type="button" data-action="add" data-id="${esc(m.id)}" data-variant="${portion}" aria-label="Add one">+</button></div>`;
  }

  function cardHtml(m) {
    const img = safeUrl(m.image_url) || DEFAULT_IMAGE;
    const hasHalf = num(m.half_price) > 0;
    const portion = hasHalf ? (SELECTED_PORTIONS[m.id] || "full") : "full";
    const dispPrice = portion === "half" ? num(m.half_price) : num(m.price);
    const dispBase = portion === "half" ? num(m.base_half_price || m.half_price) : num(m.base_price);
    const hasDisc = dispBase > dispPrice;
    const bList = Array.isArray(m.badges) ? m.badges : [];
    const isGolden = bList.some((b) => /best|chef/i.test(b));

    let badges = `<span class="vegDot ${m.veg ? "v" : "nv"}"><span></span></span>`;
    bList.forEach((b) => { badges += `<span class="tagBadge ${badgeClass(b)}">${esc(b)}</span>`; });
    if (m.offer_active) badges += `<span class="tagBadge tagOffer">${esc(m.offer_type === "Happy Hour" ? "HAPPY HOUR" : "OFFER")}</span>`;

    const portionHtml = hasHalf ? `<div class="portionRow">
      <button type="button" class="portionPill ${portion === "half" ? "active" : ""}" data-action="portion" data-id="${esc(m.id)}" data-portion="half">Half ${esc(money(m.half_price))}</button>
      <button type="button" class="portionPill ${portion === "full" ? "active" : ""}" data-action="portion" data-id="${esc(m.id)}" data-portion="full">Full ${esc(money(m.price))}</button>
    </div>` : "";

    return `<div class="dishCard ${isGolden ? "goldenGlow" : ""} ${m.available ? "" : "outStock"}" data-id="${esc(m.id)}">
      <div class="dishLeft">
        <div class="badgeRow">${badges}</div>
        <div class="dishName">${esc(m.name)}</div>
        ${m.description ? `<div class="dishDesc">${esc(m.description)}</div>` : ""}
        ${portionHtml}
        <div class="dishPrice">${hasDisc ? `<del>${esc(money(dispBase))}</del>` : ""}${esc(money(dispPrice))}</div>
      </div>
      <div class="dishRight">
        <img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-action="lightbox" data-id="${esc(m.id)}">
        <div class="shortlistAction">${controlHtml(m, portion)}</div>
      </div>
    </div>`;
  }

  function renderSpotlight() {
    const offers = MENU.filter((m) => m.offer_active && m.available);
    const wrap = $("#spotlightWrap");
    if (!offers.length || QUERY.trim()) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $("#offerCarousel").innerHTML = offers.map((m) => {
      const img = safeUrl(m.image_url) || DEFAULT_IMAGE;
      return `<div class="offerCard" data-action="lightbox" data-id="${esc(m.id)}">
        <img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <div>
          <span class="offerCardTag">${esc(m.offer_type === "Happy Hour" ? "HAPPY HOUR" : "LIVE OFFER")}</span>
          <div class="offerCardName">${esc(m.name)}</div>
          <div class="offerCardPrice"><del>${esc(money(m.base_price))}</del>${esc(money(m.price))}</div>
        </div></div>`;
    }).join("");
  }

  function renderCategories() {
    const rawCats = [...new Set(MENU.map((m) => m.category))];
    const cats = rawCats.length > 1 ? ["All", ...rawCats] : rawCats;
    if (!cats.includes(CATEGORY)) CATEGORY = cats[0] || "All";
    catsEl.innerHTML = cats.map((c) =>
      `<button type="button" class="catTab ${c === CATEGORY && !QUERY ? "active" : ""}" data-action="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    catsEl.hidden = cats.length === 0;
  }

  function renderProducts() {
    if (!R.active) { productsEl.innerHTML = '<div class="loading">This restaurant is not available right now.</div>'; return; }
    const q = QUERY.trim().toLowerCase();
    const items = MENU.filter((m) => {
      if (q) {
        const hay = ([m.name, m.description, m.category].concat(m.badges || [])).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      } else if (CATEGORY !== "All" && m.category !== CATEGORY) return false;
      if (SMART_FILTER === "veg" && !m.veg) return false;
      if (SMART_FILTER === "nonveg" && m.veg) return false;
      if (SMART_FILTER === "offers" && !m.offer_active) return false;
      if (SMART_FILTER === "bestseller" && !(Array.isArray(m.badges) && m.badges.length > 0)) return false;
      return true;
    });
    if (!items.length) {
      productsEl.innerHTML = `<div class="loading">${MENU.length ? "No dishes match your filter." : "The menu is empty right now."}</div>`;
      return;
    }
    const cats = [...new Set(items.map((m) => m.category))];
    productsEl.innerHTML = cats.map((c) => {
      const grp = items.filter((m) => m.category === c);
      return `<div class="catSectionHeader">${esc(c)} <span>${grp.length} ${grp.length === 1 ? "item" : "items"}</span></div>` +
        grp.map(cardHtml).join("");
    }).join("");
  }

  function openLightbox(id) {
    const m = MENU.find((x) => x.id === id);
    if (!m) return;
    const img = safeUrl(m.image_url) || DEFAULT_IMAGE;
    const hasHalf = num(m.half_price) > 0;
    const portion = hasHalf ? (SELECTED_PORTIONS[m.id] || "full") : "full";
    const dispPrice = portion === "half" ? num(m.half_price) : num(m.price);
    const dispBase = portion === "half" ? num(m.base_half_price || m.half_price) : num(m.base_price);
    $("#lightboxContent").innerHTML = `
      <div class="drawerHeader"><h3>${esc(m.name)}</h3><button type="button" class="closeBtn" data-close="lightboxModal">&times;</button></div>
      <img class="lbImg" src="${esc(img)}" alt="" referrerpolicy="no-referrer">
      ${m.description ? `<p class="lbDesc">${esc(m.description)}</p>` : ""}
      ${hasHalf ? `<div class="portionRow mb12">
        <button type="button" class="portionPill ${portion === "half" ? "active" : ""}" data-lb-portion="half" data-id="${esc(m.id)}">Half ${esc(money(m.half_price))}</button>
        <button type="button" class="portionPill ${portion === "full" ? "active" : ""}" data-lb-portion="full" data-id="${esc(m.id)}">Full ${esc(money(m.price))}</button>
      </div>` : ""}
      <div class="lbFoot">
        <div class="dishPrice">${dispBase > dispPrice ? `<del>${esc(money(dispBase))}</del>` : ""}${esc(money(dispPrice))}</div>
        ${m.available ? `<button type="button" class="primaryBtn compact" data-lb-add="${esc(m.id)}" data-variant="${portion}">+ Add ${hasHalf ? (portion === "half" ? "Half" : "Full") : ""} to Order</button>` : '<span class="badge out">Sold Out</span>'}
      </div>`;
    $("#lightboxModal").hidden = false;
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
    const m = MENU.find((x) => x.id === id), el = productsEl.querySelector(`.dishCard[data-id="${CSS.escape(id)}"]`);
    if (m && el) {
      const tmp = document.createElement("div");
      tmp.innerHTML = cardHtml(m);
      el.replaceWith(tmp.firstElementChild);
    }
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
      reconcile(); renderCategories(); renderSpotlight(); renderProducts(); updateCartBar();
    } catch (e) {
      if (e.code === "42501" || e.code === "PGRST301") { goTo("index.html"); return; }
      if (!silent) productsEl.innerHTML = `<div class="loading">${esc(e.message)}</div>`;
    } finally { loading = false; }
  }

  /* Event delegation (100% CSP compliant, zero inline handlers) */
  document.addEventListener("click", (ev) => {
    const lbP = ev.target.closest("[data-lb-portion]");
    if (lbP) { SELECTED_PORTIONS[lbP.dataset.id] = lbP.dataset.lbPortion; refreshCard(lbP.dataset.id); openLightbox(lbP.dataset.id); return; }
    const lbA = ev.target.closest("[data-lb-add]");
    if (lbA) { Guest.add(lbA.dataset.lbAdd, lbA.dataset.variant || "full"); refreshCard(lbA.dataset.lbAdd); $("#lightboxModal").hidden = true; return; }
    const jc = ev.target.closest("[data-jump-cat]");
    if (jc) { CATEGORY = jc.dataset.jumpCat; QUERY = ""; $("#searchBox").value = ""; renderCategories(); renderSpotlight(); renderProducts(); $("#catJumpModal").hidden = true; window.scrollTo(0, 0); return; }
    if (ev.target.closest('[data-open="info"]')) {
      if (R.wifi_name) { $("#wifiSsid").textContent = R.wifi_name; $("#wifiPass").textContent = R.wifi_password || "Ask Server"; $("#wifiCard").hidden = false; } else $("#wifiCard").hidden = true;
      const meta = []; if (R.address) meta.push(`<p><b>Address:</b> ${esc(R.address)}</p>`); if (R.phone) meta.push(`<p><b>Phone:</b> ${esc(R.phone)}</p>`);
      $("#infoMeta").innerHTML = meta.join(""); $("#wifiModal").hidden = false; return;
    }
    const c = ev.target.closest("[data-close]");
    if (c) { $("#" + c.dataset.close).hidden = true; return; }
    if (ev.target.classList && ev.target.classList.contains("modalOverlay")) { ev.target.hidden = true; return; }
    const b = ev.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action, id = b.dataset.id;
    if (a === "cat") { CATEGORY = b.dataset.cat; QUERY = ""; $("#searchBox").value = ""; renderCategories(); renderSpotlight(); renderProducts(); return; }
    if (a === "lightbox") { openLightbox(id); return; }
    if (a === "portion") { SELECTED_PORTIONS[id] = b.dataset.portion; refreshCard(id); return; }
    const m = MENU.find((x) => x.id === id);
    if (!m || !m.available) return;
    const v = b.dataset.variant || "full";
    if (a === "add") Guest.add(id, v);
    else if (a === "dec") Guest.setQty(id, Guest.qty(id, v) - 1, v);
    refreshCard(id);
  });

  $("#smartFilters").addEventListener("click", (ev) => {
    const f = ev.target.closest("[data-filter]");
    if (!f) return;
    SMART_FILTER = f.dataset.filter;
    $$("#smartFilters .fPill").forEach((el) => el.classList.toggle("active", el === f));
    renderProducts();
  });

  $("#fabMenuBtn").addEventListener("click", () => {
    const rawCats = [...new Set(MENU.map((m) => m.category))];
    $("#catJumpList").innerHTML = `<button type="button" class="jumpRow" data-jump-cat="All"><span>All Categories</span><b>${MENU.length}</b></button>` +
      rawCats.map((c) => `<button type="button" class="jumpRow" data-jump-cat="${esc(c)}"><span>${esc(c)}</span><b>${MENU.filter((x) => x.category === c).length}</b></button>`).join("");
    $("#catJumpModal").hidden = false;
  });

  $("#copyWifiBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(R.wifi_password || ""); $("#copyWifiBtn").textContent = "Copied!"; setTimeout(() => { $("#copyWifiBtn").textContent = "Copy"; }, 1800); } catch (_) {}
  });

  $("#searchBox").addEventListener("input", debounce((ev) => { QUERY = ev.target.value; renderCategories(); renderSpotlight(); renderProducts(); }, 140));

  const trackBtn = $("#trackOrderBtn");
  if (trackBtn) {
    trackBtn.addEventListener("click", () => goTo("success.html"));
    rpc("my_orders", { p_restaurant: R.id, p_limit: 5 }).then((list) => {
      if (Array.isArray(list) && list.some((o) => ["Pending", "Preparing", "Ready", "Served"].includes(o.status))) trackBtn.hidden = false;
    }).catch(() => {});
  }
  $("#tableNo").addEventListener("click", () => {
    const g = Guest.get();
    const u = new URL("index.html", location.href);
    u.search = ""; u.searchParams.set("restaurant", currentSlug());
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
