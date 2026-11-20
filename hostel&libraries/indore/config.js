/*
=========================================================
LIBRARYOS SAAS - MULTI-TENANT CONFIGURATION (v1.0)
Supports: ?l=slug, ?library=slug, ?r=slug, ?c=slug, or #slug
Fill in the URL and PUBLISHABLE (anon) key of your fresh Supabase project.
Never put a service_role / secret key here.
=========================================================
*/
"use strict";

function resolveLibrarySlug() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("l") || params.get("library") || params.get("r") || params.get("c");
    const fromHash = window.location.hash ? window.location.hash.substring(1) : "";
    return (fromQuery || fromHash || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

const librarySlug = resolveLibrarySlug();

const CONFIG = {
    APP: { NAME: "LibraryOS", VERSION: "1.0.0" },

    SUPABASE: {
        URL: "https://tgauhjunnkfqwrqcfvtj.supabase.co",
        ANON_KEY: "sb_publishable_kL0Wk4JPYfr_hJBCmiypxQ_ARpKBEIQ"
    },

    TENANT: { SLUG: librarySlug },

    // Public writes (booking, waitlist, device link, renewal) can be routed through the public-gate Edge Function
    // with a Cloudflare Turnstile check. Set ENABLED to true only after deploying it (see PRODUCTION_SETUP.md).
    GATE: { ENABLED: false, TURNSTILE_SITE_KEY: "" },

    BRAND: { COMPANY: "DigiConvo", PRODUCT: "LibraryOS", SUPPORT_WHATSAPP: "", SUPPORT_EMAIL: "", TERMS_URL: "", PRIVACY_URL: "" },

    SHIFTS: ["Morning", "Evening", "Full Day"],

    STORAGE: {
        DESK_TOKEN: "libraryos_session_desk_" + librarySlug,
        OWNER_TOKEN: "libraryos_session_owner_" + librarySlug,
        ROLE: "libraryos_session_role_" + librarySlug,
        MASTER_KEY: "libraryos_session_master_key",
        MY_BOOKING_REF: "libraryos_my_booking_ref_" + librarySlug
    }
};
