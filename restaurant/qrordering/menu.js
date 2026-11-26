"use strict";
let MENU = [], CART = [], filterDiet = "all", filterCat = "", custItem = null;

function setDiet(d) {
  filterDiet = d;
  ["All","Veg","Spec"].forEach((k) => document.getElementById("f"+k).classList.toggle("active", (k==="All"&&d==="all")||(k==="Veg"&&d==="veg")||(k==="Spec"&&d==="special")));
  renderMenu();
}
function setCat(c) { filterCat = c; renderCatPills(); renderMenu(); }
function closeCust() { document.getElementById("custModal").classList.add("hidden"); custItem = null; }
function openWaiterModal() { document.getElementById("waiterModal").classList.remove("hidden"); }
async function sendCall(type) {
  const gm = getGuestMeta();
  const { data } = await sb.rpc("guest_call_waiter", { p_restaurant: R.id, p_table: gm.table || "TAKEAWAY", p_call_type: type });
  showToast((data && data.message) || "Staff notified!", "success");
  document.getElementById("waiterModal").classList.add("hidden");
}
function goCheckout() { window.location.href = `checkout.html?restaurant=${encodeURIComponent(R.slug)}`; }

function renderCatPills() {
  const cats = [...new Set(MENU.map((m) => m.category || "Main Course"))];
  document.getElementById("catPills").innerHTML = `<button class="pill ${filterCat===""?"active":""}" onclick="setCat('')">All (${MENU.length})</button>` +
    cats.map((c) => `<button class="pill ${filterCat===c?"active":""}" onclick="setCat('${escapeJsAttr(c)}')">${escapeHTML(c)}</button>`).join("");
}

function addSimpleOrCustomize(idx) {
  const m = MENU[idx]; if (!m || !m.available) return;
  const hasAddons = Array.isArray(m.addons) && m.addons.length > 0;
  const hasMods = Array.isArray(m.modifiers) && m.modifiers.length > 0;
  const hasHalf = m.half_price !== null && m.half_price !== undefined;
  if (!hasAddons && !hasMods && !hasHalf) {
    pushCartItem(m, "full", [], "");
    return;
  }
  custItem = m;
  document.getElementById("cmDishName").textContent = m.name;
  document.getElementById("cmPortionBox").innerHTML = hasHalf
    ? `<label style="font-size:12px;font-weight:700;">Portion</label><div style="display:flex;gap:8px;margin-top:4px;"><label><input type="radio" name="cmPort" value="full" checked> Full (${money(m.price)})</label><label><input type="radio" name="cmPort" value="half"> Half (${money(m.half_price)})</label></div>`
    : "";
  document.getElementById("cmAddonsBox").innerHTML = hasAddons
    ? `<label style="font-size:12px;font-weight:700;">Add-ons</label><div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">` + m.addons.map((a) => `<label style="font-size:13px;"><input type="checkbox" class="cm-addon" value="${escapeHTML(a.name)}" data-price="${Number(a.price||0)}"> ${escapeHTML(a.name)} (+${money(a.price)})</label>`).join("") + `</div>`
    : "";
  document.getElementById("cmModBox").innerHTML = hasMods
    ? `<label style="font-size:12px;font-weight:700;">Preference / Spice / Jain</label><select id="cmModSel" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;margin-top:4px;"><option value="">Regular</option>` + m.modifiers.map((x) => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("") + `</select>`
    : "";
  document.getElementById("custModal").classList.remove("hidden");
}

function confirmCustAdd() {
  if (!custItem) return;
  const portEl = document.querySelector('input[name="cmPort"]:checked');
  const portion = portEl ? portEl.value : "full";
  const addons = [...document.querySelectorAll(".cm-addon:checked")].map((c) => ({ name: c.value, price: Number(c.dataset.price || 0) }));
  const modEl = document.getElementById("cmModSel");
  const mod = modEl ? modEl.value : "";
  pushCartItem(custItem, portion, addons, mod);
  closeCust();
}

function pushCartItem(m, portion, addons, modifier) {
  const addonNames = addons.map((a) => a.name).sort();
  const key = `${m.id}|${portion}|${addonNames.join(",")}|${modifier}`;
  const unit = (portion === "half" && m.half_price != null ? Number(m.half_price) : Number(m.price)) + addons.reduce((s, a) => s + Number(a.price || 0), 0);
  const existing = CART.find((c) => c.key === key);
  if (existing) existing.qty = Math.min(existing.qty + 1, CONFIG.CART.MAX_QTY || 20);
  else CART.push({ key, menu_id: m.id, name: m.name, portion, addons: addonNames, modifier, unit_price: unit, qty: 1 });
  saveCart(CART);
  updateCartBar();
  showToast(`Added ${m.name}`, "success");
}

function updateCartBar() {
  const cnt = CART.reduce((s, c) => s + c.qty, 0);
  const tot = CART.reduce((s, c) => s + c.qty * c.unit_price, 0);
  document.getElementById("cbCount").textContent = `${cnt} item${cnt === 1 ? "" : "s"}`;
  document.getElementById("cbTotal").textContent = money(tot);
  document.getElementById("cartBar").classList.toggle("hidden", cnt === 0);
}

function renderMenu() {
  const q = document.getElementById("mSearch").value.trim().toLowerCase();
  const list = MENU.map((m, idx) => ({ m, idx })).filter(({ m }) => {
    if (filterDiet === "veg" && !m.veg) return false;
    if (filterDiet === "special" && !m.is_special && !m.is_bestseller) return false;
    if (filterCat && m.category !== filterCat) return false;
    if (q && !m.name.toLowerCase().includes(q) && !(m.description || "").toLowerCase().includes(q)) return false;
    return true;
  });
  document.getElementById("menuList").innerHTML = list.map(({ m, idx }) => `
    <div class="dish ${m.available ? "" : "soldout"}">
      <div style="flex:1;">
        <div style="font-size:14.5px;font-weight:800;">${m.veg ? "🟢" : "🔴"} ${escapeHTML(m.name)} ${m.is_special ? "⭐" : ""}</div>
        ${m.description ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHTML(m.description)}</div>` : ""}
        <div style="font-size:13.5px;font-weight:800;color:#0f172a;margin-top:5px;">
          ${money(m.price)} ${m.half_price != null ? `<span style="font-size:11.5px;color:#64748b;font-weight:600;">• Half ${money(m.half_price)}</span>` : ""}
          ${Array.isArray(m.addons) && m.addons.length ? `<span style="font-size:11px;color:#0284c7;margin-left:6px;">Customizable</span>` : ""}
        </div>
      </div>
      <div>
        ${m.available ? `<button class="btn" onclick="addSimpleOrCustomize(${idx})">+ Add</button>` : `<span style="font-size:11.5px;font-weight:800;color:#dc2626;background:#fee2e2;padding:4px 8px;border-radius:8px;">SOLD OUT</span>`}
      </div>
    </div>`).join("") || `<div style="text-align:center;color:#64748b;padding:30px;">No dishes match your filter.</div>`;
}

Object.assign(window, { setDiet, setCat, addSimpleOrCustomize, confirmCustAdd, closeCust, openWaiterModal, sendCall, goCheckout, renderMenu });

(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  const gm = getGuestMeta();
  document.getElementById("mRestName").textContent = R.name;
  document.getElementById("mGuestInfo").textContent = `${gm.orderType === "dine_in" ? "Table " + gm.table : (gm.orderType || "Takeaway").toUpperCase()} • ${gm.name || "Guest"}${gm.loyalty_points ? " • ⭐ " + gm.loyalty_points + " pts" : ""}`;
  document.getElementById("myOrdersLink").href = `success.html?restaurant=${encodeURIComponent(R.slug)}`;
  if (gm.orderType !== "dine_in") document.getElementById("waiterCallBtn").classList.add("hidden");
  CART = getCart();
  MENU = await getMenuCached();
  renderCatPills(); renderMenu(); updateCartBar();
})();
