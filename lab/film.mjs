// Lab: one real photo -> Muse Spark shot list -> Muse Image first frames + the real end frame.
// Stops before any paid video call so the frames can be checked first.
// Usage: node --env-file=../.env lab/film.mjs lab/photos/torta.jpg
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { directFilm, keyframe, lastKeyframe, realFrame } from "../src/film.mjs";

const photo = process.argv[2];
const dir = `lab/out/film/${path.basename(photo, path.extname(photo))}`;
fs.mkdirSync(dir, { recursive: true });

let t0 = Date.now();
const plan = fs.existsSync(`${dir}/plan.json`) ? JSON.parse(fs.readFileSync(`${dir}/plan.json`, "utf8")) : await directFilm(fs.readFileSync(photo));
fs.writeFileSync(`${dir}/plan.json`, JSON.stringify(plan, null, 2));
console.log(`plan ${Date.now() - t0}ms`, plan.dish, plan.shots.map((s) => s.beat));

t0 = Date.now();
const src = fs.readFileSync(photo);
const last = plan.shots.at(-1);
const [end, ...keys] = await Promise.all([realFrame(src), ...plan.shots.slice(0, -1).map((s) => keyframe(src, plan, s))]);
keys.push(await lastKeyframe(end, last));
fs.writeFileSync(`${dir}/end.jpg`, end);
keys.forEach((k, i) => fs.writeFileSync(`${dir}/shot-${i}.jpg`, k));
console.log(`frames ${Date.now() - t0}ms`);

const tiles = await Promise.all([...keys, end].map((b) => sharp(b).resize(360, 640).toBuffer()));
await sharp({ create: { width: 360 * tiles.length, height: 640, channels: 3, background: "#000" } })
  .composite(tiles.map((input, i) => ({ input, left: i * 360, top: 0 }))).jpeg({ quality: 85 }).toFile(`${dir}/sheet.jpg`);
console.log(`${dir}/sheet.jpg`);
