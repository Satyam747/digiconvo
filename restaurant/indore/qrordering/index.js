"use strict";
/* Check-in page: a guest passes the captcha ONCE (verified by Supabase), gets a private anonymous
   session, and the table is validated by the database before ordering starts. */
(async function () {
  initClient("guest");
  if (!(await bootRestaurant())) return;

  const form = $("#checkinForm"), btn = $("#startBtn"), errBox = $("#formError");
  const nameInput = $("#customerName"), tableInput = $("#tableNumber"), notice = $("#notice");
  let busy = false, blocked = "", session = await getSession();

  /* header */
  $("#restaurantName").textContent = R.name;
  $("#restaurantTagline").textContent = R.tagline || "Scan, order and enjoy";
  const logo = safeUrl(R.logo);
  if (logo) { const img = $("#restaurantLogo"); img.src = logo; img.hidden = false; $("#logoIcon").hidden = true; }

  /* table + secret token come from the QR code */
  const params = new URLSearchParams(location.search);
  const tParam = String(params.get("table") || "").trim();
  const kParam = String(params.get("k") || "").trim();
  const qrTable = TABLE_RE.test(tParam) ? tParam : "";
  const qrToken = /^[0-9a-f]{32}$/i.test(kParam) ? kParam : "";
  const saved = Guest.get();
  nameInput.value = saved.name;
  if (qrTable) { tableInput.value = qrTable; tableInput.readOnly = true; } else { tableInput.value = saved.table; }
  const tokenFor = (table) => qrToken || (saved.table === table ? saved.token : "");

  if (!R.active) blocked = "This restaurant is not available right now.";
  else if (!R.ordering_enabled) blocked = "Online ordering is paused right now. Please ask our staff to take your order.";
  else if (R.require_table_token && !tokenFor(tableInput.value.trim())) blocked = "Please scan the QR code placed on your table to start ordering.";
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
      const ok = await rpc("check_table", { p_restaurant: R.id, p_table: table, p_token: token || null });
      if (!ok) {
        showErr(R.require_table_token ? "This table link is not valid. Please scan the QR code on your table again." : "We could not find that table. Please check the number.");
        return;
      }
      Guest.update((o) => { if (o.table !== table) o.cart = []; o.name = name; o.table = table; o.token = token; });
      goTo("menu.html");
    } catch (e) {
      showErr(e.message || "Something went wrong. Please try again.");
    } finally {
      busy = false;
      if (usedCaptcha && !session) Captcha.reset();
      refreshButton();
    }
  });
})();
