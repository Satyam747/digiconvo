/*
=========================================================
DIGICONVO SMART QR MENU - CONFIGURATION (v7.0)
=========================================================
Connected to: https://xmsghzhlybiakfmyypek.supabase.co
Menu URL formats:  index.html?r=slug   |   index.html#slug
Table QR codes:    index.html?r=slug&t=12
=========================================================
*/

"use strict";

function resolveRestaurantSlug() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("r") || params.get("restaurant");
    const fromHash = window.location.hash ? window.location.hash.substring(1) : "";
    const raw = (fromQuery || fromHash || "demo").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
    return raw || "demo";
}

const restaurantSlug = resolveRestaurantSlug();

const CONFIG = {
    APP: {
        NAME: "Digiconvo Smart QR Menu",
        VERSION: "7.0.0"
    },

    SUPABASE: {
        URL: "https://xmsghzhlybiakfmyypek.supabase.co",
        ANON_KEY: "sb_publishable_3_roVClQC2ngYAV_lua-kA_n6ZYOr83"
    },

    /*
    ---------------------------------------------------------
    CLOUDFLARE TURNSTILE (SERVER-SIDE BOT PROTECTION)
    ---------------------------------------------------------
    Leave TURNSTILE_SITE_KEY blank to use the built-in 6-digit
    visual code out of the box.
    Once you create a Cloudflare Turnstile widget and deploy
    the included `turnstile_auth_edge_function.ts` to Supabase:
      1. Paste your Turnstile Site Key below.
      2. Set AUTH_PROXY_URL to:
         "https://xmsghzhlybiakfmyypek.supabase.co/functions/v1/auth-gate"
    */
    SECURITY: {
        TURNSTILE_SITE_KEY: "0x4AAAAAAGQLuZt8RmUdSnq6",
        AUTH_PROXY_URL: "https://xmsghzhlybiakfmyypek.supabase.co/functions/v1/auth-gate"
    },

    TENANT: {
        SLUG: restaurantSlug
    },

    RESTAURANT: {
        NAME: "Loading Menu...",
        TAGLINE: ""
    },

    STORAGE: {
        SHORTLIST: "digiconvo_shortlist_" + restaurantSlug,
        ADMIN_PIN: "digiconvo_owner_token_" + restaurantSlug,
        MASTER_KEY: "digiconvo_master_token",
        CACHE: "digiconvo_cache_" + restaurantSlug
    },

    ROUTES: {
        MENU: "index.html",
        DASHBOARD: "dashboard.html",
        SUPER_ADMIN: "admin.html"
    },

    NETWORK: {
        TIMEOUT_MS: 15000,
        READ_RETRIES: 1
    },

    UI: {
        DEFAULT_IMAGE: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80",
        CURRENCY: "₹",
        TIMEZONE: "Asia/Kolkata",
        DEFAULT_CITY: "Indore",
        DEFAULT_STATE: "Madhya Pradesh"
    }
};