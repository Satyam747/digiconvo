"use strict";
(async function () {
  initClient("token");
  const slug = currentSlug();
  if (!slug) {
    document.getElementById("tokRestName").textContent = "Add ?restaurant=<slug> to URL";
    return;
  }
  function tickClock() {
    document.getElementById("tokClock").textContent = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  }
  tickClock();
  setInterval(tickClock, 10000);

  function renderTokens(list, ready) {
    return (list || []).map((t) => {
      const code = t.kot_no || t.order_no || "";
      const tag = t.order_type === "delivery" ? "Delivery" : (t.order_type === "pickup" || t.order_type === "takeaway") ? "Pickup" : "Table " + esc(t.table_number);
      return `<div class="tokCard ${ready ? "ready" : ""}">
        <div class="tokNum">${esc(code)}</div>
        <div class="tokMeta">${esc(t.first_name || "Guest")} &bull; ${tag}</div>
      </div>`;
    }).join("") || `<div style="color:#64748b;font-size:14px;">None right now</div>`;
  }

  let lastVer = null;
  async function refreshBoard() {
    try {
      const res = await rpc("v8_token_board", { p_slug: slug, p_known_version: lastVer });
      if (!res || !res.ok) return;
      if (res.queue_version != null) lastVer = res.queue_version;
      if (res.unchanged) return;
      if (res.restaurant) {
        applyThemePreset(res.restaurant.theme_color || "gold");
        document.getElementById("tokRestName").textContent = res.restaurant.name + " — Live Order Board";
      }
      const prep = res.preparing || [], rdy = res.ready || [];
      document.getElementById("prepCnt").textContent = String(prep.length);
      document.getElementById("readyCnt").textContent = String(rdy.length);
      document.getElementById("prepList").innerHTML = renderTokens(prep, false);
      document.getElementById("readyList").innerHTML = renderTokens(rdy, true);
    } catch (_) {}
  }

  await refreshBoard();
  setInterval(() => { if (!document.hidden) refreshBoard(); }, 8000);
})();
