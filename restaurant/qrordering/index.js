"use strict";
/* Check-in page with QR-Only Menu visual polish + full v7 security & logic */
(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;
  applyThemePreset(R.theme_color || "gold");

  const form = $("#checkinForm"), btn = $("#startBtn"), errBox = $("#formError");
  const nameInput = $("#customerName"), tableInput = $("#tableNumber"), notice = $("#notice");
  const occBox = $("#occupiedBox");
  let busy = false, blocked = "", session = await getSession(), pendingJoin = null, pickedStar = 0;

  $("#restaurantName").textContent = R.name;
  $("#restaurantTagline").textContent = R.tagline || "Fresh Food & Great Vibes";
  const logo = safeUrl(R.logo);
  if (logo) { const img = $("#restaurantLogo"); img.src = logo; img.hidden = false; $("#logoIcon").hidden = true; }
  if (R.announcement) {
    $("#announcementText").textContent = R.announcement;
    $("#announcementBanner").hidden = false;
  }

  /* Quick Action Chips (exact QR-Only Menu style) */
  const waNum = normalizeWhatsApp(R.whatsapp || R.phone);
  const igUrl = safeUrl(R.instagram_url);
  const revUrl = safeUrl(R.review_link);
  const chips = [];
  if (R.wifi_name) chips.push(`<button type="button" class="actionChip" data-open="info"><i class="fa-solid fa-wifi"></i> Free Wi-Fi</button>`);
  if (R.party_booking_enabled !== false && waNum) {
    const msg = encodeURIComponent(`Hi *${R.name}*, I checked your QR Menu and wanted to inquire about a table / party reservation.`);
    chips.push(`<a class="actionChip" href="https://wa.me/${esc(waNum)}?text=${msg}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i> Book Table / Party</a>`);
  }
  if (R.phone) chips.push(`<a class="actionChip" href="tel:${esc(R.phone.replace(/[^\d+]/g, ""))}"><i class="fa-solid fa-phone"></i> Call</a>`);
  if (igUrl) chips.push(`<a class="actionChip" href="${esc(igUrl)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-instagram"></i> Instagram</a>`);
  if (R.address) chips.push(`<button type="button" class="actionChip" data-open="info"><i class="fa-solid fa-location-dot"></i> Address</button>`);
  if (chips.length) {
    $("#quickActions").innerHTML = chips.join("");
    $("#quickActions").hidden = false;
  }

  if (revUrl || waNum) $("#reviewShield").hidden = false;

  /* Info / Wi-Fi bottom-sheet drawer */
  function openInfoDrawer() {
    if (R.wifi_name) {
      $("#wifiSsid").textContent = R.wifi_name;
      $("#wifiPass").textContent = R.wifi_password || "Ask Server";
      $("#copyWifiBtn").hidden = !R.wifi_password;
      $("#wifiCard").hidden = false;
    } else {
      $("#wifiCard").hidden = true;
    }
    const meta = [];
    if (R.address) meta.push(`<p><i class="fa-solid fa-location-dot"></i> <b>Address:</b> ${esc(R.address)}</p>`);
    if (R.phone) meta.push(`<p><i class="fa-solid fa-phone"></i> <b>Phone:</b> ${esc(R.phone)}</p>`);
    $("#infoMeta").innerHTML = meta.join("");
    $("#wifiModal").hidden = false;
  }

  $("#copyWifiBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(R.wifi_password || ""); $("#copyWifiBtn").textContent = "Copied!"; setTimeout(() => { $("#copyWifiBtn").textContent = "Copy"; }, 1800); } catch (_) {}
  });

  /* Smart Review Shield: 4-5 stars -> Google Maps, 1-3 stars -> Owner WhatsApp private feedback */
  $("#starPicker").addEventListener("click", (ev) => {
    const b = ev.target.closest(".starBtn");
    if (!b) return;
    pickedStar = Number(b.dataset.star);
    $$("#starPicker .starBtn").forEach((el) => el.classList.toggle("selected", Number(el.dataset.star) <= pickedStar));
    if (pickedStar >= 4 && revUrl) {
      $("#lowRatingBox").hidden = true;
      $("#googleReviewBtn").href = revUrl;
      $("#highRatingBox").hidden = false;
      $("#reviewModal").hidden = false;
    } else if (waNum) {
      $("#highRatingBox").hidden = true;
      $("#privateFeedback").value = "";
      $("#lowRatingBox").hidden = false;
      $("#reviewModal").hidden = false;
    } else if (revUrl) {
      window.open(revUrl, "_blank", "noopener");
    }
  });

  $("#sendFeedbackBtn").addEventListener("click", () => {
    const txt = $("#privateFeedback").value.trim();
    const msg = encodeURIComponent(`Private feedback (${pickedStar}/5 stars) for ${R.name}: ${txt || "(No comment)"}`);
    window.open(`https://wa.me/${waNum}?text=${msg}`, "_blank", "noopener");
    $("#reviewModal").hidden = true;
  });

  document.addEventListener("click", (ev) => {
    if (ev.target.closest('[data-open="info"]')) openInfoDrawer();
    const c = ev.target.closest("[data-close]");
    if (c) $("#" + c.dataset.close).hidden = true;
    if (ev.target.classList && ev.target.classList.contains("modalOverlay")) ev.target.hidden = true;
  });

  /* Table QR (?table=4&k=...) OR Master QR (?m=...) */
  const params = new URLSearchParams(location.search);
  const tParam = String(params.get("table") || "").trim();
  const kParam = String(params.get("k") || "").trim();
  const mParam = String(params.get("m") || "").trim();
  const qrTable = TABLE_RE.test(tParam) ? tParam : "";
  const qrToken = /^[0-9a-f]{32}$/i.test(kParam) ? kParam : "";
  const masterToken = /^[0-9a-f]{32}$/i.test(mParam) ? mParam : "";
  const saved = Guest.get();
  nameInput.value = saved.name;
  if (qrTable) {
    tableInput.value = qrTable;
    tableInput.readOnly = true;
  } else {
    tableInput.value = saved.table;
    if (masterToken) $("#tableLabel").textContent = "Enter Your Table Number";
  }
  const tokenFor = (table) => qrToken || (R.allow_master_qr !== false ? masterToken : "") || (saved.table === table ? saved.token : "");

  if (!R.active) blocked = "This restaurant is not available right now.";
  else if (!R.ordering_enabled) blocked = "Online ordering is paused right now. Please ask our staff to take your order.";
  else if (R.require_table_token && !(masterToken && R.allow_master_qr !== false) && !tokenFor(tableInput.value.trim())) {
    blocked = "Please scan the QR code placed on your table (or the restaurant Master QR) to start ordering.";
  }
  if (blocked) { notice.textContent = blocked; notice.hidden = false; }

  function showErr(msg) { errBox.textContent = msg || ""; }
  function refreshButton() { btn.disabled = busy || !!blocked || (!session && !Captcha.token()); }

  if (!blocked && !session) await Captcha.render($("#captchaBox"), refreshButton);
  refreshButton();

  function signInMessage(err) {
    const msg = String((err && err.message) || "");
    if (/captcha/i.test(msg)) return "Captcha check failed. Please try again.";
    if ((err && err.status === 429) || /rate limit|too many/i.test(msg)) return "Too many check-ins right now. Please wait a minute or ask our staff.";
    if (/anonymous/i.test(msg) && /disabled/i.test(msg)) return "Guest check-in is not enabled yet. Please ask our staff.";
    if (/failed to fetch|network/i.test(msg)) return "No internet connection. Please try again.";
    return "Could not start your session. Please try again.";
  }

  function finishCheckin(name, table, token) {
    Guest.update((o) => { if (o.table !== table) o.cart = []; o.name = name; o.table = table; o.token = token; });
    goTo("menu.html");
  }

  $("#occContinueBtn").addEventListener("click", () => {
    if (!pendingJoin) return;
    finishCheckin(pendingJoin.name, pendingJoin.table, pendingJoin.token);
  });
  $("#occExitBtn").addEventListener("click", () => {
    pendingJoin = null;
    occBox.hidden = true;
    form.hidden = false;
    if (!qrTable) { tableInput.value = ""; tableInput.focus(); }
    showErr("Exited. Please check your table number or ask our staff.");
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (busy || blocked) return;
    const name = nameInput.value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
    const table = tableInput.value.trim();
    if (!name) return showErr("Please enter your name.");
    if (!TABLE_RE.test(table)) return showErr("Please enter a valid table number.");
    busy = true; showErr(""); refreshButton();
    let usedCaptcha = false;
    try {
      if (!session) {
        const captchaToken = Captcha.token();
        if (!captchaToken) throw new AppError("Please complete the captcha first.", "CAPTCHA");
        usedCaptcha = true;
        const { data, error } = await sb.auth.signInAnonymously({ options: { captchaToken } });
        if (error) throw new AppError(signInMessage(error), "SIGNIN", error);
        session = data.session;
      }
      const token = tokenFor(table);
      const st = await rpc("get_table_status", { p_restaurant: R.id, p_table: table, p_token: token || null });
      if (!st || !st.valid) {
        showErr(R.require_table_token ? "This table or QR link is not valid. Please check the table number or scan again." : "We could not find that table. Please check the number.");
        return;
      }
      if (st.occupied) {
        pendingJoin = { name, table, token };
        $("#occTitle").textContent = `Table ${table} already has an active order`;
        $("#occSummary").textContent = `${st.item_count} item(s) across ${st.rounds} round(s) · Running bill: ${money(st.total)}`;
        $("#occItems").innerHTML = (st.items || []).slice(0, 8).map((i) => `<li>${esc(i.qty)} &times; ${esc(i.name)}</li>`).join("");
        form.hidden = true;
        occBox.hidden = false;
        return;
      }
      finishCheckin(name, table, token);
    } catch (e) {
      showErr(e.message || "Something went wrong. Please try again.");
    } finally {
      busy = false;
      if (usedCaptcha && !session) Captcha.reset();
      refreshButton();
    }
  });
})();
