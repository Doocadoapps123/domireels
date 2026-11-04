// Lab: Muse Image cleans the scene, then the original dish pixels (SAM mask) are pasted back.
// Usage: node --env-file=../.env lab/edit.mjs lab/photos/bohio18-mangu.jpg [...]
// Needs lab/out/sam/<name>-cutout.png from lab/sam.mjs.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PROMPT = [
  "Professional food photo retouch of this exact photo.",
  "Keep the camera angle, framing, plate position and every food item exactly where they are.",
  "Replace the table and surroundings with a clean, warm restaurant tabletop. Remove clutter, people, legs, phones and packaging.",
  "Warm natural window light, soft shadows, appetizing color. Do not add, remove or change any food.",
].join(" ");

const outDir = "lab/out/edit";
fs.mkdirSync(outDir, { recursive: true });

for (const file of process.argv.slice(2)) {
  const name = path.basename(file, path.extname(file));
  const orig = await sharp(file).rotate().jpeg({ quality: 90 }).toBuffer();
  const { width, height } = await sharp(orig).metadata();
  const t0 = Date.now();
  const res = await fetch("https://api.meta.ai/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.META_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "muse-image-1.0",
      prompt: PROMPT,
      images: [{ image_url: `data:image/jpeg;base64,${orig.toString("base64")}` }],
      size: `${width}x${height}`,
      output_format: "jpeg",
      reasoning_strength: process.env.STRENGTH || "low",
      n: 1,
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) { console.log(`${name}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`); continue; }
  const edited = Buffer.from((await res.json()).data[0].b64_json, "base64");
  const em = await sharp(edited).metadata();
  const editedFit = await sharp(edited).resize(width, height, { fit: "fill" }).jpeg().toBuffer();
  // Dish lock: feathered SAM alpha, original pixels on top of the edit.
  const cutout = `lab/out/sam/${name}-cutout.png`;
  const alpha = await sharp(cutout).extractChannel(3).blur(2).toBuffer();
  const dish = await sharp(orig).ensureAlpha().joinChannel(alpha).png().toBuffer();
  const locked = await sharp(editedFit).composite([{ input: dish }]).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(`${outDir}/${name}-edited.jpg`, editedFit);
  fs.writeFileSync(`${outDir}/${name}-locked.jpg`, locked);
  console.log(`${name}: ${ms}ms edit=${em.width}x${em.height} orig=${width}x${height}`);
}
