"use strict";
/* =============================================================================
   login.js - shared sign-in flow for the restaurant dashboard and the DigiConvo owner console.
     1. e-mail + password + captcha (the captcha is verified by Supabase on the server)
     2. optional / mandatory 2-step verification (authenticator app code)
     3. a page-supplied authorise() check (does this account really have access here?)
   Passwords are never stored anywhere in this project: they live hashed inside Supabase Auth.
   ============================================================================= */
const LoginUI = (() => {
  let cfg = null, busy = false, otpFactorId = null, enrollFactorId = null;
  const el = (id) => document.getElementById(id);

  function showForm(which) {
    ["loginForm", "otpForm", "enrollForm"].forEach((id) => { const f = el(id); if (f) f.hidden = id !== which + "Form"; });
    el("loginScreen").hidden = false;
  }
  function setText(id, text) { const e = el(id); if (e) e.textContent = text || ""; }

  function authErrorText(err) {
    const msg = String((err && err.message) || ""), code = String((err && err.code) || "");
    if (/captcha/i.test(msg) || code === "captcha_failed") return "Captcha check failed. Please try again.";
    if ((err && err.status === 429) || /rate limit|too many/i.test(msg)) return "Too many attempts. Please wait a few minutes and try again.";
    if (/invalid login|invalid credentials/i.test(msg) || code === "invalid_credentials") return "Incorrect username/email or password.";
    if (/not confirmed/i.test(msg)) return "This account is not activated yet. Please contact DigiConvo support.";
    if (/failed to fetch|network/i.test(msg)) return "No internet connection.";
    return "Sign-in failed. Please try again.";
  }

  function updateLoginButton() {
    const b = el("loginBtn");
    if (b) b.disabled = busy || !Captcha.token();
  }

  async function renderCaptcha() {
    setText("captchaNote", "");
    const ok = await Captcha.render(el("captchaBox"), () => updateLoginButton());
    if (!ok) setText("captchaNote", "");
    updateLoginButton();
  }

  async function onLoginSubmit(ev) {
    ev.preventDefault();
    if (busy) return;
    const rawLogin = el("loginEmail").value.trim().toLowerCase();
    const email = typeof loginToEmail === "function" ? loginToEmail(rawLogin) : rawLogin;
    const password = el("loginPassword").value;
    const captchaToken = Captcha.token();
    if (!rawLogin || !password) { setText("loginError", "Enter your username (or email) and password."); return; }
    if (!captchaToken) { setText("loginError", "Please complete the captcha first."); return; }
    busy = true; updateLoginButton(); setText("loginError", "");
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken } });
      if (error) { setText("loginError", authErrorText(error)); return; }
      el("loginPassword").value = "";
      await route();
    } catch (e) {
      setText("loginError", authErrorText(e));
    } finally {
      busy = false;
      Captcha.reset();                    // a captcha token can be used only once
      updateLoginButton();
    }
  }

  /* after the password step: 2-step verification? then page authorisation */
  async function route() {
    const session = await getSession();
    if (!session || isAnonymous(session)) {
      if (session) await sb.auth.signOut({ scope: "local" });
      showForm("login"); renderCaptcha(); return;
    }
    async function reject(message) {
      await sb.auth.signOut({ scope: "local" });
      showForm("login");
      setText("loginError", message || "This account does not have access here.");
      renderCaptcha();
    }
    /* cheap membership check BEFORE any 2-step prompt, so unrelated accounts are turned away early */
    if (cfg.precheck) {
      let pre;
      try { pre = await cfg.precheck(session); } catch (e) { pre = { ok: false, message: e instanceof AppError ? e.message : friendlyError(e) }; }
      if (!pre || !pre.ok) { await reject(pre && pre.message); return; }
    }
    let aal = null;
    try { aal = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data; } catch (_) { /* treat as no MFA */ }
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") { await startOtp(); return; }
    if (cfg.requireMfa && (!aal || aal.currentLevel !== "aal2")) { await startEnroll(); return; }

    let res;
    try { res = await cfg.authorize(session); } catch (e) { res = { ok: false, message: e instanceof AppError ? e.message : friendlyError(e) }; }
    if (!res || !res.ok) { await reject(res && res.message); return; }
    el("loginScreen").hidden = true;
    cfg.onReady(session);
  }

  /* ---- 2-step verification: enter code ---- */
  async function startOtp() {
    const { data, error } = await sb.auth.mfa.listFactors();
    const factor = !error && data && data.totp && data.totp[0];
    if (!factor) { setText("loginError", "Two-step verification is set up but no authenticator was found."); showForm("login"); return; }
    otpFactorId = factor.id;
    setText("otpError", ""); el("otpCode").value = "";
    showForm("otp"); el("otpCode").focus();
  }
  async function onOtpSubmit(ev) {
    ev.preventDefault();
    if (busy) return;
    const code = el("otpCode").value.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) { setText("otpError", "Enter the 6-digit code."); return; }
    busy = true; setText("otpError", "");
    try {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: otpFactorId, code });
      if (error) { setText("otpError", "That code is not valid or has expired. Try the newest code."); return; }
      await route();
    } catch (e) { setText("otpError", friendlyError(e)); }
    finally { busy = false; }
  }

  /* ---- 2-step verification: first-time enrolment (mandatory for the owner) ---- */
  async function startEnroll() {
    setText("enrollError", "");
    try {
      const { data: list } = await sb.auth.mfa.listFactors();
      const stale = ((list && list.all) || []).filter((f) => f.status === "unverified");
      for (const f of stale) { try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch (_) { /* ignore */ } }
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "DigiConvo " + Date.now() });
      if (error) throw error;
      enrollFactorId = data.id;
      el("enrollQr").innerHTML = QR.svg(data.totp.uri, { border: 2 });
      el("enrollSecret").textContent = data.totp.secret;
      el("enrollCode").value = "";
      showForm("enroll");
    } catch (e) {
      showForm("login");
      setText("loginError", "Could not start two-step setup: " + friendlyError(e));
    }
  }
  async function onEnrollSubmit(ev) {
    ev.preventDefault();
    if (busy) return;
    const code = el("enrollCode").value.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) { setText("enrollError", "Enter the 6-digit code from your authenticator app."); return; }
    busy = true; setText("enrollError", "");
    try {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: enrollFactorId, code });
      if (error) { setText("enrollError", "That code is not valid. Check the time on your phone and try again."); return; }
      await route();
    } catch (e) { setText("enrollError", friendlyError(e)); }
    finally { busy = false; }
  }

  async function signOut() {
    try { await sb.auth.signOut({ scope: "local" }); } catch (_) { /* ignore */ }
    location.reload();
  }

  /* options: { precheck?(session), authorize(session) -> {ok, message}, onReady(session), requireMfa } */
  async function init(options) {
    cfg = options;
    el("loginForm").addEventListener("submit", onLoginSubmit);
    el("otpForm").addEventListener("submit", onOtpSubmit);
    if (el("enrollForm")) el("enrollForm").addEventListener("submit", onEnrollSubmit);
    ["otpCancel", "enrollCancel"].forEach((id) => { if (el(id)) el(id).addEventListener("click", signOut); });
    const session = await getSession();
    if (session && !isAnonymous(session)) { await route(); return; }
    if (session) { try { await sb.auth.signOut({ scope: "local" }); } catch (_) { /* ignore */ } }
    showForm("login");
    renderCaptcha();
  }
  return { init, signOut };
})();

/* 2-step verification management (Settings -> Security) */
const MfaTools = {
  async verifiedFactor() {
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) throw error;
    return (data.totp && data.totp[0]) || null;
  },
  async beginEnroll() {
    const { data: list } = await sb.auth.mfa.listFactors();
    for (const f of ((list && list.all) || []).filter((x) => x.status === "unverified")) {
      try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch (_) { /* ignore */ }
    }
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "DigiConvo " + Date.now() });
    if (error) throw error;
    return { id: data.id, uri: data.totp.uri, secret: data.totp.secret };
  },
  async confirmEnroll(factorId, code) {
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw error;
  },
  async remove(factorId) {
    const { error } = await sb.auth.mfa.unenroll({ factorId });
    if (error) throw error;
  }
};

/* ---------- login creation / password reset through the "manage-user" Edge Function ---------- */
async function callManageUser(body) {
  const { data, error } = await sb.functions.invoke("manage-user", { body });
  if (!error) { if (data && data.error) throw new AppError(data.error, "FN"); return data; }
  let message = "Could not reach the login service.";
  try {
    const ctx = error.context;
    if (ctx && typeof ctx.json === "function") {
      if (ctx.status === 404) message = "The login service is not installed yet. Deploy the manage-user Edge Function (see README).";
      else { const j = await ctx.json(); if (j && j.error) message = j.error; }
    }
  } catch (_) { /* keep generic message */ }
  throw new AppError(message, "FN", error);
}

function generatePassword(length) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnopqrstuvwxyz", digits = "23456789", all = upper + lower + digits;
  length = Math.max(12, length || 16);
  const pick = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {            // Fisher-Yates shuffle
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.className = "offscreen"; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_e) { ok = false; }
    ta.remove();
    return ok;
  }
}
