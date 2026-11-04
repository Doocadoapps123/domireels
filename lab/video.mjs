// Lab: real photo -> image-to-video clip on fal (Kling, Seedance, Gemini Omni), to compare realism.
// Every clip still has to pass the Meta food check before it can be used.
// Usage: node --env-file=../.env lab/video.mjs lab/photos/x.jpg "prompt" name
import fs from "node:fs";
import sharp from "sharp";

const [photo, prompt, name = "clip"] = process.argv.slice(2);
const MODELS = {
  kling: ["kling/v4/image-to-video", (img) => ({ start_image_url: img, prompt, duration: 6, resolution: "1080p" })],
  seedance: ["bytedance/seedance-2.5/us/image-to-video", (img) => ({ image_url: img, prompt, duration: "5", resolution: "720p", generate_audio: true })],
  omni: ["google/gemini-omni-flash/v1.1/image-to-video", (img) => ({ image_url: img, prompt, duration: 6, aspect_ratio: "9:16", resolution: "1080p" })],
};
const auth = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
const img = `data:image/jpeg;base64,${(await sharp(photo).rotate().jpeg({ quality: 95 }).toBuffer()).toString("base64")}`;
fs.mkdirSync("lab/out/video", { recursive: true });

async function run(key, [endpoint, input]) {
  const t0 = Date.now();
  const q = await fetch(`https://queue.fal.run/${endpoint}`, { method: "POST", headers: auth, body: JSON.stringify(input(img)) }).then((r) => r.json());
  if (!q.status_url) throw new Error(`${key}: ${JSON.stringify(q).slice(0, 400)}`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await fetch(q.status_url, { headers: auth }).then((r) => r.json());
    if (s.status === "COMPLETED") break;
    if (s.status !== "IN_QUEUE" && s.status !== "IN_PROGRESS") throw new Error(`${key}: ${JSON.stringify(s).slice(0, 400)}`);
  }
  const out = await fetch(q.response_url, { headers: auth }).then((r) => r.json());
  const url = out.video?.url;
  if (!url) throw new Error(`${key}: ${JSON.stringify(out).slice(0, 400)}`);
  const file = `lab/out/video/${name}-${key}.mp4`;
  fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  console.log(file, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
// Seedance is the expensive one: only with ONLY=seedance, once the prompts are proven.
const only = process.env.ONLY?.split(",") ?? ["kling", "omni"];
const results = await Promise.allSettled(Object.entries(MODELS).filter(([k]) => only.includes(k)).map(([k, m]) => run(k, m)));
for (const r of results) if (r.status === "rejected") console.log(String(r.reason).slice(0, 500));
