// Lab: segment the dish in each photo with SAM 3.1 and write a cutout + overlay.
// Usage: node --env-file=../.env lab/sam.mjs "food" lab/photos/*.jpg
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";
import { parseImageStream, recordsOfKind, decodeMaskToRaster } from "@meta-sam/parser";

const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.META_API_KEY });
const [concept, ...files] = process.argv.slice(2);
const outDir = "lab/out/sam";
fs.mkdirSync(outDir, { recursive: true });

// Full-frame 0/1 alpha for every returned object, union of all masks.
async function segment(file) {
  // Normalize EXIF rotation so mask coordinates match the pixels we composite on.
  const img = sharp(file).rotate();
  const jpg = await img.jpeg({ quality: 90 }).toBuffer();
  const { width, height } = await sharp(jpg).metadata();
  const t0 = Date.now();
  const events = await client.responses.create({
    model: "sam-3.1",
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text: concept },
      { type: "input_image", image_url: `data:image/jpeg;base64,${jpg.toString("base64")}` },
    ] }],
    metadata: { include_confidence: "true" },
    stream: true,
  });
  const result = await parseImageStream(events).finalResult;
  const ms = Date.now() - t0;
  const boxes = recordsOfKind(result.records, "box");
  const masks = recordsOfKind(result.records, "mask");
  const alpha = Buffer.alloc(width * height);
  for (const m of masks) {
    const box = boxes.find((b) => b.objectId === m.objectId);
    const raster = decodeMaskToRaster(m.mask);
    const mw = m.mask.width, mh = m.mask.height;
    // Mask raster covers the box; stretch it onto the box in frame pixels.
    const bw = box.right - box.left, bh = box.bottom - box.top;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const v = raster[Math.min(mh - 1, Math.floor((y * mh) / bh)) * mw + Math.min(mw - 1, Math.floor((x * mw) / bw))];
      if (v) alpha[(box.top + y) * width + box.left + x] = 255;
    }
  }
  return { jpg, width, height, alpha, ms, boxes, masks, outcome: result.outcome?.status };
}

for (const file of files) {
  const name = path.basename(file, path.extname(file));
  try {
    const r = await segment(file);
    const covered = r.alpha.reduce((s, v) => s + (v ? 1 : 0), 0) / (r.width * r.height);
    const a = sharp(r.alpha, { raw: { width: r.width, height: r.height, channels: 1 } });
    await sharp(r.jpg).ensureAlpha().joinChannel(await a.png().toBuffer()).png().toFile(`${outDir}/${name}-cutout.png`);
    // Overlay: dim everything that is NOT the dish.
    const dim = Buffer.from(r.alpha.map((v) => (v ? 0 : 170)));
    const shade = await sharp({ create: { width: r.width, height: r.height, channels: 3, background: "#000" } })
      .joinChannel(await sharp(dim, { raw: { width: r.width, height: r.height, channels: 1 } }).png().toBuffer()).png().toBuffer();
    const shaded = await sharp(r.jpg).composite([{ input: shade }]).jpeg().toBuffer();
    await sharp(shaded).resize({ width: 600 }).jpeg().toFile(`${outDir}/${name}-overlay.jpg`);
    console.log(`${name}: ${r.outcome} ${r.ms}ms objects=${r.masks.length} conf=${r.boxes.map((b) => b.confidence?.toFixed?.(2)).join("/")} dish=${(covered * 100).toFixed(0)}%`);
  } catch (e) {
    console.log(`${name}: ERROR ${e.status ?? ""} ${e.message}`);
  }
}
