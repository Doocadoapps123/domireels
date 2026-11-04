// Lab: the sauce stages of a dish dressed with lines of sauce, made from the real photo. Each stage is the
// sauceless frame (Muse) with the real sauce pixels pasted back, one sauce more each time, found by color
// inside the food (SAM). So every line the video ends on is a line the restaurant really drew.
// Usage: node --env-file=../.env lab/sauceframes.mjs <real 9:16> <sauceless 9:16> <out dir> <sauce>... (red, white, yellow, in drawing order)
import fs from "node:fs";
import sharp from "sharp";
import { segmentObjects } from "../src/layers.mjs";

const [real, bare, dir, ...order] = process.argv.slice(2);
const W = 1080, H = 1920, size = W * H;
const raw = (f) => sharp(f).resize(W, H).removeAlpha().raw().toBuffer();
const [R, B] = await Promise.all([raw(real), raw(bare)]);
const food = new Uint8Array(size);
for (const m of await segmentObjects(await sharp(real).jpeg({ quality: 95 }).toBuffer(), W, H, "food")) for (let i = 0; i < size; i++) food[i] |= m[i];
const IS = {
  red: (r, g, b) => r > 110 && r > 1.9 * g && r > 1.9 * b,
  yellow: (r, g, b) => r > 170 && g > 120 && b < 120 && g > 0.55 * r && r - b > 90,
  white: (r, g, b) => r > 190 && g > 185 && b > 165 && Math.max(r, g, b) - Math.min(r, g, b) < 50,
};
// A sauce mask, grown 1 px and softened so the pasted line keeps its glossy edge without a seam.
const one = (s) => s.extractChannel(0).raw().toBuffer();
async function mask(kinds) {
  const m = Buffer.alloc(size);
  for (let i = 0; i < size; i++) if (food[i] && kinds.some((k) => IS[k](R[i * 3], R[i * 3 + 1], R[i * 3 + 2]))) m[i] = 255;
  const opt = { raw: { width: W, height: H, channels: 1 } };
  return one(sharp(await one(sharp(m, opt).blur(1.2).threshold(60)), opt).blur(0.8));
}
for (let k = 1; k <= order.length; k++) {
  const a = await mask(order.slice(0, k)), o = Buffer.alloc(size * 3);
  for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = (R[i * 3 + c] * a[i] + B[i * 3 + c] * (255 - a[i])) / 255;
  const f = `${dir}/sauce-${k}-${order[k - 1]}.jpg`;
  await sharp(o, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 94 }).toFile(f);
  console.log(f);
}
