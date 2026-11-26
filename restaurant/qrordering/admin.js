"use strict";
let hqCity = "";

async function logoutHq() { await sb.auth.signOut(); window.location.reload(); }
function selectHqCity(c) { hqCity = c; loadHq(); }

async function loadHq() {
  const { data } = await sb.rpc("owner_list_restaurants_v8", {
    p_search: document.getElementById("hqSearch").value.trim(), p_city: hqCity,
    p_triage: document.getElementById("hqTriage").value
  });
  if (!data || !data.success) { showToast((data && data.message) || "Unauthorized", "error"); return; }
  const s = data.stats || {};
  document.getElementById("hqKpis").innerHTML = `
    <div class="kpi"><div class="l">Total Outlets</div><div class="v">${s.total_outlets||0}</div></div>
    <div class="kpi"><div class="l">Active Live</div><div class="v" style="color:#059669;">${s.active_outlets||0}</div></div>
    <div class="kpi"><div class="l">Expiring 7d</div><div class="v" style="color:#d97706;">${s.expiring_7d||0}</div></div>
    <div class="kpi"><div class="l">Active MRR</div><div class="v" style="color:#0284c7;">₹${Number(s.total_mrr||0).toLocaleString("en-IN")}</div></div>
    <div class="kpi"><div class="l">Collected 30d</div><div class="v" style="color:#059669;">₹${Number(s.collected_30d||0).toLocaleString("en-IN")}</div></div>`;

  document.getElementById("hqCities").innerHTML = `<button class="pill ${hqCity===""?"active":""}" onclick="selectHqCity('')">All Cities</button>` +
    (data.cities || []).map((c) => { const v = c.city === "Unspecified" ? "" : c.city; return `<button class="pill ${hqCity===v && v?"active":""}" onclick="selectHqCity('${escapeJsAttr(v)}')">${escapeHTML(c.city)} (${c.active}/${c.total})</button>`; }).join("");

  document.getElementById("hqTbody").innerHTML = (data.restaurants || []).map((r) => `<tr>
    <td><strong>${escapeHTML(r.name)}</strong><br><span style="font-size:11px;color:#64748b;">/${escapeHTML(r.slug)} • ${escapeHTML(r.city||"No City")}</span></td>
    <td>${escapeHTML((r.plan_tier||"starter").toUpperCase())} ₹${r.monthly_price||499}/mo${r.org_id?"<br><small>Chain: "+escapeHTML(r.org_id)+"</small>":""}</td>
    <td style="font-size:11.5px;">${escapeHTML(r.tax_regime||"regular_5")}<br>${escapeHTML(r.gstin||"No GSTIN")}</td>
    <td>Orders: <strong>${r.today_orders||0}</strong> | CRM: <strong>${r.total_customers||0}</strong></td>
    <td>${escapeHTML(r.sub_end_date||"")}</td>
    <td>
      <button class="btn btn-green btn-sm" onclick="renewOutlet('${r.id}',${Number(r.monthly_price||499)})">+30d Renew</button>
      <a href="dashboard.html?restaurant=${encodeURIComponent(r.slug)}" target="_blank" class="btn btn-soft btn-sm" style="text-decoration:none;">POS</a>
    </td>
  </tr>`).join("") || `<tr><td colspan="6" style="text-align:center;color:#64748b;">No outlets found.</td></tr>`;
}

async function renewOutlet(id, amt) {
  const ref = prompt(`Record ₹${amt} renewal (+30 days). Enter UPI/Bank Ref (optional):`, "");
  if (ref === null) return;
  const { data } = await sb.rpc("owner_record_renewal", { p_restaurant: id, p_days: 30, p_amount: amt, p_gateway: "upi", p_ref: ref });
  showToast((data && data.message) || "Done", (data && data.success) ? "success" : "error");
  if (data && data.success) loadHq();
}

async function runHousekeeping() {
  const { data } = await sb.rpc("owner_run_housekeeping");
  showToast(data && data.success ? `Trimmed ${data.logs_trimmed} old logs & ${data.guest_sessions_trimmed} expired guest sessions (0 orders deleted).` : "Failed", "success");
}

Object.assign(window, { logoutHq, selectHqCity, loadHq, renewOutlet, runHousekeeping });

(async function () {
  initClient("owner");
  const { data: { session } } = await sb.auth.getSession();
  if (session) { document.getElementById("hqLogin").classList.add("hidden"); document.getElementById("hqView").classList.remove("hidden"); loadHq(); return; }
  const authTs = { captchaToken: "", tsWidgetId: null };
  mountAuthTurnstile("hqTurnstileBox", authTs);
  document.getElementById("hqLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (CONFIG.TURNSTILE_SITE_KEY && !authTs.captchaToken) { showToast("Please complete the Cloudflare security check.", "error"); return; }
    const opts = authTs.captchaToken ? { captchaToken: authTs.captchaToken } : undefined;
    const { error } = await sb.auth.signInWithPassword({ email: document.getElementById("hqEmail").value.trim(), password: document.getElementById("hqPass").value, options: opts });
    if (error) { showToast(error.message, "error"); mountAuthTurnstile("hqTurnstileBox", authTs); return; }
    document.getElementById("hqLogin").classList.add("hidden"); document.getElementById("hqView").classList.remove("hidden"); loadHq();
  });
})();
