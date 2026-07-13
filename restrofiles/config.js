/*
=========================================================
DIGICONVO QR RESTAURANT SYSTEM
Dynamic Configuration
=========================================================
Reads ?restaurant= from the URL and selects
the correct Supabase project.
=========================================================
*/

"use strict";

/*=========================================================
RESTAURANTS
Add new restaurants here only.
=========================================================*/

const RESTAURANTS = {

    thevelvetlounge: {

        URL: "https://razvomovvgzlckhgagfm.supabase.co",

        ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhenZvbW92dmd6bGNraGdhZ2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NDc2MjIsImV4cCI6MjA5OTMyMzYyMn0.OJRNzuUQrFDodDTuY-Y6xVK52zbTpSCAplEyGyMxDxk"

    }

};

/*=========================================================
GET RESTAURANT FROM URL
=========================================================*/

const restaurantSlug =
    new URLSearchParams(window.location.search)
    .get("restaurant") || "thevelvetlounge";

/*=========================================================
CHECK RESTAURANT
=========================================================*/

if (!RESTAURANTS[restaurantSlug]) {

    alert("Restaurant not found.");

    throw new Error(
        "Unknown restaurant: " + restaurantSlug
    );

}

/*=========================================================
CURRENT RESTAURANT
=========================================================*/

const CURRENT = RESTAURANTS[restaurantSlug];

/*=========================================================
CONFIG
=========================================================*/

const CONFIG = {

    APP: {

        NAME: "Digiconvo QR Ordering",

        VERSION: "1.0.0"

    },

    SUPABASE: {

        URL: CURRENT.URL,

        ANON_KEY: CURRENT.ANON_KEY

    },

    RESTAURANT: {

        NAME: "Restaurant",

        TAGLINE: "Restaurant"

    },

    STORAGE: {

        SESSION: "digiconvo_session"

    },

    DASHBOARD: {

        DEFAULT_REFRESH: 10,

        ADMIN_PIN_LENGTH: 4

    },

    ROUTES: {

        INDEX: "index.html",

        MENU: "menu.html",

        CHECKOUT: "checkout.html",

        SUCCESS: "success.html",

        DASHBOARD: "dashboard.html"

    },

    FEATURES: {

        HAPPY_HOUR: true,

        UPI: true,

        WHATSAPP: true,

        GOOGLE_REVIEW: true,

        PRINT_BILL: true,

        PRINT_KOT: true,

        ANALYTICS: true,

        ORDER_HISTORY: true

    },

    UI: {

        DEFAULT_IMAGE: "assets/default-food.jpg",

        THERMAL_WIDTH: 32,

        CURRENCY: "₹"

    }

};
