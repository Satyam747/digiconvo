/*
=========================================================
CLINICOS SAAS - MULTI-TENANT CONFIGURATION (v5.2)
Connected to: https://wmuihwywxetbzrrjzspm.supabase.co
Supports: ?c=slug, ?clinic=slug, or #slug
=========================================================
*/
"use strict";

function resolveClinicSlug() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("c") || params.get("clinic") || params.get("r");
    const fromHash = window.location.hash ? window.location.hash.substring(1) : "";
    const raw = (fromQuery || fromHash || "patidar").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return raw || "patidar";
}

const clinicSlug = resolveClinicSlug();

const CONFIG = {
    APP: {
        NAME: "ClinicOS",
        VERSION: "5.2.0"
    },

    SUPABASE: {
        URL: "https://wmuihwywxetbzrrjzspm.supabase.co",
        ANON_KEY: "sb_publishable_nFr8gxfPv0zFGYqkKoOwiQ_dmtNL4Bg"
    },

    TENANT: {
        SLUG: clinicSlug
    },

    STORAGE: {
        LOCAL_DB: "clinicos_v52_db_" + clinicSlug,
        LOCAL_TENANTS: "clinicos_v52_master_tenants",
        LOCAL_SECURITY: "clinicos_v52_security_vault",
        RECEPTION_PIN: "clinicos_session_rec_pin_" + clinicSlug,
        DOCTOR_PIN: "clinicos_session_doc_pin_" + clinicSlug,
        MASTER_KEY: "clinicos_session_master_key",
        MY_BOOKING_PHONE: "clinicos_my_phone_" + clinicSlug
    },

    HINDI_NUMBERS: {
        1:"ek",2:"do",3:"teen",4:"chaar",5:"paanch",6:"chhah",7:"saat",8:"aath",9:"nau",10:"das",
        11:"gyaarah",12:"baarah",13:"terah",14:"chaudah",15:"pandrah",16:"solah",17:"satrah",18:"athaarah",19:"unnees",20:"bees",
        21:"ikkees",22:"baais",23:"teees",24:"chaubees",25:"pachchees",26:"chhabbees",27:"sattaais",28:"atthaais",29:"untees",30:"tees",
        31:"ikatees",32:"battees",33:"taintees",34:"chauntees",35:"paintees",36:"chhattees",37:"saintees",38:"adtees",39:"untaalees",40:"chaalees",
        41:"iktaalees",42:"bayaalees",43:"taintaalees",44:"chavaalees",45:"paintaalees",46:"chhiyaalees",47:"saintaalees",48:"adtaalees",49:"unchaas",50:"pachaas"
    }
};