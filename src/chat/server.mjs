// Domi Reels' WhatsApp webhook, on the worker's server behind Caddy (deploy/Caddyfile). Meta must hear 200 at once, so
// each message is answered after the reply, one at a time per phone so a burst of photos keeps its order.
// GET  /whatsapp  Meta's verification (hub.verify_token = WA_VERIFY_TOKEN)
// POST /whatsapp  messages; the signature (X-Hub-Signature-256, the Meta app's secret) must match
// Usage: node --env-file=../.env src/chat/server.mjs
import http from "node:http";
import crypto from "node:crypto";
import { handle } from "./handle.mjs";

const PORT = +process.env.CHAT_PORT || 8787, queues = new Map();
const log = (...a) => console.log(new Date().toISOString(), ...a);

function signed(raw, header) {
  if (!header?.startsWith("sha256=")) return false;
  const want = crypto.createHmac("sha256", process.env.META_WA_APP_SECRET).update(raw).digest("hex");
  return header.length === want.length + 7 && crypto.timingSafeEqual(Buffer.from(header.slice(7)), Buffer.from(want));
}

function enqueue(phone, fn) {
  const next = (queues.get(phone) || Promise.resolve()).then(fn).catch((e) => log(`${phone}: ${e.stack || e.message}`));
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
    for (const m of v.messages || []) enqueue(m.from, () => handle(m, (v.contacts || []).find((x) => x.wa_id === m.from)));
    for (const s of v.statuses || []) if (s.status === "failed") log(`message to ${s.recipient_id} failed: ${JSON.stringify(s.errors)}`);
  }
}).listen(PORT, "127.0.0.1", () => log(`whatsapp webhook on :${PORT}`));
