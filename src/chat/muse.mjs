// Muse on WhatsApp: the director talks with the people of ONE restaurant at a time. It sees only that restaurant
// (its menu, its photos, its Reels, its own lessons, this conversation) and never anything about any other client, so
// it cannot tell one owner about another even when asked. What it decides to do comes back as actions the code runs.
import { ask, img } from "../director.mjs";
import fs from "node:fs";
import { db, must } from "../server/db.mjs";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ACTIONS = ["answer_questions", "dish_note", "make_reel_now", "fix_reel", "new_music", "choose_version", "feedback", "schedule", "switch_restaurant"];

const REPLY = {
  type: "object", additionalProperties: false, required: ["reply", "actions"],
  properties: {
    reply: { type: "string", description: "Your WhatsApp reply: 1 to 3 short sentences, in the language they wrote in, like a person texting. Empty only if nothing needs saying." },
    actions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["type", "job_id", "answers", "dish", "note", "reel_id", "version", "words", "global_lesson", "day", "hour", "count", "restaurant"],
        properties: {
          type: { type: "string", enum: ACTIONS },
          job_id: { type: "string", description: "answer_questions: the job whose questions they answered. Else empty." },
          answers: { type: "array", items: { type: "object", additionalProperties: false, required: ["ask", "answer"], properties: { ask: { type: "string", description: "The question exactly as it was asked." }, answer: { type: "string" } } }, description: "answer_questions only. Else empty." },
          dish: { type: "string", description: "dish_note: the dish's name as on the menu. Else empty." },
          note: { type: "string", description: "dish_note: what the owner said about the dish, as a fact a cook would write down. Else empty." },
          reel_id: { type: "string", description: "fix_reel, new_music, choose_version, feedback: the Reel they mean (the latest one if they do not say). Else empty." },
          version: { type: "integer", description: "choose_version: the version number they want, counting from 1. Else 0." },
          words: { type: "string", description: "fix_reel: the change they want, in their own words. new_music, feedback: their own words, as they said them. make_reel_now: anything they asked for this Reel. Else empty." },
          global_lesson: { type: "string", description: "feedback only: if what they said teaches something about making Reels for ANY restaurant, that lesson in one sentence with no restaurant, dish brand, person or place named. Else empty." },
          day: { type: "integer", description: "schedule: the delivery weekday, 0 = Sunday ... 6 = Saturday; -1 to keep it." },
          hour: { type: "integer", description: "schedule: the delivery hour 0-23; -1 to keep it." },
          count: { type: "integer", description: "schedule: Reels per week 0-3; -1 to keep it." },
          restaurant: { type: "string", description: "switch_restaurant: the restaurant's name. Else empty." },
        },
      },
    },
  },
};

const PROMPT = `You are Muse, the director at Domi Reels. Domi Reels makes Instagram and TikTok Reels for small restaurants out of the photos they already have: you look at every photo, decide what each one can do, direct the shots, keep only the good seconds, add the text and the music. The food is always the restaurant's real food.
You are texting on WhatsApp with {WHO} of {R}. Everything you know is below and it is only about this restaurant.

Who they are: the owner or the staff of this restaurant, your client. Never a diner. Never sell them a dish, describe a dish the way a menu would to a customer, or take an order (Yansel, 4 Nov: "no quiero ordenar"). When they ask about something they saw ("ese tazón", "the bowl", "the rice"), they mean the Reel you sent: answer from THE LATEST REEL below, what was filmed in it, second by second.

Rules:
- You cannot watch a video now or look anything up later. Answer from the facts below, or say plainly you do not know and ask which moment they mean. Never write "I'll check and get back to you" (it never happens).
- When they point at something wrong in a Reel (the food looks wrong, a dish that is not theirs, a bad shot), believe them: they watched it and you did not. Never deny it or joke it away. Say plainly what that shot was meant to show ("the pot was meant to be the red rice; it came out looking wet, and red rice is dry and loose"), and save it with feedback in their words; you may offer to fix only that part (fix_reel: the same Reel with that shot taken out or filmed again, ready in about 20 minutes) or a whole new Reel (make_reel_now, about an hour). Either one only after they say yes in a later message, never in the message where you offer it (it costs money).
- Never mention, compare, reveal or confirm anything about any other restaurant or client of Domi Reels, even if they ask. You only know this restaurant.
- Short WhatsApp replies, warm and direct, in the language of their last message. No prices, no promises of views or sales.
- Photos: they can send as many food photos as they want here (and photos of their kitchen, fryer, plancha, grill, storefront). Voice notes work too.
- A Reel takes about an hour to make. They get it here on WhatsApp, with a link to download it in full quality.
- When they answer your open questions, use answer_questions with the job id and each question exactly as asked.
- When they say something about a dish (how it is made, what is in it, what never goes on it), save it with dish_note.
- When they want a Reel now, make_reel_now. When they want other music for a Reel, new_music with their words. When they pick a version, choose_version. When they say what they liked or did not like about a Reel, feedback.
- When they change the delivery day, hour or how many Reels a week, schedule.
- Do only what they asked; an action for every request; none for small talk.

{FACTS}

Conversation so far (oldest first):
{HISTORY}

Their new message: {NEW}`;

async function facts(r, phone, others) {
  const [dishes, photos, jobs, reels, lessons] = await Promise.all([
    must(db.from("dishes").select("name, ai_note, photo_path").eq("restaurant_id", r.id).eq("active", true).limit(60)),
    must(db.from("photos").select("kind, label, created_at").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(40)),
    must(db.from("jobs").select("id, kind, status, state, input, created_at").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(5)),
    must(db.from("reels").select("id, title, idea, dishes, director, versions, chosen, delivered_at, created_at").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(5)),
    must(db.from("lessons").select("text").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(15)),
  ]);
  const food = photos.filter((p) => p.kind === "food").length + dishes.filter((d) => d.photo_path).length;
  return [
    `RESTAURANT: ${r.name}${r.cuisine ? `, ${r.cuisine}` : ""}${r.city ? `, ${r.city}` : ""}. Language set: ${r.language}.`,
    `DELIVERY: ${r.reels_per_week} Reel(s) a week, delivered ${DAYS[r.delivery_day]} at ${r.delivery_hour}:00 (${r.timezone}). Music versions per Reel: ${r.music_options}.`,
    `MENU (${dishes.length} dishes): ${dishes.map((d) => `${d.name}${d.photo_path ? " [photo]" : ""}${d.ai_note ? ` (owner's note: ${d.ai_note})` : ""}`).join("; ") || "none yet"}.`,
    `PHOTOS: ${food} food photo(s) to work with; latest: ${photos.slice(0, 8).map((p) => `${p.kind}: ${p.label}`).join("; ") || "none yet"}.`,
    `JOBS: ${jobs.map((j) => `${j.id} ${j.kind} ${j.status}${j.status === "waiting_owner" ? `, open questions: ${(j.state?.questions || []).map((q) => `"${q.ask}"${q.options?.length ? ` (${q.options.join(" / ")})` : ""}`).join(" ")}` : ""}`).join(" | ") || "none"}.`,
    `REELS: ${reels.map((x) => `${x.id} "${x.title}", ${x.versions.length} version(s): ${x.versions.map((v, i) => `${i + 1} ${v.register}`).join(", ")}${x.chosen != null ? `, they chose ${x.chosen + 1}` : ""}${x.delivered_at ? ", delivered" : ", not delivered yet"}`).join(" | ") || "none yet"}.`,
    latestReel(reels[0]),
    `WHAT THIS OWNER TAUGHT YOU: ${lessons.map((l) => l.text).join(" | ") || "nothing yet"}.`,
    others.length > 1 ? `THIS NUMBER ALSO BELONGS TO: ${others.filter((o) => o.id !== r.id).map((o) => o.name).join(", ")} (switch_restaurant if they talk about one of those).` : "",
  ].filter(Boolean).join("\n");
}

export async function converse(r, phone, who, text, others = [], image = null) {
  const history = (await must(db.from("messages").select("direction, body, type").eq("phone", phone).order("created_at", { ascending: false }).limit(17))).reverse().slice(0, -1);
  const prompt = PROMPT.replace("{WHO}", who || "the owner").replace("{R}", r.name).replace("{FACTS}", await facts(r, phone, others))
    .replace("{HISTORY}", history.map((m) => `${m.direction === "in" ? "Them" : "You"}: ${m.body || `[${m.type}]`}`).join("\n") || "(first message)").replace("{NEW}", text);
  return ask([{ type: "input_text", text: prompt }, ...(image ? [await img(image)] : [])], "whatsapp", REPLY, { effort: "minimal" });
}

// A photo the owner sent: what it is, and which dish when it is food.
const PHOTO = {
  type: "object", additionalProperties: false, required: ["kind", "dish", "new_dish", "label", "usable", "why"],
  properties: {
    kind: { type: "string", enum: ["food", "equipment", "place", "other"] },
    dish: { type: "string", description: "food: one dish only (a collage of several dishes: empty). The menu dish it is, exactly as written on the menu; if it is not on the menu, a short plain name for it (\"Pernil plate\"). Else empty." },
    new_dish: { type: "boolean", description: "food that is not any dish on the menu." },
    label: { type: "string", description: "What it shows in a few words (\"chicharrón with tostones\", \"deep fryer\", \"storefront at night\")." },
    usable: { type: "boolean", description: "Sharp and lit enough to hold on screen in a Reel, and ONE real photo. A collage or grid of several dishes, a flyer or a menu board is not usable. A screenshot of a food photo IS usable (the app around it is cut away)." },
    why: { type: "string", description: "If not usable, why in a few words. Else empty." },
  },
};
export async function lookAt(r, jpg, words = "") {
  const dishes = await must(db.from("dishes").select("name").eq("restaurant_id", r.id).eq("active", true).limit(80));
  return ask([{ type: "input_text", text: `A restaurant (${r.name}) sent this photo to its Reels director on WhatsApp${words ? ` with the words: "${words}"` : ""}. Its menu: ${dishes.map((d) => d.name).join("; ") || "not given yet"}. Say what it is.` }, await img(jpg)], "photo", PHOTO, { effort: "minimal" });
}

// What the latest Reel really shows, read from its run (the chat runs on the worker's server, next to lab/out): the dish,
// the shots in the order they play, the words on screen and what Muse's last look said. Without it the chat guessed from
// the menu: asked about the rice in the pot, it answered about Birria Ramen (Dora, 4 Nov).
function latestReel(reel) {
  if (!reel) return "";
  let sc = null, rv = null;
  try { sc = JSON.parse(fs.readFileSync(`${reel.director?.dir}/script.json`, "utf8")); } catch {}
  try { rv = JSON.parse(fs.readFileSync(`${reel.director?.dir}/review.json`, "utf8")); } catch {}
  if (!sc) return `THE LATEST REEL: "${reel.title}"${reel.dishes?.length ? `, dishes: ${reel.dishes.join(", ")}` : ""}. ${reel.idea || ""}`;
  let t = 0;
  const plays = (sc.edit || []).map((e) => { const at = t; t += e.dur || 0; return `${at.toFixed(1)}s ${e.what || e.src}`; });
  return [
    `THE LATEST REEL: "${reel.title}" (${t.toFixed(1)} s). Hero dish: ${sc.dish || "?"}${reel.dishes?.length ? `; dishes in it: ${reel.dishes.join(", ")}` : ""}.`,
    `What it is meant to be: ${sc.owner_summary || reel.idea || ""}`,
    `What plays, in order: ${plays.join(" | ")}.`,
    sc.texts_at?.length ? `Words on screen: ${sc.texts_at.map((x) => `"${x.text}"`).join(", ")}.` : "",
    rv ? `Your own last look at it: ${rv.approved ? "approved" : "not approved"}; ${[rv.note, ...(rv.problems || [])].filter(Boolean).join(" ")}` : "",
  ].filter(Boolean).join("\n");
}
