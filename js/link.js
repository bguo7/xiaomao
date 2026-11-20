// The phone's side of the encrypted link (mirrors app/link.py on the computer).
// Events: onEvent(header, body) from TA, onPresence({online, name, coat, status, ...}) for TA,
// onOwn(header) for things from MY computer (same person), onState("connecting" | "online" | "offline").
import { Crypto, parseCode, SERVERS, CHUNK, randomId, sha256hex } from "./proto.js";

const enc = new TextEncoder();

// which 'together since' wins: the one somebody set by hand most recently, otherwise the earliest
export function bestSince(list) {
  const c = list.map((p) => [+p.since || 0, +p.sset || 0]).filter((x) => x[0] > 0);
  if (!c.length) return {};
  const manual = c.filter((x) => x[1] > 0);
  const [since, sset] = manual.length ? manual.reduce((a, b) => (b[1] > a[1] ? b : a)) : c.reduce((a, b) => (b[0] < a[0] ? b : a));
  return { since, sset };
}
export function mergeSince([ms, mset], [ts, tset]) {
  ms = +ms || 0; mset = +mset || 0; ts = +ts || 0; tset = +tset || 0;
  if (ts <= 0) return null;
  if (tset > mset + 0.001) return [ts, tset];
  if (tset === 0 && mset === 0 && (ms <= 0 || ts < ms - 1)) return [ts, 0];
  return null;
}

export class Link {
  constructor({ code, deviceId, who, name, coat, status = null, statusUntil = 0, statusTs = 0, url = null,
                connect = null, since = 0, sinceSet = 0 }) {
    this.since = since;
    this.sinceSet = sinceSet;
    const { server, body } = parseCode(code);
    this.server = server;
    this.body = body;
    this.deviceId = deviceId;
    this.who = who || deviceId;
    this.name = name;
    this.coat = coat;
    this.status = status;
    this.statusUntil = statusUntil;
    this.statusTs = statusTs;
    this.url = url || `wss://${SERVERS[server] || SERVERS.CN}:8084/mqtt`;
    this.connectFn = connect || ((u, o) => globalThis.mqtt.connect(u, o));
    this.seen = new Map();
    this.parts = new Map();
    this.peers = new Map();
    this.state = "offline";
    this.onEvent = () => {};
    this.onPresence = () => {};
    this.onOwn = () => {};
    this.onState = () => {};
    this.queue = [];
  }

  get room() { return this.crypto.room; }

  async start() {
    this.crypto = await Crypto.create(this.body);
    const base = this.crypto.topic;
    this.tEvents = base + "/e";
    this.tPresAll = base + "/p/+";
    this.tPresMe = `${base}/p/${this.deviceId}`;
    const clientId = "ck-" + (await sha256hex(enc.encode(this.deviceId + base))).slice(0, 20);
    const will = await this.crypto.seal(this.presence(false));
    this.setState("connecting");
    // a persistent session: messages that arrive while the app is closed are kept by the relay (QoS 1)
    this.client = this.connectFn(this.url, {
      clientId, clean: false, keepalive: 25, protocolVersion: 4, reconnectPeriod: 3000, connectTimeout: 12000,
      will: { topic: this.tPresMe, payload: will, qos: 1, retain: true },
    });
    this.client.on("connect", async () => {
      this.client.subscribe([this.tEvents, this.tPresAll], { qos: 1 });
      await this.publishPresence(true);
      this.setState("online");
      const q = this.queue.splice(0);
      for (const [t, p, r] of q) this.client.publish(t, p, { qos: 1, retain: r });
    });
    this.client.on("message", (topic, payload) => this.handle(topic, payload).catch(() => {}));
    this.client.on("close", () => this.setState(this.stopped ? "offline" : "connecting"));
    this.client.on("offline", () => this.setState("offline"));
    this.client.on("error", () => {});
  }

  setState(s) {
    if (s !== this.state) { this.state = s; this.onState(s); }
  }

  presence(online) {
    return { v: 1, id: randomId(16), from: this.deviceId, who: this.who, dev: "phone", t: "presence", online,
             name: this.name, coat: this.coat, ts: Date.now() / 1000, status: this.status,
             status_until: this.statusUntil, sts: this.statusTs, tz: -new Date().getTimezoneOffset() * 60,
             since: this.since || 0, sset: this.sinceSet || 0 };
  }

  async publishPresence(online) {
    const p = await this.crypto.seal(this.presence(online));
    this.publish(this.tPresMe, p, true);
  }

  publish(topic, payload, retain = false) {
    if (this.client && this.client.connected) this.client.publish(topic, payload, { qos: 1, retain });
    else this.queue.push([topic, payload, retain]);
  }

  async send(kind, body = new Uint8Array(0), fields = {}) {
    const id = randomId(16);
    const header = { v: 1, id, from: this.deviceId, who: this.who, t: kind, ts: Date.now() / 1000,
                     name: this.name, coat: this.coat, ...fields };
    if (kind === "voice" || kind === "image") {      // big things go in 32 KB pieces
      const n = Math.max(1, Math.ceil(body.length / CHUNK));
      for (let seq = 0; seq < n; seq++) {
        const h = { ...header, t: kind + "_chunk", id: `${id}.${seq}`, vid: id, seq, n };
        this.publish(this.tEvents, await this.crypto.seal(h, body.slice(seq * CHUNK, (seq + 1) * CHUNK)));
      }
    } else {
      this.publish(this.tEvents, await this.crypto.seal(header, body));
    }
    return id;
  }

  async updateProfile({ name, coat, status, statusUntil, statusTs, since, sinceSet }) {
    if (since !== undefined) this.since = since;
    if (sinceSet !== undefined) this.sinceSet = sinceSet;
    if (name !== undefined) this.name = name;
    if (coat !== undefined) this.coat = coat;
    if (status !== undefined) this.status = status;
    if (statusUntil !== undefined) this.statusUntil = statusUntil;
    if (statusTs !== undefined) this.statusTs = statusTs;
    if (this.crypto) await this.publishPresence(true);
  }

  // iPhone apps get frozen in the background and their connection can die silently. When we go to the background
  // we tell the others we're away; when we come back we reconnect (the relay kept what arrived meanwhile).
  async pause() {
    this.pausedAt = Date.now();
    if (this.client && this.client.connected) { try { await this.publishPresence(false); } catch (e) { /* ignore */ } }
  }

  async resume() {
    if (!this.client || this.stopped) return;
    const away = this.pausedAt ? Date.now() - this.pausedAt : 0;
    this.pausedAt = 0;
    if (!this.client.connected) { this.setState("connecting"); this.client.reconnect(); return; }
    if (away > 15000) {                             // the socket may look open but be dead: start a fresh one
      this.setState("connecting");
      this.client.end(true, {}, () => { if (!this.stopped) this.client.reconnect(); });
      return;
    }
    await this.publishPresence(true);
  }

  async stop() {
    this.stopped = true;
    if (this.client) {
      try { await this.publishPresence(false); } catch (e) { /* closing anyway */ }
      await new Promise((r) => setTimeout(r, 300));
      this.client.end(true);
    }
    this.setState("offline");
  }

  async handle(topic, payload) {
    let header, body;
    try {
      ({ header, body } = await this.crypto.open(payload));
    } catch (e) {
      return;                                       // not ours, or tampered
    }
    if (header.from === this.deviceId) return;
    const mine = (header.who || header.from) === this.who;
    if (topic.startsWith(this.crypto.topic + "/p/")) {
      if (mine) this.onOwn(header);
      else this.mergePresence(header);
      return;
    }
    const id = String(header.id || "");
    if (this.seen.has(id)) return;
    this.seen.set(id, 1);
    if (this.seen.size > 2000) this.seen.delete(this.seen.keys().next().value);
    if (mine) {                                     // something I did on my computer
      if (["call_answer", "say", "poke", "music", "unbind"].includes(header.t)) this.onOwn(header);
      return;
    }
    if (header.t === "voice_chunk" || header.t === "image_chunk") { this.chunk(header, body); return; }
    this.onEvent(header, body);
  }

  mergePresence(h) {
    this.peers.set(h.from, h);
    const known = [...this.peers.values()].filter((p) => typeof p.ts === "number");
    if (!known.length) return;
    const latest = known.reduce((a, b) => (b.ts > a.ts ? b : a));
    const st = known.reduce((a, b) => ((+b.sts || 0) > (+a.sts || 0) || ((+b.sts || 0) === (+a.sts || 0) && b.ts > a.ts) ? b : a));
    const pcs = known.filter((p) => (p.dev || "pc") === "pc");
    const prof = pcs.length ? pcs.reduce((a, b) => (b.ts > a.ts ? b : a)) : latest;
    this.onPresence({ online: known.some((p) => p.online), name: prof.name || "TA", coat: prof.coat || "photo_white",
                      ts: latest.ts, status: st.status || null, status_until: st.status_until || 0, tz: latest.tz,
                      who: prof.who || prof.from, ...bestSince(known) });
  }

  chunk(h, body) {
    const now = Date.now();
    for (const [k, v] of this.parts) if (now - v.t0 > 600000) this.parts.delete(k);
    const vid = h.vid, n = +h.n || 0, seq = +h.seq;
    if (!vid || !(seq >= 0 && seq < n && n <= 400)) return;
    let e = this.parts.get(vid);
    if (!e) { e = { t0: now, n, parts: new Map(), head: h }; this.parts.set(vid, e); }
    e.parts.set(seq, body);
    if (seq === 0) e.head = h;
    if (e.parts.size === e.n) {
      this.parts.delete(vid);
      const total = [...e.parts.values()].reduce((a, p) => a + p.length, 0);
      const data = new Uint8Array(total);
      let o = 0;
      for (let i = 0; i < e.n; i++) { data.set(e.parts.get(i), o); o += e.parts.get(i).length; }
      const head = { ...e.head, t: String(e.head.t || "voice_chunk").replace(/_chunk$/, ""), id: vid };
      delete head.vid; delete head.seq; delete head.n;
      this.onEvent(head, data);
    }
  }
}
