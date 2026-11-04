// Lab: photos -> layers -> reel with a hand-written plan (Muse Spark plans it next).
// Usage: node --env-file=../.env lab/reel.mjs lab/photos/a.jpg lab/photos/b.jpg ...
import path from "node:path";
import fs from "node:fs";
import { buildLayers } from "../src/layers.mjs";
import { renderReel } from "../src/render.mjs";

const photos = process.argv.slice(2);
const texts = ["Made fresh\ntoday", "", "Come hungry", ""];
const shots = [];
for (const [i, p] of photos.entries()) {
  const dir = `lab/out/layers/${path.basename(p, path.extname(p))}`;
  if (!fs.existsSync(`${dir}/meta.json`)) {
    const t0 = Date.now();
    const m = await buildLayers(p, dir);
    console.log(`${dir}: ${Date.now() - t0}ms gain=${m.gain.map((g) => g.toFixed(2))} dish=${(m.dishShare * 100).toFixed(0)}%`);
  }
  shots.push({ dir, seconds: i === 0 ? 2.4 : 1.8, text: texts[i % texts.length] });
}
const t0 = Date.now();
fs.mkdirSync("lab/out/reels", { recursive: true });
await renderReel(shots, "lab/out/reels/test.mp4");
console.log(`render ${Date.now() - t0}ms`);
