"use strict";
/* =============================================================================
   v8_admin.js - Additive v8.0 HQ Tools for v7 Owner Console (admin.html)
   Preserves 100% of v7 admin.js (Create/Edit/Delete Restaurant, Staff, QR Links,
   Orders, Platform Log, 2FA + Passkey) and adds City/Chain (org_id) & SaaS Renewal!
   ============================================================================= */
(function () {
  function mountV8OwnerBar() {
    if (document.getElementById("v8OwnerBar")) return;
    const topbar = document.querySelector(".topbar .ownerArea");
    if (!topbar) return;
    const btn = document.createElement("button");
    btn.id = "v8OwnerBar";
    btn.className = "secondaryButton";
    btn.style.cssText = "padding:6px 10px;font-size:12px;";
    btn.innerHTML = '<i class="fa-solid fa-crown"></i> v8 Chain & Renewal';
    btn.addEventListener("click", openV8ChainRenewalDialog);
    topbar.prepend(btn);
  }

  async function openV8ChainRenewalDialog() {
    const list = await rpc("owner_list_restaurants", {}) || [];
    if (!list.length) { showToast("No restaurants found.", "err"); return; }
    const slug = prompt("Enter restaurant slug to manage Chain/City or record +30d Renewal:\n" + list.map((r) => `• ${r.slug} (${r.name})`).join("\n"), list[0].slug);
    if (!slug) return;
    const r = list.find((x) => x.slug === slug.trim().toLowerCase());
    if (!r) { showToast("Slug not found.", "err"); return; }
    const act = prompt(`Selected: ${r.name}\nType 1 to set City & Chain org_id\nType 2 to record +30d SaaS Renewal Payment & Invoice`, "1");
    if (act === "1") {
      const city = prompt("City (e.g. Indore):", r.city || "") || "";
      const org = prompt("Brand / Chain org_id (same ID links multiple outlets, e.g. velvet-group):", r.org_id || "") || "";
      const plan = prompt("Plan tier (starter / growth / chain):", r.plan_tier || "starter") || "starter";
      const price = num(prompt("Monthly price (₹):", r.monthly_price || 499), 499);
      const res = await rpc("v8_owner_set_meta", { p_restaurant: r.id, p_city: city, p_org_id: org, p_plan_tier: plan, p_monthly_price: price });
      showToast((res && res.message) || "Updated!", res && res.ok ? "ok" : "err");
    } else if (act === "2") {
      const days = num(prompt("Validity days to add:", "30"), 30);
      const amt = num(prompt("Amount collected (₹):", r.monthly_price || 499), 499);
      const ref = prompt("UPI / Bank / Razorpay Ref (optional):", "") || "";
      const res = await rpc("v8_owner_record_renewal", { p_restaurant: r.id, p_days: days, p_amount: amt, p_gateway: "upi", p_ref: ref, p_notes: "Renewal via HQ" });
      showToast((res && res.message) || "Renewed!", res && res.ok ? "ok" : "err");
    }
  }

  const obs = new MutationObserver(() => {
    const app = document.getElementById("app");
    if (app && !app.hidden) { mountV8OwnerBar(); obs.disconnect(); }
  });
  window.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("app");
    if (app) obs.observe(app, { attributes: true, attributeFilter: ["hidden"] });
  });
})();
