/*
=========================================================
DIGICONVO QR RESTAURANT ORDERING SYSTEM
Configuration File
=========================================================
Only edit this file when installing for a new restaurant.
Restaurant information is loaded from Google Apps Script.
=========================================================
*/

"use strict";

const CONFIG = {

    APP: {

        NAME: "Digiconvo QR Ordering",

        VERSION: "1.0.0"

    },

    API: {

        URL: "https://script.google.com/macros/s/AKfycbxIpIGdqKCmCMZzTuKaEJBP7aKgBrMtXv6wn9cfdxULeB-xZL8_17UiyDFNy52I9CkD/exec",

        TIMEOUT: 45000

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