// One WhatsApp message to Domi Reels, from Meta's webhook (src/chat/server.mjs). Only numbers a restaurant added get
// an answer; everyone else hears that Domi Reels is by invitation only. Photos are saved and looked at, voice notes
// become text (Muse Voice Transcribe), and Muse answers and acts (src/chat/muse.mjs).
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import sharp from "sharp";
import { db, must, upload } from "../server/db.mjs";
import * as wa from "../server/whatsapp.mjs";
import { converse, lookAt } from "./muse.mjs";
import { transcribe } from "../transcribe.mjs";

const G = "https://graph.facebook.com/v21.0", auth = () => ({ Authorization: `Bearer ${process.env.META_WA_TOKEN}` });
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function media(id) {
  const meta = await (await fetch(`${G}/${id}`, { headers: auth() })).json();
  if (!meta.url) throw new Error(`media ${id}: ${JSON.stringify(meta).slice(0, 200)}`);
  return { buf: Buffer.from(await (await fetch(meta.url, { headers: auth() })).arrayBuffer()), mime: meta.mime_type };
}
// Blue ticks and "typing..." while Muse thinks.
const seen = (id) => fetch(`${G}/${process.env.WA_PHONE_ID}/messages`, { method: "POST", headers: { ...auth(), "Content-Type": "application/json" },
  body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: id, typing_indicator: { type: "text" } }) }).catch(() => {});

const textOf = (m) => m.text?.body || m.image?.caption || m.interactive?.button_reply?.title || m.button?.text || "";

async function stranger(phone) {
  const recent = await must(db.from("messages").select("id").eq("phone", phone).eq("direction", "out").gte("created_at", new Date(Date.now() - 12 * 3600e3).toISOString()).limit(1));
  if (recent.length) return;
  await wa.text(phone, `Hi! Domi Reels is by invitation only. If you have an invitation code, sign up at ${process.env.DR_PUBLIC_URL}/signup and add this number to your restaurant.\n\nHola! Domi Reels es solo por invitación. Si tienes un código, regístrate en ${process.env.DR_PUBLIC_URL}/signup y agrega este número a tu restaurante.`);
}

async function nextDishNumber(r) {
  const ids = await must(db.from("dishes").select("external_id").eq("restaurant_id", r.id));
  return String(Math.max(0, ...ids.map((d) => +d.external_id || 0)) + 1);
}

// A photo: saved, looked at by Muse, and tied to its dish (a dish the menu does not have yet is added with it).
async function savePhoto(r, phone, m) {
  const { buf } = await media(m.image.id), jpg = await sharp(buf).rotate().jpeg({ quality: 92 }).toBuffer();
  const sha1 = crypto.createHash("sha1").update(jpg).digest("hex"), path = `${r.id}/whatsapp/${sha1}.jpg`;
  const [dup] = await must(db.from("photos").select("id, kind, label").eq("restaurant_id", r.id).eq("sha1", sha1));
  if (dup) return { ...dup, dup: true, jpg };
  await upload("photos", path, jpg, "image/jpeg");
  const look = await lookAt(r, jpg, m.image.caption || "");
  let dish = null;
  if (look.kind === "food" && look.dish) {
    [dish] = await must(db.from("dishes").select("id, photo_path").eq("restaurant_id", r.id).ilike("name", look.dish).limit(1));
    if (!dish && look.usable) [dish] = await must(db.from("dishes").insert({ restaurant_id: r.id, external_id: await nextDishNumber(r), name: look.dish, photo_path: path }).select("id, photo_path"));
    else if (dish && !dish.photo_path && look.usable) await must(db.from("dishes").update({ photo_path: path, updated_at: new Date().toISOString() }).eq("id", dish.id));
  }
  await must(db.from("photos").insert({ restaurant_id: r.id, path, source: "whatsapp", dish_id: dish?.id || null, kind: look.kind, label: look.label + (look.usable ? "" : ` (not usable: ${look.why})`), sha1, from_phone: phone }));
  return { ...look, jpg };
}

async function act(r, phone, actions, restaurants) {
  const notes = [];
  for (const a of actions) {
    if (a.type === "answer_questions" && a.job_id) {
      const [job] = await must(db.from("jobs").select("*").eq("id", a.job_id).eq("restaurant_id", r.id).eq("status", "waiting_owner"));
      if (!job) continue;
      const answers = { ...(job.state.answers || {}), ...Object.fromEntries(a.answers.map((x) => [x.ask, x.answer])) };
      const done = (job.state.questions || []).every((q) => answers[q.ask]);
      await must(db.from("jobs").update({ state: { ...job.state, answers }, status: done ? "queued" : "waiting_owner", updated_at: new Date().toISOString() }).eq("id", job.id));
      for (const x of a.answers) await db.from("lessons").insert({ scope: "restaurant", restaurant_id: r.id, text: `Asked "${x.ask}", the owner answered: ${x.answer}`, source: "whatsapp" });
    }
    if (a.type === "dish_note" && a.dish && a.note) {
      const [d] = await must(db.from("dishes").select("id, ai_note").eq("restaurant_id", r.id).ilike("name", `%${a.dish}%`).limit(1));
      if (d) await must(db.from("dishes").update({ ai_note: [d.ai_note, a.note].filter(Boolean).join(" "), updated_at: new Date().toISOString() }).eq("id", d.id));
      else await db.from("lessons").insert({ scope: "restaurant", restaurant_id: r.id, text: `${a.dish}: ${a.note}`, source: "whatsapp" });
    }
    if (a.type === "make_reel_now") {
      const open = await must(db.from("jobs").select("id").eq("restaurant_id", r.id).eq("kind", "reel").in("status", ["queued", "running", "waiting_owner"]));
      const food = await must(db.from("dishes").select("id").eq("restaurant_id", r.id).not("photo_path", "is", null).limit(1));
      if (open.length) notes.push("busy");
      else if (!food.length) notes.push("nophotos");
      else {
        const week = new Intl.DateTimeFormat("en-CA", { timeZone: r.timezone }).format(new Date());
        const same = await must(db.from("jobs").select("id").eq("restaurant_id", r.id).eq("kind", "reel").eq("week", week));
        await must(db.from("jobs").insert({ restaurant_id: r.id, kind: "reel", week, input: { pick: same.length, now: true, asked: a.words || "" } }));
      }
    }
    if (a.type === "new_music") {
      const reel = await latestReel(r, a.reel_id);
      if (reel) await must(db.from("jobs").insert({ restaurant_id: r.id, kind: "remusic", input: { reel_id: reel.id, words: a.words } }));
    }
    if (a.type === "choose_version") {
      const reel = await latestReel(r, a.reel_id), i = a.version - 1;
      if (reel && reel.versions[i]) {
        await must(db.from("reels").update({ chosen: i }).eq("id", reel.id));
        await db.from("lessons").insert({ scope: "restaurant", restaurant_id: r.id, text: `Owner chose the ${reel.versions[i].register} score over ${reel.versions.filter((_, j) => j !== i).map((v) => v.register).join(", ")} for "${reel.title}"`, source: "whatsapp" });
      }
    }
    if (a.type === "feedback" && a.words) {
      const reel = await latestReel(r, a.reel_id);
      await db.from("lessons").insert({ scope: "restaurant", restaurant_id: r.id, text: `On "${reel?.title || "a Reel"}", the owner said: ${a.words}`, source: "whatsapp" });
      if (a.global_lesson) await db.from("lessons").insert({ scope: "global", text: a.global_lesson, source: "whatsapp" });
    }
    if (a.type === "schedule") {
      const x = {};
      if (a.day >= 0 && a.day <= 6) x.delivery_day = a.day;
      if (a.hour >= 0 && a.hour <= 23) x.delivery_hour = a.hour;
      if (a.count >= 0 && a.count <= 3) x.reels_per_week = a.count;
      if (Object.keys(x).length) await must(db.from("restaurants").update(x).eq("id", r.id));
    }
    if (a.type === "switch_restaurant" && a.restaurant) {
      const to = restaurants.find((x) => x.name.toLowerCase().includes(a.restaurant.toLowerCase()));
      if (to) await must(db.from("conversations").upsert({ phone, restaurant_id: to.id, updated_at: new Date().toISOString() }));
    }
  }
  return notes;
}
const latestReel = async (r, id) => (await must(db.from("reels").select("*").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(5))).find((x) => !id || x.id === id) || null;

export async function handle(m, contact) {
  const phone = m.from;
  const { error } = await db.from("messages").insert({ phone, direction: "in", type: m.type, body: textOf(m) || null, wa_id: m.id });
  if (error?.code === "23505") return; // Meta sent it again
  if (error) throw new Error(error.message);
  const rows = await must(db.from("members").select("restaurant_id, role, name, restaurants(*)").eq("phone", phone));
  if (!rows.length) return stranger(phone);
  seen(m.id);
  const restaurants = rows.map((x) => x.restaurants), [conv] = await must(db.from("conversations").select("*").eq("phone", phone));
  const r = restaurants.find((x) => x.id === conv?.restaurant_id) || restaurants[0], who = rows.find((x) => x.restaurant_id === r.id)?.name || contact?.profile?.name || "";
  await must(db.from("messages").update({ restaurant_id: r.id }).eq("wa_id", m.id));
  if (!conv) await must(db.from("conversations").insert({ phone, restaurant_id: r.id }));

  // A tap on "I want #2" under a version of the Reel.
  const tap = m.interactive?.button_reply?.id || m.button?.payload || "";
  if (tap.startsWith("music:")) {
    const [, reelId, i] = tap.split(":");
    const ok = await act(r, phone, [{ type: "choose_version", reel_id: reelId, version: +i + 1 }], restaurants);
    const reel = await latestReel(r, reelId);
    return wa.text(phone, r.language === "es" ? `Listo, quedó la ${+i + 1} (${reel?.versions[+i]?.register}). Ya aprendí tu gusto.` : `Done, #${+i + 1} it is (${reel?.versions[+i]?.register}). I'll remember your taste.`, r.id);
  }

  let text = textOf(m), image = null;
  if (m.type === "image") {
    const p = await savePhoto(r, phone, m);
    // Several photos arrive together: Muse answers the first one; the rest are saved quietly.
    const burst = await must(db.from("messages").select("id").eq("phone", phone).eq("type", "image").eq("direction", "in").gte("created_at", new Date(Date.now() - 60e3).toISOString()));
    if (burst.length > 1 && !m.image.caption) return;
    text = `[sent a photo${m.image.caption ? ` with the words "${m.image.caption}"` : ""}. You looked at it: ${p.dup ? "already had it" : `${p.kind}${p.dish ? `, ${p.dish}${p.new_dish ? " (new on the menu, you added it)" : ""}` : ""}: ${p.label}${p.usable === false ? `; not usable in a Reel (${p.why})` : ""}`}]`;
    image = p.jpg;
  } else if (m.type === "audio") {
    const { buf } = await media(m.audio.id), f = `${os.tmpdir()}/${m.id}.ogg`;
    fs.writeFileSync(f, buf);
    try { text = await transcribe(f, { languages: r.language === "es" ? ["Spanish", "English"] : ["English", "Spanish"] }); } finally { fs.rmSync(f, { force: true }); }
    await must(db.from("messages").update({ body: `[voice] ${text}` }).eq("wa_id", m.id));
  } else if (!text) {
    return wa.text(phone, r.language === "es" ? "Mándame fotos de tu comida o notas de voz, con eso trabajo." : "Send me photos of your food or voice notes, that's what I work with.", r.id);
  }

  const out = await converse(r, phone, who, text, restaurants, image);
  const notes = await act(r, phone, out.actions, restaurants);
  let reply = out.reply;
  if (notes.includes("busy")) reply = r.language === "es" ? "Ya estoy haciendo un Reel para ti, te aviso cuando esté." : "I'm already making a Reel for you, I'll text you when it's ready.";
  if (notes.includes("nophotos")) reply = r.language === "es" ? "Para hacer el Reel necesito fotos de tu comida. Mándamelas aquí." : "I need photos of your food to make the Reel. Send them here.";
  if (reply) await wa.text(phone, reply, r.id);
  log(`${phone} @ ${r.name}: ${text.slice(0, 80)} -> ${out.actions.map((a) => a.type).join(", ") || "reply"}`);
}
