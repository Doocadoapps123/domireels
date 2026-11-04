// Domi Reels' WhatsApp webhook, on the worker's server behind Caddy (deploy/Caddyfile). Meta must hear 200 at once, so
// each message is answered after the reply, one at a time per phone so a burst of photos keeps its order.
// GET  /whatsapp  Meta's verification (hub.verify_token = WA_VERIFY_TOKEN)
// POST /whatsapp  messages; the signature (X-Hub-Signature-256, the Meta app's secret) must match
// Usage: node --env-file=../.env src/chat/server.mjs
import http from "node:http";
import crypto from "node:crypto";
import { handle, resume } from "./handle.mjs";

const PORT = +process.env.CHAT_PORT || 8787, queues = new Map(), pending = new Map(), albums = new Map();
const log = (...a) => console.log(new Date().toISOString(), ...a);

function signed(raw, header) {
  if (!header?.startsWith("sha256=")) return false;
  const want = crypto.createHmac("sha256", process.env.META_WA_APP_SECRET).update(raw).digest("hex");
  return header.length === want.length + 7 && crypto.timingSafeEqual(Buffer.from(header.slice(7)), Buffer.from(want));
}

// pending: messages from this phone not handled yet, so a photo in an album knows more are coming behind it.
function enqueue(phone, fn) {
  pending.set(phone, (pending.get(phone) || 0) + 1);
  const next = (queues.get(phone) || Promise.resolve()).then(fn).catch((e) => log(`${phone}: ${e.stack || e.message}`))
    .finally(() => pending.set(phone, pending.get(phone) - 1) || pending.delete(phone));
  queues.set(phone, next);
  next.finally(() => queues.get(phone) === next && queues.delete(phone));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") return res.end("ok");
  if (url.pathname !== "/whatsapp") { res.statusCode = 404; return res.end(); }
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN;
    res.statusCode = ok ? 200 : 403;
    return res.end(ok ? url.searchParams.get("hub.challenge") : "");
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  if (!signed(raw, req.headers["x-hub-signature-256"])) { log("bad signature"); res.statusCode = 403; return res.end(); }
  res.end("ok");
  let body;
  try { body = JSON.parse(raw); } catch { return; }
  for (const e of body.entry || []) for (const c of e.changes || []) {
    const v = c.value || {};
    if (v.metadata?.phone_number_id !== process.env.WA_PHONE_ID) continue;
    for (const m of v.messages || []) {
      const contact = (v.contacts || []).find((x) => x.wa_id === m.from);
      if (m.type !== "image") { enqueue(m.from, () => handle(m, contact, { more: () => (pending.get(m.from) || 0) > 1 })); continue; }
      // Photos are looked at all at once, not one after another: an album of 6 takes as long as one. The photo that
      // finishes last (last() counts down without a gap) is the one Muse answers.
      albums.set(m.from, (albums.get(m.from) || 0) + 1);
      let counted = false;
      const last = () => { if (counted) return false; counted = true; const n = albums.get(m.from) - 1; albums.set(m.from, n); return n === 0; };
      handle(m, contact, { last }).catch((e) => log(`${m.from}: ${e.stack || e.message}`)).finally(() => last());
    }
    for (const s of v.statuses || []) if (s.status === "failed") log(`message to ${s.recipient_id} failed: ${JSON.stringify(s.errors)}`);
  }
}).listen(PORT, "127.0.0.1", () => { log(`whatsapp webhook on :${PORT}`); resume().catch((e) => log(`resume: ${e.message}`)); });
