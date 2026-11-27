/*
=========================================================
CLINICOS SAAS - MULTI-TENANT CONFIGURATION (v11.0)
Connected to: https://wmuihwywxetbzrrjzspm.supabase.co
Supports: ?c=slug, ?clinic=slug, or #slug
=========================================================
*/
"use strict";

function resolveClinicSlug() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("c") || params.get("clinic");
    const fromHash = window.location.hash ? window.location.hash.substring(1) : "";
    return (fromQuery || fromHash || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

const clinicSlug = resolveClinicSlug();

const CONFIG = {
    APP: {
        NAME: "ClinicOS",
        VERSION: "11.0.0",
        LOCALE: "en-IN",
        TIMEZONE: "Asia/Kolkata",
        DEFAULT_COUNTRY_CODE: "91"
    },

    SUPABASE: {
        URL: "https://wmuihwywxetbzrrjzspm.supabase.co",
        // Supports Supabase publishable keys (sb_publishable_...) and legacy anon JWTs (eyJ...)
        ANON_KEY: "sb_publishable_nFr8gxfPv0zFGYqkKoOwiQ_dmtNL4Bg"
    },

    /*
    ---------------------------------------------------------
    CLOUDFLARE TURNSTILE (SERVER-SIDE BOT PROTECTION)
    ---------------------------------------------------------
    Leave TURNSTILE_SITE_KEY blank to use the built-in server-verified
    SVG CAPTCHA out of the box.
    Once you deploy `clinicos-turnstile-edge-function.ts` as `clinicos-gate`:
      1. Paste your Cloudflare Turnstile Site Key below.
      2. Set AUTH_PROXY_URL to:
         "https://wmuihwywxetbzrrjzspm.supabase.co/functions/v1/clinicos-gate"
    */
    SECURITY: {
        TURNSTILE_SITE_KEY: "0x4AAAAAAGQLuZt8RmUdSnq6",
        AUTH_PROXY_URL: "https://wmuihwywxetbzrrjzspm.supabase.co/functions/v1/clinicos-gate"
    },

    TENANT: {
        SLUG: clinicSlug
    },

    STORAGE: {
        STAFF_TOKEN: "clinicos_v11_staff_tok_" + clinicSlug,
        MASTER_KEY: "clinicos_v11_hq_tok",
        MY_BOOKING_REF: "clinicos_v11_booking_ref_" + clinicSlug,
        AUTO_PRINT_SLIP: "clinicos_v11_autoprint_" + clinicSlug
    }
};
