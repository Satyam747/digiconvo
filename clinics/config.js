/*
=========================================================
CLINICOS SAAS - MULTI-TENANT CONFIGURATION (v8.0)
Connected to: https://wmuihwywxetbzrrjzspm.supabase.co
Supports: ?c=slug, ?clinic=slug, or #slug
=========================================================
*/
"use strict";

function resolveClinicSlug() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("c") || params.get("clinic") || params.get("r");
    const fromHash = window.location.hash ? window.location.hash.substring(1) : "";
    const raw = (fromQuery || fromHash || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return raw;
}

const clinicSlug = resolveClinicSlug();

const CONFIG = {
    APP: {
        NAME: "ClinicOS",
        VERSION: "8.0.0"
    },

    SUPABASE: {
        URL: "https://wmuihwywxetbzrrjzspm.supabase.co",
        ANON_KEY: "sb_publishable_nFr8gxfPv0zFGYqkKoOwiQ_dmtNL4Bg"
    },

    /*
    ---------------------------------------------------------
    CLOUDFLARE TURNSTILE (SERVER-SIDE BOT PROTECTION)
    ---------------------------------------------------------
    Leave TURNSTILE_SITE_KEY blank to use the built-in server-verified
    SVG CAPTCHA out of the box.
    Once you deploy `clinicos-turnstile-edge-function.ts` as `clinicos-gate`
    in Supabase Edge Functions:
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
        RECEPTION_PIN: "clinicos_v80_rec_tok_" + clinicSlug,
        DOCTOR_PIN: "clinicos_v80_doc_tok_" + clinicSlug,
        DOCTOR_ID: "clinicos_v80_doc_id_" + clinicSlug,
        MASTER_KEY: "clinicos_v80_master_key",
        MY_BOOKING_REF: "clinicos_v80_booking_ref_" + clinicSlug
    },

    HINDI_NUMBERS: {
        1:"ek",2:"do",3:"teen",4:"chaar",5:"paanch",6:"chhah",7:"saat",8:"aath",9:"nau",10:"das",
        11:"gyaarah",12:"baarah",13:"terah",14:"chaudah",15:"pandrah",16:"solah",17:"satrah",18:"athaarah",19:"unnees",20:"bees",
        21:"ikkees",22:"baais",23:"teees",24:"chaubees",25:"pachchees",26:"chhabbees",27:"sattaais",28:"atthaais",29:"untees",30:"tees",
        31:"ikatees",32:"battees",33:"taintees",34:"chauntees",35:"paintees",36:"chhattees",37:"saintees",38:"adtees",39:"untaalees",40:"chaalees",
        41:"iktaalees",42:"bayaalees",43:"taintaalees",44:"chavaalees",45:"paintaalees",46:"chhiyaalees",47:"saintaalees",48:"adtaalees",49:"unchaas",50:"pachaas"
    }
};