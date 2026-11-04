// Food never leaves its container. SAM finds the food and the container in a frame; each row of the
// container is filled from its left to its right edge, so the stretch of rim the food covers still counts.
// The share of food outside that shape says whether a drawn or pasted frame lets food hang over the rim
// or float over the table. Food above the container's top row is ignored: a heaped dish rises above
// the back rim in a photo taken from the front.
import sharp from "sharp";
import { segmentObjects } from "./layers.mjs";

const union = (masks, size) => {
  const out = Buffer.alloc(size);
  for (const m of masks) for (let i = 0; i < size; i++) out[i] |= m[i];
  return out;
};

export async function measure(img, container, W = 1080, H = 1920) {
  const size = W * H, jpg = await sharp(img).resize(W, H).jpeg({ quality: 95 }).toBuffer();
  const [foods, pans] = await Promise.all(["food", container].map((c) => segmentObjects(jpg, W, H, c)));
  const food = union(foods, size), edge = union(pans, size), pan = Buffer.alloc(size);
  let top = H, box = { x1: W, y1: H, x2: 0, y2: 0 };
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (edge[y * W + x]) { if (l < 0) l = x; r = x; }
    if (l < 0) continue;
    pan.fill(255, y * W + l, y * W + r + 1);
    if (y < top) top = y;
    box = { x1: Math.min(box.x1, l), y1: Math.min(box.y1, y), x2: Math.max(box.x2, r), y2: y };
  }
  let n = 0, out = 0;
  for (let i = top * W; i < size; i++) if (food[i]) { n++; if (!pan[i]) out++; }
  return { spill: n ? out / n : 0, food, pan, box, found: pans.length > 0 };
}

// A fry crossing the rim measures about 2%, a 360p draft frame up to 5.4% from blurrier masks;
// the yaroa hanging over the front of its pan measured 28%.
// `allowed` is what the restaurant's own photo spills (a lime on the table is theirs). A frame with no
// container in it (a fryer, a grill) is not judged.
// Muse's own review missed the 28% twice, on the frame and on the clip, so this check is the gate.
export const spills = (m, allowed = 0) => m.found && m.spill > allowed + 0.08;
export const pct = (m) => `${(100 * m.spill).toFixed(1)}%`;
