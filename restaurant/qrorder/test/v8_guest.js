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

    const isMenu = document.body.classList.contains("page-menu") || page === "menu.html";
    const isSuccess = document.body.classList.contains("page-success") || page === "success.html";

    // Call Staff handler on menu.html (docked cleanly in sticky bar — zero floating overlap)
    if (isMenu) {
      const btn = document.getElementById("callStaffBtn");
      if (btn) {
        btn.addEventListener("click", async () => {
          if (typeof R === "undefined" || !R || !R.id) return;
          let choice = "waiter";
          const id = await Dialog.open({
            title: "Call staff",
            body: `<p class="dlgText">What does your table need?</p>
              <select id="v8CallType" class="dlgInput">
                <option value="waiter">Call Waiter</option>
                <option value="water">Request Water</option>
                <option value="bill">Bring Bill</option>
                <option value="clean">Clean Table</option>
              </select>`,
            buttons: [{ id: "cancel", label: "Cancel" }, { id: "call", label: "Notify Staff", kind: "primaryButton" }],
            onClick(btnId) { if (btnId === "call") choice = document.getElementById("v8CallType").value; }
          });
          if (id !== "call") return;
          const tbl = (typeof Guest !== "undefined" && Guest.get ? Guest.get().table : "") ||
            new URLSearchParams(location.search).get("table") || "Table";
          try {
            const res = await rpc("v8_call_waiter", { p_restaurant: R.id, p_table: String(tbl), p_call_type: choice.trim().toLowerCase() });
            if (res && res.ok === false) { showToast(res.message || "Could not notify staff.", "error"); return; }
            showToast((res && res.message) || "Staff notified!", "success");
          } catch (e) {
            showToast((e && e.message) || "Could not notify staff.", "error");
          }
        });
      }
    }

    // Smart 5-Star Review Router on success.html
    if (isSuccess) {
      const container = document.querySelector(".page-success .container");
      if (!container) return;
      const box = document.createElement("div");
      box.style.cssText = "margin:16px 0;background:var(--bg-card,rgba(21,28,44,.95));border:1px solid var(--border-col,rgba(197,168,128,.35));border-radius:16px;padding:16px;text-align:center;color:#f1f5f9;";
      box.innerHTML = `
        <div style="font-size:13.5px;font-weight:700;color:var(--primary,#c5a880);margin-bottom:8px;">Enjoying your meal? Tap to rate us:</div>
        <div id="v8Stars" style="font-size:28px;letter-spacing:6px;cursor:pointer;">
          ${[1,2,3,4,5].map((s) => `<span data-star="${s}">⭐</span>`).join("")}
        </div>
        <div id="v8RateMsg" style="font-size:12px;color:#94a3b8;margin-top:6px;"></div>`;
      const keepOpen = document.getElementById("keepOpen");
      if (keepOpen && keepOpen.parentElement === container) container.insertBefore(box, keepOpen);
      else container.appendChild(box);
      box.querySelectorAll("[data-star]").forEach((st) => {
        st.addEventListener("click", async () => {
          if (typeof R === "undefined" || !R || !R.id) return;
          const stars = Number(st.dataset.star);
          let comment = "";
          if (stars <= 3) {
            const p = await Dialog.prompt({
              title: "Help us improve",
              label: "We're sorry! Tell the manager what we can improve right away:",
              multiline: true,
              maxlength: 500
            });
            if (p === null) return;
            comment = p;
          }
          const oid = (typeof Guest !== "undefined" && Guest.get && Guest.get().last) || null;
          try {
            const res = await rpc("v8_submit_feedback", { p_restaurant: R.id, p_order_id: oid, p_rating: stars, p_comment: comment });
            const safeRev = res && res.review_link && typeof safeUrl === "function" ? safeUrl(res.review_link) : "";
            if (res && res.route_to_google && safeRev) {
              document.getElementById("v8RateMsg").textContent = "Thank you for the feedback! Opening Google Reviews...";
              window.open(safeRev, "_blank", "noopener,noreferrer");
            } else if (res && res.ok === false) {
              showToast(res.message || "Could not submit feedback.", "error");
            } else {
              document.getElementById("v8RateMsg").textContent = "Thank you! Your feedback has been sent directly to the manager.";
            }
          } catch (e) {
            showToast((e && e.message) || "Could not submit feedback.", "error");
          }
        });
      });
    }
  });
})();
