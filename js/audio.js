// Voice messages in the same format as the computer: 16 kHz mono, G.711 μ-law (app/audio.py).
export const RATE = 16000;
export const MAX_SECONDS = 60;

let ctx = null;
export function audioContext() {
  if (!ctx) ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// --- μ-law, exactly like Python's audioop.lin2ulaw (CPython's 14-bit st_14linear2ulaw) and ulaw2lin
const BIAS = 0x84;
const SEG_UEND = [0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff];
export function ulawEncode(int16) {
  const out = new Uint8Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    let v = int16[i] >> 2, mask;
    if (v < 0) { v = -v; mask = 0x7f; } else mask = 0xff;
    if (v > 8159) v = 8159;
    v += BIAS >> 2;
    let seg = 0;
    while (seg < 8 && v > SEG_UEND[seg]) seg++;
    out[i] = seg >= 8 ? (0x7f ^ mask) : (((seg << 4) | ((v >> (seg + 1)) & 0x0f)) ^ mask);
  }
  return out;
}

export function ulawDecode(bytes) {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const u = ~bytes[i] & 0xff;
    const sign = u & 0x80, exp = (u >> 4) & 0x07, man = u & 0x0f;
    let s = (((man << 3) + BIAS) << exp) - BIAS;
    out[i] = (sign ? -s : s) / 32768;
  }
  return out;
}

// --- recording
export class Recorder {
  constructor() { this.active = false; this.level = 0; }
  get seconds() { return this.active ? (performance.now() - this.t0) / 1000 : 0; }

  async start() {
    const ac = audioContext();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.src = ac.createMediaStreamSource(this.stream);
    this.node = ac.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.rate = ac.sampleRate;
    this.node.onaudioprocess = (ev) => {
      const d = ev.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(d));
      let m = 0; for (let i = 0; i < d.length; i += 16) m = Math.max(m, Math.abs(d[i]));
      this.level = m;
    };
    this.src.connect(this.node);
    this.node.connect(ac.destination);       // Safari only runs the processor when it's connected
    this.t0 = performance.now();
    this.active = true;
  }

  stop() {
    if (!this.active) return null;
    this.active = false;
    const secs = (performance.now() - this.t0) / 1000;
    try { this.node.disconnect(); this.src.disconnect(); } catch (e) { /* already gone */ }
    this.stream.getTracks().forEach((t) => t.stop());
    const n = this.chunks.reduce((a, c) => a + c.length, 0);
    const all = new Float32Array(n);
    let o = 0; for (const c of this.chunks) { all.set(c, o); o += c.length; }
    // resample to 16 kHz (average the source samples that fall into each output sample)
    const ratio = this.rate / RATE, m = Math.floor(n / ratio), pcm = new Int16Array(m);
    for (let i = 0; i < m; i++) {
      const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio));
      let sum = 0; for (let j = a; j < b && j < n; j++) sum += all[j];
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round((sum / (b - a)) * 32767)));
    }
    return { data: ulawEncode(pcm), secs };
  }

  cancel() { if (this.active) this.stop(); }
}

// --- playback
let current = null;
export function playUlaw(bytes, rate = RATE, onEnd = null) {
  stopPlaying();
  const ac = audioContext();
  const pcm = ulawDecode(bytes);
  const buf = ac.createBuffer(1, pcm.length, rate);
  buf.getChannelData(0).set(pcm);
  const node = ac.createBufferSource();
  node.buffer = buf;
  node.connect(ac.destination);
  node.onended = () => { if (current === node) current = null; onEnd && onEnd(); };
  node.start();
  current = node;
  return pcm.length / rate;
}

export function stopPlaying() {
  if (current) { try { current.stop(); } catch (e) { /* done */ } current = null; }
}

// little sounds, made on the fly (no files)
export function chime(kind = "chime") {
  const ac = audioContext();
  const notes = { chime: [880, 1320], note: [660, 990], sent: [1200], ring: [740, 988, 740, 988] }[kind] || [880];
  let t = ac.currentTime + 0.01;
  for (const f of notes) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.4);
    t += kind === "ring" ? 0.22 : 0.12;
  }
}
