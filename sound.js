/**
 * Sound effects for the checkers game.
 * Uses Web Audio API to synthesize sounds (no audio files needed).
 */

let audioCtx = null;
let master = null;
let enabled = true;
let volume = 0.7;
try { const v = parseFloat(localStorage.getItem('sambrk.vol')); if (!isNaN(v) && v >= 0 && v <= 1) volume = v; } catch (e) {}

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        master = audioCtx.createGain();
        master.gain.value = volume;
        master.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
    return audioCtx;
}
const out = () => { getAudioContext(); return master; };

export function isSoundEnabled() { return enabled; }
export function setSoundEnabled(on) { enabled = on; }
export function getVolume() { return volume; }
export function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('sambrk.vol', String(volume)); } catch (e) {}
    if (master) master.gain.value = volume;
}

/** Une note : fréquence, début (s), durée (s), type d'onde, volume */
function tone(freq, at, dur, type = 'sine', gain = 0.25, slideTo = null) {
    const ctx = getAudioContext(), t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out());
    o.start(t0); o.stop(t0 + dur + 0.02);
}

/** Un « toc » de bois : corps grave + claquement de bruit filtré */
function thud(at, low, noiseFreq, body = 0.3, click = 0.15, dur = 0.08) {
    const ctx = getAudioContext(), t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator(), og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(low, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, low * 0.4), t0 + dur);
    og.gain.setValueAtTime(body, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(og); og.connect(out());
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = noiseFreq; f.Q.value = 1.5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(click, t0);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 0.6);
    src.connect(f); f.connect(ng); ng.connect(out());
    osc.start(t0); osc.stop(t0 + dur);
    src.start(t0); src.stop(t0 + dur);
}

/** Pion posé sur le damier */
export function playMoveSound() {
    if (!enabled) return;
    thud(0, 150, 200);
}

/** Prise : deux coups secs, plus forts */
export function playCaptureSound() {
    if (!enabled) return;
    thud(0, 190, 320, 0.38, 0.26, 0.09);
    thud(0.085, 120, 240, 0.32, 0.2, 0.1);
}

/** Promotion en dame : petite cloche montante */
export function playKingSound() {
    if (!enabled) return;
    tone(659, 0, 0.22, 'sine', 0.22);
    tone(988, 0.09, 0.3, 'sine', 0.22);
    tone(1976, 0.09, 0.18, 'sine', 0.05);
}

/** Début de partie : deux notes douces */
export function playStartSound() {
    if (!enabled) return;
    tone(440, 0, 0.16, 'triangle', 0.2);
    tone(587, 0.12, 0.26, 'triangle', 0.2);
}

/** Fin de partie : 'win' (fanfare), 'loss' (notes descendantes) ou 'draw' */
export function playGameOverSound(kind) {
    if (!enabled) return;
    if (kind === 'win') {
        [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.13, 0.3, 'triangle', 0.22));
        tone(1046, 0.52, 0.5, 'sine', 0.12);
    } else if (kind === 'loss') {
        [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.2, 0.36, 'triangle', 0.22));
    } else {
        tone(523, 0, 0.3, 'triangle', 0.2);
        tone(523, 0.28, 0.45, 'triangle', 0.2);
    }
}

/** Coup refusé / erreur */
export function playErrorSound() {
    if (!enabled) return;
    tone(150, 0, 0.14, 'square', 0.1, 90);
}
