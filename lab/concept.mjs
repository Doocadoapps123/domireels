// Lab: what one SAM concept covers on a photo. Usage: node --env-file=../.env lab/concept.mjs "concept" photos...
import path from "node:path";
import sharp from "sharp";
import { segmentObjects } from "../src/layers.mjs";
const [concept, ...files] = process.argv.slice(2);
for (const f of files) {
  const jpg = await sharp(f).rotate().jpeg().toBuffer();
  const { width, height } = await sharp(jpg).metadata();
  const ms = await segmentObjects(jpg, width, height, concept);
  const all = Buffer.alloc(width * height);
  ms.forEach((m) => { for (let i = 0; i < m.length; i++) all[i] |= m[i]; });
  const dim = Buffer.from(all.map((v) => (v ? 0 : 200)));
  const shade = await sharp({ create: { width, height, channels: 3, background: "#f0f" } })
    .joinChannel(await sharp(dim, { raw: { width, height, channels: 1 } }).png().toBuffer()).png().toBuffer();
  const out = `lab/out/peek/c-${concept.replace(/\W+/g, "_")}-${path.basename(f, ".jpg")}.jpg`;
  const shaded = await sharp(jpg).composite([{ input: shade }]).jpeg().toBuffer();
  await sharp(shaded).resize({ height: 400 }).toFile(out);
  console.log(out, ms.length);
}
