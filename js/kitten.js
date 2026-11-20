// The kitten on the phone: a port of the Windows kitten's pictures and animation (app/art.py + main.py effects).
// Sprite units: the kitten stands at foot (90, 170) on a 180-wide canvas, like on the computer.
const CW = 180;
export const STRETCH_IN = 0.22, STRETCH_OUT = 0.3;
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const rad = (d) => (d * Math.PI) / 180;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${Math.max(0, Math.min(255, a)) / 255})`;
const FOLDER = { photo: "golden", photo_white: "white" };

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// ------------------------------------------------------------------------------------------- one picture
class Sprite {
  static cache = new Map();
  static get(base, key) {
    const k = `${base}/${key}`;
    if (!Sprite.cache.has(k)) Sprite.cache.set(k, Sprite.load(base, key));
    return Sprite.cache.get(k);
  }

  static async load(base, key) {
    const meta = await (await fetch(`${base}/${key}.json`)).json();
    const s = new Sprite();
    s.key = key.split("/").pop();
    s.img = await loadImage(`${base}/${key.split("/")[0]}/${meta.img}`);
    const [w, h] = meta.size;
    s.u = Math.min((meta.height_u || 182) / h, 240 / w);
    s.anim = meta.anim || "living";
    s.top = 170 - h * s.u; s.left = 90 - (w * s.u) / 2; s.wu = w * s.u; s.hu = h * s.u; s.cx = 90;
    s.pw = w; s.ph = h;
    const U = (x, y) => ({ x: s.left + x * s.u, y: s.top + y * s.u });
    s.eyes = (meta.eyes || []).map((e) => ({ ...U(e.x, e.y), rx: e.rx * s.u, ry: e.ry * s.u }));
    let head = meta.head ? U(...meta.head) : s.eyes.length
      ? { x: s.eyes.reduce((a, e) => a + e.x, 0) / s.eyes.length, y: s.eyes.reduce((a, e) => a + e.y, 0) / s.eyes.length }
      : { x: 90, y: s.top + 0.3 * s.hu };
    s.head = { x: head.x, y: head.y + 6 };
    s.band = meta.band || [0.24, 0.58];
    s.fx = {}; s.fxr = {};
    for (const [k, v] of Object.entries(meta.fx || {})) { s.fx[k] = U(v[0], v[1]); if (v.length > 2) s.fxr[k] = v[2] * s.u; }
    s.parts = [];
    const folder = key.split("/")[0];
    for (const pt of meta.parts || []) {
      if (pt.motion === "spokes") {
        s.parts.push({ name: pt.name, motion: "spokes", n: pt.n || 8, pivot: U(...pt.pivot), r0: pt.r0 * s.u, r1: pt.r1 * s.u,
                       width: pt.width * s.u, color: pt.color || [60, 60, 64], speed: pt.speed || 7, amp: 0 });
        continue;
      }
      const img = await loadImage(`${base}/${folder}/${pt.img}`);
      s.parts.push({
        name: pt.name, img, motion: pt.motion || "wag", amp: pt.amp ?? 6, speed: pt.speed ?? 2, phase: pt.phase || 0,
        shrink: pt.shrink || 0, land: !!pt.land, lift: { x: (pt.lift || [0, 0])[0] * s.u, y: (pt.lift || [0, 0])[1] * s.u },
        foot: pt.foot ? U(...pt.foot) : null, r: (pt.r || 0) * s.u, theta0: rad(pt.theta0 || 0),
        rect: { x: s.left + pt.x * s.u, y: s.top + pt.y * s.u, w: pt.size[0] * s.u, h: pt.size[1] * s.u },
        pivot: U(...pt.pivot),
      });
    }
    return s;
  }

  headWeight(frac) {
    if (this.anim === "breathe") return 0;
    return 1 - smooth(this.band[0], this.band[1], frac);
  }

  scaled(K) {                              // the picture resampled once to K pixels per sprite unit
    if (this._sK !== K) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(this.pw * this.u * K));
      c.height = Math.max(1, Math.round(this.ph * this.u * K));
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(this.img, 0, 0, c.width, c.height);
      this._s = c; this._sK = K;
    }
    return this._s;
  }
}

// ------------------------------------------------------------------------------------------- the kitten
export class Kitten {
  constructor(base) {
    this.base = base;                      // e.g. "assets/poses"
    this.coat = "photo";
    this.photo = null;                     // sitting picture
    this.posePhoto = null;                 // a picture for a status / walking / stretching
    this.poseKey = null;
    this.status = null;
    this.t = Math.random() * 10;
    this.facing = 1;
    this.action = "sit"; this.actionT = 0; this.actionLen = 1e9;
    this.walkPhase = 0;
    this.blinkLeft = 0; this.nextBlink = rnd(1.5, 4.5);
    this.hopP = -1; this.hopH = 14; this.hopQueue = 0;
    this.happyLeft = 0;
    this.micro = null; this.microPart = null; this.nextMicro = rnd(3, 6);
    this.look = { x: 0, y: 0 };
    this.warpNow = [0, 0, 0];
    this._warp = null; this._warpT = -1; this._warpK = 0;
    this.BLINK = 0.22;
  }

  get sprite() { return this.posePhoto || this.photo; }
  get sleeping() { return this.action === "sleep"; }

  async setCoat(coat) {
    if (!FOLDER[coat]) coat = "photo";
    if (coat === this.coat && this.photo) return;
    this.coat = coat;
    this.photo = await Sprite.get(this.base, `${FOLDER[coat]}/sit`);
    const k = this.poseKey; this.poseKey = "__";
    await this.setPose(k);
  }

  async setPose(key) {
    if (key === this.poseKey) return !!this.posePhoto;
    this.poseKey = key;
    let p = null;
    if (key) { try { p = await Sprite.get(this.base, `${FOLDER[this.coat]}/${key}`); } catch (e) { p = null; } }
    if (this.poseKey === key) { this.posePhoto = p; this._warpT = -1; }
    return !!p;
  }

  start(action, len = 1e9) { this.action = action; this.actionT = 0; this.actionLen = len; }

  hop(h = 14, times = 1) {
    if (this.sleeping) return;
    if (this.hopP < 0) { this.hopP = 0; this.hopH = h; this.hopQueue = times - 1; }
    else this.hopQueue = Math.max(this.hopQueue, times - 1);
  }

  hopDy() { const p = this.hopP; return p >= 0.15 && p < 0.85 ? -this.hopH * Math.sin((Math.PI * (p - 0.15)) / 0.7) : 0; }

  pickMicro() {
    const P = this.sprite;
    if (!P || !P.parts) { this.micro = null; return; }
    const opts = [];
    const tw = P.parts.filter((p) => p.motion === "twitch").map((p) => p.name);
    if (tw.length) opts.push("twitch", "twitch", "twitch");
    if (P.parts.some((p) => p.motion === "wag")) opts.push("swish", "swish");
    for (const [n, kind] of [["lens_l", "glint"], ["idea", "idea"], ["sweat", "sweat"], ["dream", "dream"], ["zzz", "sigh"],
                             ["page", "page"], ["nom", "nom"], ["crumbs", "nom"], ["game", "win"], ["drops", "splash"]]) {
      if (P.fx[n] && !opts.includes(kind)) opts.push(kind);
    }
    if (this.status === "sleep") opts.push("snuggle", "snuggle");
    else if (["study", "game", "eat", "bath"].includes(this.status)) opts.push("wiggle", "wiggle");
    if (!opts.length) return;
    const kind = pick(opts);
    this.micro = [kind, this.t];
    this.microPart = kind === "twitch" ? pick(tw) : null;
  }

  update(dt) {
    this.t += dt; this.actionT += dt;
    this.nextMicro -= dt;
    if (this.nextMicro <= 0) { this.pickMicro(); this.nextMicro = rnd(4, 9); }
    if (this.micro && this.t - this.micro[1] > 3) this.micro = null;
    if (this.hopP >= 0) {
      this.hopP += dt / 0.55;
      if (this.hopP >= 1) { if (this.hopQueue > 0) { this.hopQueue--; this.hopP = 0; } else this.hopP = -1; }
    }
    if (this.blinkLeft > 0) this.blinkLeft -= dt;
    else {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) { this.blinkLeft = this.BLINK; this.nextBlink = Math.random() < 0.18 ? 0.35 : rnd(2.5, 6); }
    }
    if (this.happyLeft > 0) this.happyLeft -= dt;
  }

  lidAmount() {
    if (this.sleeping) return 1;
    if (this.action === "stretch") { const u = this.actionT; return smooth(0.6, 0.9, u) * (1 - smooth(2.4, 2.7, u)); }
    if (this.blinkLeft > 0) {
      const e = this.BLINK - this.blinkLeft;
      if (e < 0.075) return smooth(0, 0.075, e);
      if (e < 0.105) return 1;
      return 1 - smooth(0.105, this.BLINK, e);
    }
    return 0;
  }

  // (dy, sx, sy, tilt degrees) + this.poseDx
  pose() {
    this.poseDx = 0;
    const t = this.t, b = Math.sin(t * 2.2);
    const ps = this.posePhoto ? this.poseKey : this.status;
    if (ps && this.posePhoto) {
      if (this.micro) {
        const [kind, t0] = this.micro, e = t - t0;
        if (kind === "wiggle" && e < 0.9) { const k = Math.sin(Math.PI * e / 0.9), w = Math.sin(e * 15) * k;
          return [-3 * k, 1 + 0.045 * w, 1 - 0.045 * w, 2 * w]; }
        if (kind === "snuggle" && e < 1.8) { const k = Math.sin(Math.PI * e / 1.8); return [1.5 * k, 1 + 0.03 * k, 1 - 0.035 * k, 0]; }
      }
      if (ps === "sleep") { const bb = Math.sin(t * 1.1); return [0, 1 + 0.012 * bb, 1 - 0.014 * bb, 0]; }
      if (ps === "work") return [0, 1, 1 + 0.004 * b, 0];
      if (ps === "run" || ps === "eat") return [0, 1, 1, 0];
      if (ps === "game") return [0, 1, 1 + 0.006 * b, 2.2 * Math.sin(t * 2.6)];
      if (ps === "walk") { const ph = this.walkPhase * 1.2;
        return [-1.6 * Math.abs(Math.sin(ph)), 1, 1 + 0.008 * Math.sin(2 * ph), 0.6 * Math.sin(ph)]; }
      if (ps === "stretch") {
        const u = this.actionT, L = this.actionLen;
        const keys = [[STRETCH_IN, 0.93, 1.06], [STRETCH_IN + 0.3, 1, 1], [1.4, 1.03, 0.985], [2.4, 1.03, 0.985], [L - STRETCH_OUT, 0.95, 1.04]];
        let sx = keys[4][1], sy = keys[4][2];
        for (let i = 0; i < keys.length - 1; i++) {
          const [t0, a0, a1] = keys[i], [t1, b0, b1] = keys[i + 1];
          if (u <= t1) { const kk = smooth(t0, t1, u); sx = a0 + (b0 - a0) * kk; sy = a1 + (b1 - a1) * kk; break; }
        }
        const wig = 0.8 * Math.sin(u * 8) * smooth(1.4, 1.6, u) * (1 - smooth(2.1, 2.3, u));
        const shake = 1.2 * Math.sin(u * 22) * smooth(2.55, 2.7, u) * (1 - smooth(2.75, 3.0, u));
        const P = this.posePhoto;
        this.poseDx = (P.left + 0.13 * P.wu - 90) * (1 - sx);
        return [0, sx, sy + 0.004 * b, wig + shake];
      }
      if (ps === "commute") return [-0.45 * Math.abs(Math.sin(t * 9)), 1, 1, 0];
      if (ps === "bath") return [1.5 * Math.sin(t * 1.4), 1, 1, 1.2 * Math.sin(t * 1.1)];
      return [0, 1 - 0.006 * b, 1 + 0.012 * b, 0];
    }
    if (this.action === "stretch") {        // crouch before the stretch picture comes in, spring back after
      const u = this.actionT, L = this.actionLen;
      if (u < STRETCH_IN) { const kk = smooth(0, STRETCH_IN, u); return [0, 1 + 0.05 * kk, 1 - 0.11 * kk, 0]; }
      const kk = Math.min(1, (u - (L - STRETCH_OUT)) / 0.3);
      return [0, 1 + 0.05 * (1 - kk), 1 - 0.11 * (1 - kk) + 0.035 * Math.sin(Math.PI * kk), 0];
    }
    const dy = this.hopDy();
    const sq = this.hopP >= 0 && (this.hopP < 0.15 || this.hopP >= 0.85) ? 0.06 : 0;
    return [dy, 1 + sq, 1 - sq + 0.004 * b, 0];
  }

  warpParams() {
    const t = this.t;
    const st = this.posePhoto ? this.poseKey : this.status;
    if (st && this.posePhoto) {
      if (this.posePhoto.anim === "breathe") return [0, 0, Math.sin(t * (st === "sleep" ? 1.1 : 2.2))];
      if (st === "work") return [0.5 * Math.sin(t * 1.3), 0.7 * Math.abs(Math.sin(t * 14)) - 0.35, Math.sin(t * 2.4)];
      if (st === "study") return [0.9 * Math.sin(t * 0.55), 0.7 * Math.sin(t * 0.45), Math.sin(t * 2)];
      if (st === "eat") { const bite = 0.5 + 0.5 * Math.sin(t * 6 + 0.8 * Math.sin(t * 0.9));
        return [0.35 * Math.sin(t * 1.2), -1.6 * Math.pow(bite, 1.5), Math.sin(t * 2.2)]; }
      return [Math.sin(t * 1.1), 0.6 * Math.sin(t * 0.8), Math.sin(t * 2.2)];
    }
    const lean = (Math.max(-1.8, Math.min(1.8, this.look.x * this.facing)) / 1.8) * 2.6;
    let sway = 1.7 * Math.sin(t * 1.3) + Math.sin(t * 0.53 + 1.1) + lean;
    if (this.happyLeft > 0) sway += 2.2 * Math.sin(t * 5.2);
    const nod = 1.1 * Math.sin(t * 0.9 + 0.5) + Math.max(-1.8, Math.min(1.8, this.look.y)) * 0.5;
    return [sway, nod, Math.sin(t * 2.2)];
  }

  warpShift(p) {
    const P = this.sprite;
    if (!P) return { x: 0, y: 0 };
    const [sway, nod] = this.warpNow;
    const w = P.headWeight((p.y - P.top) / Math.max(1, P.hu));
    return { x: sway * Math.pow(w, 1.3), y: -nod * w };
  }

  // the warped picture (head sways / nods on the neck, chest breathes), cached ~30 times a second
  frame(K) {
    const P = this.sprite;
    const L = Math.min(0, P.left - 8), T = Math.min(0, P.top - 8), R = Math.max(CW, P.left + P.wu + 8);
    const w = Math.ceil((R - L) * K), h = Math.ceil((CW - T) * K);
    if (!this._warp || this._warp.width !== w || this._warp.height !== h || this._warpK !== K) {
      this._warp = document.createElement("canvas"); this._warp.width = w; this._warp.height = h;
      this._warpK = K; this._warpT = -1;
    }
    this.warpOff = { x: L, y: T };
    if (Math.abs(this.t - this._warpT) < 1 / 30 && this._warpP === P) return this._warp;
    this._warpT = this.t; this._warpP = P;
    const [sway, nod, br] = (this.warpNow = this.warpParams());
    const src = P.scaled(K);
    const g = this._warp.getContext("2d");
    g.clearRect(0, 0, w, h);
    if (P.anim === "breathe") {               // whole picture, chest gently breathing
      const sxw = 1 + 0.008 * br;
      g.drawImage(src, (P.cx + (P.left - P.cx) * sxw - L) * K, (P.top - T) * K, src.width * sxw, src.height);
      return this._warp;
    }
    const band = 3, sw = src.width, sh = src.height;
    for (let Y = Math.floor((P.top - T) * K) - 4; Y < Math.floor((170 - T) * K) + 2; Y += band) {
      const yu = (Y + band / 2) / K + T;
      const wgt = P.headWeight((yu - P.top) / P.hu);
      const r = (yu - P.top + nod * wgt) * K;
      if (r < -band || r > sh + band) continue;
      const chest = Math.exp(-Math.pow((r / sh - 0.58) / 0.16, 2));
      const sxw = 1 + 0.02 * br * chest;
      const dx = sway * Math.pow(wgt, 1.3);
      const x0 = (P.cx + (P.left - P.cx) * sxw + dx - L) * K;
      const sy0 = Math.max(0, r - band / 2), sy1 = Math.min(sh, r + band / 2);
      if (sy1 <= sy0) continue;
      g.drawImage(src, 0, sy0, sw, sy1 - sy0, x0, Y + (sy0 - (r - band / 2)), sw * sxw, sy1 - sy0);
    }
    return this._warp;
  }
}

// ------------------------------------------------------------------------------------------- drawing
function flick(e) {
  if (e < 0.18) return Math.sin((Math.PI * e) / 0.18);
  if (e > 0.24 && e < 0.42) return 0.7 * Math.sin((Math.PI * (e - 0.24)) / 0.18);
  return 0;
}

function drawParts(g, k) {
  const P = k.sprite;
  if (!P || !P.parts) return;
  const micro = k.micro ? k.micro[0] : null, e = k.micro ? k.t - k.micro[1] : 0;
  if (P.fx.belt_l && P.fx.belt_r) {                 // treadmill belt rolling back under the paws
    const a = P.fx.belt_l, b = P.fx.belt_r, span = b.x - a.x, step = 26;
    g.save(); g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1.6;
    for (let x = a.x + ((k.t * 70) % step); x < b.x - 10; x += step) {
      const y = a.y + ((b.y - a.y) * (x - a.x)) / (span || 1);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 9, y); g.stroke();
    }
    g.restore();
  }
  for (const pt of P.parts) {
    const amp = pt.amp, t = k.t;
    if (pt.motion === "spokes") {
      g.save(); g.strokeStyle = `rgb(${pt.color.join(",")})`; g.lineWidth = pt.width; g.lineCap = "round";
      for (let i = 0; i < pt.n; i++) {
        const a = t * pt.speed + (i * 2 * Math.PI) / pt.n, c = Math.cos(a), s = Math.sin(a);
        g.beginPath(); g.moveTo(pt.pivot.x + c * pt.r0, pt.pivot.y + s * pt.r0);
        g.lineTo(pt.pivot.x + c * pt.r1, pt.pivot.y + s * pt.r1); g.stroke();
      }
      g.restore(); continue;
    }
    if (pt.motion === "static") { g.drawImage(pt.img, pt.rect.x, pt.rect.y, pt.rect.w, pt.rect.h); continue; }
    if (pt.motion === "pedal") {
      const th = pt.theta0 + t * pt.speed, f0 = pt.foot;
      const ft = { x: f0.x + pt.r * (Math.cos(th) - Math.cos(pt.theta0)), y: f0.y + pt.r * (Math.sin(th) - Math.sin(pt.theta0)) };
      const hip = pt.pivot, v0 = { x: f0.x - hip.x, y: f0.y - hip.y }, v1 = { x: ft.x - hip.x, y: ft.y - hip.y };
      const l0 = Math.hypot(v0.x, v0.y), l1 = Math.hypot(v1.x, v1.y);
      g.save(); g.translate(hip.x, hip.y); g.rotate(Math.atan2(v1.y, v1.x)); g.scale(l1 / Math.max(1e-6, l0), 1);
      g.rotate(-Math.atan2(v0.y, v0.x)); g.translate(-hip.x, -hip.y);
      g.drawImage(pt.img, pt.rect.x, pt.rect.y, pt.rect.w, pt.rect.h); g.restore(); continue;
    }
    let ang = 0, lift = null, squash = 0;
    if (pt.motion === "wag") {
      ang = amp * Math.sin(t * pt.speed);
      if (micro === "swish" && e < 1.6) ang += 1.6 * amp * Math.sin(e * 9) * (1 - e / 1.6);
    } else if (pt.motion === "tap") {
      const ph = t * pt.speed + pt.phase + 0.7 * Math.sin(t * 2.3), raw = 0.5 - 0.5 * Math.cos(ph);
      const v = pt.land ? Math.min(1, 1.25 * Math.pow(raw, 0.7))
        : Math.pow(raw, 0.8) * (0.75 + 0.25 * Math.sin(t * 3.1 + pt.phase * 2));
      ang = amp * v; lift = { x: pt.lift.x * v, y: pt.lift.y * v };
    } else if (pt.motion === "step") {
      const ph = t * pt.speed + pt.phase; ang = amp * Math.sin(ph); squash = pt.shrink * Math.max(0, Math.cos(ph));
    } else if (pt.motion === "walk") {
      const ph = k.walkPhase * pt.speed + pt.phase; ang = amp * Math.sin(ph); squash = pt.shrink * Math.max(0, -Math.cos(ph));
    } else {
      ang = micro === "twitch" && k.microPart === pt.name ? amp * flick(e) : 0;
    }
    const sh = k.warpShift(pt.pivot), pv = { x: pt.pivot.x + sh.x, y: pt.pivot.y + sh.y };
    g.save();
    if (lift) g.translate(lift.x, lift.y);
    g.translate(pv.x, pv.y); g.rotate(rad(ang)); if (squash) g.scale(1, 1 - squash); g.translate(-pv.x, -pv.y);
    g.drawImage(pt.img, pt.rect.x + sh.x, pt.rect.y + sh.y, pt.rect.w, pt.rect.h);
    g.restore();
  }
}

const lidCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

function drawLids(g, k, K) {
  const p = k.lidAmount(), P = k.sprite;
  if (p <= 0.02 || !P || !P.eyes.length) return;
  const [sway, nod] = k.warpNow;
  for (const eye of P.eyes) {
    const w = P.headWeight((eye.y - P.top) / P.hu);
    const ex = eye.x + sway * Math.pow(w, 1.3), ey = eye.y - nod * w;
    const ax = eye.rx * 1.45, ay = eye.ry * 1.62;
    const yClose = ey + eye.ry * 0.4;
    const yUp = ey - ay + p * (yClose - (ey - ay)), yLo = ey + ay - p * (ey + ay - yClose);
    const L = { x: ex - ax - 2, y: ey - ay - 2, w: 2 * ax + 4, h: 2 * ay + 4 };
    const c = lidCanvas; c.width = Math.max(2, Math.ceil(L.w * K)); c.height = Math.max(2, Math.ceil(L.h * K));
    const q = c.getContext("2d");
    q.setTransform(K, 0, 0, K, -L.x * K, -L.y * K);
    const src = (x, y, ww, hh) => [(x - P.left) / P.u, (y - P.top) / P.u, ww / P.u, hh / P.u];
    const hu = 2.2 * eye.ry, hl = 1.1 * eye.ry;
    q.drawImage(P.img, ...src(eye.x - ax, eye.y - ay - hu, 2 * ax, hu), ex - ax, yUp - hu, 2 * ax, hu);       // fur above slides down
    q.drawImage(P.img, ...src(eye.x - ax, eye.y + ay, 2 * ax, hl), ex - ax, yLo, 2 * ax, hl);                // a little from below
    const a = Math.min(1, Math.max(0, (p - 0.25) / 0.5));
    if (a > 0) {
      const dy = yUp - ey, hw = ax * Math.sqrt(Math.max(0, 1 - Math.pow(dy / ay, 2))) * 0.96, sag = eye.ry * (0.2 + 0.4 * p);
      q.lineCap = "round";
      for (const [col, lw] of [[`rgba(40,28,22,${0.27 * a})`, Math.max(0.8, eye.ry * 0.32)], [`rgba(45,30,24,${0.84 * a})`, Math.max(0.5, eye.ry * 0.11)]]) {
        q.strokeStyle = col; q.lineWidth = lw; q.beginPath();
        q.moveTo(ex - hw, yUp - sag * 0.35); q.quadraticCurveTo(ex, yUp + sag, ex + hw, yUp - sag * 0.35); q.stroke();
      }
    }
    q.globalCompositeOperation = "destination-in";                                // soft oval: only the eye area
    q.translate(ex, ey); q.scale(1, ay / ax);
    const gr = q.createRadialGradient(0, 0, 0, 0, 0, ax);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.68, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    q.fillStyle = gr; q.fillRect(-3 * ax, -3 * ax, 6 * ax, 6 * ax);
    q.globalCompositeOperation = "source-over";
    g.drawImage(c, L.x, L.y, L.w, L.h);
  }
}

function sparkle(g, x, y, r, col) {
  g.beginPath(); g.moveTo(x, y - r);
  for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r]]) g.quadraticCurveTo(x, y, x + dx, y + dy);
  g.fillStyle = col; g.fill();
}

// draws kitten k standing at foot (css px), s = css px per sprite unit, dpr = device pixel ratio
export function paintKitten(g, k, foot, s, dpr) {
  const P = k.sprite;
  if (!P) return;
  const [dy, sx, sy, tilt] = k.pose();
  // ground shadow
  const sk = dy < 0 ? Math.max(0.45, 1 + dy / 40) : 1;
  const sg = g.createRadialGradient(foot.x, foot.y + s, 0, foot.x, foot.y + s, 48 * s);
  sg.addColorStop(0, `rgba(0,0,0,${0.22 * sk})`); sg.addColorStop(1, "rgba(0,0,0,0)");
  g.save(); g.fillStyle = sg; g.beginPath(); g.ellipse(foot.x, foot.y + s, 46 * s * sk, 8 * s * sk, 0, 0, 2 * Math.PI); g.fill(); g.restore();
  const K = s * dpr;
  g.save();
  g.translate(foot.x + (k.poseDx || 0) * s * k.facing, foot.y + dy * s);
  g.rotate(rad(tilt));
  g.scale(sx * k.facing, sy);
  g.translate(-90 * s, -170 * s);
  const img = k.frame(K);
  g.drawImage(img, k.warpOff.x * s, k.warpOff.y * s, img.width / dpr, img.height / dpr);
  g.scale(s, s);
  drawParts(g, k);
  drawLids(g, k, K);
  g.restore();
}

// sprite point -> css px (follows the head sway if asked)
export function posePoint(k, foot, s, p, follow = true) {
  if (follow) { const sh = k.warpShift(p); p = { x: p.x + sh.x, y: p.y + sh.y }; }
  const dy = k.pose()[0];
  return { x: foot.x + (p.x - 90) * s * k.facing, y: foot.y + (p.y - 170 + dy) * s };
}

// the little live effects on top of a picture (port of PetWindow._paint_pose_fx)
export function paintFx(g, k, foot, s, words = {}) {
  const P = k.posePhoto;
  if (!P) return;
  const fx = P.fx, t = k.t;
  const micro = k.micro ? k.micro[0] : null, e = k.micro ? k.t - k.micro[1] : 0;
  const pt = (key, follow = true) => posePoint(k, foot, s, fx[key], follow);
  g.save();
  g.lineCap = "round";
  const line = (x0, y0, x1, y1, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  if (fx.belt_l && fx.belt_r && fx.speed) {
    const c = pt("speed", false);
    for (let i = 0; i < 3; i++) { const ph = (t * 2.5 + i / 3) % 1, y = c.y + (i - 1) * 16 * s, x0 = c.x + ph * 30 * s;
      line(x0, y, x0 + 22 * s, y, `rgba(255,255,255,${0.78 * (1 - ph)})`, 2.2 * s); }
  }
  if (fx.road_l && fx.road_r) {
    const a = pt("road_l", false), b = pt("road_r", false);
    const wheel = P.parts.find((p) => p.motion === "spokes"), tire = P.fxr.road_l || 40;
    const speed = (wheel ? wheel.speed : 7) * tire * s, span = b.x - a.x, step = 30 * s, off = (t * speed) % step, d = span > 0 ? 1 : -1;
    for (let x = d > 0 ? a.x + step - off : a.x - step + off; d > 0 ? x < b.x : x > b.x; x += d * step) {
      const y = a.y + ((b.y - a.y) * (x - a.x)) / (span || 1);
      const edge = Math.min(Math.abs(x - a.x), Math.abs(b.x - x)) / (40 * s);
      line(x, y, x + d * 12 * s, y, `rgba(255,255,255,${0.47 * Math.min(1, edge)})`, 2 * s);
    }
    if (fx.wind) { const c = pt("wind", false);
      for (let i = 0; i < 4; i++) { const ph = (t * 1.8 + i * 0.27) % 1, y = c.y + (i - 1.5) * 15 * s, x0 = c.x - d * ph * 46 * s;
        line(x0, y, x0 - d * 20 * s, y, `rgba(255,255,255,${0.75 * Math.sin(Math.PI * ph)})`, 2 * s); } }
  }
  if (fx.crumbs) {
    const c = pt("crumbs", false);
    for (let i = 0; i < 4; i++) { const ph = (t * 1.6 + i * 0.27) % 1, side = i % 2 ? -1 : 1;
      g.fillStyle = rgba(196, 139, 85, 240 * (1 - ph * 0.6)); g.beginPath();
      g.ellipse(c.x + side * (14 + 24 * ph) * s + (i - 1.5) * 3 * s, c.y - Math.sin(Math.PI * ph) * 9 * s + ph * 6 * s, 2.6 * s, 2.2 * s, 0, 0, 2 * Math.PI); g.fill(); }
    if (micro === "nom" && e < 1.4) { const kk = Math.min(1, e / 0.15) * Math.min(1, (1.4 - e) / 0.3);
      for (let i = 0; i < 6; i++) { const ph = Math.min(1, e / 0.9 + i * 0.04), side = i % 2 ? -1 : 1;
        g.fillStyle = rgba(196, 139, 85, 240 * kk * (1 - ph * 0.5)); g.beginPath();
        g.ellipse(c.x + side * (18 + 30 * ph + i * 2) * s, c.y - Math.sin(Math.PI * ph) * (12 + i) * s + ph * 8 * s, 2.4 * s, 2 * s, 0, 0, 2 * Math.PI); g.fill(); } }
  }
  if (fx.glow) {
    const c = pt("glow"), pulse = 0.6 + 0.4 * Math.sin(t * 5);
    const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, 70 * s);
    gr.addColorStop(0, `rgba(150,190,255,${0.24 * pulse})`); gr.addColorStop(1, "rgba(150,190,255,0)");
    g.fillStyle = gr; g.beginPath(); g.ellipse(c.x, c.y, 70 * s, 50 * s, 0, 0, 2 * Math.PI); g.fill();
  }
  if (fx.game) {
    const c = pt("game");
    [[-10, "star"], [26, "gem"], [8, "star"]].forEach(([dx, kind], i) => {
      const ph = (t * 0.7 + i * 0.33) % 1, a = Math.sin(Math.PI * ph), x = c.x + dx * s, y = c.y - 20 * s - ph * 40 * s;
      if (kind === "star") sparkle(g, x, y, 6 * s, `rgba(255,210,90,${a})`);
      else { const r = 4 * s; g.fillStyle = `rgba(120,200,255,${a})`; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.8, y);
        g.lineTo(x, y + r); g.lineTo(x - r * 0.8, y); g.closePath(); g.fill(); }
    });
    if (micro === "win" && e < 1.4) {
      const kk = Math.min(1, e / 0.15) * Math.min(1, (1.4 - e) / 0.35);
      const cols = [[255, 210, 90], [255, 140, 170], [130, 205, 255], [170, 230, 140]];
      for (let i = 0; i < 10; i++) {
        const a2 = rad(-95 + i * 12 + 5 * Math.sin(i * 3.1)), d2 = (8 + 46 * Math.pow(Math.min(1, e / 0.6), 0.7)) * s;
        const x = c.x + Math.cos(a2) * d2, y = c.y - 14 * s + Math.sin(a2) * d2 * 0.8 + 30 * s * Math.pow(Math.max(0, e - 0.5), 2);
        const col = `rgba(${cols[i % 4].join(",")},${0.94 * kk})`;
        if (i % 2) sparkle(g, x, y, 5 * s, col); else { g.fillStyle = col; g.fillRect(x - 2.2 * s, y - 1.4 * s, 4.4 * s, 2.8 * s); }
      }
    }
  }
  if (fx.water) {
    const c = pt("water", false), half = (P.fxr.water || 60) * s;
    let seed = 11; const r01 = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 9; i++) {
      const ph = (t * 0.32 + r01()) % 1, x = c.x + (r01() * 2 - 1) * half + 5 * s * Math.sin(t * 1.5 + i), y = c.y - ph * 70 * s;
      const r = (3 + r01() * 4) * s * (0.8 + 0.4 * ph);
      const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x - r * 0.35, y - r * 0.35, r * 1.3);
      gr.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - ph)})`); gr.addColorStop(0.75, `rgba(210,235,255,${0.47 * (1 - ph)})`);
      gr.addColorStop(1, `rgba(180,215,255,${0.35 * (1 - ph)})`);
      g.fillStyle = gr; g.strokeStyle = `rgba(255,255,255,${0.63 * (1 - ph)})`; g.lineWidth = 0.8 * s;
      g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill(); g.stroke();
    }
  }
  if (fx.ripple) {
    const c = pt("ripple", false);
    for (let i = 0; i < 3; i++) { const ph = (t * 0.45 + i / 3) % 1;
      g.strokeStyle = `rgba(255,255,255,${0.59 * (1 - ph)})`; g.lineWidth = 1.4 * s; g.beginPath();
      g.ellipse(c.x, c.y, (14 + 40 * ph) * s, (4 + 11 * ph) * s, 0, 0, 2 * Math.PI); g.stroke(); }
  }
  if (micro === "splash" && e < 0.9 && fx.drops) {
    const c = pt("drops", false);
    for (let i = 0; i < 7; i++) { const a2 = rad(-160 + i * 23), d2 = (10 + 36 * e) * s;
      g.fillStyle = `rgba(170,215,255,${0.9 * (1 - e / 0.9)})`; g.beginPath();
      g.ellipse(c.x + Math.cos(a2) * d2, c.y + Math.sin(a2) * d2 + 60 * s * e * e, 3 * s, 3.6 * s, 0, 0, 2 * Math.PI); g.fill(); }
  }
  if (micro === "glint" && e < 0.8) {
    for (const key of ["lens_l", "lens_r"]) {
      if (!fx[key]) continue;
      const c = pt(key), r = (P.fxr[key] || 10) * s;
      g.save(); g.beginPath(); g.arc(c.x, c.y, r, 0, 2 * Math.PI); g.clip();
      g.translate(c.x - 1.6 * r + 3.2 * r * (e / 0.8), c.y); g.rotate(rad(30));
      g.fillStyle = "rgba(255,255,255,0.67)"; g.fillRect(-r * 0.22, -2 * r, r * 0.44, 4 * r); g.restore();
    }
  }
  if (micro === "idea" && e < 1.8 && fx.idea) {
    const c = pt("idea"), kk = Math.min(1, e / 0.25) * (e < 1.4 ? 1 : Math.max(0, 1 - (e - 1.4) / 0.4)), r = 9 * s * (0.6 + 0.4 * kk);
    const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 2.6);
    gr.addColorStop(0, `rgba(255,236,120,${0.59 * kk})`); gr.addColorStop(1, "rgba(255,236,120,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, r * 2.6, 0, 2 * Math.PI); g.fill();
    g.fillStyle = `rgba(255,214,64,${kk})`; g.beginPath(); g.arc(c.x, c.y, r, 0, 2 * Math.PI); g.fill();
    g.fillStyle = `rgba(150,150,160,${kk})`; g.fillRect(c.x - r * 0.45, c.y + r * 0.8, r * 0.9, r * 0.6);
    for (let i = 0; i < 6; i++) { const a = rad(-150 + i * 24);
      line(c.x + Math.cos(a) * r * 1.5, c.y + Math.sin(a) * r * 1.5, c.x + Math.cos(a) * r * 2.1, c.y + Math.sin(a) * r * 2.1, `rgba(255,214,64,${0.9 * kk})`, 1.6 * s); }
  }
  if (micro === "sweat" && e < 1.4 && fx.sweat) {
    const c = pt("sweat"), y = c.y + e * 16 * s;
    g.fillStyle = `rgba(140,200,255,${0.9 * (1 - e / 1.4)})`; g.beginPath(); g.moveTo(c.x, y - 8 * s);
    g.quadraticCurveTo(c.x + 6 * s, y + 2 * s, c.x, y + 5 * s); g.quadraticCurveTo(c.x - 6 * s, y + 2 * s, c.x, y - 8 * s); g.fill();
  }
  if (micro === "dream" && e < 3 && fx.dream) {
    const c = pt("dream", false), kk = Math.min(1, e / 0.5) * Math.min(1, (3 - e) / 0.5);
    g.fillStyle = `rgba(255,255,255,${0.86 * kk})`;
    for (const [dx, dy, r] of [[22, 18, 3], [12, 8, 5]]) { g.beginPath(); g.arc(c.x + dx * s, c.y + dy * s, r * s, 0, 2 * Math.PI); g.fill(); }
    const bx = c.x - 6 * s, by = c.y - 14 * s - 3 * s * Math.sin(t * 2);
    g.beginPath(); g.ellipse(bx, by, 20 * s, 15 * s, 0, 0, 2 * Math.PI); g.fill();
    g.fillStyle = `rgba(110,170,255,${kk})`; g.beginPath(); g.moveTo(bx - 9 * s, by);
    g.quadraticCurveTo(bx - 2 * s, by - 7 * s, bx + 6 * s, by); g.quadraticCurveTo(bx - 2 * s, by + 7 * s, bx - 9 * s, by);
    g.moveTo(bx + 5 * s, by); g.lineTo(bx + 11 * s, by - 5 * s); g.lineTo(bx + 11 * s, by + 5 * s); g.closePath(); g.fill();
  }
  if (micro === "sigh" && e < 1.6 && fx.zzz) {
    const c = pt("zzz", false);
    g.fillStyle = `rgba(255,255,255,${0.86 * (1 - e / 1.6)})`; g.font = `600 ${10 * s}px -apple-system, sans-serif`;
    g.fillText(words.sigh || "呼~", c.x + 10 * s, c.y - 30 * s - e * 14 * s);
  }
  if (micro === "page" && e < 0.9 && fx.page) {
    const c = pt("page", false), a = 1 - e / 0.9;
    g.strokeStyle = `rgba(255,255,255,${0.86 * a})`; g.lineWidth = 2 * s; g.beginPath();
    g.ellipse(c.x, c.y - 9 * s, 18 * s, 15 * s, 0, -rad(30), -rad(30 + 120 * Math.min(1, e / 0.4)), true); g.stroke();
    sparkle(g, c.x + 14 * s, c.y - 26 * s, 5 * s, `rgba(255,236,160,${0.9 * a})`);
  }
  if (fx.keys) {
    const c = pt("keys");
    for (let i = 0; i < 5; i++) { const ph = (t * 3.4 + i * 0.2) % 1;
      const x = c.x + (i - 2) * 9 * s + 5 * s * Math.sin(i * 7 + Math.floor(t * 3.4)), y = c.y - 8 * s - ph * 26 * s;
      g.fillStyle = `rgba(255,255,255,${0.92 * (1 - ph)})`; g.fillRect(x - 3 * s, y - 2.5 * s, 6 * s, 5 * s); }
    for (let i = 0; i < 2; i++) { const ph = (t * 6 + i * 0.5) % 1;
      line(c.x - 26 * s, c.y - (14 + 10 * ph) * s, c.x - 32 * s, c.y - (20 + 10 * ph) * s, `rgba(255,255,255,${0.78 * (1 - ph)})`, 1.6 * s); }
  }
  if (fx.steam) {
    const c = pt("steam");
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.45 + i * 0.5) % 1, env = Math.sin(Math.PI * ph);
      g.strokeStyle = `rgba(255,255,255,${0.59 * env})`; g.lineWidth = 1.6 * s; g.beginPath();
      for (let j = 0; j < 9; j++) { const yy = j / 8;
        const x = c.x + (i * 7 - 3.5) * s + 3.2 * s * yy * Math.sin(yy * 5 + t * 2.6 + i * 2), y = c.y - 4 * s - (ph * 6 + yy * 14) * s;
        if (j === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
  }
  g.restore();
}

export function paintZzz(g, k, origin, s, f = 1) {
  g.save();
  for (let i = 0; i < 3; i++) {
    const ph = (k.t * 0.35 + i / 3) % 1, x = origin.x + f * (34 + 26 * ph) * s, y = origin.y - (40 + 46 * ph) * s;
    g.font = `700 ${(9 + 7 * ph) * s}px -apple-system, sans-serif`;
    g.fillStyle = `rgba(0,0,0,${0.35 * Math.sin(Math.PI * ph)})`; g.fillText("z", x + 1, y + 1);
    g.fillStyle = `rgba(255,255,255,${0.9 * Math.sin(Math.PI * ph)})`; g.fillText("z", x, y);
  }
  g.restore();
}

export { sparkle };
