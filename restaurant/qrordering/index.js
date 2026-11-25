"use strict";
/* Check-in page: supports individual table QR (?table=4&k=...) AND Master QR (?m=...),
   live announcement banner, quick guest actions (Party booking, Contact, Instagram, Wi-Fi, Smart Reviews),
   and smart occupied-table re-scan detection. */
(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;

  const form = $("#checkinForm"), btn = $("#startBtn"), errBox = $("#formError");
  const nameInput = $("#customerName"), tableInput = $("#tableNumber"), notice = $("#notice");
  const occBox = $("#occupiedBox");
  let busy = false, blocked = "", session = await getSession(), pendingJoin = null;

  /* header & live announcement */
  $("#restaurantName").textContent = R.name;
  $("#restaurantTagline").textContent = R.tagline || "Scan, order and enjoy";
  const logo = safeUrl(R.logo);
  if (logo) { const img = $("#restaurantLogo"); img.src = logo; img.hidden = false; $("#logoIcon").hidden = true; }
  if (R.announcement) {
    $("#announcementText").textContent = R.announcement;
    $("#announcementBanner").hidden = false;
  }

  /* quick hospitality pills */
  const waNum = normalizeWhatsApp(R.whatsapp || R.phone);
  const igUrl = safeUrl(R.instagram_url);
  const revUrl = safeUrl(R.review_link);
  const pills = [];
  if (R.party_booking_enabled && waNum) {
    const msg = encodeURIComponent(`Hi ${R.name}, I'd like to enquire about booking a party / group table.`);
    pills.push(`<a class="qPill" href="https://wa.me/${esc(waNum)}?text=${msg}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-champagne-glasses"></i> Book Party</a>`);
  }
  if (R.phone || waNum) {
    const href = R.phone ? `tel:${esc(R.phone.replace(/[^\d+]/g, ""))}` : `https://wa.me/${esc(waNum)}`;
    pills.push(`<a class="qPill" href="${href}"><i class="fa-solid fa-phone"></i> Contact</a>`);
  }
  if (igUrl) {
    pills.push(`<a class="qPill" href="${esc(igUrl)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-instagram"></i> Instagram</a>`);
  }
  if (R.wifi_name) {
    pills.push(`<button type="button" class="qPill" id="openWifiBtn"><i class="fa-solid fa-wifi"></i> Free Wi-Fi</button>`);
  }
  if (revUrl || waNum) {
    pills.push(`<button type="button" class="qPill" id="openReviewBtn"><i class="fa-solid fa-star"></i> Rate Us</button>`);
  }
  if (pills.length) {
    $("#quickActions").innerHTML = pills.join("");
    $("#quickActions").hidden = false;
  }

  /* Wi-Fi & Smart Review modal wiring */
  const openWifi = $("#openWifiBtn");
  if (openWifi) {
    openWifi.addEventListener("click", () => {
      $("#wifiSsid").textContent = R.wifi_name || "--";
      $("#wifiPass").textContent = R.wifi_password || "No password";
      $("#wifiModal").hidden = false;
    });
  }
  $("#copyWifiBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(R.wifi_password || ""); $("#copyWifiBtn").textContent = "Password Copied!"; setTimeout(() => { $("#copyWifiBtn").innerHTML = '<i class="fa-regular fa-copy"></i> Copy Password'; }, 1800); } catch (_) {}
  });
  let pickedStar = 0;
  const openRev = $("#openReviewBtn");
  if (openRev) {
    openRev.addEventListener("click", () => {
      pickedStar = 0;
      $$("#starPicker .starBtn").forEach((b) => b.classList.remove("lit"));
      $("#lowRatingBox").hidden = true;
      $("#highRatingBox").hidden = true;
      $("#privateFeedback").value = "";
      $("#reviewModal").hidden = false;
    });
  }
  $("#starPicker").addEventListener("click", (ev) => {
    const b = ev.target.closest(".starBtn");
    if (!b) return;
    pickedStar = Number(b.dataset.star);
    $$("#starPicker .starBtn").forEach((el) => el.classList.toggle("lit", Number(el.dataset.star) <= pickedStar));
    if (pickedStar >= 4 && revUrl) {
      $("#lowRatingBox").hidden = true;
      $("#googleReviewBtn").href = revUrl;
      $("#highRatingBox").hidden = false;
    } else if (waNum) {
      $("#highRatingBox").hidden = true;
      $("#lowRatingBox").hidden = false;
    } else if (revUrl) {
      $("#lowRatingBox").hidden = true;
      $("#googleReviewBtn").href = revUrl;
      $("#highRatingBox").hidden = false;
    }
  });
  $("#sendFeedbackBtn").addEventListener("click", () => {
    const txt = $("#privateFeedback").value.trim();
    const msg = encodeURIComponent(`Private feedback (${pickedStar}/5 stars) for ${R.name}: ${txt || "(No comment)"}`);
    window.open(`https://wa.me/${waNum}?text=${msg}`, "_blank", "noopener");
    $("#reviewModal").hidden = true;
  });
  document.addEventListener("click", (ev) => {
    const c = ev.target.closest("[data-close]");
    if (c) $("#" + c.dataset.close).hidden = true;
    if (ev.target.classList && ev.target.classList.contains("custModal")) ev.target.hidden = true;
  });

  /* table + secret token OR Master QR (?m=...) */
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
  const tokenFor = (table) => qrToken || masterToken || (saved.table === table ? saved.token : "");

  if (!R.active) blocked = "This restaurant is not available right now.";
  else if (!R.ordering_enabled) blocked = "Online ordering is paused right now. Please ask our staff to take your order.";
  else if (R.require_table_token && !masterToken && !tokenFor(tableInput.value.trim())) {
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
    if ((err && err.status === 429) || /rate limit|too many/i.test(msg)) return "Too many check-ins from this network right now. Please wait a minute or ask our staff.";
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
