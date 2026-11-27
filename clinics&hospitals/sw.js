/*
=========================================================
CLINICOS v11.0 - EGRESS-SAFE SERVICE WORKER (sw.js)
Caches static app shell assets only (zero PHI, zero Supabase RPC caching).
=========================================================
*/
"use strict";

const CACHE_NAME = "clinicos-shell-v11.0.1";
const SHELL_ASSETS = [
    "./config.js",
    "./common.js",
    "./manifest.json"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    // Never cache Supabase API, edge functions, or third-party auth/CAPTCHA requests
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(req)
            .then((res) => {
                if (res && res.status === 200 && res.type === "basic") {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
                }
                return res;
            })
            .catch(() => caches.match(req))
    );
});
