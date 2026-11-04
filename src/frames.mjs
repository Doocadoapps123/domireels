// Every frame a Reel starts or ends on comes from the restaurant's real photo.
//   tallFrame: the real photo as a 9:16 frame (cropped when it is tall enough, else Muse extends the scene).
//   resurface: the real dish moved onto another table; its container lands on the one Muse drew.
//   peel: one step of the dish undone (the sauce off, the meat off), measured so no food floats outside its container.
//   focusFrame: a tight 9:16 crop of the real frame around what SAM finds (the sauce lines, the crackling skin).
import sharp from "sharp";
import { museEdit, realFrame } from "./film.mjs";
import { segmentObjects } from "./layers.mjs";
import { measure, spills, pct } from "./contain.mjs";

const W = 1080, H = 1920, size = W * H;
const opt = { raw: { width: W, height: H, channels: 1 } }, one = (s) => s.extractChannel(0).raw().toBuffer();

export async function tallFrame(photo) {
  const m = await sharp(photo).rotate().metadata(), [w, h] = m.orientation >= 5 ? [m.height, m.width] : [m.width, m.height];
  if (h / w < 1.6) return realFrame(photo);
  return sharp(photo).rotate().resize(W, H, { fit: "cover", position: "centre" }).jpeg({ quality: 94 }).toBuffer();
}

// Muse redraws the table around the container, then the real food is pasted back, scaled and moved so the
// real container lands on the one Muse drew. Without that step the food keeps its old place, Muse's container
// sits a little higher, and the front of the dish hangs over the table (the yaroa: 28% outside).
// `how` is the surface prompt, or a frame Muse already drew. Throws if more food spills than in the real photo.
export async function resurface(real, container, how) {
  const drawn = Buffer.isBuffer(how) ? how
    : await museEdit(`${how} Keep the ${container} and all the food in it exactly the same, same size, same place, same camera angle. Give the ${container} a soft natural contact shadow. No text, no people.`, real);
  const [a, b] = await Promise.all([measure(real, container), measure(drawn, container)]);
  if (!a.found || !b.found) throw new Error(`SAM found no ${container}`);
  // Real container box -> drawn container box, then sample the real frame backwards (bilinear).
  const sx = (b.box.x2 - b.box.x1) / (a.box.x2 - a.box.x1), sy = (b.box.y2 - b.box.y1) / (a.box.y2 - a.box.y1);
  const [R, D] = await Promise.all([real, drawn].map((f) => sharp(f).resize(W, H).removeAlpha().raw().toBuffer()));
  const moved = Buffer.alloc(size * 3), food = Buffer.alloc(size);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = a.box.x1 + (x - b.box.x1) / sx, v = a.box.y1 + (y - b.box.y1) / sy;
    const x0 = Math.max(0, Math.min(W - 2, Math.floor(u))), y0 = Math.max(0, Math.min(H - 2, Math.floor(v))), fx = u - x0, fy = v - y0, o = y * W + x;
    for (let c = 0; c < 3; c++) {
      const p = (xx, yy) => R[(yy * W + xx) * 3 + c];
      moved[o * 3 + c] = (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx) * fy;
    }
    const ru = Math.round(u), rv = Math.round(v);
    food[o] = ru >= 0 && ru < W && rv >= 0 && rv < H && a.food[rv * W + ru] && b.pan[o] ? 255 : 0;
  }
  // A soft edge, pulled in a little so the drawn rim stays whole.
  const alpha = await one(sharp(await one(sharp(food, opt).blur(3).threshold(200)), opt).blur(2));
  const o = Buffer.alloc(size * 3);
  for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = (moved[i * 3 + c] * alpha[i] + D[i * 3 + c] * (255 - alpha[i])) / 255;
  const result = await sharp(o, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 94 }).toBuffer();
  const check = await measure(result, container);
  console.log(`scale ${sx.toFixed(3)} x ${sy.toFixed(3)}, food outside the ${container}: real ${pct(a)}, result ${pct(check)}`);
  if (spills(check, a.spill)) throw new Error("food hangs outside the container");
  return { frame: result, drawn };
}

const KEEP = "Keep exactly the same container, its rim and shape, the table surface, the light, the camera angle and the framing. Change nothing else. No text, no hands, no utensils.";

// One edit of the frame before it. Food outside the container gets one redraw, then it throws.
// loose: a frame with no food left in sight (the dish wrapped in foil, the table cleared for a trick) has nothing to spill;
// SAM reads crumpled foil as food hanging off the plate (Pikalo's pepperoni empanada, 3 Nov).
export async function peel(from, what, container, ref = null, loose = false) {
  const prompt = `${what} ${ref ? "Image 2 is this restaurant's own photo of that food: match its look exactly. " : ""}${KEEP}`;
  let out = await museEdit(prompt, ref ? [from, ref] : from);
  if (loose) return { frame: out, outside: "n/a" };
  let m = await measure(out, container);
  if (spills(m)) {
    console.log(`  ${pct(m)} of the food outside the ${container}, drawing it again`);
    out = await museEdit(`${prompt} All the food stays inside the ${container}, and its front rim shows in front of the food.`, ref ? [from, ref] : from);
    if (spills(m = await measure(out, container))) throw new Error(`${pct(m)} of the food outside the ${container}`);
  }
  return { frame: out, outside: pct(m) };
}

// The biggest thing SAM finds for `concept`, framed 9:16 with room around it, at least `min` of the frame wide.
// Null when SAM finds nothing.
export async function focusFrame(frame, concept, min = 0.45) {
  const jpg = await sharp(frame).resize(W, H).jpeg({ quality: 95 }).toBuffer();
  const masks = await segmentObjects(jpg, W, H, concept).catch(() => []);
  let best = null;
  for (const m of masks) {
    let x1 = W, y1 = H, x2 = 0, y2 = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { n++; x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); }
    if (n && (!best || n > best.n)) best = { n, x1, y1, x2, y2 };
  }
  if (!best) return null;
  const w = Math.round(Math.min(W, Math.max(W * min, (best.x2 - best.x1) * 1.3, ((best.y2 - best.y1) * 1.3 * 9) / 16))), h = Math.round((w * 16) / 9);
  const cx = (best.x1 + best.x2) / 2, cy = (best.y1 + best.y2) / 2;
  const box = { left: Math.round(Math.min(W - w, Math.max(0, cx - w / 2))), top: Math.round(Math.min(H - h, Math.max(0, cy - h / 2))), width: w, height: h };
  return { frame: await sharp(jpg).extract(box).resize(W, H, { kernel: "lanczos3" }).jpeg({ quality: 94 }).toBuffer(), box };
}
