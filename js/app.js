// 情侣小猫 · phone app. Talks to the computer kitten and to TA with the same encrypted protocol.
import { Kitten, paintKitten, paintFx, paintZzz, posePoint, STRETCH_IN, STRETCH_OUT } from "./kitten.js";
import { Link } from "./link.js";
import { webCallUrl, randomId, parseCode } from "./proto.js";
import { tr, setLang, lang } from "./i18n.js";
import * as A from "./audio.js";

const $ = (id) => document.getElementById(id);
const now = () => Date.now() / 1000;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem("ck." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("ck." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem("ck." + k); } catch (e) { /* ignore */ } },
};
const params = new URLSearchParams(location.search);
const BROKER = params.get("broker");                    // only for tests: ?broker=ws://127.0.0.1:18831
const FOREVER = 3650 * 86400;
const STATUS = { work: "上班中", study: "学习中", game: "打游戏中", eat: "吃饭中", run: "运动中", commute: "在路上", sleep: "睡觉中", bath: "洗澡中" };
const SHORT = { work: "上班", study: "学习", game: "打游戏", eat: "吃饭", run: "运动", commute: "在路上", sleep: "睡觉", bath: "洗澡" };
const PICK = ["work", "study", "game", "eat", "run", "commute", "sleep", "bath"];
const POKE_WORDS = ["想你啦~", "在干嘛呀？", "抱抱！", "今天也要开心哦", "看看我嘛~"];
const TAP_WORDS = ["喵~", "蹭蹭你", "呼噜呼噜~", "摸摸头~"];
const COAT = (c) => (c === "photo_white" || c === "white" || c === "silver" ? "photo_white" : "photo");
const FOLDER = { photo: "golden", photo_white: "white" };
const URL_RE = /^https?:\/\/\S+$/;

const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 20.6c-.3 0-7.9-4.6-9.6-9.4C1.2 7.8 3.4 4.6 6.8 4.6c2.2 0 3.8 1.2 5.2 3 1.4-1.8 3-3 5.2-3 3.4 0 5.6 3.2 4.4 6.6-1.7 4.8-9.3 9.4-9.6 9.4z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M5.2 3.8h3.1l1.9 4.8-2.4 1.5a11 11 0 0 0 6.1 6.1l1.5-2.4 4.8 1.9v3.1a2 2 0 0 1-2 2A16.6 16.6 0 0 1 3.2 5.8a2 2 0 0 1 2-2z"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="2.8" y="6" width="12.4" height="12" rx="2.5"/><path d="M15.2 10.2 21 7v10l-5.8-3.2z"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 18V5.5l11-2V16"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  face: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.3 14.3c1 1.4 2.3 2.1 3.7 2.1s2.7-.7 3.7-2.1"/><circle cx="9" cy="9.8" r=".6" fill="currentColor"/><circle cx="15" cy="9.8" r=".6" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.5"/><circle cx="10" cy="17" r="2.5"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path fill="white" d="M3.4 11.2 19.6 4c.8-.3 1.5.4 1.2 1.2l-7.2 16.2c-.4.8-1.5.7-1.7-.1l-1.6-6.2-6.2-1.6c-.8-.2-.9-1.3-.1-1.7z"/></svg>',
  free: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 12.5 10 17l9-10"/></svg>',
};

// ------------------------------------------------------------------------------------------- state
const S = {
  pair: LS.get("pair", null),               // {c: code, w: who, n: my name, m: my coat, t: TA name, k: TA coat}
  dev: LS.get("dev", null),
  me: LS.get("me", { status: null, until: 0, sts: 0 }),
  ta: LS.get("ta", { name: "TA", coat: "photo_white", online: false, status: null, until: 0, tz: null }),
  set: LS.get("settings", { lang: "zh", call: "wechat" }),
  link: null, state: "offline", pending: new Map(), inCall: null, outCall: null, preview: null, booted: false,
};
if (!S.dev) { S.dev = "ph" + randomId(10); LS.set("dev", S.dev); }
setLang(S.set.lang);

const standalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

function b64urlToText(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}
function readPairing(text) {
  const m = String(text || "").match(/[#&?]p=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const j = JSON.parse(b64urlToText(m[1]));
    parseCode(j.c);
    return j;
  } catch (e) { return null; }
}
function savePair(p) {
  const fresh = !S.pair || S.pair.c !== p.c;
  S.pair = { c: p.c, w: p.w || null, n: p.n || "我", m: COAT(p.m), t: p.t || "TA", k: COAT(p.k || "photo_white") };
  LS.set("pair", S.pair);
  if (fresh) {
    S.ta = { name: S.pair.t, coat: S.pair.k, online: false, status: null, until: 0, tz: null };
    LS.set("ta", S.ta);
    if (p.l) { S.set.lang = p.l === "en" ? "en" : "zh"; LS.set("settings", S.set); setLang(S.set.lang); }
    if (p.cm) { S.set.call = p.cm === "web" ? "web" : "wechat"; LS.set("settings", S.set); }
  }
}

// ------------------------------------------------------------------------------------------- history
const DB = (() => {
  let p = null;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open("ck", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("voice");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction("voice", mode), q = fn(t.objectStore("voice"));
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
    });
  };
  return {
    put: (k, v) => tx("readwrite", (s) => s.put(v, k)).catch(() => null),
    get: (k) => tx("readonly", (s) => s.get(k)).catch(() => null),
    del: (k) => tx("readwrite", (s) => s.delete(k)).catch(() => null),
    clear: () => tx("readwrite", (s) => s.clear()).catch(() => null),
  };
})();
const KEEP = 500;
function hist() { return LS.get("hist", []); }
function addHist(dir, kind, fields = {}) {
  const h = hist();
  h.push({ ts: now(), dir, kind, ...fields });
  while (h.length > KEEP) { const old = h.shift(); if (old.vid) DB.del(old.vid); }
  LS.set("hist", h);
}

// ------------------------------------------------------------------------------------------- kitten stage
const cv = $("cv"), g = cv.getContext("2d");
const kitten = new Kitten("assets/poses");
const B = { x: null, target: null, left: 3, then: null, W: 0, H: 0, s: 1, dpr: 1, lastAct: "sit" };
const hearts = [];
let bubble = null;           // {text, shown, until, big}

function layout() {
  const r = cv.getBoundingClientRect();
  B.dpr = Math.min(2, window.devicePixelRatio || 1);           // 2x is plenty and saves battery on 3x phones
  B.W = r.width; B.H = r.height;
  cv.width = Math.round(r.width * B.dpr); cv.height = Math.round(r.height * B.dpr);
  B.s = Math.max(0.75, Math.min(2.0, Math.min(B.W / 250, (B.H - 110) / 190)));
  if (B.x == null) B.x = B.W / 2;
  B.x = Math.max(bounds()[0], Math.min(bounds()[1], B.x));
}
function bounds() { const m = 70 * B.s; return [m, Math.max(m, B.W - m)]; }
function foot() { return { x: B.x, y: B.H - 26 * B.s }; }

function taStatusNow() { return S.ta.status && S.ta.until > now() && STATUS[S.ta.status] ? S.ta.status : null; }
function myStatus() { return S.me.status && S.me.until > now() ? S.me.status : null; }
function shown() {
  if (S.preview && S.preview.until > now()) return { coat: COAT(S.pair.m), st: S.preview.st };
  S.preview = null;
  return { coat: COAT(S.ta.coat), st: taStatusNow() };
}

function startAction(name) {
  const k = kitten;
  B.lastAct = name;
  if (name === "walk") {
    const [lo, hi] = bounds();
    let t = rnd(lo, hi);
    for (let i = 0; i < 6 && Math.abs(t - B.x) < 90 * B.s; i++) t = rnd(lo, hi);
    goTo(t);
  } else if (name === "stretch") {
    // the stretch picture is long: do it near the middle so nothing hangs off the screen
    if (Math.abs(B.x - B.W / 2) > B.W * 0.12) { goTo(B.W / 2 + rnd(-0.06, 0.06) * B.W, () => startAction("stretch")); return; }
    k.start("stretch", 3.4); B.left = 3.4;
  } else { k.start("sit"); B.left = rnd(4, 9); }
}
function goTo(x, then = null) {
  B.target = Math.max(bounds()[0], Math.min(bounds()[1], x));
  B.then = then;
  kitten.facing = B.target >= B.x ? 1 : -1;
  kitten.start("walk"); B.left = 30;
}
function nextAction() {
  const opts = [["walk", 45], ["sit", 30], ["stretch", B.lastAct === "stretch" ? 0 : 14]];
  let r = Math.random() * opts.reduce((a, o) => a + o[1], 0);
  for (const [n, w] of opts) { if ((r -= w) <= 0) return startAction(n); }
  startAction("sit");
}

let coatWanted = null;
function tick(dt) {
  const k = kitten, sh = shown();
  if (sh.coat !== coatWanted) { coatWanted = sh.coat; k.setCoat(sh.coat); }
  if (!k.photo) return;
  k.update(dt);
  const st = sh.st;
  if (st !== k.status) {
    k.status = st;
    if (st) {
      k.setPose(st); k.facing = 1; k.start(st === "sleep" ? "sleep" : st === "eat" ? "eat" : "sit", 1e9);
      B.left = 1e9; B.target = null; B.x = B.W / 2;
    } else { k.setPose(null); k.start("sit"); B.left = rnd(2, 5); }
  }
  if (!st) {
    let pose = ["walk", "stretch"].includes(k.action) ? k.action : null;
    if (pose === "stretch" && !(k.actionT >= STRETCH_IN && k.actionT < k.actionLen - STRETCH_OUT)) pose = null;
    if (pose !== k.poseKey) k.setPose(pose);
    B.left -= dt;
    if (k.action === "walk") {
      const step = 46 * B.s * dt * k.facing;
      B.x += step;
      k.walkPhase += (Math.abs(step) / (15 * B.s)) * Math.PI;
      const arrived = (B.target - B.x) * k.facing <= 0;
      if (arrived) B.x = B.target;
      if (arrived || B.left <= 0) {
        const then = B.then; B.then = null; B.target = null;
        k.start("sit"); B.left = rnd(3, 7);
        if (then) then();
      }
    } else if (B.left <= 0) {
      if (k.action !== "sit") { k.start("sit"); B.left = rnd(3, 7); } else nextAction();
    }
  } else if (B.then && k.action !== "walk") { const then = B.then; B.then = null; then(); }
  for (const h of hearts) { h.x += h.vx * dt; h.y -= h.vy * dt; h.life -= dt; }
  while (hearts.length && hearts[0].life <= 0) hearts.shift();
}

function heartPath(x, y, r) {
  g.beginPath(); g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.35);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
}
function burstHearts(n = 6) {
  const f = foot();
  for (let i = 0; i < n; i++) hearts.push({ x: f.x + rnd(-40, 40) * B.s, y: f.y - rnd(90, 130) * B.s, vx: rnd(-14, 14), vy: rnd(30, 60), life: 1.7, r: rnd(6, 10) * B.s });
}

function headPoint() {
  const P = kitten.sprite;
  return P ? posePoint(kitten, foot(), B.s, P.head) : { x: B.x, y: B.H / 2 };
}

function draw() {
  g.setTransform(B.dpr, 0, 0, B.dpr, 0, 0);
  g.clearRect(0, 0, B.W, B.H);
  if (!kitten.sprite) return;
  const f = foot();
  paintKitten(g, kitten, f, B.s, B.dpr);
  paintFx(g, kitten, f, B.s, { sigh: tr("呼~") });
  if (kitten.sleeping || kitten.status === "sleep") {
    const P = kitten.posePhoto, z = P && P.fx.zzz;
    paintZzz(g, kitten, z ? posePoint(kitten, f, B.s, z, false) : headPoint(), B.s, z ? 1 : kitten.facing);
  }
  for (const h of hearts) {
    const a = Math.max(0, Math.min(1, h.life / 0.6));
    g.fillStyle = `rgba(255,107,139,${a})`; heartPath(h.x, h.y, h.r); g.fill();
  }
  placeBubble();
}

function say(text, secs = 3, big = false) {
  bubble = { text, shown: big ? 0 : text.length, until: performance.now() / 1000 + secs, big };
  const el = $("bubble");
  el.classList.remove("hidden"); el.classList.toggle("small", !big);
  el.textContent = big ? "" : text;
}
function placeBubble() {
  const el = $("bubble");
  if (!bubble) return;
  const t = performance.now() / 1000;
  if (t > bubble.until) { bubble = null; el.classList.add("hidden"); return; }
  if (bubble.shown < bubble.text.length) {                 // typewriter
    bubble.shown = Math.min(bubble.text.length, bubble.shown + 0.6);
    el.textContent = bubble.text.slice(0, Math.floor(bubble.shown));
  }
  const h = headPoint(), w = el.offsetWidth, ht = el.offsetHeight;
  const x = Math.max(w / 2 + 10, Math.min(B.W - w / 2 - 10, h.x));
  const y = Math.max(6, h.y - 58 * B.s - ht);
  el.style.left = x + "px"; el.style.top = y + "px";
}

let last = 0, raf = 0;
function frame(ts) {
  raf = requestAnimationFrame(frame);
  if (S.manual || ts - last < 32) return;                               // ~30 fps is smooth enough and easy on the battery
  const dt = Math.min(0.1, (ts - last) / 1000 || 0.033);
  last = ts;
  tick(dt); draw();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (!raf && S.booted) { last = performance.now(); raf = requestAnimationFrame(frame); }
});

cv.addEventListener("pointerdown", (ev) => {
  const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, f = foot();
  if (Math.abs(px - f.x) < 80 * B.s && py > f.y - 190 * B.s && py < f.y + 10 * B.s) {
    kitten.hop(16); kitten.happyLeft = 1.2; burstHearts(3);
    say(tr(pick(TAP_WORDS)), 1.8);
  }
});

// ------------------------------------------------------------------------------------------- toast / cards / sheets
let toastT = 0;
function toast(text, secs = 2.6) {
  const el = $("toast"); el.textContent = text; el.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), secs * 1000);
}

let card = null; const cardQueue = [];
// buttons: [[key, label, cls]]; onButton(key) returns true to keep the card open
function showCard(c) {
  if (card) {
    if (c.priority && !card.priority) { cardQueue.unshift(card); closeCard(null, true); }
    else { cardQueue.push(c); return; }
  }
  card = c;
  const el = $("card");
  el.innerHTML = `<h3>${esc(c.title)}</h3>${c.sub ? `<p>${esc(c.sub)}</p>` : ""}<div class="btns">${
    c.buttons.map(([k, lab, cls]) => `<button data-k="${k}" class="${cls || ""}">${esc(lab)}</button>`).join("")}</div>`;
  el.classList.remove("hidden");
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const keep = c.onButton && c.onButton(b.dataset.k);
    if (!keep) closeCard(b.dataset.k);
  }));
  if (c.timeout) c.timer = setTimeout(() => { if (card === c) { c.onButton && c.onButton("timeout"); closeCard("timeout"); } }, c.timeout * 1000);
  c.onShow && c.onShow();
}
function setCard(c, { title, sub }) {
  if (card !== c) return;
  if (title !== undefined) $("card").querySelector("h3").textContent = title;
  if (sub !== undefined) { const p = $("card").querySelector("p"); if (p) p.textContent = sub; }
}
function closeCard(key = null, requeue = false) {
  const c = card;
  if (!c) return;
  clearTimeout(c.timer);
  c.onClose && c.onClose(key);
  card = null;
  $("card").classList.add("hidden");
  if (!requeue && cardQueue.length) setTimeout(() => showCard(cardQueue.shift()), 250);
}

function openSheet(html, onReady) {
  $("sheet").innerHTML = `<div class="grab"></div>${html}`;
  $("sheet").classList.remove("hidden"); $("shade").classList.remove("hidden");
  onReady && onReady($("sheet"));
}
function closeSheet() { $("sheet").classList.add("hidden"); $("shade").classList.add("hidden"); $("sheet").innerHTML = ""; }
$("shade").addEventListener("click", closeSheet);

// ------------------------------------------------------------------------------------------- header + buttons
function hhmmTz(tz) {
  const d = new Date(Date.now() + tz * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function renderHeader() {
  $("taName").textContent = S.ta.name || "TA";
  const on = S.state === "online" && S.ta.online;
  $("dot").classList.toggle("on", on);
  let line;
  if (S.state === "connecting") line = tr("连接中…");
  else if (S.state !== "online") line = tr("网络断开");
  else {
    const st = taStatusNow();
    line = st ? tr(STATUS[st]) : tr(S.ta.online ? "在线" : "不在线");
    if (typeof S.ta.tz === "number") line += " · " + tr("TA那边 {0}", hhmmTz(S.ta.tz));
  }
  $("taLine").textContent = line;
}
setInterval(() => S.booted && renderHeader(), 20000);

function renderTexts() {
  document.title = tr("情侣小猫");
  $("say").placeholder = tr("和 TA 说点什么…");
  const acts = [["poke", "heart", "戳一下"], ["voice", "mic", "语音"], ["call", "phone", "通话"],
                ["video", "video", "视频"], ["music", "music", "听歌"], ["status", "face", "状态"]];
  $("actions").innerHTML = acts.map(([k, ic, lab]) =>
    `<button class="act ${k === "poke" ? "poke" : ""}" id="act-${k}">${ICON[ic]}<span>${esc(tr(lab))}</span></button>`).join("");
  $("btnHistory").innerHTML = ICON.clock; $("btnSettings").innerHTML = ICON.gear; $("sendSay").innerHTML = ICON.send;
  $("act-poke").onclick = sendPoke;
  $("act-voice").onclick = toggleVoice;
  $("act-call").onclick = () => startCall(false);
  $("act-video").onclick = () => startCall(true);
  $("act-music").onclick = musicSheet;
  $("act-status").onclick = statusSheet;
  renderHeader();
}
$("btnHistory").onclick = () => historySheet();
$("btnSettings").onclick = () => settingsSheet();
$("sendSay").onclick = sendSay;
$("say").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendSay(); } });

function offlineHint() { return S.state === "online" && !S.ta.online ? tr("{0} 现在不在线，上线后会收到", S.ta.name) : null; }

// ------------------------------------------------------------------------------------------- sending
async function send(kind, fields = {}, body) {
  if (!S.link) return null;
  return S.link.send(kind, body || new Uint8Array(0), fields);
}

async function sendSay() {
  const el = $("say"), text = el.value.split(/\s+/).join(" ").trim().slice(0, 120);
  if (!text) return;
  const id = await send("say", { text });
  S.pending.set(id, "say");
  addHist("out", "say", { text });
  el.value = ""; el.blur();
  kitten.hop(16, 2); kitten.happyLeft = 1.2; A.chime("sent");
  say(offlineHint() || tr("已让小猫去跟 {0} 说：{1}", S.ta.name, text), 4);
}

async function sendPoke() {
  A.audioContext();
  const id = await send("poke");
  S.pending.set(id, "poke");
  addHist("out", "poke");
  kitten.hop(22, 2); kitten.happyLeft = 1.5; burstHearts(7); A.chime("sent");
  say(offlineHint() || tr("戳了 {0} 一下~", S.ta.name), 3);
}

const rec = new A.Recorder();
let recTimer = 0;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
async function toggleVoice() {
  if (rec.active) return finishVoice(true);
  try { await rec.start(); } catch (e) { toast(tr("打不开麦克风：请在设置里允许 Safari 使用麦克风"), 4); return; }
  A.stopPlaying();
  $("act-voice").classList.add("rec");
  const c = {
    title: tr("● 录音中 {0}", "0:00"), sub: tr("点「发送」发给 TA，最长 60 秒"),
    buttons: [["cancel", tr("取消"), ""], ["send", tr("发送"), "love"]],
    onButton: (k) => { finishVoice(k === "send"); return false; },
  };
  showCard(c);
  recTimer = setInterval(() => {
    setCard(c, { title: tr("● 录音中 {0}", mmss(rec.seconds)) });
    $("act-voice").querySelector("span").textContent = mmss(rec.seconds);
    if (rec.seconds >= A.MAX_SECONDS) { finishVoice(true); if (card === c) closeCard(); }
  }, 250);
}
async function finishVoice(sendIt) {
  clearInterval(recTimer);
  $("act-voice").classList.remove("rec");
  $("act-voice").querySelector("span").textContent = tr("语音");
  const r = rec.stop();
  if (!sendIt || !r) return;
  if (r.secs < 0.8) { say(tr("太短啦，再说一次~"), 2.5); return; }
  const dur = Math.round(r.secs * 10) / 10;
  const id = await send("voice", { dur, rate: A.RATE, codec: "ulaw" }, r.data);
  S.pending.set(id, "voice");
  await DB.put(id, r.data);
  addHist("out", "voice", { vid: id, dur });
  A.chime("sent"); kitten.hop(14);
  say(offlineHint() || tr("语音已发送 · {0}", mmss(r.secs)), 3);
}

function callKind(video) { return tr(video ? "视频" : "语音"); }
async function startCall(video) {
  A.audioContext();
  if (S.outCall) return;
  const cid = randomId(12), mode = S.set.call;
  await send("call", { cid, video, mode });
  addHist("out", "call", { video, state: "out" });
  S.outCall = { cid, video, mode };
  A.chime("sent");
  showCard({
    title: tr("正在邀请 {0} {1}通话…", S.ta.name, callKind(video)), sub: offlineHint() || "",
    buttons: [["cancel", tr("取消"), "decline"]], timeout: 46,
    onButton: (k) => { if (S.outCall && S.outCall.cid === cid) cancelCall(k === "timeout" ? "timeout" : "cancel"); return false; },
    callOut: cid,
  });
}
function cancelCall(reason) {
  if (!S.outCall) return;
  send("call_cancel", { cid: S.outCall.cid, reason });
  S.outCall = null;
  if (reason === "timeout") say(tr("{0} 没接到，晚点再试~", S.ta.name), 3.5);
}
function beginCall(video, mode, caller) {
  if (mode === "web" && S.link) { window.open(webCallUrl(S.link.room, video, S.pair.n), "_blank"); return; }
  showCard({
    title: caller ? tr("{0} 接受啦！去微信里给 TA 打{1}吧", S.ta.name, callKind(video)) : tr("已接听，等 {0} 的微信{1}~", S.ta.name, callKind(video)),
    buttons: [["ok", tr("好的"), ""], ["wx", tr("打开微信"), "accept"]], timeout: 30,
    onButton: (k) => { if (k === "wx") location.href = "weixin://"; return false; },
  });
}

// ------------------------------------------------------------------------------------------- receiving
function ack(h) { if (h.id) send("ack", { ref: h.id, what: h.t }); }
const hhmm = (ts) => { const d = new Date((+ts || now()) * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
let ringTimer = 0;
function ring(on) { clearInterval(ringTimer); if (on) { A.chime("ring"); ringTimer = setInterval(() => A.chime("ring"), 2200); } }

function onEvent(h, body) {
  const t = h.t, name = String(h.name || S.ta.name).slice(0, 12), age = now() - (+h.ts || now());
  if (h.coat) { S.ta.coat = COAT(h.coat); LS.set("ta", S.ta); }
  if (t === "poke") {
    ack(h); addHist("in", "poke", { name });
    if (age > 600) { say(tr("{0} 戳了你一下", name) + " · " + hhmm(h.ts), 5); kitten.hop(14); return; }
    A.chime("chime"); kitten.hop(20, 2); burstHearts(5);
    showCard({ title: tr("{0} 想和你互动", name), sub: tr(pick(POKE_WORDS)), timeout: 22,
               buttons: [["ok", tr("知道啦"), ""], ["back", tr("回应 TA"), "love"]],
               onButton: (k) => { if (k === "back") sendPoke(); return false; } });
  } else if (t === "say") {
    ack(h);
    const text = String(h.text || "").split(/\s+/).join(" ").trim().slice(0, 120);
    if (!text) return;
    addHist("in", "say", { text, name });
    A.chime("chime");
    const speak = () => { kitten.hop(12); say(text, 12, true); };
    if (!kitten.status) goTo(B.W / 2, speak); else speak();
    showCard({ title: tr("{0} 对你说", name), sub: age > 600 ? tr("{0} 发的", hhmm(h.ts)) : tr("刚刚"), timeout: 40,
               buttons: [["ok", tr("知道啦"), ""], ["reply", tr("回复"), "love"]],
               onButton: (k) => { if (k === "reply") setTimeout(() => $("say").focus(), 150); return false; } });
  } else if (t === "call") {
    ack(h);
    const video = !!h.video;
    if (age > 60) { addHist("in", "call", { video, state: "missed", name }); toast(tr("未接来电：{0} 想和你{1}", name, callKind(video)), 4); return; }
    addHist("in", "call", { video, state: "in", name });
    const mode = h.mode === "web" ? "web" : "wechat";
    S.inCall = { cid: h.cid, video, mode, name };
    showCard({
      title: tr("{0} 邀请你{1}通话", name, callKind(video)), sub: tr(mode === "wechat" ? "接听后 TA 会在微信里打给你" : "接听后会打开网页通话"),
      buttons: [["decline", tr("稍后"), "decline"], ["accept", tr("接听"), "accept"]], timeout: 45, priority: true, callIn: h.cid,
      onShow: () => ring(true), onClose: () => ring(false),
      onButton: (k) => {
        const call = S.inCall; S.inCall = null;
        if (!call) return false;
        if (k === "accept") { send("call_answer", { cid: call.cid, ok: true }); beginCall(call.video, call.mode, false); }
        else {
          send("call_answer", { cid: call.cid, ok: false, reason: k === "timeout" ? "timeout" : "decline" });
          if (k === "timeout") addHist("in", "call", { video: call.video, state: "missed", name: call.name });
        }
        return false;
      },
    });
  } else if (t === "call_cancel") {
    if (S.inCall && S.inCall.cid === h.cid) {
      const call = S.inCall; S.inCall = null;
      if (card && card.callIn === h.cid) closeCard("cancelled");
      addHist("in", "call", { video: call.video, state: "missed", name });
      toast(tr("未接来电：{0} 想和你{1}", name, callKind(call.video)), 4);
    }
  } else if (t === "call_answer") {
    if (S.outCall && S.outCall.cid === h.cid) {
      const call = S.outCall; S.outCall = null;
      if (card && card.callOut === h.cid) closeCard("answered");
      if (h.ok) { kitten.hop(24, 2); burstHearts(8); beginCall(call.video, call.mode, true); }
      else say(tr("{0} 现在不方便，晚点再聊~", name), 4);
    }
  } else if (t === "voice") {
    ack(h);
    const dur = +h.dur || body.length / A.RATE, vid = String(h.id || randomId(12));
    DB.put(vid, body);
    addHist("in", "voice", { vid, dur, name });
    A.chime("note"); kitten.hop(18, 2);
    showCard({
      title: tr("{0} 给你发了一条语音", name), sub: `${mmss(dur)} · ${hhmm(h.ts)}`, timeout: 40,
      buttons: [["ok", tr("好的"), ""], ["reply", tr("回复"), ""], ["play", tr("▶ 播放"), "primaryb"]],
      onButton: (k) => {
        if (k === "play") { A.playUlaw(body, +h.rate || A.RATE); const b = $("card").querySelector('[data-k="play"]'); if (b) b.textContent = tr("再听一遍"); return true; }
        if (k === "reply") setTimeout(toggleVoice, 250);
        return false;
      },
    });
  } else if (t === "music") {
    ack(h);
    const url = String(h.url || "");
    if (!URL_RE.test(url) || url.length > 1500) return;
    addHist("in", "music", { url, name });
    A.chime("chime");
    showCard({ title: tr("{0} 想和你一起听歌", name), sub: tr("来自 {0}", url.replace(/^https?:\/\/([^/]+).*$/, "$1")), timeout: 30,
               buttons: [["later", tr("稍后"), ""], ["open", tr("打开听听"), "primaryb"]],
               onButton: (k) => { if (k === "open") window.open(url, "_blank"); return false; } });
  } else if (t === "unbind") {
    unpairHere(tr("{0} 解除了和你的绑定", name));
  } else if (t === "ack") {
    const kind = S.pending.get(h.ref);
    S.pending.delete(h.ref);
    const msg = { poke: tr("{0} 看到啦 ❤", name), voice: tr("{0} 收到语音啦", name), music: tr("{0} 收到邀请啦", name),
                  say: tr("小猫把话带到啦，{0} 看到了 ❤", name) }[kind];
    if (msg) { say(msg, 2.5); kitten.hop(12); }
  }
}

function onPresence(p) {
  const was = S.ta.online, wasSt = taStatusNow();
  Object.assign(S.ta, { name: String(p.name || "TA").slice(0, 12), coat: COAT(p.coat), online: !!p.online,
                        status: p.status || null, until: +p.status_until || 0, tz: typeof p.tz === "number" ? p.tz : S.ta.tz });
  LS.set("ta", S.ta);
  renderHeader();
  if (S.booted && S.ready) {
    if (!was && S.ta.online) toast(tr("{0} 上线啦~", S.ta.name));
    if (wasSt && !taStatusNow()) say(tr("{0} 现在有空啦", S.ta.name), 3);
  }
}

function onOwn(h) {
  if (h.t === "presence") {
    if ((h.dev || "pc") === "pc") {                        // my computer: my name and kitten
      let changed = false;
      if (h.name && h.name !== S.pair.n) { S.pair.n = String(h.name).slice(0, 12); changed = true; }
      if (h.coat && COAT(h.coat) !== S.pair.m) { S.pair.m = COAT(h.coat); changed = true; }
      if (changed) { LS.set("pair", S.pair); S.link && S.link.updateProfile({ name: S.pair.n, coat: S.pair.m }); }
    }
    if ((+h.sts || 0) > (S.me.sts || 0)) {                // I changed my status on the computer
      S.me = { status: h.status || null, until: +h.status_until || 0, sts: +h.sts };
      LS.set("me", S.me);
      S.link && S.link.updateProfile({ status: myStatus(), statusUntil: S.me.until, statusTs: S.me.sts });
    }
  } else if (h.t === "call_answer") {
    if (S.inCall && S.inCall.cid === h.cid) {
      S.inCall = null;
      if (card && card.callIn === h.cid) closeCard("elsewhere");
      toast(tr(h.ok ? "已在电脑上接听" : "已在电脑上挂断"));
    }
  } else if (h.t === "say") addHist("out", "say", { text: String(h.text || "").slice(0, 120), via: "pc" });
  else if (h.t === "poke") addHist("out", "poke", { via: "pc" });
  else if (h.t === "music") addHist("out", "music", { url: String(h.url || ""), via: "pc" });
  else if (h.t === "unbind") unpairHere(tr("电脑上解除了配对，这部手机也已断开"));
}

// ------------------------------------------------------------------------------------------- sheets
function statusSheet() {
  const cur = myStatus(), folder = FOLDER[COAT(S.pair.m)];
  const cells = PICK.map((k) => `<button class="cell ${cur === k ? "on" : ""}" data-s="${k}">
      <img src="assets/poses/${folder}/${k}.webp" alt="" style="width:64px;height:48px;object-fit:contain">${esc(tr(SHORT[k]))}</button>`).join("");
  openSheet(`<h2>${esc(tr("我现在在…"))}</h2><div class="muted">${esc(tr("TA 的小猫会替你演出来"))}</div>
    <div class="grid">${cells}<button class="cell ${cur ? "" : "on"}" data-s="">${ICON.free}${esc(tr("空闲"))}</button></div>
    <div class="muted small">${esc(tr("选好后一直保持，直到你换成别的或选「空闲」"))}</div>`, (el) => {
    el.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => { closeSheet(); pickStatus(b.dataset.s || null); }));
  });
}
function pickStatus(key) {
  S.me = key ? { status: key, until: now() + FOREVER, sts: now() } : { status: null, until: 0, sts: now() };
  LS.set("me", S.me);
  S.link && S.link.updateProfile({ status: myStatus(), statusUntil: S.me.until, statusTs: S.me.sts });
  A.chime("sent");
  if (key) { S.preview = { st: key, until: now() + 6 }; say(tr("已告诉 {0}：我{1}", S.ta.name, tr(STATUS[key])), 5); }
  else say(tr("已改成空闲"), 2);
}

function musicSheet() {
  openSheet(`<h2>${esc(tr("一起听歌"))}</h2>
    <div class="label">${esc(tr("粘贴一首歌的分享链接"))}</div>
    <textarea id="musicUrl" class="field" rows="3" placeholder="https://"></textarea>
    <button id="musicGo" class="primary">${esc(tr("发给 TA 一起听"))}</button>`, (el) => {
    el.querySelector("#musicGo").onclick = async () => {
      const m = el.querySelector("#musicUrl").value.match(/https?:\/\/\S+/);
      const url = m ? m[0] : "";
      if (!URL_RE.test(url) || url.length > 1500) { el.querySelector("#musicUrl").focus(); return; }
      const id = await send("music", { url });
      S.pending.set(id, "music");
      addHist("out", "music", { url });
      closeSheet(); A.chime("sent");
      say(offlineHint() || tr("已邀请 {0} 一起听~", S.ta.name), 3.5);
      window.open(url, "_blank");
    };
  });
}

function dayLabel(ts) {
  const d = new Date(ts * 1000), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return diff === 0 ? tr("今天") : diff === 1 ? tr("昨天") : tr("{0}月{1}日", d.getMonth() + 1, d.getDate());
}
function histText(e) {
  const k = callKind(!!e.video);
  if (e.kind === "say") return esc(e.text || "");
  if (e.kind === "poke") return esc(e.dir === "out" ? tr("❤ 戳了 {0} 一下", S.ta.name) : tr("❤ {0} 戳了你一下", e.name || S.ta.name));
  if (e.kind === "call") return esc(e.state === "missed" ? tr("☎ 未接{0}通话", k) : e.dir === "out" ? tr("☎ 你发起了{0}通话", k) : tr("☎ {0} 邀请你{1}通话", e.name || S.ta.name, k));
  if (e.kind === "music") return esc(tr("♫ 一起听：{0}", String(e.url || "").replace(/^https?:\/\/([^/]+).*$/, "$1")));
  if (e.kind === "voice") return `<button class="vplay" data-v="${esc(e.vid || "")}" style="color:inherit;font-weight:600">${esc(tr("▶ 语音 {0}", mmss(+e.dur || 0)))}</button>`;
  return "";
}
function historySheet() {
  const h = hist().slice(-200);
  let day = "", rows = "";
  for (const e of h) {
    const dl = dayLabel(e.ts);
    if (dl !== day) { day = dl; rows += `<div class="day">${esc(dl)}</div>`; }
    rows += `<div class="msg ${e.dir === "out" ? "me" : ""}">${histText(e)}<span class="tm">${hhmm(e.ts)}</span></div>`;
  }
  openSheet(`<h2>${esc(tr("和 {0} 的历史消息", S.ta.name))}</h2>
    <div class="hist">${rows || `<p class="muted">${esc(tr("还没有消息，戳一下 TA 吧~"))}</p>`}</div>
    <button class="plain" id="histClose">${esc(tr("关闭"))}</button>`, (el) => {
    el.querySelector("#histClose").onclick = closeSheet;
    el.querySelectorAll(".vplay").forEach((b) => b.addEventListener("click", async () => {
      const data = b.dataset.v && (await DB.get(b.dataset.v));
      if (data) A.playUlaw(data); else toast(tr("这条语音找不到了"));
    }));
    el.scrollTop = el.scrollHeight;
  });
}

function seg(id, opts, cur) {
  return `<div class="seg" id="${id}">${opts.map(([v, lab]) => `<button data-v="${v}" class="${v === cur ? "on" : ""}">${esc(lab)}</button>`).join("")}</div>`;
}
function settingsSheet() {
  openSheet(`<h2>${esc(tr("设置"))}</h2>
    <div class="label">${esc(tr("语言"))}</div>${seg("segLang", [["zh", "中文"], ["en", "English"]], lang())}
    <div class="label">${esc(tr("打电话用"))}</div>${seg("segCall", [["wechat", tr("微信（跨国最稳）")], ["web", tr("网页通话（免账号）")]], S.set.call)}
    <p class="muted small" style="margin-top:18px">${esc(tr("已和电脑连接 · 我是 {0}", S.pair.n))}</p>
    <button class="danger" id="unlink">${esc(tr("和电脑断开（只断开这部手机）"))}</button>`, (el) => {
    el.querySelectorAll("#segLang button").forEach((b) => b.onclick = () => {
      S.set.lang = b.dataset.v; LS.set("settings", S.set); setLang(S.set.lang); renderTexts(); settingsSheet();
    });
    el.querySelectorAll("#segCall button").forEach((b) => b.onclick = () => {
      S.set.call = b.dataset.v; LS.set("settings", S.set); settingsSheet();
    });
    el.querySelector("#unlink").onclick = () => {
      closeSheet();
      showCard({ title: tr("断开这部手机？"), sub: tr("电脑和 TA 那边都不受影响，以后可以再扫码连接。"),
                 buttons: [["no", tr("取消"), ""], ["yes", tr("断开"), "decline"]],
                 onButton: (k) => { if (k === "yes") unpairHere(null); return false; } });
    };
  });
}

async function unpairHere(msg) {
  const L = S.link; S.link = null;
  if (L) { try { await L.stop(); } catch (e) { /* closing anyway */ } }
  LS.del("pair"); LS.del("ta"); LS.del("me");
  S.pair = null; S.booted = false;
  cancelAnimationFrame(raf); raf = 0;
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  showPairing(msg);
}

// ------------------------------------------------------------------------------------------- pairing + start
function showPairing(msg = null) {
  $("app").classList.add("hidden"); $("pair").classList.remove("hidden");
  $("pairTitle").textContent = tr("连接你的电脑");
  $("pairHow").textContent = tr("在电脑上：右键小猫 →「连接我的手机」，用手机相机扫一下屏幕上的二维码。");
  $("pairOr").textContent = tr("或者把电脑上「复制链接」得到的链接粘贴到这里：");
  $("pairLink").placeholder = tr("粘贴连接链接");
  $("pairGo").textContent = tr("连接");
  $("pairTip").textContent = standalone() ? "" : tr("提示：先点 Safari 下面的「分享」→「添加到主屏幕」，以后就像 App 一样打开。");
  $("pairErr").textContent = msg || "";
  $("pairGo").onclick = () => {
    const p = readPairing($("pairLink").value);
    if (!p) { $("pairErr").textContent = tr("链接不对，请在电脑上重新复制"); return; }
    savePair(p); startApp();
  };
}

async function startApp() {
  $("pair").classList.add("hidden"); $("app").classList.remove("hidden");
  renderTexts();
  layout();
  S.booted = true; S.ready = false;
  last = performance.now(); if (!raf) raf = requestAnimationFrame(frame);
  const p = S.pair;
  const L = new Link({ code: p.c, deviceId: S.dev, who: p.w || undefined, name: p.n, coat: COAT(p.m), status: myStatus(),
                       statusUntil: S.me.until, statusTs: S.me.sts, url: BROKER || null });
  L.onEvent = (h, b) => { try { onEvent(h, b); } catch (e) { console.error(e); } };
  L.onPresence = onPresence;
  L.onOwn = (h) => { try { onOwn(h); } catch (e) { console.error(e); } };
  L.onState = (s) => { S.state = s; renderHeader(); if (s === "online") setTimeout(() => { S.ready = true; }, 2500); };
  S.link = L;
  try { await L.start(); } catch (e) { console.error(e); S.state = "offline"; renderHeader(); }
}

window.addEventListener("resize", () => S.booted && layout());
document.addEventListener("pointerdown", () => A.audioContext(), { once: true });   // iOS: sounds need a first tap

// boot
const fromUrl = readPairing(location.hash);
if (fromUrl) {
  savePair(fromUrl);
  // in Safari keep the link in the address so "Add to Home Screen" keeps it; inside the app tidy it away
  if (standalone()) history.replaceState(null, "", location.pathname + location.search);
}
if (S.pair) startApp(); else showPairing();
if ("serviceWorker" in navigator && !BROKER) navigator.serviceWorker.register("sw.js").catch(() => {});
window.__ck = { S, kitten, B, onEvent, pickStatus, step: (dt) => { tick(dt); draw(); } };       // for tests
