// Lab: animate every shot of a film plan with Gemini Omni on fal. The last shot interpolates into the real photo.
// Usage: node --env-file=../.env lab/shots.mjs lab/out/film/torta [shotIndex...]
import fs from "node:fs";

const [dir, ...pick] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(`${dir}/plan.json`, "utf8"));
const auth = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
const uri = (f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}`;

async function animate(i) {
  const shot = plan.shots[i], t0 = Date.now();
  const input = { image_url: uri(`${dir}/shot-${i}.jpg`), prompt: shot.motion, duration: 4, aspect_ratio: "9:16", resolution: "1080p" };
  if (shot.ends_on_real_photo) input.end_image_url = uri(`${dir}/end.jpg`);
  const q = await fetch("https://queue.fal.run/google/gemini-omni-flash/v1.1/image-to-video", { method: "POST", headers: auth, body: JSON.stringify(input) }).then((r) => r.json());
  if (!q.status_url) throw new Error(`shot ${i}: ${JSON.stringify(q).slice(0, 400)}`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await fetch(q.status_url, { headers: auth }).then((r) => r.json());
    if (s.status === "COMPLETED") break;
    if (s.status !== "IN_QUEUE" && s.status !== "IN_PROGRESS") throw new Error(`shot ${i}: ${JSON.stringify(s).slice(0, 400)}`);
  }
  const out = await fetch(q.response_url, { headers: auth }).then((r) => r.json());
  if (!out.video?.url) throw new Error(`shot ${i}: ${JSON.stringify(out).slice(0, 400)}`);
  fs.writeFileSync(`${dir}/shot-${i}.mp4`, Buffer.from(await (await fetch(out.video.url)).arrayBuffer()));
  console.log(`shot ${i} ${shot.beat}: ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const which = pick.length ? pick.map(Number) : plan.shots.map((_, i) => i);
const results = await Promise.allSettled(which.map(animate));
for (const r of results) if (r.status === "rejected") console.log(String(r.reason).slice(0, 500));
