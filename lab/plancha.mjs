// Lab: does a REAL kitchen surface make the cooking shot look real? The equipment pixels come from a real
// video frame; Muse Image only swaps the food for the restaurant's dish; Omni animates a 4 s draft.
// Usage: node --env-file=../.env lab/plancha.mjs frame <video> <second> <dish photo> [refs...]
//        node --env-file=../.env lab/plancha.mjs video <start.jpg> "<motion>"
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { museEdit } from "../src/film.mjs";
import { omni } from "../src/video.mjs";

const out = "lab/out/plancha";
fs.mkdirSync(out, { recursive: true });
const [step, ...args] = process.argv.slice(2);

const SWAP = `Image 1 is a real phone photo of a restaurant's flat-top griddle. Keep the griddle exactly as it is: the same dark seasoned steel with its grease marks and scraps, the same rusty steel backsplash, the same light, camera angle and framing. Remove the tortillas, the cheese and the gloved hand. In their place, cooking on the steel: near the camera a generous mound of shredded birria beef (pulled stringy strands and small chopped bits, never cubes or steak chunks), dark mahogany, crisping in its own red fat with charred edges, glistening, with glossy orange-yellow melted cheese starting to drape over it; further back ONE torta roll split lengthwise into exactly two long halves, lying cut side down on the steel so only their domed pale tan crust shows. The meat, cheese and roll look exactly like the ones in the finished torta of image 2 and the roll of image 3. True scale for a real griddle, nothing else added, no people.`;

if (step === "frame") {
  const [video, second, photo, ...refs] = args;
  const base = `${out}/base.jpg`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", second, "-i", video, "-frames:v", "1", "-q:v", "2", base]);
  const images = [base, photo, ...refs].map((f) => fs.readFileSync(f));
  for (const i of [0, 1]) {
    fs.writeFileSync(`${out}/start-${i}.jpg`, await museEdit(SWAP, images));
    console.log(`${out}/start-${i}.jpg`);
  }
} else if (step === "video") {
  const [start, motion] = args;
  const n = fs.readdirSync(out).filter((f) => f.endsWith(".mp4")).length;
  const r = await omni({ start, prompt: motion, out: `${out}/draft-${n}.mp4` });
  console.log(r);
}
