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
    let list;
    try {
      list = await rpc("owner_list_restaurants", {}) || [];
    } catch (e) {
      showToast((e && e.message) || "Failed to load restaurants.", "error");
      return;
    }
    if (!list.length) { showToast("No restaurants found.", "error"); return; }
    const slug = await Dialog.prompt({
      title: "Manage restaurant",
      label: "Restaurant slug:\n" + list.map((r) => `• ${r.slug} (${r.name})`).join("\n"),
      maxlength: 40
    });
    if (!slug) return;
    const r = list.find((x) => x.slug === slug.trim().toLowerCase());
    if (!r) { showToast("Slug not found.", "error"); return; }
    const act = await Dialog.open({
      title: r.name,
      body: `<p class="dlgText">Choose a v8 owner action.</p>`,
      buttons: [{ id: "meta", label: "Set City / Chain", kind: "primaryButton" }, { id: "renew", label: "Renew +30 Days", kind: "primaryButton" }, { id: "cancel", label: "Cancel" }]
    });
    if (act === "meta") {
      const city = await Dialog.prompt({ title: "City", label: "City (e.g. Indore)", maxlength: 60 });
      if (city === null) return;
      const org = await Dialog.prompt({ title: "Chain", label: "Brand / Chain org_id", maxlength: 60 });
      if (org === null) return;
      const plan = await Dialog.prompt({ title: "Plan", label: "Plan tier (starter / growth / chain)", maxlength: 20 });
      if (plan === null) return;
      const priceText = await Dialog.prompt({ title: "Monthly price", label: "Monthly price (₹)", maxlength: 12 });
      if (priceText === null) return;
      const price = num(priceText, 499);
      try {
        const res = await rpc("v8_owner_set_meta", { p_restaurant: r.id, p_city: city || r.city || "", p_org_id: org || r.org_id || "", p_plan_tier: plan || r.plan_tier || "starter", p_monthly_price: price });
        showToast((res && res.message) || "Updated!", res && res.ok ? "success" : "error");
      } catch (e) {
        showToast((e && e.message) || "Failed to update metadata.", "error");
      }
    } else if (act === "renew") {
      const daysText = await Dialog.prompt({ title: "Renewal period", label: "Validity days to add", maxlength: 4 });
      if (daysText === null) return;
      const amtText = await Dialog.prompt({ title: "Amount collected", label: "Amount collected (₹)", maxlength: 12 });
      if (amtText === null) return;
      const days = num(daysText, 30);
      const amt = num(amtText, 499);
      const ref = await Dialog.prompt({ title: "Payment reference", label: "UPI / Bank / Razorpay Ref (optional)", maxlength: 100 }) || "";
      try {
        const res = await rpc("v8_owner_record_renewal", { p_restaurant: r.id, p_days: days, p_amount: amt, p_gateway: "upi", p_ref: ref, p_notes: "Renewal via HQ" });
        showToast((res && res.message) || "Renewed!", res && res.ok ? "success" : "error");
      } catch (e) {
        showToast((e && e.message) || "Failed to record renewal.", "error");
      }
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
