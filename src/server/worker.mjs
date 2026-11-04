// The worker: the machine that makes the Reels (Hetzner, systemd). It never waits on a person. Every 15 seconds:
//   schedule   each restaurant's Reels are made the day before its delivery day, in its own timezone
//   deliver    a finished Reel goes out at its hour: to the owner on WhatsApp, or to its platform's drop
//   work       the oldest queued job runs through the same pipeline the lab uses (lab/friday.mjs, lab/auto.mjs)
// Muse's questions put a job to sleep (waiting_owner) until the owner answers on WhatsApp (web/app/api/whatsapp).
// Usage: node --env-file=../.env src/server/worker.mjs [--once]
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { db, must, upload, signed, reelLink } from "./db.mjs";
import { kitFor, kitDir } from "./kits.mjs";
import * as wa from "./whatsapp.mjs";
import { layoutKit } from "../kit.mjs";
import { sortAssets } from "../assets.mjs";
import { readMenu } from "../menu.mjs";
import { deliver } from "../drop.mjs";
import { spent } from "../video.mjs";
import { probe } from "../edit.mjs";
import { ensureEquipment } from "./equipment.mjs";
import { importWebsite } from "./website.mjs";

const WORKER = `${os.hostname()}:${process.pid}`, LEDGER = "lab/out/ledger.jsonl", LOGS = "lab/out/jobs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
fs.mkdirSync(LOGS, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

// --- time, in the restaurant's own timezone ---------------------------------------------------------------------
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function local(tz, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, dow: DAYS.indexOf(p.weekday), hour: +p.hour };
}
// The instant a wall-clock hour on a date is in a timezone.
function zoned(date, hour, tz) {
  const guess = Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  const l = local(tz, new Date(guess)), off = Date.parse(`${l.date}T${String(l.hour).padStart(2, "0")}:00:00Z`) - guess;
  return new Date(guess - off);
}
// The next delivery time after now: the restaurant's day, at its hour.
function nextDelivery(r, from = new Date()) {
  for (let i = 0; i < 8; i++) {
    const d = new Date(from.getTime() + i * 86400000), l = local(r.timezone, d);
    if (l.dow !== r.delivery_day) continue;
    const at = zoned(l.date, r.delivery_hour, r.timezone);
    if (at > from) return at;
  }
  return from;
}

// --- child runs of the pipeline ---------------------------------------------------------------------------------
function run(args, { env = {}, job }) {
  return new Promise((resolve) => {
    const out = fs.createWriteStream(`${LOGS}/${job.id}.log`, { flags: "a" });
    out.write(`\n$ node ${args.join(" ")}\n`);
    const p = spawn("node", args, { env: { ...process.env, ...env } });
    let result = null, tail = "";
    const take = (b) => {
      out.write(b);
      tail = (tail + b.toString()).slice(-20000);
      for (const line of tail.split("\n")) if (line.startsWith("RESULT ")) try { result = JSON.parse(line.slice(7)); } catch {}
    };
    p.stdout.on("data", take);
    p.stderr.on("data", take);
    p.on("close", (code) => { out.end(); resolve({ code, result, tail: tail.slice(-1500) }); });
  });
}

const one = async (q) => (await must(q))[0];
const jobUpdate = (id, x) => must(db.from("jobs").update({ ...x, updated_at: new Date().toISOString() }).eq("id", id));
const membersOf = (r) => must(db.from("members").select("*").eq("restaurant_id", r.id));
const T = (r, en, es) => (r.language === "es" ? es : en);

// --- schedule ---------------------------------------------------------------------------------------------------
let lastSchedule = 0;
async function schedule() {
  if (Date.now() - lastSchedule < 10 * 60 * 1000) return;
  lastSchedule = Date.now();
  const rs = await must(db.from("restaurants").select("*").eq("active", true).gt("reels_per_week", 0));
  for (const r of rs) {
    const now = local(r.timezone);
    // Made the day before it is delivered, from 9 AM, so Muse's questions have a day to be answered.
    if (now.dow !== (r.delivery_day + 6) % 7 || now.hour < 9) continue;
    // A Reel the owner asked for today does not count as the week's: only the scheduled ones do.
    const made = await must(db.from("jobs").select("id, input").eq("restaurant_id", r.id).eq("kind", "reel").eq("week", now.date));
    if (made.some((j) => j.input?.scheduled)) continue;
    const rows = Array.from({ length: r.reels_per_week }, (_, i) => ({ restaurant_id: r.id, kind: "reel", week: now.date, input: { pick: made.length + i, scheduled: true } }));
    await must(db.from("jobs").insert(rows));
    log(`scheduled ${rows.length} for ${r.name} (${now.date})`);
  }
}

// --- the reel ---------------------------------------------------------------------------------------------------
async function makeReel(job, r, account) {
  if (job.input?.fix) return fixReel(job, r, account);
  const dir = kitDir(r, account), week = job.week || local(r.timezone).date, weekFile = `${dir}/week-${week}.json`;
  fs.mkdirSync(dir, { recursive: true });
  await layoutKit(await kitFor(r, account), dir);
  await sortAssets(dir);
  if (!readMenu(dir).items.length) throw new Error("no dish with a photo yet");
  if (!fs.existsSync(weekFile)) {
    // Equipment it has no photo of: Muse finds free footage for it before the week is planned.
    const eq = await ensureEquipment(dir, { restaurantId: r.id }).catch((e) => ({ error: e.message }));
    fs.appendFileSync(`${LOGS}/${job.id}.log`, `equipment: ${JSON.stringify(eq)}\n`);
    const p = await run(["lab/friday.mjs", dir], { env: { NO_PULL: "1", WEEK: week }, job });
    if (!fs.existsSync(weekFile)) throw new Error(`the week was not planned: ${p.tail}`);
  }
  // The owner's answers to Muse's questions go where the run stopped.
  if (job.state?.answers && job.state?.dir) fs.writeFileSync(`${job.state.dir}/answers.json`, JSON.stringify(job.state.answers, null, 2) + "\n");
  // What owners taught through Domi Reels: every global lesson (no names in them) and this restaurant's own.
  const lessons = [...(await must(db.from("lessons").select("text").eq("scope", "global"))).map((l) => l.text),
    ...(await must(db.from("lessons").select("text").eq("restaurant_id", r.id))).map((l) => `This restaurant's owner: ${l.text}`)];
  fs.writeFileSync(`${LOGS}/${job.id}.lessons.json`, JSON.stringify(lessons));
  const env = { DR_LESSONS: `${LOGS}/${job.id}.lessons.json`, ...(account.kind === "platform" ? { NO_QUESTIONS: "1" } : {}) };
  const p = await run(["lab/auto.mjs", dir, String(job.input?.pick ?? 0), String(job.spend_cap), weekFile], { env, job });
  const prefix = `lab/out/auto/${dir.split("/").pop()}-w${week}`;
  await jobUpdate(job.id, { spent: +spent(LEDGER, prefix).toFixed(2) });
  const res = p.result;
  if (!res) throw new Error(`the run ended without a result (exit ${p.code}): ${p.tail}`);

  if (res.stop === "questions") {
    await jobUpdate(job.id, { status: "waiting_owner", state: { ...job.state, dir: res.dir, questions: res.questions, answers: undefined } });
    await askOwner(r, res.questions);
    return;
  }
  if (res.stop !== "done") throw new Error(`no Reel: ${res.stop}${res.failed ? ` (${res.failed.join(", ")})` : ""}`);
  await publish(job, r, account, dir, res.dir, weekFile);
  await jobUpdate(job.id, { status: "done", spent: +spent(LEDGER, prefix).toFixed(2) });
}

// The owner asked on WhatsApp to change one part of a Reel they have ("the rice looks like soup"): the same run, the
// takes already paid for kept, only the shots Muse picks from their words come out or are filmed again (lab/fix.mjs).
// It arrives as a new Reel with the music it had.
async function fixReel(job, r, account) {
  const [old] = await must(db.from("reels").select("*").eq("id", job.input.fix).eq("restaurant_id", r.id));
  const d = old?.director || {};
  if (!d.dir || !d.kit || !d.week || !fs.existsSync(`${d.dir}/script.json`)) throw new Error("no Reel: that Reel cannot be fixed (its run is not here)");
  const lessons = [...(await must(db.from("lessons").select("text").eq("scope", "global"))).map((l) => l.text),
    ...(await must(db.from("lessons").select("text").eq("restaurant_id", r.id))).map((l) => `This restaurant's owner: ${l.text}`)];
  fs.writeFileSync(`${LOGS}/${job.id}.lessons.json`, JSON.stringify(lessons));
  const p = await run(["lab/fix.mjs", d.dir, d.kit, d.week, job.input.words || ""], { env: { FIX: "1", NO_QUESTIONS: "1", DR_LESSONS: `${LOGS}/${job.id}.lessons.json` }, job });
  const res = p.result;
  if (!res) throw new Error(`no Reel: the fix ended without a result (exit ${p.code}): ${p.tail}`);
  if (res.stop !== "done") throw new Error(`no Reel: ${res.stop}`);
  await publish(job, r, account, d.kit, d.dir, d.week);
  await jobUpdate(job.id, { status: "done", spent: +spent(LEDGER, `${d.dir}/`).toFixed(2), state: { ...job.state, fix: res.fix } });
}

async function askOwner(r, questions) {
  const lines = questions.map((q, i) => `${i + 1}. ${q.ask}${q.options?.length ? ` (${q.options.join(" / ")})` : ""}`).join("\n");
  for (const m of await membersOf(r)) {
    if (await wa.inWindow(m.phone)) await wa.text(m.phone, T(r, `Before I make ${r.name}'s Reel I need to know:\n${lines}\nJust answer here, a voice note works too.`, `Antes de hacer el Reel de ${r.name} necesito saber:\n${lines}\nContéstame aquí, también vale una nota de voz.`), r.id);
    else await wa.template(m.phone, "reel_question", r.language === "es" ? "es" : "en", [r.name, questions.map((q) => q.ask).join(" ")], r.id);
  }
}

// A phone-sized copy for WhatsApp (16 MB at most); the full-quality file stays for the download.
// The delivered master: the render is 40-55 MB (Santia's, 4 Nov, went over storage's 50 MB a file and was lost after
// Muse approved it). H.264 CRF 18 capped at 14 Mb/s (about 20 MB for 12 s) keeps it visually the same; Instagram encodes it again anyway.
function master(src, to) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-c:v", "libx264", "-crf", "18", "-maxrate", "14M", "-bufsize", "28M", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", to]);
  return to;
}
function phone(src, to) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-c:v", "libx264", "-crf", "24", "-preset", "medium", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", to]);
  return to;
}

export async function publish(job, r, account, kit, dir, weekFile) {
  const script = read(`${dir}/script.json`), menu = readMenu(kit), id = crypto.randomUUID(), base = `${r.id}/${id}`;
  // The owner who deals with us directly chooses the music among a few scores; a platform gets the one Muse chose.
  let versions = [{ register: script.music?.register || "", file: `${dir}/final.mp4` }];
  if (account.kind === "owner" && r.music_options > 1 && !job.input?.fix) {
    const v = await run(["lab/versions.mjs", dir, weekFile, String(r.music_options)], { job });
    if (v.result?.length) versions = v.result;
  }
  const payoff = (script.edit || []).reduce((t, e) => (e.payoff != null ? { at: t.at + e.payoff, done: true } : t.done ? t : { at: t.at + e.dur }), { at: 0 }).at;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(payoff), "-i", `${dir}/final.mp4`, "-frames:v", "1", "-q:v", "2", `${dir}/cover.jpg`]);
  await upload("reels", `${base}/cover.jpg`, fs.readFileSync(`${dir}/cover.jpg`), "image/jpeg");
  const stored = [];
  for (const [i, v] of versions.entries()) {
    await upload("reels", `${base}/${i}.mp4`, fs.readFileSync(master(v.file, `${dir}/master-${i}.mp4`)), "video/mp4");
    await upload("reels", `${base}/${i}-phone.mp4`, fs.readFileSync(phone(v.file, `${dir}/phone-${i}.mp4`)), "video/mp4");
    stored.push({ register: v.register, path: `${base}/${i}.mp4`, phone: `${base}/${i}-phone.mp4` });
  }
  const dishIds = [...new Set([...(script.dishes || []), ...script.shots.map((s) => s.dish)].filter(Boolean))];
  const dishes = dishIds.map((d) => menu.items.find((m) => m.id === d)).filter(Boolean);
  const week = read(weekFile).find((c) => c.title === script.concept) || {};
  const reel = {
    id, restaurant_id: r.id, job_id: job.id, title: script.concept, idea: week.idea || script.owner_summary || "", kind: week.kind || null,
    dishes: dishes.map((d) => d.name), seconds: +probe(`${dir}/final.mp4`).toFixed(2), cover_path: `${base}/cover.jpg`,
    versions: stored, chosen: versions.length > 1 ? null : 0, cost: +spent(LEDGER, `lab/out/auto/${kit.split("/").pop()}-w${job.week}`).toFixed(2),
    director: { kit, dir, week: weekFile, approved: fs.existsSync(`${dir}/review.json`) ? read(`${dir}/review.json`).approved ?? null : null }, deliver_at: account.kind === "platform" || job.input?.now ? new Date().toISOString() : nextDelivery(r).toISOString(),
  };
  await must(db.from("reels").insert(reel));
  log(`reel ${id} for ${r.name}: ${reel.title}, ${stored.length} version(s), out at ${reel.deliver_at}`);
}

// --- delivery ---------------------------------------------------------------------------------------------------
async function deliverDue() {
  const due = await must(db.from("reels").select("*, restaurants(*, accounts(*))").is("delivered_at", null).lte("deliver_at", new Date().toISOString()).limit(10));
  for (const reel of due) {
    const r = reel.restaurants, account = r.accounts;
    try {
      if (account.kind === "platform") {
        await deliver({ dir: reel.director.dir, menuDir: reel.director.kit, force: true, target: { url: account.drop_url, token: account.platform_token } });
      } else {
        for (const m of await membersOf(r)) await sendReel(r, reel, m.phone);
      }
      await must(db.from("reels").update({ delivered_at: new Date().toISOString() }).eq("id", reel.id));
    } catch (e) { log(`deliver ${reel.id}: ${e.message}`); }
  }
}

export async function sendReel(r, reel, to) {
  const link = reelLink(reel.id);
  if (!(await wa.inWindow(to))) return wa.template(to, "reel_ready", r.language === "es" ? "es" : "en", [r.name, link], r.id);
  const many = reel.versions.length > 1;
  await wa.text(to, T(r, `Your Reel is ready: "${reel.title}".${many ? ` Same cut, ${reel.versions.length} different songs. Pick the one you like and I'll remember your taste.` : ""}\nFull quality download: ${link}`,
    `Tu Reel está listo: "${reel.title}".${many ? ` El mismo corte con ${reel.versions.length} músicas distintas. Elige la que te guste y aprendo tu gusto.` : ""}\nDescarga en máxima calidad: ${link}`), r.id);
  for (const [i, v] of reel.versions.entries()) {
    const url = await signed("reels", v.phone, 24 * 3600);
    if (many) await wa.buttons(to, `${i + 1}. ${v.register}`, [{ id: `music:${reel.id}:${i}`, title: T(r, `I want #${i + 1}`, `Quiero la ${i + 1}`) }], r.id, { type: "video", link: url });
    else await wa.video(to, url, reel.title, r.id);
  }
}

// --- a new score from the owner's words -------------------------------------------------------------------------
async function remusic(job, r) {
  const reel = await one(db.from("reels").select("*").eq("id", job.input.reel_id));
  const { dir, week } = reel.director, p = await run(["lab/remusic.mjs", dir, week, job.input.words], { job });
  if (p.code !== 0) throw new Error(`remusic: ${p.tail}`);
  const script = read(`${dir}/script.json`), i = reel.versions.length, base = `${r.id}/${reel.id}`;
  await upload("reels", `${base}/${i}.mp4`, fs.readFileSync(`${dir}/final.mp4`), "video/mp4");
  await upload("reels", `${base}/${i}-phone.mp4`, fs.readFileSync(phone(`${dir}/final.mp4`, `${dir}/phone-${i}.mp4`)), "video/mp4");
  const versions = [...reel.versions, { register: script.music.register, path: `${base}/${i}.mp4`, phone: `${base}/${i}-phone.mp4`, owner: job.input.words }];
  await must(db.from("reels").update({ versions, chosen: i }).eq("id", reel.id));
  for (const m of await membersOf(r)) {
    const url = await signed("reels", versions[i].phone, 24 * 3600);
    await wa.video(m.phone, url, T(r, `New music: ${script.music.register}. Full quality: ${reelLink(reel.id)}`, `Música nueva: ${script.music.register}. En máxima calidad: ${reelLink(reel.id)}`), r.id);
  }
  await jobUpdate(job.id, { status: "done" });
}

// --- the loop ---------------------------------------------------------------------------------------------------
async function handle(job) {
  const r = await one(db.from("restaurants").select("*, accounts(*)").eq("id", job.restaurant_id));
  log(`job ${job.id} ${job.kind} for ${r.name} (try ${job.attempts})`);
  try {
    if (job.kind === "reel") await makeReel(job, r, r.accounts);
    else if (job.kind === "remusic") await remusic(job, r);
    else if (job.kind === "import" && job.input?.equipment) {
      // Sign-up: the equipment the owner marked gets a provisional photo now (free footage, or one Muse makes).
      const dir = kitDir(r, r.accounts);
      fs.mkdirSync(dir, { recursive: true });
      await layoutKit(await kitFor(r, r.accounts), dir);
      const got = await ensureEquipment(dir, { restaurantId: r.id, only: job.input.equipment });
      await jobUpdate(job.id, { status: "done", state: got });
    }
    else if (job.kind === "import") {
      const got = await importWebsite(r, job.input.url);
      await jobUpdate(job.id, { status: "done", state: got });
      for (const m of await membersOf(r)) if (await wa.inWindow(m.phone))
        await wa.text(m.phone, T(r, `I read your website: ${got.added} dishes, ${got.photos} with photos. Send me more food photos here anytime.`, `Leí tu página: ${got.added} platos, ${got.photos} con foto. Mándame más fotos de tu comida cuando quieras.`), r.id);
    }
    else throw new Error(`unknown job kind ${job.kind}`);
  } catch (e) {
    log(`job ${job.id} failed: ${e.message}`);
    // A second try only for what may pass on its own (a network blip); a run that spent its cap does not try again.
    const again = job.attempts < 2 && !/no Reel|no dish/.test(e.message);
    await jobUpdate(job.id, { status: again ? "queued" : "failed", error: e.message.slice(0, 2000) });
  }
}

// Several Reels at once (Yansel, 4 Nov: "de 20 min en 20 min tardaremos mucho"): a Reel spends its time waiting on the
// video model and Muse, not on this machine. Never two of the same restaurant at once: they share its kit folder.
const MAX = +process.env.DR_WORKERS || 3, busy = new Map();
async function claim() {
  const queued = await must(db.from("jobs").select("id, restaurant_id, attempts").eq("status", "queued").order("created_at").limit(20));
  for (const q of queued.filter((j) => ![...busy.values()].includes(j.restaurant_id))) {
    // Taken only if it is still queued: the update is the lock.
    const [job] = await must(db.from("jobs").update({ status: "running", locked_by: WORKER, locked_at: new Date().toISOString(), attempts: q.attempts + 1, updated_at: new Date().toISOString() })
      .eq("id", q.id).eq("status", "queued").select("*"));
    if (job) return job;
  }
  return null;
}
async function tick() {
  await schedule().catch((e) => log(`schedule: ${e.message}`));
  await deliverDue().catch((e) => log(`deliver: ${e.message}`));
  if (busy.size >= MAX) return false;
  const job = await claim();
  if (!job) return false;
  busy.set(job.id, job.restaurant_id);
  handle(job).catch((e) => log(`job ${job.id}: ${e.message}`)).finally(() => busy.delete(job.id));
  return true;
}

if (process.argv[1]?.endsWith("worker.mjs")) {
  // A job left running by a worker that died goes back to the queue.
  await must(db.from("jobs").update({ status: "queued" }).eq("status", "running"));
  log(`worker ${WORKER} up`);
  if (process.argv.includes("--once")) await tick();
  else for (;;) if (!(await tick().catch((e) => (log(`tick: ${e.message}`), false)))) await sleep(15000);
}
