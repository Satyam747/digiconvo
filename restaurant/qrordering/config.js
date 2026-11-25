"use strict";
/* =============================================================================
   PUBLIC configuration - nothing in this file is secret and nothing here grants access.
   (The Supabase "anon" key is designed to be public; Row Level Security in the database
    decides what it can do. NEVER put the service_role key anywhere in this project.)

   ONE Supabase project now serves ALL restaurants. A restaurant is selected by the web address:
       customer QR :  /index.html?restaurant=<slug>&table=<no>&k=<token>
       staff login :  /dashboard.html?restaurant=<slug>
       DigiConvo   :  /admin.html
   ============================================================================= */
const CONFIG = Object.freeze({
  APP: Object.freeze({ NAME: "DigiConvo QR Ordering", VERSION: "5.0.0" }),

  SUPABASE: Object.freeze({
    URL: "https://ninecqyodlnzswuootjt.supabase.co",
    ANON_KEY: "sb_publishable_ip47j42iXPXAFadVov-K7A_3igHZfsh"
  }),

  /* Cloudflare Turnstile SITE key (public). The value below is Cloudflare's official TEST key
     (always passes) - fine for development, replace it with your real site key before going live.
     The matching SECRET key is entered in Supabase -> Authentication -> Attack Protection. */
  TURNSTILE_SITE_KEY: "0x4AAAAAAGQLuZt8RmUdSnq6",

  DASHBOARD: Object.freeze({
    /* auto sign-out after this many idle minutes (0 = never, e.g. for a wall-mounted kitchen screen) */
    IDLE_LOCK_MINUTES: Object.freeze({ admin: 15, staff: 0 })
  }),

  CART: Object.freeze({ TTL_HOURS: 8, MAX_QTY: 20 }),

  /* shown in the UI only; the database enforces the real number (private.retention_days()) */
  RETENTION_DAYS_FALLBACK: 7
});
