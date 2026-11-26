"use strict";
let activeMode = "dine_in";
function selectMode(m) {
  activeMode = m;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  document.getElementById("tableWrap").classList.toggle("hidden", m !== "dine_in");
}
window.selectMode = selectMode;

(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  document.title = R.name + " — Smart QR Menu";
  document.getElementById("rName").textContent = R.name;
  document.getElementById("rTagline").textContent = R.tagline || R.address || "";
  const badges = [];
  if (R.fssai_no) badges.push(`FSSAI: ${R.fssai_no}`);
  if (R.loyalty_enabled) badges.push(`⭐ Earn ${R.loyalty_earn_per_100} pts / ₹100`);
  document.getElementById("rBadges").textContent = badges.join("  •  ");

  if (!R.takeaway_enabled) document.querySelector('[data-mode="takeaway"]').classList.add("hidden");
  if (!R.direct_order_enabled) document.querySelector('[data-mode="direct"]').classList.add("hidden");

  const urlTable = getQueryParam("table");
  const urlToken = getQueryParam("k");
  const prev = getGuestMeta();
  if (urlTable) { document.getElementById("gTable").value = urlTable; document.getElementById("gTable").readOnly = true; }
  else if (prev.table && prev.orderType === "dine_in") document.getElementById("gTable").value = prev.table;
  if (prev.name) document.getElementById("gName").value = prev.name;
  if (prev.phone) document.getElementById("gPhone").value = prev.phone;

  document.getElementById("checkinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("startBtn");
    const table = activeMode === "dine_in" ? document.getElementById("gTable").value.trim() : activeMode.toUpperCase();
    const name = document.getElementById("gName").value.trim();
    const phone = document.getElementById("gPhone").value.trim();
    if (activeMode === "dine_in" && !table) { showToast("Enter your table number.", "error"); return; }
    btn.disabled = true; btn.textContent = "Opening menu...";
    try {
      const res = await ensureGuestSession(table, urlToken, name, phone, activeMode);
      if (!res.success) { showToast(res.message || "Check-in failed.", "error"); return; }
      setGuestMeta({ table, tableToken: urlToken, name, phone, orderType: activeMode, loyalty_points: res.loyalty_points || 0 });
      window.location.href = `menu.html?restaurant=${encodeURIComponent(R.slug)}`;
    } finally { btn.disabled = false; btn.textContent = "Open Live Menu →"; }
  });
})();
