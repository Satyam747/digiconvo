/*
=========================================================
DIGICONVO LITE - MULTI-TENANT SAAS CONFIGURATION (v4.1)
=========================================================
Connected to: https://xmsghzhlybiakfmyypek.supabase.co
Supports: ?r=slug, ?restaurant=slug, or #slug
=========================================================
*/

"use strict";

function resolveRestaurantSlug() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("r") || params.get("restaurant");
    const fromHash = window.location.hash ? window.location.hash.substring(1) : "";
    const raw = (fromQuery || fromHash || "demo").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return raw || "demo";
}

const restaurantSlug = resolveRestaurantSlug();

const CONFIG = {
    APP: {
        NAME: "Digiconvo Smart QR Menu",
        VERSION: "4.1.0"
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

    STORAGE: {
        SHORTLIST: "digiconvo_shortlist_" + restaurantSlug,
        ADMIN_PIN: "digiconvo_session_pin_" + restaurantSlug,
        MASTER_KEY: "digiconvo_session_master_key"
    },

    ROUTES: {
        MENU: "index.html",
        DASHBOARD: "dashboard.html",
        SUPER_ADMIN: "admin.html"
    },

    UI: {
        DEFAULT_IMAGE: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80",
        CURRENCY: "₹"
    }
};