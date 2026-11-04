// Lab: the three states of a tray being filled, made from the real photo so every shot shares one tray.
//   empty.jpg   - Muse removes all food from the real photo
//   fries.jpg   - empty.jpg + the real fries pixels (SAM mask), so the empty half is the very same black
//   nolime.jpg  - Muse removes only the lime; the rest stays the real photo
// Pasting the real food back over Muse's empty tray beats pasting the real tray around Muse's food:
// SAM's masks miss thin edges, and those edges show up as ghosts on an empty tray.
// Usage: node --env-file=../.env lab/pourframes.mjs <real 9:16 frame> <out dir>
import fs from "node:fs";
import sharp from "sharp";
import { museEdit } from "../src/film.mjs";
import { segmentObjects } from "../src/layers.mjs";

const [real, dir] = process.argv.slice(2);
const W = 1080, H = 1920, size = W * H;
const jpg = await sharp(real).jpeg({ quality: 95 }).toBuffer();
const union = (ms) => { const o = Buffer.alloc(size); for (const m of ms) for (let i = 0; i < size; i++) o[i] |= m[i]; return o; };
// Grow a mask by r px and soften its edge, so pasted pixels blend without a seam.
const one = (s) => s.extractChannel(0).raw().toBuffer();
const soft = async (m, r) => one(sharp(await one(sharp(m, { raw: { width: W, height: H, channels: 1 } }).blur(r).threshold(8)), { raw: { width: W, height: H, channels: 1 } }).blur(r / 2));
async function paste(base, top, alpha) {
  const [b, t] = await Promise.all([base, top].map((x) => sharp(x).resize(W, H).removeAlpha().raw().toBuffer()));
  const o = Buffer.alloc(size * 3);
  for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = (t[i * 3 + c] * alpha[i] + b[i * 3 + c] * (255 - alpha[i])) / 255;
  return sharp(o, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 94 }).toBuffer();
}

const fries = union(await segmentObjects(jpg, W, H, "french fries"));
const empty = await museEdit("Remove every piece of food and the lime from the black takeout tray. Keep the exact same tray, its rim, the steel counter, the light and the framing. The inside of the tray is empty, clean, dry, matte black plastic: no grease, no crumbs, no wet spots, no shine. No text.", jpg);
fs.writeFileSync(`${dir}/empty.jpg`, empty);
fs.writeFileSync(`${dir}/fries.jpg`, await paste(empty, jpg, await soft(fries, 2)));
fs.writeFileSync(`${dir}/nolime.jpg`, await museEdit("Remove only the lime wedge. Where it was, show the chicharron chunks and fries that continue underneath, matching the rest of the tray exactly. Change nothing else. No text.", jpg));
console.log("empty.jpg fries.jpg nolime.jpg");
