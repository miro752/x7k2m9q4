/*! coi-serviceworker v0.1.7 - Guido Zuidhof, MIT license */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then((clients) => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    const CACHE = "sambrk-v37";
    const PRECACHE = ["./", "index.html", "style.css", "main.js", "board-ui.js", "engine-api.js", "engine-worker.js", "engine.js", "engine.wasm", "engine.worker.js",
        "game-state.js", "game-storage.js", "fastgame.js", "i18n.js", "clock.js", "move-input.js", "search-manager.js", "sound.js", "tablebase-loader.js", "turn-controller.js",
        "models/model_007.bin", "opening-a822ebc72d1b.cbook", "openings.txt", "favicon.ico", "manifest.json", "icon-192.png", "icon-512.png"];
    self.addEventListener("install", (e) => {
        e.waitUntil(caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))));
    });
    const withIsolation = (response) => {
        if (response.status === 0) return response;
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
    };
    self.addEventListener("fetch", function (e) {
        const r = e.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }
        const request = coepCredentialless && r.mode === "no-cors" ? new Request(r, { credentials: "omit" }) : r;
        const url = new URL(r.url);
        const cacheable = url.origin === self.location.origin && r.method === "GET" && !url.pathname.includes("/tablebases/");
        e.respondWith((async () => {
            if (cacheable) {
                const cache = await caches.open(CACHE);
                const key = url.origin + url.pathname;
                const hit = await cache.match(key);
                const net = fetch(request).then(async (resp) => {
                    if (resp && resp.ok && resp.status === 200) await cache.put(key, resp.clone());
                    return resp;
                }).catch(() => null);
                if (hit) { e.waitUntil(net); return withIsolation(hit); }
                const resp = await net;
                return resp ? withIsolation(resp) : Response.error();
            }
            try { return withIsolation(await fetch(request)); } catch (err) { return Response.error(); }
        })());
    });
} else {
    (() => {
        const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
        window.sessionStorage.removeItem("coiReloadedBySelf");
        const coepDegrading = (reloadedBySelf === "coepDegrade");

        // Check if already works
        if (window.crossOriginIsolated !== false || reloadedBySelf) {
            return;
        }

        // Register service worker
        if (!window.isSecureContext) {
            console.log("COOP/COEP: Not in a secure context, cannot register service worker.");
            return;
        }

        if (!navigator.serviceWorker) {
            console.log("COOP/COEP: Service workers not supported.");
            return;
        }

        navigator.serviceWorker
            .register(window.document.currentScript.src)
            .then(
                (registration) => {
                    if (registration.active && !navigator.serviceWorker.controller) {
                        window.sessionStorage.setItem("coiReloadedBySelf", "reload");
                        window.location.reload();
                    } else if (registration.installing) {
                        registration.installing.addEventListener("statechange", function () {
                            if (this.state === "activated") {
                                window.sessionStorage.setItem("coiReloadedBySelf", "reload");
                                window.location.reload();
                            }
                        });
                    }
                },
                (err) => {
                    console.error("COOP/COEP: Service worker registration failed:", err);
                }
            );
    })();
}
