/*
=========================================================
DIGICONVO LITE - MULTI-TENANT SAAS CONFIGURATION
=========================================================
Connected to: https://xmsghzhlybiakfmyypek.supabase.co
URL parameter: ?r=demo (or ?restaurant=demo)
=========================================================
*/

"use strict";

const urlParams = new URLSearchParams(window.location.search);
const restaurantSlug = (
    urlParams.get("r") ||
    urlParams.get("restaurant") ||
    "demo"
).toLowerCase().replace(/[^a-z0-9_-]/g, "");

const CONFIG = {
    APP: {
        NAME: "Digiconvo Smart QR Menu",
        VERSION: "4.0.0"
    },

    SUPABASE: {
        URL: "https://xmsghzhlybiakfmyypek.supabase.co",
        ANON_KEY: "sb_publishable_3_roVClQC2ngYAV_lua-kA_n6ZYOr83"
    },

    TENANT: {
        SLUG: restaurantSlug || "demo"
    },

    RESTAURANT: {
        NAME: "The Royal Spice Kitchen",
        TAGLINE: "Authentic Flavors • Artisanal Craft • Rooftop Vibes"
    },

    STORAGE: {
        SHORTLIST: "digiconvo_shortlist_" + (restaurantSlug || "demo"),
        ADMIN_PIN: "digiconvo_session_pin_" + (restaurantSlug || "demo"),
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