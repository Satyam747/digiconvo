/*
=========================================================
DIGICONVO SMART QR MENU - CONFIGURATION (v5.0)
=========================================================
Connected to: https://xmsghzhlybiakfmyypek.supabase.co
Menu URL formats:  index.html?r=slug   |   index.html#slug
Table QR codes:    index.html?r=slug&t=12   (table number is added to the order message)
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
        VERSION: "5.0.0"
    },

    SUPABASE: {
        URL: "https://xmsghzhlybiakfmyypek.supabase.co",
        ANON_KEY: "sb_publishable_3_roVClQC2ngYAV_lua-kA_n6ZYOr83"
    },

    TENANT: {
        SLUG: restaurantSlug
    },

    RESTAURANT: {
        NAME: "Loading Menu...",
        TAGLINE: ""
    },

    // Values below are session TOKENS (never the PIN / master key itself)
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
        TIMEZONE: "Asia/Kolkata"      // offers / happy hours are evaluated in the restaurant's time zone
    }
};