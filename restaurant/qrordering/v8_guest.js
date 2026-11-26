"use strict";
/* =============================================================================
   v8_guest.js - Additive v8.0 Guest Experience on top of v7 dark/gold theme
   Preserves 100% of v7 customer.css, Offer Carousel, Dish Lightbox & Half/Full pills!
   Adds:
     * Floating Waiter Call / Water / Bill Bell on menu.html
     * Smart 5-Star Review Router on success.html (4-5★ -> Google Maps, 1-3★ -> Manager)
   ============================================================================= */
(function () {
  window.addEventListener("DOMContentLoaded", () => {
    const page = location.pathname.split("/").pop() || "index.html";

    // Floating Waiter Call button on menu.html
    if (page === "menu.html") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = '<i class="fa-solid fa-bell"></i> Call Staff';
      btn.style.cssText = "position:fixed;left:14px;bottom:84px;z-index:80;background:rgba(15,23,42,.92);color:#c5a880;border:1px solid #c5a880;border-radius:999px;padding:9px 14px;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.35);";
      btn.addEventListener("click", async () => {
        if (!window.R || !R.id) return;
        const choice = prompt("How can we help?\nType: waiter, water, bill, or clean", "waiter");
        if (!choice) return;
        const tbl = (typeof Cart !== "undefined" && Cart.get && Cart.get().table) || new URLSearchParams(location.search).get("table") || "Table";
        const res = await rpc("v8_call_waiter", { p_restaurant: R.id, p_table: String(tbl), p_call_type: choice.trim().toLowerCase() });
        showToast((res && res.message) || "Staff notified!", "ok");
      });
      document.body.appendChild(btn);
    }

    // Smart 5-Star Review Router on success.html
    if (page === "success.html") {
      const box = document.createElement("div");
      box.style.cssText = "max-width:520px;margin:18px auto 32px;background:rgba(21,28,44,.95);border:1px solid rgba(197,168,128,.35);border-radius:16px;padding:16px;text-align:center;color:#f1f5f9;";
      box.innerHTML = `
        <div style="font-size:13.5px;font-weight:700;color:#c5a880;margin-bottom:8px;">Enjoying your meal? Tap to rate us:</div>
        <div id="v8Stars" style="font-size:28px;letter-spacing:6px;cursor:pointer;">
          ${[1,2,3,4,5].map((s) => `<span data-star="${s}">⭐</span>`).join("")}
        </div>
        <div id="v8RateMsg" style="font-size:12px;color:#94a3b8;margin-top:6px;"></div>`;
      document.body.appendChild(box);
      box.querySelectorAll("[data-star]").forEach((st) => {
        st.addEventListener("click", async () => {
          if (!window.R || !R.id) return;
          const stars = Number(st.dataset.star);
          let comment = "";
          if (stars <= 3) comment = prompt("We're sorry! Tell the manager what we can improve right away:") || "";
          const res = await rpc("v8_submit_feedback", { p_restaurant: R.id, p_order_id: null, p_rating: stars, p_comment: comment });
          if (res && res.route_to_google && res.review_link) {
            document.getElementById("v8RateMsg").textContent = "Thank you for the 5★ love! Opening Google Reviews...";
            window.open(res.review_link, "_blank", "noopener");
          } else {
            document.getElementById("v8RateMsg").textContent = "Thank you! Your feedback has been sent directly to the manager.";
          }
        });
      });
    }
  });
})();
