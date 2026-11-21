/**
 * Game storage - parties enregistrées dans IndexedDB (grosses bases),
 * avec copie en mémoire pour un accès immédiat.
 * Repli sur localStorage si IndexedDB n'est pas disponible.
 */

const GAMES_KEY = 'torquemada-games';
const DB_NAME = 'sambrk-db';
const STORE = 'games';

let cache = [];
let db = null;
let useLS = false;

// Les coups sont gardés dans une chaîne "ms" ; game.moves renvoie le tableau à la demande.
function hydrate(r) {
    const d0 = Object.getOwnPropertyDescriptor(r, 'moves');
    if (d0 && !d0.get) { r.ms = Array.isArray(d0.value) ? d0.value.join(' ') : (r.ms || ''); delete r.moves; }
    if (r.ms === undefined) r.ms = '';
    if (!Object.getOwnPropertyDescriptor(r, 'moves')) {
        Object.defineProperty(r, 'moves', { get() { return this.ms ? this.ms.split(' ') : []; }, enumerable: false, configurable: true });
    }
    return r;
}

function openDB() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
function txDone(tx) {
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}
function lsSave() {
    try { localStorage.setItem(GAMES_KEY, JSON.stringify(cache.map(g => ({ ...g, moves: g.moves })))); }
    catch (e) { console.warn('Could not save games:', e); }
}
function idbPut(rec) {
    if (useLS) { lsSave(); return; }
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec); } catch (e) { console.warn('put:', e); }
}

export async function initGameStorage() {
    try {
        db = await openDB();
        const all = await new Promise((resolve, reject) => {
            const r = db.transaction(STORE).objectStore(STORE).getAll();
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        });
        cache = all.map(hydrate);
        // migration depuis l'ancien stockage
        const raw = localStorage.getItem(GAMES_KEY);
        if (raw) {
            try {
                const old = JSON.parse(raw);
                if (Array.isArray(old) && old.length) {
                    const have = new Set(cache.map(g => g.id));
                    const fresh = old.filter(g => !have.has(g.id)).map(hydrate);
                    cache.push(...fresh);
                    await addGames(fresh);
                }
                localStorage.removeItem(GAMES_KEY);
            } catch (e) { console.warn('migration:', e); }
        }
    } catch (e) {
        console.warn('IndexedDB indisponible, utilisation de localStorage:', e);
        useLS = true;
        try { cache = (JSON.parse(localStorage.getItem(GAMES_KEY)) || []).map(hydrate); } catch (_) { cache = []; }
    }
}

/** Ajoute beaucoup de parties d'un coup (déjà présentes ou non dans le cache). */
export async function addGames(list) {
    if (useLS) { lsSave(); return; }
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    for (const g of list) st.put(g);
    await txDone(tx);
}
export function pushGames(list) {
    for (const g of list) { hydrate(g); cache.push(g); }
    return addGames(list);
}

export function saveGame(game) { hydrate(game); cache.push(game); idbPut(game); }

export function upsertGame(game) {
    hydrate(game);
    const i = cache.findIndex(g => g.id === game.id);
    if (i >= 0) cache[i] = game; else cache.push(game);
    idbPut(game);
}

/** Remplace toute la liste. */
export async function setGames(games) {
    cache = games.map(hydrate);
    if (useLS) { lsSave(); return; }
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    st.clear();
    for (const g of cache) st.put(g);
    await txDone(tx);
}

export function getGames() { return cache; }

export function deleteGame(id) {
    cache = cache.filter(g => g.id !== id);
    if (useLS) { lsSave(); return; }
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id); } catch (e) { console.warn(e); }
}

export function deleteGames(ids) {
    const set = new Set(ids);
    cache = cache.filter(x => !set.has(x.id));
    if (useLS) { lsSave(); return; }
    try { const st = db.transaction(STORE, 'readwrite').objectStore(STORE); for (const id of set) st.delete(id); } catch (e) { console.warn(e); }
}

export function clearGames() {
    cache = [];
    if (useLS) { try { localStorage.removeItem(GAMES_KEY); } catch (e) {} return; }
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch (e) { console.warn(e); }
}

export function computeStats() {
    let wins = 0, draws = 0, losses = 0;
    for (const g of cache) {
        if (g.free || g.imported) continue;  // parties libres / importées : pas de statistiques
        if (g.result === 'draw') draws++;
        else if (g.result === g.playerColor) wins++;
        else losses++;
    }
    return { wins, draws, losses };
}
