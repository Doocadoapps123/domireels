// Turns one real food photo into the layers a reel is built from, with SAM 3.1:
//   plate.png - the ORIGINAL plate and food pixels, transparent elsewhere
//   photo.jpg - the photo itself, upright
// The food the customer sees always comes from these real pixels, never from a generator.
import fs from "node:fs";
import OpenAI from "openai";
import sharp from "sharp";
import { parseImageStream, recordsOfKind, decodeMaskToRaster } from "@meta-sam/parser";

const API = "https://api.meta.ai/v1";
const key = () => process.env.META_API_KEY;
const client = new OpenAI({ baseURL: API, apiKey: key(), maxRetries: 6 });

const SCENE_PROMPT = [
  "Professional food photo retouch of this exact photo.",
  "Keep the camera angle, framing, plate position and every food item exactly where they are.",
  "Replace the table and surroundings with a clean, warm restaurant tabletop. Remove clutter, people, legs, phones and packaging.",
  "Warm natural window light, soft shadows, appetizing color. Do not add, remove or change any food.",
].join(" ");

const dataUrl = (buf) => `data:image/jpeg;base64,${buf.toString("base64")}`;

// One full-frame 0/255 mask per object SAM finds for `concept`.
export async function segmentObjects(jpg, width, height, concept) {
  const events = await client.responses.create({
    model: "sam-3.1",
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text: concept },
      { type: "input_image", image_url: dataUrl(jpg) },
    ] }],
    stream: true,
  });
  const result = await parseImageStream(events).finalResult;
  return recordsOfKind(result.records, "mask").map((m) => {
    const alpha = Buffer.alloc(width * height);
    const raster = decodeMaskToRaster(m.mask);
    const { width: mw, height: mh } = m.mask;
    const { left, top, right, bottom } = m.bounds;
    const bw = right - left, bh = bottom - top;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const v = raster[Math.min(mh - 1, Math.floor((y * mh) / bh)) * mw + Math.min(mw - 1, Math.floor((x * mw) / bw))];
      if (v) alpha[(top + y) * width + left + x] = 255;
    }
    return alpha;
  });
}

const union = (masks, size) => {
  const out = Buffer.alloc(size);
  for (const m of masks) for (let i = 0; i < size; i++) out[i] |= m[i];
  return out;
};

// Fills every region the border can't reach, so a plate ring plus its food becomes one solid shape.
function fillHoles(mask, width, height) {
  const out = Buffer.alloc(width * height, 255), stack = [];
  const push = (i) => { if (!mask[i] && out[i]) { out[i] = 0; stack.push(i); } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % width;
    if (x > 0) push(i - 1); if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width); if (i < (height - 1) * width) push(i + width);
  }
  return out;
}

// The dish = SAM's "plate of food" (one solid shape: plate, food, and food hanging over the rim),
// plus "food" so no edible bit is left out. Plain "plate" comes back as a ring with holes, so it
// is only the fallback. Shapes covering most of the frame (a lap, a whole tray) are dropped.
export async function segmentDish(jpg, width, height) {
  const size = width * height;
  const [foods, dishes] = await Promise.all([
    segmentObjects(jpg, width, height, "food"), segmentObjects(jpg, width, height, "plate of food"),
  ]);
  const food = union(foods, size);
  const area = (m) => { let n = 0; for (let i = 0; i < size; i++) if (m[i]) n++; return n; };
  let holding = dishes.filter((d) => { const a = area(d); return a && a < size * 0.8; });
  if (!holding.length) {
    const plates = await segmentObjects(jpg, width, height, "plate");
    const foodArea = Math.max(1, area(food));
    holding = plates.filter((p) => {
      let a = 0, x1 = width, y1 = height, x2 = 0, y2 = 0;
      for (let i = 0; i < size; i++) if (p[i]) {
        a++; const x = i % width, y = (i / width) | 0;
        if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
      if (!a || a > size * 0.8) return false;
      let inside = 0;
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) if (food[y * width + x]) inside++;
      return inside / foodArea > 0.3;
    });
  }
  // SAM's food and plate shapes leave thin seams between them; close them (grow, fill, shrink back).
  const r = Math.max(3, Math.round(Math.max(width, height) * 0.01));
  const grown = await mono(raw1(union([food, ...holding], size), width, height).blur(r).threshold(20));
  const closed = await mono(raw1(fillHoles(grown, width, height), width, height).blur(r).threshold(235));
  return { food, lock: closed, plates: holding.length };
}

export async function cleanScene(jpg, width, height) {
  const res = await fetch(`${API}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "muse-image-1.0",
      prompt: SCENE_PROMPT,
      images: [{ image_url: dataUrl(jpg) }],
      size: `${width}x${height}`,
      output_format: "jpeg",
      reasoning_strength: "low",
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`muse-image ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const edited = Buffer.from((await res.json()).data[0].b64_json, "base64");
  return sharp(edited).resize(width, height, { fit: "fill" }).jpeg({ quality: 92 }).toBuffer();
}

// sharp turns 1-channel input into sRGB on most ops; always read masks back as one channel.
const mono = (img) => img.extractChannel(0).raw().toBuffer();
const raw1 = (buf, width, height) => sharp(buf, { raw: { width, height, channels: 1 } });

// Real photo -> plate cutout (original pixels only) cropped to the plate, full resolution.
// The reel is built around this cutout, so nothing the customer sees as food is generated.
export async function buildLayers(photoPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const jpg = await sharp(photoPath).rotate().jpeg({ quality: 95 }).toBuffer();
  const { width, height } = await sharp(jpg).metadata();
  const { food, lock, plates } = await segmentDish(jpg, width, height);
  const feather = Math.max(1, Math.round(Math.max(width, height) * 0.0015));
  // Pull the edge in a few pixels first: SAM's border carries a dark rim of the old table.
  const shrink = Math.max(2, Math.round(Math.max(width, height) * 0.002));
  const inner = await mono(raw1(lock, width, height).blur(shrink).threshold(250));
  const alpha = await mono(raw1(inner, width, height).blur(feather + 0.3));
  // Plate bounding box (from the hard lock) plus a little room for the feather.
  let x1 = width, y1 = height, x2 = 0, y2 = 0, area = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!lock[y * width + x]) continue;
    area++; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
  }
  const pad = feather * 3;
  const box = { left: Math.max(0, x1 - pad), top: Math.max(0, y1 - pad) };
  box.width = Math.min(width, x2 + pad + 1) - box.left;
  box.height = Math.min(height, y2 + pad + 1) - box.top;
  // Interleave RGBA by hand: sharp applies removeAlpha/joinChannel in its own order, not ours.
  const rgb = await sharp(jpg).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = alpha[i];
  }
  const plate = await sharp(rgba, { raw: { width, height, channels: 4 } }).extract(box).png().toBuffer();
  const foodPng = await raw1(food, width, height).extract(box).png().toBuffer();
  fs.writeFileSync(`${outDir}/photo.jpg`, jpg);
  fs.writeFileSync(`${outDir}/plate.png`, plate);
  fs.writeFileSync(`${outDir}/food-mask.png`, foodPng);
  const meta = { width, height, plates, box, plateShare: area / (width * height) };
  fs.writeFileSync(`${outDir}/meta.json`, JSON.stringify(meta, null, 2));
  return meta;
}

// An empty table for the plate to sit on, generated by Muse Image at 9:16.
// Nothing edible is generated: the plate is placed on it afterwards from the real photo.
const TABLE_PROMPT = [
  "Top-down overhead photo of an empty restaurant table, warm natural wood, a folded linen napkin at one edge,",
  "soft natural window light from the upper left, gentle soft shadows, bright and airy, appetizing warm tones.",
  "The center of the table is completely empty. No plates, no food, no drinks, no hands, no text, no logos.",
].join(" ");

export async function tableScene(prompt = TABLE_PROMPT) {
  const res = await fetch(`${API}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "muse-image-1.0", prompt, size: "1080x1920", output_format: "jpeg", n: 1 }),
  });
  if (!res.ok) throw new Error(`muse-image ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from((await res.json()).data[0].b64_json, "base64");
}

// 1080x1920 frame: the real plate cutout on the table, with a soft contact shadow.
// When the photo itself cut the plate off (it touches the photo's edge), that cut side is pushed
// just outside the frame, so the viewer never sees a plate with a straight edge.
export async function plateOnTable(platePng, table, meta, { W = 1080, H = 1920, widthShare = 0.94, centerY = 0.46 } = {}) {
  const bg = await sharp(table).resize(W, H, { fit: "cover" }).toBuffer();
  const pm = await sharp(platePng).metadata();
  const { box } = meta, edge = 2, out = 24;
  const cut = {
    left: box.left <= edge, right: box.left + box.width >= meta.width - edge,
    top: box.top <= edge, bottom: box.top + box.height >= meta.height - edge,
  };
  // Never upscale real pixels by much: that is what made v0 soft.
  let scale = Math.min(1, (W * widthShare) / pm.width, (H * 0.6) / pm.height);
  if (cut.left && cut.right) scale = (W + 2 * out) / pm.width;
  else if (cut.left || cut.right) scale = Math.max(scale, (W * 0.8) / pm.width);
  scale = Math.min(scale, 1.15);
  const pw = Math.round(pm.width * scale), ph = Math.round(pm.height * scale);
  const plate = await sharp(platePng).resize(pw, ph).png().toBuffer();
  let left = Math.round((W - pw) / 2), top = Math.round(H * centerY - ph / 2);
  if (cut.left && !cut.right) left = -out;
  if (cut.right && !cut.left) left = W - pw + out;
  if (cut.top && !cut.bottom) top = -out;
  if (cut.bottom && !cut.top) top = H - ph + out;
  const shadowAlpha = await sharp(plate).extractChannel(3).linear(0.55, 0).blur(28).png().toBuffer();
  const shadow = await sharp({ create: { width: pw, height: ph, channels: 3, background: "#2a1a0e" } })
    .joinChannel(shadowAlpha).png().toBuffer();
  // Composite on an oversized canvas so layers may hang off the frame, then crop back to W x H.
  const pad = 200;
  const canvas = await sharp(bg).extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: "mirror" }).toBuffer();
  // Two steps on purpose: sharp runs extract before composite inside one pipeline.
  const big = await sharp(canvas).composite([
    { input: shadow, left: left + pad + 10, top: top + pad + 22 },
    { input: plate, left: left + pad, top: top + pad },
  ]).png().toBuffer();
  const frame = await sharp(big).extract({ left: pad, top: pad, width: W, height: H }).jpeg({ quality: 95 }).toBuffer();
  return { frame, plateRect: { left, top, width: pw, height: ph }, cut, scale: +scale.toFixed(3) };
}

// "Si vamos a hacer un reel de varios platos, usted va a coger los platos y los va a poner en una mesa" (Yansel, 4 Nov).
// Every dish of the Reel cut out of its own photo with SAM (its real pixels only) and set together on one table, as the
// first frame of a shot where only the camera moves. 1080x1920; 2 to 4 dishes.
const SPREAD = {
  2: [[0.5, 0.29], [0.5, 0.71]],
  3: [[0.35, 0.21], [0.65, 0.5], [0.35, 0.79]],
  4: [[0.29, 0.28], [0.71, 0.28], [0.29, 0.72], [0.71, 0.72]],
};
export async function spreadFrame(photos, table, outDir, { W = 1080, H = 1920 } = {}) {
  const spots = SPREAD[Math.min(4, Math.max(2, photos.length))], cell = { 2: [0.8, 0.4], 3: [0.62, 0.32], 4: [0.5, 0.4] }[spots.length];
  const plates = [];
  for (const [i, p] of photos.slice(0, spots.length).entries()) {
    const d = `${outDir}/spread-${i}`;
    if (!fs.existsSync(`${d}/plate.png`)) await buildLayers(p, d);
    plates.push(fs.readFileSync(`${d}/plate.png`));
  }
  const layers = [];
  for (const [i, png] of plates.entries()) {
    const m = await sharp(png).metadata(), scale = Math.min((W * cell[0]) / m.width, (H * cell[1]) / m.height, 1.2);
    const w = Math.round(m.width * scale), h = Math.round(m.height * scale), plate = await sharp(png).resize(w, h).png().toBuffer();
    const left = Math.round(W * spots[i][0] - w / 2), top = Math.round(H * spots[i][1] - h / 2);
    const shadowAlpha = await sharp(plate).extractChannel(3).linear(0.5, 0).blur(26).png().toBuffer();
    const shadow = await sharp({ create: { width: w, height: h, channels: 3, background: "#2a1a0e" } }).joinChannel(shadowAlpha).png().toBuffer();
    layers.push({ input: shadow, left: left + 10, top: top + 20 }, { input: plate, left, top });
  }
  const bg = await sharp(table).resize(W, H, { fit: "cover" }).toBuffer();
  return sharp(bg).composite(layers.map((l) => ({ ...l, left: Math.max(-200, l.left), top: Math.max(-200, l.top) }))).jpeg({ quality: 95 }).toBuffer();
}
