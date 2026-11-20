// The same encrypted protocol as the Windows kitten (app/link.py): pairing code -> key (PBKDF2), topic, room,
// AES-256-GCM sealed messages. Works in Safari / Chrome and in Node 18+ (WebCrypto).
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SERVERS = { CN: "broker-cn.emqx.io", GL: "broker.emqx.io" };
export const PROTOCOL = 1;
export const CHUNK = 32 * 1024;

export class CodeError extends Error {}

export function parseCode(text) {
  let raw = [...String(text || "").toUpperCase()].filter((c) => /[A-Z0-9]/.test(c)).join("");
  let server = "CN";
  if (raw.length === 18 && SERVERS[raw.slice(0, 2)]) {
    server = raw.slice(0, 2);
    raw = raw.slice(2);
  }
  if (raw.length !== 16 || [...raw].some((c) => !ALPHABET.includes(c))) throw new CodeError("bad code");
  return { server, body: raw };
}

export function formatCode(server, body) {
  return `${server}-` + [0, 4, 8, 12].map((i) => body.slice(i, i + 4)).join("-");
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256hex(bytes) {
  return hex(await subtle.digest("SHA-256", bytes));
}

function concat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export class Crypto {
  static async create(body) {
    const c = new Crypto();
    const base = await subtle.importKey("raw", enc.encode(body), "PBKDF2", false, ["deriveBits"]);
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: enc.encode("couple-kitten/v1"), iterations: 120000 }, base, 256);
    c.keyBytes = new Uint8Array(bits);
    const tag = async (t) => sha256hex(concat(enc.encode(t), c.keyBytes));
    c.topic = "ck1/" + (await tag("topic|")).slice(0, 24);
    c.room = "xiaomao-" + (await tag("room|")).slice(0, 16);
    c.aad = enc.encode(c.topic);
    c.key = await subtle.importKey("raw", c.keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
    return c;
  }

  async seal(header, body = new Uint8Array(0)) {
    const hb = enc.encode(JSON.stringify(header));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, hb.length);
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: this.aad },
      this.key, concat(len, hb, body)));
    return concat(Uint8Array.of(PROTOCOL), nonce, ct);
  }

  async open(data) {
    data = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (data.length < 1 + 12 + 16 + 4 || data[0] !== PROTOCOL) throw new Error("not a kitten message");
    const pt = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: data.slice(1, 13), additionalData: this.aad },
      this.key, data.slice(13)));
    const n = new DataView(pt.buffer, pt.byteOffset).getUint32(0);
    return { header: JSON.parse(dec.decode(pt.slice(4, 4 + n))), body: pt.slice(4 + n) };
  }
}

export function webCallUrl(room, video, myName) {
  // same as the computer (common.web_call_url), so both end up in the same room
  const cfg = ["config.prejoinConfig.enabled=false"];
  if (!video) cfg.push("config.startWithVideoMuted=true");
  cfg.push("userInfo.displayName=" + encodeURIComponent(JSON.stringify(myName || "")));
  return "https://meet.ffmuc.net/" + room + "#" + cfg.join("&");
}

export function randomId(n = 12) {
  return hex(globalThis.crypto.getRandomValues(new Uint8Array(Math.ceil(n / 2)))).slice(0, n);
}
