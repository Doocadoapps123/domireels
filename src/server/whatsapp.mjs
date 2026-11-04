// Domi Reels' own WhatsApp number. Inside the 24 hours after the owner last wrote, any message goes; after that only an
// approved template does (Meta's rule), so every send checks the window first.
import { db, must } from "./db.mjs";

const G = "https://graph.facebook.com/v21.0";

async function post(to, payload, log) {
  const r = await fetch(`${G}/${process.env.WA_PHONE_ID}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.META_WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`whatsapp ${r.status}: ${j.error?.message || JSON.stringify(j).slice(0, 300)}`);
  await db.from("messages").insert({ phone: to, restaurant_id: log.restaurant_id || null, direction: "out", type: payload.type, body: log.body || null, wa_id: j.messages?.[0]?.id || null });
  return j;
}

export async function inWindow(phone) {
  const [last] = await must(db.from("messages").select("created_at").eq("phone", phone).eq("direction", "in").order("created_at", { ascending: false }).limit(1));
  return !!last && Date.now() - new Date(last.created_at).getTime() < 23.5 * 3600 * 1000;
}

export const text = (to, body, restaurant_id) => post(to, { type: "text", text: { body, preview_url: true } }, { body, restaurant_id });
export const video = (to, link, caption, restaurant_id) => post(to, { type: "video", video: { link, caption } }, { body: caption, restaurant_id });
export const image = (to, link, caption, restaurant_id) => post(to, { type: "image", image: { link, caption } }, { body: caption, restaurant_id });
// Up to 3 reply buttons, titles of 20 characters at most. header: { type: "video" | "image", link }.
export const buttons = (to, body, list, restaurant_id, header) => post(to, {
  type: "interactive",
  interactive: {
    type: "button", ...(header ? { header: { type: header.type, [header.type]: { link: header.link } } } : {}),
    body: { text: body }, action: { buttons: list.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
  },
}, { body, restaurant_id });
// An approved template, for when the owner has not written in the last 24 hours.
export const template = (to, name, lang, params, restaurant_id) => post(to, {
  type: "template", template: { name, language: { code: lang }, components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: String(t) })) }] },
}, { body: `[${name}] ${params.join(" | ")}`, restaurant_id });
